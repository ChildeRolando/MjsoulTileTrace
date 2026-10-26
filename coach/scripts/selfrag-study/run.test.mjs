const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  armsShareEnvelope,
  assertDeliveredPassages,
  buildGeneratorRequest,
  deliveredPassages,
  executeStudyRun,
  requestEnvelope,
  runStudyAttempt,
  selectSelectorBudget,
} from './run.mjs';
import { fixtureObservation, opaqueRef } from './fixtures/study.mjs';

const CASE_ID = 'study-case-01';

function runObservation(caseId = CASE_ID) {
  const observation = fixtureObservation(caseId, 'SL1');
  observation.candidates = [
    { actionRef: opaqueRef('arena-ref:v1:', `${caseId}:action:1`), tile: { id: '1m', red: false }, discardMode: 'tedashi' },
    { actionRef: opaqueRef('arena-ref:v1:', `${caseId}:action:2`), tile: { id: '2m', red: false }, discardMode: 'tsumogiri' },
  ];
  return observation;
}

function candidateResult(observation, count = 2) {
  const passages = Array.from({ length: count }, (_, index) => ({
    sourceRef: opaqueRef('arena-ref:v1:', `${observation.caseRef}:passage:${index}`),
    sourceTitle: `来源 ${index}`,
    documentLocation: `第 ${index} 节`,
    content: `片段内容 ${index}`,
    applicableWhen: ['general-discard-choice'],
    corpusVersion: 'selfrag-research-scene-kb-v2/v1',
    retrieverVersion: 'arena-local-terms/v1',
  }));
  const sourceRefs = passages.map((passage) => passage.sourceRef);
  return {
    schemaVersion: 'blind-discard-arena-rag-result/v1',
    caseRef: observation.caseRef,
    mode: 'local',
    status: 'hits',
    passages,
    sourceRefs,
    retrieval: { query: '门清 早巡 进张 牌效 搭子 比较', context: null, filter: null, limit: 5, resultRefs: sourceRefs },
    corpusVersion: 'selfrag-research-scene-kb-v2/v1',
    retrieverVersion: 'arena-local-terms/v1',
  };
}

function fakeProvider(handler) {
  const calls = [];
  return {
    calls,
    descriptor: () => ({ providerId: 'fake', model: 'gpt-6-luna', protocolVersion: 'arena-function-call/v1' }),
    async request(request, signal) {
      calls.push({ request, signal });
      return handler(request, signal, calls.length);
    },
  };
}

function submissionArguments(observation, overrides = {}) {
  return JSON.stringify({
    caseRef: observation.caseRef,
    actionRef: observation.candidates[1].actionRef,
    rationale: '选择此打牌可保留最大进张。',
    sourceRefs: [],
    uncertainty: '对手手牌未知。',
    ...overrides,
  });
}

function ready(argumentsText, usage = { inputTokens: 100, outputTokens: 20 }) {
  return { status: 'ready', call: { name: 'submit_decision', arguments: argumentsText }, outputBytes: argumentsText.length, usage };
}

const usage = { inputTokens: 100, outputTokens: 20 };
const baseRun = (overrides = {}) => {
  const observation = overrides.observation ?? runObservation();
  return {
    caseId: CASE_ID,
    arm: 'baseline',
    phase: 'pilot',
    attempt: 1,
    pilotRerun: false,
    observation,
    candidateResult: overrides.candidateResult ?? candidateResult(observation),
    generatorProvider: overrides.generatorProvider,
    gate: overrides.gate,
    clock: () => 1_000,
    timeoutMs: 5_000,
    ...overrides,
  };
};

