const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestOf } from './canonical.mjs';
import {
  SELF_RAG_STUDY_EXECUTION_IDENTITY,
  SELF_RAG_STUDY_SCENE_LAYERS,
  assertFrozenRequestHasNoTopicFilter,
  buildFrozenRagRequest,
  classifySceneLayers,
  extractExcludedIdentities,
  isExcludedGame,
  prepareStudy,
  sceneFactsFromObservation,
  sceneFactsFromSnapshot,
  selectStudyGames,
  slotPlan,
  slotSelectionKey,
  studyCaseId,
  validatePrejudgeVerdicts,
  verifyStudy,
} from './prepare.mjs';
import { SELF_RAG_STUDY_SUBSET_IDS } from './knowledge.mjs';
import {
  FIXTURE_SEED, FIXTURE_SHA, fixtureExclusions, fixtureObservation, fixtureStudyDeps,
} from './fixtures/study.mjs';

const facts = {
  windowKind: 'self_turn', selfActor: 0, meldCount: 0,
  riichiStates: [{ actor: 0, status: 'none' }, { actor: 1, status: 'none' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }],
  remainingDraws: 60,
};
const withFacts = (overrides) => ({ ...facts, ...overrides });

test('declared scene layers read only visible facts and keep their boundaries', () => {
  assert.deepEqual(classifySceneLayers(facts), ['SL1']);
  assert.deepEqual(classifySceneLayers(withFacts({ remainingDraws: 40 })), ['SL1']);
  assert.deepEqual(classifySceneLayers(withFacts({ remainingDraws: 39 })), []);
  assert.deepEqual(classifySceneLayers(withFacts({ remainingDraws: 24 })), ['SL4']);
  assert.deepEqual(classifySceneLayers(withFacts({ remainingDraws: 25 })), []);

  // SL2 requires an own meld and no opponent riichi; a post-call discard is also SL5.
  const openHand = withFacts({ windowKind: 'post_call_discard', meldCount: 1, remainingDraws: 60 });
  assert.deepEqual(classifySceneLayers(openHand), ['SL2', 'SL5']);
  assert.deepEqual(classifySceneLayers({ ...openHand, riichiStates: [{ actor: 0, status: 'none' }, { actor: 1, status: 'declared' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }] }), ['SL5']);

  // SL3: at least one opponent riichi while self is not riichi.
  const defence = withFacts({ riichiStates: [{ actor: 0, status: 'none' }, { actor: 1, status: 'accepted' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }] });
  assert.deepEqual(classifySceneLayers(defence), ['SL3']);
  assert.deepEqual(classifySceneLayers({ ...defence, riichiStates: [{ actor: 0, status: 'accepted' }, { actor: 1, status: 'accepted' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }] }), []);
  assert.deepEqual(classifySceneLayers({ ...defence, windowKind: 'discard_response' }), []);

  // SL5 alone: self riichi after declaration.
  assert.deepEqual(classifySceneLayers(withFacts({ windowKind: 'post_riichi_discard', remainingDraws: 60, riichiStates: [{ actor: 0, status: 'accepted' }, { actor: 1, status: 'none' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }] })), ['SL5']);

  assert.equal(Object.keys(SELF_RAG_STUDY_SCENE_LAYERS).length, 5);
  assert.throws(() => classifySceneLayers({ ...facts, riichiStates: 'no' }), /study_input_invalid/u);
});

