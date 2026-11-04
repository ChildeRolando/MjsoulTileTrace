// Presentation only: archived events remain the authority for grading and usage.
const timed = value => Number.isFinite(value) && value >= 0;
export function caseTrace(data, ordinal) {
  const result = data.events?.find(row => row.type === 'case_run' && row.caseOrdinal === ordinal)?.result;
  const records = result?.events ?? data.trace?.filter(row => row.caseOrdinal === ordinal).map(row => row.event) ?? [];
  const terminal = records.find(row => row.type === 'run_terminal');
  const began = records.find(row => row.type === 'run_started');
  const live = Boolean(data.traceLive && began && !terminal && !result);
  const spans = [], models = new Map(), calls = new Map();
  let cursor = 0;
  for (const event of records) {
    if (event.type === 'provider_turn_started') {
      const span = { id: `model-${event.turn}`, kind: 'llm', name: `模型请求 ${event.turn}`, turn: event.turn,
        start: event.elapsedMs, inputBytes: event.inputBytes, model: began?.provider.model, raw: event };
      models.set(event.turn, span); spans.push(span);
    } else if (event.type === 'provider_turn') {
      let span = models.get(event.turn);
      if (!span) {
        // Older archives only record completion: the preceding boundary includes unmeasured preparation.
        span = { id: `model-${event.turn}`, kind: 'llm', name: `模型请求 ${event.turn}`, turn: event.turn,
          start: cursor, approximate: true, model: began?.provider.model };
        models.set(event.turn, span); spans.push(span);
      }
      Object.assign(span, { end: event.elapsedMs, status: event.result === 'tool_call' ? 'done' : 'failed',
        inputBytes: event.inputBytes, outputBytes: event.outputBytes, usage: event.usage,
        output: event.decisionSummary, toolName: event.toolName, error: event.result === 'tool_call' ? undefined : event.failureCode ?? event.result,
        reconnectCount: event.reconnectCount, raw: event });
    } else if (event.type === 'tool_call') {
      const span = { id: `tool-${event.ordinal}`, kind: 'tool', name: event.toolName, turn: event.turn,
        start: timed(event.elapsedMs) ? event.elapsedMs : null, input: event.request, raw: event };
      calls.set(event.ordinal, span); spans.push(span);
    } else if (event.type === 'tool_result') {
      let span = calls.get(event.ordinal);
      if (!span) { span = { id: `tool-${event.ordinal}`, kind: 'tool', name: event.toolName, turn: event.turn, start: null }; spans.push(span); }
      Object.assign(span, { end: timed(event.elapsedMs) ? event.elapsedMs : null, status: event.status === 'ok' ? 'done' : 'failed',
        output: event.result, error: event.code, reflection: event.reflection, raw: { request: span.raw, response: event } });
    } else if (event.type === 'submission_locked' || event.type === 'submission_rejected') {
      spans.push({ id: `submission-${spans.length}`, kind: 'submission', name: event.type === 'submission_locked' ? '锁定决策' : '提交被拒绝',
        start: event.elapsedMs ?? cursor, end: event.elapsedMs ?? cursor, approximate: !timed(event.elapsedMs), status: event.type === 'submission_locked' ? 'done' : 'failed',
        output: event.submission, error: event.reason, raw: event });
    }
    if (timed(event.elapsedMs)) cursor = Math.max(cursor, event.elapsedMs);
  }
  for (const span of spans) {
    if (!span.status) {
      span.status = live ? 'running' : 'unknown';
      // Missing completion is not evidence of failure, success, or a measured end.
      if (!live) span.error = '未记录调用结束；最终状态未知';
    }
    span.duration = timed(span.start) && timed(span.end) && span.end >= span.start ? span.end - span.start : null;
  }
  const measured = spans.filter(s => s.duration !== null && !s.approximate && s.kind !== 'submission');
  const callsComplete = spans.filter(s => s.kind !== 'submission').every(s => s.duration !== null && !s.approximate);
  const slowest = callsComplete ? measured.reduce((best, s) => !best || s.duration > best.duration ? s : best, null)?.id : undefined;
  return { spans, slowest, startedAt: began?.startedAt, live, lastElapsed: cursor,
    elapsed: terminal?.elapsedMs ?? result?.elapsedMs ?? cursor,
    status: terminal?.status ?? result?.status ?? (live ? 'running' : began ? 'incomplete' : 'pending'),
    outcome: records.find(row => row.type === 'submission_locked')?.submission,
    model: began?.provider.model ?? data.manifest?.coach.model,
    hasApproximate: spans.some(s => s.approximate || s.start === null) };
}

export function liveElapsed(trace, now, receivedAt, connected = true) {
  if (!trace.live) return trace.elapsed;
  const start = Date.parse(trace.startedAt);
  // Stop extending bars after a missed polling heartbeat. Do not depict an abandoned run as live.
  const clock = connected ? Math.min(now, receivedAt + 6500) : receivedAt;
  return Number.isFinite(start) ? Math.max(trace.lastElapsed, clock - start) : trace.lastElapsed;
}

export const durationText = ms => ms === null || ms === undefined ? '耗时未知' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
