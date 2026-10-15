const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { collectArenaMistakes } from '../bin/arena-mistakes.mjs';

function archive({ id = 'one', dataset = 'blind-discard-dev-v1', order = 12, source = 'game-a', candidates = 'candidate-a',
  mortal = 'checkpoint-a', model = 'model-a', rag = 'off', fault = 'none', status = 'completed', score = 'not_matched', ordinal = 0 } = {}) {
  return { manifest: { runId: id, dataset: { id: dataset, source: { sourceRecordHash: source },
    selected: Array.from({ length: ordinal + 1 }, (_, i) => ({ canonicalDecisionOrder: i === ordinal ? order : 0, candidateSetDigest: candidates })) },
    mortal: { checkpoint: mortal }, coach: { model, providerId: 'test', promptVersion: 'v2', reasoningEffort: 'high' },
    rag: { mode: rag }, controlledFault: fault, codeSha: 'a'.repeat(40) },
  events: [{ type: 'case_run', caseOrdinal: ordinal, recordedAt: '2026-10-16T00:00:00Z', result: {
    status, endedAt: '2026-10-16T00:01:00Z', score: { cases: [{ status: score }] }, toolFailureCount: 0,
    attempt: { submission: status === 'completed' ? { actionRef: `chosen-${id}` } : undefined },
    events: [{ type: 'run_started', observation: { caseRef: `opaque-${id}`, visibleState: {
      roundWind: 'E', hand: 1, honba: 0, self: { concealedTiles: [{ id: '5p', red: true }], currentDraw: { tile: { id: '1s', red: false } } }
    } } }]
  } }] };
}

test('one question merges batches and dataset views by source decision, not run alias or local ordinal', () => {
  const records = [archive({ id: 'off', ordinal: 2 }), archive({ id: 'local', dataset: 'blind-discard-flat-v1', rag: 'local' }),
    archive({ id: 'pass', score: 'matched' }), archive({ id: 'error', status: 'provider_error', score: 'unscorable' }),
    archive({ id: 'unknown', score: 'unscorable' })];
  const original = JSON.stringify(records);
  const report = collectArenaMistakes(records), q = report.questions[0];
  assert.equal(report.questions.length, 1);
  assert.deepEqual([q.errors, q.scored, q.matched, q.attempts, q.executionFailures, q.missingLabels], [2, 3, 1, 5, 1, 1]);
  assert.equal(q.errorRate, 2 / 3);
  assert.equal(q.snapshots.length, q.errors);
  assert.deepEqual(q.snapshots.map(s => [s.runId, s.caseOrdinal, s.actionRef]), [['local', 0, 'chosen-local'], ['off', 2, 'chosen-off']]);
  assert.equal(JSON.stringify(records), original);
});

test('source, decision, candidates and Mortal identity changes cannot merge unrelated questions', () => {
  const report = collectArenaMistakes([archive(), archive({ source: 'game-b' }), archive({ order: 13 }),
    archive({ candidates: 'candidate-b' }), archive({ mortal: 'checkpoint-b' })]);
  assert.equal(report.questions.length, 5);
  assert.equal(new Set(report.questions.map(q => q.id)).size, 5);
});

test('filters recompute numerator and denominator and controlled faults are excluded by default', () => {
  const records = [archive(), archive({ id: 'pass', model: 'model-b', rag: 'local', score: 'matched' }), archive({ id: 'fault', fault: 'first-helper-timeout' })];
  assert.equal(collectArenaMistakes(records).questions[0].errorRate, 1 / 2);
  assert.equal(collectArenaMistakes(records).excludedFaultRuns, 1);
  assert.equal(collectArenaMistakes(records, { includeFaults: true }).questions[0].errorRate, 2 / 3);
  assert.equal(collectArenaMistakes(records, { model: 'model-a' }).questions[0].errorRate, 1);
  assert.equal(collectArenaMistakes(records, { rag: 'local' }).questions.length, 0);
  assert.equal(collectArenaMistakes(records, { type: 'holdout' }).questions.length, 0);
});

test('execution failures and missing labels alone never become decision mistakes', () => {
  const report = collectArenaMistakes([archive({ status: 'timeout', score: 'unscorable' }), archive({ score: 'unscorable' }), archive({ score: 'matched' })]);
  assert.equal(report.questions.length, 0);
  assert.equal(report.totals.errors, 0);
});

test('legacy archives without observations retain an exact reference instead of inventing a board', () => {
  const record = archive(); record.events[0].result.events = [];
  const q = collectArenaMistakes([record]).questions[0];
  assert.equal(q.preview, null);
  assert.equal(q.snapshots[0].hasObservation, false);
  assert.equal(q.snapshots[0].runId, 'one');
});
