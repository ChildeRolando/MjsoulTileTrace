import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p));
const captured=await read(here+'/captured.json'),h=await read(here+'/result.json'),s=await read(here+'/inheritance.json');
let hashChecks=0;
async function immutable(){for(const b of captured.bindings){assert.equal(sha(await readFile(here+'/'+b.name)),b.sha256);hashChecks++;if(b.path){assert.equal(sha(await readFile(b.path)),b.sha256);hashChecks++;}}}
await immutable();
const runtime=h.runtime.path.replace(/[^/\\]+$/,''),{verifyGroupRevisionAudit,verifyAuditForWebCandidate}=await import(pathToFileURL(runtime+'textbook-audit-web.mjs'));
const {isRecordedTextbookModel}=await import(pathToFileURL(runtime+'textbook-production-cli.mjs'));
const verified=await verifyGroupRevisionAudit(root,h.candidate.path);
assert.equal(verified.auditSha256,h.audit.sha256);assert.equal(verified.receipt.status,'needs-repair');
await assert.rejects(()=>verifyAuditForWebCandidate(root,h.candidate.path),/web_audit_not_passed_or_inputs_changed/);
const boundary=await read(here+'/../b18-396962/review-requests.json'),calls=[];
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse).filter(c=>c.binding?.productionSha256===h.candidate.sha256);
assert.equal(ledger.length,2);
for(let n=0;n<2;n++){
  const r=h.results[n],raw=await read(r.raw.path),cp=await read(r.checkpoint.path),expected=boundary.requests[n].request;
  assert.equal(cp.status,'passed');assert.equal(cp.modelChecks.passed,true);assert.deepEqual(cp.modelReview,r.modelReview);
  assert.deepEqual(raw.output,r.modelReview);assert.deepEqual(JSON.parse(raw.rawLastMessage),r.modelReview);
  assert.equal(r.modelReview.textChecks.length,1);assert.equal(r.modelReview.textChecks[0].id,r.targetId);assert.equal(r.modelReview.textChecks[0].verdict,'faithful');
  assert(r.modelReview.contextContinuity.faithful);assert(r.modelReview.completeTargetScopeCompared);assert.deepEqual(r.modelReview.issues,[]);
  assert.equal(raw.prompt,expected.prompt);assert.deepEqual(raw.schema,expected.schema);
  const actual=await read(here+`/actual-request-${n}.json`);assert.equal(actual.prompt,expected.prompt);assert.deepEqual(actual.schema,expected.schema);assert.deepEqual(actual.images,expected.images);
  assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);assert.equal(raw.success,true);assert.equal(raw.durationMs,r.durationMs);
  assert(isRecordedTextbookModel(r.call));assert.equal(r.call.model,'gpt-6.1-terra');assert.equal(r.call.reasoningEffort,'max');assert.deepEqual(raw.requestExecution,r.call.requestExecution);
  assert.deepEqual(raw.requestExecution.images.map(i=>i.path),expected.images);assert.equal(expected.images.length,[13,12][n]);
  const args=raw.requestExecution.args;assert.equal(args[args.indexOf('--model')+1],'gpt-6.1-terra');assert(args.includes('model_reasoning_effort="max"'));
  assert.deepEqual(args.flatMap((a,i)=>a==='-i'?[args[i+1]]:[]),expected.images);
  for(const i of raw.requestExecution.images){const bytes=await readFile(i.path);assert.equal(sha(bytes),i.sha256);assert.equal(bytes.length,i.bytes);hashChecks++;}
  const projection=JSON.parse(raw.prompt.slice(raw.prompt.indexOf('{')));assert.deepEqual(projection.reviewScope.targetTextIds,[r.targetId]);assert.deepEqual(projection.reviewScope.targetFigureIds,[]);
  assert(raw.events.some(e=>e.type==='thread.started'&&e.thread_id));assert(raw.events.some(e=>e.type==='turn.completed'));assert(raw.rawStdout.includes('turn.completed'));
  assert.deepEqual(ledger.find(c=>c.callId===r.call.callId),r.call);
  calls.push({kind:'independent-first-target-review',callId:r.call.callId,model:r.call.model,effort:r.call.reasoningEffort,images:expected.images.length,usage:r.call.usage,durationMs:r.durationMs,rawSha256:r.raw.sha256,checkpoint:r.checkpoint,status:'passed'});
}
const process=await read(here+'/actual-process-2.json');assert(process.CommandLine.includes('--model gpt-6.1-terra'));assert(process.CommandLine.includes('model_reasoning_effort=\\"max\\"'));
const parent=await read(h.parent.path),candidate=await read(h.candidate.path),oldAudit=await read(h.parentAudit.path),audit=verified.receipt;
const targetIds=new Set(h.results.map(r=>r.targetId));let changed=0;
assert.equal(candidate.body.blocks.length,1195);assert.equal(candidate.figures.length,524);assert.deepEqual(candidate.figures,parent.figures);
for(let n=0;n<1195;n++){
 const a=parent.body.blocks[n],b=candidate.body.blocks[n];
 if(JSON.stringify(a)!==JSON.stringify(b)){assert.equal(b.sourceBlockIds.length,1);assert(targetIds.has(b.sourceBlockIds[0]));assert.deepEqual({...b,text:a.text},a);
  if(b.sourceBlockIds[0].endsWith('0396'))assert.equal(b.text,a.text.replace('选择进张宽的④。即使是失算的','选择进张宽的④。即使出现不利的'));
  else assert.equal(b.text,a.text.replace('立直、断幺九、平和','立直＋断幺九＋平和'));changed++;
 }
}
assert.equal(changed,2);assert.deepEqual(audit.modelReview.issues,oldAudit.modelReview.issues.filter(i=>!targetIds.has(i.targetId)));
assert.equal(audit.modelReview.issues.filter(i=>i.severity!=='source-note').length,14);assert.equal(audit.inheritedBatchReviews.length,9);
assert(audit.inheritedBatchReviews.some(b=>b.group.batchId.endsWith('010')&&b.status==='passed'&&b.group.sourceBlockIds.length===113));
assert.equal(s.sixTables.blocks,137);assert.equal(s.sixTables.figures,94);assert(s.sixTables.exactObjects);assert(s.Q8.exactObjects);assert(s.b0168.unchanged);
const production=(await read(here+'/../b18-396962/result.json')).calls;
for(const c of production){assert(c.success);const bytes=await readFile(root+'/web-production/v1/'+c.rawArtifactPath);assert.equal(sha(bytes),c.rawArtifactSha256);hashChecks++;calls.unshift({kind:'production',callId:c.callId,model:c.model,effort:c.reasoningEffort,images:c.requestExecution.images.length,usage:c.usage,durationMs:c.durationMs,rawSha256:c.rawArtifactSha256});}
const guard=await read(here+'/guard-released.json');assert.equal(guard.guard.candidateSha256,h.candidate.sha256);assert(guard.releasedAt);
const previous=await read(here+'/remaining-parent.json'),issues=structuredClone(previous.issues);
for(const r of h.results){const matching=issues.filter(i=>i.originalIssue.targetId===r.targetId);assert.equal(matching.length,1);assert.equal(matching[0].status,'open');matching[0].status='resolved-by-independent-target-checkpoint';matching[0].evidence={candidate:h.candidate,checkpoint:r.checkpoint,raw:r.raw,callId:r.call.callId};}
for(let n=0;n<issues.length;n++)if(!targetIds.has(issues[n].originalIssue.targetId))assert.deepEqual(issues[n],previous.issues[n]);
const blocking=issues.filter(i=>i.status==='open'&&i.originalIssue.severity!=='source-note');assert.equal(blocking.length,7);
const effective={schema:'coac269-ticket-local-effective-remaining/1',scope:'Ticket-local view over pinned250 register plus two verified249 target checkpoints; shared register not modified',candidate:h.candidate,parentRegister:h.inheritedEvidence.Q8.register,issues,counts:{originalIssues:19,resolved:10,remainingBlocking:7,sourceNotes:2,rawNonTargetBlockingPreserved:14},remainingTargets:[...new Set(blocking.map(i=>i.originalIssue.targetId))],chapterStatus:'needs-repair',chapterAccepted:false,newModelCalls:0};
await writeFile(here+'/effective-remaining.json',JSON.stringify(effective,null,2)+'\n');
await immutable();
const totals={calls:4,max:4,remaining:0,production:2,independentFirstReviews:2,failedOrVoid:0,retry:0,inputTokens:0,cachedInputTokens:0,outputTokens:0,durationMs:0,fee:null,upstreamExecutions:null,remoteWeights:'unknown'};
for(const c of calls){for(const k of ['inputTokens','cachedInputTokens','outputTokens'])totals[k]+=c.usage[k];totals.durationMs+=c.durationMs;}
assert.equal(totals.inputTokens,218981);assert.equal(totals.outputTokens,3821);assert.equal(totals.durationMs,112596);
const result={passed:true,newModelCalls:0,hashChecks,frozenFiles:32,candidate:h.candidate,targets:h.results.map(r=>({targetId:r.targetId,status:r.status,checkpoint:r.checkpoint,raw:r.raw})),chapterStatus:'needs-repair',chapterAccepted:false,verifiers:{scoped:'verifyGroupRevisionAudit: verified',whole:'web_audit_not_passed_or_inputs_changed (expected)'},unchanged:{blocks:1193,figures:524,inheritedGroups:9,batch010Blocks:113,tableBlocks:137,tableFigures:94,Q8Blocks:21,Q8Figures:7,b0168:true},calls,totals,existingAggregation:{COAC244:'01a17f62-5724-7cf6-96ae-788556431ef6',COAC250:'01a17f62-5acb-74e2-a8a4-93f2565325cd',newDispatchHere:false},remaining:effective.counts};
await writeFile(here+'/verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,newModelCalls:0,hashChecks,frozenFiles:32,targetStatuses:['passed','passed'],whole:'needs-repair',calls:4,remaining:0,effectiveBlocking:7}));
