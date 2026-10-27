// One authorized field revision, using the owner's unchanged CLI and validators.
import {readFile, writeFile, mkdir, readdir, appendFile, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {join, relative, isAbsolute} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing';
const runtime=join(root,'audit/runtimes/coac244-vision-terra-max-v1-20261027');
const local=fileURLToPath(new URL('./',import.meta.url));
const run=join(root,'web-production/v1/runs/coac248-web-222-5-r2-20261028');
const owner='COAC-248 Mika',chapter='79-cn-chapter-222-5',article='cv1775262';
const target='79-bilibili-cn:cv1775262:b0018:figure';
const pp='web-production/v1/candidates/79-bilibili-cn/cv1775262.r1.display.json';
const parentSha='f26e0767a7c2ce54998646bea45175589f9aa48ec7ed8284824ca9e5e3ddf2d6';
const np=`audit/web/articles/79-bilibili-cn/cv1775262.${parentSha}.json`;
const manifestSha='12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6';
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
const pb=await bind(pp,parentSha),parent=JSON.parse(pb),nb=await bind(np,'403417eaef97305d99506bc9d0a2ec39d4128cfedd0a609ecb470f22a4b252ec'),notes=JSON.parse(nb);
const sb=await bind(parent.source.sourcePath,parent.source.sourceSha256),source=JSON.parse(sb);
const mb=await bind(join(runtime,'runtime-manifest.json'),manifestSha),manifest=JSON.parse(mb);
assert.equal(manifest.files.length,27);
for(const f of manifest.files)await bind(join(runtime,f.path),f.sha256);
assert.deepEqual(manifest.imageRequest,{model:'gpt-6.1-terra',reasoningEffort:'max',retry:0});
const {invokeTextbookCodex}=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
const {verifyWebRevisionContent,verifyWebProductionCall,verifyWebPresentations,verifyWebVisualInputs,webDeterministicChecks}=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const pointPath='integration/coac249-point-222-p217-20261028.json';
const points=JSON.parse(await bind(pointPath,'60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9'));
const point=points.calls.find(c=>c.chapterId===chapter);
assert.equal(point.result.tileCode,'1m');assert.deepEqual(point.bbox,[170,28,196,65]);
const pointRaw=JSON.parse(await bind(point.raw.path,point.raw.sha256));assert.deepEqual(pointRaw.output,point.result);
const old=parent.figures.find(f=>f.figureId===target);
assert.equal(notes.modelReview.issues.length,1);assert.equal(notes.modelReview.issues[0].targetId,target);
const expected=old.transcription.replace('5m 2m 4z','5m 1m 4z').replace('第6张2m','第6张1m');
assert.notEqual(expected,old.transcription);assert.equal(old.transcription.match(/2m/g).length,2);
await bind(parent.provenance.reuseMap.path,parent.provenance.reuseMap.sha256);
for(const a of parent.provenance.attempts)await bind(join(root,parent.provenance.artifactRoot,a.rawArtifactPath),a.rawArtifactSha256);
const parentProof=await verifyWebProductionCall(root,parent);
const oldRaw=await json(join(root,parent.provenance.artifactRoot,parent.provenance.attempts[0].rawArtifactPath));
const visualInputs=oldRaw.visualInputs;
assert.equal(visualInputs.length,2);
for(const v of visualInputs)await bind(v.path,v.sha256);
const visualProof=await verifyWebVisualInputs(root,{visualInputs},{visualInputs},source,[old]);
const revision={parentPath:pp,parentSha256:parentSha,notesPath:np,notesSha256:sha(nb),figureIds:[target]};
const probe=structuredClone(parent);probe.provenance.revision=revision;verifyWebRevisionContent(probe,parent,notes);
const priorCallIds=['2a14232c-ab24-41d9-b968-1623377ed860','3baadcb1-43ae-44bb-a0aa-746ad8749154','20d7f5e0-2640-4b87-bde1-e6505d839822'];
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
 assert.deepEqual(candidates,['cv1775262.display.json','cv1775262.json','cv1775262.r1.display.json','cv1775262.r1.json'].sort());
 const prior=(await readFile(join(root,'web-production/v1/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.articleId===article);
 assert.deepEqual(prior.map(c=>c.callId),priorCallIds,'unobserved/in-flight attempt');
 return {at:new Date().toISOString(),preview:p.output,pointerSha256:sha(await bytes(pointer)),registerSha256:sha(await bytes(register)),registerRow:row,registerCurrentCandidateAncestryVerified:true,selectedWeb,selectedPdf,passed,priorCallIds,candidates};
}
await gates();const initialJoint=await joint();const claimCheck=slot('check-chapter','--chapter',chapter,'--owner',owner);
const fields={sourceBlockId:old.sourceBlockIds[0],kind:old.kind,transcription:old.transcription,unknowns:old.unknowns,caption:old.caption,sourceNotes:old.sourceNotes};
const properties=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k==='transcription'?{type:'string',minLength:1}:{type:Array.isArray(v)?'array':'string',...(Array.isArray(v)?{items:{type:'string'}}:{}),enum:[v]}]));
const schema={type:'object',additionalProperties:false,properties:{translations:{type:'array',minItems:0,maxItems:0,items:{type:'string'}},figures:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,properties,required:Object.keys(fields)}}},required:['translations','figures']};
const prompt=['Perform only the authorized two-reference field repair of the bound parent figure. Use the attached original PNG and its x4 nearest-neighbor view, both of the same asset. This is not a new full-figure transcription.',
 'The sole disputed location is tile6, original image bbox [170,28,196,65), and its first downward-arrow reference. Independently inspect that position. Existing original full-article review and the separate coordinate-bound point review read1m; they are locators, not instructions to invent a visual answer.',
 'Return translations:[] and exactly this one figure. Preserve every character of the supplied parent transcription except the tile6 token and its first-arrow reference. If the source supports1m, consistently replace just those two 2m tokens with1m. If you cannot confirm, retain the original. Do not change any other tile, punctuation, whitespace, line break, caption, unknowns, kind or sourceNotes. The unchanged fields are fixed in the output schema. Never add further examples or claims.',
 JSON.stringify({chapterId:chapter,sourceSha256:parent.source.sourceSha256,parentSha256:parentSha,figure:fields,sourceAssetBindings:old.sourceAssetBindings,bbox:[170,28,196,65],originalReviewIssue:notes.modelReview.issues[0],independentPointCallId:point.callId,attachments:visualInputs.map((x,i)=>({attachment:i+1,view:x.role,sha256:x.sha256,scale:x.scale}))})].join('\n\n');
