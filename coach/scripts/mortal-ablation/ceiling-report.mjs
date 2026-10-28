import { readdir,readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createArenaScoringCaseInput,scoreArenaBatch } from '@riichi-coach/desktop/blind-discard-arena-scorer';
import { graphicalScene } from '../scene-study/review-presentation.mjs';
import { tileImages } from '../../arena-console/case-view.mjs';
import { exactDiscordance,holm,wilson } from './report.mjs';
import { BudgetLedger,ARMS,SEED,ROOT,hash,read,save,writeOnce,exists,ordered,verify,chooseVersion,mean } from './ceiling-protocol.mjs';
import { VERSIONS,sceneTopics } from './ceiling-textbook.mjs';
import { publicCase,validateDecision } from './ceiling-run.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>x===null||x===undefined?'未知':(x*100).toFixed(1)+'%';
const quantile=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.floor(p*a.length))]:null;};
export function summarizeRows(rows){
  const valid=rows.filter(r=>r.status==='submitted'),tokens=rows.filter(r=>Number.isFinite(r.usage?.totalTokens));
  const usageFields=Object.fromEntries(['inputTokens','cachedInputTokens','outputTokens','totalTokens'].map(field=>{const known=rows.filter(r=>Number.isFinite(r.usage?.[field]));return [field,{reportedRuns:known.length,unknownRuns:rows.length-known.length,knownSum:known.length?known.reduce((n,r)=>n+r.usage[field],0):null}];}));
  const lowerBound=rows.map(r=>Number.isFinite(r.usage?.totalTokens)?r.usage.totalTokens:[r.usage?.inputTokens,r.usage?.outputTokens].filter(Number.isFinite).reduce((a,b)=>a+b,0));
  return {planned:rows.length,started:rows.filter(r=>r.status!=='not_started').length,matches:rows.reduce((n,r)=>n+r.match,0),rate:mean(rows.map(r=>r.match)),interval:wilson(rows.reduce((n,r)=>n+r.match,0),rows.length),submitted:valid.length,successRate:rows.length?valid.length/rows.length:null,conditionalRate:mean(valid.map(r=>r.match)),meanRegret:mean(rows.map(r=>r.regret).filter(Number.isFinite)),p90Regret:quantile(rows.map(r=>r.regret),.9),statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]??0)+1,a),{}),knownTokens:tokens.reduce((n,r)=>n+r.usage.totalTokens,0),knownTokensLowerBound:lowerBound.reduce((a,b)=>a+b,0),usageFields,cachedInputAlreadyIncluded:true,unknownUsage:rows.length-tokens.length,meanSeconds:mean(rows.map(r=>r.elapsedMs===null?null:r.elapsedMs/1000).filter(Number.isFinite)),patternCoverage:mean(rows.map(r=>Number(r.patterns?.length>0))),noHits:rows.filter(r=>r.retrieval?.noHits).length};
}
export function pairedDifference(rows,treatment,control){
  const ids=[...new Set(rows.map(r=>r.caseId))],pairs=ids.map(id=>({t:rows.find(r=>r.caseId===id&&r.arm===treatment),c:rows.find(r=>r.caseId===id&&r.arm===control)})).filter(p=>p.t&&p.c);
  const ds=pairs.map(p=>p.t.match-p.c.match),wins=ds.filter(x=>x>0).length,losses=ds.filter(x=>x<0).length;
  let state=0x521728;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
  const estimates=[];if(ds.length>1)for(let i=0;i<2000;i++){let total=0;for(let j=0;j<ds.length;j++)total+=ds[Math.floor(random()*ds.length)];estimates.push(total/ds.length);}
  const complete=pairs.filter(p=>Number.isFinite(p.t.usage?.totalTokens)&&Number.isFinite(p.c.usage?.totalTokens));
  const cTokens=complete.reduce((n,p)=>n+p.c.usage.totalTokens,0);
  return {treatment,control,pairs:pairs.length,estimate:mean(ds),low:quantile(estimates,.025),high:quantile(estimates,.975),wins,losses,p:exactDiscordance(wins,losses),tokenPairs:complete.length,tokenRatio:cTokens?complete.reduce((n,p)=>n+p.t.usage.totalTokens,0)/cTokens:null};
}
export function decide(m){
  if(!m.complete)return '实验未完成，尚不能给出路线有效性或上限结论。';
  const primary=m.natural.comparisons[0],d=m.natural.arms.D;
  if(primary.estimate>=.05&&primary.low>0&&d.successRate>=.95)return '达到预设继续投入标准：自然集增益至少5个百分点、配对区间支持正向收益，且成功率达标。';
  if(d.successRate<.95)return '运行成功率未达95%，本轮保留全部失败；尚不能将观测一致率解释为稳定能力上限。';
  if(primary.high<.05)return '本轮区间未支持达到预设5个百分点的投入价值；停止本轮追加，不能据此宣称所有规则路线无效。';
  return '证据不足：区间仍容纳无收益或有价值收益，不将其解释为路线被证伪。';
}
async function rowsFor(out,dataset,phase,arms,versions){
  const datasetHash=hash(dataset);
  const ledger=new BudgetLedger(out),settlements=new Map(ledger.rows.filter(x=>x.type==='settle').map(x=>[x.key,x.result]));
  const selected=phase==='development'?dataset.cases.filter(c=>c.split==='development'):phase==='evaluation'?dataset.cases.filter(c=>c.split==='evaluation'):dataset.cases.filter(c=>(phase==='oracle'?dataset.oracle:phase==='practical'?dataset.practical:dataset.stability).includes(c.id));
  const rows=[];
  for(const c of selected){
    const label=await read(join(out,'private-labels',c.id+'.json'));
    const receipt=await read(join(out,'labels-receipt.json')),binding=receipt.rows.find(r=>r.caseId===c.id);
    if(!binding||binding.hash!==hash(label)||label.datasetHash!==datasetHash)throw Error('report_label_changed');
    for(const arm of arms){
      const prefix=phase==='development'?'dev-'+arm:phase,key=prefix+'-'+c.id+'-'+(phase==='development'?arm==='A'?'A':arm==='V0'?'V0':'D':arm);
      let run=await exists(join(out,'runs',key+'.json'))?await read(join(out,'runs',key+'.json')):{key,caseId:c.id,arm,status:'not_started',attempt:{status:'missing_submission'},elapsedMs:null,retrieval:null,patterns:[]};
      if(run.caseId!==c.id)throw Error('report_run_case_mismatch');
      if(ledger.claims.has(key)){
        const call=await read(join(out,'calls',key+'.json')),request=await read(join(out,'requests',key+'.json'));
        if(ledger.claims.get(key).requestDigest!==hash({request:request.request,model:request.model})||call.requestDigest!==ledger.claims.get(key).requestDigest)throw Error('report_request_changed');
        const settled=settlements.get(key);if(settled?.callDigest&&settled.callDigest!==hash(call))throw Error('report_call_changed');
        const body=JSON.parse(request.request.messages[1].content),pub=publicCase(c);
        if(hash(body.observation)!==hash(pub.observation)||hash(body.facts)!==hash(pub.facts))throw Error('report_visible_case_changed');
        const derived=validateDecision(call.response,{observation:pub.observation,evidenceRefs:body.citationPermissions.evidenceRefs,sourceRefs:body.citationPermissions.sourceRefs});
        if(hash(derived.attempt)!==hash(run.attempt)||hash(call.response.usage??null)!==hash(run.usage??null))throw Error('report_submission_changed');
      }else if(run.status==='submitted')throw Error('report_submission_without_call');
      const input=createArenaScoringCaseInput({observation:c.observation,toolBinding:c.binding,reference:label.reference,attempt:run.attempt}),score=scoreArenaBatch([input]);
      const ref=run.attempt.status==='submitted'?run.attempt.submission.actionRef:null;
      const action=label.boundScores.actions.find(a=>a.actionRef===ref||a.physicalRealizations?.some(p=>p.actionRef===ref));
      rows.push({...run,version:phase==='development'?arm:run.version,stratum:c.stratum,gameId:c.gameId,match:Number(score.cases[0].status==='matched'),regret:action?label.boundScores.preferred.qValue-action.qValue:null,mortalAction:label.reference.label.actionRef,chosenAction:ref,scoringInput:input});
    }
  }
  return rows;
}
export async function selectCeilingVersion(out){
  const f=await verify(out),d=await read(join(out,'dataset.json'));
  const rows=await rowsFor(out,d,'development',['A','V0','r1','r2','r3']);
  if(rows.some(r=>r.status==='not_started'))throw Error('development_not_complete');
  const version=chooseVersion(rows,VERSIONS),summary=VERSIONS.map(v=>({version:v.id,...summarizeRows(rows.filter(r=>r.version===v.id&&r.stratum==='random'))}));
  const receipt={freezeHash:hash(f),version,developmentResultsDigest:hash(rows),summary,selection:'natural all-attempt agreement, mean Q regret, rule count, creation order'};
  await writeOnce(join(out,'selected-version.json'),receipt);await writeOnce(join(out,'selection-binding.json'),{selectionHash:hash(receipt)});await save(join(out,'development-metrics.json'),{rows,receipt});return receipt;
}
function armMetrics(rows,arms=ARMS){
  const comparisons=[['D','A'],['D','V0'],['D','B'],['D','C']].map(([t,c])=>pairedDifference(rows,t,c)),adjusted=holm(comparisons.slice(1).map(c=>c.p));
  comparisons.slice(1).forEach((c,i)=>c.adjustedP=adjusted[i]);
  return {arms:Object.fromEntries(arms.map(a=>[a,summarizeRows(rows.filter(r=>r.arm===a))])),comparisons};
}
export async function reportCeiling(out,{progressOnly=false}={}){
  if(progressOnly){const ledger=new BudgetLedger(out),d=await exists(join(out,'dataset.json'))?await read(join(out,'dataset.json')):await exists(join(out,'prepare-state.json'))?await read(join(out,'prepare-state.json')):{cases:[]};const status={version:'ceiling-progress/v1',calls:ledger.snapshot(),prepared:d.cases?.length??d.caseRefs?.length??0,required:980,phases:await readdir(join(out,'phases')).catch(()=>[])};await save(join(out,'progress.json'),status);return status;}
  const f=await verify(out),d=await read(join(out,'dataset.json')),ledger=new BudgetLedger(out);
  const rows=await rowsFor(out,d,'evaluation',ARMS),oracle=await rowsFor(out,d,'oracle',['O']),practical=await rowsFor(out,d,'practical',['A','V0','D','O']),stability=await rowsFor(out,d,'stability',['A','D']);
  const complete=[...rows,...oracle,...practical,...stability].every(r=>r.status!=='not_started');
  if(!complete)throw Error('formal_evaluation_not_complete_no_early_winner_report');
  const natural=armMetrics(rows.filter(r=>r.stratum==='random')),challenge=armMetrics(rows.filter(r=>r.stratum==='challenge'));
  const withOracle=[...rows.filter(r=>d.oracle.includes(r.caseId)),...oracle];
  const metrics={version:'ceiling-report/v1',complete,freezeHash:hash(f),engineeringSupplement:f.engineeringSupplement??null,reportCodeDigest:hash(await readFile(new URL('./ceiling-report.mjs',import.meta.url))),selected:await read(join(out,'selected-version.json')),textbook:await read(join(out,'textbook/manifest.json')),budget:ledger.snapshot(),natural,challenge,oracle:{summary:summarizeRows(oracle),versusD:pairedDifference(withOracle,'O','D'),versusA:pairedDifference(withOracle,'O','A'),authority:'AI selection, not expert gold; same context cap; not a mathematical upper bound'},practical:{arms:Object.fromEntries(['A','V0','D','O'].map(a=>[a,summarizeRows(practical.filter(r=>r.arm===a))])),versusA:pairedDifference(practical,'D','A'),tokenTarget:1.3},stability:{summary:summarizeRows(stability),rows:stability},screening:d.screening,patterns:[...new Set(rows.flatMap(r=>r.patterns??[]))].map(id=>({id,naturalSupport:new Set(rows.filter(r=>r.stratum==='random'&&r.patterns?.includes(id)).map(r=>r.caseId)).size,challengeSupport:new Set(rows.filter(r=>r.stratum==='challenge'&&r.patterns?.includes(id)).map(r=>r.caseId)).size})),rows,oracleRows:oracle,practicalRows:practical};
  metrics.conclusion=decide(metrics);
  const primary=natural.comparisons[0];
  const table=['|组|匹配 / 计划|全尝试一致率|有效提交一致率|成功率|平均 Q 差|','|---|---:|---:|---:|---:|---:|',...ARMS.map(a=>{const x=natural.arms[a];return `|${a}|${x.matches}/${x.planned}|${pct(x.rate)}|${pct(x.conditionalRate)}|${pct(x.successRate)}|${x.meanRegret??'未知'}|`;})].join('\n');
  const exclusion=`扫描并实际评估牌谱 ${d.cases.length+d.rejectedGames} 场，入样 ${d.cases.length} 场，完整性或其他错误排除 ${d.rejectedGames} 场（${pct(d.rejectedGames/(d.cases.length+d.rejectedGames))}）。统一排除含西入延长局的牌谱。新增规则查询窗口 ${d.screening.checked} 个，其中因存在非弃牌动作排除 ${d.screening.contains_non_discard_action??0} 个；另复用已核验可见事实缓存 ${d.screening.cacheHits??0} 场，正式前全部重新绑定标签。窗口排除比例只描述本次新增查询。`;
  const text=`# 场景模式＋直接匹配 RAG 实测报告\n\n${metrics.conclusion}\n\n## 自然集主要结果\n\n${table}\n\nD−A：${pct(primary.estimate)}，配对95%区间 ${pct(primary.low)} 至 ${pct(primary.high)}。次要比较 D−V0、D−B、D−C 的 Holm 校正检验、挑战集及模式支持数见 metrics.json。\n\n## 上限与瓶颈\n\n开发集选中 ${metrics.selected.version}。优选资料 O−D 为 ${pct(metrics.oracle.versusD.estimate)}，区间 ${pct(metrics.oracle.versusD.low)} 至 ${pct(metrics.oracle.versusD.high)}；选材是独立 AI 判断，失败保留，不是专家金标准或理论上限。统计差异本身不能证明资料遗漏是原因。\n\n## 实用性\n\n实用模型 D−A 为 ${pct(metrics.practical.versusA.estimate)}，完整用量配对 ${metrics.practical.versusA.tokenPairs}，token 比值 ${metrics.practical.versusA.tokenRatio??'未知'}，目标1.3倍。未知用量不补零。\n\n## 解释范围\n\n${exclusion}\n\n自然集是600场等权牌谱的纯弃牌窗口；挑战集200题另报。Mortal原生一选是偏好参照，不代表教学正确、实战收益或完整自摸决策能力。所有核心组只有一次生成；重复样本不选优。教材为固定232章快照，过预算完整单元与未能查看的图片限制见逐题资料记录。\n\n本轮按用户批准增加50次工程复验额度；此前中断轮2748次另档，未抹除。新增10场局面只用于工程，不进入开发或正式统计。\n\n实验实际模型请求 ${metrics.budget.claimed}/${Object.values(f.budgets).reduce((a,b)=>a+b,0)}；各阶段、失败及用量见 calls.jsonl。\n\n[逐题图形入口](review/index.html)\n`;
  await save(join(out,'metrics.json'),metrics);await save(join(out,'scoring-inputs.json'),rows.map(r=>r.scoringInput));await writeFile(join(out,'REPORT.md'),text);
  await renderCeiling(out,d,metrics);await save(join(out,'archive-manifest.json'),{freezeHash:hash(f),metricsHash:hash(metrics),ledgerHead:ledger.rows.at(-1)?.digest,reportHash:hash(text)});return metrics;
}

