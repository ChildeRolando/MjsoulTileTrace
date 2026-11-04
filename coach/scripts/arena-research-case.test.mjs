const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {readResearchCase} from '../bin/arena-research-case.mjs';
const sha=text=>createHash('sha256').update(text).digest('hex');
async function fixture(t,kind='standard') {
 const root=await mkdtemp(join(tmpdir(),'arena-study-case-'));
 const after=callback=>typeof t.after==='function'?t.after(callback):t.onTestFinished(callback);after(()=>rm(root,{recursive:true,force:true}));
 const write=async(rel,value)=>{const file=join(root,rel);await mkdir(join(file,'..'),{recursive:true});const text=typeof value==='string'?value:JSON.stringify(value);await writeFile(file,text);return sha(text);};
 const base=kind==='textbook'?'execution-preparation/active-run':kind==='raw'?'arena-integration':'execution-preparation';
 const archive=kind==='textbook'?`${base}/decision-batch-0`:`${base}/active-run/batch-0`;
 const group=kind==='raw'?'raw_position':'basic', summary={caseId:'same-case',caseIndex:0};
 const slot={caseId:'same-case',group,batchId:0,batchCaseOrdinal:0};
 const plan=kind==='raw'?{caseOrder:[{caseId:'same-case',globalOrdinal:0}],batches:[{batch:0,globalStart:0,cases:1}]}:{slots:[slot]};
 const planHash=await write(`${base}/${kind==='textbook'?'decision-plan.json':kind==='raw'?'v3-global-plan.json':'global-plan.json'}`,plan);
 await write(`${base}/${kind==='textbook'?'decision-run-index.json':'active-run/run-index.json'}`,{batchRunIds:['run-0'],[kind==='textbook'?'decisionPlanSha256':kind==='raw'?'planSha256':'globalPlanSha256']:planHash});
 const bound={caseOrdinal:0,caseRef:'ref-0',canonicalDecisionOrder:15,candidateSetDigest:'set-0'};
 const batchHash=await write(`${base}/${kind==='raw'?'v3-':''}batch-0.json`,{group,cases:[bound]});
 const manifest={runId:'run-0',dataset:{source:{batchManifestSha256:batchHash},selected:[bound]}};
 await write(`${archive}/manifest.json`,manifest);
 const events=[{type:'run_started',caseRef:'ref-0',toolNames:[],observation:{caseRef:'ref-0',visibleState:{self:{concealedTiles:[{id:'1m',red:false}]}},candidates:[]}},{type:'request_prepared',turn:1,request:{messages:[{role:'user',content:'actual input'}]}},{type:'provider_final',content:'actual response'},{type:'run_terminal',status:'failed'}];
 const result={caseRef:'ref-0',status:'failed',events};
 await write(`${archive}/events.jsonl`,JSON.stringify({type:'case_run',caseOrdinal:0,result})+'\n');
 return {root,write,base,archive,group,summary,manifest,result,events};
}
for(const kind of ['standard','textbook','raw'])test(`${kind} study restores exact recorded board, requests and failures`,async t=>{
 const f=await fixture(t,kind), d=await readResearchCase(f.root,f.group,f.summary);
 assert.equal(d.available,true);assert.deepEqual(d.result,f.result);assert.deepEqual(d.observation,f.events[0].observation);assert.equal(d.traceLive,false);
 await assert.rejects(()=>readResearchCase(f.root,'different-group',f.summary),/唯一/);
 await assert.rejects(()=>readResearchCase(f.root,f.group,{caseId:'another-case'}),/唯一/);
});
test('mismatched frozen batch and case identity never render another case',async t=>{
 const f=await fixture(t);
 await f.write(`${f.archive}/events.jsonl`,JSON.stringify({type:'case_run',caseOrdinal:0,result:{...f.result,caseRef:'wrong'}}));
 await assert.rejects(()=>readResearchCase(f.root,f.group,f.summary),/身份/);
 await f.write(`${f.base}/batch-0.json`,{cases:[]});
 await assert.rejects(()=>readResearchCase(f.root,f.group,f.summary),/冻结映射/);
});
test('partial traces remain unfinished and summary-only studies explain missing detail',async t=>{
 const f=await fixture(t);await f.write(`${f.archive}/events.jsonl`,'');
 await f.write(`${f.archive}/case-trace.jsonl`,JSON.stringify({caseOrdinal:0,event:f.events[0]})+'\n');
 const d=await readResearchCase(f.root,f.group,f.summary);assert.equal(d.result,null);assert.equal(d.trace.length,1);assert.equal(d.traceLive,false);
 const empty=join(f.root,'summary-only');await mkdir(empty);assert.equal((await readResearchCase(empty,f.group,f.summary)).available,false);
});
test('separate process logs survive missing result files and empty inline events',async t=>{
 const f=await fixture(t);await f.write(`${f.archive}/case-trace.jsonl`,f.events.map(event=>JSON.stringify({caseOrdinal:0,event})).join('\n'));
 await rm(join(f.root,f.archive,'events.jsonl'));
 const partial=await readResearchCase(f.root,f.group,f.summary);assert.equal(partial.available,true);assert.equal(partial.result,null);assert.equal(partial.trace.length,f.events.length);
 await f.write(`${f.archive}/events.jsonl`,JSON.stringify({type:'case_run',caseOrdinal:0,result:{...f.result,events:[]}}));
 const complete=await readResearchCase(f.root,f.group,f.summary);assert.equal(complete.trace.length,f.events.length);assert.deepEqual(complete.result.events,[]);assert.equal(complete.result.status,'failed');
});
test('textbook selection remains a separate recorded phase, bound to the same case',async t=>{
 const f=await fixture(t,'textbook'), group='basic_and_selected_textbook';
 const selector={slots:[{ordinal:0,caseId:f.summary.caseId,requestSha256:'request-0'}]};
 await f.write(`${f.base}/selector-plan.json`,JSON.stringify(selector,null,2));
 const plan={selectorPlanSha256:sha(JSON.stringify(selector)),slots:[{caseId:f.summary.caseId,group,batchId:0,batchCaseOrdinal:0}]};
 const planHash=await f.write(`${f.base}/decision-plan.json`,plan);
 await f.write(`${f.base}/decision-run-index.json`,{batchRunIds:['run-0'],decisionPlanSha256:planHash});
 const batch=JSON.parse(await readFile(join(f.root,f.base,'batch-0.json'),'utf8'));batch.group=group;
 f.manifest.dataset.source.batchManifestSha256=await f.write(`${f.base}/batch-0.json`,batch);await f.write(`${f.archive}/manifest.json`,f.manifest);
 await f.write(`${f.base}/journal.jsonl`,JSON.stringify({ordinal:0,caseId:f.summary.caseId,requestSha256:'request-0',kind:'terminal',status:'failed'}));
 await f.write(`${f.base}/selector-audit.jsonl`,JSON.stringify({ordinal:0,audit:{request:'original selector input'}}));
 await f.write(`${f.base}/selector-provider-responses.jsonl`,JSON.stringify({ordinal:0,status:'failed',usage:null}));
 const d=await readResearchCase(f.root,group,f.summary);assert.equal(d.preparation.responses[0].status,'failed');assert.equal(d.preparation.responses[0].usage,null);assert.deepEqual(d.result.events,f.events);
 await f.write(`${f.base}/journal.jsonl`,JSON.stringify({ordinal:0,caseId:'wrong-case',requestSha256:'request-0'}));
 await assert.rejects(()=>readResearchCase(f.root,group,f.summary),/教材选择记录与案例不一致/);
});
