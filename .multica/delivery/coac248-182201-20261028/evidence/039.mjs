import {readFile,writeFile,mkdir,readdir,appendFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root='E:/AgentData/Coach/knowledge/processing';
const release=JSON.parse(await readFile(join(here,'release.json'))),rt=release.runtimePath;
const job=release.jobs.find(j=>j.articleId===process.argv[2]);assert(job,'Select exact article');
const owner='COAC-248 Mika',auth=job.plan.authorizationCommentId,run=join(root,'web-production/v1/runs/coac248-182201-'+job.articleId+'-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex'),abs=p=>isAbsolute(p)?p:join(root,p),rel=p=>relative(root,p).replaceAll('\\','/');
const bytes=p=>readFile(abs(p)),json=async p=>JSON.parse(await bytes(p));
const write=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const slot=(...args)=>JSON.parse(execFileSync('E:/IDE/NodeJS/node.exe',[join(root,'parallel/slots.mjs'),...args],{encoding:'utf8',windowsHide:true}));
const audit=await import(pathToFileURL(join(rt,'textbook-audit-web.mjs')));
const {assertInlinePlan,inlineTextAllowed}=await import(pathToFileURL(join(rt,'inline-japanese-revision.mjs')));
const {invokeTextbookCodex,textbookClosedPrompt}=await import(pathToFileURL(join(rt,'textbook-production-cli.mjs')));
const {webProductionSchema,validateWebProductionOutput}=await import(pathToFileURL(join(rt,'production-schema.mjs')));
const protectedFiles=new Map();
async function bind(p,h){const b=await bytes(p);assert.equal(sha(b),h,'binding:'+p);protectedFiles.set(p,h);return b;}
async function immutable(){for(const[p,h]of protectedFiles)assert.equal(sha(await bytes(p)),h,'changed:'+p);}
async function gates(){for(const p of ['STOP','web-production/v1/STOP','model-admission-stop.json']){try{await access(abs(p));throw Error('STOP:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}}}
await bind(join(rt,'runtime-manifest.json'),release.runtimeManifestSha256);
const manifest=await json(join(rt,'runtime-manifest.json'));for(const f of manifest.files)await bind(join(rt,f.name),f.sha256);
const parent=JSON.parse(await bind(job.parentPath,job.parentSha256)),notes=JSON.parse(await bind(job.notesPath,job.notesSha256)),source=JSON.parse(await bind(job.sourcePath,job.sourceSha256));
await bind(job.planPath,job.planSha256);assertInlinePlan(job.plan,parent,notes,source,job.plan.bindings);
const reviewCall=notes.calls[0];await bind('audit/calls/'+reviewCall.callId+'.json',sha(await bytes('audit/calls/'+reviewCall.callId+'.json')));
for(const a of parent.provenance.attempts)await bind(join(parent.provenance.artifactRoot,a.rawArtifactPath),a.rawArtifactSha256);
const parentProof=await audit.verifyWebProductionCall(root,parent),parentPresentation=await audit.verifyWebPresentations(root,parent);
const revision={parentPath:job.parentPath,parentSha256:job.parentSha256,notesPath:job.notesPath,notesSha256:job.notesSha256,textBlockIds:[job.targetId],figureIds:[],inlineJapanese:{path:job.planPath,sha256:job.planSha256,plan:job.plan}};
const probe=structuredClone(parent);probe.provenance.revision=revision;audit.verifyWebRevisionContent(probe,parent,notes);
const inherit=await audit.verifyWebRevisionInheritance(root,probe);assert.equal(inherit.chapterAccepted,false);
const old=parent.body.blocks.find(b=>b.sourceBlockIds[0]===job.targetId),quote=job.plan.edits[0].quotedText;
const schema=webProductionSchema({textIds:[job.targetId],figureIds:[]});
const payload={chapterId:job.chapterId,sourceSha256:job.sourceSha256,parentSha256:job.parentSha256,orderedSourceBlocks:source.blocks,orderedCandidateBlocks:parent.body.blocks,figures:parent.figures,targets:{textIds:[job.targetId],figureIds:[]},editPlan:job.plan};
const prompt=[
 'Only translate the one specified Japanese quotation inside an otherwise verbatim Chinese Mahjong textbook. No tools or external information. Return exactly one complete target block under translations and figures:[].',
 'Keep the original Japanese quotation character-for-character and insert its faithful Simplified Chinese meaning immediately after it using exactly （中文释义）. Preserve EVERY other character of the complete target block, including whitespace, original Chinese parenthetical comments, URLs, separators, numbers, punctuation and conditions. Do not add Markdown markers: sourceSegments preserve original marks. No other Japanese occurrence or Chinese prose may change. Do not fix source typos or ambiguity, and do not infer unknown tiles from prose or strategy.',
 'Retain the original saying/metaphor, author modality and force. Interpret only from the complete ordered lesson below. The prior review identifies an untranslated contribution, not an authoritative translation to copy. Existing source ambiguity and figure unknowns are deliberately outside the maker scope and will go to an independent context/impact review. Do not resolve them. Bound edit plan: '+JSON.stringify(job.plan),
 JSON.stringify(payload)
].join('\n\n');
function validate(output){validateWebProductionOutput(output,{textIds:[job.targetId],figureIds:[]});const t=output.translations[0].text;assert(t!==old.text,'untranslated_quote');assert(inlineTextAllowed(job.plan,job.targetId,old.text,t),'outside_exact_quote_gloss');}
const valid={translations:[{sourceBlockId:job.targetId,text:old.text.replace(quote,quote+'（中文释义）')}],figures:[]};validate(valid);
const negatives=[];
for(const[n,mut]of [
 ['missing',x=>x.translations=[]],['duplicate',x=>x.translations.push(x.translations[0])],['empty',x=>x.translations[0].text=''],
 ['wrong-target',x=>x.translations[0].sourceBlockId+='x'],['extra-figure',x=>x.figures.push({})],
 ['unchanged',x=>x.translations[0].text=old.text],['outside-quote',x=>x.translations[0].text+='。'],['extra-key',x=>x.other=true]
]){const x=structuredClone(valid);mut(x);assert.throws(()=>validate(x));negatives.push({name:n,rejected:true});}
for(const[n,mut]of [
 ['wrong-parent-sha',x=>x.provenance.revision.parentSha256='0'.repeat(64)],
 ['wrong-source-sha',x=>x.source.sourceSha256='0'.repeat(64)],['wrong-plan-sha',x=>x.provenance.revision.inlineJapanese.sha256='0'.repeat(64)],
 ['wrong-target-path',x=>x.provenance.revision.textBlockIds=['other']],
 ['non-target-text',x=>x.body.blocks.find(b=>b.type==='text'&&b.sourceBlockIds[0]!==job.targetId).text+='。'],
 ['caption',x=>x.figures[0].caption+='。'],['unknown-removal',x=>{const f=x.figures.find(f=>f.unknowns.length);if(f)f.unknowns=[];else x.figures[0].unknowns=['invented'];}],
 ['order',x=>x.body.blocks.reverse()]
]){const x=structuredClone(probe);mut(x);assert.throws(()=>audit.verifyWebRevisionContent(x,parent,notes));negatives.push({name:n,rejected:true});}
const wrongNotes=structuredClone(notes);wrongNotes.modelReview.issues.pop();assert.throws(()=>audit.verifyWebRevisionContent(probe,parent,wrongNotes));negatives.push({name:'parent-review-change',rejected:true});
async function joint(){
 const pointer='integration/accepted-preview-current.json',register='integration/coac250-unified-chapter-register-20261027b.json';
 const p=await json(pointer),g=await json(register),row=g.rows.find(r=>r.chapterId===job.chapterId);assert(row&&!row.covered,'already covered');
 assert.equal(row.approvedWebCorrespondence.articleId,job.articleId);assert.equal(row.existingCandidate.sha256,job.parentSha256);assert.equal(row.existingCandidate.sourceBoundCurrent,true);
 assert.equal((p.selectedWeb??[]).filter(x=>JSON.stringify(x).includes(job.articleId)).length,0,'already selected');
 assert.equal((p.selectedPdf?.stages??[]).filter(x=>x.receipt?.chapterIds?.includes(job.chapterId)).length,0,'already selected PDF');
 const passed=[];for(const f of await readdir(abs('audit/web/articles/79-bilibili-cn'))){if(!f.startsWith(job.articleId+'.')||!f.endsWith('.json'))continue;const a=await json('audit/web/articles/79-bilibili-cn/'+f);if(a.status?.startsWith('passed')&&a.source?.sourceSha256===job.sourceSha256&&sha(await bytes(a.production.path))===a.production.sha256)passed.push(f);}assert.equal(passed.length,0,'reuse passed instead');
 const candidates=(await readdir(abs('web-production/v1/candidates/79-bilibili-cn'))).filter(f=>f.startsWith(job.articleId+'.')).sort();assert.deepEqual(candidates,[job.articleId+'.display.json',job.articleId+'.json'].sort(),'new/inflight candidate');
 const calls=(await readFile(abs('web-production/v1/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.articleId===job.articleId);assert.deepEqual(calls.map(c=>c.callId),job.priorCallIds,'new/inflight call');
 return {at:new Date().toISOString(),previewSha256:sha(await bytes(pointer)),registerSha256:sha(await bytes(register)),registerRow:row,passed,candidates,callHistory:job.history};
}
await gates();const exclusion=await joint(),claimCheck=slot('check-chapter','--chapter',job.chapterId,'--owner',owner);await immutable();
const preflight={authorizationCommentId:auth,job,runtimeManifestSha256:release.runtimeManifestSha256,parentProof,parentPresentation,inheritance:inherit,negatives,exclusion,claimCheck,request:{model:'gpt-6.1-sol',reasoningEffort:'high',images:[],schema,prompt,closedPromptSha256:sha(textbookClosedPrompt(prompt))},modelCalls:0,limits:{maker:1,independentReview:1,retry:0,failedVoidCount:true},productionOnly:true};
if(process.argv.includes('--preflight-only')){await write(join(here,job.articleId+'-preflight.json'),preflight);console.log(JSON.stringify({preflightPassed:true,article:job.articleId,negativeChecks:negatives.length,parentVerified:true,modelCalls:0}));process.exit(0);}
assert(process.argv.includes('--execute-authorized'),'No implicit dispatch');await mkdir(run,{recursive:false});await write(join(run,'preflight.json'),preflight);
slot('claim','--chapter',job.chapterId,'--candidate-sha',job.parentSha256,'--lane','A','--owner',owner);let acquired=false;
try{
 const acquisition=slot('acquire','--lane','A','--owner',owner,'--pid',String(process.pid));acquired=true;await gates();const latest=await joint();await immutable();slot('check-chapter','--chapter',job.chapterId,'--owner',owner);
 const callId=randomUUID();await write(join(run,'dispatch-started.json'),{callId,at:new Date().toISOString(),pid:process.pid,joint:latest,slot:acquisition,model:'gpt-6.1-sol',reasoningEffort:'high',images:[],budget:{maker:1,reviewReservedFor249:1,retry:0}});
 const result=await invokeTextbookCodex({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:[],timeoutMs:900000,stopFiles:['STOP','web-production/v1/STOP'].map(abs)});
 const rawPath='web-production/v1/raw-calls/'+callId+'.json',cliPath=join(rt,'textbook-production-cli.mjs'),cliSha=sha(await readFile(cliPath));
 await write(abs(rawPath),{callId,...result,parsedOutput:result.output,semanticPrompt:prompt,schema,cliSha256:cliSha,visualInputs:[],authorizationCommentId:auth});
 const record={callId,sourceId:source.sourceId,articleId:job.articleId,sourceSha256:job.sourceSha256,model:result.requestExecution?.model??null,reasoningEffort:result.requestExecution?.reasoningEffort??null,requestExecution:result.requestExecution,timeoutMs:900000,startedAt:result.startedAt,durationMs:result.durationMs,usage:result.usage,success:result.success,transportStatus:result.success?'completed':result.timedOut?'timeout':'failed',failureClass:result.usageLimitReached?'usage-limit':null,rawArtifactPath:rawPath.replace('web-production/v1/',''),rawArtifactSha256:sha(await bytes(rawPath)),outputSha256:result.rawLastMessage===null?null:sha(result.rawLastMessage),schemaSha256:sha(JSON.stringify(schema)),promptSha256:result.requestPromptSha256,semanticPromptSha256:sha(prompt),cliSnapshot:{path:rel(cliPath),sha256:cliSha},targets:{textIds:[job.targetId],figureIds:[]},terminalEvents:result.terminalEvents,visualInputs:[],revision};
 await appendFile(abs('web-production/v1/calls.jsonl'),JSON.stringify(record)+'\n');await write(join(run,'dispatch-finished.json'),{call:record,newProductionCalls:1,retries:0});
 assert.equal(result.success,true,'Failed; preserved raw and ledger; no retry');assert.equal(record.model,'gpt-6.1-sol');assert.equal(record.reasoningEffort,'high');assert.equal(record.requestExecution.images.length,0);validate(result.output);
 const c=structuredClone(parent);c.body.blocks.find(b=>b.sourceBlockIds[0]===job.targetId).text=result.output.translations[0].text;
 c.provenance={...parent.provenance,model:record.model,reasoningEffort:record.reasoningEffort,artifactRoot:'web-production/v1',attempts:[record],usage:record.usage,modelCalls:1,runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),revision,requestExecution:structuredClone(record.requestExecution)};
 delete c.provenance.derivedFromCandidate;delete c.provenance.transportRecovery;delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 audit.verifyWebRevisionContent(c,parent,notes);const proof=await audit.verifyWebProductionCall(root,c);
 const unpresented=structuredClone(c);for(const f of unpresented.figures)delete f.presentationAsset;delete unpresented.candidateSha256;unpresented.candidateSha256=sha(JSON.stringify(unpresented));
 const intermediate=rel(join(run,'model-output-without-display.json'));await write(abs(intermediate),unpresented);
 c.provenance.derivedFromCandidate={path:intermediate,sha256:sha(await bytes(intermediate)),reason:'Exact real model-authored inline translation with unchanged original-image presentations. Intermediate is not a separate review candidate.'};delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
 const presentation=await audit.verifyWebPresentations(root,c),checks=audit.webDeterministicChecks(c,source,job.sourceSha256);assert.equal(checks.passed,true);assert.equal(presentation.pixels.passed,true);await immutable();
 const candidatePath='web-production/v1/candidates/79-bilibili-cn/'+job.articleId+'.r1.display.json';await write(abs(candidatePath),c);
 const evidence={schema:'coac248-182201-exact-inline-production/1',at:new Date().toISOString(),chapterId:job.chapterId,candidatePath,candidateSha256:sha(await bytes(candidatePath)),sourceSha256:job.sourceSha256,parentPath:job.parentPath,parentSha256:job.parentSha256,parentAuditPath:job.notesPath,parentAuditSha256:job.notesSha256,productionCall:record,productionProof:proof,presentation,checks,runtimeManifestSha256:release.runtimeManifestSha256,whitelist:job.plan.edits,diff:{path:'/body/blocks/'+parent.body.blocks.indexOf(old)+'/text',from:old.text,to:result.output.translations[0].text},carryIssue:notes.modelReview.issues.filter(i=>i.targetId===job.carryId),preservation:{allNonTargetBodyBytes:true,allCompleteFiguresBytes:true,unknownsUnchanged:true,captionAndSourceNotesUnchanged:true,orderUnchanged:true},newCalls:{maker:1,review:0,failed:0,void:0,retry:0},reservedIndependentReview:1,chapterAccepted:false,wholeChapterPassed:false};
 await write(join(run,'production-evidence.json'),evidence);await write(join(here,job.articleId+'-production.json'),evidence);
 console.log(JSON.stringify({article:job.articleId,candidatePath,candidateSha256:evidence.candidateSha256,callId,usage:record.usage,independentReviewReserved:1,chapterAccepted:false}));
}finally{if(acquired)await write(join(run,'slot-released.json'),slot('release','--slot',abs('parallel/slots/maker-A.json'),'--owner',owner));await write(join(run,'chapter-released.json'),slot('unclaim','--chapter',job.chapterId,'--owner',owner));}