async function renderCeiling(out,d,m){
  const dir=join(out,'review');await mkdir(join(dir,'assets/tiles'),{recursive:true});
  const tiles=join(ROOT,'packages/desktop/src/renderer/tiles');for(const file of await readdir(tiles))if(file.endsWith('.svg'))await copyFile(join(tiles,file),join(dir,'assets/tiles',file));
  const css=(await Promise.all(['arena-console/style.css','arena-console/layout.css','scripts/scene-study/review.css'].map(p=>readFile(join(ROOT,p),'utf8')))).join('\n')+'\n[hidden]{display:none!important}pre{white-space:pre-wrap;overflow-wrap:anywhere}.comparisons{display:grid;grid-template-columns:1fr 1fr;gap:20px}.comparisons section{min-width:0}a{color:#3973a5}@media(max-width:900px){.comparisons{grid-template-columns:1fr}}';
  await writeFile(join(dir,'style.css'),css);
  const shell=(title,body)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="style.css"><body class="study-review"><header><b>${esc(title)}</b><a href="index.html">返回结果</a><a href="knowledge.html">完整教材</a></header>${body}</body></html>`;
  const index=await read(join(out,'textbook/index.json'));
  await writeFile(join(dir,'knowledge.html'),shell('冻结教材正文',index.passages.map(p=>`<section id="${esc(p.id)}"><h2>${esc(p.chapterTitle)} · ${esc(p.title)}</h2><p>${esc(p.contentRole)}；完整单元 ${p.content.length} 字符</p><pre>${esc(p.content)}</pre></section>`).join('')));
  const cases=d.cases.filter(c=>c.split==='evaluation');
  const tile=(c,ref)=>{const a=c.binding.candidates.flatMap(x=>x.physicalRealizations).find(p=>p.actionRef===ref);return a?tileImages([a.action.tile],a.action.discardMode==='tsumogiri'?'摸切':'手切').replaceAll('src="/tiles/','src="assets/tiles/'):'无有效提交';};
  for(const [i,c]of cases.entries()){
    const rows=[...m.rows,...m.oracleRows].filter(r=>r.caseId===c.id),label=await read(join(out,'private-labels',c.id+'.json'));
    const body=`<nav><a href="${i?'case-'+cases[i-1].id+'.html':'index.html'}">上一题</a> · ${i+1}/${cases.length} · <a href="${i+1<cases.length?'case-'+cases[i+1].id+'.html':'index.html'}">下一题</a></nav>${graphicalScene(c.observation)}<p>Mortal 原生一选：${tile(c,label.reference.label.actionRef)}；${esc(c.stratum)}</p><details><summary>共同候选事实</summary><pre>${esc(JSON.stringify(c.facts,null,2))}</pre></details><div class="comparisons">${rows.map(r=>`<section><h2>${esc(r.arm)}</h2><p>${tile(c,r.chosenAction)} · ${r.match?'一致':'未匹配'} · ${esc(r.status)}</p><p>Q 差 ${r.regret??'未知'}；token ${r.usage?.totalTokens??'未知'}</p><p>${esc(r.attempt.submission?.rationale??'无有效提交')}</p><p>${esc(r.attempt.submission?.uncertainty??'')}</p><p>模式：${esc([...(r.patterns??[]),...(r.extraPatterns??[])].join('、')||'无')}</p><details><summary>实际交付资料与限制</summary>${(r.retrieval?.passages??[]).map(p=>`<a href="knowledge.html#${esc(p.id)}">${esc(p.title)}</a><pre>${esc(p.content)}</pre>`).join('')}<pre>${esc(JSON.stringify(r.retrieval?.rejected??[],null,2))}</pre></details></section>`).join('')}</div><details><summary>Mortal 完整候选 Q</summary><pre>${esc(JSON.stringify(label.boundScores.actions,null,2))}</pre></details>`;
    await writeFile(join(dir,'case-'+c.id+'.html'),shell('纯弃牌配对局面 '+(i+1),body));
  }
  await writeFile(join(dir,'index.html'),shell('场景模式＋直接匹配 RAG 评测',`<p>${esc(m.conclusion)}</p><p>自然集600题；挑战集200题；最终版本 ${esc(m.selected.version)}。Mortal 一致率不是教材正确率。</p><table><thead><tr><th>组</th><th>匹配/计划</th><th>一致率</th><th>成功率</th></tr></thead><tbody>${ARMS.map(a=>{const s=m.natural.arms[a];return `<tr><td>${a}</td><td>${s.matches}/${s.planned}</td><td>${pct(s.rate)}</td><td>${pct(s.successRate)}</td></tr>`;}).join('')}</tbody></table><ol>${cases.map((c,i)=>`<li><a href="case-${c.id}.html">局面 ${i+1} · ${c.stratum==='random'?'自然':'挑战'}</a></li>`).join('')}</ol>`));
}
