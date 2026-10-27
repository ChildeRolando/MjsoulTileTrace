// Read-only verification of the existing 249 evidence and 250 exact display composition.
// No model, staging, preview-pointer, candidate, receipt or ledger writes.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ROOT='E:/AgentData/Coach/knowledge/processing',O=import.meta.dirname,S=join(ROOT,'integration/coac244-pdf218-bounded-composition-20261028');
const sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const protectedInputs=[];
async function get(ref){const p=resolve(ROOT,ref.path),b=await readFile(p);assert.equal(sha(b),ref.sha256,p);protectedInputs.push({path:p,sha256:sha(b)});return JSON.parse(b);}
async function recordFile(p){const b=await readFile(p);const r={path:p,sha256:sha(b),bytes:b.length};protectedInputs.push(r);return r;}
const h=await get({path:'integration/coac249-pdf218219-bounded-close-reviewed-20261028.json',sha256:'ce1df311b35a41fee83882422ba9491232d5f592388d7a3fbf055ef6291f9b5a'});
const rec=await get(h.page218.receipt),candidate=await get(h.page218.candidate),raw=await get(h.page218.raw),allow=await get(h.page218.boundedAllowance),request=await get(rec.requestBoundary);
assert.equal(h.page218.candidate.sha256,'df8f2de33d1baf5141533810f22b59855aef0145729d612f003ae123c4e24157');
for(const ref of [h.dispatchContract,h.sourceHandoff,rec.approval,rec.proof,rec.originalProductionRaw,rec.immediateParent,rec.originalParent,rec.priorTargetReceipt,rec.priorTargetRaw])await get(ref);
const runtime=await get(rec.runtime),rt=join(resolve(ROOT,rec.runtime.path),'../runtime');
for(const f of runtime.files){const p=join(rt,f.path);assert.equal(sha(await readFile(p)),f.sha256);protectedInputs.push({path:p,sha256:f.sha256});}
assert.equal(runtime.files.length,30);
await recordFile(h.page218.verifier.path);assert.equal(sha(await readFile(h.page218.verifier.path)),h.page218.verifier.sha256);
const v218=await(await import(pathToFileURL(h.page218.verifier.path))).verify218BoundedEvidence(ROOT,h.page218.receipt.path);
assert.equal(v218.status,'needs-repair');assert.equal(v218.semanticEvidencePassed,false);assert(v218.allReturnedSourceQuotesExactlyMapped);assert.equal(v218.claimMappings.length,18);
assert.equal(raw.callId,'f67b7927-e0d9-4f0e-a163-974b72afe05e');assert.deepEqual(raw.output,rec.modelReview);assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.equal(rec.checks.passed,false);assert.equal(rec.status,'needs-repair');
assert.deepEqual(raw.output.requiredLimitations,allow.requiredDisplayLimitations);
const lines=(await readFile(join(ROOT,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.equal(lines.length,1);assert.deepEqual(lines[0],rec.call);
for(const i of raw.requestExecution.images){const bytes=await readFile(i.path);assert.equal(sha(bytes),i.sha256);assert.equal(bytes.length,i.bytes);protectedInputs.push({path:i.path,sha256:i.sha256});}
assert.equal(raw.requestExecution.images.length,3);
assert.equal(sha(await readFile(h.page219.verifier.path)),h.page219.verifier.sha256);
const a219=await(await import(pathToFileURL(h.page219.verifier.path))).verify219LimitedFidelity(ROOT,h.page219.candidate.path);assert.deepEqual(a219,await get(h.page219.existingAdmission));assert.equal(a219.standardWholePagePassed,false);
for(const f of a219.protectedInputs)protectedInputs.push(f);
const preview=join(ROOT,'integration/accepted-content-preview-2026-10-27T22-45-20-588Z'),stage=join(preview,'stages/pdf-79-cn-chapter-217-4');
const srPath=join(stage,'pdf-stage-receipt.json'),sr=await load(srPath);await recordFile(srPath);
assert.equal(sr.scopeSelection.chapterId,'79-cn-chapter-217-4');assert.equal(sr.scopeSelection.module.sha256,'0a2d0026d5d68adf897903b3231fe5d8704edb89d8aebc53f151a05dd1da632c');
await recordFile(sr.scopeSelection.module.path);assert.equal(sha(await readFile(sr.scopeSelection.module.path)),sr.scopeSelection.module.sha256);
for(const f of sr.scopeSelection.files){assert.equal(sha(await readFile(f.path)),f.sha256);protectedInputs.push(f);}
// Existing scope-specific verifier, unchanged: do not invoke its stageOwned217 export.
const display=await import(pathToFileURL(sr.scopeSelection.module.path));display.assert218DisplayEvidence(candidate,allow,raw,request);
const pages=[];for(const e of h.assembly.pages){pages.push({page:await get(e.source),candidate:await get(e.candidate)});}
const owners=await get(h.assembly.ownership),owned=owners.blocks.filter(x=>x.chapterId==='79-cn-chapter-217-4'),assembly=await get(h.assembly.originalManifest),projection=(await get(assembly.pairedLimitedSupplement.projection)).continuation;
const sb=await load(join(stage,'textbook-bodies.json')),stageChapter=sb.chapters.find(x=>x.chapterId==='79-cn-chapter-217-4');assert(stageChapter);
const pb=await load(join(preview,'textbook-bodies.json')),chapter=pb.chapters.find(x=>x.chapterId==='79-cn-chapter-217-4');assert.deepEqual(chapter,stageChapter);
display.verifyProjectedDisplay(chapter.blocks,pages,owned,projection,allow.requiredDisplayLimitations);
const dm=await get(sr.displayMap);assert.deepEqual(dm.claimMappings,allow.claimMappings);assert.equal(dm.originalTechnicalStatus,'needs-repair');assert.deepEqual(dm.originalTechnicalChecks,rec.checks);assert.deepEqual(dm.uncertainClaimsRetained,allow.claimUncertainRetained);
const corpus=await load(join(preview,'textbook-corpus.json')),unit=corpus.units.find(u=>u.chapterId==='79-cn-chapter-217-4');assert(unit);
// The existing compiler intentionally changes the storage shape. Verify complete visible fields,
// including figure transcription/caption, without requiring source-only ownership metadata in corpus.
assert.deepEqual(unit.blocks.map(b=>b.id),chapter.blocks.map(b=>b.id));
for(const [i,b]of chapter.blocks.entries()){const compiled=unit.blocks[i];assert.equal(compiled.type,b.type);assert.equal(compiled.page,b.page);if(b.type==='figure'){assert.equal(compiled.figure.transcription.text,b.transcriptionText);assert.equal(compiled.figure.caption,b.caption);}else assert.equal(compiled.text,b.text);}
const html=await readFile(join(preview,'knowledge.html'),'utf8');
for(const text of allow.requiredDisplayLimitations){assert(html.includes(text));assert(unit.blocks.some(b=>b.text?.includes(text)));}
assert.equal(chapter.blocks.filter(b=>b.type==='figure').length,4);
assert.equal(chapter.blocks.find(b=>b.id==='79-cn-p218-r1').transcriptionText,candidate.figures[0].transcription);
const normalized=structuredClone(chapter.blocks);const checks=[{name:'real exact runtime/ledger/raw + 18 source quotes + 7 limitations + stage/preview/corpus/HTML',passed:true}];
function test(name,fn){assert.throws(fn);checks.push({name,rejected:true});}
for(const [name,mutate]of [
 ['missing unknown',x=>x.c.figures[0].unknowns.pop()],['guessed first souzu',x=>x.c.figures[0].transcription=x.c.figures[0].transcription.replace('?s7s','6s7s')],
 ['missing independent permission',x=>x.r.output.boundedAuthorArgumentVerdict='uncertain'],['actual east count certified',x=>x.r.output.actualEastVisibleCountCertified=true],
 ['actual dealer certified',x=>x.r.output.actualDealerRoleCertified=true],['hidden hand certified',x=>x.r.output.fullRiverOrHiddenHandCertified=true],['claimed whole page pass',x=>x.r.output.wholePagePassClaimed=true],
 ['old uncertain changed',x=>x.r.output.claimChecks.find(c=>c.verdict==='uncertain').verdict='faithful-with-explicit-unknown'],
 ['quote moved',x=>x.a.independentQuote.utf8Range=[0,10]],['missing one exact limitation',x=>x.a.requiredDisplayLimitations.pop()],
 ['missing claim context mapping',x=>x.a.claimMappings.pop()],['source image b5 absent',x=>x.t.projection.completeOriginalContext['218'].blocks=x.t.projection.completeOriginalContext['218'].blocks.filter(b=>b.id!=='79-cn-p218-b5')]
]){const x=structuredClone({c:candidate,a:allow,r:raw,t:request});mutate(x);test(name,()=>display.assert218DisplayEvidence(x.c,x.a,x.r,x.t));}
for(const [name,mutate]of [
 ['display limitation missing',b=>b.splice(b.findIndex(x=>x.id==='coac250-218-limit-2'),1)],
 ['display limitation changed',b=>b.find(x=>x.id==='coac250-218-limit-3').text+='已认证双东'],
 ['note attributed to source',b=>b.find(x=>x.id==='coac250-218-limit-1').sourceBlockIds=['79-cn-p218-b4']],
 ['217 mandatory note absent',b=>{const x=b.find(x=>x.id==='79-cn-p218-b3-t1');x.text=x.text.replace(projection.segments.find(s=>s.authorText===false).text,'');}],
 ['author condition changed',b=>b.find(x=>x.sourceBlockIds.includes('79-cn-p218-b4')).text+='已证明唯一役种'],
 ['source contribution dropped',b=>b.find(x=>x.sourceBlockIds.includes('79-cn-p218-b1')).sourceBlockIds=b.find(x=>x.sourceBlockIds.includes('79-cn-p218-b1')).sourceBlockIds.filter(x=>x!=='79-cn-p218-b1')],
 ['source contribution reordered',b=>{const f=b.findIndex(x=>x.sourceBlockIds.includes('79-cn-p218-b4'));const g=b.findIndex(x=>x.sourceBlockIds.includes('79-cn-p218-b3'));[b[f],b[g]]=[b[g],b[f]];}],
 ['target unknown transcription changed',b=>b.find(x=>x.id==='79-cn-p218-r1').transcriptionText+='东牌全部已辨明'],
 ['219 non-target figure changed',b=>b.find(x=>x.id==='79-cn-p219-r1').transcriptionText+='changed']
]){const b=structuredClone(normalized);mutate(b);test(name,()=>display.verifyProjectedDisplay(b,pages,owned,projection,allow.requiredDisplayLimitations));}
for(const ref of protectedInputs)assert.equal(sha(await readFile(ref.path)),ref.sha256,ref.path);
const displayMaps=allow.requiredDisplayLimitations.map((text,i)=>{const b=chapter.blocks.find(b=>b.id==='coac250-218-limit-'+(i+1));return {index:i+1,rawPointer:'/output/requiredLimitations/'+i,exactText:text,utf8Sha256:sha(text),actualBlock:b,htmlContains:true,compiledUnitContains:true,sourceCandidateSha256:h.page218.candidate.sha256};});
const evidence={schema:'coac244-reused-pdf218-exact-limited-composition/1',canonical:'79-cn-chapter-217-4',candidate:h.page218.candidate,callId:raw.callId,receipt:h.page218.receipt,raw:h.page218.raw,originalTechnicalStatus:rec.status,originalChecksPassed:rec.checks.passed,uncertainClaimsUnchanged:allow.claimUncertainRetained,sourceQuoteCount:v218.claimMappings.length,actualSourceBlockB5IsImage:true,independentConsistency:raw.output.consistencyVerdict,independentBoundedVerdict:raw.output.boundedAuthorArgumentVerdict,model:raw.requestExecution.model,reasoningEffort:raw.requestExecution.reasoningEffort,images:raw.requestExecution.images,usage:raw.usage,durationMs:raw.durationMs,sevenLimitations:displayMaps,displayOwner:'COAC-250 existing run01a17f84-6d24-79e1-83a0-21b1447b360f',displayModule:sr.scopeSelection.module,preview,stage,stageReceipt:await recordFile(srPath),compiledUnit:unit.unitId,ownedBlocks:owned.map(x=>x.sourceBlockId),partition:[6,5,9,2],actualFigures:4,authorTextUnchangedAfterRemovingOnlyNonAuthorNotes:true,paired217NoteRetained:true,reused219Admission:h.page219.existingAdmission,standardWholePage218Passed:false,scopedTarget218Passed:false,wholeChapterAcceptedByThisEvidence:false,admissionContract:'Existing250 exact scope contract and unchanged assert218DisplayEvidence/verifyProjectedDisplay; no new general exception or parallel admission.',realMcpArenaReadback:'Owned by existing250 run; compiled/HTML readback here is not a claim that transport MCP/Arena checks completed.',newModelCalls:0,newProductionCalls:0,newConsumers:0,retry:0,upstreamExecutionCount:null,remoteWeights:'unknown',fee:null,protectedInputs,checks};
await mkdir(S,{recursive:true});
for(const [name,data]of [['composition-evidence.json',evidence],['checks.json',{checks,newModelCalls:0,protectedInputsUnchanged:true,sourceFiles:protectedInputs.length}]]){await writeFile(join(O,name),JSON.stringify(data,null,2)+'\n');await copyFile(join(O,name),join(S,name));}
for(const [name,ref]of [['249-handoff.json',{path:'integration/coac249-pdf218219-bounded-close-reviewed-20261028.json'}],['218-original-receipt.json',h.page218.receipt],['218-original-raw.json',h.page218.raw],['218-bounded-allowance.json',h.page218.boundedAllowance],['247-display-map.json',{path:'integration/coac247-pdf218-bounded-result-display-map-20261028.json'}],['250-stage-receipt.json',{path:srPath}],['250-display-limitations.json',sr.displayMap],['250-exact-stage-module.mjs',sr.scopeSelection.module]]){await copyFile(resolve(ROOT,ref.path),join(O,name));await copyFile(join(O,name),join(S,name));}
console.log(JSON.stringify({checks:checks.length,sourceQuotes:18,limits:7,owned:22,figures:4,rawStatus:rec.status,newModelCalls:0,protectedInputs:protectedInputs.length}));
