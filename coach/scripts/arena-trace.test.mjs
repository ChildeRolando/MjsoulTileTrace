import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseTrace, liveElapsed } from '../arena-console/trace/model.mjs';
const start = { type: 'run_started', startedAt: '2026-11-04T00:00:00Z', provider: { model: 'test-model' } };
const run = (events, extra = {}) => ({ events: [], traceLive: true, trace: events.map(event => ({ caseOrdinal: 0, event })), ...extra });

test('pairs provider and tool spans without counting cached input twice or inventing usage', () => {
  const trace = caseTrace(run([start,
    { type: 'provider_turn_started', turn: 1, elapsedMs: 15, inputBytes: 100 },
    { type: 'provider_turn', turn: 1, elapsedMs: 1015, result: 'tool_call', inputBytes: 100, outputBytes: 20, usage: { inputTokens: 1000, cachedInputTokens: 800, outputTokens: 15 } },
    { type: 'tool_call', ordinal: 1, turn: 1, toolName: 'search_knowledge', request: { query: '<script>' }, elapsedMs: 1100 },
    { type: 'tool_result', ordinal: 1, turn: 1, toolName: 'search_knowledge', status: 'error', code: 'timeout', elapsedMs: 1200 },
    { type: 'run_terminal', status: 'tool_failure', elapsedMs: 1210 },
  ]), 0);
  assert.equal(trace.live, false); assert.equal(trace.spans[0].duration, 1000);
  assert.equal(trace.spans[1].duration, 100); assert.equal(trace.spans[1].status, 'failed');
  assert.equal(trace.spans[0].usage.inputTokens, 1000); assert.equal(trace.spans[0].usage.cachedInputTokens, 800);
  assert.equal(trace.spans[1].usage, undefined); assert.equal(trace.slowest, 'model-1');
  assert.equal(trace.spans[1].input.query, '<script>');
});

test('only owned live cases grow; stopped or historical incomplete calls remain unknown', () => {
  const data = run([start, { type: 'provider_turn_started', turn: 1, elapsedMs: 10, inputBytes: 100 }]);
  const active = caseTrace(data, 0), epoch = Date.parse(start.startedAt);
  assert.equal(active.spans[0].status, 'running');
  assert.equal(liveElapsed(active, epoch + 4000, epoch + 3000), 4000);
  assert.equal(liveElapsed(active, epoch + 30000, epoch + 3000), 9500);
  assert.equal(liveElapsed(active, epoch + 30000, epoch + 3000, false), 3000);
  const stopped = caseTrace({ ...data, traceLive: false }, 0);
  assert.equal(stopped.spans[0].status, 'unknown'); assert.equal(stopped.spans[0].end, undefined);
  assert.equal(liveElapsed(stopped, epoch + 30000, epoch + 3000), 10);
});

test('legacy timestamps are estimated or unknown, never precise zero-duration tools', () => {
  const trace = caseTrace(run([start,
    { type: 'provider_turn', turn: 1, elapsedMs: 1000, result: 'tool_call' },
    { type: 'tool_call', ordinal: 1, turn: 1, toolName: 'helper', request: {} },
    { type: 'tool_result', ordinal: 1, turn: 1, toolName: 'helper', status: 'ok', result: {} },
  ], { traceLive: false }), 0);
  assert.equal(trace.hasApproximate, true); assert.equal(trace.spans[0].approximate, true);
  assert.equal(trace.spans[1].duration, null); assert.equal(trace.slowest, undefined);
});

test('final archive wins over partial live rows and cases stay isolated', () => {
  const archived = { events: [start, { type: 'run_terminal', status: 'completed', elapsedMs: 50 }], status: 'completed' };
  const data = run([start, { type: 'provider_turn_started', turn: 1, elapsedMs: 10 }], {
    events: [{ type: 'case_run', caseOrdinal: 0, result: archived }],
  });
  assert.equal(caseTrace(data, 0).status, 'completed'); assert.equal(caseTrace(data, 0).spans.length, 0);
  assert.equal(caseTrace(data, 1).status, 'pending'); assert.equal(caseTrace(data, 1).live, false);
});
