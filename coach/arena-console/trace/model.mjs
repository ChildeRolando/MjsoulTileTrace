// Presentation only: archived events remain the authority for grading and usage.
const timed = value => Number.isFinite(value) && value >= 0;
export function caseRecords(data, ordinal) {
  const result = data.events?.find(row => row.type === 'case_run' && row.caseOrdinal === ordinal)?.result;
  return result?.events?.length ? result.events : data.trace?.filter(row => row.caseOrdinal === ordinal).map(row => row.event) ?? [];
}
export function caseTrace(data, ordinal) {
  const result = data.events?.find(row => row.type === 'case_run' && row.caseOrdinal === ordinal)?.result;
  const records = caseRecords(data, ordinal);
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
      Object.assign(span, { end: event.elapsedMs, status: ['tool_call', 'final'].includes(event.result) ? 'done' : 'failed',
        inputBytes: event.inputBytes, outputBytes: event.outputBytes, usage: event.usage,
        output: event.decisionSummary, toolName: event.toolName, error: ['tool_call', 'final'].includes(event.result) ? undefined : event.failureCode ?? event.result,
        reconnectCount: event.reconnectCount, raw: event });
    } else if (event.type === 'request_prepared' || event.type === 'request_audit') {
      const span = models.get(event.turn);
      if (span) { if (event.type === 'request_prepared') span.input = event.request; else span.audit = event.audit; }
    } else if (event.type === 'provider_final') {
      const span = [...models.values()].at(-1);
      if (span) { span.output = event.content; span.outputLabel = '原始最终回答'; span.final = event; }
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
    if (span.kind === 'llm') {
      span.input ??= records.find(e => e.type === 'request_prepared' && e.turn === span.turn)?.request;
      span.audit ??= records.find(e => e.type === 'request_audit' && e.turn === span.turn)?.audit;
    }
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
    elapsed: result?.elapsedMs ?? terminal?.elapsedMs ?? cursor,
    status: result?.status ?? terminal?.status ?? (live ? 'running' : began ? 'incomplete' : 'pending'),
    outcome: records.find(row => row.type === 'submission_locked')?.submission,
    model: began?.provider?.model ?? data.manifest?.coach?.model,
    hasApproximate: spans.some(s => s.approximate || s.start === null) };
}

export function liveElapsed(trace, now, receivedAt, frozenAt = null) {
  if (!trace.live) return trace.elapsed;
  const start = Date.parse(trace.startedAt);
  // Stop extending bars after a missed polling heartbeat. Do not depict an abandoned run as live.
  const clock = Math.min(frozenAt ?? now, receivedAt + 6500);
  return Number.isFinite(start) ? Math.max(trace.lastElapsed, clock - start) : trace.lastElapsed;
}

export const durationText = ms => ms === null || ms === undefined ? '耗时未知' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

// Only an owned active step can promise that a missing archive is still being prepared.
export function missingRunState(job, runId, status) {
  if (status !== 404) return { retry: true, message: '读取实验记录失败；将自动重试。' };
  const step = job?.steps?.find(row => row.runId === runId);
  if (step && ['running', 'stopping'].includes(step.status) && ['running', 'stopping'].includes(job.status))
    return { retry: true, message: '正在准备实验记录；每 3 秒刷新。' };
  return { retry: false, message: step ? `实验${step.status === 'stopped' ? '已停止' : '已结束'}，未生成可读取的记录。${step.error ?? ''}` : '找不到该实验记录；请检查链接或返回实验结果。' };
}
