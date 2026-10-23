import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { read, save, hash, clusterInterval, exists } from './common.mjs';
import { graphicalScene } from './review-presentation.mjs';

const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={required:'必须',optional:'可选',irrelevant:'不适用'};
const topicNames={pairs:'对子路线',chiitoitsu:'七对子',yakuhai:'役牌',flush:'染手',efficiency:'牌效',dora:'宝牌',waits:'等待',furiten:'振听','riichi-defense':'立直防守','multi-defense':'多家防守','open-defense':'副露防守',reading:'读牌','safe-tiles':'安全牌','push-fold':'押引',endgame:'终盘',placement:'点况'};
const confidenceNames={high:'把握高',medium:'把握中',low:'把握低'};
const signature=t=>JSON.stringify([t.need,t.gap,[...t.chapters].sort()]);
export function compareDrafts(dataset,before,after,{allowIncomplete=false}={}) {
  if(before.datasetHash!==hash(dataset)||after.datasetHash!==hash(dataset))throw new Error('comparison_dataset_binding');
  const cases=dataset.cases.filter(c=>c.split==='evaluation');
  for(const draft of [before,after])if(draft.cases.length!==60||new Set(draft.cases.map(c=>c.caseId)).size!==60||draft.cases.some(c=>!cases.some(x=>x.id===c.caseId)||c.topics.length!==16||new Set(c.topics.map(t=>t.topic)).size!==16||c.topics.some(t=>!labels[t.need]&&!(allowIncomplete&&draft===after&&t.need===null))))throw new Error('comparison_requires_complete_paired_60');
  const rows=cases.map((c,i)=>{
    const old=before.cases.find(x=>x.caseId===c.id),next=after.cases.find(x=>x.caseId===c.id);
    const topics=old.topics.map(a=>{const b=next.topics.find(t=>t.topic===a.topic);if(!b)throw new Error('comparison_topics_mismatch');return {topic:a.topic,before:a,after:b,changed:b.need!==null&&signature(a)!==signature(b)};});
    return {complete:next.topics.every(t=>t.need!==null),ordinal:i+1,caseId:c.id,gameId:c.gameId,stratum:c.stratum,topics,oldNotes:old.notes,newNotes:next.notes,oldGaps:topics.filter(t=>t.before.need==='required'&&t.before.gap).length,newGaps:topics.filter(t=>t.after.need==='required'&&t.after.gap).length};
  });
  const pairedRows=rows.filter(c=>c.complete);
  const all=pairedRows.flatMap(c=>c.topics.map(t=>({ordinal:c.ordinal,caseId:c.caseId,...t})));
  const allOldGaps=rows.flatMap(c=>c.topics.filter(t=>t.before.need==='required'&&t.before.gap).map(t=>({ordinal:c.ordinal,caseId:c.caseId,...t})));
  const oldGapItems=all.filter(t=>t.before.need==='required'&&t.before.gap);
  const count=(side,predicate)=>all.filter(t=>predicate(t[side])).length;
  const interval=xs=>pairedRows.length!==60?null:clusterInterval(xs,s=>s.reduce((n,r)=>n+r.newGaps-r.oldGaps,0)/s.length);
  return {kind:'paired_automatic_label_diagnostic_not_accuracy',cases:rows.length,pairedCases:pairedRows.length,incompleteCaseIds:rows.filter(r=>!r.complete).map(r=>r.caseId),oldRequiredGapsAll60:allOldGaps.length,allOldGapItems:allOldGaps,games:new Set(rows.map(c=>c.gameId)).size,topicDecisions:all.length,
    oldRequired:count('before',t=>t.need==='required'),newRequired:count('after',t=>t.need==='required'),oldRequiredGaps:oldGapItems.length,newRequiredGaps:count('after',t=>t.need==='required'&&t.gap),
    oldGapCases:pairedRows.filter(c=>c.oldGaps).length,newGapCases:pairedRows.filter(c=>c.newGaps).length,
    oldGapsNowRequiredWithChapters:oldGapItems.filter(t=>t.after.need==='required'&&!t.after.gap&&t.after.chapters.length).length,
    oldGapsNowDowngraded:oldGapItems.filter(t=>t.after.need!=='required').length,
    newGapItems:all.filter(t=>t.after.need==='required'&&t.after.gap&&!(t.before.need==='required'&&t.before.gap)),oldGapItems,
    changedTopicDecisions:all.filter(t=>t.changed).length,changedNeedDecisions:all.filter(t=>t.before.need!==t.after.need).length,
    gapCountChangePerCase:{all:interval(rows),random:interval(rows.filter(c=>c.stratum==='random')),challenge:interval(rows.filter(c=>c.stratum==='challenge'))},rows};
}

