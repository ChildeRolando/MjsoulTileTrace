// Post-run descriptive checks only. Never invokes a model or changes generation inputs.
import {resolve,join} from 'node:path';
import {read,save,hash} from './ceiling-protocol.mjs';
import {pairedDifference} from './ceiling-report.mjs';

const out=resolve(process.argv[2]??'E:/AgentData/Coach/scene-pattern-ceiling-restart2-20261028');
const m=await read(join(out,'metrics.json'));
if(!m.complete||m.rows.length!==4000)throw Error('complete_formal_results_required');
const diagnostics={version:'post-run-diagnostics/v1',metricsHash:hash(m),exploratory:true,modelRequests:0,byModel:{}};
for(const model of ['sol','deepseek_via_claude','terra']){
  const oracle=m.oracleRows.filter(r=>r.modelProfileId===model),ids=new Set(oracle.map(r=>r.caseId));
  const baseline=m.rows.filter(r=>r.modelProfileId===model&&ids.has(r.caseId)&&['A','D'].includes(r.arm));
  const validO=new Set(oracle.filter(r=>r.status==='submitted').map(r=>r.caseId));
  diagnostics.byModel[model]={
    oracleVersusA:pairedDifference([...oracle,...baseline],'O','A'),
    oracleVersusDWhenBothValid:pairedDifference([...oracle,...baseline].filter(r=>validO.has(r.caseId)&&r.status==='submitted'),'O','D'),
    patternCoverage:m.byModel[model].natural.arms.D.patternCoverage,
    retrievalEmpty:m.byModel[model].natural.arms.D.noHits,
  };
}
const controls=new Map(m.rows.filter(r=>r.arm==='C').map(r=>[r.caseId,r]));
const treated=m.rows.filter(r=>r.arm==='D'),different=[];
for(const r of treated){
  const control=controls.get(r.caseId),bodies=await Promise.all([control,r].map(async row=>JSON.parse((await read(join(out,'requests',row.key+'.json'))).request.messages[1].content)));
  if(hash(bodies[0].materials)!==hash(bodies[1].materials))different.push(r.caseId);
}
const equality={version:'actual-material-equality/v1',plannedCases:treated.length,sameDeliveredMaterials:treated.length-different.length,differentCaseIds:different,requestArchivesVerifiedByIndependentValidator:true,modelRequests:0};
const natural=treated.filter(r=>r.stratum==='random'),frequencies=new Map();let sameOrdered=0;
for(const r of natural){
  const passages=r.retrieval.passages;
  if(hash(passages.map(p=>p.id))===hash(controls.get(r.caseId).retrieval.passages.map(p=>p.id)))sameOrdered++;
  for(const p of passages){const entry=frequencies.get(p.id)??{id:p.id,title:p.title,cases:0};entry.cases++;frequencies.set(p.id,entry);}
}
const concentration={version:'retrieval-concentration-diagnostic/v1',exploratory:true,naturalCases:natural.length,distinctRetrievedUnits:frequencies.size,sameOrderedMaterialListCAndD:sameOrdered,
  topUnits:[...frequencies.values()].sort((a,b)=>b.cases-a.cases||a.id.localeCompare(b.id)).slice(0,8),
  noPatternMatches:natural.filter(r=>!r.patterns.length).length,emptyRetrieved:natural.filter(r=>!r.retrieval.passages.length).length,modelRequests:0};
await save(join(out,'qa/post-run-diagnostics.json'),diagnostics);
await save(join(out,'qa/actual-material-equality.json'),equality);
await save(join(out,'qa/retrieval-concentration.json'),concentration);
console.log(JSON.stringify({modelRequests:0,sameDeliveredMaterials:equality.sameDeliveredMaterials,formalCases:treated.length,naturalDistinctUnits:frequencies.size,metricsHash:hash(m)}));
