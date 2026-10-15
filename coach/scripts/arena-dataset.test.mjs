import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, selectDatasetBatch, selectExperimentPool } from '../bin/blind-discard-arena.mjs';

test('expanded development batches do not change the frozen three-case smoke command', () => {
  const smoke = parseArgs(['run', '--dataset', 'blind-discard-smoke-v1', '--rag', 'off']);
  assert.equal(smoke.maxCases, 3); assert.equal(smoke.caseOffset, 0);
  const dev = parseArgs(['run', '--dataset', 'blind-discard-dev-v1', '--rag', 'local', '--max-cases', '25', '--case-offset', '10']);
  assert.equal(dev.maxCases, 25); assert.equal(dev.caseOffset, 10);
  assert.equal(parseArgs(['run', '--dataset', 'blind-discard-dev-v1', '--rag', 'off']).maxCases, 10);
  assert.throws(() => parseArgs(['run', '--dataset', 'blind-discard-smoke-v1', '--rag', 'off', '--case-offset', '1']));
  assert.throws(() => parseArgs(['run', '--dataset', 'blind-discard-dev-v1', '--rag', 'off', '--max-cases', '129']));
  assert.deepEqual(parseArgs(['catalog']), { command: 'catalog' });
});

test('flat and spatial pools partition visible scenarios before independent batching, without labels', () => {
  const state = (melds = [], status = 'none') => ({ melds, riichiStates: [
    { actor: 0, status: 'none' }, { actor: 1, status }, { actor: 2, status: 'none' }, { actor: 3, status: 'none' },
  ] });
  const pool = { selected: [state(), state([{ actor: 2, kind: 'pon' }]), state([], 'declared'),
    state(), state([{ actor: 0, kind: 'ankan' }]), state([], 'accepted')]
    .map((publicState, canonicalDecisionOrder) => ({ canonicalDecisionOrder, snapshot: { publicState }, privateLabel: 'not inspected' })),
    excluded: [{ canonicalDecisionOrder: 6, reason: 'non_action' }] };
  const before = JSON.stringify(pool);
  const flat = selectExperimentPool(pool, 'blind-discard-flat-v1'), spatial = selectExperimentPool(pool, 'blind-discard-spatial-v1');
  assert.deepEqual(flat.selected.map(row => row.canonicalDecisionOrder), [0, 3]);
  assert.deepEqual(spatial.selected.map(row => row.canonicalDecisionOrder), [1, 2, 4, 5]);
  assert.equal(new Set([...flat.selected, ...spatial.selected].map(row => row.canonicalDecisionOrder)).size, 6);
  assert.equal(selectDatasetBatch(spatial, 1, 1).selected[0].canonicalDecisionOrder, 2);
  assert.equal(flat.excluded.find(row => row.canonicalDecisionOrder === 6).reason, 'non_action');
  assert.equal(flat.excluded.find(row => row.canonicalDecisionOrder === 1).reason, 'different_experiment_type');
  assert.equal(JSON.stringify(pool), before);
  assert.equal(selectExperimentPool(pool, 'blind-discard-smoke-v1'), pool);
  assert.equal(selectExperimentPool(pool, 'blind-discard-dev-v1'), pool);
  for (const type of ['flat', 'spatial']) assert.equal(parseArgs(['run', '--dataset', `blind-discard-${type}-v1`, '--rag', 'off']).maxCases, 10);
});

test('eligible case offsets give disjoint deterministic batches and retain every excluded decision', () => {
  const pool = { selected: Array.from({ length: 110 }, (_, canonicalDecisionOrder) => ({ canonicalDecisionOrder })),
    excluded: [{ canonicalDecisionOrder: 110, reason: 'non_action' }] };
  const before = JSON.stringify(pool);
  const first = selectDatasetBatch(pool, 10, 0), next = selectDatasetBatch(pool, 10, 10);
  assert.deepEqual(first.selected.map(row => row.canonicalDecisionOrder), Array.from({ length: 10 }, (_, i) => i));
  assert.deepEqual(next.selected.map(row => row.canonicalDecisionOrder), Array.from({ length: 10 }, (_, i) => i + 10));
  assert.equal(new Set([...first.selected, ...first.excluded].map(row => row.canonicalDecisionOrder)).size, 111);
  assert.equal(next.excluded.find(row => row.canonicalDecisionOrder === 110).reason, 'non_action');
  assert.equal(selectDatasetBatch(pool, 128, 0).selected.length, 110);
  assert.throws(() => selectDatasetBatch(pool, 10, 110), /arena_case_offset_out_of_range/);
  assert.equal(JSON.stringify(pool), before);
});

 test('output token configuration accepts model-sized budgets and rejects unsafe values', () => {
   const args = ['run', '--dataset', 'blind-discard-dev-v1', '--rag', 'off', '--max-provider-output-tokens'];
   assert.equal(parseArgs([...args, '8192']).budget.maxProviderOutputTokens, 8192);
   for (const value of ['0', '1.5', '9007199254740992']) assert.throws(() => parseArgs([...args, value]));
 });
