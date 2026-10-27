// Read existing review evidence and record the update. No production/review dispatch.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',out=import.meta.dirname;
const sha=b=>createHash('sha256').update(b).digest('hex');
const checks=[];
async function bound(ref){const b=await readFile(ref.path);assert.equal(sha(b),ref.sha256,ref.path);checks.push(ref);return b;}
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const handoffRef={path:join(root,'integration/coac249-reviewed183-stat-context-v3-20261028.json'),sha256:'9ff0d4891ae521a0d389686c3c0689967e3aceeb9ea073a0af8d21ceb078aac7'};
const hb=await bound(handoffRef),h=JSON.parse(hb);
assert.equal(h.chapterId,'nemata-jp-chapter-183-1');assert.equal(h.status,'passed');
const manifestBytes=await bound(h.runtime.manifest),manifest=JSON.parse(manifestBytes);
for(const f of manifest.files)await bound(f);
await bound(h.runtime.parentManifest);
const {verifyAuditForWebCandidate,webTargetTextProjection}=await import(pathToFileURL(join(h.runtime.path,'textbook-audit-web.mjs')));
const candidate=JSON.parse(await bound(h.candidate));
const source=JSON.parse(await bound(h.source));await bound(h.parent);await bound(h.parentAudit);await bound(h.producerHandoff);
const auditBytes=await bound(h.audit),audit=JSON.parse(auditBytes);
const rawBytes=await bound(h.raw),raw=JSON.parse(rawBytes);
const verified=await verifyAuditForWebCandidate(root,h.candidate.path);
assert.equal(verified.status,'passed');assert.equal(verified.auditSha256,h.audit.sha256);
assert.deepEqual(audit.modelReview,h.modelReview);assert.deepEqual(JSON.parse(raw.rawLastMessage),h.modelReview);
assert.equal(raw.callId,h.call.callId);assert.deepEqual(raw.usage,h.call.usage);assert.equal(raw.durationMs,h.call.durationMs);
assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');assert.deepEqual(raw.binding.originalImageAssetIds,[]);
const projection=webTargetTextProjection(source,candidate,candidate.provenance.revision.textBlockIds);
assert.deepEqual(projection,JSON.parse(raw.prompt.slice(raw.prompt.indexOf('{'))));
assert.equal(sha(JSON.stringify(projection)),h.call.semanticProjectionSha256);
assert.equal(projection.source.blocks.length,19);
assert.deepEqual(projection.source.blocks.map(b=>b.id),source.blocks.map(b=>b.id));
assert.equal(sha(raw.requestPrompt),h.call.closedPromptSha256);
assert(audit.modelChecks.passed&&audit.effectiveModelChecks.passed);
assert(h.modelReview.issues.every(i=>i.severity==='source-note'));
for(const ref of [h.preservedOldReview.audit,h.preservedOldReview.raw])await bound(ref);
const diagnosisPath=join(root,'integration/coac249-236-fidelity-diagnosis-20261028.json');
const db=await readFile(diagnosisPath),diagnosis=JSON.parse(db);
assert.equal(diagnosis.modelCalls,0);assert.equal(diagnosis.passedPromoted,false);
const c236=JSON.parse(await bound(diagnosis.candidate));
const s236=JSON.parse(await bound(diagnosis.source));
const a236=JSON.parse(await bound(diagnosis.existingAudit));await bound(diagnosis.existingAudit.raw);
assert.equal(a236.status,'needs-repair');assert.equal(a236.modelReview.issues[0].severity,'uncertain');
assert.deepEqual(a236.modelReview.issues[0],diagnosis.existingAudit.issue);
assert.equal(a236.modelReview.contextContinuity.faithful,true);assert.equal(a236.modelReview.semanticCompleteness.complete,true);
assert.equal(c236.body.blocks.find(b=>b.sourceBlockIds[0]===diagnosis.targetId).text,diagnosis.currentText);
assert.equal(s236.blocks.find(b=>b.id===diagnosis.targetId).text,diagnosis.originalSourceText);
assert.equal(diagnosis.distinction.translationAddedTimeAssertion,false);
assert.equal(diagnosis.distinction.verifiableTranslationDefectIdentifiedByCurrentReceipt,false);
const previous=await read(join(out,'../b13-exact-review-return/terminal-result.json'));
assert.equal(previous.calls.length,6);
for(const c of previous.calls){
 const path=c.rawArtifactPath?join(root,'web-production/v1',c.rawArtifactPath):join(root,'audit/calls',c.callId+'.json');
 if(c.rawArtifactSha256)await bound({path,sha256:c.rawArtifactSha256});else{const r=await read(path);assert.equal(r.outputSha256,c.outputSha256);}
}
const calls=[...previous.calls,h.call];assert.equal(new Set(calls.map(c=>c.callId)).size,7);
const usage=Object.fromEntries(['inputTokens','cachedInputTokens','outputTokens'].map(k=>[k,calls.reduce((s,c)=>s+c.usage[k],0)]));
assert.equal(h.budget.batchUsed,7);assert.equal(h.budget.batchMaximum,7);assert.equal(h.budget.remaining,0);
const result={schema:'coac269-stat183-result-update/1',at:new Date().toISOString(),modelCallsThisRun:0,status:'blocked',
 receivedHandoff:handoffRef,chapter183:{candidate:h.candidate,audit:h.audit,raw:h.raw,status:'passed',
  sourceAmbiguity:'Retained as source-note by the real new independent review; author meaning not invented or declared resolved.',
  integration:'Already handed to COAC-250; integration and MCP/Arena acceptance not claimed here.'},
 chapter236:{candidate:diagnosis.candidate,audit:diagnosis.existingAudit,status:'needs-repair',severity:'uncertain',
  diagnosis:{path:diagnosisPath,sha256:sha(db)},
  finding:'Existing receipt identifies an unresolved source timing meaning while finding completeness/context faithful; it does not identify a verifiable added timing claim or omitted condition in this neutral text. This zero-call diagnosis does not relabel the original review.'},
 localCallRecords:7,maximumLocalCalls:7,remainingAllowance:0,automaticRetry:0,usage,calls,
 monetaryCost:null,upstreamRequestCount:null,formalActiveChanged:false};
for(const [name,b]of [['183-reviewed-handoff.json',hb],['183-audit.json',auditBytes],['183-audit-raw.json',rawBytes],['183-context-runtime-manifest.json',manifestBytes],['236-fidelity-diagnosis.json',db]])await writeFile(join(out,name),b);
await writeFile(join(out,'result-update.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(join(out,'immutable-checks.json'),JSON.stringify({modelCalls:0,checksPassed:checks.length,checks},null,2)+'\n');
console.log(JSON.stringify({modelCallsThisRun:0,checksPassed:checks.length,passed183:true,unchanged236Status:a236.status,localCalls:7,remaining:0,usage}));