test('snapshot and observation projections agree on the same visible facts', () => {
  const snapshotFacts = sceneFactsFromSnapshot({
    selfActor: 0,
    publicState: {
      riichiStates: [{ actor: 0, status: 'none' }, { actor: 1, status: 'accepted' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }],
      remainingDraws: 20,
    },
    privateState: { decisionWindow: { kind: 'self_turn' }, selfMeldRefs: ['a', 'b'] },
  });
  assert.deepEqual(snapshotFacts, {
    windowKind: 'self_turn', selfActor: 0, meldCount: 2,
    riichiStates: [{ actor: 0, status: 'none' }, { actor: 1, status: 'accepted' }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' }],
    remainingDraws: 20,
  });
  const observationFacts = sceneFactsFromObservation(fixtureObservation('study-case-01', 'SL3'));
  assert.deepEqual(classifySceneLayers(observationFacts), ['SL3']);
  assert.throws(() => sceneFactsFromSnapshot({}), /study_input_invalid/u);
});

test('the slot plan declares 2 pilot and 8 evaluation slots over all five layers', () => {
  const plan = slotPlan();
  assert.deepEqual(plan.map((slot) => slot.phase), ['pilot', 'pilot', ...new Array(8).fill('evaluation')]);
  assert.deepEqual(plan.map((slot) => slot.layer), ['SL1', 'SL3', 'SL2', 'SL4', 'SL5', 'SL1', 'SL2', 'SL3', 'SL4', 'SL5']);
  assert.deepEqual(plan.map((slot) => slot.slotIndex), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(studyCaseId(0), 'study-case-01');
  assert.equal(studyCaseId(9), 'study-case-10');
  assert.equal(new Set(plan.map((slot) => studyCaseId(slot.slotIndex))).size, 10);
});

test('the selection key is sha256(seed + "\\0" + gameHash + "\\0" + slotIndex) and slot-dependent', () => {
  const hash = '1'.repeat(64);
  assert.equal(slotSelectionKey('seed', hash, 0), slotSelectionKey('seed', hash, 0));
  assert.notEqual(slotSelectionKey('seed', hash, 0), slotSelectionKey('seed', hash, 1));
  assert.notEqual(slotSelectionKey('seed', hash, 0), slotSelectionKey('other', hash, 0));
  assert.equal(slotSelectionKey('seed', hash, 0).length, 64);
  assert.throws(() => slotSelectionKey('', hash, 0), /study_input_invalid/u);
});

test('the frozen query carries no topic filter, so the research topic mapping cannot move the candidate set', () => {
  for (const slot of slotPlan()) {
    const request = buildFrozenRagRequest(slot.layer);
    assert.deepEqual(Object.keys(request).sort(), ['limit', 'query']);
    assert.equal(request.limit, 5);
    assert.equal(request.filter, undefined);
    assert.equal(request.context, undefined);
    assertFrozenRequestHasNoTopicFilter(request);
  }
  // Any request that could reorder or filter by topic is refused outright.
  assert.throws(() => assertFrozenRequestHasNoTopicFilter({ query: 'q', limit: 5, filter: { topics: ['tile-efficiency'] } }),
    /study_request_topic_filter_forbidden/u);
  assert.throws(() => assertFrozenRequestHasNoTopicFilter({ query: 'q', limit: 5, context: { topic: 'tile-efficiency' } }),
    /study_request_topic_filter_forbidden/u);
  assert.throws(() => buildFrozenRagRequest('SL9'), /study_query_invalid/u);
});

test('prior-study exclusions keep every verifiable identity and refuse an unverifiable entry', () => {
  const extracted = extractExcludedIdentities([{
    name: 'fixture',
    cases: [{ gameId: 'rc1_a', sourceHash: 'a'.repeat(64) }, { gameId: 'rc1_b' }],
    excludedGames: ['rc1_c'],
    excludedHashes: ['b'.repeat(64)],
    jsonl: [{ gameId: 'rc1_d' }, { hash: 'c'.repeat(64) }],
  }]);
  assert.deepEqual(extracted.gameIds, ['rc1_a', 'rc1_b', 'rc1_c', 'rc1_d']);
  assert.deepEqual(extracted.sourceHashes, ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]);
  assert.equal(extracted.sources[0].caseCount, 2);
  assert.throws(() => extractExcludedIdentities([{ name: 'bad', cases: [{ note: 'no identity' }] }]),
    /study_exclusions_unverifiable/u);
  assert.throws(() => extractExcludedIdentities([{ name: 'bad', cases: [], jsonl: [{}] }]),
    /study_exclusions_unverifiable/u);
  const exclusions = { gameIds: ['rc1_a'], sourceHashes: ['b'.repeat(64)] };
  assert.equal(isExcludedGame(exclusions, { gameId: 'rc1_a', sourceHash: 'x'.repeat(64) }), true);
  assert.equal(isExcludedGame(exclusions, { gameId: 'rc1_z', sourceHash: 'b'.repeat(64) }), true);
  assert.equal(isExcludedGame(exclusions, { gameId: 'rc1_z', sourceHash: 'x'.repeat(64) }), false);
});

test('slot selection is deterministic, excludes prior games, and refuses an uncovered slot', async () => {
  const games = [
    { gameId: 'g1', sourceHash: '1'.repeat(64) },
    { gameId: 'g2', sourceHash: '2'.repeat(64) },
    { gameId: 'g3', sourceHash: '3'.repeat(64) },
    { gameId: 'excluded', sourceHash: '4'.repeat(64) },
  ];
  const layersByGame = {
    g1: { SL1: 5 }, g2: { SL1: 7 }, g3: { SL1: 9 }, excluded: { SL1: 1 },
  };
  const exclusions = { gameIds: ['excluded'], sourceHashes: [] };
  const plan = [{ slotIndex: 0, phase: 'pilot', layer: 'SL1' }, { slotIndex: 1, phase: 'pilot', layer: 'SL1' }];
  const selected = await selectStudyGames({
    games, exclusions, seed: 'seed', plan,
    analyzeGame: async (game) => ({ status: 'ok', layers: layersByGame[game.gameId] ?? {} }),
  });
  const ranked = ['g1', 'g2', 'g3'].map((gameId) => ({
    gameId, key: slotSelectionKey('seed', games.find((game) => game.gameId === gameId).sourceHash, 0),
  })).sort((left, right) => (left.key < right.key ? -1 : 1));
  assert.equal(selected.selected[0].gameId, ranked[0].gameId);
  assert.equal(selected.selected[0].canonicalDecisionOrder, layersByGame[ranked[0].gameId].SL1);
  // Each game is used at most once.
  assert.equal(new Set(selected.selected.map((entry) => entry.gameId)).size, 2);
  assert.notEqual(selected.selected[0].gameId, selected.selected[1].gameId);
  assert.equal(selected.sampling.digest.length, 64);

  await assert.rejects(() => selectStudyGames({
    games, exclusions, seed: 'seed', plan: [{ slotIndex: 0, phase: 'pilot', layer: 'SL2' }],
    analyzeGame: async (game) => ({ status: 'ok', layers: layersByGame[game.gameId] ?? {} }),
  }), /insufficient_scene_coverage/u);
  await assert.rejects(() => selectStudyGames({ games, exclusions, seed: 'seed', plan: [], analyzeGame: async () => ({}) }),
    /study_input_invalid|insufficient_scene_coverage/u);
});

test('prejudge verdicts must cover exactly the candidate passages and carry a usable reason', () => {
  const candidateRefs = ['ref-a', 'ref-b'];
  const counts = validatePrejudgeVerdicts({
    candidateRefs,
    verdicts: [
      { sourceRef: 'ref-a', verdict: 'irrelevant', reason: '条件不成立' },
      { sourceRef: 'ref-b', verdict: 'useful', reason: '材料有用' },
    ],
  });
  assert.deepEqual(counts, { useful: 1, irrelevant: 1, uncertain: 0 });
  assert.throws(() => validatePrejudgeVerdicts({ candidateRefs, verdicts: [{ sourceRef: 'ref-a', verdict: 'useful', reason: '材料有用' }] }), /prejudge_invalid/u);
  assert.throws(() => validatePrejudgeVerdicts({ candidateRefs, verdicts: [
    { sourceRef: 'ref-a', verdict: 'useful', reason: '材料有用' },
    { sourceRef: 'ref-a', verdict: 'useful', reason: '材料有用' },
  ] }), /prejudge_invalid/u);
  assert.throws(() => validatePrejudgeVerdicts({ candidateRefs, verdicts: [
    { sourceRef: 'ref-a', verdict: 'useful', reason: '材料有用' },
    { sourceRef: 'ref-z', verdict: 'useful', reason: '材料有用' },
  ] }), /prejudge_invalid/u);
  assert.throws(() => validatePrejudgeVerdicts({ candidateRefs, verdicts: [
    { sourceRef: 'ref-a', verdict: 'maybe', reason: '材料有用' },
    { sourceRef: 'ref-b', verdict: 'useful', reason: '材料有用' },
  ] }), /prejudge_invalid/u);
  assert.throws(() => validatePrejudgeVerdicts({ candidateRefs, verdicts: [
    { sourceRef: 'ref-a', verdict: 'useful', reason: '短' },
    { sourceRef: 'ref-b', verdict: 'useful', reason: '材料有用' },
  ] }), /prejudge_invalid/u);
});

async function withTempDir(operation) {
  const directory = await mkdtemp(join(tmpdir(), 'selfrag-study-prepare-'));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function prepared(overrides = {}) {
  const fixture = fixtureStudyDeps(overrides);
  const directory = await mkdtemp(join(tmpdir(), 'selfrag-study-prepare-'));
  const freeze = await prepareStudy({
    artifactDir: directory, seed: FIXTURE_SEED, createdAt: '2026-10-27T00:00:00.000Z', deps: fixture.deps,
  });
  return { directory, freeze, fixture };
}

async function cleanup(directory) {
  await rm(directory, { recursive: true, force: true });
}

async function patchJson(path, patch) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, `${JSON.stringify({ ...value, ...patch }, null, 2)}\n`, 'utf8');
}