test('both arms build the same request except for the delivered passages', () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const baseline = buildGeneratorRequest({ observation, candidateResult: candidates, passages: candidates.passages });
  const retained = [candidates.passages[1]];
  const selfrag = buildGeneratorRequest({ observation, candidateResult: candidates, passages: retained });

  assert.equal(armsShareEnvelope(baseline, selfrag), true);
  assert.equal(requestEnvelope(baseline).system.length > 0, true);
  assert.deepEqual(deliveredPassages(baseline).map((passage) => passage.sourceRef), candidates.sourceRefs);
  assert.deepEqual(deliveredPassages(selfrag).map((passage) => passage.sourceRef), [candidates.passages[1].sourceRef]);
  assert.equal(baseline.tools[0].function.parameters.properties.actionRef.enum.length, 2);

  const droppedRef = candidates.passages[0].sourceRef;
  assert.equal(JSON.stringify(selfrag).includes(droppedRef), false);
  assert.equal(armsShareEnvelope(baseline, buildGeneratorRequest({ observation, candidateResult: candidates, passages: [retained[0]] })), true);

  assert.throws(() => buildGeneratorRequest({ observation, candidateResult: candidates, passages: [{ ...candidates.passages[0], sourceRef: 'arena-ref:v1:forged' }] }),
    /study_delivery_binding_invalid/u);
  assert.throws(() => buildGeneratorRequest({ observation, candidateResult: candidates, passages: [...candidates.passages].reverse() }),
    /study_delivery_binding_invalid/u);
  assert.throws(() => buildGeneratorRequest({ observation, candidateResult: candidates, passages: [candidates.passages[0], candidates.passages[0]] }),
    /study_delivery_binding_invalid/u);
  assert.deepEqual(assertDeliveredPassages({ delivered: [], candidateResult: candidates }), []);
});

test('baseline and selfrag completions record delivery, gate and separated usage', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const baselineProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const baseline = await executeStudyRun(baseRun({ arm: 'baseline', generatorProvider: baselineProvider }));
  assert.equal(baseline.status, 'completed');
  assert.equal(baseline.failureCode, null);
  assert.equal(baseline.delivered.sourceRefs.length, 2);
  assert.deepEqual(baseline.delivered.droppedSourceRefs, []);
  assert.equal(baseline.gate, null);
  assert.deepEqual(baseline.usage.generator, { status: 'reported', tokens: { inputTokens: 100, outputTokens: 20 } });
  assert.equal(baseline.usage.selector, null);
  assert.equal(baselineProvider.calls.length, 1);

  const retained = [candidates.passages[1]];
  const gateReceipt = { gateVersion: 'applicability-v1', droppedRefs: [candidates.passages[0].sourceRef] };
  const gate = {
    descriptor: { gateId: 'g', gateVersion: 'applicability-v1', promptVersion: 'arena-rag-applicability-method/v1' },
    async apply({ output, observation: seen, signal }) {
      assert.equal(output.caseRef, observation.caseRef);
      assert.equal(seen.caseRef, observation.caseRef);
      assert.equal(signal.aborted, false);
      return {
        output: { ...candidates, status: 'filtered', passages: retained, sourceRefs: retained.map((passage) => passage.sourceRef) },
        receipt: gateReceipt,
        status: 'applied',
        failureCode: undefined,
        usage: { inputTokens: 50, outputTokens: 10 },
        elapsedMs: 12,
        outputBytes: 128,
      };
    },
  };
  const selfragProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const selfrag = await executeStudyRun(baseRun({ arm: 'selfrag', generatorProvider: selfragProvider, gate }));
  assert.equal(selfrag.status, 'completed');
  assert.deepEqual(selfrag.delivered.sourceRefs, [candidates.passages[1].sourceRef]);
  assert.deepEqual(selfrag.delivered.droppedSourceRefs, [candidates.passages[0].sourceRef]);
  assert.equal(selfrag.gate.status, 'applied');
  assert.equal(selfrag.gate.retention.droppedCount, 1);
  assert.equal(selfrag.gate.outputBytes, 128);
  assert.match(selfrag.gate.receiptDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(selfrag.usage.selector, { status: 'reported', tokens: { inputTokens: 50, outputTokens: 10 } });
  assert.deepEqual(selfrag.usage.combined, { status: 'reported', tokens: { inputTokens: 150, outputTokens: 30 } });
  assert.equal(deliveredPassages(selfrag.request).length, 1);
  assert.equal(armsShareEnvelope(baseline.request, selfrag.request), true);
});

