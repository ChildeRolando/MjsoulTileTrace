import { tabs, compactContent, paginate } from '/compact-view.mjs';
import { api as request, jobView, labels } from '/client.mjs';
import { esc, actionText, tileImages, observationView, mortalTable, traceEvent, structured } from '/case-view.mjs';
import { experimentLabels, sortedTiles } from '/presentation.mjs';
const $ = s => document.querySelector(s);
const rate = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
const date = value => new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const verdict = s => s.status !== 'completed' ? (labels[s.status] ?? s.status) : s.scoreStatus === 'matched' ? 'Mortal 匹配' : s.scoreStatus === 'not_matched' ? 'Mortal 不匹配' : '缺少标签';
const attemptId = s => `${s.runId}:${s.caseOrdinal}`;
let data, currentQuestion, currentSnapshot, page = 0, loading = 0, snapshotLoading = 0, replayBusy = false;
const pageSize = 3;
let detailOpen = new URLSearchParams(location.search).has('q');
document.body.classList.toggle('mistake-detail-view', detailOpen);
async function api(path) {
  const response = await fetch(path);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? '读取归档失败');
  return body;
}
function filters() {
  return new URLSearchParams({ type: $('#mistake-type').value, model: $('#mistake-model').value, rag: $('#mistake-rag').value,
    faults: $('#include-faults').checked ? 'include' : 'exclude' });
}
function setUrl() {
  const params = filters();
  if (currentQuestion && detailOpen) params.set('q', currentQuestion.id);
  if (currentSnapshot && detailOpen) params.set('attempt', attemptId(currentSnapshot));
  params.set('sort', $('#mistake-sort').value);
  history.replaceState(null, '', `/mistakes?${params}`);
}
function rows() {
  const sort = $('#mistake-sort').value;
  return [...(data?.questions ?? [])].sort((a, b) => (sort === 'rate' ? b.errorRate - a.errorRate || b.errors - a.errors
    : sort === 'latest' ? b.latestErrorAt.localeCompare(a.latestErrorAt) : b.errors - a.errors || b.errorRate - a.errorRate) || a.id.localeCompare(b.id));
}
function renderList() {
  const sorted = rows();
  $('#list-count').textContent = sorted.length;
  page = Math.max(0, Math.min(page, Math.ceil(sorted.length / pageSize) - 1));
  $('#mistake-list').innerHTML = sorted.length ? sorted.slice(page * pageSize, (page + 1) * pageSize).map(q => {
    const p = q.preview;
    return `<button class="mistake-card ${q.id === currentQuestion?.id ? 'selected' : ''}" data-question="${q.id}" aria-label="原局决策 ${q.canonicalDecisionOrder + 1}，错误 ${q.errors} 次，错误率 ${rate(q.errors, q.scored)}" ${q.id === currentQuestion?.id ? 'aria-current="true"' : ''}>
      <span class="mistake-card-top"><strong>${p ? `${esc(({ E: '东', S: '南', W: '西' })[p.roundWind] ?? p.roundWind)}${p.hand}局 · ${p.honba}本场` : '历史场面'}<small>原局决策 ${q.canonicalDecisionOrder + 1} · ${q.id.slice(0, 6)}</small></strong><span class="error-count-pill">错 ${q.errors} 次</span></span>
      <span class="mistake-card-types">${q.types.map(t => `<span class="tag">${esc(experimentLabels[t])}</span>`).join('')}</span>
      ${p ? tileImages(sortedTiles(p.concealedTiles), '手牌') + (p.currentDraw ? tileImages([p.currentDraw], '摸牌') : '') : '<span class="field-hint">旧归档未保存牌面，仍可查看实际提交。</span>'}
      <span class="mistake-card-bottom"><span>错误率 <b>${rate(q.errors, q.scored)}</b> <small>${q.errors}/${q.scored} 次有效评分</small></span><span>最近 ${esc(date(q.latestErrorAt))}</span></span>
    </button>`;
  }).join('') : '<div class="empty-state"><strong>当前范围没有错题</strong><p>只有执行成功、有 Mortal 标签且不匹配的案例会收录。可切换模型、类型或检索模式查看。</p></div>';
  $('#mistake-pagination').hidden = sorted.length <= pageSize;
  $('#mistake-page').textContent = `${page + 1} / ${Math.max(1, Math.ceil(sorted.length / pageSize))}`;
  $('#prev-mistakes').disabled = page === 0;
  $('#next-mistakes').disabled = (page + 1) * pageSize >= sorted.length;
}
function questionFrame(q, selectedAttempt) {
  $('#snapshot-title').textContent = `原局决策 ${q.canonicalDecisionOrder + 1} · ${q.id.slice(0, 6)}`;
  $('#snapshot-body').innerHTML = `<div class="question-stats"><div><span>错误次数</span><strong>${q.errors}<small> 次</small></strong></div><div><span>错误率</span><strong>${rate(q.errors, q.scored)}</strong></div><div><span>有效评分</span><strong>${q.scored}<small> 次</small></strong></div></div>
    <p class="field-hint question-counts">${q.attempts} 次执行 · ${q.matched} 次匹配${q.executionFailures ? ` · ${q.executionFailures} 次执行失败` : ''}${q.missingLabels ? ` · ${q.missingLabels} 次缺标签` : ''}</p>
    <div class="question-rerun"><label>本次知识检索<select id="rerun-mode"><option value="local">Local</option><option value="off">Off</option></select></label><button id="rerun-question" class="primary-button">重跑这一题</button><a href="/?bank=mistakes" class="quiet-button">在实验控制台批量重跑 ↗</a></div><label class="snapshot-picker">历史记录<select id="snapshot-attempt">${q.history.map((s, index) => `<option value="${index}" ${attemptId(s) === selectedAttempt ? 'selected' : ''}>${date(s.at)} · ${esc(verdict(s))} · ${esc(s.model)} · ${s.ragMode === 'local' ? 'Local' : 'Off'} · ${esc(s.actionRef ? actionText(s.actionRef) : '无有效提交')}${s.controlledFault !== 'none' ? ' · 受控故障' : ''}</option>`).join('')}</select></label>
    <div id="snapshot-record" aria-busy="true"><p class="snapshot-loading" role="status">正在读取当次运行快照…</p></div>`;
  $('#rerun-question').disabled=replayBusy;
  $('#rerun-question').addEventListener('click', async () => { const b=$('#rerun-question'); b.disabled=true; try { await request('/api/start',{experimentType:'mistakes',mode:$('#rerun-mode').value,questionIds:[q.id],maxCases:1}); await pollJob(); } catch(e) { $('#mistakes-status').textContent=e.message; } finally { if(document.contains(b))b.disabled=replayBusy; } });
  $('#snapshot-attempt').addEventListener('change', () => showSnapshot(q.history[Number($('#snapshot-attempt').value)]));
}
async function selectQuestion(id, { focus = false, attempt } = {}) {
  const q = data.questions.find(q => q.id === id);
  if (!q) return;
  if (focus) detailOpen = true;
  document.body.classList.toggle('mistake-detail-view', detailOpen);
  currentQuestion = q;
  const selected = q.history.find(s => attemptId(s) === attempt) ?? q.history[0];
  questionFrame(q, attemptId(selected)); renderList();
  if (focus) { $('#snapshot-title').focus({ preventScroll: true }); window.scrollTo(0,0); }
  await showSnapshot(selected);
}
async function showSnapshot(snapshot) {
  currentSnapshot = snapshot; setUrl();
  const request = ++snapshotLoading, questionId = currentQuestion.id;
  const target = $('#snapshot-record');
  target.setAttribute('aria-busy', 'true');
  target.innerHTML = '<p class="snapshot-loading" role="status">正在读取当次运行快照…</p>';
  try {
    const run = await api(`/api/run/${snapshot.runId}`);
    if (request !== snapshotLoading || questionId !== currentQuestion?.id) return;
    const result = run.events.find(e => e.type === 'case_run' && e.caseOrdinal === snapshot.caseOrdinal)?.result;
    if (!result || result.status !== snapshot.status || result.score.cases[0]?.status !== snapshot.scoreStatus) throw new Error('原归档与错题索引不一致，请刷新归档。');
    const m = run.manifest, observation = result.events.find(e => e.type === 'run_started')?.observation;
    const submission = result.attempt.submission, mortal = run.mortalDetails?.cases.find(c => c.caseOrdinal === snapshot.caseOrdinal);
    target.innerHTML = `<div class="snapshot-meta"><span class="match-badge ${snapshot.scoreStatus === 'matched' ? 'is-match' : 'is-mismatch'}">${esc(verdict(snapshot))}</span><span>${esc(date(snapshot.at))}</span><span>${esc(m.coach.model)} · ${esc(m.coach.reasoningEffort ?? m.coach.providerId)}</span><span>RAG ${esc(m.rag.mode)}</span>${m.controlledFault !== 'none' ? '<span class="tag">受控故障</span>' : ''}</div>
      <div class="snapshot-provenance"><a href="/results?run=${encodeURIComponent(snapshot.runId)}&case=${snapshot.caseOrdinal}">原实验 ↗</a><details><summary>归档信息</summary><p>实验 ${esc(snapshot.runId.slice(0, 8))} / 案例 ${snapshot.caseOrdinal + 1}<br>代码 ${esc(m.codeSha.slice(0, 8))} · ${esc(m.coach.promptVersion)}</p></details></div>
      <div class="snapshot-workspace"><section class="snapshot-overview"><div class="snapshot-verdict"><div class="choice-comparison"><article><span>模型选择</span><strong>${esc(submission ? actionText(submission.actionRef) : '无有效提交')}</strong>${submission?.rationale ? `<details class="decision-rationale"><summary>决策理由</summary><p>${esc(submission.rationale)}</p></details>` : '<p class="field-hint">本次执行没有决策理由；可查看当次过程。</p>'}</article><article><span>Mortal 首选</span><strong>${mortal ? esc(actionText(mortal.preferredActionRef)) : '原归档未保存 Top 10'}</strong>${mortal ? '' : '<p class="field-hint">可到原实验补算展示评分。</p>'}</article></div>
      ${result.toolFailureCount ? `<p class="snapshot-warning">当次有 ${result.toolFailureCount} 次工具失败，最终提交有效。展开下方过程可查看错误与后续处理。</p>` : ''}
      </div><div class="snapshot-board">${observation ? observationView(observation) : '<p class="field-hint">这份旧归档未保存当时的牌面，无法还原；下方仅展示原有提交与过程。</p>'}</div></section>
      <section class="snapshot-scores">${mortalTable(run, snapshot.caseOrdinal, result)}</section>
      <section class="snapshot-process"><p class="field-hint">当次公开摘要与工具过程 · ${result.providerTurnCount} 轮模型 / ${result.toolCallCount} 次工具</p><ol class="trace-list">${result.events.filter(e => e.type !== 'run_started').map((e, i, events) => traceEvent(e, i, snapshot.caseOrdinal, events)).join('')}</ol></section>
      <section class="snapshot-raw">${structured('error-snapshot', '查看完整案例快照 JSON', { runId: snapshot.runId, caseOrdinal: snapshot.caseOrdinal, manifest: m, result, mortalDetails: mortal ?? null })}</section></div>`;
    const workspace=target.querySelector(".snapshot-workspace");
    tabs(workspace, [["snapshot-overview","决策与完整场面"],["snapshot-scores","Mortal Top 10"],["snapshot-process","模型与工具过程"],["snapshot-raw","完整快照"]].map(([name,title])=>({title,node:workspace.querySelector("."+name)})), "snapshot-sections");
    compactContent(target, attemptId(snapshot));
    target.setAttribute('aria-busy', 'false');
  } catch (error) {
    if (request !== snapshotLoading) return;
    target.innerHTML = `<div class="form-error" role="alert">${esc(error.message)} <button id="retry-snapshot" class="quiet-button">重试快照</button></div>`;
    target.setAttribute('aria-busy', 'false');
    $('#retry-snapshot').addEventListener('click', () => showSnapshot(snapshot));
  }
}
async function load({ restore = false, latest = false } = {}) {
  const request = ++loading;
  ++snapshotLoading;
  $('#reload-mistakes').disabled = true;
  $('#mistake-list').setAttribute('aria-busy', 'true');
  $('#mistakes-status').textContent = '正在整理已有实验，不调用模型…';
  try {
    const params = new URLSearchParams(location.search);
    const next = await api(`/api/mistakes?${filters()}`);
    if (request !== loading) return;
    data = next;
    const model = $('#mistake-model').value;
    $('#mistake-model').innerHTML = '<option value="all">全部模型</option>' + data.models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    $('#mistake-model').value = data.models.includes(model) ? model : 'all';
    $('#question-count').textContent = data.totals.questions;
    $('#error-count').textContent = data.totals.errors;
    $('#error-rate').textContent = rate(data.totals.errors, data.totals.scored);
    $('#error-fraction').textContent = `${data.totals.errors} 次错误 / ${data.totals.scored} 次错题有效评分`;
    $('#mistakes-status').textContent = `${data.runCount} 份归档${data.excludedFaultRuns ? ` · 已排除 ${data.excludedFaultRuns} 份受控故障` : ''}${data.unreadableRuns.length ? ` · ${data.unreadableRuns.length} 份归档不完整或无法读取，未计入` : ''}`;
    const previousId = restore ? params.get('q') : currentQuestion?.id;
    const selected = data.questions.find(q => q.id === previousId) ?? rows()[0];
    const previousAttempt = latest ? undefined : restore ? params.get('attempt') : currentSnapshot && attemptId(currentSnapshot);
    page = selected ? Math.floor(rows().findIndex(q => q.id === selected.id) / pageSize) : 0;
    if (selected) await selectQuestion(selected.id, { attempt: previousAttempt });
    else {
      currentQuestion = null; currentSnapshot = null; ++snapshotLoading; renderList(); setUrl();
      $('#snapshot-title').textContent = '当前范围没有错题';
      $('#snapshot-body').innerHTML = '<div class="empty-state">可调整上方筛选条件，或回到控制台运行更多案例。</div>';
    }
  } catch (error) {
    if (request !== loading) return;
    $('#mistakes-status').textContent = `读取失败：${error.message}。请点击“刷新归档”重试。`;
  } finally {
    if (request === loading) { $('#reload-mistakes').disabled = false; $('#mistake-list').setAttribute('aria-busy', 'false'); }
  }
}
$('#mistake-list').addEventListener('click', event => {
  const button = event.target.closest('[data-question]');
  if (button) void selectQuestion(button.dataset.question, { focus: true });
});
for (const id of ['#mistake-type', '#mistake-model', '#mistake-rag', '#include-faults']) $(id).addEventListener('change', () => { page = 0; void load(); });
$('#mistake-sort').addEventListener('change', () => { page = 0; renderList(); setUrl(); });
$('#back-mistakes').addEventListener('click',()=>{detailOpen=false;document.body.classList.remove('mistake-detail-view');setUrl();window.scrollTo(0,0);$('#notebook-title').tabIndex=-1;$('#notebook-title').focus({preventScroll:true});});
$('#reload-mistakes').addEventListener('click', () => load());
$('#prev-mistakes').addEventListener('click', () => { page--; renderList(); });
$('#next-mistakes').addEventListener('click', () => { page++; renderList(); });
const initial = new URLSearchParams(location.search);
for (const [id, key] of [['#mistake-type', 'type'], ['#mistake-rag', 'rag'], ['#mistake-sort', 'sort']]) {
  if ([...$(id).options].some(o => o.value === initial.get(key))) $(id).value = initial.get(key);
}
if (initial.get('model') && initial.get('model') !== 'all') $('#mistake-model').add(new Option(initial.get('model'), initial.get('model'), true, true));
$('#include-faults').checked = initial.get('faults') === 'include';
await load({ restore: true });

let jobSignature='', pollingJob=false;
async function pollJob(){
 if(pollingJob)return;pollingJob=true;
 try{const state=await request('/api/state'),job=state.job;const active=['running','stopping'].includes(job?.status);
 replayBusy=active;const button=$('#rerun-question');if(button)button.disabled=active;
 $('#rerun-status').hidden=job?.experimentType!=='mistakes';
 if(job?.experimentType==='mistakes'){
  $('#rerun-status-body').innerHTML=jobView(job);paginate($('#rerun-status-body'),[...$('#rerun-status-body').querySelectorAll('.job-step')],3,'mistake-job-'+job.id,'个步骤');
  const signature=JSON.stringify(job);
  if(jobSignature&&signature!==jobSignature&&job.steps.some(s=>s.status==='completed'))await load({latest:true});
  jobSignature=signature;
 }
 }catch(e){$('#mistakes-status').textContent=e.message;}finally{pollingJob=false;}
}
await pollJob();setInterval(pollJob,3000);