test('prepare writes the frozen artifacts once, with freeze.json last', async () => {
  const { directory, freeze, fixture } = await prepared();
  try {
    assert.equal(freeze.codeSha, FIXTURE_SHA);
    assert.equal(freeze.caseIds.length, 10);
    assert.equal(freeze.sampling.selected.length, 10);
    assert.deepEqual(freeze.sampling.selected.map((entry) => entry.caseId), freeze.caseIds);
    assert.deepEqual(freeze.sampling.selected.map((entry) => entry.phase).slice(0, 2), ['pilot', 'pilot']);
    assert.equal(new Set(freeze.sampling.selected.map((entry) => entry.gameId)).size, 10);
    assert.equal(freeze.sampling.selected.some((entry) => entry.gameId === 'rc1_fixture_excluded'), false);
    assert.deepEqual(freeze.prejudge.verdictCounts, { useful: 0, irrelevant: 10, uncertain: 10 });
    assert.equal(freeze.prejudge.caseCount, 10);
    assert.equal(freeze.executionIdentity.model, 'gpt-6-luna');
    assert.deepEqual(freeze.executionIdentity, SELF_RAG_STUDY_EXECUTION_IDENTITY);
    assert.equal(freeze.selectorBudget, null);
    assert.equal(freeze.gate.available, true);
    assert.equal(freeze.research.subsetDigest, fixture.research.subsetDigest);
    assert.equal(freeze.exclusions.digest, fixture.exclusions.digest);
    assert.match(freeze.requests.digest, /^[0-9a-f]{64}$/u);
    assert.equal(fixture.retrieverCalls.length, 10);
    assert.equal(fixture.prejudgeCalls.length, 10);
    assert.equal(fixture.retrieverCalls.every((call) => call.request.filter === undefined && call.request.context === undefined), true);
    assert.equal(fixture.writeOrder.at(-1).endsWith('freeze.json'), true);

    const subset = JSON.parse(await readFile(join(directory, 'research-subset.json'), 'utf8'));
    assert.equal(subset.subset.length, 20);
    assert.deepEqual(subset.subset.map((entry) => entry.id), [...SELF_RAG_STUDY_SUBSET_IDS]);
    const requests = JSON.parse(await readFile(join(directory, 'requests.json'), 'utf8'));
    assert.equal(requests.cases.length, 10);
    const candidates = JSON.parse(await readFile(join(directory, 'candidates.json'), 'utf8'));
    assert.equal(candidates.cases.length, 10);
    assert.equal(candidates.cases.every((entry) => entry.result.passages.length === 2), true);
    const schedule = JSON.parse(await readFile(join(directory, 'schedule.json'), 'utf8'));
    assert.equal(schedule.rows.length, 20);
    assert.deepEqual(schedule.rows.slice(0, 2).map((row) => row.arm), ['baseline', 'selfrag']);
    assert.deepEqual(schedule.rows.slice(0, 2).map((row) => row.caseId), [freeze.caseIds[0], freeze.caseIds[0]]);
    assert.deepEqual(schedule.rows.slice(2, 4).map((row) => row.caseId), [freeze.caseIds[1], freeze.caseIds[1]]);
    const observation = JSON.parse(await readFile(join(directory, 'observations', `${freeze.caseIds[0]}.json`), 'utf8'));
    assert.equal(observation.caseId, freeze.caseIds[0]);
    const prejudge = JSON.parse(await readFile(join(directory, 'prejudge', `${freeze.caseIds[0]}.json`), 'utf8'));
    assert.equal(prejudge.attestation, 'ai_judgement_not_expert_gold');
  } finally {
    await cleanup(directory);
  }
});