test('a missing, failing, or binding-breaking gate fails the selfrag arm instead of falling back', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const missingProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const missing = await executeStudyRun(baseRun({ arm: 'selfrag', generatorProvider: missingProvider }));
  assert.equal(missing.status, 'failed');
  assert.equal(missing.failureCode, 'applicability_gate_unavailable');
  assert.equal(missingProvider.calls.length, 0);
  assert.equal(missing.usage.selector, null);

  const errorProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const failing = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: errorProvider,
    gate: { apply: async () => { throw new Error('timeout'); } },
  }));
  assert.equal(failing.failureCode, 'timeout');
  assert.equal(errorProvider.calls.length, 0);
  // The gate threw after a possible selector call: attempted but unreported.
  assert.deepEqual(failing.usage.selector, { status: 'unknown' });

  const bindingProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const binding = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: bindingProvider,
    gate: {
      apply: async () => ({
        output: { ...candidates, passages: [{ ...candidates.passages[0], sourceRef: 'arena-ref:v1:forged' }], sourceRefs: ['arena-ref:v1:forged'] },
        receipt: {}, status: 'applied', usage: undefined, elapsedMs: 1,
      }),
    },
  }));
  assert.equal(binding.failureCode, 'study_delivery_binding_invalid');
  assert.equal(bindingProvider.calls.length, 0);

  const degradedProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const degraded = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: degradedProvider,
    gate: {
      apply: async () => ({
        output: { ...candidates, status: 'degraded' }, receipt: { degraded: true }, status: 'degraded',
        failureCode: 'invalid_response', usage: null, elapsedMs: 3,
      }),
    },
  }));
  assert.equal(degraded.status, 'completed');
  assert.equal(degraded.gate.status, 'degraded');
  assert.equal(degraded.gate.failureCode, 'invalid_response');
  assert.equal(degraded.delivered.sourceRefs.length, 2);
  assert.deepEqual(degraded.usage.selector, { status: 'unknown' });
});

test('provider failures are recorded once, never retried, and unknown usage stays unknown', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);

  const timeoutProvider = fakeProvider(() => ({ status: 'timeout', failureCode: 'timeout', usage: { inputTokens: 1, outputTokens: 0 } }));
  const timedOut = await executeStudyRun(baseRun({ generatorProvider: timeoutProvider }));
  assert.equal(timedOut.status, 'failed');
  assert.equal(timedOut.failureCode, 'timeout');
  assert.equal(timeoutProvider.calls.length, 1);

  const throwingProvider = fakeProvider(() => { throw new Error('socket closed'); });
  const thrown = await executeStudyRun(baseRun({ generatorProvider: throwingProvider }));
  assert.equal(thrown.failureCode, 'provider_error');
  assert.equal(thrown.detail, 'socket closed');
  assert.equal(throwingProvider.calls.length, 1);

  const noUsageProvider = fakeProvider(() => ({ status: 'ready', call: { name: 'submit_decision', arguments: submissionArguments(observation) }, outputBytes: 20 }));
  const noUsage = await executeStudyRun(baseRun({ generatorProvider: noUsageProvider }));
  assert.equal(noUsage.status, 'completed');
  assert.deepEqual(noUsage.usage.generator, { status: 'unknown' });
  assert.equal('tokens' in noUsage.usage.generator, false);
  assert.deepEqual(noUsage.usage.combined, { status: 'unknown' });

  const cancelled = await executeStudyRun(baseRun({
    generatorProvider: fakeProvider((_request, signal) => { assert.equal(signal.aborted, true); return { status: 'cancelled' }; }),
    signal: (() => { const controller = new AbortController(); controller.abort(); return controller.signal; })(),
  }));
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.failureCode, 'cancelled');
});

test('a generator that throws keeps the combined usage unknown while the selector amounts stay partial', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const provider = fakeProvider(() => { throw new Error('socket closed after dispatch'); });
  const record = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: provider,
    gate: { apply: async () => ({ output: candidates, receipt: null, status: 'skipped', usage: { inputTokens: 50, outputTokens: 10 }, elapsedMs: 1 }) },
  }));
  assert.equal(record.status, 'failed');
  assert.equal(record.failureCode, 'provider_error');
  // The generator was tried once with no reported usage: the attempt cost stays
  // unknown instead of collapsing into the selector subtotal.
  assert.equal(provider.calls.length, 1);
  assert.deepEqual(record.usage.generator, { status: 'unknown' });
  assert.deepEqual(record.usage.selector, { status: 'reported', tokens: { inputTokens: 50, outputTokens: 10 } });
  assert.deepEqual(record.usage.combined,
    { status: 'unknown', reportedPartial: { inputTokens: 50, outputTokens: 10 }, missing: ['inputTokens', 'outputTokens'] });
  // Nothing serializes a complete total for a run that never reported one.
  const stored = JSON.parse(JSON.stringify(record.usage));
  assert.equal('tokens' in stored.combined, false);
});

