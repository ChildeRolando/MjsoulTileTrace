import {api,$,esc,date,rate,message} from '/client.mjs';
import {tabs} from '/compact-view.mjs';
import {researchCaseIndices} from '/presentation.mjs';
import {observationView,actionText,matchBadge,tileImages} from '/case-view.mjs';
import {mountDocument,mountJson} from '/reader.mjs';
import {mountTrace} from '/trace.mjs';
import {caseRecords} from '/trace-model.mjs';
let data, page=0, disposeDocument, disposeCase=()=>{}, loading=0, caseLoading=0;
const size=()=>innerHeight>=950?10:innerHeight>=740?7:4;
const groupNames={public_table_representation:'四家公开场面表示',candidate_only_protocol:'仅候选动作',candidate_query_archived_basic:'按需查询基础计算',basic_five_axes:'基础计算 + 五轴框架',basic_five_axes_v1:'基础计算 + 五轴框架 V1',basic_five_axes_user_v2:'基础计算 + 用户五轴 V2',basic_structured_brief:'基础计算 + 结构化简报',basic_five_axes_structured_brief:'五轴框架 + 结构化简报',basic_helper_forecasts:'基础计算 + Helper 预测',basic_five_axes_v1_helper_forecasts:'五轴框架 + Helper 预测',basic_compact_references:'基础计算 + 精简参考',raw_position:'原始牌面',raw_plus_legal:'牌面 + 合法候选',raw_plus_legal_and_calculations:'牌面 + 合法候选 + 基础计算',basic_calculations:'基础计算',basic_and_structure:'基础计算 + 手牌结构',basic_and_improvements:'基础计算 + 改良',basic_and_defense:'基础计算 + 防守',basic_and_hand_structure:'基础计算 + 手牌结构',basic_calculations_compare:'基础计算 + 比较提示',basic_calculations_compare_explain:'基础计算 + 比较提示 + 公开解释',basic_and_selected_textbook:'基础计算 + 所选教材'};
function renderList() {
 const query=$('#research-search').value.toLowerCase(), rows=data.studies.filter(s=>($('#research-hidden').checked||!s.hidden)&&`${s.title} ${s.name}`.toLowerCase().includes(query));
 page=Math.max(0,Math.min(page,Math.ceil(rows.length/size())-1));
 $('#research-rows').innerHTML=rows.length?`<table class="research-table"><thead><tr><th>研究</th><th>资料</th><th>更新时间</th></tr></thead><tbody>${rows.slice(page*size(),(page+1)*size()).map(s=>`<tr><td><a href="/results/research?study=${s.id}">${esc(s.title)}</a><small>${esc(s.name)}</small></td><td>${s.hidden?'准备 / 预检':esc(s.kind)}</td><td>${date(s.updated)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">没有符合筛选条件的研究资料。</p>';
 $('#research-count').textContent=`${page+1} / ${Math.max(1,Math.ceil(rows.length/size()))} 页 · ${rows.length} 项`;
 $('#research-prev').disabled=!page;$('#research-next').disabled=(page+1)*size()>=rows.length;
 $('#research-count').parentElement.hidden=rows.length<=size();
}
async function refresh() {
 try { data=await api('/api/research?refresh=1');renderList();message(data.unavailable.length?'部分研究目录暂不可读取：'+data.unavailable.join('；'):!data.roots.length?'尚未配置研究资料目录。':'',!!data.unavailable.length); }
 catch(e){message(e.message,true);}
}
async function openStudy(id) {
 try {
  const study=await api('/api/research/'+encodeURIComponent(id));
  $('#research-list').hidden=true;$('#research-detail').hidden=false;$('#study-title').textContent=study.title;
  $('#study-source').textContent=`${study.kind} · 原始目录：${study.directory}`;
  const report=study.documents.find(d=>d.path.endsWith('.md'))??study.documents[0];
  $('#study-content').innerHTML=`<section class="panel inspector-section" id="study-report"><div class="report-selection-row"><label>研究资料<select id="study-document">${study.documents.map(d=>`<option value="${d.id}" ${d.id===report.id?'selected':''}>${esc(d.path)}</option>`).join('')}</select></label><div id="report-actions"></div></div><div id="report-content" aria-live="polite"></div></section>${study.groups.length?`<section class="panel inspector-section" id="study-groups"><h3>分组结果</h3><table class="research-table"><thead><tr><th>分组</th><th>执行成功率</th><th>Mortal 匹配率</th></tr></thead><tbody>${study.groups.map(g=>`<tr><td>${esc(groupNames[g.name]??g.name)}</td><td>${g.valid!==null&&g.cases.length?`${g.valid}/${g.cases.length} · ${rate(g.valid,g.cases.length)}`:'未报告分母'}</td><td>${g.valid!==null&&g.matches!==null?`${g.matches}/${g.valid} · ${rate(g.matches,g.valid)}`:'未报告'}</td></tr>`).join('')}</tbody></table><p class="field-hint">匹配率以执行成功案例为分母。置信区间、配对检验和结论范围见原始报告。</p></section><section class="panel inspector-section" id="study-cases"><div class="research-case-controls"><label>分组<select id="study-group">${study.groups.map((g,i)=>`<option value="${i}">${esc(groupNames[g.name]??g.name)}</option>`).join('')}</select></label><label>案例<select id="study-case"></select></label><button type="button" class="quiet-button" id="study-errors" aria-pressed="false">只看错题</button><span id="study-case-count" role="status"></span></div><div id="study-case-content"></div></section>`:''}`;
  if(study.statisticsError) message(study.statisticsError,true);
  const root=$('#study-content');tabs(root,[{title:'研究报告',node:$('#study-report')},{title:'分组结果',node:$('#study-groups')},{title:'逐题记录',node:$('#study-cases')}],'study-'+id);
  async function loadDocument() {
   const request=++loading;disposeDocument?.();disposeDocument=null;$('#report-content').innerHTML='<p role="status">正在读取报告…</p>';
   try {const doc=await api(`/api/research/${id}/documents/${$('#study-document').value}`);if(request!==loading)return;
    disposeDocument?.();$('#report-content').replaceChildren();disposeDocument=mountDocument($('#report-content'),doc,$('#report-actions'));
   }catch(e){if(request===loading){$('#report-content').textContent='报告读取失败。';message(e.message,true);}}
  }
  if(study.groups.length) {
   let mistakesOnly=false;
   async function showCase(){
    const request=++caseLoading, g=study.groups[Number($('#study-group').value)], index=Number($('#study-case').value);
    disposeCase();disposeCase=()=>{};$('#study-case-content').innerHTML='<p role="status">正在读取原始场面与调用记录…</p>';
    if(!$('#study-case').options.length){$('#study-case-content').textContent=mistakesOnly?'该分组没有已评分错题。':'该报告未提供逐题记录。';return;}
    try {const detail=await api(`/api/research/${id}/cases/${encodeURIComponent(g.name)}/${index}`);if(request!==caseLoading)return;disposeCase=renderCase($('#study-case-content'),detail);}
    catch(e){if(request===caseLoading)$('#study-case-content').innerHTML=`<p role="alert">${esc(e.message)}</p><p class="field-hint">无法可靠关联本题归档，未展示其他案例代替。</p>`;}
   }
   function selectGroup(preserve=false){
    const g=study.groups[Number($('#study-group').value)], previous=$('#study-case').value, indices=researchCaseIndices(g.cases,mistakesOnly);
    $('#study-case').innerHTML=indices.map(i=>{const c=g.cases[i];return `<option value="${i}">案例 ${i+1} · ${c.failure?'执行失败':c.match===true?'Mortal 匹配':c.match===false?'Mortal 不匹配':'未报告匹配'}</option>`;}).join('');
    if(preserve&&indices.includes(Number(previous)))$('#study-case').value=previous;
    $('#study-case').disabled=!indices.length;
    $('#study-case-count').textContent=`${indices.length} / ${g.cases.length} 题${mistakesOnly?' · Mortal 不匹配':''}`;
    showCase();
   }
   $('#study-errors').onclick=()=>{mistakesOnly=!mistakesOnly;$('#study-errors').setAttribute('aria-pressed',String(mistakesOnly));$('#study-errors').classList.toggle('selected',mistakesOnly);selectGroup(true);};
   $('#study-group').onchange=()=>selectGroup();$('#study-case').onchange=showCase;selectGroup();
  }
  $('#study-document').onchange=loadDocument;await loadDocument();$('#study-title').focus({preventScroll:true});
 }catch(e){message(e.message,true);}
}
const eventNames={run_started:'开始案例',request_prepared:'模型请求：提示词与输入',request_audit:'请求审计',provider_turn_started:'开始模型调用',provider_turn:'模型响应与用量',provider_final:'最终回答原文',tool_call:'工具调用参数',tool_result:'工具返回结果',submission_locked:'最终决策',run_terminal:'结束案例',module_preparation:'资料准备'};
function renderCase(host,d) {
 const cleanups=[], result=d.result, records=caseRecords(d,d.caseOrdinal), start=records.find(e=>e.type==='run_started');
 const details=d.preparation?[{type:'教材选择：实际请求',data:d.preparation.requests},{type:'教材选择：模型回答',data:d.preparation.responses},{type:'教材选择：执行记录与用量',data:d.preparation.journal},...records]:records;
 const choice=result?.attempt?.submission, score=result?.score?.cases?.find(c=>c.caseRef===result.caseRef);
 const mortal=d.observation?.candidates?.find(c=>c.actionRef===d.reference);
 if(!d.available){host.innerHTML=`<p class="field-hint">${esc(d.reason)}</p><div class="research-summary-json"></div>`;cleanups.push(mountJson(host.querySelector('.research-summary-json'),d.summary));return ()=>cleanups.forEach(fn=>fn());}
 host.innerHTML=`<div class="case-workspace"><section class="case-board">${d.observation?observationView(d.observation):'<p>本归档未保存可视牌面。</p>'}</section><section class="case-scores"><div class="research-case-summary">${matchBadge(score)}</div><div class="research-decision-pair"><section aria-label="模型决策"><h3>模型决策</h3>${choice?tileImages([{id:choice.tile??d.summary.choice?.tile,red:choice.red??d.summary.choice?.red}],actionText(choice.actionRef??'')):'<p>没有有效提交</p>'}</section><section aria-label="Mortal 决策"><h3>Mortal 决策</h3>${mortal?tileImages([mortal.tile],actionText(mortal.actionRef)):`<p class="field-hint">${esc(d.referenceError??'归档未提供推荐')}</p>`}</section></div><p>${esc(result?.provider?.model??start?.provider?.model??'未记录模型')}</p><p>${esc(({completed:'执行完成',failed:'执行失败',timeout:'超时'})[result?.status]??result?.status??'未记录终态')} · ${result?.elapsedMs===undefined?'耗时未知':(result.elapsedMs/1000).toFixed(1)+'s'}</p><p>${d.preparation?'决策阶段：':''}${result?.providerTurnCount??'未知'} 轮模型调用 · ${result?.toolCallCount??'未知'} 次工具调用</p><p class="field-hint">${d.preparation?'另有教材选择模型调用，其请求、回答和用量见“请求与事件详情”，不计入本决策阶段瀑布图。':''}</p><p class="field-hint">${start?.toolNames?.length===0?'本实验未开放工具；预先计算的资料可在实际模型请求中查看。':'下方展示本题实际保存的模型与工具事件。'}</p></section><section class="case-process"><div class="research-process-content"><section class="research-waterfall"></section><section class="research-events"><div class="research-step-controls"><label>步骤<select class="research-event-select">${details.map((e,i)=>`<option value="${i}">${i+1}. ${esc(eventNames[e.type]??e.type)}${e.toolName?' · '+esc(e.toolName):''}</option>`).join('')}</select></label></div><div class="research-event-detail"></div></section></div><details><summary>研究统计快照与来源</summary><p>${esc(d.source)}</p>${d.referenceSource?`<p>Mortal 标签：${esc(d.referenceSource)}</p>`:''}<div class="research-summary-json"></div></details></section></div>`;
 const process=host.querySelector('.research-process-content'), waterfallHost=host.querySelector('.research-waterfall'), eventsHost=host.querySelector('.research-events');
 tabs(process,[{title:'调用时间轴',node:waterfallHost},{title:'请求与事件详情',node:eventsHost}],'research-case-process');
 const waterfall=mountTrace(waterfallHost);waterfall.update(d,d.caseOrdinal);cleanups.push(()=>waterfall.dispose());
 let disposeEvent;const select=host.querySelector('.research-event-select');
 const showEvent=()=>{disposeEvent?.();const target=host.querySelector('.research-event-detail');target.replaceChildren();disposeEvent=mountJson(target,details[Number(select.value)]??{});};
 select.onchange=showEvent;showEvent();cleanups.push(()=>disposeEvent?.());
 cleanups.push(mountJson(host.querySelector('.research-summary-json'),d.summary));
 return ()=>cleanups.forEach(fn=>fn());
}
$('#research-search').oninput=$('#research-hidden').onchange=()=>{page=0;if(data)renderList();};$('#research-prev').onclick=()=>{page--;renderList();};$('#research-next').onclick=()=>{page++;renderList();};$('#refresh-research').onclick=refresh;
window.addEventListener('resize',()=>{if(data)renderList();});
const study=new URLSearchParams(location.search).get('study');if(study)await openStudy(study);else await refresh();
