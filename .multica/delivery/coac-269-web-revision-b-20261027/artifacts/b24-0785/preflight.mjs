import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',rt=root+'/audit/runtimes/coac269-283-0785-v1-20261028',here=import.meta.dirname;
const m=await import(pathToFileURL(rt+'/b0785.mjs'));
const expected=m.sha(await readFile(rt+'/runtime-manifest.json'));const checks=[];
const ok=name=>checks.push({name,passed:true});
const inputs=await m.verifyInputs(expected);ok('full source/parent/donor/raw/checkpoint and accepted b1017 gates');
for(const b of (await m.load(m.contract.recoveryManifest.path))){const bytes=await readFile(root+'/integration/coac244-recovery-20261028/'+b.path);assert.equal(m.sha(bytes),b.sha256);assert.equal(bytes.length,b.bytes);}ok('all51 recovered manifest files');
const plan=await m.makerPlan(expected);const cli=await import(pathToFileURL(rt+'/textbook-production-cli.mjs'));
await mkdir(m.stage+'/request-preview',{recursive:true});const built=await cli.prepareTextbookCliRequest({...plan,work:m.stage+'/request-preview'});
assert.equal(built.requestExecution.model,'gpt-6.1-terra');assert.equal(built.requestExecution.reasoningEffort,'max');assert.equal(built.requestExecution.images.length,4);
await m.checkExecution({...built,requestPrompt:built.closedPrompt,requestPromptSha256:m.sha(built.closedPrompt)},plan);ok('actual closed request/schema/argv/terra-max/ordered4 images');
for(const row of inputs.packet.orderedSourceCandidatePairs)assert(built.closedPrompt.includes(JSON.stringify(row)));ok('full Q48 seven blocks plus nine definitions and tableContext in actual stdin');
for(const [name,mutate] of [
 ['wrong-source',p=>p.source.sha256='0'.repeat(64)],['wrong-parent',p=>p.current.sha256='0'.repeat(64)],['wrong-donor',p=>p.donor.sha256='0'.repeat(64)],
 ['missing-context',p=>p.orderedSourceCandidatePairs.pop()],['context-order',p=>p.orderedSourceCandidatePairs.reverse()],['missing-table-context',p=>delete p.orderedSourceCandidatePairs[0].candidate.tableContext],
 ['remove-unknown-attestation',p=>p.donorFigureIndependentCheck.preservedUnknowns.acknowledged=false],['change-donor-call',p=>p.donorFigure.provenance.callId='other'],
 ['missing-original-image',p=>p.originalImagesAndDerivedViews.shift()],['wrong-image-order',p=>p.originalImagesAndDerivedViews.reverse()],['wrong-seat-goal',p=>p.expectedFigureNotProduced.transcription=p.donorFigure.transcription]]){
 const p=structuredClone(inputs.packet);mutate(p);assert.throws(()=>m.validatePacket(p));ok(name+' refused');
}
const good={translations:[],figures:[m.fields()]};m.validateOutput(good);ok('only exact approved figure output accepted');
for(const [name,mutate] of [['extra-text',o=>o.translations.push({sourceBlockId:'other',text:'bad'})],['wrong-figure',o=>o.figures[0].sourceBlockId='other'],['old-seat',o=>o.figures[0].transcription=inputs.packet.donorFigure.transcription],['punctuation',o=>o.figures[0].transcription+='。'],['guess-unknown',o=>o.figures[0].unknowns=[]],['caption',o=>o.figures[0].caption+='!'],['source-notes',o=>o.figures[0].sourceNotes=[]],['extra-figure',o=>o.figures.push(o.figures[0])]]){const x=structuredClone(good);mutate(x);assert.throws(()=>m.validateOutput(x));ok(name+' refused');}
const candidate=structuredClone(inputs.parent),i=candidate.figures.findIndex(f=>f.figureId===m.contract.targetId);candidate.figures[i]={...structuredClone(m.contract.expected),provenance:{method:'model-transcription',callId:'test-only-no-model-call',outputSourceBlockId:m.fields().sourceBlockId}};
m.validateCandidate(candidate,inputs.parent,'test-only-no-model-call');ok('in-memory assembly only reviewed donor fields and exact seat goal');
for(const [name,mutate] of [['body-text',c=>c.body.blocks[0].text+='!'],['b1017-pass',c=>c.body.blocks[1016].text+='!'],['b1181-pass',c=>c.body.blocks[1180].text+='!'],['non-target-figure',c=>c.figures[0].caption+='!'],['body-order',c=>c.body.blocks.reverse()],['target-unknowns',c=>c.figures[i].unknowns=[]],['target-source-binding',c=>c.figures[i].sourceAssetBindings=[]],['foreign-table',c=>c.body.blocks.find(b=>b.tableContext).tableContext.column=999],['source',c=>c.source.sourceSha256='0'.repeat(64)]]){const x=structuredClone(candidate);mutate(x);assert.throws(()=>m.validateCandidate(x,inputs.parent,'test-only-no-model-call'));ok(name+' refused');}
await assert.rejects(()=>m.assertSnapshot('0'.repeat(64)));ok('wrong frozen manifest refused');
const {assertPortableProductionSchema}=await import(pathToFileURL(rt+'/production-schema.mjs'));assertPortableProductionSchema(plan.schema);ok('portable real production schema');
for(const mutate of [x=>x.requestExecution.model='gpt-6.1-sol',x=>x.requestExecution.reasoningEffort='high',x=>x.requestExecution.images.reverse()]){const x={...structuredClone(built),requestPrompt:built.closedPrompt,requestPromptSha256:m.sha(built.closedPrompt)};mutate(x);await assert.rejects(()=>m.checkExecution(x,plan));ok('wrong actual model/effort/images refused');}
await writeFile(here+'/actual-request.json',JSON.stringify({plan,actual:built,modelCalls:0},null,2)+'\n');
const summary={passed:true,checks,count:checks.length,modelCalls:0,candidateWrites:0,rawWrites:0,runtime:await m.bind(rt+'/runtime-manifest.json'),parent:m.contract.parent,donor:m.contract.donor,prior1017Audit:inputs.parentAuditSha256,priorDonorAudit:inputs.donorAuditSha256,ordinaryParentError:inputs.ordinaryParentError,maximumProductionCalls:1,remainingExternalFirstAuditMaximum:1,retry:0};
await writeFile(here+'/preflight.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,modelCalls:0,images:4,runtime:summary.runtime.sha256}));
