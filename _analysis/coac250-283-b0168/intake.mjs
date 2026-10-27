// Evidence-only target intake. The upstream model runner is never invoked.
import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',integration=join(root,'integration'),dir='_analysis/coac250-283-b0168';
const chapter='nemata-jp-chapter-283-1',target='modern-yabejp-ja:chapter06-exercise003:b0168';
const handoff={path:join(integration,'coac249-b0168-reviewed-target-20261028.json'),sha256:'3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c'};
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const abs=p=>isAbsolute(p)?p:resolve(root,p),protectedFiles=[];
async function bound(f){const path=abs(f.path),b=await readFile(path);assert.equal(sha(b),f.sha256,path);if(f.bytes!==undefined)assert.equal(b.length,f.bytes,path);protectedFiles.push({path,sha256:f.sha256});return b;}
await mkdir(dir,{recursive:true});
const h=JSON.parse(await bound(handoff));assert.equal(h.chapterId,chapter);assert.equal(h.targetId,target);assert.equal(h.targetStatus,'passed');assert.equal(h.status,'needs-repair');assert.equal(h.chapterAccepted,false);
const registration=join(integration,'coac250-b0168-target-evidence-intake-20261028.json');
const canonicalPaths=['accepted-preview-current.json','specific-web-variant-selection.v24.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','coac250-unified-chapter-register-20261027b.json','source-structure-holds.json','candidate-exclusions.json','definition-boundary-stage-selection.json','coac250-283-six-table-evidence-intake-20261028.json','coac250-p217-limited-evidence-intake-20261028.json'].map(n=>join(integration,n));
canonicalPaths.push('E:/AgentData/Coach/knowledge/review/textbook-corpus.json');
const canonicalBefore=[];for(const path of canonicalPaths)canonicalBefore.push({path,sha256:sha(await readFile(path))});
const preview=await load(canonicalPaths[0]),register=await load(canonicalPaths[5]);
assert.equal(register.rows.find(r=>r.originalChapterId===chapter).covered,false);assert.equal(register.counts.effectiveCoveredOriginalChapters,232);
assert(!preview.selectedWeb.some(s=>s.candidateSha256===h.candidate.sha256));
assert.equal(preview.corpusId,'bd07bd53701d3a93b330807046e7e8bf135b000da2e92f23260f416369116592');
const writerLock=join(integration,'accepted-consumer.lock'),writerPresent=await exists(writerLock),writerOwner=writerPresent?await load(writerLock):null;
const stopState={};for(const p of ['STOP','web-production/v1/STOP','model-admission-stop.json','integration/ACCEPTED-CONSUMER-STOP'])stopState[p]=await exists(join(root,p));
const c=JSON.parse(await bound(h.candidate)),source=JSON.parse(await bound(h.source)),parent=JSON.parse(await bound(h.parent)),parentAudit=JSON.parse(await bound(h.parentAudit)),producer=JSON.parse(await bound(h.producerHandoff));
const audit=JSON.parse(await bound(h.audit)),checkpoint=JSON.parse(await bound(h.checkpoint)),raw=JSON.parse(await bound(h.raw));
assert.equal(h.candidate.sha256,'b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f');assert.equal(h.parent.sha256,'dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899');
assert.equal(audit.status,'needs-repair');assert.equal(parentAudit.status,'needs-repair');assert.equal(checkpoint.status,'passed');
assert.equal(c.body.blocks.length,1195);assert.equal(c.figures.length,524);assert.deepEqual(c.figures,parent.figures);
const changed=c.body.blocks.map((b,i)=>JSON.stringify(b)===JSON.stringify(parent.body.blocks[i])?null:i).filter(i=>i!==null);assert.equal(changed.length,1);
const revised=c.body.blocks[changed[0]],original=parent.body.blocks[changed[0]];
assert.deepEqual(revised.sourceBlockIds,[target]);assert.equal(original.text,producer.onlyPermittedDiff.before);assert.equal(revised.text,producer.onlyPermittedDiff.after);
assert.equal(revised.text,original.text+'或');assert.deepEqual({...revised,text:original.text},original);
const runtime=JSON.parse(await bound(h.runtime));assert.equal(h.runtime.sha256,'80aa8e8b361d01515d73e6728c4e63d32613ea0a3198ae7e09c21414efde4a3c');assert.equal(runtime.files.length,31);
await mkdir(dir+'/runtime',{recursive:true});
for(const f of runtime.files){await bound(f);await copyFile(abs(f.path),join(dir,'runtime',f.name));}
await copyFile(h.runtime.path,dir+'/runtime/b0168-review-runtime-manifest.json');
const productionManifest=JSON.parse(await bound(runtime.productionManifest));for(const f of productionManifest.files)await bound(f);
await bound(runtime.visionPolicyManifest);
const contract=await load(join(dirname(h.runtime.path),'b0168-contract.json'));assert.equal(contract.targetId,target);assert.equal(contract.before,original.text);assert.equal(contract.expected,revised.text);
await bound(producer.semanticPacket);await bound(c.provenance.revision.targets);
const productionRawBinding={path:join(root,'web-production/v1',producer.productionCall.rawArtifactPath),sha256:producer.productionCall.rawArtifactSha256};
const productionRaw=JSON.parse(await bound(productionRawBinding));assert.equal(productionRaw.exitCode,0);assert.equal(productionRaw.timedOut,false);assert.equal(productionRaw.parsedOutput.translations[0].text,revised.text);assert.deepEqual(productionRaw.parsedOutput.figures,[]);assert.deepEqual(JSON.parse(productionRaw.rawLastMessage),productionRaw.parsedOutput);
const recovered=[];
for(const [name,binding]of [['review-request-boundary.json',producer.firstReview.zeroCallRequestBoundary],['selfcheck.json',producer.selfcheck]]){
 const commit='8a561add329def958c67d9347fe35109ac140ae5',artifact='.multica/delivery/coac-269-web-revision-b-20261027/artifacts/b15-283-b0168/'+name;
 const b=execFileSync('git',['show',commit+':'+artifact],{maxBuffer:5000000});assert.equal(sha(b),binding.sha256);assert.equal(b.length,binding.bytes);await writeFile(dir+'/'+name,b);recovered.push({name,commit,artifact,sha256:sha(b),originalPath:binding.path});
}
const boundary=await load(dir+'/review-request-boundary.json');assert.equal(recovered[0].sha256,h.requestBoundarySha256);
assert.equal(raw.prompt,boundary.request.prompt);assert.deepEqual(raw.schema,boundary.request.schema);assert.equal(raw.requestPrompt,boundary.closedPrompt);assert.equal(sha(raw.requestPrompt),raw.requestPromptSha256);
const imagePaths=raw.requestExecution.args.flatMap((s,i,a)=>s==='-i'?[a[i+1]]:[]);assert.deepEqual(imagePaths,boundary.request.images);assert.equal(imagePaths.length,2);
assert.equal(raw.requestExecution.model,'gpt-6.1-terra');assert.equal(raw.requestExecution.reasoningEffort,'max');assert.equal(raw.requestExecution.callerRequested.model,'gpt-6.1-sol');assert.equal(raw.requestExecution.callerRequested.reasoningEffort,'high');
assert.equal(raw.requestExecution.args[raw.requestExecution.args.indexOf('--model')+1],'gpt-6.1-terra');assert(raw.requestExecution.args.includes('model_reasoning_effort="max"'));
assert.deepEqual(raw.requestExecution,h.requestExecution);assert.deepEqual(raw.requestExecution,h.call.requestExecution);
for(const [i,f]of raw.requestExecution.images.entries()){const b=await bound(f);assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(f.path,imagePaths[i]);assert.equal(f.sha256,boundary.imageBindings[i].sha256);}
for(const aliases of h.pathAliasNormalization)assert.equal(resolve(aliases.planner),resolve(aliases.transport));
const projection=JSON.parse(raw.prompt.slice(raw.prompt.indexOf('{"schema"')));assert.equal(projection.source.blocks.length,127);assert.equal(projection.candidate.blocks.length,127);
assert.deepEqual(projection.reviewScope.targetTextIds,[target]);assert.deepEqual(projection.reviewScope.targetFigureIds,[]);assert.deepEqual(projection.reviewScope,boundary.scope);
const q12Ids=Array.from({length:45},(_,i)=>'modern-yabejp-ja:chapter06-exercise003:b'+String(i+151).padStart(4,'0'));
for(const id of q12Ids){assert(projection.source.blocks.some(b=>b.id===id));assert(projection.candidate.blocks.some(b=>b.sourceBlockIds.includes(id)));}
assert.equal(raw.callId,'3bbbff33-f638-4b9c-ae03-01b8d77e2a5a');assert.equal(raw.success,true);assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);assert.equal(raw.unexpectedTool,false);assert.equal(raw.events.at(-1).type,'turn.completed');assert(raw.events.find(e=>e.type==='thread.started')?.thread_id);
assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.deepEqual(raw.output,checkpoint.modelReview);assert.deepEqual(raw.output,h.modelReview);assert.equal(raw.output.completeTargetScopeCompared,true);assert.equal(raw.output.contextContinuity.faithful,true);assert.deepEqual(raw.output.figureChecks,[]);assert.deepEqual(raw.output.issues,[]);assert.equal(raw.output.textChecks.length,1);assert.equal(raw.output.textChecks[0].id,target);assert.equal(raw.output.textChecks[0].verdict,'faithful');
assert.equal(checkpoint.originalCall.sha256,h.raw.sha256);assert.deepEqual(checkpoint.calls[0],h.call);assert.deepEqual(raw.usage,h.call.usage);assert.equal(raw.durationMs,109070);
const batch010=JSON.parse(await bound(h.inheritedBatch010.checkpoint));assert.equal(batch010.status,'passed');assert.equal(h.inheritedBatch010.blocks,113);assert.equal(batch010.group.sourceBlockIds.length,113);
assert.deepEqual(c.provenance.revision.groupRevision.deferred,h.deferredOriginalIssues);assert.equal(h.deferredOriginalIssues.length,16);
assert.deepEqual(audit.modelReview.issues,parentAudit.modelReview.issues.filter(i=>i.targetId!==target));
for(const item of h.deferredOriginalIssues)assert(parentAudit.modelReview.issues.some(i=>i.targetId===item.targetId&&sha(JSON.stringify(i))===item.issueSha256));
// Both are real calls to the same frozen module, with no audit/maker invocation.
const module=await import(pathToFileURL(join(dirname(h.runtime.path),'textbook-audit-web.mjs')));
let wholeError;try{await module.verifyAuditForWebCandidate(root,h.candidate.path);}catch(e){wholeError=e.message;}
assert.equal(wholeError,'web_audit_not_passed_or_inputs_changed');
const targetResult=await module.verifyGroupRevisionAudit(root,h.candidate.path);assert.equal(targetResult.auditSha256,h.audit.sha256);assert.deepEqual(targetResult.revisedGroups,['chapter06-exercise003-batch-002']);assert.equal(targetResult.receipt.status,'needs-repair');
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).trim().split(/\r?\n/).map(JSON.parse);assert.equal(ledger.filter(c=>c.callId===raw.callId).length,1);
assert.equal(h.totalBatchCalls,2);assert.equal(h.totalBatchMax,2);assert.equal(h.remaining,0);assert.equal(h.retry,0);
const tables=await load(join(integration,'coac250-283-six-table-evidence-intake-20261028.json'));assert.equal(tables.candidate.sha256,h.parent.sha256);assert.equal(tables.chapterAccepted,false);await bound(tables.receipt);await bound(tables.raw);
const scope={chapterId:chapter,targetId:target,acceptedCandidateSha256:h.candidate.sha256,targetStatus:'passed',targetOnly:true,wholeChapterStatus:'needs-repair',chapterAccepted:false,onlyPermittedDiff:producer.onlyPermittedDiff,unchangedBlocks:1194,unchangedFigures:524,deferredOriginalIssues:h.deferredOriginalIssues,inheritedBatch010:h.inheritedBatch010,separateTableBranch:{registration:join(integration,'coac250-283-six-table-evidence-intake-20261028.json'),candidate:tables.candidate,receipt:tables.receipt,raw:tables.raw,status:tables.status,mergedIntoThisCandidate:false,existingEvidenceRetained:true},remainingAction:'Existing chapter owner reconciles exact checkpoint evidence and separately bound table supplement; no complete chapter acceptance or new model/production authorization. Keep deferred parent findings and branch identities intact.'};
await save(dir+'/scope-and-remaining.json',scope);
for(const [name,f]of Object.entries({handoff,producerHandoff:h.producerHandoff,audit:h.audit,checkpoint:h.checkpoint,raw:h.raw,candidate:h.candidate,source:h.source,parent:h.parent,parentAudit:h.parentAudit,productionRaw:productionRawBinding}))await copyFile(abs(f.path),dir+'/'+name+'.json');
for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);for(const f of canonicalBefore)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const result={schema:'coac250-b0168-target-evidence-intake/1',recordedAt:new Date().toISOString(),handoff,status:'registered-passed-target-only',chapterId:chapter,targetId:target,targetStatus:'passed',chapterAccepted:false,candidate:h.candidate,source:h.source,parent:h.parent,parentAudit:h.parentAudit,audit:h.audit,checkpoint:h.checkpoint,raw:h.raw,runtime:h.runtime,runtimeFilesVerified:31,protectedFiles,recoveredRequestBoundary:recovered,scope,actualVerification:{wholeArticle:{function:'verifyAuditForWebCandidate',error:wholeError,expectedRejection:true},target:{function:'verifyGroupRevisionAudit',passed:true,auditSha256:targetResult.auditSha256,revisedGroups:targetResult.revisedGroups,aggregateStatus:targetResult.receipt.status},normalRunnerTerminalExit:h.verification.normalRunnerTerminalExit,modelTransportCompleted:true,retryStarted:false},request:{exactPromptSchemaImages:true,imageCount:2,imagePathAliasOnly:true,contextBlocks:127,completeQ12SourceAndChineseBlocks:45,targetTextIds:[target],targetFigureIds:[]},call:{callId:raw.callId,model:raw.requestExecution.model,reasoningEffort:raw.requestExecution.reasoningEffort,callerRequested:raw.requestExecution.callerRequested,threadId:raw.events.find(e=>e.type==='thread.started').thread_id,usage:raw.usage,durationMs:raw.durationMs,ledgerEntries:1,exitCode:raw.exitCode,eventsPreserved:true},budget:{production:1,independentAudit:1,totalUsed:2,totalMaximum:2,remaining:0,retry:0},measurementLimits:{fee:null,upstreamExecutionCount:null,remoteWeights:'unknown'},canonicalBefore,canonicalUnchanged:true,coverage:{originalChaptersCovered:232,originalChaptersTotal:256,originalUnitsCovered:264,originalUnitsTotal:303,remainingChapters:24,increment:0},selectionVersion:24,previewCorpusId:preview.corpusId,previewBuilt:false,consumerStarted:false,writerLockAcquired:false,writerPresent,writerOwner,stopState,formalActiveChanged:false,productionCalls:0,modelCalls:0};
let deduplicated=false;
try{await writeFile(registration,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;const old=await load(registration);assert.equal(old.handoff.sha256,handoff.sha256);assert.equal(old.candidate.sha256,h.candidate.sha256);assert.equal(old.checkpoint.sha256,h.checkpoint.sha256);deduplicated=true;}
await save(dir+'/verification.json',{...result,registration,deduplicated});
console.log(JSON.stringify({registered:true,deduplicated,targetPassed:true,chapterAccepted:false,wholeVerifier:wholeError,targetVerifierPassed:true,runtimeFiles:31,contextBlocks:127,q12Blocks:45,images:2,deferredIssues:16,coverageIncrement:0,modelCalls:0}));