test('prepare refuses a second run, an unclean worktree, and a batch without any prejudged irrelevant passage', async () => {
  await withTempDir(async (directory) => {
    const fixture = fixtureStudyDeps();
    const input = { artifactDir: directory, seed: FIXTURE_SEED, deps: fixture.deps };
    await prepareStudy(input);
    await assert.rejects(() => prepareStudy(input), (error) => error?.code === 'EEXIST');
  });
  await withTempDir(async (directory) => {
    await assert.rejects(() => prepareStudy({
      artifactDir: directory, seed: FIXTURE_SEED, deps: fixtureStudyDeps({ clean: false }).deps,
    }), /study_requires_clean_git_worktree/u);
  });
  await withTempDir(async (directory) => {
    await assert.rejects(() => prepareStudy({
      artifactDir: directory, seed: FIXTURE_SEED, deps: fixtureStudyDeps({ verdict: () => 'useful' }).deps,
    }), /prejudge_no_irrelevant_instances/u);
  });
});

test('prepare stops before the arms when a scene layer has no eligible game', async () => {
  await withTempDir(async (directory) => {
    await assert.rejects(() => prepareStudy({
      artifactDir: directory, seed: FIXTURE_SEED, deps: fixtureStudyDeps({ layerless: 'SL4' }).deps,
    }), (error) => error.message === 'insufficient_scene_coverage' && error.detail.includes('SL4'));
  });
});

