// Offline real-file/request tests. No invoke import, subprocess model, raw/ledger/candidate writes.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {verifyWebRevisionContent,verifyWebRevisionInheritance,verifyWebProductionCall,verifyWebPresentations,verifyWebVisualInputs} from './runtime/textbook-audit-web.mjs';
import {verifyWebRevisionContent as oldGate} from 'file:///E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac244-vision-production-schema-v2-20261028/textbook-audit-web.mjs';
import {build256ImpactRequest,validate256ImpactReview,verify256ReviewExecution,verify256ReviewRequestExecution,prepare256ImpactReview} from './runtime/textbook-256-impact.mjs';
import {binding,exact256State} from './runtime/textbook-256-exact-admission.mjs';
import {prepareTextbookCliRequest} from './runtime/textbook-production-cli.mjs';
import {webProductionSchema,validateWebProductionOutput} from './runtime/production-schema.mjs';
const P='E:/AgentData/Coach/knowledge/processing',O=fileURLToPath(new URL('./',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p)),out=async(n,x)=>writeFile(join(O,n),JSON.stringify(x,null,2)+'\n');
const parent=await load(join(O,'parent.json')),notes=await load(join(O,'audit.json')),source=await load(join(O,'source.json'));
assert.equal(sha(await readFile(join(O,'parent.json'))),binding.parent);assert.equal(sha(await readFile(join(O,'audit.json'))),binding.audit);
const before=JSON.stringify({parent,notes,source});
const c=structuredClone(parent);c.provenance.revision={parentPath:'web-production/v1/candidates/79-bilibili-cn/cv1785770.r1.display.json',parentSha256:binding.parent,notesPath:`audit/web/articles/79-bilibili-cn/cv1785770.${binding.parent}.json`,notesSha256:binding.audit,figureIds:[binding.target]};
const f=c.figures.find(f=>f.figureId===binding.target),old=parent.figures.find(f=>f.figureId===binding.target);
f.transcription=f.transcription.replace('7s [索子，数字不明] 9s','7s 8s 9s');f.unknowns=f.unknowns.slice(1);
assert.throws(()=>oldGate(c,parent,notes),/web_revision_notes_scope/);
assert.equal(verifyWebRevisionContent(c,parent,notes),true);
const checks=[{name:'old gate reproduces web_revision_notes_scope; new exact gate admits production only',passed:true}];
const ordinaryParent={source:{articleId:'ordinary'},body:{mode:'verbatim',blocks:[{type:'figure',sourceBlockIds:['b1'],figureId:'f1'}]},figures:[{figureId:'f1',sourceBlockIds:['b1'],sourceOccurrenceIds:['o1'],sourceAssetBindings:[],provenance:{method:'model-transcription'},transcription:'1m'}]};
const ordinary=structuredClone(ordinaryParent);ordinary.provenance={revision:{figureIds:['f1']}};ordinary.figures[0].transcription='2m';
const ordinaryNotes={status:'needs-repair',modelReview:{completeArticleCompared:true,domOrder:{faithful:true},issues:[{severity:'error',targetId:'f1'}],blockChecks:[{id:'b1',verdict:'needs-repair'}],figureChecks:[{id:'f1',verdict:'needs-repair'}],imageChecks:[{disposition:'represented'}]}};
assert(oldGate(ordinary,ordinaryParent,ordinaryNotes));assert(verifyWebRevisionContent(ordinary,ordinaryParent,ordinaryNotes));
ordinaryNotes.modelReview.issues.push({severity:'uncertain',targetId:'f1'});assert.throws(()=>verifyWebRevisionContent(ordinary,ordinaryParent,ordinaryNotes),/notes_scope/);checks.push({name:'ordinary error-only gate unchanged; ordinary mixed uncertain still rejected',passed:true});
const reject=(name,fn)=>{assert.throws(fn);checks.push({name,rejected:true});};
for(const[name,change]of [
 ['wrong-source',x=>x.source.sourceSha256='0'.repeat(64)],['wrong-parent',x=>x.provenance.revision.parentSha256='0'.repeat(64)],
 ['wrong-audit',x=>x.provenance.revision.notesSha256='0'.repeat(64)],['other-article',x=>x.source.articleId='other'],
 ['extra-figure',x=>x.provenance.revision.figureIds.push(c.figures[0].figureId)],['text-target',x=>x.provenance.revision.textBlockIds=['other']],
 ['body-text',x=>x.body.blocks.find(b=>b.type==='text').text+='changed'],['body-order',x=>x.body.blocks.reverse()],
 ['other-tile',x=>x.figures.find(f=>f.figureId===binding.target).transcription+='1m'],
 ['extra-unknown-removal',x=>x.figures.find(f=>f.figureId===binding.target).unknowns=[]],
 ['unknown-word-change',x=>x.figures.find(f=>f.figureId===binding.target).unknowns[0]+='changed'],
 ['caption',x=>x.figures.find(f=>f.figureId===binding.target).caption+='changed'],
 ['source-note',x=>x.figures.find(f=>f.figureId===binding.target).sourceNotes=[]],
 ['other-figure',x=>x.figures.find(f=>f.figureId!==binding.target).transcription+='changed'],
 ['presentation',x=>x.figures.find(f=>f.figureId===binding.target).presentationAsset.sha256='0'.repeat(64)]
]){const x=structuredClone(c);change(x);reject(name,()=>verifyWebRevisionContent(x,parent,notes));}
const badNotes=structuredClone(notes);badNotes.modelReview.issues.find(i=>i.severity==='uncertain').severity='error';reject('relabelled-uncertain',()=>verifyWebRevisionContent(c,parent,badNotes));
const extraNotes=structuredClone(notes);extraNotes.modelReview.issues.push({severity:'uncertain',targetId:'other'});reject('new-parent-issue',()=>verifyWebRevisionContent(c,parent,extraNotes));
const inheritance=await verifyWebRevisionInheritance(P,c);assert.equal(inheritance.parentCall.sha256,binding.raw);
const parentProduction=await verifyWebProductionCall(P,parent),presentation=await verifyWebPresentations(P,parent);
assert(presentation.pixels.passed);checks.push({name:'actual complete parent source/auditor/raw/production/pixel/inheritance gates passed',passed:true});
const prior=parent.provenance.attempts[0],pr=await load(join(P,parent.provenance.artifactRoot,prior.rawArtifactPath));
const visual=await verifyWebVisualInputs(P,{visualInputs:pr.visualInputs},pr,source,[old]);
const views=visual.inputs.map(v=>({...v,path:join(P,v.path)}));
const plan=build256ImpactRequest({candidate:c,parent,notes,source,visualInputs:views});
assert.equal(plan.projection.orderedSourceCandidateContext.length,42);
for(const[row,i]of plan.projection.orderedSourceCandidateContext.map((r,i)=>[r,i])){
 assert.deepEqual(row.source,source.blocks[i]);assert.deepEqual(row.candidate,c.body.blocks[i]);assert(plan.prompt.includes(JSON.stringify(row)));
}
assert.deepEqual(plan.projection.retainedUnknowns,old.unknowns.slice(1));assert.deepEqual(plan.projection.originalIndependentIssues,notes.modelReview.issues);
assert.equal(plan.projection.targetFigureIds.length,1);assert.equal(plan.images.length,2);
const work=await mkdtemp(join(O,'request-review-')),actual=await prepareTextbookCliRequest({...plan,work});
assert.equal(actual.requestExecution.model,'gpt-6.1-terra');assert.equal(actual.requestExecution.reasoningEffort,'max');
assert.equal(actual.args.filter(a=>a==='-i').length,2);assert(actual.closedPrompt.endsWith(plan.prompt));
await out('review-request-preflight.json',{syntheticRepairedInputOnly:true,notProducedCandidate:true,notReviewEligible:true,plan,actual,invoked:false});
checks.push({name:'real shared CLI builder: exact target + all42 ordered pairs/tableContext + original issues/two unknowns +2 original/nearest images +terra/max',passed:true});
for(const[name,change]of [['missing-context',x=>x.body.blocks.pop()],['wrong-order',x=>x.body.blocks.reverse()],['unknown-guessed',x=>x.figures.find(f=>f.figureId===binding.target).unknowns=[]]]){
 const x=structuredClone(c);change(x);reject('review-'+name,()=>build256ImpactRequest({candidate:x,parent,notes,source,visualInputs:views}));
}
const fixture={tileRepair:{verdict:'faithful',sourceEvidence:'UNIT TEST ONLY'},unknownImpact:f.unknowns.map(unknownText=>({unknownText,displayFaithful:true,argumentFaithfulWithUnknown:true,requiresExactTileForAuthorArgument:false,evidence:'UNIT TEST ONLY',requiredDisplayLimitations:[]})),orderedContextFaithful:true,completeTargetScopeCompared:true,conclusion:'limited-unknown-acceptable',issues:[],summary:'UNIT TEST ONLY; no real model output'};
assert(validate256ImpactReview(fixture,f.unknowns).passed);
for(const[name,change]of [['missing-unknown',x=>x.unknownImpact.pop()],['material-unknown',x=>x.unknownImpact[0].requiresExactTileForAuthorArgument=true],['not-explicitly-allowed',x=>x.unknownImpact[0].argumentFaithfulWithUnknown=false],['8s-uncertain',x=>x.tileRepair.verdict='uncertain'],['error',x=>x.issues.push({severity:'error'})],['wrong-context',x=>x.orderedContextFaithful=false]]){
 const x=structuredClone(fixture);change(x);assert.equal(validate256ImpactReview(x,f.unknowns).passed,false);checks.push({name:'review-result-'+name,rejected:true});
}
const result={requestExecution:actual.requestExecution,requestPrompt:actual.closedPrompt,requestPromptSha256:sha(actual.closedPrompt),output:fixture};
assert(verify256ReviewRequestExecution(result,plan));reject('no-real-model-result',()=>verify256ReviewExecution(result,plan));
const wrongPrompt=structuredClone(result);wrongPrompt.requestPrompt+='other';wrongPrompt.requestPromptSha256=sha(wrongPrompt.requestPrompt);reject('real-result-wrong-prompt',()=>verify256ReviewRequestExecution(wrongPrompt,plan));
const wrongImages=structuredClone(result);wrongImages.requestExecution.images.reverse();reject('real-result-image-order',()=>verify256ReviewRequestExecution(wrongImages,plan));
// The candidate-shaped fixture cannot become a real review: actual maker provenance still names old output.
const tmp=join(O,'NOT-A-PRODUCED-CANDIDATE.json');await writeFile(tmp,JSON.stringify(c));
await assert.rejects(()=>prepare256ImpactReview(P,tmp));checks.push({name:'synthetic candidate rejected by actual maker/raw eligibility gate',rejected:true});
const {unlink}=await import('node:fs/promises');await unlink(tmp);
const fields={sourceBlockId:old.sourceBlockIds[0],kind:old.kind,transcription:old.transcription,unknowns:f.unknowns,caption:old.caption,sourceNotes:old.sourceNotes};
const schema=webProductionSchema({textIds:[],figureIds:old.sourceBlockIds,fixedFigure:fields});
schema.properties.figures.items.properties.transcription.enum=[f.transcription];
const pre=await load(join(O,'preflight.json'));
const originalPayload=JSON.parse(pre.prompt.split('\n\n').at(-1));
const payload=Object.fromEntries(Object.entries(originalPayload).flatMap(([k,v])=>k==='parentFigure'?[[k,v],['expectedTranscription',f.transcription]]:[[k,v]]));
const makerPrompt=pre.prompt.split('\n\n').slice(0,-1).join('\n\n')+'\n\n'+JSON.stringify(payload);
const maker={prompt:makerPrompt,schema,model:'gpt-6.1-terra',reasoningEffort:'max',images:views.map(v=>v.path)};
const ma=await prepareTextbookCliRequest({...maker,work:await mkdtemp(join(O,'request-maker-'))});
assert(ma.closedPrompt.includes(JSON.stringify(payload)));assert.equal(payload.expectedTranscription,pre.fieldScope.to);assert(ma.closedPrompt.includes(f.unknowns[0])&&ma.closedPrompt.includes(f.unknowns[1]));
assert.equal(ma.requestExecution.model,'gpt-6.1-terra');assert.equal(ma.requestExecution.reasoningEffort,'max');
const output={translations:[],figures:[{...fields,transcription:f.transcription}]};
validateWebProductionOutput(output,{textIds:[],figureIds:old.sourceBlockIds,fixedFigure:fields,expectedTranscription:f.transcription});
for(const[name,change]of [['extra-text',x=>x.translations.push({sourceBlockId:'other',text:'no'})],['caption',x=>x.figures[0].caption+='changed'],['unknown',x=>x.figures[0].unknowns=[]],['extra-transcription',x=>x.figures[0].transcription+='changed']]){
 const x=structuredClone(output);change(x);reject('maker-'+name,()=>validateWebProductionOutput(x,{textIds:[],figureIds:old.sourceBlockIds,fixedFigure:fields,expectedTranscription:f.transcription}));
}
await out('maker-request-preflight.json',{plan:maker,actual:ma,invoked:false});
assert.equal(before,JSON.stringify({parent,notes,source}));
await out('regression-results.json',{checks,count:checks.length,parentProduction,presentation,inheritance,oldNotesPreserved:true,newModelCalls:0,newRawWrites:0,newLedgerWrites:0,newCandidates:0,newPasses:0});
console.log(JSON.stringify({checks:checks.length,passed:true,newModelCalls:0}));
