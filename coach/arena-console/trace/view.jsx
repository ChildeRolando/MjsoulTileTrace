import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Timeline, DataSet } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import './view.css';
import { ToolCallCard } from './vendor/tool-call-card';
import { caseTrace, durationText, liveElapsed } from './model.mjs';

const statuses = { done: '完成', failed: '失败', running: '运行中', unknown: '结果未知', incomplete: '记录未完成',
  completed: '已完成', timeout: '超时', cancelled: '已取消', provider_error: '模型失败',
  provider_unavailable: '模型不可用', budget_exhausted: '预算耗尽', invalid_submission: '提交无效', tool_failure: '工具失败', pending: '尚未开始' };
const show = value => value === undefined ? '未记录' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const count = value => value === undefined ? '未报告' : value.toLocaleString('zh-CN');
const label = text => { const node = document.createElement('span'); node.textContent = text; return node; };
const size = 10;

function TraceView({ data, ordinal, receivedAt, connected, paused, frozenAt }) {
  const trace = caseTrace(data, ordinal);
  const [now, setNow] = useState(Date.now()), [selected, setSelected] = useState(null), [page, setPage] = useState(0);
  const [follow, setFollow] = useState(true), [filter, setFilter] = useState('all');
  const canvas = useRef(null), timeline = useRef(null), items = useRef(new DataSet()), groups = useRef(new DataSet());
  const range = useRef(10000), updateSelection = useRef(setSelected);
  const fresh = connected && !paused && now - receivedAt < 6500;
  const elapsed = liveElapsed(trace, now, receivedAt, frozenAt);
  const all = trace.spans.filter(s => filter === 'all' || (filter === 'failed' ? s.status === 'failed' || s.status === 'unknown' : s.kind === filter));
  const pageCount = Math.max(1, Math.ceil(all.length / size)), actualPage = Math.min(page, pageCount - 1);
  const rows = all.slice(actualPage * size, actualPage * size + size);
  const detail = trace.spans.find(s => s.id === selected) ?? rows[0];
  const live = trace.live && fresh;

  useEffect(() => {
    setNow(Date.now());
    if (!trace.live || !connected || paused) return;
    const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id);
  }, [trace.live, connected, paused]);
  useEffect(() => {
    const widget = new Timeline(canvas.current, items.current, groups.current, {
      editable: false, selectable: true, stack: false, showCurrentTime: false, showMajorLabels: false,
      orientation: 'top', margin: { item: 6, axis: 6 }, groupOrder: 'order',
      start: 0, end: 10000, min: 0, zoomMin: 100, zoomMax: 3600000,
      format: { minorLabels: date => `${(Number(date) / 1000).toFixed(Number(date) < 1000 ? 1 : 0)}s` },
      zoomKey: 'ctrlKey', tooltip: { followMouse: false },
    });
    widget.on('select', event => { if (event.items.length) updateSelection.current(event.items[0]); });
    let axisStep;
    widget.on('rangechanged', event => {
      if (event.byUser) setFollow(false);
      const target = (Number(event.end) - Number(event.start)) / 7;
      const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000, 600000].find(n => n >= target) ?? 600000;
      if (step !== axisStep) {
        axisStep = step;
        widget.setOptions({ timeAxis: { scale: step < 1000 ? 'millisecond' : 'second', step: step < 1000 ? step : step / 1000 } });
      }
    });
    timeline.current = widget;
    // The host is initially inside an inactive tab; redraw when it becomes visible.
    const observer = new ResizeObserver(() => { if (canvas.current?.clientWidth) widget.redraw(); });
    observer.observe(canvas.current);
    return () => { observer.disconnect(); widget.destroy(); timeline.current = null; };
  }, []);

  useEffect(() => {
    if (!timeline.current) return;
    const ids = rows.map(s => s.id);
    items.current.remove(items.current.getIds().filter(id => !ids.includes(id)));
    groups.current.remove(groups.current.getIds().filter(id => !ids.includes(id)));
    groups.current.update(rows.map((s, i) => ({ id: s.id, order: i,
      content: label(`${s.kind === 'tool' ? `第 ${s.turn} 轮 · ` : ''}${s.name}`) })));
    items.current.update(rows.map(s => {
      const start = s.start ?? s.end ?? 0;
      const end = s.end ?? (s.status === 'running' ? elapsed : start);
      const duration = s.status === 'running' && live ? Math.max(0, elapsed - start) : s.duration;
      return { id: s.id, group: s.id, start, end: Math.max(start + 1, end),
        type: end > start ? 'range' : 'point',
        content: label(`${statuses[s.status]} · ${(s.kind === 'submission' ? '事件' : durationText(duration))}${s.approximate ? ' ≈' : ''}`),
        title: `${s.name} · ${statuses[s.status]} · ${(s.kind === 'submission' ? '事件' : durationText(duration))}${s.approximate ? '（开始边界估算）' : ''}`,
        className: `trace-${s.kind} trace-${s.status}${s.approximate || s.start === null ? ' trace-estimated' : ''}` };
    }));
    range.current = Math.max(1000, Math.ceil(Math.max(elapsed, ...trace.spans.map(s => s.end ?? 0)) / 1000) * 1000 * 1.06);
    if (follow) timeline.current.setWindow(0, range.current, { animation: false });
    if (detail) timeline.current.setSelection([detail.id]);
  }, [data, ordinal, elapsed, actualPage, filter, follow, selected, live]);

  const pick = id => {
    let index = all.findIndex(s => s.id === id);
    if (index < 0) { setFilter('all'); index = trace.spans.findIndex(s => s.id === id); }
    setPage(Math.max(0, Math.floor(index / size))); setSelected(id); timeline.current?.setSelection([id]);
  };
  const fit = () => { setFollow(true); timeline.current?.setWindow(0, range.current, { animation: false }); };
  return <section className="live-trace" aria-label="会话调用瀑布图">
    <header className="waterfall-heading"><div><h3>调用过程</h3><span className={`trace-state ${live ? 'is-live' : ''}`} role="status">
      {trace.live && !fresh ? paused ? '已暂停刷新' : '连接中断 · 保留最近记录' : statuses[trace.status] ?? trace.status}
    </span></div><span>{durationText(elapsed)} · {trace.spans.filter(s => s.kind === 'llm').length} 次模型请求 · {trace.spans.filter(s => s.kind === 'tool').length} 次工具调用</span></header>
    <div className="waterfall-toolbar"><label className="trace-filter">显示<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); setSelected(null); }}>
      <option value="all">全部调用</option><option value="llm">模型请求</option><option value="tool">工具调用</option><option value="failed">失败 / 未完成</option>
    </select></label><div className="trace-legend"><span className="llm">模型</span><span className="tool">工具</span><span className="failed">失败</span></div>
      <div className="trace-zoom"><button type="button" onClick={() => { setFollow(false); timeline.current?.zoomIn(.4, { animation: false }); }} aria-label="放大时间轴">＋</button>
      <button type="button" onClick={() => { setFollow(false); timeline.current?.zoomOut(.4, { animation: false }); }} aria-label="缩小时间轴">−</button>
      <button type="button" aria-pressed={follow} onClick={fit}>完整会话</button></div></div>
    {trace.hasApproximate && <p className="trace-note">≈ 旧记录未保存精确开始时间，虚线条包含准备耗时；缺失时间不计算耗时。</p>}
    {!trace.spans.length && <p className="trace-note">尚无调用事件；实验准备完成后自动显示。</p>}
    <div className="waterfall-workspace"><div className="waterfall-chart"><div ref={canvas} className="trace-canvas" aria-label="调用时间轴" />
      <nav className="trace-pager" aria-label="调用翻页"><button type="button" disabled={!actualPage} onClick={() => { setPage(actualPage - 1); setSelected(null); }}>上一页</button>
        <span>{actualPage + 1} / {pageCount} · {all.length} 条</span><button type="button" disabled={actualPage >= pageCount - 1} onClick={() => { setPage(actualPage + 1); setSelected(null); }}>下一页</button></nav>
      <div className="trace-selection"><label>查看调用<select value={detail?.id ?? ''} onChange={e => pick(e.target.value)}>
        {!trace.spans.length && <option value="">暂无调用</option>}{trace.spans.map(s => <option key={s.id} value={s.id}>{s.name} · {statuses[s.status]}</option>)}
      </select></label></div></div>
      <aside className="trace-inspector" aria-label="调用详情">{detail ? <SpanDetail key={detail.id} span={detail} live={live} elapsed={elapsed} slowest={detail.id === trace.slowest} /> : <p className="trace-note">选择一条调用查看详情。</p>}</aside>
    </div>
  </section>;
}

