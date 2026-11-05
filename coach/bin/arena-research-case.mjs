import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';

// Read existing Arena archives only. Never rerun a model or reconstruct an unrecorded event.
const formats = [
  {base:'execution-preparation', plan:'global-plan.json', index:'active-run/run-index.json', hash:'globalPlanSha256', prefix:'', archive:'active-run/batch-'},
  {base:'execution-preparation/active-run', plan:'decision-plan.json', index:'decision-run-index.json', hash:'decisionPlanSha256', prefix:'', archive:'decision-batch-'},
  {base:'arena-integration', plan:'v3-global-plan.json', index:'active-run/run-index.json', hash:'planSha256', prefix:'v3-', archive:'active-run/batch-'},
];
const digest = text => createHash('sha256').update(text).digest('hex');
async function checkedPath(root, rel, max=16*1024*1024) {
  const path=await realpath(join(root,rel)), distance=relative(root,path);
  if(!distance||distance.startsWith('..')||isAbsolute(distance)||(await stat(path)).size>max) throw Error('研究归档路径或大小无效');
  return path;
}
async function json(root, rel, expected, encoding='bytes') {
  const bytes=await readFile(await checkedPath(root,rel));
  const value=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  if(expected && digest(encoding==='json'?JSON.stringify(value):bytes)!==expected) throw Error('研究归档与冻结映射不一致');
  return value;
}
async function rowsForCase(root, rel, ordinal, field='caseOrdinal') {
  const path=await checkedPath(root,rel,128*1024*1024), stream=createReadStream(path,{encoding:'utf8'});
  const lines=createInterface({input:stream,crlfDelay:Infinity}), rows=[];
  try {for await(const line of lines) {if(!line.trim())continue;const row=JSON.parse(line);if(field===null||row[field]===ordinal)rows.push(row);}}
  finally {lines.close();stream.destroy();}
  return rows;
}
export async function readResearchCase(directory, group, summary) {
  const root=await realpath(directory);
  let selected;
  for(const format of formats) {
    try {await checkedPath(root,`${format.base}/${format.index}`);selected=format;break;}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(!selected)return {available:false,reason:'这项研究没有保存可关联的 Arena 逐题归档。',summary};
  const f=selected, base=f.base, index=await json(root,`${base}/${f.index}`);
  if(index.version==='selective-study-run-index/v1') return readSelectiveCase(root,index,group,summary);
  const plan=await json(root,`${base}/${f.plan}`,index[f.hash]);
  let slots=plan.slots;
  if(!slots && Array.isArray(plan.caseOrder) && group==='raw_position') {
    slots=plan.caseOrder.map(c=>{
      const b=plan.batches.find(b=>c.globalOrdinal>=b.globalStart&&c.globalOrdinal<b.globalStart+b.cases);
      return {...c,group,batchId:b?.batch,batchCaseOrdinal:c.globalOrdinal-b?.globalStart};
    });
  }
  const matches=(slots??[]).filter(s=>s.caseId===summary.caseId&&s.group===group);
  if(matches.length!==1)throw Error('研究案例未能唯一对应到冻结批次');
  const slot=matches[0];
  if(!Number.isInteger(slot.batchId)||slot.batchId<0||!Number.isInteger(slot.batchCaseOrdinal)||slot.batchCaseOrdinal<0)throw Error('研究批次编号无效');
  const archive=`${base}/${f.archive}${slot.batchId}`;
  const manifest=await json(root,`${archive}/manifest.json`);
  if(manifest.runId!==index.batchRunIds?.[slot.batchId])throw Error('研究运行编号与批次不一致');
  const batch=await json(root,`${base}/${f.prefix}batch-${slot.batchId}.json`,manifest.dataset?.source?.batchManifestSha256);
  const bound=batch.cases?.find(c=>c.caseOrdinal===slot.batchCaseOrdinal);
  if(!bound?.caseRef || (batch.group && batch.group!==group))throw Error('研究场面映射缺失');
  let events=[];
  try {events=await rowsForCase(root,`${archive}/events.jsonl`,slot.batchCaseOrdinal);}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const finals=events.filter(e=>e.type==='case_run');
  if(finals.length>1)throw Error('研究案例存在重复终态，无法选择');
  const result=finals[0]?.result;
  let trace=[], records=result?.events;
  if(!records?.length) {
    try {trace=await rowsForCase(root,`${archive}/case-trace.jsonl`,slot.batchCaseOrdinal);records=trace.map(r=>r.event);}
    catch(e){if(e.code!=='ENOENT')throw e; records=[];}
  }
  const start=records.find(e=>e.type==='run_started');
  if((result && result.caseRef!==bound.caseRef)||(start && start.caseRef!==bound.caseRef)||(start?.observation && start.observation.caseRef!==bound.caseRef))throw Error('研究案例身份与牌面不一致');
  const selectedCase=manifest.dataset?.selected?.[slot.batchCaseOrdinal];
  if(!selectedCase || selectedCase.canonicalDecisionOrder!==bound.canonicalDecisionOrder || selectedCase.candidateSetDigest!==bound.candidateSetDigest)throw Error('研究候选集与批次不一致');
  let reference=null;
  if(Number.isInteger(summary.caseIndex)&&/^[a-zA-Z0-9_-]+$/.test(summary.caseId)) {
    try {
      const label=await json(root,`scoring-preparation/private/${String(summary.caseIndex).padStart(3,'0')}-${summary.caseId}.json`);
      if(label.caseId===summary.caseId && label.caseRef===bound.caseRef && label.label?.caseRef===bound.caseRef && start?.observation?.candidates?.some(c=>c.actionRef===label.label.actionRef))reference=label.label.actionRef;
    }catch(e){if(e.code!=='ENOENT')throw e;}
  }
  let preparation=null;
  if(group==='basic_and_selected_textbook' && plan.selectorPlanSha256) {
    // The original two-stage driver binds this plan with JSON.stringify, unlike file-byte batch hashes.
    const selectorPlan=await json(root,`${base}/selector-plan.json`,plan.selectorPlanSha256,'json');
    const selectors=selectorPlan.slots?.filter(s=>s.caseId===summary.caseId)??[];
    if(selectors.length!==1)throw Error('教材选择记录未能唯一对应案例');
    const selector=selectors[0], journal=await rowsForCase(root,`${base}/journal.jsonl`,selector.ordinal,'ordinal');
    if(journal.some(r=>r.caseId!==summary.caseId||r.requestSha256!==selector.requestSha256))throw Error('教材选择记录与案例不一致');
    preparation={journal,requests:await rowsForCase(root,`${base}/selector-audit.jsonl`,selector.ordinal,'ordinal'),responses:await rowsForCase(root,`${base}/selector-provider-responses.jsonl`,selector.ordinal,'ordinal')};
  }
  return {available:Boolean(result||records.length),reason:result||records.length?null:'本题尚未保存执行记录。',summary,
    caseOrdinal:slot.batchCaseOrdinal,source:`${f.archive}${slot.batchId}`,manifest,events,trace,traceLive:false,
    observation:start?.observation??null,result:result??null,reference,preparation};
}

async function readSelectiveCase(root,index,group,summary) {
  if(!index.scheduleSha256)throw Error('缺少冻结排程摘要');
  const schedule=await json(root,'execution-preparation/schedule-preliminary.json',index.scheduleSha256);
  const slots=schedule.slots?.filter(s=>s.caseId===summary.caseId&&s.group===group)??[];
  if(slots.length!==1)throw Error('研究案例未能唯一对应到冻结排程');
  const slot=slots[0], ordinal=slot.slotOrdinal;
  if(!Number.isInteger(ordinal)||ordinal<0||!Number.isInteger(slot.caseIndex)||slot.caseIndex<0||!/^[a-zA-Z0-9_-]+$/.test(slot.caseId)||!/^[a-zA-Z0-9_-]+$/.test(group)||!slot.inputSha256)throw Error('研究排程无效');
  const name=`${String(slot.caseIndex).padStart(3,'0')}-${slot.caseId}.json`;
  let input;
  try {input=await json(root,`execution-preparation/inputs/${name}`,slot.inputSha256);}
  catch(e){if(e.code!=='ENOENT')throw e;input=await json(root,`module-preflight/inputs/${group}/${name}`,slot.inputSha256);}
  if(input.caseId!==summary.caseId||input.caseIndex!==slot.caseIndex||input.group!==group||!input.caseRef)throw Error('研究输入与排程不一致');
  const archive='execution-preparation/active-run';
  let saved=null;
  try {saved=await json(root,`${archive}/result-${ordinal}.json`);}catch(e){if(e.code!=='ENOENT')throw e;}
  const result=saved?.caseResult??null;
  let records=result?.events??[];
  if(!records.length)try {records=await rowsForCase(root,`${archive}/trace-${ordinal}.jsonl`,undefined,null);}catch(e){if(e.code!=='ENOENT')throw e;}
  const start=records.find(e=>e.type==='run_started');
  if((saved&&saved.slotOrdinal!==ordinal)||(result&&result.caseRef!==input.caseRef)||(start&&start.caseRef!==input.caseRef)||(start?.observation&&start.observation.caseRef!==input.caseRef))throw Error('研究案例身份与牌面不一致');
  return {available:Boolean(result||records.length),reason:result||records.length?null:'本题尚未保存执行记录。',summary,caseOrdinal:ordinal,
    source:`${archive}/result-${ordinal}.json`,manifest:{runId:index.runId},
    events:result?[{type:'case_run',caseOrdinal:ordinal,result}]:[],trace:records.map(event=>({caseOrdinal:ordinal,event})),traceLive:false,
    observation:start?.observation??null,result,reference:null,preparation:null};
}
