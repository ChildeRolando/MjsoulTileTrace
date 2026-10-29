import {writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {BudgetLedger,ARMS,hash,read,save,mean,exists} from './ceiling-protocol.mjs';
import {verifyModelStudy,modelRunKey} from './ceiling-model-study.mjs';
import {scoreCeilingRows,renderCeilingReview,summarizeRows,pairedDifference} from './ceiling-report.mjs';
import {holm} from './report.mjs';
export const MODEL_LABELS={sol:'gpt-6.1-sol / high',deepseek_via_claude:'DeepSeek V4.1 Flash / Claude Code opus high / Command Code',terra:'gpt-6.1-terra / high',practical:'gpt-6-luna / max'};
const pct=x=>Number.isFinite(x)?(x*100).toFixed(1)+'%':'未知';
const number=x=>Number.isFinite(x)?x.toFixed(3):'未知';
export function modelArmMetrics(rows){return {arms:Object.fromEntries(ARMS.map(a=>[a,summarizeRows(rows.filter(r=>r.arm===a))])),comparisons:['A','V0','B','C'].map(a=>pairedDifference(rows,'D',a))};}
export function adjustModelComparisons(byModel){
  const values=Object.values(byModel),primary=values.map(x=>x.natural.comparisons[0]),secondary=values.flatMap(x=>x.natural.comparisons.slice(1));
  holm(primary.map(c=>c.p)).forEach((p,i)=>primary[i].adjustedP=p);holm(secondary.map(c=>c.p)).forEach((p,i)=>secondary[i].adjustedP=p);
}
export function modelDecision(v){
  const d=v.overallArms.D,c=v.natural.comparisons[0];
  if(d.successRate<.95)return '运行成功率未达到95%；保留失败，不能将本轮结果称为稳定能力上限。';
  if(c.estimate>=.05&&c.low>0&&c.adjustedP<.05)return '达到继续投入线：增益至少5个百分点、配对区间下界为正、多模型主检验校正后通过，且成功率达标。';
  if(c.high<.05)return '未支持达到预设5个百分点的投入价值；本轮收口，不推断所有规则路线无效。';
  return '证据不足：区间仍容纳无收益或有价值收益。';
}
function tokenTotals(calls){
  return {calls:calls.length,usage:Object.fromEntries(['inputTokens','cachedInputTokens','outputTokens','totalTokens'].map(field=>{const known=calls.filter(c=>Number.isFinite(c.usage?.[field]));return [field,{knownCalls:known.length,unknownCalls:calls.length-known.length,knownSum:known.length?known.reduce((n,c)=>n+c.usage[field],0):null}];})),knownSeconds:calls.reduce((n,c)=>n+(Number.isFinite(c.elapsedMs)?c.elapsedMs/1000:0),0),unknownDurationCalls:calls.filter(c=>!Number.isFinite(c.elapsedMs)).length};
}
function stabilityMetrics(repeats,first,d){
  const cases=new Map(d.cases.map(c=>[c.id,c]));
  const canonical=r=>r.status==='submitted'?cases.get(r.caseId).binding.candidates.findIndex(c=>c.physicalRealizations.some(p=>p.actionRef===r.chosenAction)):null;
  return Object.fromEntries(['A','D'].map(arm=>{const pairs=repeats.filter(r=>r.arm===arm).map(r=>({r,first:first.find(x=>x.caseId===r.caseId&&x.arm===arm)}));const valid=pairs.filter(p=>p.r.status==='submitted'&&p.first?.status==='submitted'),same=valid.filter(p=>canonical(p.r)===canonical(p.first)).length;return [arm,{plannedPairs:pairs.length,bothValid:valid.length,sameChoice:same,sameChoiceAllAttempts:pairs.length?same/pairs.length:null,sameChoiceConditional:valid.length?same/valid.length:null,repeatMinusFirstAgreement:mean(pairs.map(p=>p.r.match-p.first.match))}];}));
}
export async function reportModelStudy(out){
  const f=await verifyModelStudy(out),d=await read(join(out,'dataset.json')),ledger=new BudgetLedger(out,f.budgets);
  const score=async(phase,arms)=>{
    const rows=await scoreCeilingRows(out,d,phase,arms,null,{budgets:f.budgets,keyFor:(c,a)=>modelRunKey(phase,c,a,phase==='practical'?'practical':f.assignment[c.id].model),modelFor:c=>f.models[phase==='practical'?'practical':f.assignment[c.id].model]});
    return rows.map(r=>({...r,modelProfileId:phase==='practical'?'practical':f.assignment[r.caseId].model}));
  };
  const rows=await score('evaluation',ARMS),oracle=await score('oracle',['O']),practical=await score('practical',['A','V0','D','O']),stability=await score('stability',['A','D']);
  if([...rows,...oracle,...practical,...stability].some(r=>r.status==='not_started')||ledger.snapshot().unsettled)throw Error('model_study_incomplete_no_early_winner_report');
  const extraByCase=new Map();for(const key of f.legacySupplementalKeys){const [,id,arm]=key.split('-');if(!extraByCase.has(id))extraByCase.set(id,[]);extraByCase.get(id).push(arm);}
  const supplemental=(await scoreCeilingRows(out,d,'evaluation',ARMS,null,{budgets:f.budgets,selectedCases:d.cases.filter(c=>extraByCase.has(c.id)),armsFor:c=>extraByCase.get(c.id),modelFor:()=>f.models.sol})).map(r=>({...r,modelProfileId:'sol',supplemental:true}));
  if(rows.length!==4000||supplemental.length!==90||oracle.length!==200||practical.length!==400||stability.length!==100)throw Error('model_report_planned_denominator_changed');
  const byModel={};
  for(const model of ['sol','deepseek_via_claude','terra']){
    const selected=rows.filter(r=>r.modelProfileId===model),o=oracle.filter(r=>r.modelProfileId===model),oIds=new Set(o.map(r=>r.caseId));
    byModel[model]={overallArms:Object.fromEntries(ARMS.map(a=>[a,summarizeRows(selected.filter(r=>r.arm===a))])),natural:modelArmMetrics(selected.filter(r=>r.stratum==='random')),challenge:modelArmMetrics(selected.filter(r=>r.stratum==='challenge')),oracle:{summary:summarizeRows(o),versusD:pairedDifference([...selected.filter(r=>oIds.has(r.caseId)),...o],'O','D')},stability:stabilityMetrics(stability.filter(r=>r.modelProfileId===model),selected,d)};
  }
  adjustModelComparisons(byModel);for(const v of Object.values(byModel))v.conclusion=modelDecision(v);
  const selections=await Promise.all(d.oracle.map(async id=>({caseId:id,model:f.assignment[id].model,...await read(join(out,'oracle',id+'.json'))}))),selectionSummary={planned:200,selected:selections.filter(x=>x.status==='selected').length,failed:selections.filter(x=>x.status==='failed').length,emptySelected:selections.filter(x=>x.status==='selected'&&!x.passages.length).length,errors:selections.filter(x=>x.status==='failed').reduce((a,x)=>(a[x.error??'unknown']=(a[x.error??'unknown']??0)+1,a),{}),authority:'Independent AI selection, not expert gold'};
  const runByKey=new Map();for(const file of await readdir(join(out,'runs')))if(file.endsWith('.json')){const r=await read(join(out,'runs',file));runByKey.set(r.key,r);}
  const failedSelections=new Set(selections.filter(s=>s.status==='failed').map(s=>s.caseId)),costCalls=[];
  for(const claim of ledger.claims.values()){
    const request=await read(join(out,'requests',claim.key+'.json')),call=await read(join(out,'calls',claim.key+'.json')),model=Object.keys(f.models).find(id=>hash(f.models[id])===hash(request.model))??(f.historicalRequestModels?.[claim.key]&&hash(f.historicalRequestModels[claim.key])===hash(request.model)?'deepseek_via_claude':null);if(!model)throw Error('model_cost_unknown_profile');
    const run=runByKey.get(claim.key),selectionCase=/^oracle-select-(?:chapters|passages)-([a-f0-9]+)$/.exec(claim.key)?.[1];
    costCalls.push({key:claim.key,bucket:claim.bucket,modelProfileId:model,status:run?.status??call.response.status,usage:call.response.usage??null,elapsedMs:call.elapsedMs,providerFailed:call.response.status!=='ready',failureRelated:run?run.status!=='submitted':Boolean(selectionCase&&failedSelections.has(selectionCase)),reconnectCount:call.response.reconnectCount??0,transportProof:call.transportProof??null});
  }
  const costs={byBucket:Object.fromEntries(Object.keys(f.budgets).map(b=>[b,tokenTotals(costCalls.filter(c=>c.bucket===b))])),byModel:Object.fromEntries(Object.keys(f.models).map(id=>[id,tokenTotals(costCalls.filter(c=>c.modelProfileId===id))])),providerFailures:tokenTotals(costCalls.filter(c=>c.providerFailed)),failureAssociated:tokenTotals(costCalls.filter(c=>c.failureRelated)),failureAssociatedDefinition:'Failed generation attempts or calls associated with a failed two-step material selection; includes useful first selection steps when the overall selection failed',cachedInputIncludedOnce:true,unreportedUsageRemainsUnknown:true};
  const crossModelDiagnostics={};
  for(const model of ['deepseek_via_claude','terra']){
    const old=supplemental.filter(r=>f.assignment[r.caseId].model===model),keys=new Set(old.map(r=>r.caseId+'\0'+r.arm)),main=rows.filter(r=>keys.has(r.caseId+'\0'+r.arm));
    crossModelDiagnostics[model]={plannedPairs:old.length,allAttempts:pairedDifference([...main.map(r=>({...r,arm:'target'})),...old.map(r=>({...r,arm:'legacySol'}))],'target','legacySol'),bothSubmitted:old.filter(r=>r.status==='submitted'&&main.some(m=>m.caseId===r.caseId&&m.arm===r.arm&&m.status==='submitted')).length,authority:'Diagnostic same-arm legacy comparison; manual interruptions, different timing and mixed arms prevent a clean model-weights claim'};
  }
  const practicalContrast=pairedDifference(practical,'D','A'),tokenVerdict=practicalContrast.tokenPairs!==100?'用量不完整，1.3倍目标暂不能完整判定':practicalContrast.tokenRatio<=1.3?'满足1.3倍目标':'未满足1.3倍目标';
  const m={version:'ceiling-model-report/v1',complete:true,freezeHash:hash(f),originalFreezeHash:f.originalFreezeHash,selected:await read(join(out,'selected-version.json')),modelStudy:{assignment:f.assignment,labels:MODEL_LABELS,concurrency:f.concurrency},budget:ledger.snapshot(),byModel,natural:modelArmMetrics(rows.filter(r=>r.stratum==='random')),challenge:modelArmMetrics(rows.filter(r=>r.stratum==='challenge')),oracle:{summary:summarizeRows(oracle),selection:selectionSummary},practical:{arms:Object.fromEntries(['A','V0','D','O'].map(a=>[a,summarizeRows(practical.filter(r=>r.arm===a))])),versusA:practicalContrast,tokenTarget:1.3,tokenVerdict},stability:{byModel:Object.fromEntries(Object.entries(byModel).map(([id,v])=>[id,v.stability]))},crossModelDiagnostics,costs,costCalls,screening:d.screening,rows,oracleRows:oracle,practicalRows:practical,stabilityRows:stability,supplementalRows:supplemental,patterns:[...new Set(rows.flatMap(r=>r.patterns??[]))].map(id=>({id,naturalSupport:new Set(rows.filter(r=>r.stratum==='random'&&r.patterns?.includes(id)).map(r=>r.caseId)).size,challengeSupport:new Set(rows.filter(r=>r.stratum==='challenge'&&r.patterns?.includes(id)).map(r=>r.caseId)).size})),conclusion:'三模型分别判断；Sol开发集保留V0，其他模型是固定方案的迁移验证。'+Object.entries(byModel).map(([id,v])=>MODEL_LABELS[id]+'：'+v.conclusion).join(' ')};
  if(await exists(join(out,'archive-recovery.json'))){const recovery=await read(join(out,'archive-recovery.json'));m.archiveRecovery={manifestHash:hash(recovery),lostResponseFailures:1,key:recovery.lostResponse.key,noRetry:true};}
  const lines=['# 场景模式＋直接匹配RAG：三模型实测报告','',m.conclusion,'','模型各自自然集按150/300/150题计全尝试分母；自然与挑战分开。置信区间为牌谱配对bootstrap 2000次。三项主检验统一Holm校正，九项次要检验另作统一Holm校正。',''];
  if(await exists(join(out,'qa/actual-material-equality.json'))){
    const equality=await read(join(out,'qa/actual-material-equality.json'));
    if(equality.plannedCases!==800||equality.sameDeliveredMaterials!==800||equality.differentCaseIds.length||equality.modelRequests!==0)throw Error('material_equality_diagnostic_changed');
    lines.splice(2,0,'## 先读结论与实验边界','','当前选中配置没有证明相对裸模型的增益，本轮不建议继续追加同类模式；保留裸模型作为比较基准。增强路由候选r1/r2/r3在开发自然集分别为79/120、83/120、72/120，均未超过V0的84/120。预算内按预定规则选出的最好配置仍是V0，正式D按该配置生成。','','重要边界：逐题核对实际请求发现，正式800题的C与D交付资料完全相同；V0未启用中文主题扩展与主题优先排序，模式主题没有改变最终选材。D−C主要反映额外模式提示的影响，不能用本轮结果声称已经测到有效场景路由的上限。D与V0同配置的独立生成差异也不能算作优化收益。','','下一步优先离线检查A正确而D偏离Mortal的局面，以及资料为何集中在少数章节。若另开实验，先验证场景变化确实改变选材，再评测收益；本轮不依据正式答案回改或补跑。','');
  }
  for(const [model,v]of Object.entries(byModel)){
    lines.push('## '+MODEL_LABELS[model],'',v.conclusion,'',`D在自然与挑战全部计划窗口的运行成功率：${pct(v.overallArms.D.successRate)}；投入线要求至少95%。下表为自然集。`,'','|组|一致/计划|全尝试一致率|有效提交条件下一致率|成功率|平均Q差|90分位Q差|','|---|---:|---:|---:|---:|---:|---:|',...ARMS.map(a=>{const r=v.natural.arms[a];return `|${a}|${r.matches}/${r.planned}|${pct(r.rate)}|${pct(r.conditionalRate)}|${pct(r.successRate)}|${number(r.meanRegret)}|${number(r.p90Regret)}|`;}),'');
    for(const c of v.natural.comparisons)lines.push(`${c.treatment}−${c.control}：${pct(c.estimate)}；配对95%区间 ${pct(c.low)} 至 ${pct(c.high)}；Holm校正p=${c.adjustedP}。`);
    lines.push('',`优选资料O−D：${pct(v.oracle.versusD.estimate)}，区间 ${pct(v.oracle.versusD.low)} 至 ${pct(v.oracle.versusD.high)}，${v.oracle.summary.planned}次计划尝试。选材者为独立Sol上下文，生成与对应D同模型；统计差异不能单独证明资料遗漏。`,'');
  }
  lines.push('## 选材、成本与重复运行','',`200题选材：成功${selectionSummary.selected}，失败${selectionSummary.failed}，成功但空选${selectionSummary.emptySelected}。全部失败保留；相关性理由是AI判断。`,`Luna/max D−A：${pct(practicalContrast.estimate)}；区间 ${pct(practicalContrast.low)} 至 ${pct(practicalContrast.high)}。完整用量配对${practicalContrast.tokenPairs}/100，token比值${number(practicalContrast.tokenRatio)}；${tokenVerdict}。`,'','每题实际输入/输出token、耗时、错误与失败关联成本见metrics.json的costCalls；各阶段/模型汇总见costs。未知用量保留未知，缓存输入不重复相加。稳定性按原题同模型追加，结果见stability，不选优。','',`实际实验请求/派发意图：${m.budget.claimed}/${Object.values(f.budgets).reduce((a,b)=>a+b,0)}。正式主样本4000格，另保留90次旧Sol跨模型补充。预算统计不能替代不可见的CLI或代理内部网络重试次数，已知reconnect及路由证据保留在调用档案。`,'','## 解释与覆盖范围','','Sol开发集选出V0，三轮预先编码候选均未胜出。D与V0是同配置的独立生成；二者差异不能归因于优化。其他两个模型使用Sol选出的固定版本，不能称其各自经过三轮优化后的上限。','',`本教材232章/240单元完整索引；43个超预算完整单元不直接交付，3个导航单元不作教学正文。材料按完整论证保留条件与例外，每题至多6段/6000字符。未查看图片与超预算单元限制须连同结果解读。`,`来源为2026年四人半庄牌谱等权的纯弃牌窗口，排除含西入延长局的牌谱及完整性错误。准备排除${d.rejectedGames}场；新增规则查询${d.screening.checked}窗口，其中非纯弃牌排除${d.screening.contains_non_discard_action??0}个。缓存复用${d.screening.cacheHits??0}场；排除比例只描述实际查询范围。`,'','模型与CLI/代理路线共同构成实验条件；high不是等算力保证，后端标识为服务回显。三模型题目不同，模型间比较带抽样不确定性；90次旧补充为探索性同题同组对照。Mortal一致率衡量偏好接近，不等于教材正确性、讲解质量或实战收益。','','DeepSeek客户端按版本修复总结元数据兼容：最新版本忽略可选展示总结，弃牌、理由、引用与备选参数不改。原始首答及规范化记录均归档，旧失败不改写、不重试。首53次中8项可经新解析离线恢复，主统计仍保留原始失败，仅作格式兼容影响诊断。修复未改变模型请求正文；传输实现版本见冻结及逐次proof。受控切换时新增4个在途请求按失败保留，未补发。此前中断轮2748次另档；正式结果没有用于修改教材、模式、检索或选版。','','[逐题图形入口](review/index.html)','');
  lines.push('## 运行条件与档案完整性补充','','Command Code凭据更新后，实际服务回显从deepseek/deepseek-v4.1-flash-1017变为deepseek/deepseek-v4.1-flash-1017-cm。路由、模型族与high保持原配置，但不能据此断言服务权重相同；DeepSeek结果包含这项运行条件差异。');
  lines.push('','## 瓶颈判断与覆盖补充','','目前能定位的工程瓶颈是DeepSeek链路可靠性。场景识别、匹配质量、模型运用教材能力仍不能作可靠的单一归因：C/D实际选材相同，O又有37/200次选材失败，其中31次超出材料预算、6次服务失败。O没有改善全尝试指标，不能直接证明教材无用或模型不会运用教材。');
  lines.push('',`D自然集模式覆盖率：Sol ${pct(byModel.sol.natural.arms.D.patternCoverage)}、DeepSeek ${pct(byModel.deepseek_via_claude.natural.arms.D.patternCoverage)}、Terra ${pct(byModel.terra.natural.arms.D.patternCoverage)}；三者检索空结果均为0。模式无命中仍交付词项匹配材料。场景支持数见metrics.json的patterns，不据小组宣称某条模式有效。`,`实际规则查询2422个窗口中，144个含非弃牌动作被排除（${pct(144/2422)}），98个因规范候选不足两个被排除（${pct(98/2422)}）。这不是所有牌局窗口的覆盖比例。挑战集D−A分别为Sol +4、DeepSeek −10、Terra +4个百分点，仅作诊断。`);
  if(await exists(join(out,'qa/retrieval-concentration.json'))){
    const concentration=await read(join(out,'qa/retrieval-concentration.json'));
    lines.push('',`事后描述性检查：600道自然题的D实际检索只用到${concentration.distinctRetrievedUnits}个不同单元，其中“${concentration.topUnits[0].title}”出现于${concentration.topUnits[0].cases}/600题。高集中度提示应检查选材区分能力，尚不能证明其导致决策偏差。`);
  }
  if(await exists(join(out,'qa/post-run-diagnostics.json'))){
    const diagnostic=await read(join(out,'qa/post-run-diagnostics.json'));
    if(diagnostic.metricsHash!==hash(m))throw Error('post_run_diagnostic_parent_changed');
    lines.push('','以下为事后探索性诊断，不替代预设主检验，不据此重新选版。仅保留O、D均有效提交的配对，会引入成功条件筛选：');
    for(const [model,v]of Object.entries(diagnostic.byModel)){const c=v.oracleVersusDWhenBothValid;lines.push(`- ${MODEL_LABELS[model]}：O−D ${(c.estimate*100).toFixed(1)}个百分点，95%区间 ${(c.low*100).toFixed(1)} 至 ${(c.high*100).toFixed(1)}个百分点，${c.pairs}对。`);}
    lines.push('','这些区间仍容纳有价值改善；不能把资料匹配路线判定为已达上限或已被证伪。');
  }
  if(await exists(join(out,'archive-recovery.json'))){
    const recovery=await read(join(out,'archive-recovery.json'));
    lines.push('','电脑于2026-10-29 06:13:42 UTC重启，4个在途请求按中断失败保留。另有1次原本记为ready的DeepSeek C组回答及派生记录落盘后变成全零，无法恢复其决策，因此按档案丢失失败计入原计划分母；不重发、不换题、不推测其答案。另1个损坏的请求文件由相同冻结输入重建，摘要与原派发账本一致。3个损坏原文件、原始账本与显式恢复清单均保留，独立验收单独核对这1项更正。');
  }
  await save(join(out,'metrics.json'),m);await save(join(out,'scoring-inputs.json'),rows.map(r=>r.scoringInput));const text=lines.join('\n');await writeFile(join(out,'REPORT.md'),text);await renderCeilingReview(out,d,m);await save(join(out,'archive-manifest.json'),{version:'ceiling-model-archive/v1',freezeHash:hash(f),metricsHash:hash(m),ledgerHead:ledger.rows.at(-1)?.digest,reportHash:hash(text)});return m;
}
