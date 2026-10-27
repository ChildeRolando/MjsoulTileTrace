import {readFile,writeFile,open,unlink,access} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing',runtime=join(root,'audit/runtimes/coac244-condition100-v3-20261028'),sha=b=>createHash('sha256').update(b).digest('hex'),json=async p=>JSON.parse(await readFile(p,'utf8'));
const manifest=await json(join(runtime,'manifest.json'));for(const f of manifest.files)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const production=await json(join(here,'production-result.json'));assert.equal(production.budget.used,1);assert.equal(production.budget.remaining,1);const cb=await readFile(production.candidate.path);assert.equal(sha(cb),production.candidate.sha256);const candidate=JSON.parse(cb);
const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);assert(!ledger.some(c=>c.binding?.productionSha256===production.candidate.sha256),'new-SHA already has an audit attempt');
const reg=await json(join(root,'integration/coac250-unified-chapter-register-20261027b.json'));assert(!reg.rows.find(r=>r.chapterId===production.canonical)?.covered,'canonical already accepted');
const cli=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs'))),web=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs'))),base=await import(pathToFileURL(join(runtime,'textbook-audit.mjs')));
await cli.assertTextbookModelAdmission({stopFiles:[join(root,'audit/STOP-current-audit')]});
const guardPath=join(root,'audit/finite-current-driver.lock.json'),guard={pid:process.pid,owner:'COAC-244',taskId:'01a17f4b-add3-72bd-a6fd-932459a05877',scope:'nemata-jp-chapter-100-1 exact b0041 independent first review',workers:1,maximumNewCalls:1,retry:0,startedAt:new Date().toISOString()},handle=await open(guardPath,'wx');await handle.writeFile(JSON.stringify(guard));await handle.close();
let used=0;
try{
 await writeFile(join(here,'audit-attempt-started.json'),JSON.stringify(guard,null,2)+'\n',{flag:'wx'});
 const expected=await json(join(here,'audit-projection-preflight.json'));
 const reviewer=async request=>{
  assert.equal(used,0);assert.equal(request.model,'gpt-6.1-sol');assert.equal(request.reasoningEffort,'high');assert.deepEqual(request.images,[]);
  const projection=JSON.parse(request.prompt.slice(request.prompt.indexOf('\n')+1));assert.deepEqual(projection,expected);assert.deepEqual(request.schema.properties.blockChecks.items.properties.id.enum,projection.targetTextIds);assert.equal(projection.source.blocks.length,107);assert.equal(projection.contextScope.originalPassedDefinitionBlockIds.length,39);
  await writeFile(join(here,'actual-independent-request.json'),JSON.stringify(request,null,2)+'\n',{flag:'wx'});used++;
  return cli.invokeTextbookCodex({...request,stopFiles:[join(root,'audit/STOP-current-audit')]});
 };
 const receipt=await web.auditWebCandidate({processingRoot:root,candidatePath:production.candidate.path,reviewer});assert.equal(used,1);
 const full=receipt.status==='passed'?await web.verifyAuditForWebCandidate(root,production.candidate.path):receipt;
 const call=full.calls[0],rawPath=join(root,'audit/calls',call.callId+'.json'),rawBytes=await readFile(rawPath),raw=JSON.parse(rawBytes);
 assert.equal(raw.requestExecution.model,'gpt-6.1-sol');assert.equal(raw.requestExecution.reasoningEffort,'high');assert.deepEqual(raw.requestExecution.images,[]);assert.equal(raw.prompt,(await json(join(here,'actual-independent-request.json'))).prompt);
 assert.equal(full.inheritedCalls.length,4);assert.equal(raw.success,true);assert(base.auditTransportCompleted(raw));
 const result={schema:'coac244-condition100-maker-and-independent-target-audit/1',canonical:production.canonical,status:full.status,production,independentAudit:{path:full.auditPath,sha256:sha(await readFile(full.auditPath))},call,raw:{path:rawPath,sha256:sha(rawBytes)},modelReview:full.modelReview,effectiveModelChecks:full.effectiveModelChecks,runtime:{path:runtime,manifestSha256:sha(await readFile(join(runtime,'manifest.json')))},budget:{used:2,maximum:2,maker:1,independentFirstTargetReview:1,remaining:0,failedVoidIncluded:true,retry:0},oldRawAndAuditChanged:false,formalActiveChanged:false,fees:'unknown',upstreamExecutionCount:'unknown',remoteBackend:'unverified; actual local argv/session/events/raw retained'};
 await writeFile(join(here,'final-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:full.status,candidate:production.candidate,callId:call.callId,rawSha256:sha(rawBytes),auditSha256:result.independentAudit.sha256,usage:raw.usage,durationMs:raw.durationMs,budget:result.budget}));
}finally{assert.deepEqual(await json(guardPath),guard);await unlink(guardPath);await writeFile(join(here,'audit-guard-released.json'),JSON.stringify({guard,releasedAt:new Date().toISOString(),newCalls:used},null,2)+'\n');}