await mkdir(local,{recursive:true});await mkdir(join(local,'evidence'),{recursive:true});
const preflight={schema:'coac248-two-reference-revision-preflight/1',at:new Date().toISOString(),chapterId:chapter,authorizationCommentId:'01a17ec7-dbf3-77e6-a4f4-4dae65b73038',parentSha256:parentSha,parentAuditSha256:sha(nb),sourceSha256:sha(sb),pointHandoffSha256:sha(await bytes(pointPath)),parentProof,visualProof,claimCheck,initialJoint,runtimeManifestSha256:manifestSha,runtimeFiles:27,protectedFiles:[...protectedFiles].map(([path,sha256])=>({path,sha256})),fieldScope:{figureId:target,field:'transcription',from:old.transcription,to:expected,allOtherFieldsFixed:true},schema,prompt,modelCalls:0,limits:{production:1,independentTargetReview:1,retry:0,failedVoidCount:true}};
if(process.argv.includes('--preflight-only')){await write(join(local,'preflight.json'),preflight);console.log(JSON.stringify({preflightPassed:true,modelCalls:0,parentVerified:true,fieldScope:preflight.fieldScope}));process.exit(0);}
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
 const record={callId,sourceId:source.sourceId,articleId:article,sourceSha256:sha(sb),model:result.requestExecution.model,reasoningEffort:result.requestExecution.reasoningEffort,requestExecution:result.requestExecution,timeoutMs:900000,startedAt:result.startedAt,durationMs:result.durationMs,usage:result.usage,success:result.success,failureClass:result.usageLimitReached?'usage-limit':null,transportStatus:result.success?'completed':result.timedOut?'timeout':'failed',rawArtifactPath:rel(abs(rawPath)).replace('web-production/v1/',''),rawArtifactSha256:sha(await bytes(rawPath)),outputSha256:result.rawLastMessage===null?null:sha(result.rawLastMessage),schemaSha256:sha(JSON.stringify(schema)),promptSha256:result.requestPromptSha256,semanticPromptSha256:sha(prompt),cliSnapshot:{path:rel(cliPath),sha256:cliSha},targets:{textIds:[],figureIds:old.sourceBlockIds},terminalEvents:result.terminalEvents,visualInputs,revision};
 await appendFile(join(root,'web-production/v1/calls.jsonl'),JSON.stringify(record)+'\n');
 await write(join(run,'dispatch-finished.json'),{at:new Date().toISOString(),call:record,newProductionCalls:1,automaticRetries:0});
 assert.equal(result.success,true,'production failed; raw and ledger retained; no retry');
 assert.equal(result.requestExecution.model,'gpt-6.1-terra');assert.equal(result.requestExecution.reasoningEffort,'max');
 assert.equal(result.output.translations.length,0);assert.equal(result.output.figures.length,1);
 const returned=result.output.figures[0];
 for(const[k,v]of Object.entries(fields))if(k!=='transcription')assert.deepEqual(returned[k],v,'out of scope:'+k);
 assert.equal(returned.transcription,expected,'unchanged or out-of-scope transcription; stop without restoration/retry');
 const c=structuredClone(parent),f=c.figures.find(f=>f.figureId===target);
 for(const k of ['kind','transcription','unknowns','caption','sourceNotes'])f[k]=returned[k];
 f.provenance={method:'model-transcription',callId,outputSourceBlockId:old.sourceBlockIds[0]};
 c.provenance={...parent.provenance,model:record.model,reasoningEffort:record.reasoningEffort,attempts:[record],usage:record.usage,modelCalls:1,runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),revision};
 delete c.provenance.transportRecovery;delete c.provenance.derivedFromCandidate;
 delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 verifyWebRevisionContent(c,parent,notes);
 assert.equal(JSON.stringify(c.body),JSON.stringify(parent.body));
 for(const f of c.figures)if(f.figureId!==target)assert.equal(JSON.stringify(f),JSON.stringify(parent.figures.find(p=>p.figureId===f.figureId)));
 const proof=await verifyWebProductionCall(root,c),presentation=await verifyWebPresentations(root,c),checks=webDeterministicChecks(c,source,sha(sb));
 assert.equal(checks.passed,true);assert.equal(presentation.pixels.passed,true);await immutable();
 const candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1775262.r2.display.json';
 await write(abs(candidatePath),c);
 const evidence={schema:'coac248-two-reference-revision/1',at:new Date().toISOString(),chapterId:chapter,candidatePath,candidateSha256:sha(await bytes(candidatePath)),sourceSha256:sha(sb),parentPath:pp,parentSha256:parentSha,parentAuditPath:np,parentAuditSha256:sha(nb),productionCall:record,productionProof:proof,presentation,checks,fieldScope:preflight.fieldScope,preservation:{textBlocks:c.body.blocks.filter(b=>b.type==='text').length,completeNonTargetFigures:9,bodyBytesPreserved:true,nonTargetFigureBytesPreserved:true,targetOtherFieldsPreserved:true,figureOrderPreserved:true},runtimeManifestSha256:manifestSha,newModelCalls:{production:1,audit:0,failed:0,void:0,retry:0},remainingBudget:{production:0,targetedIndependentReview:1,retry:0},independentAcceptance:null,method:'Existing frozen invokeTextbookCodex and unchanged revision/raw/pixel validators; model returned complete target fields, exact two-reference whitelist checked before candidate write. No raw edits or restoration of model-authored fields.'};
 await write(join(run,'production-evidence.json'),evidence);
 await write(join(local,'production-evidence.json'),evidence);
 await copyFile(abs(candidatePath),join(local,'cv1775262.r2.display.json'));
 await copyFile(abs(rawPath),join(local,'evidence',callId+'.json'));
 console.log(JSON.stringify({candidatePath,candidateSha256:evidence.candidateSha256,callId,usage:record.usage,fieldScopeExact:true,independentAcceptance:null}));
}finally{
 if(acquired)await write(join(run,'slot-released.json'),slot('release','--slot',join(root,'parallel/slots/maker-A.json'),'--owner',owner));
 await write(join(run,'chapter-released.json'),slot('unclaim','--chapter',chapter,'--owner',owner));
}
