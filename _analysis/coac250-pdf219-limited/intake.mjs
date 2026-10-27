// Register exact existing evidence only. No producer, review, stage or preview invocation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,unlink,access} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',base=root+'/integration',dir='_analysis/coac250-pdf219-limited',canonical='79-cn-chapter-217-4';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8')),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
await mkdir(dir+'/inputs',{recursive:true});
const inputs=[];
async function bound(ref){const path=resolve(root,ref.path),bytes=await readFile(path);assert.equal(sha(bytes),ref.sha256,path);if(!inputs.some(x=>x.path===path))inputs.push({path,sha256:ref.sha256});await writeFile(dir+'/inputs/'+ref.sha256,bytes);return JSON.parse(bytes);}
async function snapshot(path){return {path,sha256:sha(await readFile(path))};}
const handoffRef={path:base+'/coac244-pdf219-limited-20261028/handoff.json',sha256:'190b37dcb93a3aec7402c4fed3aa6fd052faacac817f6c47fd6b45f1fbbfa569'},h=await bound(handoffRef);
assert.equal(h.canonical,canonical);assert.equal(h.newModelCalls,0);assert.equal(h.newProductionCalls,0);
const verifier=h.page219.verifier;assert.equal(sha(await readFile(verifier.path)),verifier.sha256);await writeFile(dir+'/limited219.mjs',await readFile(verifier.path));inputs.push(verifier);
const nativePath=root+'/audit/supplements/coac249-pdf218219-target-20261028/verify.mjs',nativeSha='e965aceb28f35215a61a1394aa4d19782b08af755adac47f64c2ff7a306366ba';assert.equal(sha(await readFile(nativePath)),nativeSha);
const saved=await bound(h.page219.admission),receipt=await bound(saved.receipt),rm=await bound(receipt.runtime),runtimeDir=join(dirname(receipt.runtime.path),'runtime');assert.equal(rm.files.length,30);
for(const f of rm.files){const path=join(runtimeDir,f.path);assert.equal(sha(await readFile(path)),f.sha256,path);inputs.push({path,sha256:f.sha256});await writeFile(dir+'/inputs/'+f.sha256,await readFile(path));}
await bound(rm.parentManifest);
const {verify219LimitedFidelity,load219Packet,validate219Packet}=await import(pathToFileURL(verifier.path));
const result=await verify219LimitedFidelity(root,h.page219.candidate.path);assert.deepEqual(result,saved);
assert.equal(result.limitedFidelityAdmission,true);assert.equal(result.originalChecks.passed,false);assert.equal(result.standardWholePagePassed,false);assert.equal(result.scopedTargetPassed,false);assert.equal(result.wholeChapterAccepted,false);
for(const f of result.protectedInputs){const path=resolve(root,f.path),b=await readFile(path);assert.equal(sha(b),f.sha256,path);inputs.push({path,sha256:f.sha256});await writeFile(dir+'/inputs/'+f.sha256,b);}
const packet=await load219Packet(root),mutations=[
 ['wrongCandidateSha',x=>x.item.candidate.sha256='0'.repeat(64)],
 ['missingUnknown',x=>x.candidate.figures[1].unknowns.pop()],
 ['guessedRiverRank',x=>x.candidate.figures[1].transcription=x.candidate.figures[1].transcription.replace('第2张为字牌','第2张为东1z')],
 ['changedAuthorModality',x=>x.candidate.body.blocks.find(b=>b.text?.includes('还不清楚')).text+='已听牌'],
 ['missingIndependentPermission',x=>x.raw.output.unknownTeachingImpact='牌名未知'],
 ['fakeWholePagePass',x=>x.receipt.status='passed'],
 ['changedParentNonTarget',x=>x.parent.figures[0].transcription+='changed'],
 ['changedIssueToResolved',x=>x.raw.output.originalIssueChecks[1].outcome='resolved'],
 ['changedQuoteRange',x=>x.limits.independentQuote.utf8Range=[0,5]],
 ['missingParentBodyCoverage',x=>x.parentAudit.modelReview.bodyChecks[0].verdict='uncertain']
];
const negativeTests=mutations.map(([name,mutate])=>{const x=structuredClone(packet);mutate(x);assert.throws(()=>validate219Packet(x));return {name,rejected:true};});
const d218=await bound(h.page218),native=await import(pathToFileURL(nativePath)),v218=await native.verifyPdfTargetReceipt(root,resolve(root,d218.receipt.path));assert.equal(v218.status,'needs-repair');assert.equal(d218.blockingIssues.length,3);
await bound(d218.candidate);await bound(d218.receipt);await bound(d218.raw);
const registerPath=base+'/coac250-unified-chapter-register-20261027b.json',registerBytes=await readFile(registerPath),register=JSON.parse(registerBytes),row=register.rows.find(x=>x.originalChapterId===canonical),before=structuredClone(register);
assert.equal(row.covered,false);assert.equal(row.pdfAssemblyPlan.wholeChapterPassed,false);assert.deepEqual(row.pdfAssemblyPlan.sourcePartition.perPage,[6,5,9,2]);
const ownerPath=base+'/coac244-remaining26-closure-register-20261028.json',owner=await load(ownerPath),orow=owner.rows.find(x=>x.chapterId===canonical);assert.deepEqual(orow.pdf219LimitedFidelityAdmission,h.page219.admission);assert.deepEqual(orow.effectivePdfRouteBlockingIssues,d218.blockingIssues);assert.equal(orow.covered,false);
const protectedPaths=['accepted-preview-current.json','specific-web-variant-selection.v28.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','candidate-exclusions.json','source-structure-holds.json','coac250-pdf217220-assembly-intake-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json'].map(x=>base+'/'+x);
protectedPaths.push(ownerPath,'E:/AgentData/Coach/knowledge/review/textbook-corpus.json',root+'/audit/calls.jsonl');
const protectedFiles=await Promise.all(protectedPaths.map(snapshot)),preview=await load(base+'/accepted-preview-current.json');
const registrationPath=base+'/coac250-pdf219-limited-intake-20261028.json';
try{await access(registrationPath);throw Error('Existing registration: deduplicate instead of rewriting');}catch(e){if(e.code!=='ENOENT')throw e;}
for(const n of ['accepted-consumer.lock','selection-maintainer.lock.json','ACCEPTED-CONSUMER-STOP'])try{await access(base+'/'+n);throw Error('Existing owner/STOP: '+n+' '+await readFile(base+'/'+n,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const record={schema:'coac250-pdf219-limited-intake/1',recordedAt:new Date().toISOString(),canonical,handoff:handoffRef,verifier,candidate:result.candidate,admission:h.page219.admission,receipt:result.receipt,raw:result.raw,callId:result.callId,status:result.status,limitedFidelityAdmission:true,sourceBlockIds:result.sourceBlockIds,bodySha256:h.page219.authorBodySha256,retainedUnknowns:result.proof.unknowns,originalModelVerdict:result.originalModelVerdict,originalTechnicalStatus:result.originalTechnicalStatus,originalChecks:result.originalChecks,standardWholePagePassed:false,scopedTargetPassed:false,wholeChapterAccepted:false,forbiddenInferences:result.forbiddenInferences,independentQuote:result.proof.quote,runtime:{...receipt.runtime,files:30},nativeReceiptVerification:{page219:packet.native,page218:v218},negativeTests,pending:{page:218,candidate:d218.candidate,receipt:d218.receipt,blockingIssues:d218.blockingIssues,repairGoalOnly:true,repairAuthorized:false,modelCallsAuthorized:0},partition:{total:22,perPage:[6,5,9,2]},mandatory217Pair:row.limitedPdfEvidence.requiredAnnotation,page220:row.pdfAssemblyPlan.pages.find(x=>x.page===220),newModelCalls:0,newProductionCalls:0,newConsumerStarted:false,previewBuilt:false,mcpReadbackPerformed:false,arenaReadbackPerformed:false,coverageIncrement:0,coverage:{chapters:register.counts.effectiveCoveredOriginalChapters,total:256,remaining:register.remainingTypes.total},preview:{corpusId:preview.corpusId,output:preview.output},formalActiveChanged:false,protectedInputs:inputs,protectedFiles};
await save(dir+'/intake.json',record);const registrationRef=await snapshot(dir+'/intake.json');registrationRef.path=registrationPath;
row.pdf219LimitedFidelityEvidence={registration:registrationRef,handoff:handoffRef,admission:h.page219.admission,verifier,candidate:result.candidate,status:result.status,originalModelVerdict:'uncertain',originalTechnicalStatus:'needs-repair',standardWholePagePassed:false,scopedTargetPassed:false,wholeChapterAccepted:false,retainedUnknowns:4};
row.effectivePdfRouteBlockingIssues=d218.blockingIssues;
row.pdfAssemblyPlan.latestLimitedAdmission=registrationRef;
row.remainingRequiredPdfSourceScope.latestLimitedAdmission=registrationRef;
row.remainingRequiredPdfSourceScope.pendingIndependentAcceptancePages=[218];
const finalAcceptance='219 exact conditional-author-argument display accepted via pinned limited verifier, original uncertain retained.218 has three current blockers. Preserve217 figure/mandatory218-b3 annotation pair and220 owned b1/b3. Final22-block assembly and MCP/Arena readback remain undone; no whole chapter acceptance.';
row.remainingRequiredPdfSourceScope.finalAcceptance=finalAcceptance;
row.pdfAssemblyPlan.remainingAssemblyScope=finalAcceptance;
row.pdfAssemblyPlan.pendingReviewPages=[218];
row.pdfAssemblyPlan.historicalPagesBeforeTargetSupplement=structuredClone(row.pdfAssemblyPlan.pages);
for(const p of row.remainingRequiredPdfSourceScope.pages.filter(p=>[218,219].includes(p.page))){p.historyBeforeTargetSupplement=structuredClone(p);const is219=p.page===219;p.candidate=is219?result.candidate:d218.candidate;p.candidatePaths=[resolve(root,p.candidate.path)];p.latestReceipt=is219?result.receipt:d218.receipt;p.status=is219?result.status:'needs-repair';p.originalTechnicalStatus='needs-repair';p.acceptanceNeeded=!is219;p.blockingIssues=is219?[]:d218.blockingIssues;p.retainedOriginalModelIssues=is219?result.proof.retainedModelIssues:undefined;p.limitedAdmission=is219?registrationRef:null;}
row.limitedPdfEvidence.remainingScope=structuredClone(row.remainingRequiredPdfSourceScope.pages);
for(const p of row.pdfRoute.pagesDetail.filter(p=>[218,219].includes(p.page))){p.historyBeforeTargetSupplement=structuredClone(p);p.candidate=p.page===219?result.candidate:d218.candidate;p.latestReceipt=p.page===219?result.receipt:d218.receipt;p.receiptStatus='needs-repair';p.scopedTargetPassed=false;p.standardWholePagePassed=false;p.limitedFidelityAdmission=p.page===219;p.limitedAdmission=p.page===219?registrationRef:null;}
for(const p of row.pdfAssemblyPlan.pages.filter(p=>[218,219].includes(p.page))){p.candidate=p.page===219?result.candidate:d218.candidate;p.latestReceipt=p.page===219?result.receipt:d218.receipt;p.observedStatus='needs-repair';p.blockingIssues=p.page===219?[]:d218.blockingIssues;p.limitedFidelityAdmission=p.page===219;p.limitedAdmission=p.page===219?registrationRef:null;p.wholePageAccepted=false;p.retainedModelIssues=p.page===219?result.proof.retainedModelIssues:undefined;}
assert.deepEqual(register.counts,before.counts);assert.deepEqual(register.remainingTypes,before.remainingTypes);assert.deepEqual(row.limitedPdfEvidence.requiredAnnotation,before.rows.find(x=>x.originalChapterId===canonical).limitedPdfEvidence.requiredAnnotation);
for(const r of before.rows.filter(r=>r.originalChapterId!==canonical))assert.deepEqual(register.rows.find(x=>x.originalChapterId===r.originalChapterId),r);
await writeFile(dir+'/register.before.json',registerBytes);await save(dir+'/register.after.json',register);
const lock=base+'/accepted-consumer.lock',lockBytes=JSON.stringify({pid:process.pid,scope:'COAC-250 evidence registration only; no consumer/build',startedAt:new Date().toISOString()})+'\n';await writeFile(lock,lockBytes,{flag:'wx'});
try{
 for(const f of [...inputs,...protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 assert.equal(sha(await readFile(registerPath)),sha(registerBytes));
 await writeFile(registrationPath,await readFile(dir+'/intake.json'),{flag:'wx'});
 const temp=registerPath+'.tmp-'+process.pid;await writeFile(temp,await readFile(dir+'/register.after.json'));await rename(temp,registerPath);
 for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 await save(dir+'/verification.json',{allPassed:true,recordedAt:new Date().toISOString(),registration:registrationRef,register:{path:registerPath,beforeSha256:sha(registerBytes),afterSha256:sha(await readFile(registerPath))},runtimeFiles:30,nativeVerifierSha256:nativeSha,limitedVerifierSha256:verifier.sha256,negativeTests,callbackMatchesOriginalAdmission:true,originalUncertainAndFalsePreserved:true,allOtherRowsUnchanged:true,pointerSelectionAndFormalUnchanged:true,coverage:record.coverage,newModelCalls:0,newProductionCalls:0,newConsumerStarted:false,previewBuilt:false});
}finally{assert.equal(await readFile(lock,'utf8'),lockBytes);await unlink(lock);}
console.log(JSON.stringify({registered:registrationRef,status:result.status,originalTechnicalStatus:'needs-repair',negativeTests:negativeTests.length,remainingBlockers:3,coverage:record.coverage,newModelCalls:0,previewBuilt:false}));
