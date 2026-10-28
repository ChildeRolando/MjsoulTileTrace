import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {parseTextbookCliResult,textbookClosedPrompt} from './textbook-production-cli.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bound(root,value){const path=resolve(root,value),r=relative(root,path);if(!r||isAbsolute(r)||r==='..'||r.startsWith('../')||r.startsWith('..\\'))throw Error('web_batch_path_outside_processing');return path;}
export function validateWebBatches(plan,source,sourceSha256,unitMap){
 if(unitMap.schema!=='coach-textbook-web-unit-source-map/1'||plan.schema!=='coach-textbook-complete-unit-production-batches/1'||plan.sourceSha256!==sourceSha256||!Array.isArray(plan.groups)||!plan.groups.length)throw Error('web_batch_plan_binding');
 const article=unitMap.articles.find(a=>a.articleId===source.articleId&&a.sourceFileSha256===sourceSha256),ids=source.blocks.map(b=>b.id),all=plan.groups.flatMap(g=>g.sourceBlockIds);
 if(!article||!same(all,ids)||new Set(all).size!==ids.length||new Set(plan.groups.map(g=>g.batchId)).size!==plan.groups.length||!same(plan.groups.flatMap(g=>g.unitIds),article.units.map(u=>u.unitId)))throw Error('web_batch_complete_ordered_coverage');
 const units=new Map(article.units.map(u=>[u.unitId,u]));
 for(const group of plan.groups){
  if(!/^[a-zA-Z0-9_-]+$/.test(group.batchId)||!same(group.sourceBlockIds,group.unitIds.flatMap(id=>units.get(id)?.sourceBlockIds??[])))throw Error('web_batch_split_complete_unit');
  const required=[...new Set(group.unitIds.flatMap(id=>units.get(id).requiredIntroUnitIds??[]))].filter(id=>!group.unitIds.includes(id)),context=new Set(group.contextSourceBlockIds??[]);
  if(required.some(id=>!units.get(id)||units.get(id).sourceBlockIds.some(b=>!context.has(b)))||[...context].some(id=>!ids.includes(id)))throw Error('web_batch_missing_shared_premise');
 }
 for(const table of source.tables??[])if(plan.groups.filter(g=>table.sourceBlockIds.some(id=>g.sourceBlockIds.includes(id))).length!==1)throw Error('web_batch_split_html_table');
 return plan.groups;
}
export async function readWebBatchPlan(root,path,source,sourceBytes){
 const bytes=await readFile(bound(root,path)),plan=JSON.parse(bytes),mapBytes=await readFile(bound(root,plan.unitMap.path));
 if(sha(mapBytes)!==plan.unitMap.sha256)throw Error('web_batch_unit_map_changed');
 validateWebBatches(plan,source,sha(sourceBytes),JSON.parse(mapBytes));return{bytes,plan,mapBytes};
}
export function summarizeWebBatchUsage(attempts){
 const usage={},unknownByField={};for(const field of ['inputTokens','cachedInputTokens','outputTokens']){unknownByField[field]=attempts.filter(a=>!Number.isFinite(a.usage?.[field])).length;usage[field]=unknownByField[field]?null:attempts.reduce((n,a)=>n+a.usage[field],0);}return{usage,unknownByField};
}
export async function readWebBatchCheckpoint(root,path,expected){
 let ledger;try{ledger=(await readFile(join(root,'web-production/v1/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}catch(e){if(e.code!=='ENOENT')throw e;ledger=[];}
 let bytes,orphan=false;try{bytes=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;const records=ledger.filter(c=>same(c.batchBinding,expected.binding));if(records.length>1)throw Error('web_batch_ambiguous_orphaned_calls');if(!records.length)return null;orphan=true;bytes=Buffer.from(JSON.stringify({binding:expected.binding,call:records[0]},null,2)+'\n');}
 const checkpoint=JSON.parse(bytes),call=checkpoint.call;
 if(!same(checkpoint.binding,expected.binding)||call.sourceSha256!==expected.binding.sourceSha256||!same(call.targets,expected.targets)||call.batchId!==expected.binding.batchId)throw Error('web_batch_checkpoint_binding_changed');
 const rawBytes=await readFile(bound(root,join('web-production/v1',call.rawArtifactPath))),raw=JSON.parse(rawBytes);
 const matchingLedger=ledger.filter(c=>c.callId===call.callId);
 if(matchingLedger.length!==1||!same(matchingLedger[0],call)||sha(rawBytes)!==call.rawArtifactSha256||raw.callId!==call.callId||raw.semanticPrompt!==expected.prompt||raw.requestPrompt!==textbookClosedPrompt(expected.prompt)||sha(raw.requestPrompt)!==call.promptSha256||sha(raw.semanticPrompt)!==call.semanticPromptSha256||!same(raw.schema,expected.schema)||sha(JSON.stringify(raw.schema))!==call.schemaSha256||raw.cliSha256!==expected.cliSha256||sha(raw.rawLastMessage)!==call.outputSha256||!same(JSON.parse(raw.rawLastMessage),raw.parsedOutput)||!same(raw.usage,call.usage)||!same(raw.batchBinding,expected.binding)||(expected.visualInputs&&(!same(raw.visualInputs,expected.visualInputs)||!same(call.visualInputs,expected.visualInputs))))throw Error('web_batch_checkpoint_raw_or_ledger_changed');
 const parsed=parseTextbookCliResult({code:raw.exitCode,timedOut:raw.timedOut,overflow:raw.outputOverflow,stdout:raw.rawStdout,stderr:raw.stderr},raw.rawLastMessage);
 if(!call.success||!parsed.success||!same(parsed.usage,call.usage))throw Error('web_batch_prior_failure_preserved_no_automatic_retry');
 if(orphan)await writeFile(path,bytes,{flag:'wx'});
 return{call,result:{...parsed,output:raw.parsedOutput},checkpointSha256:sha(bytes)};
}
