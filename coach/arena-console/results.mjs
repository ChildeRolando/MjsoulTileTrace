import { tabs, compactContent, roomyLayout } from '/compact-view.mjs';
import { api, $, esc, number, compact, rate, date, labels, message } from '/client.mjs';
import { runMetrics, aggregateMetrics, experimentTypeForDataset, experimentLabels } from '/presentation.mjs';
import { observationView, structured, mortalTable, traceEvent, matchBadge, usageCount } from '/case-view.mjs';
let state, filter = 'all', selectedResult, detailSignature = '', detailCase = 0, resultPage = 0;
const rowsPerPage = () => roomyLayout() ? 8 : innerHeight >= 900 ? 5 : innerHeight < 741 ? 2 : 3;
let resultPageSize = rowsPerPage();
window.addEventListener('resize', () => {
  const size = rowsPerPage();
  if (size !== resultPageSize) { resultPageSize = size; resultPage = 0; if (state) renderRuns(); }
});
function tokenText(summary) {
  if (!summary) return '未知';
  const usage = summary.tokenUsage;
  if (usage.status === 'not_called') return '未调用';
  const value = usage.status === 'reported' ? usage.tokens : usage.reportedPartial;
  const total = value?.totalTokens ?? (value?.inputTokens !== undefined && value.outputTokens !== undefined ? value.inputTokens + value.outputTokens : undefined);
  return total === undefined ? '未知' : `${compact(total)}${usage.status === 'unknown' ? ' + 未知' : ''}`;
}
function renderRuns() {
  const rows = state.runs.filter(row => $('#results-type').value === 'all' || ($('#results-type').value === 'mistakes' ? Boolean(row.manifest.replay) : experimentTypeForDataset(row.manifest.dataset.id) === $('#results-type').value))
    .filter(row => filter === 'all' || (filter === 'fault' ? row.manifest.controlledFault !== 'none' : row.manifest.rag.mode === filter && row.manifest.controlledFault === 'none'));
  resultPage = Math.max(0, Math.min(resultPage, Math.ceil(rows.length / resultPageSize) - 1));
  $('#results-pagination').hidden = rows.length <= resultPageSize;
  $('#results-page').textContent = `${resultPage + 1} / ${Math.max(1, Math.ceil(rows.length / resultPageSize))} 页 · ${rows.length} 份记录`;
  $('#prev-results').disabled = resultPage === 0; $('#next-results').disabled = (resultPage + 1) * resultPageSize >= rows.length;
  if (!rows.length) { $('#results-body').innerHTML = `<div class="empty-state"><strong>${state.runs.length ? '该筛选下暂无记录' : '还没有实验结果'}</strong>${state.runs.length ? '试试其他筛选条件。' : '启动一次实验，结果将自动显示在这里。'}</div>`; return; }
  $('#results-body').innerHTML = `<table class="result-table"><thead><tr><th>运行 / 模式</th><th class="model-column">模型</th><th>执行成功率</th><th>Mortal 匹配率</th><th class="token-column">TOKENS</th><th class="time-column">耗时</th><th aria-label="操作"></th></tr></thead><tbody>${rows.slice(resultPage * resultPageSize, (resultPage + 1) * resultPageSize).map(row => {
    const summary = row.summary, m = row.manifest, metrics = runMetrics(summary);
    return `<tr><td><div class="result-id">${esc(row.id.slice(0, 8))} ${m.replay ? '<span class="tag">错题重跑</span>' : ''}<span class="tag">${m.controlledFault !== 'none' ? '故障' : m.rag.mode === 'local' ? 'Local' : 'Off'}</span></div><div class="result-date">${date(m.startedAt)}</div></td><td class="model-column result-model">${esc(m.coach.model)}<div class="result-date">${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</div></td><td><span>${!metrics ? '归档未完成' : rate(metrics.succeeded, metrics.selected)}</span>${metrics ? `<div class="result-date">${metrics.succeeded}/${metrics.selected} 执行成功</div>` : ''}${summary?.toolFailureCount ? `<div class="result-date tool-warning">${summary.toolFailureCount} 次工具失败</div>` : ''}</td><td>${metrics ? rate(metrics.matched, metrics.succeeded) : '—'}<div class="result-date">${summary ? `${metrics.matched}/${metrics.succeeded} 成功案例${metrics.missingLabels ? ` · ${metrics.missingLabels} 缺标签` : ''}` : '等待结果'}</div></td><td class="token-column">${tokenText(summary)}</td><td class="time-column">${summary ? `${(summary.elapsedMs / 1000).toFixed(1)}s` : '—'}</td><td><a class="text-button view-button" href="/results?run=${row.id}">查看 ↗</a></td></tr>`;
  }).join('')}</tbody></table>`;
}
function renderDetail(data) {
  const { manifest: m, summary: s, events, trace = [] } = data;
  const finalized = new Map(events.filter(item => item.type === 'case_run').map(item => [item.caseOrdinal, item.result]));
  const live = new Map(); for (const row of trace) { if (!live.has(row.caseOrdinal)) live.set(row.caseOrdinal, []); live.get(row.caseOrdinal).push(row.event); }
  const body = $('#detail-body');
  const knownKeys = new Set([...body.querySelectorAll('details')].map(node => node.dataset.detailKey));
  const openKeys = new Set([...body.querySelectorAll('details[open]')].map(node => node.dataset.detailKey));
  const scroll = body.scrollTop, activeKey = document.activeElement?.closest('details')?.dataset.detailKey, focusedId = document.activeElement?.id;
  const auto = $('#trace-auto')?.checked ?? true;
  const signature = JSON.stringify(data);
  selectedResult = data;
  if (detailSignature === signature) return;
  detailSignature = signature;
  const metrics = runMetrics(s);
  $('#detail-title').textContent = `${m.replay ? "错题重跑" : experimentLabels[experimentTypeForDataset(m.dataset.id)]} · 实验 ${data.id.slice(0, 8)}`;
  body.innerHTML = `<details class="run-summary"><summary>本次运行摘要 · ${metrics ? `${metrics.succeeded}/${metrics.selected} 执行成功 · ${metrics.matched}/${metrics.succeeded} Mortal 匹配` : "正在运行"}</summary><div class="detail-meta"><span>${date(m.startedAt)}</span><span>${esc(m.coach.model)} · ${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</span><span>RAG ${esc(m.rag.mode)}</span><span>代码 ${m.codeSha.slice(0, 8)}</span></div><div class="detail-stat"><div>执行成功率<strong>${metrics ? rate(metrics.succeeded, metrics.selected) : '待归档'}</strong><span>${metrics ? `${metrics.succeeded}/${metrics.selected} 纳入案例` : ''}</span></div><div>Mortal 一选匹配率<strong>${metrics ? rate(metrics.matched, metrics.succeeded) : '待评分'}</strong><span>${metrics ? `${metrics.matched}/${metrics.succeeded} 成功案例${metrics.missingLabels ? ` · ${metrics.missingLabels} 缺标签` : ''}` : ''}</span></div><div>模型用量（各轮合计）<strong>${tokenText(s)}</strong><span>其中缓存输入：${s?.tokenUsage.status === 'not_called' ? '未调用' : usageCount((s?.tokenUsage.status === 'reported' ? s.tokenUsage.tokens : s?.tokenUsage.reportedPartial)?.cachedInputTokens, 'tokens')}${s?.tokenUsage.status === 'unknown' ? '（已报告部分）' : ''}</span><span>缓存是输入子集，不重复计入合计</span></div></div><p class="field-hint">${m.dataset.split.status === 'frozen_holdout' ? '冻结的独立牌局验收样本；结果披露后仅作回归复用' : '开发样本'}；未进行专家质量验收。${s ? `Helper 查询 ${s.evidence.helperQueries} 次，RAG 查询 ${s.evidence.ragQueries} 次、命中 ${s.evidence.ragHits} 次。` : '归档尚未完成，保留已发生的步骤，不据此判断成功。'}</p></details><div class="trace-controls"><label><input type="checkbox" id="trace-auto" ${auto ? 'checked' : ''}> 自动刷新过程</label><button id="refresh-detail" class="quiet-button">刷新过程</button>${events.some(e => e.type === 'case_run' && !data.mortalDetails?.cases.some(c => c.caseOrdinal === e.caseOrdinal)) ? '<button id="rebuild-mortal" class="quiet-button">补算 Mortal 评分</button>' : ''}<span id="trace-sync" role="status"></span></div><p class="field-hint">展示公开摘要和实际工具记录；不包含模型内部私有思维链。工具参数与返回可完整展开。</p>${m.dataset.selected.length > 1 ? `<label>查看案例<select id="detail-case">${m.dataset.selected.map((row, ordinal) => `<option value="${ordinal}" ${ordinal === detailCase ? "selected" : ""}>案例 ${ordinal + 1} · 原局决策 ${row.canonicalDecisionOrder + 1}</option>`).join("")}</select></label>` : ""}${m.dataset.selected.map((item, ordinal) => {
    if (ordinal !== detailCase) return "";
    const result = finalized.get(ordinal), records = result?.events ?? live.get(ordinal) ?? [];
    const score = result?.score.cases[0];
    return `<details class="case-detail" data-detail-key="case-${ordinal}" open><summary class="case-summary"><span class="case-title">案例 ${ordinal + 1}</span><span class="tag">${result ? esc(labels[result.status] ?? result.status) : records.length ? '尚无最终结果' : '尚无执行记录'}</span>${matchBadge(score)}<span class="case-chevron" aria-hidden="true">⌄</span></summary><div class="case-body"><div class="detail-meta"><span>${item.candidateCount} 个候选动作</span>${result ? `<span>${result.providerTurnCount} 轮模型调用 · ${result.toolCallCount} 次工具调用 · ${(result.elapsedMs / 1000).toFixed(1)}s</span>` : ''}</div><div class="case-workspace"><section class="case-board">${records.find(r => r.type === 'run_started')?.observation ? observationView(records.find(r => r.type === 'run_started').observation) : '<p>本记录未保存牌面。</p>'}</section><section class="case-scores">${mortalTable(data, ordinal, result)}</section><section class="case-process">${records.length ? `<ol class="trace-list">${records.filter(row => row.type !== 'run_started').map((row, index) => traceEvent(row, index, ordinal, records)).join('')}</ol>` : '<p class="field-hint">尚未收到本题事件。</p>'}</section></div>${result && !records.some(row => row.type === 'submission_locked') && result.attempt.submission ? structured(`${ordinal}-legacy-answer`, '旧归档中的最终提交', result.attempt.submission) : ''}</div></details>`;
  }).join('')}${structured('archive', '查看运行元数据与汇总', { manifest: m, summary: s })}<button id="download-result" class="quiet-button">下载本次结果 JSON</button>`;
  const workspace = body.querySelector('.case-workspace');
  const context = document.createElement('aside'); context.className = 'result-context';
  for (const node of [...body.children]) if (!node.matches('.case-detail, [data-detail-key=archive], #download-result')) context.append(node);
  body.prepend(context);
  const archive = document.createElement('section'); archive.className='case-archive';
  for (const node of [...body.querySelectorAll(':scope > [data-detail-key=archive], :scope > #download-result')]) archive.append(node);
  if (workspace) {
    workspace.append(archive);
    tabs(workspace, [{title:'案例牌面',node:workspace.querySelector('.case-board')},{title:'Mortal Top 10',node:workspace.querySelector('.case-scores')},{title:'模型与工具过程',node:workspace.querySelector('.case-process')},{title:'运行归档',node:archive}], `${data.id}-${detailCase}-sections`);
  } else body.append(archive);

  compactContent(body, `${data.id}-${detailCase}`);
  for (const node of body.querySelectorAll('details')) { if (node.dataset.detailKey && knownKeys.has(node.dataset.detailKey)) node.open = openKeys.has(node.dataset.detailKey); if (activeKey && activeKey === node.dataset.detailKey) node.querySelector('summary').focus({ preventScroll: true }); }
  if (focusedId && body.querySelector(`#${CSS.escape(focusedId)}`)) body.querySelector(`#${CSS.escape(focusedId)}`).focus({ preventScroll: true });
  body.scrollTop = scroll;
  $('#detail-case')?.addEventListener('change', event => { detailCase = Number(event.target.value); const url=new URL(location.href); url.searchParams.set('case',detailCase); history.replaceState(null,'',url); detailSignature = ''; renderDetail(selectedResult); });
  $('#refresh-detail').addEventListener('click', () => refreshDetail().catch(() => { $('#trace-sync').textContent = '刷新失败，请重试'; }));
  $('#rebuild-mortal')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await api('/api/start', { mode: 'mortal-details', runId: data.id }); $('#trace-sync').textContent = '正在补算 Mortal 评分，不调用模型；完成后自动刷新。'; }
    catch (error) { $('#trace-sync').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('#download-result').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(selectedResult, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `arena-${selectedResult.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
let refreshingDetail = false;
async function refreshDetail() {
  if (!selectedResult || refreshingDetail) return;
  refreshingDetail = true;
  const id = selectedResult.id;
  try { const data = await api(`/api/run/${id}`); if ($('#result-detail').hidden || selectedResult.id !== id) return; renderDetail(data); $('#trace-sync').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`; }
  finally { refreshingDetail = false; }
}

function render() {
 const type=$('#results-type').value, runs=state.runs.filter(r=>type==='all'||(type==='mistakes'?Boolean(r.manifest.replay):experimentTypeForDataset(r.manifest.dataset.id)===type));
 const m=aggregateMetrics(runs),budget=state.budget;
 $('#tokens').textContent=compact(budget.knownTotalTokens);$('#budget-caption').textContent=`报警线 ${compact(budget.warningThreshold)}`;
 const p=budget.knownTotalTokens/budget.warningThreshold*100;$('#budget-percent').textContent=p.toFixed(2)+'%';$('#budget-fill').style.width=Math.min(p,100)+'%';$('.budget-track').setAttribute('aria-valuenow',Math.min(p,100));
 $('#unknown-note').textContent=budget.unknownRunCount?`${budget.unknownRunCount} 份用量未知，已报告用量为已知下限`:'缓存输入已计入模型输入';
 $('#runs-count').textContent=m.archived;$('#cases-count').textContent=`${m.selected} 题纳入 · ${m.succeeded} 题成功 · ${m.incomplete} 份未完成`;
 $('#execution-rate').textContent=rate(m.succeeded,m.selected);$('#execution-fraction').textContent=`${m.succeeded} / ${m.selected} 题执行成功`;
 $('#match-rate').textContent=rate(m.matched,m.succeeded);$('#match-fraction').textContent=`${m.matched} / ${m.succeeded} 个成功案例${m.missingLabels?` · ${m.missingLabels} 缺标签`:''}`;
 $('#overview-scope').textContent=$('#metric-scope').textContent=`当前统计：${$('#results-type').selectedOptions[0].text}；累计 Token 覆盖全部归档。`;
 renderRuns();
}
async function refresh(){try{state=await api('/api/state');render();$('#sync-status').textContent='';if(!$('#result-detail').hidden&&$('#trace-auto')?.checked)await refreshDetail();}catch(e){message(e.message,true);}}
$('#results-type').addEventListener('change',()=>{resultPage=0;render();});
$('#prev-results').onclick=()=>{resultPage--;renderRuns();};$('#next-results').onclick=()=>{resultPage++;renderRuns();};
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filter=button.dataset.filter;resultPage=0;for(const b of document.querySelectorAll('[data-filter]')){b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',b===button);}renderRuns();});
const params=new URLSearchParams(location.search);
await refresh();
if(params.get('run')){try{const run=await api('/api/run/'+encodeURIComponent(params.get('run')));detailCase=Math.max(0,Math.min(Number(params.get('case'))||0,run.manifest.dataset.selected.length-1));renderDetail(run);$('#result-detail').hidden=false;document.body.classList.add('result-detail-view');for(const d of $('#detail-body').querySelectorAll('.case-detail'))d.open=d.dataset.detailKey===`case-${detailCase}`;$('#detail-title').focus({preventScroll:true});window.scrollTo(0,0);}catch(e){message(e.message,true);}}
setInterval(refresh,3000);