function SpanDetail({ span, live, elapsed, slowest }) {
  const duration = span.status === 'running' && live ? Math.max(0, elapsed - (span.start ?? elapsed)) : span.duration;
  const toolReady = span.kind === 'tool' && ['done', 'failed', 'running'].includes(span.status) && (span.status !== 'running' || live);
  return <>{!toolReady && <header><h4>{span.name}</h4><span>{span.turn ? `第 ${span.turn} 轮 · ` : ''}{statuses[span.status]} · {span.kind === 'submission' ? '事件' : durationText(duration)}{slowest ? ' · 最慢调用' : ''}</span></header>}
    {span.approximate && <p className="trace-note">耗时为旧记录边界估算。</p>}
    {span.kind === 'llm' && <><p className="trace-model">{span.model}</p>
      <section className="trace-usage"><h5>整轮模型用量 <small>tokens</small></h5><dl>
        <div><dt>模型输入</dt><dd>{count(span.usage?.inputTokens)}</dd></div><div><dt>其中缓存输入</dt><dd>{count(span.usage?.cachedInputTokens)}</dd></div>
        <div><dt>模型输出</dt><dd>{count(span.usage?.outputTokens)}</dd></div></dl></section>
      <section className="trace-usage"><h5>Arena 请求／响应大小 <small>bytes</small></h5><dl>
        <div><dt>请求</dt><dd>{count(span.inputBytes)}</dd></div><div><dt>响应</dt><dd>{count(span.outputBytes)}</dd></div></dl></section>
      {span.reconnectCount > 0 && <p className="trace-note">同一请求内重连 {span.reconnectCount} 次</p>}
      {span.toolName && <p>下一步：<b>{span.toolName}</b></p>}
    </>}
    {toolReady ? <ToolCallCard name={span.name} summary={`第 ${span.turn} 轮${slowest ? ' · 最慢调用' : ''}`} status={span.status === 'done' ? 'success' : span.status === 'failed' ? 'error' : 'running'}
      args={span.input} result={span.output} error={span.error} duration={duration ?? undefined}
      startedAt={span.status === 'running' && duration !== null ? Date.now() - duration : undefined} defaultOpen maxCodeHeight={100} /> : <>
      {span.error && <p className="trace-error-message">{span.error}</p>}
      {span.output !== undefined && <details open><summary>{span.kind === 'llm' ? span.outputLabel ?? '公开决策摘要' : '返回内容'}</summary><pre>{show(span.output)}</pre></details>}
      {span.input !== undefined && <details><summary>调用参数</summary><pre>{show(span.input)}</pre></details>}
      {span.status === 'running' && <p className="trace-note">{live ? '等待响应…' : '刷新恢复后确认调用状态。'}</p>}
    </>}
    {span.audit && <details><summary>实际请求审计</summary><pre>{show(span.audit)}</pre></details>}
    {span.final && <details><summary>最终回答解析</summary><pre>{show(span.final)}</pre></details>}
    {span.reflection && <details><summary>RAG 筛选记录</summary><pre>{show(span.reflection)}</pre></details>}
    <details className="trace-raw"><summary>原始事件</summary><pre>{show(span.raw ?? { status: span.status, inputBytes: span.inputBytes })}</pre></details>
  </>;
}

export function mountTrace(host) {
  const root = createRoot(host);
  let payload;
  return { host, update(data, ordinal, paused = false, heartbeat = true) { const now = Date.now(); payload = { data, ordinal, receivedAt: heartbeat ? now : payload?.receivedAt ?? now, connected: heartbeat ? true : payload?.connected ?? true, paused, frozenAt: paused ? payload?.frozenAt ?? now : heartbeat ? null : payload?.frozenAt ?? null }; root.render(<TraceView {...payload} />); },
    disconnected() { if (payload) { payload = { ...payload, connected: false, frozenAt: payload.frozenAt ?? Date.now() }; root.render(<TraceView {...payload} />); } },
    dispose() { root.unmount(); } };
}
