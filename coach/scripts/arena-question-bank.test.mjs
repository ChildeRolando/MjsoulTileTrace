const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerationOptions, generationConfig, generateBank, loadGeneratedBank, listGeneratedBanks, bankDirectory, admission, prepareBankRuleInputs } from '../bin/arena-question-bank.mjs';
import { parseArgs, createPinnedRuntime, finishDataset } from '../bin/blind-discard-arena.mjs';
import { createArenaBlindObservation, ArenaRunAliasVault, screenArenaDecisions } from '@riichi-coach/desktop/blind-discard-arena';
import { projectArenaLocalMortalRuleScoring } from '@riichi-coach/desktop/blind-discard-arena-scorer';
import { bindLocalMortalRuleScores } from '@riichi-coach/reasoning';
import { pendingDecision } from '@riichi-coach/question-lab';

test('generation options are bounded and cannot inject arbitrary paths or providers', () => {
  for (const raw of [{ count: 129 }, { seed: -1 }, { preset: 'other' }, { timeLimitSeconds: 1801 }, { config: '../secret' }])
    assert.equal(GenerationOptions.safeParse(raw).success, false);
  assert.throws(() => bankDirectory('root', '../secret'));
  const config = generationConfig({ preset: 'conflict', count: 5, seed: 42 });
  assert.equal(config.budget.refinementRounds, 0);
  assert.equal(config.budget.concurrency, 2);
  assert.equal(config.scene.players.length, 4);
  const id = randomUUID();
  const replay = parseArgs(['run', '--dataset', 'blind-discard-generated-v1', '--rag', 'off', '--replay-run', id, '--replay-case', '0']);
  assert.equal(replay.bankId, undefined); // Bound from the verified source manifest, never the current UI selection.
  assert.equal(replay.replayRunId, id); assert.equal(replay.maxCases, 1);
  assert.equal(parseArgs(['run', '--dataset', 'blind-discard-generated-v1', '--bank', id, '--rag', 'off']).bankId, id);
  assert.throws(() => parseArgs(['run', '--dataset', 'blind-discard-generated-v1', '--rag', 'off']));
  assert.throws(() => parseArgs(['run', '--dataset', 'blind-discard-flat-v1', '--bank', id, '--rag', 'off']));
});

// Real local native/Mortal resources are deliberately opt-in, as in Question Lab's suite.
if (process.env.COACH_QUESTION_LAB_NATIVE === '1') test('generated banks bind legal pending windows, remain blind, and replay idempotently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'arena-question-bank-'));
  try {
    for (const preset of ['flat', 'spatial', 'conflict']) {
      const id = randomUUID(), options = { preset, count: 2, seed: 20261022, timeLimitSeconds: 120 };
      const catalog = await generateBank(root, id, options, 'a'.repeat(40));
      assert.equal(catalog.cases.length, 2, `${preset}: ${JSON.stringify(catalog.generated)}`);
      const { samples } = await loadGeneratedBank(root, id);
      for (const sample of samples) {
        assert.equal(admission(sample, preset), null);
        const observationText = JSON.stringify(catalog.cases[samples.indexOf(sample)].observation);
        for (const forbidden of [sample.sampleId, sample.groupId, 'witness', 'hypotheses', 'qValue', 'features', '"wall":'])
          assert.equal(observationText.includes(forbidden), false, forbidden);
      }
      const before = await readFile(join(bankDirectory(root, id), 'catalog.json'), 'utf8');
      await generateBank(root, id, options, 'a'.repeat(40));
      assert.equal(await readFile(join(bankDirectory(root, id), 'catalog.json'), 'utf8'), before);
      assert.equal((await listGeneratedBanks(root)).find(b => b.bankId === id).ready, true);
      await assert.rejects(() => generateBank(root, id, { ...options, seed: 11 }, 'a'.repeat(40)), /resume_identity_mismatch/);
      if (preset === 'flat') {
        const repeated = await generateBank(root, randomUUID(), options, 'a'.repeat(40));
        assert.deepEqual((await loadGeneratedBank(root, repeated.generated.bankId)).samples.map(s => s.sampleId), samples.map(s => s.sampleId));
        // Simulate interruption after samples were committed but before the catalog publication.
        await unlink(join(bankDirectory(root, id), 'catalog.json'));
        await unlink(join(bankDirectory(root, id), 'bank.json'));
        const resumed = await generateBank(root, id, options, 'a'.repeat(40));
        assert.equal(resumed.generated.attempts, catalog.generated.attempts);
        assert.deepEqual((await loadGeneratedBank(root, id)).samples.map(s => s.sampleId), samples.map(s => s.sampleId));
        // The existing runner consumes this exact blind observation; scores stay in the grader.
        const { runtime: mortal } = await createPinnedRuntime(true);
        const worker = { mortal, close: () => mortal.close() };
        try {
          const inputs = await prepareBankRuleInputs(samples, worker.mortal);
          const selected = screenArenaDecisions(inputs).selected[0];
          const observation = createArenaBlindObservation({ selected, aliases: new ArenaRunAliasVault(), tools: { description: 'test', supportedCapabilities: ['analyze_candidates'] } });
          assert.equal(observation.candidates.length, selected.candidates.length);
          const decision = pendingDecision(samples[0].stream);
          const request = projectArenaLocalMortalRuleScoring({ decision, identity: worker.mortal.identity, ruleRequest: inputs[0].ruleRequest, ruleResult: inputs[0].ruleResponse });
          const scores = bindLocalMortalRuleScores({ request, response: await worker.mortal.scoreRules(request), decision });
          assert.equal(scores.actions.length, observation.candidates.length);
          // A generated mistake replays the frozen source decision through the shared dataset path.
          const source = { sourceRecordHash: 'sha256:'+'a'.repeat(64) };
          const replayManifest = { dataset: { source, selected: [{ canonicalDecisionOrder: selected.canonicalDecisionOrder,
            candidateSetDigest: createHash('sha256').update(JSON.stringify(selected.candidates.map(c=>c.actionRef).sort())).digest('hex') }] } };
          const replayOptions = { datasetId: 'blind-discard-generated-v1', maxCases: 1, caseOffset: 0, replayManifest, replayCaseOrdinal: 0 };
          const replayInput = { decisions: samples.map(s=>pendingDecision(s.stream)), ruleInputs: inputs, ...source, sourceMetadata: source };
          const replayed = await finishDataset(worker.mortal, replayOptions, replayInput);
          assert.equal(replayed.selected[0].selected.canonicalDecisionOrder, selected.canonicalDecisionOrder);
          assert.equal(replayed.labels.get(selected.canonicalDecisionOrder).status, 'available');
          await assert.rejects(()=>finishDataset(worker.mortal, replayOptions, { ...replayInput, sourceRecordHash: 'other' }), /arena_replay_source_changed/);

          const changed = structuredClone(samples[0]); changed.ruleResult.requestId = '0'.repeat(64);
          assert.throws(() => admission(changed, 'flat'));
        } finally { await worker.close(); }
      }
      const samplePath = join(bankDirectory(root, id), 'lab/samples', `${samples[0].sampleId}.json`);
      const tampered = structuredClone(samples[0]); tampered.features.turn++;
      await writeFile(samplePath, JSON.stringify(tampered));
      await assert.rejects(() => loadGeneratedBank(root, id), /sample_identity_mismatch/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
