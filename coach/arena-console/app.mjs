const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => new Intl.NumberFormat('en-US').format(value);
const compact = value => value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : number(value);
const rate = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const labels = { running: '运行中', stopping: '正在停止', stopped: '已停止', completed: '执行完成', failed: '执行失败',
  timeout: '超时', provider_error: '模型调用失败', provider_unavailable: '模型不可用', cancelled: '已取消', budget_exhausted: '达到逐题预算',
  tool_failure: '工具失败', invalid_submission: '提交无效', label_binding_failure: '标签绑定失败', off: 'RAG Off', local: 'Local RAG', fault: '受控故障', compare: 'RAG 对照' };
let state, filter = 'all', pending = false, selectedResult;

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '操作未完成');
  return result;
}
function message(text, error = false) { const node = $('#message'); node.textContent = text; node.hidden = !text; node.classList.toggle('error', error); }
function tokenText(summary) {
  if (!summary) return '未知';
  const usage = summary.tokenUsage;
  if (usage.status === 'not_called') return '未调用';
  const value = usage.status === 'reported' ? usage.tokens : usage.reportedPartial;
  const total = value?.totalTokens ?? (value?.inputTokens !== undefined && value.outputTokens !== undefined ? value.inputTokens + value.outputTokens : undefined);
  return total === undefined ? '未知' : `${compact(total)}${usage.status === 'unknown' ? ' + 未知' : ''}`;
}
function running() { return ['running', 'stopping'].includes(state?.job?.status); }
function buttons() {
  $('#start').disabled = pending || !state || running(); $('#stop').disabled = pending || state?.job?.status !== 'running';
  $('#start span:last-child').textContent = pending ? '正在提交…' : running() ? '实验运行中' : '启动实验';
}
function render() {
  const { runs, budget, config, job } = state;
  $('#tokens').textContent = compact(budget.knownTotalTokens);
  $('#tokens').title = `${number(budget.knownTotalTokens)} 已报告 tokens`;
  const percent = budget.knownTotalTokens / budget.warningThreshold * 100;
  $('#budget-caption').textContent = `报警线 ${compact(budget.warningThreshold)}`;
  $('#budget-percent').textContent = `${percent.toFixed(2)}%`;
  $('#budget-fill').style.width = `${Math.min(100, percent)}%`;
  $('.budget-track').setAttribute('aria-valuenow', Math.min(100, percent));
  $('.budget-metric').classList.toggle('warning', budget.warning);
  $('#unknown-note').textContent = budget.unknownRunCount ? `另有 ${budget.unknownRunCount} 份用量未知或不完整，当前为已知下限` : '输入 + 输出；缓存输入不重复累计';
  const summaries = runs.filter(row => row.summary).map(row => row.summary);
  const included = summaries.reduce((n, row) => n + row.score.includedCaseCount, 0);
  const matched = summaries.reduce((n, row) => n + row.score.matchedCaseCount, 0);
  const valid = summaries.reduce((n, row) => n + row.score.conditionalMatchRate.denominator, 0);
  $('#runs-count').textContent = number(summaries.length);
  $('#cases-count').textContent = `${included} 题纳入 · ${valid} 题有效回答${runs.length > summaries.length ? ` · ${runs.length - summaries.length} 份未完成` : ''}`;
  $('#match-rate').textContent = rate(matched, included);
  $('#match-fraction').textContent = included ? `${matched} / ${included} · 含失败与不匹配` : '尚无已归档评分';
  $('#nav-count').textContent = runs.length; $('#result-total').textContent = runs.length;
  $('#provider-model').textContent = config.model;
  $('#provider-route').textContent = config.provider === 'codex-cli' ? `Codex 订阅 · ${config.reasoningEffort}` : 'OpenAI-compatible API';
  $('#limit-time').textContent = `${config.maxRunMs / 1000}s`; $('#limit-turns').textContent = config.maxProviderTurns; $('#limit-tools').textContent = config.maxToolCalls;
  $('#job-badge').textContent = labels[job?.status] ?? '空闲';
  if (job) {
    $('#job-content').className = 'job-steps';
    $('#job-content').innerHTML = `<h3>${esc(labels[job.mode])} <span class="micro">${esc(job.model)}</span></h3><div class="job-time">${date(job.startedAt)} 开始${job.endedAt ? ` · ${date(job.endedAt)} 结束` : ''}</div>${job.steps.map((step, index) => `<div class="job-step"><span class="step-dot" aria-hidden="true">${step.status === 'completed' ? '✓' : index + 1}</span><span>${esc(labels[step.mode])}</span><span class="tag">${esc(labels[step.status])}</span></div>${step.error ? `<p class="job-desc">${esc(friendlyError(step.error))}</p>` : ''}`).join('')}<p class="job-desc">${job.status === 'running' ? '模型正在取证与决策，逐题结束后写入归档。' : job.status === 'stopping' ? '正在终止本次实验及子进程，请稍候。' : job.status === 'completed' ? '本次执行结束。有效回答、失败原因和匹配情况见结果详情；执行结束不等于验收通过。' : '保留已有归档，可查看实际结果或调整配置后重新运行。'}</p>`;
  }
  renderRuns(); buttons();
  if (budget.warning) message(`已达到 ${compact(budget.warningThreshold)} Token 报警线。当前已报告 ${number(budget.knownTotalTokens)}，实验不会自动停止。`);
}
function friendlyError(code) {
  return ({ arena_requires_clean_git_worktree: '源码存在未提交改动。请先完成代码提交，再启动可追溯实验。', mcp_connection_failed: 'MCP 工具连接失败，本次未生成完整结果。', arena_pinned_native_receipt_missing_or_ambiguous: '本机规则引擎未就绪，需要检查安装记录。', arena_run_failed: '实验未完成，请检查模型配置及本机运行环境。' })[code] ?? `实验未完成（${code}）`;
}
function renderRuns() {
  const rows = state.runs.filter(row => filter === 'all' || (filter === 'fault' ? row.manifest.controlledFault !== 'none' : row.manifest.rag.mode === filter && row.manifest.controlledFault === 'none'));
  if (!rows.length) { $('#results-body').innerHTML = `<div class="empty-state"><strong>${state.runs.length ? '该筛选下暂无记录' : '还没有实验结果'}</strong>${state.runs.length ? '试试其他筛选条件。' : '启动一次实验，结果将自动显示在这里。'}</div>`; return; }
  $('#results-body').innerHTML = `<table class="result-table"><thead><tr><th>运行 / 模式</th><th class="model-column">模型</th><th>执行结果</th><th>Mortal 匹配</th><th class="token-column">TOKENS</th><th class="time-column">耗时</th><th aria-label="操作"></th></tr></thead><tbody>${rows.map(row => {
    const summary = row.summary, m = row.manifest;
    return `<tr><td><div class="result-id">${esc(row.id.slice(0, 8))} <span class="tag">${m.controlledFault !== 'none' ? '故障' : m.rag.mode === 'local' ? 'Local' : 'Off'}</span></div><div class="result-date">${date(m.startedAt)}</div></td><td class="model-column result-model">${esc(m.coach.model)}<div class="result-date">${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</div></td><td><span class="tag">${!summary ? '归档未完成' : summary.terminalStatuses.completed === summary.selectedCaseCount ? '运行完成' : `${summary.terminalStatuses.completed}/${summary.selectedCaseCount} 完成`}</span>${summary?.toolFailureCount ? `<div class="result-date tool-warning">${summary.toolFailureCount} 次工具失败</div>` : ''}</td><td>${summary ? rate(summary.score.matchedCaseCount, summary.score.includedCaseCount) : '—'}<div class="result-date">${summary ? `${summary.score.matchedCaseCount}/${summary.score.includedCaseCount} 题` : '等待结果'}</div></td><td class="token-column">${tokenText(summary)}</td><td class="time-column">${summary ? `${(summary.elapsedMs / 1000).toFixed(1)}s` : '—'}</td><td><button class="text-button view-button" data-run="${row.id}" aria-label="查看实验 ${row.id.slice(0, 8)}">查看 ↗</button></td></tr>`;
  }).join('')}</tbody></table>`;
}
async function refresh() {
  try { state = await api('/api/state'); render(); $('#sync-status').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`; }
  catch { $('#sync-status').textContent = '本机服务未连接'; message('无法连接控制台服务，正在重试。已有归档不受影响。', true); }
}
function openSettings() {
  if (!state) return;
  const form = $('#settings-form');
  for (const [key, value] of Object.entries(state.config)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value;
  form.elements.apiKey.value = ''; form.dataset.clearKey = 'false'; $('#settings-error').hidden = true;
  $('#key-status').textContent = state.config.keyConfigured ? '本次进程已配置密钥' : '本次进程尚未配置密钥';
  providerFields(); $('#settings-dialog').showModal();
}
function providerFields() { const apiMode = $('#settings-form').elements.provider.value === 'openai-compatible'; $('#api-fields').hidden = !apiMode; $('#effort-field').hidden = apiMode; $('#subscription-note').hidden = apiMode; }
for (const id of ['#nav-settings', '#settings-top', '#settings-inline']) $(id).addEventListener('click', openSettings);
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => document.getElementById(button.dataset.close).close());
$('#settings-form').elements.provider.addEventListener('change', providerFields);
$('#clear-key').addEventListener('click', () => { $('#settings-form').dataset.clearKey = 'true'; $('#settings-form').elements.apiKey.value = ''; $('#key-status').textContent = '保存后清除本次进程的密钥'; });
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form));
  for (const key of ['tokenWarningThreshold', 'maxRunMs', 'maxProviderTurns', 'maxToolCalls', 'maxProviderOutputTokens']) data[key] = Number(data[key]);
  data.clearApiKey = form.dataset.clearKey === 'true'; const submit = form.querySelector('[type=submit]'); submit.disabled = true;
  try { await api('/api/config', data); form.elements.apiKey.value = ''; $('#settings-dialog').close(); message('配置已保存，将用于下一次实验。'); await refresh(); }
  catch (error) { $('#settings-error').textContent = error.message; $('#settings-error').hidden = false; $('#settings-error').tabIndex = -1; $('#settings-error').focus(); }
  finally { submit.disabled = false; }
});
$('#start').addEventListener('click', async () => {
  pending = true; buttons(); message('正在启动实验…');
  try { await api('/api/start', { mode: $('#experiment-mode').value }); message('实验已启动。可以离开详情页，运行不会因页面刷新而重复创建。'); await refresh(); }
  catch (error) { message(error.message, true); } finally { pending = false; buttons(); }
});
$('#stop').addEventListener('click', async () => {
  pending = true; buttons();
  try { await api('/api/stop', {}); message('已请求停止，正在等待实验子进程退出。'); await refresh(); }
  catch (error) { message(error.message, true); } finally { pending = false; buttons(); }
});
$('#experiment-mode').addEventListener('change', event => {
  $('#mode-hint').textContent = ({ compare: '使用同一组案例，依次运行关闭检索与本地检索两种模式。', local: '允许模型按需查询本地知识与真实 helper MCP。', off: '关闭知识检索，仍允许按需调用真实 helper MCP。', fault: '在模型首次调用 helper 时注入超时，观察恢复或实际失败。模型未查询时不宣称故障已触发。' })[event.target.value];
});
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = button.dataset.filter; for (const other of document.querySelectorAll('[data-filter]')) { other.classList.toggle('selected', other === button); other.setAttribute('aria-pressed', other === button); } renderRuns(); });
$('#results-body').addEventListener('click', async event => {
  const button = event.target.closest('[data-run]'); if (!button) return;
  button.disabled = true;
  try {
    selectedResult = await api(`/api/run/${button.dataset.run}`); const { manifest: m, summary: s, events } = selectedResult;
    $('#detail-title').textContent = `实验 ${selectedResult.id.slice(0, 8)}`;
    $('#detail-body').innerHTML = `<div class="detail-meta"><span>${date(m.startedAt)}</span><span>${esc(m.coach.model)} · ${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</span><span>RAG ${m.rag.mode}</span><span>代码 ${m.codeSha.slice(0, 8)}</span></div><div class="detail-stat"><div>有效回答<strong>${s ? `${s.score.conditionalMatchRate.denominator}/${s.selectedCaseCount}` : '—'}</strong></div><div>Mortal 匹配<strong>${s ? `${s.score.matchedCaseCount}/${s.score.includedCaseCount}` : '—'}</strong></div><div>Token 用量<strong>${tokenText(s)}</strong></div></div><p class="field-hint">开发样本；未进行专家质量验收。${s ? `Helper 查询 ${s.evidence.helperQueries} 次，RAG 查询 ${s.evidence.ragQueries} 次、命中 ${s.evidence.ragHits} 次。` : '本次归档未完成，不能据此判断成功。'}</p>${events.filter(item => item.type === 'case_run').map(item => { const r = item.result, answer = r.attempt.submission; return `<article class="case-detail"><h3>案例 ${item.caseOrdinal + 1} <span class="tag">${esc(labels[r.status] ?? r.status)}</span></h3><div class="detail-meta"><span>${r.providerTurnCount} 轮模型调用</span><span>${r.toolCallCount} 次工具调用</span><span>${(r.elapsedMs / 1000).toFixed(1)}s</span></div>${answer ? `<p>${esc(answer.rationale)}</p><div class="detail-meta"><span>动作 ${esc(answer.actionRef)}</span><span>${answer.sourceRefs.length} 个来源引用</span></div><p>${esc(answer.uncertainty)}</p>` : '<p>没有有效提交；该题仍保留在实验统计中。</p>'}</article>`; }).join('')}<details><summary>查看可离线复查的结构化结果</summary><pre>${esc(JSON.stringify(selectedResult, null, 2))}</pre></details><button id="download-result" class="quiet-button">下载本次结果 JSON</button>`;
    $('#download-result').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(selectedResult, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `arena-${selectedResult.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
    $('#result-dialog').showModal();
  } catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
await refresh();
setInterval(refresh, 2500);