test('usage is validated field by field and never summed from missing or illegal counts', async () => {
  const observation = runObservation();
  const cases = [
    ['missing output', { inputTokens: 12 },
      { status: 'unknown', reportedPartial: { inputTokens: 12 }, missing: ['outputTokens'] }],
    ['missing input', { outputTokens: 3 },
      { status: 'unknown', reportedPartial: { outputTokens: 3 }, missing: ['inputTokens'] }],
    ['negative', { inputTokens: -1, outputTokens: 5 },
      { status: 'unknown', reportedPartial: { outputTokens: 5 }, missing: ['inputTokens'] }],
    ['fractional', { inputTokens: 1.5, outputTokens: 5 },
      { status: 'unknown', reportedPartial: { outputTokens: 5 }, missing: ['inputTokens'] }],
    ['non-numeric', { inputTokens: '12', outputTokens: 5 },
      { status: 'unknown', reportedPartial: { outputTokens: 5 }, missing: ['inputTokens'] }],
    ['nothing valid', { inputTokens: null, outputTokens: -2 },
      { status: 'unknown', missing: ['inputTokens', 'outputTokens'] }],
    ['zero is a real count', { inputTokens: 0, outputTokens: 0 },
      { status: 'reported', tokens: { inputTokens: 0, outputTokens: 0 } }],
  ];
  for (const [label, providerUsage, expected] of cases) {
    const provider = fakeProvider(() => ready(submissionArguments(observation), providerUsage));
    const record = await executeStudyRun(baseRun({ generatorProvider: provider }));
    assert.deepEqual(record.usage.generator, expected, label);
    assert.deepEqual(record.usage.combined, expected, label);
    // Nothing serializes into a fake `null` total.
    const stored = JSON.parse(JSON.stringify(record.usage));
    for (const scope of ['generator', 'combined']) {
      const tokens = stored[scope].tokens ?? stored[scope].reportedPartial ?? {};
      for (const value of Object.values(tokens)) assert.equal(Number.isInteger(value), true, `${label}/${scope}`);
    }
  }

  // A cached count is kept only when valid; it feeds no summed total.
  const cached = fakeProvider(() => ready(submissionArguments(observation), { inputTokens: 10, cachedInputTokens: 4, outputTokens: 2 }));
  assert.deepEqual((await executeStudyRun(baseRun({ generatorProvider: cached }))).usage.generator,
    { status: 'reported', tokens: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 4 } });
  const badCache = fakeProvider(() => ready(submissionArguments(observation), { inputTokens: 10, cachedInputTokens: -4, outputTokens: 2 }));
  assert.deepEqual((await executeStudyRun(baseRun({ generatorProvider: badCache }))).usage.generator,
    { status: 'reported', tokens: { inputTokens: 10, outputTokens: 2 } });

  // A partial selector keeps the generator's amounts but reports no complete total.
  const candidates = candidateResult(observation);
  const partialGate = {
    apply: async () => ({ output: candidates, receipt: null, status: 'skipped', usage: { inputTokens: 7 }, elapsedMs: 1 }),
  };
  const selfrag = await executeStudyRun(baseRun({
    arm: 'selfrag', gate: partialGate,
    generatorProvider: fakeProvider(() => ready(submissionArguments(observation), { inputTokens: 100, outputTokens: 20 })),
  }));
  assert.deepEqual(selfrag.usage.selector, { status: 'unknown', reportedPartial: { inputTokens: 7 }, missing: ['outputTokens'] });
  assert.deepEqual(selfrag.usage.combined,
    { status: 'unknown', reportedPartial: { inputTokens: 107, outputTokens: 20 }, missing: ['outputTokens'] });
});

