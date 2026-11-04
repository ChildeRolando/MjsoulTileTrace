import {api,$,esc,date,rate,message} from '/client.mjs';
import {tabs,fitTextPages} from '/compact-view.mjs';
let data, page=0, dispose, loading=0;
const size=()=>innerHeight>=950?10:innerHeight>=740?7:4;
const pre=value=>`<pre>${esc(typeof value==='string'?value:JSON.stringify(value,null,2))}</pre>`;
const groupNames={raw_position:'原始牌面',raw_plus_legal:'牌面 + 合法候选',raw_plus_legal_and_calculations:'牌面 + 合法候选 + 基础计算',basic_calculations:'基础计算',basic_and_structure:'基础计算 + 手牌结构',basic_and_improvements:'基础计算 + 改良',basic_and_defense:'基础计算 + 防守',basic_and_hand_structure:'基础计算 + 手牌结构',basic_calculations_compare:'基础计算 + 比较提示',basic_calculations_compare_explain:'基础计算 + 比较提示 + 公开解释',basic_and_selected_textbook:'基础计算 + 所选教材'};
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
  $('#study-content').innerHTML=`<section class="panel inspector-section" id="study-report"><label>研究资料<select id="study-document">${study.documents.map(d=>`<option value="${d.id}" ${d.id===report.id?'selected':''}>${esc(d.path)}</option>`).join('')}</select></label><div id="report-content" aria-live="polite"></div></section>${study.groups.length?`<section class="panel inspector-section" id="study-groups"><h3>分组结果</h3><table class="research-table"><thead><tr><th>分组</th><th>执行成功率</th><th>Mortal 匹配率</th></tr></thead><tbody>${study.groups.map(g=>`<tr><td>${esc(groupNames[g.name]??g.name)}</td><td>${g.valid!==null&&g.cases.length?`${g.valid}/${g.cases.length} · ${rate(g.valid,g.cases.length)}`:'未报告分母'}</td><td>${g.valid!==null&&g.matches!==null?`${g.matches}/${g.valid} · ${rate(g.matches,g.valid)}`:'未报告'}</td></tr>`).join('')}</tbody></table><p class="field-hint">匹配率以执行成功案例为分母。置信区间、配对检验和结论范围见原始报告。</p></section><section class="panel inspector-section" id="study-cases"><label>分组<select id="study-group">${study.groups.map((g,i)=>`<option value="${i}">${esc(groupNames[g.name]??g.name)}</option>`).join('')}</select></label><label>案例<select id="study-case"></select></label><div id="study-case-content"></div></section>`:''}`;
  if(study.statisticsError) message(study.statisticsError,true);
  const root=$('#study-content');tabs(root,[{title:'研究报告',node:$('#study-report')},{title:'分组结果',node:$('#study-groups')},{title:'逐题记录',node:$('#study-cases')}],'study-'+id);
  const fit=()=>{dispose?.();dispose=fitTextPages(root);};
  // Dispose before replacing content, so old observers never re-page detached readers.
  async function loadDocument() {
   const request=++loading;try {const doc=await api(`/api/research/${id}/documents/${$('#study-document').value}`);if(request!==loading)return;
    dispose?.();$('#report-content').innerHTML=pre(doc.text);fit();
   }catch(e){message(e.message,true);}
  }
  if(study.groups.length) {
   function showCase(){dispose?.();const g=study.groups[Number($('#study-group').value)];$('#study-case-content').innerHTML=g.cases.length?pre(g.cases[Number($('#study-case').value)]):'<p>该报告未提供逐题记录。</p>';fit();}
   function selectGroup(){const g=study.groups[Number($('#study-group').value)];$('#study-case').innerHTML=g.cases.map((c,i)=>`<option value="${i}">案例 ${i+1} · ${c.failure?'执行失败':c.match===true?'Mortal 匹配':c.match===false?'Mortal 不匹配':'未报告匹配'}</option>`).join('');showCase();}
   $('#study-group').onchange=selectGroup;$('#study-case').onchange=showCase;selectGroup();
  }
  $('#study-document').onchange=loadDocument;await loadDocument();$('#study-title').focus({preventScroll:true});
 }catch(e){message(e.message,true);}
}
$('#research-search').oninput=$('#research-hidden').onchange=()=>{page=0;if(data)renderList();};$('#research-prev').onclick=()=>{page--;renderList();};$('#research-next').onclick=()=>{page++;renderList();};$('#refresh-research').onclick=refresh;
window.addEventListener('resize',()=>{if(data)renderList();});
const study=new URLSearchParams(location.search).get('study');if(study)await openStudy(study);else await refresh();
