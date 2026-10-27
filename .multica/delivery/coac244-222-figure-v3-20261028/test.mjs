import * as real from 'node:fs/promises';
import {register} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,root='E:/AgentData/Coach/knowledge/processing',candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1775262.r2.display.json';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await real.readFile(p,'utf8'));
// Save and retain the actual CLI constructor's real fs imports before test overlay registration.
const {prepareTextbookCliRequest}=await import('./runtime/textbook-production-cli.mjs');
const ledgerBefore=sha(await real.readFile(join(root,'audit/calls.jsonl')));
register('./overlay-loader.mjs',import.meta.url);
const {overlay}=await import('./test-overlay.mjs');
const audit=await import('./runtime/textbook-audit-web.mjs'),helper=await import('./runtime/textbook-audit-222-figure.mjs');
const checks=[],ok=(name,fn)=>{fn();checks.push({name,passed:true});};
const plan=await audit.prepareBound222FigureAudit(root,candidatePath);
const work=await real.mkdtemp(join(here,'cli-request-'));
const request=await prepareTextbookCliRequest({...plan,work});
const candidate=await load(join(root,candidatePath)),r=candidate.provenance.revision,parent=await load(join(root,r.parentPath)),notes=await load(join(root,r.notesPath));
const source=await load(join(root,candidate.source.sourcePath));
ok('actual model/effort/2 image arguments',()=>{assert(helper.verifyTargetFigureExecution(request.requestExecution,plan));assert.equal(request.args.filter(a=>a==='-i').length,2);assert.equal(request.requestExecution.model,'gpt-6.1-terra');assert.equal(request.requestExecution.reasoningEffort,'max');});
ok('actual CLI stdin contains exact projection,context,point identity',()=>{assert(request.closedPrompt.includes(JSON.stringify(plan.projection)));assert.equal(plan.projection.source.blocks.length,1);assert.equal(plan.projection.candidate.figures.length,1);assert.equal(plan.projection.unchangedTeachingContext.source.length,3);assert.equal(plan.projection.priorIndependentPoint.callId,helper.exact222.point);assert.equal(plan.projection.priorIndependentPoint.result.tileCode,'1m');});
ok('schema exact block/figure/occurrence; no full-article flag',()=>{assert(!('completeArticleCompared' in plan.schema.properties));for(const [k,id]of[['blockChecks',helper.exact222.block],['figureChecks',helper.exact222.figure],['imageChecks',helper.exact222.occurrence]])assert.deepEqual(plan.schema.properties[k].items.properties.id.enum,[id]);});
const fixture={blockChecks:[{id:helper.exact222.block,verdict:'faithful',evidence:'OFFLINE_FIXTURE target'}],figureChecks:[{id:helper.exact222.figure,verdict:'faithful',evidence:'OFFLINE_FIXTURE figure'}],imageChecks:[{id:helper.exact222.occurrence,disposition:'represented',evidence:'OFFLINE_FIXTURE occurrence'}],domOrder:{faithful:true,evidence:'OFFLINE_FIXTURE order'},contextContinuity:{faithful:true,evidence:'OFFLINE_FIXTURE context'},semanticCompleteness:{complete:true,evidence:'OFFLINE_FIXTURE completeness'},issues:[],completeTargetScopeCompared:true,summary:'OFFLINE_FIXTURE; not a real model review'};
ok('exact target fixture validates',()=>assert(helper.validateTargetFigureReview(fixture).passed));
for(const name of ['extra block','extra figure','extra occurrence','missing occurrence','wrong target','missing context','missing evidence','uncertain','error issue','other-scope note','full-article claim','incomplete target']){
 const q=structuredClone(fixture);
 if(name==='extra block')q.blockChecks.push({...q.blockChecks[0]});
 if(name==='extra figure')q.figureChecks.push({...q.figureChecks[0]});
 if(name==='extra occurrence')q.imageChecks.push({...q.imageChecks[0]});
 if(name==='missing occurrence')q.imageChecks=[];
 if(name==='wrong target')q.figureChecks[0].id='another-figure';
 if(name==='missing context')delete q.contextContinuity;
 if(name==='missing evidence')q.blockChecks[0].evidence='';
 if(name==='uncertain')q.figureChecks[0].verdict='uncertain';
 if(name==='error issue')q.issues=[{severity:'error',targetId:helper.exact222.figure,sourceEvidence:'x',description:'x',suggestedRepair:'x'}];
 if(name==='other-scope note')q.issues=[{severity:'source-note',targetId:'another-figure',sourceEvidence:'x',description:'x',suggestedRepair:'x'}];
 if(name==='full-article claim')q.completeArticleCompared=true;
 if(name==='incomplete target')q.completeTargetScopeCompared=false;
 ok('reject '+name,()=>assert(!helper.validateTargetFigureReview(q).passed));
}
for(const name of ['body','non-target','target-caption','target-unknown','target-extra-tile','source','target-scope']){
 const q=structuredClone(candidate);
 if(name==='body')q.body.blocks.find(b=>b.type==='text').text+='x';
 if(name==='non-target')q.figures[0].transcription+='x';
 if(name==='target-caption')q.figures.find(f=>f.figureId===helper.exact222.figure).caption+='x';
 if(name==='target-unknown')q.figures.find(f=>f.figureId===helper.exact222.figure).unknowns.push('x');
 if(name==='target-extra-tile')q.figures.find(f=>f.figureId===helper.exact222.figure).transcription+=' 1m';
 if(name==='source')q.source.sourceSha256='0'.repeat(64);
 if(name==='target-scope')q.provenance.revision.figureIds.push(q.figures[0].figureId);
 ok('reject preservation '+name,()=>assert.throws(()=>helper.check222FigurePreservation(q,parent,notes)));
}
const merged=helper.mergeTargetFigureReview(notes.modelReview,fixture,source,candidate,audit.validateWebReview);
ok('merge keeps every non-target original check and does not mutate parent',()=>{assert(merged.checks.passed);for(const k of ['blockChecks','figureChecks','imageChecks'])for(const check of notes.modelReview[k])if(![helper.exact222.block,helper.exact222.figure,helper.exact222.occurrence].includes(check.id))assert.deepEqual(merged.review[k].find(c=>c.id===check.id),check);assert.equal(notes.modelReview.semanticCompleteness.complete,false);});
ok('merge cannot discard unrelated parent issue',()=>{const q=structuredClone(notes.modelReview);q.issues.push({severity:'uncertain',targetId:'another',sourceEvidence:'x',description:'x',suggestedRepair:'x'});assert(!helper.mergeTargetFigureReview(q,fixture,source,candidate,audit.validateWebReview).checks.passed);});
for(const name of ['sol fallback','high fallback','missing image','wrong image','wrong image argv']){
 const q=structuredClone(request.requestExecution);
 if(name==='sol fallback')q.model='gpt-6.1-sol';
 if(name==='high fallback')q.reasoningEffort='high';
 if(name==='missing image')q.images.pop();
 if(name==='wrong image')q.images[0].sha256='0'.repeat(64);
 if(name==='wrong image argv')q.args[q.args.indexOf('-i')+1]='elsewhere.png';
 ok('reject execution '+name,()=>assert(!helper.verifyTargetFigureExecution(q,plan)));
}
let captures=0;
async function reviewer(modelRequest){
 captures++;assert.equal(modelRequest.prompt,plan.prompt);assert.deepEqual(modelRequest.schema,plan.schema);assert.deepEqual(modelRequest.images,plan.images);assert.equal(modelRequest.model,'gpt-6.1-terra');assert.equal(modelRequest.reasoningEffort,'max');
 return {output:fixture,rawLastMessage:JSON.stringify(fixture),rawStdout:'OFFLINE_FIXTURE',exitCode:0,timedOut:false,outputOverflow:false,events:[{type:'turn.completed',usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0}}],requestExecution:request.requestExecution,requestPrompt:request.closedPrompt,requestPromptSha256:sha(request.closedPrompt)};
}
const result=await audit.auditWebCandidate({processingRoot:root,candidatePath,reviewer});
ok('actual audit entry dispatch scope captured once in memory overlay',()=>{assert.equal(captures,1);assert.equal(result.method,helper.targetFigureMethod);assert.equal(result.status,'passed');assert.equal(result.calls.length,1);assert.equal(result.inheritedCalls[0].callId,'f64f0d4f-8833-475e-96dd-a9c5f80e2ba9');});
const saved=new Map([...overlay.memory].map(([k,v])=>[k,Buffer.from(v)]));
const restore=()=>{overlay.clear();for(const [k,v]of saved)overlay.set(k,v);};
for(const name of ['merge rewrite','contract changed','raw image changed','ledger duplicate','schema widened','point raw changed','wrapped prompt changed']){
 restore();
 if(name==='merge rewrite'||name==='contract changed'){
  const q=JSON.parse(overlay.get(result.auditPath));if(name==='merge rewrite')q.effectiveModelReview.blockChecks[0].evidence='changed';else q.targetFigureContract.point.reading='2m';overlay.set(result.auditPath,JSON.stringify(q));
 }
 const rawPath=join(root,'audit/calls',result.calls[0].callId+'.json');
 if(name==='raw image changed'||name==='schema widened'||name==='wrapped prompt changed'){
  const q=JSON.parse(overlay.get(rawPath));if(name==='raw image changed')q.requestExecution.images[0].sha256='0'.repeat(64);else if(name==='schema widened')q.schema.properties.extra={type:'string'};else q.requestPrompt+='unapproved';overlay.set(rawPath,JSON.stringify(q));
 }
 if(name==='ledger duplicate')overlay.set(join(root,'audit/calls.jsonl'),overlay.get(join(root,'audit/calls.jsonl')).toString()+JSON.stringify(result.calls[0])+'\n');
 if(name==='point raw changed'){
  const p=join(root,'audit/point-adjudications/coac249-222-p217-20261028/image-222-sixth-tile.raw.json'),q=await load(p);q.output.tileCode='2m';overlay.set(p,JSON.stringify(q));
 }
 await assert.rejects(()=>audit.verifyAuditForWebCandidate(root,candidatePath));checks.push({name:'actual receipt verifier rejects '+name,passed:true});
}
restore();
await audit.verifyAuditForWebCandidate(root,candidatePath);checks.push({name:'actual verifier accepts unchanged in-memory fixture only',passed:true});
overlay.clear();
const baseLedger=await real.readFile(join(root,'audit/calls.jsonl'),'utf8');
overlay.set(join(root,'audit/calls.jsonl'),baseLedger+JSON.stringify(result.calls[0])+'\n');
await assert.rejects(()=>audit.auditWebCandidate({processingRoot:root,candidatePath,reviewer}),/already_recorded_review/);checks.push({name:'orphan ledger entry prevents another dispatch',passed:true});
overlay.clear();
const uncertain=structuredClone(fixture);uncertain.figureChecks[0].verdict='uncertain';
const held=await audit.auditWebCandidate({processingRoot:root,candidatePath,reviewer:async request=>({...await reviewer(request),output:uncertain,rawLastMessage:JSON.stringify(uncertain)})});
assert.equal(held.status,'needs-repair');assert.equal(held.modelReview.figureChecks[0].verdict,'uncertain');checks.push({name:'actual entry preserves uncertain and blocks passed',passed:true});
overlay.clear();
const failed=await audit.auditWebCandidate({processingRoot:root,candidatePath,reviewer:async request=>({...await reviewer(request),exitCode:1,events:[{type:'turn.failed'}],output:null,rawLastMessage:null})});
assert.equal(failed.status,'failed');assert.equal(failed.calls.length,1);checks.push({name:'actual entry records transport failure once without retry',passed:true});
overlay.clear();
const ledgerAfter=sha(await real.readFile(join(root,'audit/calls.jsonl')));
await real.writeFile(join(here,'actual-request.json'),JSON.stringify({schema:'offline-real-request-construction/1',paidInvocation:false,semanticPrompt:plan.prompt,projection:plan.projection,outputSchema:plan.schema,closedPrompt:request.closedPrompt,execution:request.requestExecution,proof:plan.proof},null,2)+'\n');
await real.writeFile(join(here,'test-results.json'),JSON.stringify({newModelCalls:0,syntheticAuditWrittenToSharedRoot:false,sharedLedgerUnchanged:ledgerBefore===ledgerAfter,ledgerBefore,ledgerAfter,offlineReviewerInterceptions:captures,checks},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,allPassed:true,actualEntryInterceptions:captures,newModelCalls:0,sharedLedgerWrites:0}));
