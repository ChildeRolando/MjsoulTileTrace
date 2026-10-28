// Replay frozen, read-only verification. Never invoke a producer, reviewer, or integration writer.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname;
const load=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const hash=o=>sha(JSON.stringify(o)),same=(a,b)=>assert.deepEqual(a,b);
const bind=async path=>({path,sha256:sha(await readFile(path))});
const runtimeSHA='814df700d298188dea14d20fd84ac818d1ded9a706e370bc7a1714141ad6a7a9';
const pins={
 '109':{receipt:'67421d448b13f720947ca5472d7a0dfba1ee95e2f710f79ec1d5e86703baa986',raw:'bd0dbed07728d882609a06cf5e39c634c230f8153a5cf8cfe395ccfea0b80bc8',inheritance:'7cd0aff5f8ea7e8f0cd504f90a88072790c7e401e29cfab2b9a50ba42a817db8',proposal:'1e1f10128fb2f5b84b73cf3dcfd454599108774df4bfc7972f83f92908a9e6ef',candidate:'3cfe3a27bd799782d6ac8e626fcf97d26e1724ce544b6ccf26bcd740bd259dcb',call:'4fe3048c-dbf1-4b52-a4f2-80ab94310477',images:3,blocks:17,otherFigures:5,limits:6},
 '167':{receipt:'e291ebb02ed244689be9a7060659d4214d267189eb62e868c6747b7db9b027fe',raw:'bcdb12b7ad333e879cf74962eed180b09ea6740025090063aa3ecb3d25e4d6cb',inheritance:'ab99cd42314210150283d239c8a6759465f56453e836c8eb1f99eace63ff77ce',proposal:'89e7aeb927602908776114684f2b01bd55016483ec31ebeb37c7c31c2220810f',candidate:'5bfa90e3e15deb0c3f868ee1811fe50cdba75357f2805b3c37ed5f1d86538a58',call:'edf73a16-7c1c-44e2-9d22-52d2f3c0e267',images:1,blocks:6,otherFigures:0,limits:3}
};
const runtime=root+'/audit/runtimes/coac269-109167-exact-v1-20261028';
assert.equal(sha(await readFile(runtime+'/runtime-manifest.json')),runtimeSHA);
const frozen=await import(pathToFileURL(runtime+'/pair.mjs'));
const previewPath=root+'/integration/accepted-preview-current.json',registerPath=root+'/integration/coac250-unified-chapter-register-20261027b.json';
const previewBytes=await readFile(previewPath),registerBytes=await readFile(registerPath);
const preview=JSON.parse(previewBytes),register=JSON.parse(registerBytes),owners=await load(here+'/owner-state.json');
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse);
const rows=[],copies=[];
for(const key of ['109','167']){
 const pin=pins[key],paths={receipt:root+'/integration/coac249-'+key+'-target-impact-reviewed-20261028.json',raw:root+'/audit/calls/'+pin.call+'.json',inheritance:root+'/integration/coac249-'+key+'-scope-inheritance-20261028.json',proposal:root+'/integration/coac249-'+key+'-display-requirements-20261028.json'};
 const refs={};for(const [name,path] of Object.entries(paths)){refs[name]=await bind(path);assert.equal(refs[name].sha256,pin[name]);}
 const receipt=await load(paths.receipt),raw=await load(paths.raw),inheritance=await load(paths.inheritance),proposal=await load(paths.proposal);
 assert.equal(receipt.candidate.sha256,pin.candidate);assert.equal(sha(await readFile(receipt.candidate.path)),pin.candidate);
 refs.candidate=receipt.candidate;refs.runtime=receipt.runtime;
 assert.equal(receipt.runtime.sha256,runtimeSHA);
 for(const name of ['source','parent','parentAudit','handoff','plan']){refs[name]=receipt[name];assert.equal(sha(await readFile(refs[name].path)),refs[name].sha256);}
 const production=await frozen.verifyProduction(key,receipt.candidate.path,runtimeSHA);same(production,receipt.productionProof);
 const plan=await load(receipt.plan.path);same(plan,await frozen.prepareReview(key,receipt.candidate.path,runtimeSHA));
 const execution=await frozen.verifyReviewExecution(key,raw,plan,runtimeSHA);same(execution,receipt.verification);assert.equal(receipt.verificationError,null);
 same(raw.output,JSON.parse(raw.rawLastMessage));same(raw.output,receipt.modelReview);same(raw.schema,plan.schema);
 assert(raw.success&&raw.exitCode===0&&!raw.timedOut);assert(raw.events.some(e=>e.type==='thread.started'));assert(raw.events.some(e=>e.type==='turn.completed'));
 same(raw.usage,receipt.call.usage);same(raw.requestExecution,receipt.call.requestExecution);same(raw.durationMs,receipt.call.durationMs);same(raw.callId,pin.call);
 assert.equal(receipt.call.model,'gpt-6.1-terra');assert.equal(receipt.call.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,pin.images);
 const calls=ledger.filter(c=>c.binding?.productionSha256===pin.candidate);same(calls,[receipt.call]);
 const historicalObservationsUnavailable=[];
 for(const ref of inheritance.refs){
  try{assert.equal(sha(await readFile(ref.path)),ref.sha256);}
  catch(e){
   // Private pre/post preview/register snapshots were not retained in249's delivered tree.
   // They are historical dedup observations, never substitutes for source/parent/raw inputs.
   if(e.code!=='ENOENT'||!ref.observedPath||!/[\\/]admission-[01]-(preview|register)\.json$/.test(ref.path))throw e;
   historicalObservationsUnavailable.push({...ref,status:'original-private-observation-unavailable-not-recreated'});
  }
 }
 same(inheritance.rawVerification,execution);same(inheritance.candidate,receipt.candidate);assert(inheritance.uniqueStandardLedger&&inheritance.fullSourceCandidatePairingExact&&inheritance.allOtherContentUnchanged&&inheritance.allUnknownCaptionNotesPreserved);
 const candidate=await load(receipt.candidate.path),parent=await load(receipt.parent.path);
 same(candidate.body,parent.body);assert.equal(candidate.body.blocks.length,pin.blocks);
 assert.equal(candidate.figures.filter((f,i)=>JSON.stringify(f)===JSON.stringify(parent.figures[i])).length,pin.otherFigures);
 same(candidate.figures.map(f=>f.unknowns),parent.figures.map(f=>f.unknowns));same(candidate.figures.map(f=>f.caption),parent.figures.map(f=>f.caption));same(candidate.figures.map(f=>f.sourceNotes),parent.figures.map(f=>f.sourceNotes));
 const limits=[...new Set(raw.output.unknownImpacts.flatMap(u=>u.requiredDisplayLimitations))];
 same(limits,inheritance.requiredDisplayLimitations);same(limits,proposal.requiredDisplayLimitations);assert.equal(limits.length,pin.limits);
 const figureBindings=proposal.figureBindings.map(b=>{
  const figure=candidate.figures.find(f=>f.figureId===b.figureId);assert(figure);assert.equal(hash(figure),b.fullFigureSha256);same(figure.unknowns,b.unknowns);same(figure.sourceNotes,b.sourceNotes);same(figure.sourceBlockIds,b.sourceBlockIds);
  return {figureId:b.figureId,fullFigureSha256:b.fullFigureSha256,unknowns:b.unknowns};
 });
 function outcome(r,p){
  assert.equal(r.status,'repair-passed-unknown-unresolved');assert.equal(r.verification.repairPassed,true);assert.equal(r.verification.limitedUnknownOkay,false);assert.equal(r.verification.transportCompleted,true);
  same(r.modelReview,raw.output);same(r.verification.modelReview,raw.output);assert.equal(r.modelReview.issues.length,1);assert.equal(r.modelReview.issues[0].severity,'uncertain');
  assert.equal(r.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);assert.equal(r.modelReview.wholeChapterAccepted,false);
  same(p.candidate,receipt.candidate);for(const k of ['receipt','raw']){assert.equal(resolve(p[k].path),resolve(refs[k].path));assert.equal(p[k].sha256,refs[k].sha256);}same(p.figureBindings,proposal.figureBindings);same(p.requiredDisplayLimitations,limits);
  assert.equal(p.label,'审校限制（非原文）');assert.equal(p.authorBodyInjection,false);assert.equal(p.proposalOnly,true);assert.equal(p.implementationVerified,false);assert.equal(p.actualReadbackRequired,true);assert.equal(p.admissionGranted,false);assert.equal(p.wholeChapterPassed,false);
 }
 outcome(receipt,proposal);
 const negatives=[];
 for(const [name,change] of [
  ['strict-false-upgraded',(r,p)=>r.verification.limitedUnknownOkay=true],['repair-result-forged',(r,p)=>r.verification.repairPassed=false],
  ['uncertain-removed',(r,p)=>r.modelReview.issues=[]],['uncertain-relabelled',(r,p)=>r.modelReview.issues[0].severity='source-note'],
  ['chapter-passed',(r,p)=>r.wholeChapterPassed=true],['missing-limit',(r,p)=>p.requiredDisplayLimitations.pop()],
  ['paraphrased-limit',(r,p)=>p.requiredDisplayLimitations[0]+='可猜填'],['wrong-candidate',(r,p)=>p.candidate.sha256='0'.repeat(64)],
  ['wrong-full-figure',(r,p)=>p.figureBindings[0].fullFigureSha256='0'.repeat(64)],['author-injection',(r,p)=>p.authorBodyInjection=true],
  ['unlabelled-note',(r,p)=>p.label='作者原文'],['proposal-as-install',(r,p)=>p.implementationVerified=true],['proposal-as-admission',(r,p)=>p.admissionGranted=true]
 ]){const r=structuredClone(receipt),p=structuredClone(proposal);change(r,p);assert.throws(()=>outcome(r,p),name);negatives.push({name,rejected:true});}
 const limitationMap=limits.map((text,i)=>({index:i+1,text,rawQuotes:raw.output.unknownImpacts.flatMap((u,j)=>u.requiredDisplayLimitations.flatMap((s,k)=>s===text?[{path:'/output/unknownImpacts/'+j+'/requiredDisplayLimitations/'+k,figureId:u.figureId,unknownText:u.unknownText,sourceBlockIds:u.sourceBlockIds,authorClaim:u.authorClaim}]:[])),proposalPath:'/requiredDisplayLimitations/'+i,proposalTextMatched:true,installationVerified:false,actualReadbackVerified:false}));
 assert(limitationMap.every(l=>l.rawQuotes.length));
 const supplementRoot=root+'/integration/coac244-109167-limited-display-20261028';
 const supplementManifest=await bind(supplementRoot+'/manifest.json');
 const supplement=await import(pathToFileURL(supplementRoot+'/admit.mjs'));
 const legalSupplement=await supplement.verifyLimited(root,receipt.candidate.path);
 assert.equal(legalSupplement.originalStrictVerification.limitedUnknownOkay,false);assert.equal(legalSupplement.ordinaryWholeArticlePassed,false);same(legalSupplement.requiredDisplayLimitations,limits);
 assert.equal(sha(await readFile(supplementManifest.path)),supplementManifest.sha256);
 const selected=[];for(const s of preview.selectedWeb??[]){if(!s.candidatePath)continue;const path=/^(?:[A-Za-z]:|[/\\])/.test(s.candidatePath)?s.candidatePath:root+'/'+s.candidatePath;const c=await load(path);if(c.source?.sourceId===candidate.source.sourceId&&c.source?.articleId===candidate.source.articleId)selected.push(s);}
 const registerRow=register.rows.filter(r=>JSON.stringify(r).includes(receipt.canonical));
 // Observe concurrent single-writer progress; never overwrite its state or infer installation from a proposal.
 rows.push({key,canonical:receipt.canonical,candidate:receipt.candidate,refs,actualMaker:production.call,actualReview:receipt.call,status:receipt.status,repairPassed:execution.repairPassed,limitedUnknownOkay:execution.limitedUnknownOkay,retainedIssues:raw.output.issues,modelSummary:raw.output.summary,wholeChapterPassed:false,admissionGranted:false,orderedPairs:receipt.orderedPairs,actualImages:receipt.images,inheritanceRefsRehashed:inheritance.refs.length-historicalObservationsUnavailable.length,historicalObservationsUnavailable,unchangedBodyBlocks:production.unchangedBodyBlocks,unchangedNonTargetFigures:production.unchangedNonTargetFigures,allOriginalUnknownsPreserved:true,display:{label:proposal.label,figureBindings,limitationMap,proposalOnly:true,existing244LegalSupplement:{manifest:supplementManifest,verification:legalSupplement},installationVerified:false,actualMcpArenaReadback:null,currentPreviewSelection:selected,currentRegisterRows:registerRow,nextAction:'Existing244/250 owners finish and freeze their prepared exact supplement and install all verbatim non-author restrictions, then perform actual MCP/Arena readback before coverage. Retain strict limitedUnknownOkay=false and original uncertain; no new consumer/model/OCR or ordinary whole-chapter pass.'},budget:receipt.chapterPhaseCalls,negativeChecks:negatives});
 for(const [name,path] of Object.entries(paths))copies.push({name:key+'-'+name+'.json',path,sha256:pin[name]});
 for(const [name,path] of Object.entries(paths))assert.equal(sha(await readFile(path)),pin[name]);
}
await frozen.frozen(runtimeSHA);
const result={schema:'coac269-109167-real-review-consumption/1',recordedAt:new Date().toISOString(),authorizationComment:'01a181af-e1d9-7e64-8dcf-1607be707075',rows,ownerDedup:owners,previewObservation:{path:previewPath,sha256:sha(previewBytes),createdAt:preview.createdAt},registerObservation:{path:registerPath,sha256:sha(registerBytes),recordedAt:register.recordedAt},budget:{maker:2,independentReview:2,consumed:4,maximum:4,remaining:0,newCallsThisRun:0,retries:0,fee:null,remoteWeights:null,upstreamExecutionCount:null},newConsumers:0,globalStateWritten:false,sourceRawCandidateAuditChanged:false,copies};
// Own report only. Original evidence and shared owner state are read-only.
for(const c of copies)await writeFile(here+'/'+c.name,await readFile(c.path),{flag:'wx'});
for(const path of [here+'/verification.json',root+'/integration/coac269-109167-results-consumed-20261028.json'])await writeFile(path,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:true,chapters:rows.map(r=>({key:r.key,repairPassed:r.repairPassed,limitedUnknownOkay:r.limitedUnknownOkay,limits:r.display.limitationMap.length})),runtimeFiles:30,negativeChecks:rows.reduce((n,r)=>n+r.negativeChecks.length,0),newModelCalls:0}));
