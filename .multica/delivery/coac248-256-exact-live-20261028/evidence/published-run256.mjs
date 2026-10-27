// One authorized field revision, using the owner's unchanged CLI and validators.
import {readFile, writeFile, mkdir, readdir, appendFile, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {join, relative, isAbsolute} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing';
const runtime=join(root,'audit/runtimes/coac244-256-exact-8s-v1-20261028');
const local=fileURLToPath(new URL('./',import.meta.url));
const run=join(root,'web-production/v1/runs/coac248-web-256-18-r2-20261028');
const owner='COAC-248 Mika',chapter='79-cn-chapter-256-18',article='cv1785770';
const target='79-bilibili-cn:cv1785770:b0016:figure';
const pp='web-production/v1/candidates/79-bilibili-cn/cv1785770.r1.display.json';
const parentSha='56ea08c0868e87628f61a777a35c40a9a8372bddfcca23a7daef6be3a3bdafe2';
const np=`audit/web/articles/79-bilibili-cn/cv1785770.${parentSha}.json`;
const manifestSha=JSON.parse(await readFile(new URL('./release.json',import.meta.url))).runtimeManifestSha256;
const sha=b=>createHash('sha256').update(b).digest('hex');
const abs=p=>isAbsolute(p)?p:join(root,p);
const rel=p=>relative(root,p).replaceAll('\\','/');
const bytes=p=>readFile(abs(p)),json=async p=>JSON.parse(await bytes(p));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const write=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const slot=(...args)=>JSON.parse(execFileSync('E:/IDE/NodeJS/node.exe',[join(root,'parallel/slots.mjs'),...args],{encoding:'utf8',windowsHide:true}));
const protectedFiles=new Map();
async function bind(p,hash){const b=await bytes(p);if(hash)assert.equal(sha(b),hash,p);protectedFiles.set(abs(p),sha(b));return b;}
async function immutable(){for(const[p,h]of protectedFiles)assert.equal(sha(await readFile(p)),h,p);}
async function gates(){for(const p of ['STOP','web-production/v1/STOP','model-admission-stop.json'])assert.equal(await readFile(join(root,p)).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;}),false,p);}
const pb=await bind(pp,parentSha),parent=JSON.parse(pb),nb=await bind(np,'8341055fc9fec8aacf5c8dd6344cb5af99cfc6998f76105f7dc7d8e13a9a4b21'),notes=JSON.parse(nb);
const sb=await bind(parent.source.sourcePath,parent.source.sourceSha256),source=JSON.parse(sb);
const mb=await bind(join(runtime,'runtime-manifest.json'),manifestSha),manifest=JSON.parse(mb);
assert.equal(manifest.files.length,30);
for(const f of manifest.files)await bind(join(runtime,f.path),f.sha256);
assert.deepEqual(manifest.imageRequest,{model:'gpt-6.1-terra',reasoningEffort:'max',retry:0});
const {invokeTextbookCodex}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
const {webProductionSchema,validateWebProductionOutput}=await import(pathToFileURL(join(runtime,'production-schema.mjs')));
const {verifyWebRevisionContent,verifyWebProductionCall,verifyWebPresentations,verifyWebVisualInputs,webDeterministicChecks}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const old=parent.figures.find(f=>f.figureId===target);
assert.equal(old.sourceAssetBindings[0].sha256??old.sourceAssetBindings[0].sourceSha256,'1f763b6fa772080e64a8d6e4e11d6f85d2147bfd1a8aacce6216e2f1e3054dce');
const reviewRawPath='audit/calls/6bf6cb0d-1123-45f8-a4b0-975dd270b4c0.json';
await bind(reviewRawPath,'6ed8519078198ecb6310bf2ed36dc5aaddff786ea5b79a82afdf555146ffcf1c');
const issue=notes.modelReview.issues.find(i=>i.severity==='error'&&i.targetId===target);
assert(issue&&JSON.stringify(issue).includes('8s')&&JSON.stringify(issue).includes('12'));
assert.equal(old.transcription.split('7s [索子，数字不明] 9s').length,2);
const expected=old.transcription.replace('7s [索子，数字不明] 9s','7s 8s 9s');
assert.equal(old.unknowns.length,3);
assert.equal(old.unknowns[0],'下方手牌从左到右第12张：可辨为索子，数字无法可靠辨认。');
const expectedUnknowns=old.unknowns.slice(1);
await bind(parent.provenance.reuseMap.path,parent.provenance.reuseMap.sha256);
for(const a of parent.provenance.attempts)await bind(join(root,parent.provenance.artifactRoot,a.rawArtifactPath),a.rawArtifactSha256);
const parentProof=await verifyWebProductionCall(root,parent);
const oldRaw=await json(join(root,parent.provenance.artifactRoot,parent.provenance.attempts[0].rawArtifactPath));
const visualInputs=oldRaw.visualInputs;
assert.equal(visualInputs.length,2);
for(const v of visualInputs)await bind(v.path,v.sha256);
const visualProof=await verifyWebVisualInputs(root,{visualInputs},{visualInputs},source,[old]);
const revision={parentPath:pp,parentSha256:parentSha,notesPath:np,notesSha256:sha(nb),figureIds:[target]};
const probe=structuredClone(parent);probe.provenance.revision=revision;let revisionScopeError=null;try{verifyWebRevisionContent(probe,parent,notes);}catch(e){revisionScopeError={code:e.message,stack:e.stack};}
const priorCallIds=['d59465bb-7539-4e37-850f-08a0bacea007','62f11e87-87a0-412c-bc76-452af479ef49','8edb9889-e306-4695-8b5a-1bc1dc8cf37e'];
async function joint(){
 const pointer='integration/accepted-preview-current.json',register='integration/coac250-unified-chapter-register-20261027b.json';
 const p=await json(pointer),g=await json(register),row=g.rows.find(r=>r.chapterId===chapter);
 assert.equal(row.approvedWebCorrespondence.articleId,article);assert.equal(row.sourceId,'79-cn');assert.equal(row.covered,false);
 assert.equal(row.existingCandidate.sourceBoundCurrent,true);
 // Register still names the base. Verify its exact ancestry to the current r1.
 assert.equal(row.existingCandidate.sha256,parent.provenance.revision.parentSha256);
 await bind(row.existingCandidate.path,row.existingCandidate.sha256);
 assert.equal(row.existingCandidate.sourceSha256,parent.source.sourceSha256);
 const selectedWeb=(p.selectedWeb??[]).filter(x=>JSON.stringify(x).includes(article));
 const selectedPdf=(p.selectedPdf?.stages??[]).filter(x=>x.receipt?.chapterIds?.includes(chapter));
 assert.equal(selectedWeb.length+selectedPdf.length,0,'already selected');
 const passed=[];
 for(const f of await readdir(join(root,'audit/web/articles/79-bilibili-cn'))){
  if(!f.startsWith(article+'.')||!f.endsWith('.json'))continue;
  const a=await json('audit/web/articles/79-bilibili-cn/'+f);
  if(a.status?.startsWith('passed')&&a.source?.sourceSha256===parent.source.sourceSha256){
   const cb=await readFile(abs(a.production.path));if(sha(cb)===a.production.sha256)passed.push(f);
  }
 }
 assert.equal(passed.length,0,'already passed replacement');
 const candidates=(await readdir(join(root,'web-production/v1/candidates/79-bilibili-cn'))).filter(f=>f.startsWith(article+'.')).sort();
 assert.deepEqual(candidates,['cv1785770.display.json','cv1785770.json','cv1785770.r1.display.json','cv1785770.r1.json'].sort());
 const prior=(await readFile(join(root,'web-production/v1/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.articleId===article);
 assert.deepEqual(prior.map(c=>c.callId),priorCallIds,'unobserved/in-flight attempt');
 return {at:new Date().toISOString(),preview:p.output,pointerSha256:sha(await bytes(pointer)),registerSha256:sha(await bytes(register)),registerRow:row,registerCurrentCandidateAncestryVerified:true,selectedWeb,selectedPdf,passed,priorCallIds,candidates};
}
await gates();const initialJoint=await joint();const claimCheck=slot('check-chapter','--chapter',chapter,'--owner',owner);
const fields={sourceBlockId:old.sourceBlockIds[0],kind:old.kind,transcription:old.transcription,unknowns:expectedUnknowns,caption:old.caption,sourceNotes:old.sourceNotes};
const schema=webProductionSchema({textIds:[],figureIds:[old.sourceBlockIds[0]],fixedFigure:fields});
schema.properties.figures.items.properties.transcription.enum=[expected];
const prompt=[
 'Perform only one exact tile repair in the bound parent figure. The attached original500x500 PNG and its2x nearest-neighbor view are the same source asset, not new source information. No other tile reading is requested.',
 'The target is the bottom concealed hand, twelfth tile from left, between7s and9s, native top-left half-open bbox[368,459,391,489). Independently check the actual source at this location. The original independent full-chapter review identified8s here; use the image rather than copying any controller assertion.',
 'Return translations:[] and exactly one figure. If the image confirms8s, change only the exact unique substring "7s [索子，数字不明] 9s" to "7s 8s 9s" and remove only the first unknown entry naming the bottom hand tile12. Preserve the remaining two river unknown strings exactly. Every other character, whitespace, punctuation, line break, tile, kind, caption and sourceNotes must remain identical. Do not fix unrelated source-note attachment numbering, do not add a note, and do not infer any unknown from tile logic or source prose. If8s cannot be confirmed, retain the old text and unknowns; local gates will reject that output without retry.',
 JSON.stringify({chapterId:chapter,sourceSha256:parent.source.sourceSha256,parentSha256:parentSha,
 parentFigure:{...fields,unknowns:old.unknowns},expectedTranscription:expected,expectedUnknowns,sourceAssetBindings:old.sourceAssetBindings,
 bbox:[368,459,391,489],originalReviewIssue:issue,
 attachments:visualInputs.map((x,i)=>({attachment:i+1,view:x.role,sha256:x.sha256,scale:x.scale}))})
].join('\n\n');
// Zero-call negative checks for the exact whitelist and array coverage before production.
const valid={translations:[],figures:[{...fields,transcription:expected}]};
const validate=x=>validateWebProductionOutput(x,{textIds:[],figureIds:old.sourceBlockIds,fixedFigure:fields,expectedTranscription:expected});
validate(valid);
const negativeChecks=[];
for(const[name,mutate]of [
 ['extra-text',x=>x.translations.push({sourceBlockId:'other',text:'out of scope'})],
 ['missing-figure',x=>x.figures=[]],['duplicate-figure',x=>x.figures.push(x.figures[0])],
 ['empty-transcription',x=>x.figures[0].transcription=''],
 ['other-tile-change',x=>x.figures[0].transcription=x.figures[0].transcription.replace('1m','2m')],
 ['extra-unknown-removal',x=>x.figures[0].unknowns=[]],
 ['duplicate-unknown',x=>x.figures[0].unknowns.push(x.figures[0].unknowns[0])],
 ['caption-change',x=>x.figures[0].caption+='changed'],
 ['sourceNote-change',x=>x.figures[0].sourceNotes=[]]
]){const x=structuredClone(valid);mutate(x);assert.throws(()=>validate(x));negativeChecks.push({name,rejected:true});}
await mkdir(local,{recursive:true});await mkdir(join(local,'evidence'),{recursive:true});
const preflight={schema:'coac248-exact-8s-revision-preflight/1',at:new Date().toISOString(),chapterId:chapter,authorizationCommentId:'01a17f8d-38c9-7cf9-ad2c-01bddd851470',parentSha256:parentSha,parentAuditSha256:sha(nb),sourceSha256:sha(sb),reviewRawPath,reviewRawSha256:sha(await bytes(reviewRawPath)),negativeChecks,revisionScopeError,parentProof,visualProof,claimCheck,initialJoint,runtimeManifestSha256:manifestSha,runtimeFiles:28,protectedFiles:[...protectedFiles].map(([path,sha256])=>({path,sha256})),fieldScope:{figureId:target,fields:['transcription','unknowns'],from:old.transcription,to:expected,unknownsFrom:old.unknowns,unknownsTo:expectedUnknowns,bbox:[368,459,391,489],allOtherFieldsFixed:true},schema,prompt,modelCalls:0,limits:{production:1,independentTargetReview:1,retry:0,failedVoidCount:true}};
if(process.argv.includes('--preflight-only')){await write(join(local,'preflight256.json'),preflight);console.log(JSON.stringify({preflightPassed:!revisionScopeError,revisionScopeError,modelCalls:0,parentVerified:true}));process.exit(0);}
assert.equal(revisionScopeError,null,'No dispatch until existing owner verifies and freezes a legal exact-target admission preserving the two uncertain entries.');
assert(process.argv.includes('--execute-authorized'),'Explicit --execute-authorized required; otherwise no dispatch. Use --preflight-only for offline gate checks.');
await mkdir(run,{recursive:false});await write(join(run,'preflight.json'),preflight);
slot('claim','--chapter',chapter,'--candidate-sha',parentSha,'--lane','A','--owner',owner);
let acquired=false;
try{
 const acquisition=slot('acquire','--lane','A','--owner',owner,'--pid',String(process.pid));acquired=true;
 await gates();const latest=await joint();await immutable();slot('check-chapter','--chapter',chapter,'--owner',owner);
 const callId=randomUUID();
 await write(join(run,'dispatch-started.json'),{at:new Date().toISOString(),callId,pid:process.pid,slot:acquisition,jointExclusion:latest,model:'gpt-6.1-terra',reasoningEffort:'max',images:visualInputs,limits:preflight.limits});
 const result=await invokeTextbookCodex({prompt,schema,model:'gpt-6.1-terra',reasoningEffort:'max',images:visualInputs.map(v=>abs(v.path)),timeoutMs:900000,stopFiles:['STOP','web-production/v1/STOP'].map(abs)});
 const rawPath=`web-production/v1/raw-calls/${callId}.json`,cliPath=join(runtime,'textbook-production-cli.mjs'),cliSha=sha(await readFile(cliPath));
 const raw={callId,...result,parsedOutput:result.output,semanticPrompt:prompt,schema,cliSha256:cliSha,visualInputs,authorizationCommentId:preflight.authorizationCommentId};
 await write(abs(rawPath),raw);
 const record={callId,sourceId:source.sourceId,articleId:article,sourceSha256:sha(sb),model:result.requestExecution?.model??null,reasoningEffort:result.requestExecution?.reasoningEffort??null,requestExecution:result.requestExecution,timeoutMs:900000,startedAt:result.startedAt,durationMs:result.durationMs,usage:result.usage,success:result.success,failureClass:result.usageLimitReached?'usage-limit':null,transportStatus:result.success?'completed':result.timedOut?'timeout':'failed',rawArtifactPath:rel(abs(rawPath)).replace('web-production/v1/',''),rawArtifactSha256:sha(await bytes(rawPath)),outputSha256:result.rawLastMessage===null?null:sha(result.rawLastMessage),schemaSha256:sha(JSON.stringify(schema)),promptSha256:result.requestPromptSha256,semanticPromptSha256:sha(prompt),cliSnapshot:{path:rel(cliPath),sha256:cliSha},targets:{textIds:[],figureIds:old.sourceBlockIds},terminalEvents:result.terminalEvents,visualInputs,revision};
 await appendFile(join(root,'web-production/v1/calls.jsonl'),JSON.stringify(record)+'\n');
 await write(join(run,'dispatch-finished.json'),{at:new Date().toISOString(),call:record,newProductionCalls:1,automaticRetries:0});
 assert.equal(result.success,true,'production failed; raw and ledger retained; no retry');
 assert.equal(result.requestExecution.model,'gpt-6.1-terra');assert.equal(result.requestExecution.reasoningEffort,'max');
 validateWebProductionOutput(result.output,{textIds:[],figureIds:[old.sourceBlockIds[0]],fixedFigure:fields,expectedTranscription:expected});
 assert.equal(result.output.translations.length,0);assert.equal(result.output.figures.length,1);
 const returned=result.output.figures[0];
 for(const[k,v]of Object.entries(fields))if(k!=='transcription')assert.deepEqual(returned[k],v,'out of scope:'+k);
 assert.equal(returned.transcription,expected,'unchanged or out-of-scope transcription; stop without restoration/retry');
 const c=structuredClone(parent),f=c.figures.find(f=>f.figureId===target);
 for(const k of ['kind','transcription','unknowns','caption','sourceNotes'])f[k]=returned[k];
 f.provenance={method:'model-transcription',callId,outputSourceBlockId:old.sourceBlockIds[0]};
 c.provenance={...parent.provenance,model:record.model,reasoningEffort:record.reasoningEffort,attempts:[record],usage:record.usage,modelCalls:1,runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),revision,requestExecution:structuredClone(record.requestExecution)};
 delete c.provenance.transportRecovery;delete c.provenance.derivedFromCandidate;
 delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 verifyWebRevisionContent(c,parent,notes);
 assert.equal(JSON.stringify(c.body),JSON.stringify(parent.body));
 for(const f of c.figures)if(f.figureId!==target)assert.equal(JSON.stringify(f),JSON.stringify(parent.figures.find(p=>p.figureId===f.figureId)));
 const proof=await verifyWebProductionCall(root,c);
 const unpresented=structuredClone(c);for(const f of unpresented.figures)delete f.presentationAsset;
 delete unpresented.candidateSha256;unpresented.candidateSha256=sha(JSON.stringify(unpresented));
 const unpresentedPath=rel(join(run,'model-output-without-display.json'));await write(abs(unpresentedPath),unpresented);
 c.provenance.derivedFromCandidate={path:unpresentedPath,sha256:sha(await bytes(unpresentedPath)),reason:'Exact new model-authored semantic output; inherited original-image presentations bound separately. Not separately review eligible.'};
 delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 const presentation=await verifyWebPresentations(root,c),checks=webDeterministicChecks(c,source,sha(sb));
 assert.equal(checks.passed,true);assert.equal(presentation.pixels.passed,true);await immutable();
 const candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1785770.r2.display.json';
 await write(abs(candidatePath),c);
 const evidence={schema:'coac248-exact-8s-revision/1',at:new Date().toISOString(),chapterId:chapter,candidatePath,candidateSha256:sha(await bytes(candidatePath)),sourceSha256:sha(sb),parentPath:pp,parentSha256:parentSha,parentAuditPath:np,parentAuditSha256:sha(nb),productionCall:record,productionProof:proof,presentation,checks,fieldScope:preflight.fieldScope,preservation:{textBlocks:c.body.blocks.filter(b=>b.type==='text').length,completeNonTargetFigures:3,bodyBytesPreserved:true,nonTargetFigureBytesPreserved:true,targetOtherFieldsPreserved:true,onlyFirstUnknownRemoved:true,figureOrderPreserved:true},runtimeManifestSha256:manifestSha,newModelCalls:{production:1,audit:0,failed:0,void:0,retry:0},remainingBudget:{production:0,targetedIndependentReview:1,retry:0},independentAcceptance:null,method:'Existing frozen invokeTextbookCodex and unchanged revision/raw/pixel validators; model returned complete target fields, exact exact-8s whitelist checked before candidate write. No raw edits or restoration of model-authored fields.'};
 await write(join(run,'production-evidence.json'),evidence);
 await write(join(local,'production-evidence.json'),evidence);
 await copyFile(abs(candidatePath),join(local,'cv1785770.r2.display.json'));
 await copyFile(abs(rawPath),join(local,'evidence',callId+'.json'));
 console.log(JSON.stringify({candidatePath,candidateSha256:evidence.candidateSha256,callId,usage:record.usage,fieldScopeExact:true,independentAcceptance:null}));
}finally{
 if(acquired)await write(join(run,'slot-released.json'),slot('release','--slot',join(root,'parallel/slots/maker-A.json'),'--owner',owner));
 await write(join(run,'chapter-released.json'),slot('unclaim','--chapter',chapter,'--owner',owner));
}
