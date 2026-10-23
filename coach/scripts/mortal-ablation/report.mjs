import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCENE_PATTERN_IDS } from '@riichi-coach/contracts';
import { matchScenePatterns } from '@riichi-coach/reasoning';
import { createArenaScoringCaseInput, scoreArenaBatch } from '@riichi-coach/desktop/blind-discard-arena-scorer';
import { read, save, hash, clusterInterval, exists } from '../scene-study/common.mjs';
import { graphicalScene } from '../scene-study/review-presentation.mjs';
import { writeKnowledgeReader } from '../scene-study/knowledge-reader.mjs';
import { tileImages } from '../../arena-console/case-view.mjs';
import { verify, assemblies, armNames } from './experiment.mjs';

const sum = (xs, f) => xs.reduce((n,x) => n+f(x),0);
const mean = (xs, f) => xs.length ? sum(xs,f)/xs.length : null;
const pct = x => x === null ? '未知' : `${(x*100).toFixed(1)}%`;
const num = x => x === null ? '未知' : x.toFixed(2);
const esc = x => String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wilson(k,n) {
  if (!n) return { estimate:null,low:null,high:null,n };
  const z=1.959963984540054, p=k/n, den=1+z*z/n, center=(p+z*z/(2*n))/den, half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  return { estimate:p,low:Math.max(0,center-half),high:Math.min(1,center+half),n };
}
export function exactDiscordance(wins,losses) {
  const n=wins+losses; if (!n) return 1;
  let term=2**(-n), tail=term;
  for(let k=1;k<=Math.min(wins,losses);k++){term*= (n-k+1)/k;tail+=term;}
  return Math.min(1,2*tail);
}
export function holm(ps) {
  const ranked=ps.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p), out=[];let prior=0;
  for(let j=0;j<ranked.length;j++){prior=Math.max(prior,Math.min(1,ranked[j].p*(ranked.length-j)));out[ranked[j].i]=prior;}return out;
}
export function measure(c,run,label) {
  const attempt=run.result?.attempt ?? {status:'provider_error'};
  const input=createArenaScoringCaseInput({observation:c.observation,toolBinding:c.binding,reference:label.reference,attempt});
  const score=scoreArenaBatch([input]), verdict=score.cases[0];
  const s=attempt.status==='submitted'?attempt.submission:null, usage=run.result?.providerUsage;
  const tokens=usage?.tokens??usage?.reportedPartial??null;
  const reported=usage?.status==='reported'&&Number.isFinite(tokens?.totalTokens);
  const action=label.boundScores?.actions.find(a=>a.actionRef===s?.actionRef||a.physicalRealizations?.some(p=>p.actionRef===s?.actionRef));
  const returnedRefs=(run.retrieval??[]).flatMap(t=>t.result.sourceRefs);
  return {caseId:c.id,gameId:c.gameId,stratum:c.stratum,arm:run.arm,status:run.status,attemptStatus:attempt.status,verdict:verdict.status,reason:verdict.reason,match:Number(verdict.status==='matched'),scorable:verdict.status!=='unscorable',labelStatus:label.reference.status,
    mortalAction:label.reference.status==='available'?label.reference.label.actionRef:null,chosenAction:s?.actionRef??null,regret:action?label.boundScores.preferred.qValue-action.qValue:null,
    topQCount:label.boundScores?.actions.filter(a=>a.qValue===label.boundScores.preferred.qValue).length??null,
    legalCandidates:c.binding.candidates.length,usageStatus:reported?'reported':'unknown',tokens,elapsedMs:run.result?.elapsedMs??run.elapsedMs??null,providerFailureCodes:(run.result?.events??[]).filter(e=>e.type==='provider_turn'&&e.failureCode).map(e=>e.failureCode),
    queries:(run.retrieval??[]).length,noHits:(run.retrieval??[]).filter(t=>!t.result.passages.length).length,cardIds:[...new Set((run.retrieval??[]).flatMap(t=>t.cardIds))],
    returnedChars:sum(run.retrieval??[],t=>sum(t.result.passages,p=>p.content.length)),invalidSourceRefs:(s?.sourceRefs??[]).filter(r=>!returnedRefs.includes(r)),cited:(s?.sourceRefs??[]).map(r=>run.sourceMap[r]),submission:s,scoringInput:input};
}
export function aggregate(rows) {
  const scored=rows.filter(r=>r.scorable), full=rows.filter(r=>r.usageStatus==='reported');
  return {attempts:rows.length,completed:rows.filter(r=>r.status==='completed').length,failures:rows.filter(r=>r.status!=='completed').length,matches:sum(rows,r=>r.match),primary:wilson(sum(rows,r=>r.match),rows.length),conditional:wilson(sum(scored,r=>r.match),scored.length),labels:rows.filter(r=>r.labelStatus==='available').length,
    meanRegret:mean(rows.filter(r=>r.regret!==null),r=>r.regret),meanElapsedMs:mean(rows.filter(r=>r.elapsedMs!==null),r=>r.elapsedMs),knownTotalTokens:sum(rows,r=>r.tokens?.totalTokens??0),knownInputTokens:sum(rows,r=>r.tokens?.inputTokens??0),knownCachedInputTokens:sum(rows,r=>r.tokens?.cachedInputTokens??0),knownOutputTokens:sum(rows,r=>r.tokens?.outputTokens??0),unknownUsageRuns:rows.length-full.length,meanCompleteTokens:mean(full,r=>r.tokens.totalTokens),queries:sum(rows,r=>r.queries),noHits:sum(rows,r=>r.noHits),noQueryRuns:rows.filter(r=>!r.queries).length,invalidCitations:sum(rows,r=>r.invalidSourceRefs.length),statusCounts:rows.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),providerFailureCodes:rows.flatMap(r=>r.providerFailureCodes??[]).reduce((a,c)=>(a[c]=(a[c]??0)+1,a),{})};
}
export function contrast(pairs,treatment,control) {
  const wins=pairs.filter(p=>p[treatment].match>p[control].match).length, losses=pairs.filter(p=>p[treatment].match<p[control].match).length;
  const costs=pairs.filter(p=>p[treatment].usageStatus==='reported'&&p[control].usageStatus==='reported'&&p[control].tokens.totalTokens>0);
  return {contrast:`${treatment}-${control}`,pairs:pairs.length,wins,losses,ties:pairs.length-wins-losses,difference:clusterInterval(pairs,xs=>mean(xs,p=>p[treatment].match-p[control].match)),p:exactDiscordance(wins,losses),costPairs:costs.length,
    tokenRatio:costs.length?clusterInterval(costs,xs=>sum(xs,p=>p[treatment].tokens.totalTokens)/sum(xs,p=>p[control].tokens.totalTokens)):null};
}
function summaries(pairs,rows) {
  const comparisons=[['B','A'],['D','C'],['F','E'],['E','C'],['F','D']].map(([t,c])=>contrast(pairs,t,c));
  const adjusted=holm(comparisons.map(c=>c.p));comparisons.forEach((c,i)=>c.pHolm=adjusted[i]);
  return {arms:Object.fromEntries(Object.keys(assemblies).map(a=>[a,aggregate(rows.filter(r=>r.arm===a))])),comparisons,
    interaction:clusterInterval(pairs,xs=>mean(xs,p=>(p.F.match-p.E.match)-(p.D.match-p.C.match)))};
}
export async function report(out) {
  const config=await verify(out),dataset=await read(join(out,'dataset.json')),knowledge=await read(join(out,'knowledge.json')),receipt=await read(join(out,'labels-receipt.json'));
  if(receipt.datasetHash!==hash(dataset))throw new Error('label_receipt_dataset_mismatch');
  const runs=[],rows=[],labels=new Map();
  for(const c of dataset.cases){const l=await read(join(out,'private-labels',c.id+'.json'));if(receipt.rows.find(r=>r.caseId===c.id)?.hash!==hash(l)||l.datasetHash!==hash(dataset))throw new Error('label_receipt_changed');labels.set(c.id,l);}
  for(const j of config.schedule){const r=await read(join(out,'runs',`${j.split}-${j.caseId}-${j.arm}.json`));if(r.caseId!==j.caseId||r.arm!==j.arm||r.split!==j.split||r.freezeHash!==hash(config))throw new Error('ablation_run_binding_invalid');runs.push(r);rows.push(measure(dataset.cases.find(c=>c.id===j.caseId),r,labels.get(j.caseId)));}
  const cs=dataset.cases.filter(c=>c.split==='evaluation'),evalRows=rows.filter(r=>cs.some(c=>c.id===r.caseId));
  if(evalRows.length!==120||new Set(evalRows.map(r=>r.caseId+':'+r.arm)).size!==120)throw new Error('ablation_requires_120_attempts');
  const pairs=cs.map(c=>({caseId:c.id,gameId:c.gameId,stratum:c.stratum,...Object.fromEntries(Object.keys(assemblies).map(a=>[a,evalRows.find(r=>r.caseId===c.id&&r.arm===a)]))}));
  const checks=[];
  for(const c of cs){const requests={};for(const a of Object.keys(assemblies)) requests[a]=await read(join(out,'requests',`evaluation-${c.id}-${a}-1.json`));
    const check={caseId:c.id,originalEnhancedSame:hash(requests.C)===hash(requests.E)&&hash(requests.D)===hash(requests.F),sameFacts:new Set(Object.values(requests).map(r=>hash(r.messages[2]))).size===1,patternsOnly:[['A','B'],['C','D'],['E','F']].every(([off,on])=>hash(requests[on].messages.slice(0,-1))===hash(requests[off].messages)&&hash(requests[on].tools)===hash(requests[off].tools)),noSourceIdentity:Object.values(requests).every(r=>![c.gameId,c.sourceHash,c.sourceLocator].some(v=>JSON.stringify(r).includes(v)))};
    if(Object.values(check).some(v=>v===false))throw new Error('ablation_request_fairness_failed');checks.push(check);
  }
  const patterns=SCENE_PATTERN_IDS.map(id=>{const selected=cs.filter(c=>matchScenePatterns(c.facts).results.find(r=>r.patternId===id).status==='matched');const subset=pairs.filter(p=>selected.some(c=>c.id===p.caseId));return {patternId:id,support:subset.length,random:subset.filter(p=>p.stratum==='random').length,challenge:subset.filter(p=>p.stratum==='challenge').length,insufficient:cs.filter(c=>matchScenePatterns(c.facts).results.find(r=>r.patternId===id).status==='insufficient_data').length,comparisons:[['B','A'],['D','C'],['F','E']].map(([t,c])=>contrast(subset,t,c))};});
  const metrics={version:'mortal-ablation-report/v1',freezeHash:hash(config),labelsHash:hash(receipt),reportCodeHash:hash(await readFile(new URL('./report.mjs',import.meta.url))),model:config.provider,pooled:summaries(pairs,evalRows),strata:Object.fromEntries(['random','challenge'].map(s=>[s,summaries(pairs.filter(p=>p.stratum===s),evalRows.filter(r=>r.stratum===s))])),patterns,requestChecks:checks,rows:evalRows,allAttempts:aggregate(rows),pilot:aggregate(rows.filter(r=>r.stratum==='pilot')),
    limitations:['20 independent games, one generation per arm; challenge enrichment is not population sampling.','Agreement with Mortal native top-1 is not expert/explanation correctness; exact Q ties retained and native preferred action alone is label.','Bootstrap intervals and small pattern strata are exploratory; six groups do not identify an individual pattern effect.','Holm family is five pooled simple contrasts; stratum/pattern p values are descriptive only, not confirmatory tests.','Unknown failed-call token usage is never zero; known totals are lower bounds when incomplete.','No tuning or retries after freeze; this is a separate study, not the original 60-scene expert evaluation.']};
  await save(join(out,'metrics.json'),metrics);await save(join(out,'scoring-inputs.json'),evalRows.map(r=>r.scoringInput));
  await writeFile(join(out,'REPORT.md'),markdown(metrics));await render(out,dataset,knowledge,runs,metrics);return metrics;
}
function markdown(m) {
  const table=['|组|模式提示|检索|Mortal 一选一致|95% Wilson 区间|失败|已知 token|用量不完整|平均秒|','|---|---|---|---:|---|---:|---:|---:|---:|',...Object.entries(m.pooled.arms).map(([a,r])=>`|${a}|${assemblies[a].patterns?'有':'无'}|${assemblies[a].rag}|${r.matches}/${r.attempts} (${pct(r.primary.estimate)})|${pct(r.primary.low)}–${pct(r.primary.high)}|${r.failures}|${r.knownTotalTokens}|${r.unknownUsageRuns}|${num(r.meanElapsedMs/1000)}|`)].join('\n');
  const comparisons=['|比较|一致率差|按牌谱配对 95% 区间|改善／退步|Holm p|token 比（完整用量配对）|','|---|---:|---|---:|---:|---|',...m.pooled.comparisons.map(c=>`|${c.contrast}|${pct(c.difference.estimate)}|${pct(c.difference.low)}–${pct(c.difference.high)}|${c.wins}/${c.losses}|${c.pHolm.toPrecision(3)}|${num(c.tokenRatio?.estimate??null)} (${c.costPairs} 对；95% ${num(c.tokenRatio?.low??null)}–${num(c.tokenRatio?.high??null)})|`)].join('\n');
  const patterns=['|模式|命中数|随机／挑战|资料不足|','|---|---:|---|---:|',...m.patterns.map(p=>`|${p.patternId}|${p.support}|${p.random}/${p.challenge}|${p.insufficient}|`)].join('\n');
  const strata=Object.entries(m.strata).map(([s,x])=>`${s==='random'?'随机 12 局':'挑战 8 局'}：${Object.entries(x.arms).map(([a,r])=>`${a} ${r.matches}/${r.attempts}`).join('；')}。`).join('\n\n');
  const improved=m.pooled.comparisons.filter(c=>c.difference.low>0&&c.pHolm<.05).map(c=>c.contrast), degraded=m.pooled.comparisons.filter(c=>c.difference.high<0&&c.pHolm<.05).map(c=>c.contrast);
  return `# Mortal 一选标签：模式提示与增强检索消融\n\n20 场新牌谱，各一手；12 随机＋8 挑战。正式 120 次，另有 1 手六组试跑。模型 ${m.model.modelName} / ${m.model.reasoningEffort}。知识卡 v2 保持不变。A–F 为本实验组名，与旧四组实验命名无对应关系。\n\n${table}\n\n主分母包括失败；条件一致率、原始 Q regret、完整合法候选与原生并列 Q 数见 metrics.json。Q 差只作辅助，不是教学质量或实际收益。\n\n${comparisons}\n\nB−A、D−C、F−E 分别检验三种检索条件下模式提示的整体作用；E−C、F−D 检验增强检索相对原检索。交互差 (F−E)−(D−C) = ${pct(m.pooled.interaction.estimate)}，95% 区间 ${pct(m.pooled.interaction.low)}–${pct(m.pooled.interaction.high)}。同牌谱配对重采样 2000 次；五个主比较使用精确配对检验和 Holm 校正，分层及交互仅描述。\n\n${strata}\n\n当前主比较中，区间及校正检验同时支持正向一致率收益的比较：${improved.join('、')||'无'}；同时支持一致率下降的比较：${degraded.join('、')||'无'}。其余比较仍不能排除无差异。无论一致率如何，都不能由此认定专家讲解质量提高。仅一次生成且样本有限；区间不能排除无收益时结论为证据不足，不据此删除单条模式。\n\n正式＋试跑合计 ${m.allAttempts.attempts} 次，失败 ${m.allAttempts.failures} 次；已回报 token ${m.allAttempts.knownTotalTokens}，另有 ${m.allAttempts.unknownUsageRuns} 次用量不完整。缓存输入 ${m.allAttempts.knownCachedInputTokens} 已包含在输入 ${m.allAttempts.knownInputTokens} 内，输出 ${m.allAttempts.knownOutputTokens}；不重复相加。各比较 token 比仅使用双方用量完整的配对，失败仍留在主一致率分母；成本目标 1.3 倍。\n\n${patterns}\n\n模式共现，以上命中分层不是逐条删除消融，不能归因到单一模式。无命中或少量命中均不声称已验证。\n\n20 局初始请求公平性检查全部通过：原检索与增强检索同提示条件下初始请求逐字相同；事实补充六组相同；模式开关仅增减关注点。Mortal 标签在独立私有文件中，模型运行程序不读标签，提交锁定后由现有 Arena 评分器绑定全部合法候选，处理摸切／手切对应关系。\n\n[图形牌局与六组答案](./review/index.html) · [逐次数据、成本与区间](./metrics.json) · [冻结配置](./freeze.json)\n`;
}
export async function preview(out) {
  const config=await verify(out),dataset=await read(join(out,'dataset.json')),knowledge=await read(join(out,'knowledge.json')),receipt=await read(join(out,'labels-receipt.json')),runs=[],rows=[];
  for(const j of config.schedule.filter(j=>j.split==='evaluation')){
    const c=dataset.cases.find(c=>c.id===j.caseId),label=await read(join(out,'private-labels',c.id+'.json'));
    if(label.datasetHash!==hash(dataset)||receipt.rows.find(r=>r.caseId===c.id)?.hash!==hash(label))throw new Error('preview_label_changed');
    const path=join(out,'runs',`${j.split}-${j.caseId}-${j.arm}.json`);
    if(await exists(path)){const run=await read(path);if(run.freezeHash!==hash(config))throw new Error('preview_run_changed');runs.push(run);rows.push(measure(c,run,label));}
    else {runs.push({...j,status:'not_started',retrieval:[]});rows.push({caseId:c.id,arm:j.arm,status:'not_started',match:0,scorable:false,mortalAction:label.reference.label?.actionRef??null,chosenAction:null,tokens:null,usageStatus:'pending',elapsedMs:null,submission:null,cited:[],queries:0});}
  }
  await render(out,dataset,knowledge,runs,{rows});
  return {archived:rows.filter(r=>r.status!=='not_started').length,planned:120};
}
async function render(out,dataset,knowledge,runs,m) {
  const dir=join(out,'review');await mkdir(join(dir,'assets/tiles'),{recursive:true});
  const source=new URL('../../packages/desktop/src/renderer/tiles/',import.meta.url);for(const f of await readdir(source))if(f.endsWith('.svg'))await copyFile(new URL(f,source),join(dir,'assets/tiles',f));
  await writeKnowledgeReader(dir,knowledge);const reader=join(dir,'knowledge.html');await writeFile(reader,(await readFile(reader,'utf8')).replaceAll('./knowledge-needs-60.html','./index.html').replaceAll('返回局面标注','返回消融对照').replace(/<a href="\.\/knowledge-audit\.html">[^<]*<\/a>/,''));
  const css=(await Promise.all(['../../arena-console/style.css','../../arena-console/layout.css','../scene-study/review.css'].map(p=>readFile(new URL(p,import.meta.url),'utf8')))).join('\n');
  const cs=dataset.cases.filter(c=>c.split==='evaluation'), pending=m.rows.filter(r=>r.status==='not_started').length, hasReport=await exists(join(out,'REPORT.md'));
  const tile=(c,ref)=>{const a=c.binding.candidates.flatMap(a=>a.physicalRealizations).find(p=>p.actionRef===ref);return a?tileImages([a.action.tile],a.action.discardMode==='tsumogiri'?'摸切':'手切').replaceAll('src="/tiles/','loading="lazy" src="./assets/tiles/'):'无有效提交';};
  const articles=cs.map((c,i)=>{const rows=m.rows.filter(r=>r.caseId===c.id);return `<article data-case="${i}" ${i?'hidden':''}><h2>局面 ${i+1} · ${c.stratum==='random'?'随机':'挑战'}</h2>${graphicalScene(c.observation)}<p>Mortal 一选：${tile(c,rows[0].mortalAction)}　命中模式：${esc(matchScenePatterns(c.facts).results.filter(p=>p.status==='matched').map(p=>p.patternId).join('、')||'无')}</p><div class="comparisons">${Object.keys(assemblies).map(a=>{const r=rows.find(r=>r.arm===a),run=runs.find(r=>r.caseId===c.id&&r.arm===a);return `<section><h3>${a} · ${armNames[a]}</h3><p>${tile(c,r.chosenAction)}　${r.status==='not_started'?'等待本组结果':r.match?'与 Mortal 一选相同':r.scorable?'与 Mortal 一选不同':'不可评分'} · ${esc(r.status==='not_started'?'待归档':r.status)}</p><p>token ${r.tokens?.totalTokens??'未知'}${r.usageStatus==='reported'?'':'（用量不完整）'} · ${num(r.elapsedMs===null?null:r.elapsedMs/1000)} 秒</p><p class="answer">${esc(r.submission?.rationale??'无有效讲解')}</p><p>${esc(r.submission?.uncertainty)}</p><p>来源：${r.cited.map(id=>`<a href="./knowledge.html#${esc(id)}">${esc(id)} ${esc(knowledge.cards.find(k=>k.id===id)?.title)}</a>`).join('；')||'无'}</p><details><summary>实际查询与返回内容（${r.queries} 次）</summary>${(run.retrieval??[]).map(t=>`<h4>${esc(t.query)}</h4>${t.result.passages.map((p,j)=>`<p><a href="./knowledge.html#${esc(t.cardIds[j])}">${esc(p.sourceTitle)}</a></p><pre>${esc(p.content)}</pre>`).join('')}`).join('')}</details></section>`;}).join('')}</div></article>`;}).join('');
  await writeFile(join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mortal 标签消融对照</title><style>${css}\n[hidden]{display:none!important}.comparisons{display:grid;grid-template-columns:1fr 1fr;gap:24px}.comparisons section{min-width:0}.answer,pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#24598c}@media(max-width:900px){.comparisons{grid-template-columns:1fr}}</style><body class="study-review"><header><b>Arena · Mortal 标签消融</b><a href="./knowledge.html">教材知识卡与原文</a>${hasReport?'<a href="../REPORT.md">结果报告</a>':'<span>统计待全部尝试结束后生成</span>'}</header><p>已归档 ${120-pending}/120 次；${pending?'其余可能正在运行或尚未开始，以下不作胜负结论。':'全部尝试已归档。'}</p><p>20 场独立牌谱，六组配对。Mortal 一选用于决策一致性评分，不代表讲解正确性。这里展示组别用于诊断，不是盲评。</p><nav class="study-navigation"><label>局面 <select id="case-picker">${cs.map((c,i)=>`<option value="${i}">${i+1} / 20 · ${c.stratum==='random'?'随机':'挑战'}</option>`).join('')}</select></label></nav>${articles}<script>document.querySelector('#case-picker').addEventListener('change',e=>document.querySelectorAll('[data-case]').forEach(a=>a.hidden=a.dataset.case!==e.target.value));</script></body></html>`);
}
