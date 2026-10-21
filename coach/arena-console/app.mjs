import { runMetrics, aggregateMetrics, sortedTiles, tileAsset, experimentTypeForDataset, experimentLabels } from '/presentation.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const number = value => new Intl.NumberFormat('en-US').format(value);
const compact = value => value >= 1e6 ? `${(value / 1e6).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : number(value);
const rate = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
const date = value => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const labels = { running: '运行中', stopping: '正在停止', stopped: '已停止', completed: '执行完成', failed: '执行失败',
  timeout: '超时', provider_error: '模型调用失败', provider_unavailable: '模型不可用', cancelled: '已取消', budget_exhausted: '达到逐题预算',
  tool_failure: '工具失败', invalid_submission: '提交无效', label_binding_failure: '标签绑定失败', off: 'RAG Off', local: 'Local RAG', fault: '受控故障', compare: 'RAG 对照', catalog: '刷新题库', generate: '生成题库', 'mortal-details': '补算 Mortal 评分' };
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
const generatedBank = () => state?.generatedBanks?.find(b => b.bankId === $('#generated-bank').value);
const selectedBank = () => $('#experiment-type').value === 'generated' ? generatedBank() : state?.catalogs?.[$('#experiment-type').value];
function renderBanks() {
  const select = $('#generated-bank'), banks = state.generatedBanks ?? [], previous = select.value;
  const signature = JSON.stringify(banks.map(b => [b.bankId, b.ready, b.availableCaseCount]));
  if (select.dataset.signature !== signature) {
    select.innerHTML = banks.length ? banks.map(b => `<option value="${esc(b.bankId)}">${esc(b.name)} · ${b.ready ? `${b.availableCaseCount}/${b.options.count} 题` : '未完成'} · 种子 ${b.options.seed} · ${b.createdAt ? date(b.createdAt) : b.bankId.slice(0, 8)}</option>`).join('') : '<option value="">尚无生成批次</option>';
    if (banks.some(b => b.bankId === previous)) select.value = previous;
    select.dataset.signature = signature;
  }
  if (requestedBank && banks.some(b => b.bankId === requestedBank)) { select.value = requestedBank; requestedBank = null; $('#batch-start').value = 1; $('#batch-size').value = Math.max(1, Math.min(10, generatedBank()?.availableCaseCount ?? 10)); }
  $('#generated-bank-field').hidden = $('#experiment-type').value !== 'generated';
  const bank = generatedBank(), info = bank?.generated;
  $('#resume-generation').hidden = !bank || bank.ready;
  $('#generation-summary').textContent = info ? `${info.status === 'complete' ? '目标已完成' : '预算已耗尽'} · ${bank.availableCaseCount}/${info.requested} 题 · ${info.attempts} 次尝试 · ${info.sourceGroups} 个来源组。${Object.entries(info.failures).filter(([key]) => key !== 'accepted').map(([key, count]) => `${generationReason(key)} ${count}`).join('；')}` : bank ? '批次尚未发布，可继续生成；已完成样本保留在本机归档。' : '生成后可在此选择题库。';
}
function generationReason(code) { return ({ outside_refinement_selection: '不满足题型或弃牌窗口', over_quota: '超出目标', duplicate: '重复局面', accepted: '纳入', construction_failed: '构造失败' })[code] ?? code; }

function buttons() {
  $('#start').disabled = pending || !state || running() || !selectedBank()?.ready || !selectedBank()?.availableCaseCount; $('#stop').disabled = pending || state?.job?.status !== 'running';
  for (const id of ['#generate-bank', '#resume-generation', '#generated-bank', '#generation-preset', '#generation-count', '#generation-seed', '#generation-time']) $(id).disabled = pending || !state || running();
  $('#experiment-type').disabled = pending || running();
  $('#refresh-bank').disabled = pending || !state || running(); $('#browse-bank').disabled = !selectedBank()?.ready || !selectedBank()?.availableCaseCount;
  $('#start span:last-child').textContent = pending ? '正在提交…' : running() ? '实验运行中' : '启动实验';
}
function render() {
  renderBanks();
  const { runs, budget, config, job } = state;
  const bank = selectedBank(), resultType = $('#results-type').value;
  $('#type-hint').textContent = bank?.name ?? bank?.description ?? '按场面分组，保留完整公开上下文。请刷新题库。';
  $('#bank-count').textContent = bank?.ready ? `${bank.availableCaseCount} 道${experimentLabels[$('#experiment-type').value]}` : '题库待建立';
  $('#batch-hint').textContent = $('#experiment-type').value === 'generated' ? '合成开发题库；不计为真实完整牌局或独立验收集。Off / Local 使用同一批题。' : bank?.ready ? `${bank.availableCaseCount} 道真实案例 · ${bank.developmentGames} 个开发牌局 · 非独立验收集。Off / Local 使用该类型相同范围。` : '请先刷新题库；刷新只运行本机规则筛选，不调用模型。';
  for (const id of ['#batch-size', '#batch-start']) $(id).max = Math.max(1, bank?.availableCaseCount ?? 128);
  $('#tokens').textContent = compact(budget.knownTotalTokens);
  $('#tokens').title = `${number(budget.knownTotalTokens)} 已报告 tokens`;
  const percent = budget.knownTotalTokens / budget.warningThreshold * 100;
  $('#budget-caption').textContent = `报警线 ${compact(budget.warningThreshold)}`;
  $('#budget-percent').textContent = `${percent.toFixed(2)}%`;
  $('#budget-fill').style.width = `${Math.min(100, percent)}%`;
  $('.budget-track').setAttribute('aria-valuenow', Math.min(100, percent));
  $('.budget-metric').classList.toggle('warning', budget.warning);
  $('#unknown-note').textContent = budget.unknownRunCount ? `另有 ${budget.unknownRunCount} 份用量未知或不完整，当前为已知下限` : '模型输入 + 模型输出；缓存输入为输入子集';
  const metrics = aggregateMetrics(runs, resultType);
  $('#metric-scope').textContent = `当前统计：${experimentLabels[resultType]}。看板成功率与匹配率仅统计此类型；累计 Token 预算覆盖所有类型。`;
  $('#overview-scope').textContent = `当前看板：${experimentLabels[resultType]} · 累计模型用量覆盖所有类型`;
  $('#cases-count').title = experimentLabels[resultType];
  $('#runs-count').textContent = number(metrics.archived);
  $('#cases-count').textContent = `${metrics.selected} 题纳入 · ${metrics.succeeded} 题执行成功${metrics.incomplete ? ` · ${metrics.incomplete} 份未完成` : ''}`;
  $('#execution-rate').textContent = rate(metrics.succeeded, metrics.selected);
  $('#execution-fraction').textContent = `${metrics.succeeded} / ${metrics.selected} 题执行成功`;
  $('#match-rate').textContent = rate(metrics.matched, metrics.succeeded);
  $('#match-fraction').textContent = metrics.succeeded ? `${metrics.matched} / ${metrics.succeeded} 个成功案例${metrics.missingLabels ? ` · ${metrics.missingLabels} 题缺少标签` : ''}` : '尚无成功案例';
  $('#nav-count').textContent = runs.length; $('#result-total').textContent = runs.filter(run => experimentTypeForDataset(run.manifest.dataset.id) === resultType).length;
  $('#provider-model').textContent = config.model;
  $('#provider-route').textContent = config.provider === 'codex-cli' ? `Codex 订阅 · ${config.reasoningEffort}` : 'OpenAI-compatible API';
  $('#limit-time').textContent = `${config.maxRunMs / 1000}s`; $('#limit-turns').textContent = config.maxProviderTurns; $('#limit-tools').textContent = config.maxToolCalls;
  $('#job-badge').textContent = labels[job?.status] ?? '空闲';
  if (job) {
    $('#job-content').className = 'job-steps';
    $('#job-content').innerHTML = `<h3>${['catalog', 'generate'].includes(job.mode) ? "" : esc(experimentLabels[job.experimentType] ?? "旧版混合题库") + " · "}${esc(labels[job.mode])} <span class="micro">${['catalog', 'generate'].includes(job.mode) ? "本机规则 · 无模型调用" : esc(job.model)}</span></h3><div class="job-time">${date(job.startedAt)} 开始${job.endedAt ? ` · ${date(job.endedAt)} 结束` : ''}</div>${job.steps.map((step, index) => `<div class="job-step"><span class="step-dot" aria-hidden="true">${step.status === 'completed' ? '✓' : index + 1}</span><span>${esc(labels[step.mode])}</span><span class="tag">${esc(labels[step.status])}</span></div>${step.error ? `<p class="job-desc">${esc(friendlyError(step.error))}</p>` : ''}`).join('')}<p class="job-desc">${job.status === 'running' ? (job.mode === 'generate' ? '正在构造合法局面并筛选题型；可停止，随后继续同一批次。' : job.mode === 'catalog' ? '正在扫描真实牌谱与合法候选，不调用模型。' : '模型正在取证与决策，逐题结束后写入归档。') : job.status === 'stopping' ? '正在终止本次实验及子进程，请稍候。' : job.status === 'completed' ? (job.mode === 'generate' ? '生成已结束。请选择该批题库查看实际题量与缺额，再开始评测。' : job.mode === 'catalog' ? '题库已更新，可浏览题目或设置本次范围。' : '本次执行结束。有效回答、失败原因和匹配情况见结果详情；执行结束不等于验收通过。') : '保留已有归档，可查看实际结果或调整配置后重新运行。'}</p>`;
  }
  renderRuns(); buttons();
  if (budget.warning) message(`已达到 ${compact(budget.warningThreshold)} Token 报警线。当前已报告 ${number(budget.knownTotalTokens)}，实验不会自动停止。`);
}
function friendlyError(code) {
  return ({ arena_generation_resume_identity_mismatch: '当前代码或配置与原生成批次不同。请在原版本继续，或新建一个批次。', archive_identity_mismatch: '原生成批次的引擎版本已变化，请新建一个批次。', lab_native_unavailable_run_build_libriichi_rule_native: '本机题库构造引擎尚未准备好，请按 Question Lab 安装说明准备原生资源。', arena_generated_candidate_mismatch: '当前引擎的合法候选与已保存题库不同，本次评测已停止。', arena_requires_clean_git_worktree: '源码存在未提交改动。请先完成代码提交，再启动可追溯实验。', mcp_connection_failed: 'MCP 工具连接失败，本次未生成完整结果。', arena_pinned_native_receipt_missing_or_ambiguous: '本机规则引擎未就绪，需要检查安装记录。', arena_run_failed: '实验未完成，请检查模型配置及本机运行环境。' })[code] ?? `实验未完成（${code}）`;
}
function renderRuns() {
  const rows = state.runs.filter(row => experimentTypeForDataset(row.manifest.dataset.id) === $('#results-type').value)
    .filter(row => filter === 'all' || (filter === 'fault' ? row.manifest.controlledFault !== 'none' : row.manifest.rag.mode === filter && row.manifest.controlledFault === 'none'));
  if (!rows.length) { $('#results-body').innerHTML = `<div class="empty-state"><strong>${state.runs.length ? '该筛选下暂无记录' : '还没有实验结果'}</strong>${state.runs.length ? '试试其他筛选条件。' : '启动一次实验，结果将自动显示在这里。'}</div>`; return; }
  $('#results-body').innerHTML = `<table class="result-table"><thead><tr><th>运行 / 模式</th><th class="model-column">模型</th><th>执行成功率</th><th>Mortal 匹配率</th><th class="token-column">TOKENS</th><th class="time-column">耗时</th><th aria-label="操作"></th></tr></thead><tbody>${rows.map(row => {
    const summary = row.summary, m = row.manifest, metrics = runMetrics(summary);
    return `<tr><td><div class="result-id">${esc(row.id.slice(0, 8))} <span class="tag">${m.controlledFault !== 'none' ? '故障' : m.rag.mode === 'local' ? 'Local' : 'Off'}</span></div><div class="result-date">${date(m.startedAt)}</div></td><td class="model-column result-model">${esc(m.coach.model)}<div class="result-date">${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</div></td><td><span class="tag">${!metrics ? '归档未完成' : rate(metrics.succeeded, metrics.selected)}</span>${metrics ? `<div class="result-date">${metrics.succeeded}/${metrics.selected} 执行成功</div>` : ''}${summary?.toolFailureCount ? `<div class="result-date tool-warning">${summary.toolFailureCount} 次工具失败</div>` : ''}</td><td>${metrics ? rate(metrics.matched, metrics.succeeded) : '—'}<div class="result-date">${summary ? `${metrics.matched}/${metrics.succeeded} 成功案例${metrics.missingLabels ? ` · ${metrics.missingLabels} 缺标签` : ''}` : '等待结果'}</div></td><td class="token-column">${tokenText(summary)}</td><td class="time-column">${summary ? `${(summary.elapsedMs / 1000).toFixed(1)}s` : '—'}</td><td><button class="text-button view-button" data-run="${row.id}" aria-label="查看实验 ${row.id.slice(0, 8)}">查看 ↗</button></td></tr>`;
  }).join('')}</tbody></table>`;
}
async function refresh() {
  try { const firstLoad = !state; state = await api('/api/state');
    if (firstLoad && state.job?.experimentType === 'generated') {
      $('#experiment-type').value = 'generated'; $('#results-type').value = 'generated'; requestedBank = state.job.bankId;
    }
    render(); $('#sync-status').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
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
  if (selectedBank() && maxCases + caseOffset > selectedBank().availableCaseCount) { message('所选范围超出题库，请减少题量或调整起始题号。', true); return; }
  pending = true; buttons(); message('正在启动实验…');
  try { await api('/api/start', { mode: $('#experiment-mode').value, experimentType: $('#experiment-type').value, ...($('#experiment-type').value === 'generated' ? { bankId: $('#generated-bank').value } : {}), maxCases, caseOffset }); message(`${experimentLabels[$('#experiment-type').value]}已启动：题库第 ${caseOffset + 1}–${caseOffset + maxCases} 题。刷新页面不会重复启动。`); await refresh(); }
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
  try { catalogData = await api(`/api/catalog?type=${$('#experiment-type').value}&bank=${encodeURIComponent($('#generated-bank').value)}`);
    $('#catalog-title').textContent = $('#experiment-type').value === 'generated' ? (generatedBank()?.name ?? '生成题库') : `${experimentLabels[$('#experiment-type').value]}题库`;
    $('#catalog-note').textContent = catalogData.generated ? `${catalogData.cases.length} 道合法合成题 · 种子 ${catalogData.generated.seed} · 开发资料。预览不含 Mortal 答案。` : `${catalogData.cases.length} 道真实决策 · ${catalogData.developmentGames} 个开发牌局。只预览当时可见的信息，不包含 Mortal 答案。`;
    $('#catalog-case').innerHTML = catalogData.cases.map((row, index) => `<option value="${index}">第 ${index + 1} 题 · ${esc(({ E: '东', S: '南', W: '西' })[row.observation.visibleState.roundWind])}${row.observation.visibleState.hand}局 · ${row.observation.candidates.length} 个候选</option>`).join('');
    renderCatalogCase(); $('#catalog-dialog').showModal();
  } catch (error) { message(error.message, true); }
});
async function startGeneration(resume = false) {
  if (!resume && !$('#generation-form').reportValidity()) return;
  pending = true; buttons();
  try {
    const selection = resume ? { bankId: $('#generated-bank').value } : { generation: {
      preset: $('#generation-preset').value, count: Number($('#generation-count').value), seed: Number($('#generation-seed').value), timeLimitSeconds: Number($('#generation-time').value) } };
    const job = await api('/api/start', { mode: 'generate', ...selection });
    $('#experiment-type').value = 'generated'; $('#results-type').value = 'generated';
    message('已开始生成。预算耗尽会保留部分题目，不会自动调用 Coach 模型。');
    await refresh();
    // The child may not have written its request yet; remember the requested bank for the next poll.
    requestedBank = job.bankId;
  } catch (error) { message(error.message, true); }
  finally { pending = false; buttons(); }
}
let requestedBank;
$('#generation-form').addEventListener('submit', event => { event.preventDefault(); void startGeneration(); });
$('#resume-generation').addEventListener('click', () => startGeneration(true));
$('#generated-bank').addEventListener('change', () => { $('#batch-start').value = 1; $('#batch-size').value = Math.max(1, Math.min(10, generatedBank()?.availableCaseCount ?? 10)); render(); });
$('#experiment-type').addEventListener('change', () => {
  $('#batch-start').value = 1;
  $('#batch-size').value = Math.max(1, Math.min(10, selectedBank()?.availableCaseCount ?? 10));
  $('#results-type').value = $('#experiment-type').value;
  render();
});
$('#results-type').addEventListener('change', render);
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
function tileImages(tiles, label) {
  return `<div class="tile-group"><span class="tile-label">${label}</span><div class="tile-row" role="group" aria-label="${label}">${tiles.map(tile => {
    const asset = tileAsset(tile), text = esc(tileText(tile));
    return asset ? `<img class="mahjong-tile" src="${asset}" alt="${text}" title="${text}" width="36" height="48">` : `<span>${text}</span>`;
  }).join('') || '<span class="field-hint">无</span>'}</div></div>`;
}
function observationView(observation) {
  const state = observation.visibleState;
  return `<div class="observation-summary"><p><b>${esc(({ E: '东', S: '南', W: '西' })[state.roundWind])}${state.hand}局 · ${state.honba}本场</b> · 供托 ${state.riichiSticks} · 剩余摸牌 ${state.remainingDraws ?? '未知'}</p>${tileImages(sortedTiles(state.self.concealedTiles), '手牌（已理牌）')}<div class="visible-tiles">${tileImages(state.self.currentDraw ? [state.self.currentDraw.tile] : [], '当前摸牌')}${tileImages(state.doraIndicators, '宝牌指示')}</div>${publicTableView(observation)}<p class="field-hint">候选：${observation.candidates.map(candidate => esc(actionText(candidate.actionRef))).join(' / ')}</p></div>`;
}
const completenessText = value => ({ complete: '完整', partial: '部分', unknown: '未知', missing: '缺失' })[value] ?? value;
function publicTableView(observation) {
  const state = observation.visibleState, self = observation.decision.selfActor;
  const wind = { E: '东', S: '南', W: '西', N: '北' };
  const relative = ['自家', '下家', '对家', '上家'];
  const meldNames = { chi: '吃', pon: '碰', daiminkan: '大明杠', ankan: '暗杠', kakan: '加杠' };
  return `<section class="public-table" aria-label="四家公开场面"><h4>四家公开场面</h4><p class="field-hint">牌河按出牌顺序排列；↓ 为摸切，红色边框为立直宣言牌，取走标记表示该牌已被鸣走。</p><div class="table-players">${Array.from({ length: 4 }, (_, offset) => {
    const actor = (self + offset) % 4, riichi = state.riichiStates.find(row => row.actor === actor);
    const melds = state.melds.filter(row => row.actor === actor);
    return `<article class="table-player ${riichi?.status !== 'none' ? 'has-riichi' : ''}"><h5>${relative[offset]} · ${wind[state.seatWinds[actor]] ?? '未知'}家 ${actor === state.dealer ? '· 庄' : ''}<span>${number(state.scores[actor])} 点 · ${riichi?.status === 'accepted' ? '立直成立' : riichi?.status === 'declared' ? '立直宣言' : riichi?.status === 'none' ? '未立直' : '立直状态未知'}</span></h5><div class="river-tiles" aria-label="${relative[offset]}牌河">${state.rivers[actor].map(discard => `<span class="river-tile ${discard.riichiDeclarationRef ? 'riichi-discard' : ''}"><img src="${tileAsset(discard.tile)}" alt="${esc(tileText(discard.tile))}${discard.discardMode === 'tsumogiri' ? '，摸切' : '，手切'}${discard.calledByRef ? '，已被鸣走' : ''}${discard.riichiDeclarationRef ? '，立直宣言牌' : ''}" width="24" height="32"><small>${discard.calledByRef ? '取走' : discard.discardMode === 'tsumogiri' ? '↓' : ''}</small></span>`).join('') || '<span class="field-hint">尚无弃牌</span>'}</div><div class="player-melds">${melds.map(meld => {
      const tiles = meld.kind === 'ankan' ? meld.tiles : [...meld.consumedTiles, meld.calledTile, ...(meld.kind === 'kakan' ? [meld.addedTile] : [])];
      return tileImages(tiles, meldNames[meld.kind]);
    }).join('') || '<span class="field-hint">无副露／杠</span>'}</div></article>`;
  }).join('')}</div><p class="field-hint">信息完整性：牌河 ${esc(completenessText(state.completeness.rivers))} · 鸣牌 ${esc(completenessText(state.completeness.melds))} · 分数 ${esc(completenessText(state.completeness.scores))}</p></section>`;
}
function matchBadge(score) {
  return score?.status === 'matched' ? '<span class="match-badge is-match">Mortal 匹配</span>' : score?.status === 'not_matched' ? '<span class="match-badge is-mismatch">Mortal 不匹配</span>' : '<span class="match-badge">未评分</span>';
}
function usageCount(value, unit) { return value === undefined ? '未报告' : `${number(value)} ${unit}`; }
function modelUsageView(event) {
  const usage = event.usage;
  return `<section class="usage-scope" aria-label="整轮模型用量"><h4>整轮模型用量 <span>模型报告 · tokens</span></h4><dl><div><dt>模型输入</dt><dd>${usageCount(usage?.inputTokens, 'tokens')}</dd></div><div class="cache-usage"><dt>其中缓存输入</dt><dd>${usageCount(usage?.cachedInputTokens, 'tokens')}</dd></div><div><dt>模型输出</dt><dd>${usageCount(usage?.outputTokens, 'tokens')}</dd></div></dl><p>缓存输入已包含在模型输入中，不重复累加。这里统计整轮模型处理的用量，与下方 Arena 载荷的范围和单位不同。</p></section><section class="usage-scope payload-scope" aria-label="Arena 请求／响应大小"><h4>Arena 请求／响应大小 <span>Arena 侧记录 · bytes</span></h4><dl><div><dt>Arena 请求大小</dt><dd>${usageCount(event.inputBytes, 'bytes')}</dd></div><div><dt>Arena 响应大小</dt><dd>${usageCount(event.outputBytes, 'bytes')}</dd></div></dl><p>Arena 协议请求与结构化响应的载荷大小；不等于整轮模型上下文，也不是 Token 用量。</p></section>`;
}
function traceEvent(event, index, ordinal, events) {
  const diagnostic = `${event.failureCode ? `<p class="tool-warning">错误码：${esc(event.failureCode)}</p>` : ''}${event.reconnectCount ? `<p class="field-hint">CLI 连接重试 ${event.reconnectCount} 次 · 同一进程内等待最终结果</p>` : ''}`;
  const key = `${ordinal}-${index}`, time = event.elapsedMs === undefined ? '' : ` · ${(event.elapsedMs / 1000).toFixed(2)}s`;
  if (event.type === 'run_started') return `<li class="trace-item"><div class="trace-heading">开始案例 <span>${esc(date(event.startedAt))}</span></div>${event.observation ? `${observationView(event.observation)}${structured(key, '展开完整案例输入', event.observation)}` : '<p class="field-hint">旧归档未记录案例输入。</p>'}</li>`;
  if (event.type === 'provider_turn') return `<li class="trace-item"><div class="trace-heading">第 ${event.turn} 轮模型调用 <span>${esc(labels[event.result] ?? (event.result === 'tool_call' ? '选择操作' : event.result))}${time}</span></div>${diagnostic}<div class="decision-summary"><span class="micro">公开决策摘要</span><p>${esc(event.decisionSummary ?? '本轮没有已记录的公开摘要（调用失败、旧归档或接口未提供）。')}</p></div>${event.toolName ? `<p class="field-hint">选择 ${esc(event.toolName)}</p>` : ''}${modelUsageView(event)}</li>`;
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
function mortalTable(data, ordinal, result) {
  if (!result) return '<p class="field-hint">Mortal 评分将在本案例执行结束后展示。</p>';
  const detail = data.mortalDetails?.cases.find(c => c.caseOrdinal === ordinal);
  if (!detail) return '<p class="field-hint">此案例尚未保存 Mortal Top 10。可使用上方“补算 Mortal 评分”，无需调用模型。</p>';
  const selected = result.attempt.submission?.actionRef;
  return `<section class="mortal-ranking"><h3>Mortal Top 10 <span class="tag">Q 评分</span></h3><p class="field-hint">分数越高越偏好，并非胜率或预期得点。共 ${detail.candidateCount} 个候选，展示 ${detail.rows.length} 个。${data.mortalDetails.origin === 'recomputed' ? '按原实验冻结牌面与 Mortal 版本补算。' : '本轮原始评分。'}</p><table><thead><tr><th scope="col">排名</th><th scope="col">动作</th><th scope="col">Q 评分</th><th scope="col">选择</th></tr></thead><tbody>${detail.rows.map((row, i) => `<tr class="${row.actionRef === selected ? 'model-choice' : ''}"><td>${i + 1}</td><td>${esc(actionText(row.actionRef))}</td><td class="q-value">${row.qValue.toFixed(4)}</td><td>${row.actionRef === detail.preferredActionRef ? '<span class="tag">Mortal 首选</span> ' : ''}${row.actionRef === selected ? '<span class="tag">模型所选</span>' : ''}</td></tr>`).join('')}</tbody></table>${selected && !detail.rows.some(r => r.actionRef === selected) ? `<p class="field-hint">模型所选 ${esc(actionText(selected))} 未进入 Top 10。</p>` : ''}</section>`;
}
function renderDetail(data) {
  const { manifest: m, summary: s, events, trace = [] } = data;
  const finalized = new Map(events.filter(item => item.type === 'case_run').map(item => [item.caseOrdinal, item.result]));
  const live = new Map(); for (const row of trace) { if (!live.has(row.caseOrdinal)) live.set(row.caseOrdinal, []); live.get(row.caseOrdinal).push(row.event); }
  const body = $('#detail-body'), dialog = $('#result-dialog');
  const knownKeys = new Set([...body.querySelectorAll('details')].map(node => node.dataset.detailKey));
  const openKeys = new Set([...body.querySelectorAll('details[open]')].map(node => node.dataset.detailKey));
  const scroll = body.scrollTop, activeKey = document.activeElement?.closest('details')?.dataset.detailKey, focusedId = document.activeElement?.id;
  const auto = $('#trace-auto')?.checked ?? true;
  const signature = JSON.stringify(data);
  selectedResult = data;
  if (detailSignature === signature) return;
  detailSignature = signature;
  const metrics = runMetrics(s);
  $('#detail-title').textContent = `${experimentLabels[experimentTypeForDataset(m.dataset.id)]} · 实验 ${data.id.slice(0, 8)}`;
  body.innerHTML = `<div class="detail-meta"><span>${date(m.startedAt)}</span><span>${esc(m.coach.model)} · ${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</span><span>RAG ${esc(m.rag.mode)}</span><span>代码 ${m.codeSha.slice(0, 8)}</span></div><div class="detail-stat"><div>执行成功率<strong>${metrics ? rate(metrics.succeeded, metrics.selected) : '待归档'}</strong><span>${metrics ? `${metrics.succeeded}/${metrics.selected} 纳入案例` : ''}</span></div><div>Mortal 一选匹配率<strong>${metrics ? rate(metrics.matched, metrics.succeeded) : '待评分'}</strong><span>${metrics ? `${metrics.matched}/${metrics.succeeded} 成功案例${metrics.missingLabels ? ` · ${metrics.missingLabels} 缺标签` : ''}` : ''}</span></div><div>模型用量（各轮合计）<strong>${tokenText(s)}</strong><span>其中缓存输入：${s?.tokenUsage.status === 'not_called' ? '未调用' : usageCount((s?.tokenUsage.status === 'reported' ? s.tokenUsage.tokens : s?.tokenUsage.reportedPartial)?.cachedInputTokens, 'tokens')}${s?.tokenUsage.status === 'unknown' ? '（已报告部分）' : ''}</span><span>缓存是输入子集，不重复计入合计</span></div></div><p class="field-hint">${m.dataset.split.status === 'frozen_holdout' ? '冻结的独立牌局验收样本；结果披露后仅作回归复用' : '开发样本'}；未进行专家质量验收。${s ? `Helper 查询 ${s.evidence.helperQueries} 次，RAG 查询 ${s.evidence.ragQueries} 次、命中 ${s.evidence.ragHits} 次。` : '归档尚未完成，保留已发生的步骤，不据此判断成功。'}</p><div class="trace-controls"><label><input type="checkbox" id="trace-auto" ${auto ? 'checked' : ''}> 自动刷新过程</label><button id="refresh-detail" class="quiet-button">刷新过程</button><button id="expand-cases" class="quiet-button">展开案例</button><button id="collapse-cases" class="quiet-button">折叠案例</button>${events.some(e => e.type === 'case_run' && !data.mortalDetails?.cases.some(c => c.caseOrdinal === e.caseOrdinal)) ? '<button id="rebuild-mortal" class="quiet-button">补算 Mortal 评分</button>' : ''}<span id="trace-sync" role="status"></span></div><p class="field-hint">展示公开摘要和实际工具记录；不包含模型内部私有思维链。工具参数与返回可完整展开。</p>${m.dataset.selected.length > 10 ? `<label>查看案例<select id="detail-case">${m.dataset.selected.map((row, ordinal) => `<option value="${ordinal}" ${ordinal === detailCase ? "selected" : ""}>案例 ${ordinal + 1} · 题库第 ${(m.dataset.selection?.offset ?? 0) + ordinal + 1} 题</option>`).join("")}</select></label>` : ""}${m.dataset.selected.map((item, ordinal) => {
    if (m.dataset.selected.length > 10 && ordinal !== detailCase) return "";
    const result = finalized.get(ordinal), records = result?.events ?? live.get(ordinal) ?? [];
    const score = result?.score.cases[0];
    return `<details class="case-detail" data-detail-key="case-${ordinal}" ${ordinal === 0 ? 'open' : ''}><summary class="case-summary"><span class="case-title">案例 ${ordinal + 1}</span><span class="tag">${result ? esc(labels[result.status] ?? result.status) : records.length ? '尚无最终结果' : '尚无执行记录'}</span>${matchBadge(score)}<span class="case-chevron" aria-hidden="true">⌄</span></summary><div class="case-body"><div class="detail-meta"><span>${item.candidateCount} 个候选动作</span>${result ? `<span>${result.providerTurnCount} 轮模型调用 · ${result.toolCallCount} 次工具调用 · ${(result.elapsedMs / 1000).toFixed(1)}s</span>` : ''}</div>${mortalTable(data, ordinal, result)}${records.length ? `<ol class="trace-list">${records.map((row, index) => traceEvent(row, index, ordinal, records)).join('')}</ol>` : '<p class="field-hint">尚未收到本题事件。停止或中断的实验可能不会继续产生记录。</p>'}${result && !records.some(row => row.type === 'submission_locked') && result.attempt.submission ? structured(`${ordinal}-legacy-answer`, '旧归档中的最终提交', result.attempt.submission) : ''}</div></details>`;
  }).join('')}${structured('archive', '查看运行元数据与汇总', { manifest: m, summary: s })}<button id="download-result" class="quiet-button">下载本次结果 JSON</button>`;
  for (const node of body.querySelectorAll('details')) { if (knownKeys.has(node.dataset.detailKey)) node.open = openKeys.has(node.dataset.detailKey); if (activeKey === node.dataset.detailKey) node.querySelector('summary').focus({ preventScroll: true }); }
  if (focusedId && body.querySelector(`#${CSS.escape(focusedId)}`)) body.querySelector(`#${CSS.escape(focusedId)}`).focus({ preventScroll: true });
  body.scrollTop = scroll;
  $('#detail-case')?.addEventListener('change', event => { detailCase = Number(event.target.value); detailSignature = ''; renderDetail(selectedResult); });
  for (const [id, open] of [['#expand-cases', true], ['#collapse-cases', false]]) $(id).addEventListener('click', () => { for (const node of body.querySelectorAll('.case-detail')) node.open = open; });
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
    $('#detail-body').scrollTop = 0;
  } catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
await refresh();
setInterval(refresh, 2500);
