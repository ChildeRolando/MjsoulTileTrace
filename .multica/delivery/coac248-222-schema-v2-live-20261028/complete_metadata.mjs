// Complete recorded provenance only; never invokes a model or changes raw/content gates.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',runtime=join(root,'audit/runtimes/coac244-vision-production-schema-v2-20261028');
const run=join(root,'web-production/v1/runs/coac248-web-222-5-r3-20261028');
const local=fileURLToPath(new URL('./',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFile(p),json=async p=>JSON.parse(await read(p));
const write=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const pre=await json(join(run,'preflight.json')),end=await json(join(run,'dispatch-finished.json')),call=end.call;
assert.equal(call.callId,'487c0ef8-603e-405a-83ff-5321247f180b');assert.equal(call.success,true);
const parentPath='web-production/v1/candidates/79-bilibili-cn/cv1775262.r1.display.json';
const parent=await json(join(root,parentPath));
assert.equal(sha(await read(join(root,parentPath))),pre.parentSha256);
const old=parent.figures.find(f=>f.figureId===pre.fieldScope.figureId);
const fields={sourceBlockId:old.sourceBlockIds[0],kind:old.kind,transcription:old.transcription,unknowns:old.unknowns,caption:old.caption,sourceNotes:old.sourceNotes};
const rawPath=join(root,'web-production/v1',call.rawArtifactPath),raw=await json(rawPath);
assert.equal(sha(await read(rawPath)),call.rawArtifactSha256);
assert.equal(raw.success,true);assert.deepEqual(raw.requestExecution,call.requestExecution);
assert.equal(sha(raw.requestPrompt),raw.requestPromptSha256);assert.equal(raw.requestPromptSha256,call.promptSha256);
assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.parsedOutput);
const {validateWebProductionOutput}=await import(pathToFileURL(join(runtime,'production-schema.mjs')));
const {verifyWebRevisionContent,verifyWebProductionCall,verifyWebPresentations,webDeterministicChecks}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const gate=validateWebProductionOutput(raw.parsedOutput,{textIds:[],figureIds:[old.sourceBlockIds[0]],fixedFigure:fields,expectedTranscription:pre.fieldScope.to});
const result=raw.parsedOutput.figures[0],candidate=structuredClone(parent),f=candidate.figures.find(f=>f.figureId===old.figureId);
for(const k of ['kind','transcription','unknowns','caption','sourceNotes'])f[k]=result[k];
f.provenance={method:'model-transcription',callId:call.callId,outputSourceBlockId:old.sourceBlockIds[0]};
candidate.provenance={...parent.provenance,model:call.model,reasoningEffort:call.reasoningEffort,
 attempts:[call],usage:call.usage,modelCalls:1,
 runnerSha256:sha(await read(join(root,'integration/coac244-maker-schema-fix-20261028/run222-fixed.mjs'))),
 revision:call.revision,requestExecution:structuredClone(call.requestExecution)};
delete candidate.provenance.transportRecovery;delete candidate.provenance.derivedFromCandidate;
delete candidate.candidateSha256;candidate.candidateSha256=sha(JSON.stringify(candidate));
const notes=await json(join(root,call.revision.notesPath));
verifyWebRevisionContent(candidate,parent,notes);
assert.deepEqual(candidate.body,parent.body);assert.equal(candidate.figures.length,parent.figures.length);
for(let i=0;i<candidate.figures.length;i++)if(candidate.figures[i].figureId!==f.figureId)assert.deepEqual(candidate.figures[i],parent.figures[i]);
for(const k of ['kind','unknowns','caption','sourceNotes'])assert.deepEqual(f[k],old[k]);
const proof=await verifyWebProductionCall(root,candidate);
// Display assets must bind an exact unpresented artifact of this new output,
// rather than the old r1 semantic content. This does not alter any image bytes.
const unpresented=structuredClone(candidate);
for(const item of unpresented.figures)delete item.presentationAsset;
delete unpresented.candidateSha256;unpresented.candidateSha256=sha(JSON.stringify(unpresented));
const unpresentedPath='web-production/v1/runs/coac248-web-222-5-r3-20261028/model-output-without-display.json';
await write(join(root,unpresentedPath),unpresented);
candidate.provenance.derivedFromCandidate={path:unpresentedPath,sha256:sha(await read(join(root,unpresentedPath))),
 reason:'Exact new model-authored semantic content, with inherited original-image display assets bound separately; not a second candidate for review.'};
delete candidate.candidateSha256;candidate.candidateSha256=sha(JSON.stringify(candidate));
const presentation=await verifyWebPresentations(root,candidate);
const source=await json(join(root,parent.source.sourcePath));
const checks=webDeterministicChecks(candidate,source,parent.source.sourceSha256);
assert.equal(checks.passed,true);assert.equal(presentation.pixels.passed,true);
for(const x of pre.protectedFiles)assert.equal(sha(await read(x.path)),x.sha256,x.path);
const path='web-production/v1/candidates/79-bilibili-cn/cv1775262.r2.display.json';
await write(join(root,path),candidate);
const evidence={schema:'coac248-production-metadata-completion/1',recordedAt:new Date().toISOString(),
 authorization:await json(join(local,'authorization.json')),chapterId:'79-cn-chapter-222-5',
 candidatePath:path,candidateSha256:sha(await read(join(root,path))),parentPath,parentSha256:pre.parentSha256,
 sourceSha256:parent.source.sourceSha256,parentAudit:call.revision.notesPath,parentAuditSha256:call.revision.notesSha256,
 runtimeManifestSha256:pre.runtimeManifestSha256,productionCall:call,fieldScope:pre.fieldScope,gate,proof,presentation,checks,
 metadataCompletion:{originalRunnerExitCode:1,error:'web_production_model',subsequentZeroCallGateError:'web_presentation_missing_parent_binding',
 cause:'Owner fixed runner omitted requestExecution and removed the display parent binding while retaining presentation assets.',
 change:'Copy exact call.requestExecution and bind inherited image display assets to an exact unpresented artifact of this new model output; original validators and image bytes unchanged.',
 unpresentedPath,unpresentedSha256:sha(await read(join(root,unpresentedPath))),unpresentedReviewEligible:false,newModelCalls:0,
 rawUnchanged:true,modelAuthoredFieldsRestoredOrOverwritten:false,runtimeModified:false,originalLedgerClassificationPreserved:true},
 preservation:{body:true,nonTargetFigures:9,figureOrder:true,caption:true,sourceNotes:true,unknowns:true},
 localAttemptAccounting:{priorFailedProduction:1,newSuccessfulProduction:1,firstIndependentReviewConsumed:0,stageCallsConsumed:2,stageMaximum:3},
 remainingBudget:{production:0,targetedIndependentReview:1,retry:0},independentAcceptance:null};
await write(join(local,'production-evidence.json'),evidence);await write(join(run,'production-evidence-metadata-completed.json'),evidence);
await mkdir(join(local,'evidence'),{recursive:true});
await copyFile(join(root,path),join(local,'cv1775262.r2.display.json'));
await copyFile(rawPath,join(local,'evidence',call.callId+'.json'));
await copyFile(join(root,unpresentedPath),join(local,'evidence','model-output-without-display.json'));
for(const name of ['preflight.json','dispatch-started.json','dispatch-finished.json','slot-released.json','chapter-released.json'])await copyFile(join(run,name),join(local,'evidence',name));
console.log(JSON.stringify({candidateSha256:evidence.candidateSha256,callId:call.callId,metadataCompletionNewCalls:0,allOriginalValidatorsPassed:true}));