function page(title,body,css='') {return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}\nbody{font-family:system-ui;background:var(--page,#f4f5f6);color:var(--ink,#202b36);margin:24px}a{color:#24598c}header,nav{display:flex;gap:24px;align-items:center;flex-wrap:wrap}main{max-width:1500px;margin:auto}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #c8d0d8;padding:12px;vertical-align:top;text-align:left}td{line-height:1.65}p{line-height:1.7}tr.changed{background:#e5eef8}select,input,button{font:inherit;padding:6px}.summary{padding:16px;background:#e5eef8}.topic{width:12%}.version{width:44%}.source{font-size:.9em;color:#56626e}[hidden]{display:none!important}</style><body><main>${body}</main></body></html>`;}

export async function writeRevisionAudit(out) {
  const audit=await read(join(out,'knowledge-revision-audit.json')),knowledge=await read(join(out,'knowledge.json'));
  await mkdir(join(out,'review'),{recursive:true});
  const body=`<header><h1>知识卡 v2 · 40 条原文核对记录</h1><a href="./knowledge.html">阅读新版知识卡</a><a href="./knowledge-needs-60.html">查看 60 局</a></header><p>使用 v1 冻结的日文原文读取快照逐条复核；没有把模式阈值作为教材边界。下列是整理者的来源核对，不冒充人工日麻金标准。原文牌图未确认的例题仍未收入。</p>${audit.cards.map(a=>`<section id="${esc(a.id)}"><h2>${esc(a.id)} · ${esc(knowledge.cards.find(c=>c.id===a.id).title)}</h2><a href="${esc(a.source.url)}" target="_blank" rel="noopener">打开日文原文（含牌图）</a> · <a href="./knowledge.html#${esc(a.id)}">阅读本卡完整正文</a><table><tr><th>旧版条件</th><th>v2 条件</th></tr><tr><td>${esc(a.oldConditions)}</td><td>${esc(a.newConditions)}</td></tr></table><p><strong>原文核对与修订理由：</strong>${esc(a.rationale)}</p>${a.oldExceptions!==a.newExceptions?`<p>旧限制：${esc(a.oldExceptions)}</p><p>新限制：${esc(a.newExceptions)}</p>`:''}<details><summary>来源与版本记录</summary><p class="source">${esc(a.source.title)}<br>${esc(a.source.chapter)}<br>原 HTML SHA256：${esc(a.source.htmlSha256)}<br>原文文字 SHA256：${esc(a.sourceTextHash)}</p></details></section>`).join('')}`;
  await writeFile(join(out,'review/knowledge-audit.html'),page('知识卡逐条修订依据',body),'utf8');
}

async function attemptUsage(out) {
  const records=[];
  async function walk(dir){let names;try{names=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const n of names){const p=join(dir,n.name);if(n.isDirectory())await walk(p);else if(n.name.endsWith('.json')&&!n.name.endsWith('.started.json')){const r=await read(p);if(r.caseId&&r.status)records.push(r);}}}
  await walk(join(out,'automatic/runs'));await walk(join(out,'automatic/retries'));
  const known=records.filter(r=>r.result?.usage);
  return {attempts:records.length,failedAttempts:records.filter(r=>r.status!=='completed').length,knownUsageAttempts:known.length,knownTokens:known.reduce((n,r)=>n+(r.result.usage.totalTokens??r.result.usage.inputTokens+r.result.usage.outputTokens),0),unknownUsageAttempts:records.length-known.length,meanAttemptElapsedMs:records.length?records.reduce((n,r)=>n+(r.elapsedMs??0),0)/records.length:null,meanCompletedElapsedMs:records.filter(r=>r.status==='completed').reduce((n,r)=>n+r.elapsedMs,0)/records.filter(r=>r.status==='completed').length};
}

export async function compareAnnotations(previousOut,out) {
  if(await exists(join(out,'automatic/active.lock')))throw new Error('comparison_run_active');
  const [dataset,before,after,oldKnowledge,knowledge,oldManifest,manifest]=await Promise.all([read(join(out,'dataset.json')),read(join(previousOut,'automatic-draft.json')),read(join(out,'automatic-draft.json')),read(join(previousOut,'knowledge.json')),read(join(out,'knowledge.json')),read(join(previousOut,'automatic/manifest.json')),read(join(out,'automatic/manifest.json'))]);
  if(hash(oldManifest.model)!==hash(manifest.model)||oldManifest.codeHash!==manifest.codeHash||before.knowledgeHash!==hash(oldKnowledge)||after.knowledgeHash!==hash(knowledge)||knowledge.parentKnowledgeHash!==hash(oldKnowledge))throw new Error('comparison_version_or_model_binding');
  // Verify the actual archived requests, not merely the intended configuration.
  for(const c of dataset.cases.filter(c=>c.split==='evaluation')){
    const old=await read(join(previousOut,'automatic/runs',c.id+'.json')),next=await read(join(out,'automatic/runs',c.id+'.json'));
    if(old.status!=='completed')throw new Error('comparison_baseline_incomplete');
    if(!next.request){if(next.status==='completed')throw new Error('comparison_completed_request_missing');continue;}
    const requests=[old.request,next.request].map(r=>{const copy=structuredClone(r),input=JSON.parse(copy.messages[1].content);delete input.knowledge;copy.messages[1].content=JSON.stringify(input);return copy;});
    if(hash(requests[0])!==hash(requests[1]))throw new Error('comparison_nonknowledge_input_changed');
  }
  const comparison={...compareDrafts(dataset,before,after,{allowIncomplete:true}),model:manifest.model,previousKnowledgeHash:hash(oldKnowledge),knowledgeHash:hash(knowledge),previousDraftHash:hash(before),draftHash:hash(after),cost:{before:await attemptUsage(previousOut),after:await attemptUsage(out)}};
  await save(join(out,'annotation-comparison.json'),comparison);
  const fullSummary=`60 局 / ${comparison.games} 场牌谱 / 960 项主题判断。必须主题的卡片缺口标记 ${comparison.oldRequiredGaps} → ${comparison.newRequiredGaps}；涉及局面 ${comparison.oldGapCases} → ${comparison.newGapCases}。旧缺口中 ${comparison.oldGapsNowRequiredWithChapters} 项仍为必须且找到章节，${comparison.oldGapsNowDowngraded} 项被降为可选或不适用；新增缺口 ${comparison.newGapItems.length} 项。`;
  const summary=comparison.pairedCases===60?fullSummary:`原 60 局均保留，其中 ${comparison.pairedCases} 局完成复标、${60-comparison.pairedCases} 局失败。仅在完成的配对子集中，旧必须缺口 ${comparison.oldRequiredGaps} 项、新标记 ${comparison.newRequiredGaps} 项；原全体 60 局共有 ${comparison.oldRequiredGapsAll60} 项旧缺口。失败项标为未知，不计算全体改善率或区间。`;
  const css=(await Promise.all(['../../arena-console/style.css','../../arena-console/layout.css','./review.css'].map(p=>readFile(new URL(p,import.meta.url),'utf8')))).join('\n');
  const cell=t=>t.need===null?'<strong>复标未完成</strong><p>失败记录保留，不能作为没有需求、没有缺口或正确标注。</p>':`<strong>${labels[t.need]}${t.gap?' · 卡片缺口':''}</strong> · ${esc(confidenceNames[t.confidence]??t.confidence)}<p>${esc(t.reason)}</p><p>章节：${t.chapters.map(id=>`<a href="./knowledge.html#${esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`).join('、')||'无'}</p>`;
  const body=`<header><h1>60 局复标对照 · v1 / v2</h1><a href="./knowledge-needs-60.html">编辑新版标注</a><a href="./knowledge-audit.html">逐条知识卡修订</a></header><p class="summary">${summary}</p><p>这是同模型单次复标的差异诊断，没有逐项人工金标准，不能把缺口减少直接称为误判率下降。左列为旧版标注，右列为新版；两个列中的章节链接均打开新版卡片，原条件见逐条修订页。浅蓝行表示需求、缺口或章节集合改变。</p><nav><label>局面 <select id="case">${comparison.rows.map(r=>`<option value="${r.caseId}">${r.ordinal} · ${r.stratum==='random'?'随机':'挑战'} · ${r.complete?r.topics.filter(t=>t.changed).length+" 项变化":"复标未完成"}</option>`).join('')}</select></label><label><input type="checkbox" id="changed">只看改变的主题</label></nav>${comparison.rows.map(r=>`<section data-case="${esc(r.caseId)}"><h2>局面 ${r.ordinal}</h2>${graphicalScene(dataset.cases.find(c=>c.id===r.caseId).observation)}<table><tr><th class="topic">主题</th><th class="version">v1 标注</th><th class="version">v2 标注</th></tr>${r.topics.map(t=>`<tr data-changed="${t.changed}" class="${t.changed?'changed':''}"><th>${esc(topicNames[t.topic]??t.topic)}</th><td>${cell(t.before)}</td><td>${cell(t.after)}</td></tr>`).join('')}</table><p>旧备注：${esc(r.oldNotes)}</p><p>新备注：${esc(r.newNotes)}</p></section>`).join('')}<script>const picker=document.querySelector('#case'),changed=document.querySelector('#changed');function show(){document.querySelectorAll('[data-case]').forEach(s=>s.hidden=s.dataset.case!==picker.value);document.querySelectorAll('[data-changed]').forEach(r=>r.hidden=changed.checked&&r.dataset.changed==='false');}picker.onchange=()=>{location.hash=picker.value;show()};changed.onchange=show;function sync(){if([...picker.options].some(o=>o.value===location.hash.slice(1)))picker.value=location.hash.slice(1);show()}window.onhashchange=sync;sync();</script>`;
  await writeFile(join(out,'review/annotation-comparison.html'),page('60 局复标对照',body,css),'utf8');
  const format=x=>!x?'未计算（存在失败，不能仅按成功子集推断全体）':`${x.estimate.toFixed(3)} [${x.low?.toFixed(3)}, ${x.high?.toFixed(3)}]`;
  await writeFile(join(out,'ANNOTATION_COMPARISON.md'),`# 知识卡 v2 复标对照\n\n${summary}\n\n模型 gpt-6.1-sol / high；完成局面的请求正文除知识卡外逐局验证一致；失败保留为未知。40 卡全部复核，来源、标题、主题和概念不变，只修改条件及 4 张卡的限制文字。旧目录保持独立。\n\n完成的 ${comparison.pairedCases} 局中，主题判断变化 ${comparison.changedTopicDecisions}/${comparison.topicDecisions}，其中必须/可选/不适用等级变化 ${comparison.changedNeedDecisions} 项。必须主题总数 ${comparison.oldRequired} → ${comparison.newRequired}。\n\n每局必须缺口数量变化（新减旧，按完整牌谱分组 bootstrap 95% 区间；不是准确率）：全部 ${format(comparison.gapCountChangePerCase.all)}；随机 ${format(comparison.gapCountChangePerCase.random)}；挑战 ${format(comparison.gapCountChangePerCase.challenge)}。\n\n| 用量 | v1 | v2 |\n|---|---:|---:|\n| 尝试数（含归档失败） | ${comparison.cost.before.attempts} | ${comparison.cost.after.attempts} |\n| 失败尝试 | ${comparison.cost.before.failedAttempts} | ${comparison.cost.after.failedAttempts} |\n| 已知 tokens | ${comparison.cost.before.knownTokens} | ${comparison.cost.after.knownTokens} |\n| 用量未知尝试 | ${comparison.cost.before.unknownUsageAttempts} | ${comparison.cost.after.unknownUsageAttempts} |\n\n完成记录平均耗时：v1 ${(comparison.cost.before.meanCompletedElapsedMs/1000).toFixed(1)} 秒，v2 ${(comparison.cost.after.meanCompletedElapsedMs/1000).toFixed(1)} 秒；失败尝试比例（含补跑）：v1 ${(100*comparison.cost.before.failedAttempts/comparison.cost.before.attempts).toFixed(1)}%，v2 ${(100*comparison.cost.after.failedAttempts/comparison.cost.after.attempts).toFixed(1)}%。这两个批次并非同时交错运行，服务波动与内容长度的影响无法分离。\n\n用量不含 v1 修复规则投影之前的早期版本尝试。失败用量未知时不能假设为零。\n\n在可比较的旧缺口中，${comparison.oldGapsNowRequiredWithChapters} 项仍被标为必须并找到章节，${comparison.oldGapsNowDowngraded} 项被降级。没有逐项人工金标准，仍需防止宽泛匹配或需求等级误判；不能据此计算总体误判改善率或宣布 RAG 有效。每局仅保留首个成功结果，失败有限补跑，没有多次成功生成来隔离随机性。样本在修订前已被审阅，本批只能作修复诊断，不能再次声称为未见评测集。正式四组讲解和人工盲评未运行。\n\n逐项改变、旧缺口去向及新增缺口见 annotation-comparison.json；可视牌局与逐项理由见 review/annotation-comparison.html。\n`,'utf8');
  return {summary,cost:comparison.cost};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [command,previousOut,out]=process.argv.slice(2);if(command==='audit')await writeRevisionAudit(resolve(previousOut));else if(command==='compare')console.log(await compareAnnotations(resolve(previousOut),resolve(out)));else throw new Error('Usage: compare-annotations.mjs audit <new-out> | compare <old-out> <new-out>');}