test('verify reproduces every digest and refuses drift, a dirty tree, or gate/provider changes', async () => {
  const { directory, freeze, fixture } = await prepared();
  try {
    const verified = await verifyStudy({ artifactDir: directory, deps: fixture.deps, phase: 'pilot' });
    assert.equal(verified.status, 'verified');
    assert.deepEqual(verified.verdictCounts, { useful: 0, irrelevant: 10, uncertain: 10 });
    assert.equal(verified.codeSha, FIXTURE_SHA);

    const baseDeps = fixture.deps;
    const cases = {
      worktree: () => verifyStudy({ artifactDir: directory, phase: 'pilot', deps: { ...baseDeps, gitHead: async () => ({ sha: FIXTURE_SHA, clean: false }) } }),
      codeSha: () => verifyStudy({ artifactDir: directory, phase: 'pilot', deps: { ...baseDeps, gitHead: async () => ({ sha: 'b'.repeat(40), clean: true }) } }),
      provider: () => verifyStudy({ artifactDir: directory, phase: 'pilot', deps: { ...baseDeps, providerIdentity: async () => ({ ...SELF_RAG_STUDY_EXECUTION_IDENTITY, executableSha256: '0'.repeat(64) }) } }),
      gate: () => verifyStudy({ artifactDir: directory, phase: 'pilot', deps: { ...baseDeps, gateIdentity: async () => ({ ...SELF_RAG_STUDY_EXECUTION_IDENTITY, available: false }) } }),
      budgetMissing: () => verifyStudy({ artifactDir: directory, phase: 'evaluation', deps: baseDeps }),
      budgetUnexpected: () => verifyStudy({ artifactDir: directory, phase: 'pilot', deps: { ...baseDeps, readJson: budgetReadJson(directory, { maxOutputTokens: 512, maxOutputBytes: 4096 }) } }),
      budgetInvalid: () => verifyStudy({ artifactDir: directory, phase: 'evaluation', deps: { ...baseDeps, readJson: budgetReadJson(directory, { maxOutputTokens: 999, maxOutputBytes: 4096 }) } }),
    };
    const expected = {
      worktree: /verify_worktree_dirty/u,
      codeSha: /verify_code_sha_mismatch/u,
      provider: /verify_provider_mismatch/u,
      gate: /applicability_gate_unavailable/u,
      budgetMissing: /verify_selector_budget_missing/u,
      budgetUnexpected: /verify_selector_budget_unexpected/u,
      budgetInvalid: /verify_selector_budget_invalid/u,
    };
    for (const [name, run] of Object.entries(cases)) {
      await assert.rejects(run, expected[name], name);
    }

    // A tampered frozen artifact is caught by its digest.
    await patchJson(join(directory, 'schedule.json'), { rows: [] });
    await assert.rejects(() => verifyStudy({ artifactDir: directory, deps: baseDeps, phase: 'pilot' }), /study_schedule_mismatch/u);
    const schedule = JSON.parse(await readFile(join(directory, 'schedule.json'), 'utf8'));
    assert.equal(schedule.rows.length, 0);

    assert.equal(freeze.sampling.selected.length, 10);
  } finally {
    await cleanup(directory);
  }
});

function budgetReadJson(directory, budget) {
  return async (path) => {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return path.endsWith('freeze.json') ? { ...value, selectorBudget: budget } : value;
  };
}

test('evaluation verify refuses once a non-pilot attempt exists', async () => {
  const { directory, freeze, fixture } = await prepared();
  try {
    const { appendFile } = await import('node:fs/promises');
    const evaluationCase = freeze.sampling.selected.find((entry) => entry.phase === 'evaluation').caseId;
    await appendFile(join(directory, 'attempts.jsonl'), `${JSON.stringify({
      schemaVersion: 'selfrag-study-attempt/v1', caseId: evaluationCase, arm: 'baseline',
      attempt: 1, pilotRerun: false, key: 'x', phase: 'evaluation', status: 'claimed', claimedAt: '2026-10-27T00:00:00.000Z',
    })}\n`, 'utf8');
    const deps = { ...fixture.deps, readJson: budgetReadJson(directory, { maxOutputTokens: 512, maxOutputBytes: 4096 }) };
    await assert.rejects(() => verifyStudy({ artifactDir: directory, deps, phase: 'evaluation' }), /verify_evaluation_already_started/u);
  } finally {
    await cleanup(directory);
  }
});
