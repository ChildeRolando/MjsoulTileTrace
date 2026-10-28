import {readFile,writeFile,mkdir,readdir,appendFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {join,relative,isAbsolute} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=fileURLToPath(new URL('./',import.meta.url)),root='E:/AgentData/Coach/knowledge/processing';
const release=JSON.parse(await readFile(join(here,'release.json'))),rt=release.runtimePath;
const job=release.jobs.find(j=>j.key===process.argv[2]);assert(job,'Select exact article');
const owner='COAC-248 Mika',auth=job.authorizationCommentId,run=join(root,'web-production/v1/runs/coac248-193234-text-'+job.articleId+'-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex'),abs=p=>isAbsolute(p)?p:join(root,p),rel=p=>relative(root,p).replaceAll('\\','/');
const bytes=p=>readFile(abs(p)),json=async p=>JSON.parse(await bytes(p));
const write=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
const slot=(...args)=>JSON.parse(execFileSync('E:/IDE/NodeJS/node.exe',[join(root,'parallel/slots.mjs'),...args],{encoding:'utf8',windowsHide:true}));
const audit=await import(pathToFileURL(join(rt,'textbook-audit-web.mjs')));
const {assertInlinePlan,inlineTextAllowed}=await import(pathToFileURL(join(rt,'inline-japanese-revision.mjs')));
const {invokeTextbookCodex,textbookClosedPrompt}=await import(pathToFileURL(join(rt,'textbook-production-cli.mjs')));
const {webProductionSchema,validateWebProductionOutput}=await import(pathToFileURL(join(rt,'production-schema.mjs')));
const {allowed193Text}=await import(pathToFileURL(join(rt,'text193-recovery.mjs')));
const protectedFiles=new Map();
async function bind(p,h){const b=await bytes(p);assert.equal(sha(b),h,'binding:'+p);protectedFiles.set(p,h);return b;}
async function immutable(){for(const[p,h]of protectedFiles)assert.equal(sha(await bytes(p)),h,'changed:'+p);}
async function gates(){for(const p of ['STOP','web-production/v1/STOP','model-admission-stop.json']){try{await access(abs(p));throw Error('STOP:'+p);}catch(e){if(e.code!=='ENOENT')throw e;}}}
await bind(join(rt,'runtime-manifest.json'),release.runtimeManifestSha256);
const manifest=await json(join(rt,'runtime-manifest.json'));for(const f of manifest.files)await bind(join(rt,f.name),f.sha256);
const parent=JSON.parse(await bind(job.parentPath,job.parentSha256)),notes=JSON.parse(await bind(job.notesPath,job.notesSha256)),source=JSON.parse(await bind(job.sourcePath,job.sourceSha256));
if(job.key==='234'){await bind(job.planPath,job.planSha256);assertInlinePlan(job.plan,parent,notes,source,job.plan.bindings);}else{await bind(job.reviewRawPath,job.reviewRawSha256);await bind(job.priorReviewPlanPath,job.priorReviewPlanSha256);}
for(const f of release.externalDependencies)await bind(f.path,f.sha256);
if(job.key==='234'){const rc=notes.calls[0];await bind('audit/calls/'+rc.callId+'.json',sha(await bytes('audit/calls/'+rc.callId+'.json')));}
for(const a of parent.provenance.attempts)await bind(join(parent.provenance.artifactRoot,a.rawArtifactPath),a.rawArtifactSha256);
const parentAuditModule=job.key==='193'?await import(pathToFileURL(join(root,'audit/runtimes/coac248-193213-mixed-v1-20261028/textbook-audit-web.mjs'))):audit;
const parentProof=await parentAuditModule.verifyWebProductionCall(root,parent),parentPresentation=await parentAuditModule.verifyWebPresentations(root,parent);
const revision={parentPath:job.parentPath,parentSha256:job.parentSha256,notesPath:job.notesPath,notesSha256:job.notesSha256,textBlockIds:[job.targetId],figureIds:[],...(job.key==='234'?{inlineJapanese:{path:job.planPath,sha256:job.planSha256,plan:job.plan}}:{textRecovery193:{schema:'coac248-exact193-text-recovery/1',authorizationCommentId:auth}})};
function exactContent(c){for(const k of ['parentPath','parentSha256','notesPath','notesSha256'])assert.equal(c.provenance.revision[k],job[k]);assert.equal(c.source.sourceSha256,job.sourceSha256);return audit.verifyWebRevisionContent(c,parent,notes);}
const probe=structuredClone(parent);probe.provenance.revision=revision;audit.verifyWebRevisionContent(probe,parent,notes);
const inherit=await audit.verifyWebRevisionInheritance(root,probe);if(job.key==='193')assert.equal(inherit.chapterAccepted,false);
const old=parent.body.blocks.find(b=>b.sourceBlockIds[0]===job.targetId),quote=job.plan?.edits[0].quotedText;
const schema=webProductionSchema({textIds:[job.targetId],figureIds:[]});
const payload={chapterId:job.chapterId,sourceSha256:job.sourceSha256,parentSha256:job.parentSha256,orderedSourceBlocks:source.blocks,orderedCandidateBlocks:parent.body.blocks,figures:parent.figures,targets:{textIds:[job.targetId],figureIds:[]},editPlan:job.plan??{clausePrefix:job.textPrefix,clauseSuffix:job.textSuffix},actualPriorReview:notes.modelReview??notes,authorizationCommentId:auth};
const prompt=[
 job.key==='193'?'仅修正日文193的b0081一个例外子句。原文「入り目でなければ」以及完整前后论证在有序配对中。只保留这一命名例外，不为入り目制造等价定义，不增添宣言牌与新摸牌是否同种、是否补成面子等原文不支持的条件。原有两个条件已由真实独审退回，必须修正；不要把独审其它建议混成新条件。子句须保留原词「入り目」，以简明中文表达排除该情形的条件；本次不解释术语机制。严格保持指定prefix与suffix及所有其它字符。':'仅为234/b0003中ゴットー、ワンツー、ワンスリー三词各紧接增加（中文释义）；原日文保留。原支付数值、条件、中文说明、NBSP、标点和其它字符全部保持。',
 'Return exactly one complete target text under translations, figures:[]. No external tools, resources, images or extra contributions. Arrays must contain exactly the authorized target once. Preserve all author conditions, numbers, modality, inline tile arguments and order. Do not touch any figure, unknown, caption or sourceNote; all are inherited. This is pure text, not image re-identification.',
 JSON.stringify({...payload,orderedPairs:source.blocks.map((s,i)=>({position:i,source:s,candidate:parent.body.blocks[i],figure:parent.body.blocks[i].type==='figure'?parent.figures.find(f=>f.figureId===parent.body.blocks[i].figureId):null}))})
].join('\n\n');
function validate(output){validateWebProductionOutput(output,{textIds:[job.targetId],figureIds:[]});const t=output.translations[0].text;assert(t!==old.text,'unchanged');assert(job.key==='193'?allowed193Text(t):inlineTextAllowed(job.plan,job.targetId,old.text,t),'outside_exact_whitelist');}
let sample=old.text;if(job.key==='193')sample=job.textPrefix+'若排除入り目的情形'+job.textSuffix;else for(const e of job.plan.edits)sample=sample.replace(e.quotedText,e.quotedText+'（中文释义）');
const valid={translations:[{sourceBlockId:job.targetId,text:sample}],figures:[]};validate(valid);
const negatives=[];
for(const[n,mut]of [['missing',x=>x.translations=[]],['duplicate',x=>x.translations.push(x.translations[0])],['empty',x=>x.translations[0].text=''],['wrong-target',x=>x.translations[0].sourceBlockId+='x'],['extra-figure',x=>x.figures.push({})],['unchanged',x=>x.translations[0].text=old.text],['outside-clause',x=>x.translations[0].text+='。'],['extra-key',x=>x.other=true]]){const x=structuredClone(valid);mut(x);assert.throws(()=>validate(x));negatives.push({name:n,rejected:true});}
for(const[n,mut]of [['wrong-parent-sha',x=>x.provenance.revision.parentSha256='0'.repeat(64)],['wrong-source-sha',x=>x.source.sourceSha256='0'.repeat(64)],['wrong-target-path',x=>x.provenance.revision.textBlockIds=['other']],['non-target-text',x=>x.body.blocks.find(b=>b.type==='text'&&b.sourceBlockIds[0]!==job.targetId).text+='。'],['caption',x=>x.figures[0].caption+='。'],['unknown-mutation',x=>x.figures[0].unknowns=['invented']],['order',x=>x.body.blocks.reverse()]]){const x=structuredClone(probe);mut(x);assert.throws(()=>exactContent(x),n);negatives.push({name:n,rejected:true});}
if(job.key==='193'){for(const t of [job.textBefore,job.textPrefix+'若新摸牌未补成面子'+job.textSuffix])assert.equal(allowed193Text(t),false);negatives.push({name:'unsupported-definition',rejected:true});}
async function joint(){
 const pointer='integration/accepted-preview-current.json',register='integration/coac250-unified-chapter-register-20261027b.json';
 const p=await json(pointer),g=await json(register),row=g.rows.find(r=>r.chapterId===job.chapterId);assert(row&&!row.covered,'already covered');
 assert.equal(row.approvedWebCorrespondence.articleId,job.articleId);assert.equal(row.existingCandidate.sha256,job.baseParentSha256);assert.equal(row.existingCandidate.sourceBoundCurrent,true);
 assert.equal((p.selectedWeb??[]).filter(x=>JSON.stringify(x).includes(job.articleId)).length,0,'already selected');
 assert.equal((p.selectedPdf?.stages??[]).filter(x=>x.receipt?.chapterIds?.includes(job.chapterId)).length,0,'already selected PDF');
 const passed=[];for(const f of await readdir(abs('audit/web/articles/'+job.sourceId+''))){if(!f.startsWith(job.articleId+'.')||!f.endsWith('.json'))continue;const a=await json('audit/web/articles/'+job.sourceId+'/'+f);if(a.status?.startsWith('passed')&&a.source?.sourceSha256===job.sourceSha256&&sha(await bytes(a.production.path))===a.production.sha256)passed.push(f);}assert.equal(passed.length,0,'reuse passed instead');
 const candidates=(await readdir(abs('web-production/v1/candidates/'+job.sourceId+''))).filter(f=>f.startsWith(job.articleId+'.')).sort();assert.deepEqual(candidates,job.priorCandidateNames,'new/inflight candidate');
 const calls=(await readFile(abs('web-production/v1/calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(c=>c.articleId===job.articleId&&c.sourceId===job.sourceId);assert.deepEqual(calls.map(c=>c.callId),job.priorCallIds,'new/inflight call');
 return {at:new Date().toISOString(),previewSha256:sha(await bytes(pointer)),registerSha256:sha(await bytes(register)),registerRow:row,passed,candidates,callHistory:job.history};
}
await audit.assertWebReuseNotExcluded(root,job.parentPath,job.parentSha256);
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
 const candidatePath='web-production/v1/candidates/'+job.sourceId+'/'+job.articleId+'.'+job.variant+'.display.json';await write(abs(candidatePath),c);
 const evidence={schema:'coac248-193234-text-exact-inline-production/1',at:new Date().toISOString(),chapterId:job.chapterId,candidatePath,candidateSha256:sha(await bytes(candidatePath)),sourceSha256:job.sourceSha256,parentPath:job.parentPath,parentSha256:job.parentSha256,parentAuditPath:job.notesPath,parentAuditSha256:job.notesSha256,productionCall:record,productionProof:proof,presentation,checks,runtimeManifestSha256:release.runtimeManifestSha256,whitelist:job.plan?.edits??[{path:'/body/blocks/80/text',prefix:job.textPrefix,suffix:job.textSuffix,operation:'replace-only-named-exception-clause'}],diff:{path:'/body/blocks/'+parent.body.blocks.indexOf(old)+'/text',from:old.text,to:result.output.translations[0].text},carryIssue:job.key==='193'?notes.modelReview:notes.modelReview.issues.filter(i=>i.severity==='source-note'),preservation:{allNonTargetBodyBytes:true,allCompleteFiguresBytes:true,unknownsUnchanged:true,captionAndSourceNotesUnchanged:true,orderUnchanged:true},newCalls:{maker:1,review:0,failed:0,void:0,retry:0},reservedIndependentReview:1,chapterAccepted:false,wholeChapterPassed:false};
 await write(join(run,'production-evidence.json'),evidence);await write(join(here,job.articleId+'-production.json'),evidence);
 console.log(JSON.stringify({article:job.articleId,candidatePath,candidateSha256:evidence.candidateSha256,callId,usage:record.usage,independentReviewReserved:1,chapterAccepted:false}));
}finally{if(acquired)await write(join(run,'slot-released.json'),slot('release','--slot',abs('parallel/slots/maker-A.json'),'--owner',owner));await write(join(run,'chapter-released.json'),slot('unclaim','--chapter',job.chapterId,'--owner',owner));}
