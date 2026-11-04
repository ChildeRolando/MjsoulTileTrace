import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseTrace, caseRecords, liveElapsed, missingRunState } from '../arena-console/trace/model.mjs';
const start = { type: 'run_started', startedAt: '2026-11-04T00:00:00Z', provider: { model: 'test-model' } };
const run = (events, extra = {}) => ({ events: [], traceLive: true, trace: events.map(event => ({ caseOrdinal: 0, event })), ...extra });

test('empty inline events fall back to the same-case trace without overriding the archived outcome', () => {
  const records=[start,{type:'provider_turn',turn:1,result:'final',elapsedMs:20},{type:'run_terminal',status:'completed',elapsedMs:20}];
  const data=run(records,{events:[{type:'case_run',caseOrdinal:0,result:{events:[],status:'invalid_submission',elapsedMs:30}}]});
  data.trace.push({caseOrdinal:1,event:{type:'provider_turn',turn:9,result:'final',elapsedMs:900}});
  assert.deepEqual(caseRecords(data,0),records);
  const trace=caseTrace(data,0);assert.equal(trace.spans.length,1);assert.equal(trace.status,'invalid_submission');assert.equal(trace.elapsed,30);assert.equal(trace.live,false);
});

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
  assert.equal(liveElapsed(active, epoch + 30000, epoch + 3000, epoch + 5000), 5000);
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


test('heartbeat expiry and explicit interruption never rewind or extend past their boundary', () => {
  const trace = caseTrace(run([start]), 0), epoch = Date.parse(start.startedAt);
  assert.equal(liveElapsed(trace, epoch + 9499, epoch + 3000), 9499);
  assert.equal(liveElapsed(trace, epoch + 9500, epoch + 3000), 9500);
  assert.equal(liveElapsed(trace, epoch + 12000, epoch + 3000), 9500);
  assert.equal(liveElapsed(trace, epoch + 30000, epoch + 3000, epoch + 5000), 5000);
  assert.equal(liveElapsed(trace, epoch + 30000, epoch + 3000, epoch + 15000), 9500);
  assert.equal(liveElapsed(trace, epoch + 31000, epoch + 30000), 31000);
});

test('direct final answers succeed and preserve actual request, audit and response', () => {
  const request = { messages: [{ role: 'user', content: 'raw observation' }], tools: [] };
  const audit = { visibility: 'captured', body: '{}' };
  const trace = caseTrace(run([start,
    { type: 'provider_turn_started', turn: 1, elapsedMs: 20 },
    { type: 'request_prepared', turn: 1, request },
    { type: 'request_audit', turn: 1, audit },
    { type: 'provider_turn', turn: 1, result: 'final', elapsedMs: 1020 },
    { type: 'provider_final', content: '{"tile":"5m","red":false}', parseStatus: 'valid' },
    { type: 'submission_locked', elapsedMs: 1030, submission: { format: 'tile-red/v1', actionRef: 'discard-5m' } },
    { type: 'run_terminal', status: 'completed', elapsedMs: 1040 },
  ]), 0);
  assert.equal(trace.spans[0].status, 'done'); assert.equal(trace.spans[0].duration, 1000);
  assert.deepEqual(trace.spans[0].input, request); assert.deepEqual(trace.spans[0].audit, audit);
  assert.equal(trace.spans[0].final.parseStatus, 'valid'); assert.match(trace.spans[0].output, /5m/);
  assert.equal(trace.spans[1].status, 'done');
});

test('missing archive waits only for owned active preparation and reports terminal errors', () => {
  const job = { status: 'running', steps: [{ runId: 'id', status: 'running' }] };
  assert.equal(missingRunState(job, 'id', 404).retry, true);
  assert.equal(missingRunState(job, 'other', 404).retry, false);
  job.steps[0] = { runId: 'id', status: 'failed', error: 'provider_preflight_failed' };
  assert.equal(missingRunState(job, 'id', 404).retry, false);
  assert.match(missingRunState(job, 'id', 404).message, /provider_preflight_failed/);
  assert.equal(missingRunState(null, 'id', 404).retry, false);
  assert.equal(missingRunState(null, 'id', 500).retry, true);
});