test('submission binding is checked locally and recorded as a failure without retry', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const cases = [
    ['unexpected_tool', { status: 'ready', call: { name: 'search_knowledge', arguments: submissionArguments(observation) }, outputBytes: 10 }],
    ['invalid_model_response', { status: 'ready', call: { name: 'submit_decision', arguments: 'not json' }, outputBytes: 8 }],
    ['submission_case_mismatch', ready(submissionArguments(observation, { caseRef: 'arena-case:v1:00000000-0000-4000-8000-000000000000' }))],
    ['submission_action_not_offered', ready(submissionArguments(observation, { actionRef: 'arena-ref:v1:00000000-0000-4000-8000-000000000000' }))],
    ['invalid_submission', ready(submissionArguments(observation, { extra: true }))],
  ];
  for (const [failureCode, result] of cases) {
    const provider = fakeProvider(() => result);
    const record = await executeStudyRun(baseRun({ generatorProvider: provider }));
    assert.equal(record.status, 'failed', failureCode);
    assert.equal(record.failureCode, failureCode);
    assert.equal(record.submission, null);
    assert.equal(provider.calls.length, 1);
  }
});

test('one attempt writes exactly one run file and a duplicate attempt is refused', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'selfrag-study-run-'));
  try {
    const observation = runObservation();
    const candidates = candidateResult(observation);
    const input = {
      artifactDir: directory,
      caseId: CASE_ID,
      arm: 'baseline',
      phase: 'pilot',
      observation,
      candidateResult: candidates,
      generatorProvider: fakeProvider(() => ready(submissionArguments(observation), usage)),
      clock: () => 1_000,
    };
    const first = await runStudyAttempt(input);
    assert.equal(first.runFile, join('runs', CASE_ID, 'baseline', '1.json'));
    const record = JSON.parse(await readFile(join(directory, first.runFile), 'utf8'));
    assert.equal(record.status, 'completed');
    assert.deepEqual(record.submission.sourceRefs, []);
    const ledger = await readFile(join(directory, 'attempts.jsonl'), 'utf8');
    assert.equal(ledger.trim().split('\n').length, 2);
    await assert.rejects(() => runStudyAttempt(input), /study_attempt_duplicate/u);

    // A failing run stays on disk as its own attempt.
    const failing = await runStudyAttempt({
      ...input, arm: 'selfrag',
      generatorProvider: fakeProvider(() => ({ status: 'provider_error', failureCode: 'server_error' })),
      gateFactory: async () => ({ apply: async () => ({ output: candidates, receipt: null, status: 'skipped', usage: undefined, elapsedMs: 0 }) }),
    });
    const failedRecord = JSON.parse(await readFile(join(directory, failing.runFile), 'utf8'));
    assert.equal(failedRecord.status, 'failed');
    assert.equal(failedRecord.failureCode, 'provider_error');
    const lines = (await readFile(join(directory, 'attempts.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((line) => line.status), ['claimed', 'completed', 'claimed', 'failed']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unavailable gate factory is recorded as the attempt failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'selfrag-study-run-'));
  try {
    const observation = runObservation();
    const candidates = candidateResult(observation);
    const provider = fakeProvider(() => ready(submissionArguments(observation), usage));
    const { record } = await runStudyAttempt({
      artifactDir: directory, caseId: CASE_ID, arm: 'selfrag', phase: 'pilot',
      observation, candidateResult: candidates, generatorProvider: provider,
      gateFactory: async () => { throw new Error('applicability_gate_unavailable'); },
      clock: () => 1_000,
    });
    assert.equal(record.status, 'failed');
    assert.equal(record.failureCode, 'applicability_gate_unavailable');
    assert.equal(provider.calls.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the selector budget is picked once from pilot observations, never from evaluation', () => {
  const ladder = { maxOutputTokens: [512, 768, 1024], maxOutputBytes: [4096, 8192] };
  assert.deepEqual(selectSelectorBudget({ ladder, observations: [{ outputTokens: 400, outputBytes: 900 }] }),
    { maxOutputTokens: 512, maxOutputBytes: 4096, observedMax: { outputTokens: 400, outputBytes: 900 } });
  assert.deepEqual(selectSelectorBudget({ ladder, observations: [{ outputTokens: 600, outputBytes: 5000 }, { outputTokens: 300, outputBytes: 100 }] }),
    { maxOutputTokens: 768, maxOutputBytes: 8192, observedMax: { outputTokens: 600, outputBytes: 5000 } });
  assert.throws(() => selectSelectorBudget({ ladder, observations: [{ outputTokens: 2000, outputBytes: 100 }] }), /selector_budget_ladder_exhausted/u);
  assert.throws(() => selectSelectorBudget({ ladder, observations: [{ outputTokens: 100, outputBytes: 9000 }] }), /selector_budget_ladder_exhausted/u);
  assert.throws(() => selectSelectorBudget({ ladder, observations: [] }), /selector_budget_unobservable/u);
  assert.throws(() => selectSelectorBudget({ ladder, observations: [{ outputTokens: -1, outputBytes: 1 }] }), /selector_budget_observation_invalid/u);
});

test('a returned failed gate is terminal: the generator is not called and only its real selector cost is kept', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const provider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const receipt = { gateVersion: 'applicability-v1', status: 'failed', failureCode: 'receipt_too_large', droppedRefs: [] };
  const failed = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: provider,
    gate: {
      apply: async () => ({
        // A failed batch still carries the untouched passages; it is not a
        // fallback that the generator may be called on.
        output: candidates, receipt, status: 'failed', failureCode: 'receipt_too_large',
        usage: { inputTokens: 50, outputTokens: 10 }, elapsedMs: 9, outputBytes: 64,
      }),
    },
  }));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureCode, 'receipt_too_large');
  assert.equal(provider.calls.length, 0);
  assert.equal(failed.request, null);
  assert.deepEqual(failed.response, { status: 'not_called' });
  assert.equal(failed.gate.status, 'failed');
  assert.equal(failed.gate.failureCode, 'receipt_too_large');
  assert.deepEqual(failed.gate.receipt, receipt);
  assert.match(failed.gate.receiptDigest, /^[0-9a-f]{64}$/u);
  assert.deepEqual(failed.usage.selector, { status: 'reported', tokens: { inputTokens: 50, outputTokens: 10 } });
  // Only the selector really ran, so the total is its reported cost rather
  // than an unknown that would silently hide the missing generator call.
  assert.deepEqual(failed.usage.combined, { status: 'reported', tokens: { inputTokens: 50, outputTokens: 10 } });

  // The gate's own failure wins even when its fallback is not deliverable:
  // nothing was delivered, so the original code and receipt must not be
  // replaced by a later binding error.
  const otherProvider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const unbound = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: otherProvider,
    gate: {
      apply: async () => ({
        output: { ...candidates, passages: [{ ...candidates.passages[0], sourceRef: 'arena-ref:v1:forged' }] },
        receipt, status: 'failed', failureCode: 'receipt_too_large', usage: { inputTokens: 5, outputTokens: 2 }, elapsedMs: 1,
      }),
    },
  }));
  assert.equal(unbound.status, 'failed');
  assert.equal(unbound.failureCode, 'receipt_too_large');
  assert.equal(otherProvider.calls.length, 0);
  assert.deepEqual(unbound.gate.receipt, receipt);
  assert.deepEqual(unbound.usage.combined, { status: 'reported', tokens: { inputTokens: 5, outputTokens: 2 } });
});

test('a degraded gate still proceeds to the generator and records the downgrade', async () => {
  const observation = runObservation();
  const candidates = candidateResult(observation);
  const provider = fakeProvider(() => ready(submissionArguments(observation), usage));
  const record = await executeStudyRun(baseRun({
    arm: 'selfrag', generatorProvider: provider,
    gate: {
      apply: async () => ({
        output: candidates, receipt: { degraded: true }, status: 'degraded',
        failureCode: 'invalid_response', usage: { inputTokens: 5, outputTokens: 2 }, elapsedMs: 4,
      }),
    },
  }));
  assert.equal(record.status, 'completed');
  assert.equal(record.failureCode, null);
  assert.equal(provider.calls.length, 1);
  assert.equal(record.gate.status, 'degraded');
  assert.equal(record.gate.failureCode, 'invalid_response');
  assert.deepEqual(record.delivered.sourceRefs, candidates.sourceRefs);
  assert.deepEqual(record.usage.combined, { status: 'reported', tokens: { inputTokens: 105, outputTokens: 22 } });
});
