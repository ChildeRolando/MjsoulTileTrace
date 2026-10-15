const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => new Intl.NumberFormat('en-US').format(value);
const compact = value => value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : number(value);
const rate = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const labels = { running: '运行中', stopping: '正在停止', stopped: '已停止', completed: '执行完成', failed: '执行失败',
  timeout: '超时', provider_error: '模型调用失败', provider_unavailable: '模型不可用', cancelled: '已取消', budget_exhausted: '达到逐题预算',
  tool_failure: '工具失败', invalid_submission: '提交无效', label_binding_failure: '标签绑定失败', off: 'RAG Off', local: 'Local RAG', fault: '受控故障', compare: 'RAG 对照', catalog: '刷新题库' };
let state, filter = 'all', pending = false, selectedResult, detailSignature = '', detailCase = 0, catalogData;

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
  $('#refresh-bank').disabled = pending || !state || running(); $('#browse-bank').disabled = !state?.catalog;
  $('#start span:last-child').textContent = pending ? '正在提交…' : running() ? '实验运行中' : '启动实验';
}
function render() {
  const { runs, budget, config, job } = state;
  $('#bank-count').textContent = state.catalog ? `${state.catalog.availableCaseCount} 道开发题` : '题库待建立';
  $('#batch-hint').textContent = state.catalog ? `${state.catalog.availableCaseCount} 道真实案例 · ${state.catalog.developmentGames} 个开发牌局 · 非独立验收集。Off / Local 使用相同范围。` : '请先刷新题库；刷新只运行本机规则筛选，不调用模型。';
  for (const id of ['#batch-size', '#batch-start']) $(id).max = state.catalog?.availableCaseCount ?? 128;
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
    $('#job-content').innerHTML = `<h3>${esc(labels[job.mode])} <span class="micro">${job.mode === "catalog" ? "本机规则 · 无模型调用" : esc(job.model)}</span></h3><div class="job-time">${date(job.startedAt)} 开始${job.endedAt ? ` · ${date(job.endedAt)} 结束` : ''}</div>${job.steps.map((step, index) => `<div class="job-step"><span class="step-dot" aria-hidden="true">${step.status === 'completed' ? '✓' : index + 1}</span><span>${esc(labels[step.mode])}</span><span class="tag">${esc(labels[step.status])}</span></div>${step.error ? `<p class="job-desc">${esc(friendlyError(step.error))}</p>` : ''}`).join('')}<p class="job-desc">${job.status === 'running' ? (job.mode === 'catalog' ? '正在扫描真实牌谱与合法候选，不调用模型。' : '模型正在取证与决策，逐题结束后写入归档。') : job.status === 'stopping' ? '正在终止本次实验及子进程，请稍候。' : job.status === 'completed' ? (job.mode === 'catalog' ? '题库已更新，可浏览题目或设置本次范围。' : '本次执行结束。有效回答、失败原因和匹配情况见结果详情；执行结束不等于验收通过。') : '保留已有归档，可查看实际结果或调整配置后重新运行。'}</p>`;
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
  try { state = await api('/api/state'); render(); $('#sync-status').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    if ($('#result-dialog').open && $('#trace-auto')?.checked) await refreshDetail();
  }
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
  if (!$('#batch-size').reportValidity() || !$('#batch-start').reportValidity()) return;
  const maxCases = Number($('#batch-size').value), caseOffset = Number($('#batch-start').value) - 1;
  if (state.catalog && maxCases + caseOffset > state.catalog.availableCaseCount) { message('所选范围超出题库，请减少题量或调整起始题号。', true); return; }
  pending = true; buttons(); message('正在启动实验…');
  try { await api('/api/start', { mode: $('#experiment-mode').value, maxCases, caseOffset }); message(`实验已启动：题库第 ${caseOffset + 1}–${caseOffset + maxCases} 题。刷新页面不会重复启动。`); await refresh(); }
  catch (error) { message(error.message, true); } finally { pending = false; buttons(); }
});
$('#refresh-bank').addEventListener('click', async () => {
  pending = true; buttons();
  try { await api('/api/start', { mode: 'catalog' }); message('正在用本机规则建立题库，不会调用模型。'); await refresh(); }
  catch (error) { message(error.message, true); } finally { pending = false; buttons(); }
});
function renderCatalogCase() {
  const ordinal = Number($('#catalog-case').value), row = catalogData.cases[ordinal];
  $('#catalog-preview').innerHTML = `${observationView(row.observation)}${structured('catalog-case', '完整盲测输入（不含答案）', row.observation)}`;
}
$('#catalog-case').addEventListener('change', renderCatalogCase);
$('#browse-bank').addEventListener('click', async () => {
  try { catalogData = await api('/api/catalog');
    $('#catalog-note').textContent = `${catalogData.cases.length} 道真实决策 · ${catalogData.developmentGames} 个开发牌局。只预览当时可见的信息，不包含 Mortal 答案。`;
    $('#catalog-case').innerHTML = catalogData.cases.map((row, index) => `<option value="${index}">第 ${index + 1} 题 · ${esc(({ E: '东', S: '南', W: '西' })[row.observation.visibleState.roundWind])}${row.observation.visibleState.hand}局 · ${row.observation.candidates.length} 个候选</option>`).join('');
    renderCatalogCase(); $('#catalog-dialog').showModal();
  } catch (error) { message(error.message, true); }
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
function tileText(tile) {
  const id = typeof tile === 'string' ? tile : tile?.id;
  if (!id) return '未知牌';
  return `${tile?.red ? '赤' : ''}${({ '1z': '东', '2z': '南', '3z': '西', '4z': '北', '5z': '白', '6z': '发', '7z': '中' })[id] ?? id.replace(/([mps])$/, suit => ({ m: '万', p: '筒', s: '索' })[suit])}`;
}
function actionText(ref) {
  try { const value = JSON.parse(decodeURIComponent(ref.slice('action:v1:'.length)));
    if (ref.startsWith('action:v1:') && value[0] === 'discard') return `${value[2] === 'tsumogiri' ? '摸切' : '手切'} ${tileText({ id: value[1][0], red: value[1][1] })}`;
  } catch { /* old or unknown action stays inspectable in structured data */ }
  return '查看动作原始记录';
}
function structured(key, title, value) {
  return `<details data-detail-key="${esc(key)}"><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(value, null, 2) ?? '未记录')}</pre></details>`;
}
function observationView(observation) {
  const state = observation.visibleState;
  return `<div class="observation-summary"><p><b>${esc(({ E: '东', S: '南', W: '西' })[state.roundWind])}${state.hand}局 · ${state.honba}本场</b> · 剩余摸牌 ${state.remainingDraws ?? '未知'}</p><p>手牌：${state.self.concealedTiles.map(tile => esc(tileText(tile))).join(' · ')}</p><p>当前摸牌：${state.self.currentDraw ? esc(tileText(state.self.currentDraw.tile)) : '无'}　宝牌指示：${state.doraIndicators.map(tile => esc(tileText(tile))).join(' · ') || '无'}</p><p class="field-hint">候选：${observation.candidates.map(candidate => esc(actionText(candidate.actionRef))).join(' / ')}</p></div>`;
}
function traceEvent(event, index, ordinal, events) {
  const diagnostic = `${event.failureCode ? `<p class="tool-warning">错误码：${esc(event.failureCode)}</p>` : ''}${event.reconnectCount ? `<p class="field-hint">CLI 连接重试 ${event.reconnectCount} 次 · 同一进程内等待最终结果</p>` : ''}`;
  const key = `${ordinal}-${index}`, time = event.elapsedMs === undefined ? '' : ` · ${(event.elapsedMs / 1000).toFixed(2)}s`;
  if (event.type === 'run_started') return `<li class="trace-item"><div class="trace-heading">开始案例 <span>${esc(date(event.startedAt))}</span></div>${event.observation ? `${observationView(event.observation)}${structured(key, '展开完整案例输入', event.observation)}` : '<p class="field-hint">旧归档未记录案例输入。</p>'}</li>`;
  if (event.type === 'provider_turn') return `<li class="trace-item"><div class="trace-heading">第 ${event.turn} 轮模型调用 <span>${esc(labels[event.result] ?? (event.result === 'tool_call' ? '选择操作' : event.result))}${time}</span></div>${diagnostic}<div class="decision-summary"><span class="micro">公开决策摘要</span><p>${esc(event.decisionSummary ?? '本轮没有已记录的公开摘要（调用失败、旧归档或接口未提供）。')}</p></div><p class="field-hint">${event.toolName ? `选择 ${esc(event.toolName)} · ` : ''}${event.usage ? `输入 ${event.usage.inputTokens === undefined ? '未知' : number(event.usage.inputTokens)} / 输出 ${event.usage.outputTokens === undefined ? '未知' : number(event.usage.outputTokens)} tokens` : '本轮 token 用量未报告'} · 输入 ${number(event.inputBytes)} bytes${event.outputBytes === undefined ? '' : ` / 输出 ${number(event.outputBytes)} bytes`}</p></li>`;
  if (event.type === 'tool_call') return `<li class="trace-item"><div class="trace-heading">工具调用 #${event.ordinal} <span>第 ${event.turn} 轮${time}</span></div><strong class="tool-name">${esc(event.toolName)}</strong>${event.request === null ? '<p class="tool-warning">请求未通过校验；未保留未经验证的原始参数。</p>' : structured(key, '查看完整调用参数', event.request)}</li>`;
  if (event.type === 'tool_result') {
    const call = events.find(row => row.type === 'tool_call' && row.ordinal === event.ordinal);
    const duration = call?.elapsedMs !== undefined && event.elapsedMs !== undefined ? ` · 耗时 ${event.elapsedMs - call.elapsedMs}ms` : '';
    return `<li class="trace-item ${event.status === 'error' ? 'trace-error' : ''}"><div class="trace-heading">工具返回 #${event.ordinal} <span>${event.status === 'ok' ? '成功' : '失败'}${time}${duration}</span></div><strong class="tool-name">${esc(event.toolName)}</strong>${event.code ? `<p class="tool-warning">${esc(event.code)}</p>` : ''}${event.result === undefined ? '<p class="field-hint">本次没有返回可用的数据。</p>' : structured(key, '查看完整返回结果', event.result)}</li>`;
  }
  if (event.type === 'submission_locked') { const answer = event.submission;
    return `<li class="trace-item"><div class="trace-heading">最终提交 <span>已锁定</span></div><strong class="answer-action">${esc(actionText(answer.actionRef))}</strong><p>${esc(answer.rationale)}</p>${answer.mainAlternative ? `<p><b>备选：${esc(actionText(answer.mainAlternative.actionRef))}</b><br>${esc(answer.mainAlternative.reasonNotChosen)}</p>` : ''}<p><b>不确定性：</b>${esc(answer.uncertainty || '未填写')}</p><p class="field-hint">${answer.evidenceRefs.length} 个证据引用 · ${answer.sourceRefs.length} 个来源引用</p>${structured(key, '查看提交及全部引用', answer)}</li>`;
  }
  if (event.type === 'submission_rejected') return `<li class="trace-item trace-error"><div class="trace-heading">提交被拒绝</div><p>${esc(({ schema_invalid: '提交格式无效', case_mismatch: '案例绑定不符', action_not_offered: '选择了候选集以外的动作', alternative_not_offered: '备选动作不在候选集中', reference_not_observed: '引用了未实际取得的证据或来源' })[event.reason] ?? event.reason)}</p><code>${esc(event.reason)}</code></li>`;
  return `<li class="trace-item"><div class="trace-heading">案例执行结束 <span>${esc(labels[event.status] ?? event.status)}${time}</span></div></li>`;
}
function renderDetail(data) {
  const { manifest: m, summary: s, events, trace = [] } = data;
  const finalized = new Map(events.filter(item => item.type === 'case_run').map(item => [item.caseOrdinal, item.result]));
  const live = new Map(); for (const row of trace) { if (!live.has(row.caseOrdinal)) live.set(row.caseOrdinal, []); live.get(row.caseOrdinal).push(row.event); }
  const body = $('#detail-body'), dialog = $('#result-dialog');
  const openKeys = new Set([...body.querySelectorAll('details[open]')].map(node => node.dataset.detailKey));
  const scroll = dialog.scrollTop, activeKey = document.activeElement?.closest('details')?.dataset.detailKey, focusedId = document.activeElement?.id;
  const auto = $('#trace-auto')?.checked ?? true;
  const signature = JSON.stringify(data);
  selectedResult = data;
  if (detailSignature === signature) return;
  detailSignature = signature;
  $('#detail-title').textContent = `实验 ${data.id.slice(0, 8)}`;
  body.innerHTML = `<div class="detail-meta"><span>${date(m.startedAt)}</span><span>${esc(m.coach.model)} · ${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</span><span>RAG ${esc(m.rag.mode)}</span><span>代码 ${m.codeSha.slice(0, 8)}</span></div><div class="detail-stat"><div>有效回答<strong>${s ? `${s.score.conditionalMatchRate.denominator}/${s.selectedCaseCount}` : '待归档'}</strong></div><div>Mortal 匹配<strong>${s ? `${s.score.matchedCaseCount}/${s.score.includedCaseCount}` : '待评分'}</strong></div><div>Token 用量<strong>${tokenText(s)}</strong></div></div><p class="field-hint">开发样本；未进行专家质量验收。${s ? `Helper 查询 ${s.evidence.helperQueries} 次，RAG 查询 ${s.evidence.ragQueries} 次、命中 ${s.evidence.ragHits} 次。` : '归档尚未完成，保留已发生的步骤，不据此判断成功。'}</p><div class="trace-controls"><label><input type="checkbox" id="trace-auto" ${auto ? 'checked' : ''}> 自动刷新过程</label><button id="refresh-detail" class="quiet-button">刷新过程</button><span id="trace-sync" role="status"></span></div><p class="field-hint">展示公开摘要和实际工具记录；不包含模型内部私有思维链。工具参数与返回可完整展开。</p>${m.dataset.selected.length > 10 ? `<label>查看案例<select id="detail-case">${m.dataset.selected.map((row, ordinal) => `<option value="${ordinal}" ${ordinal === detailCase ? "selected" : ""}>案例 ${ordinal + 1} · 题库第 ${(m.dataset.selection?.offset ?? 0) + ordinal + 1} 题</option>`).join("")}</select></label>` : ""}${m.dataset.selected.map((item, ordinal) => {
    if (m.dataset.selected.length > 10 && ordinal !== detailCase) return "";
    const result = finalized.get(ordinal), records = result?.events ?? live.get(ordinal) ?? [];
    const score = result?.score.cases[0];
    return `<article class="case-detail"><h3>案例 ${ordinal + 1} <span class="tag">${result ? esc(labels[result.status] ?? result.status) : records.length ? '尚无最终结果' : '尚无执行记录'}</span></h3><div class="detail-meta"><span>${item.candidateCount} 个候选动作</span>${result ? `<span>${result.providerTurnCount} 轮模型调用 · ${result.toolCallCount} 次工具调用 · ${(result.elapsedMs / 1000).toFixed(1)}s</span><span>${score?.status === 'matched' ? 'Mortal 匹配' : score?.status === 'not_matched' ? 'Mortal 不匹配' : '未得到匹配评分'}</span>` : ''}</div>${records.length ? `<ol class="trace-list">${records.map((row, index) => traceEvent(row, index, ordinal, records)).join('')}</ol>` : '<p class="field-hint">尚未收到本题事件。停止或中断的实验可能不会继续产生记录。</p>'}${result && !records.some(row => row.type === 'submission_locked') && result.attempt.submission ? structured(`${ordinal}-legacy-answer`, '旧归档中的最终提交', result.attempt.submission) : ''}</article>`;
  }).join('')}${structured('archive', '查看运行元数据与汇总', { manifest: m, summary: s })}<button id="download-result" class="quiet-button">下载本次结果 JSON</button>`;
  for (const node of body.querySelectorAll('details')) { node.open = openKeys.has(node.dataset.detailKey); if (activeKey === node.dataset.detailKey) node.querySelector('summary').focus({ preventScroll: true }); }
  if (focusedId && body.querySelector(`#${CSS.escape(focusedId)}`)) body.querySelector(`#${CSS.escape(focusedId)}`).focus({ preventScroll: true });
  dialog.scrollTop = scroll;
  $('#detail-case')?.addEventListener('change', event => { detailCase = Number(event.target.value); detailSignature = ''; renderDetail(selectedResult); });
  $('#refresh-detail').addEventListener('click', () => refreshDetail().catch(() => { $('#trace-sync').textContent = '刷新失败，请重试'; }));
  $('#download-result').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(selectedResult, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `arena-${selectedResult.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
let refreshingDetail = false;
async function refreshDetail() {
  if (!selectedResult || refreshingDetail) return;
  refreshingDetail = true;
  const id = selectedResult.id;
  try { const data = await api(`/api/run/${id}`); if (!$('#result-dialog').open || selectedResult.id !== id) return; renderDetail(data); $('#trace-sync').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`; }
  finally { refreshingDetail = false; }
}
$('#results-body').addEventListener('click', async event => {
  const button = event.target.closest('[data-run]'); if (!button) return;
  button.disabled = true;
  try {
    detailCase = 0; detailSignature = ''; $('#detail-body').innerHTML = '';
    renderDetail(await api(`/api/run/${button.dataset.run}`));
    $('#result-dialog').showModal();
    $('#result-dialog').scrollTop = 0;
  } catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
await refresh();
setInterval(refresh, 2500);
