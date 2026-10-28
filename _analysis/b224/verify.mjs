import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',base=root+'/integration',dir='_analysis/b224',sha=x=>createHash('sha256').update(x).digest('hex'),load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n'),bindings=[];
async function bound(path,expected){const b=await readFile(path);if(expected)assert.equal(sha(b),expected,path);bindings.push({path,sha256:sha(b),bytes:b.length});return path.endsWith('.json')?JSON.parse(b):b;}
const pins={
 'coac249-224-seven-owner-handoff-20261028.md':'81b79cb4383a882f56685e75694a37403a08057391912d075372276d25901107',
 'coac249-224-seven-reviewed-20261028.json':'3b9bab561f2ea1c0450156ef1135e879471c503cc8ff1a3e709d981188c79e2e',
 'coac249-224-seven-inheritance-20261028.json':'d0ba60967234b230a08c98067d2d623e87cf06b6db5d6e925b29f78e9db52729',
 'coac249-224-seven-limited-scope-20261028.json':'e64d2e9ca2a6996adfb4ef676edbf2f4f4f27e6ab469812ca3e14a751e3e2257'};
for(const[n,h]of Object.entries(pins))await bound(base+'/'+n,h);
const r=await load(base+'/coac249-224-seven-reviewed-20261028.json'),q=await load(base+'/coac249-224-seven-limited-scope-20261028.json'),proof=await load(base+'/coac249-224-seven-inheritance-20261028.json');
assert.equal(r.canonical,'nemata-jp-chapter-224-1');assert.equal(r.candidate.sha256,'c38fbdd237d21b3f3d0093ebc0ebb06c0223cfe34b3953a3b61506041cc9291a');
const runtime=await bound(r.runtime.path,r.runtime.sha256);assert.equal(runtime.files.length,35);for(const f of runtime.files)await bound(f.path,f.sha256);
for(const k of ['candidate','source','parent','parentAudit','parentRaw','makerRaw','handoff','raw','plan'])await bound(r[k].path,r[k].sha256);
const c=await load(r.candidate.path),p=await load(r.parent.path),raw=await load(r.raw.path),plan=await load(r.plan.path),old=await load(r.parentAudit.path),native=await import(pathToFileURL(root+'/audit/runtimes/coac269-224-seven-v1-20261028/seven.mjs'));
assert.deepEqual(await native.verifyProduction(r.candidate.path,r.runtime.sha256),r.productionProof);
assert.deepEqual(await native.prepareReview(r.candidate.path,r.runtime.sha256),plan);
const v=await native.verifyReviewExecution(raw,plan,r.runtime.sha256);assert.deepEqual(v,r.verification);assert.deepEqual(raw.output,r.modelReview);assert.equal(v.repairPassed,true);assert.equal(v.limitedUnknownOkay,true);assert.equal(v.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
for(const image of r.images)await bound(image.path,image.sha256);
assert.deepEqual(c.body,p.body);assert.equal(c.body.blocks.length,15);assert.equal(c.figures.length,1);assert.deepEqual(c.figures[0].unknowns,p.figures[0].unknowns);assert.deepEqual(c.figures[0].caption,p.figures[0].caption);assert.deepEqual(c.figures[0].sourceNotes,p.figures[0].sourceNotes);
const limits=[...new Set(raw.output.unknownImpacts.flatMap(x=>x.requiredDisplayLimitations))];assert.equal(limits.length,10);assert.deepEqual(limits,q.requiredDisplayLimitations);assert.deepEqual(limits,proof.requiredDisplayLimitations);assert.equal(q.implementationVerified,false);assert.equal(q.admissionGranted,false);
assert.equal(proof.unchangedExistingReadings,81);assert.equal(proof.retainedOtherUnknownCells,17);assert.equal(proof.newApproximateValuesCount,88);assert.equal(proof.changedCells.length,7);assert.equal(proof.unchangedCells.length,98);assert.equal(proof.unchangedCells.filter(x=>x.after==='unknown').length,17);assert(proof.changedCells.every(x=>x.before==='unknown'));
for(const[k,value]of Object.entries({unchangedBodyBlocks:15,allUnknownCaptionSourceNotesConditionsMarksTableContextOrderPreserved:true,wholeChapterPassed:false,admissionGranted:false}))assert.equal(proof[k],value);
assert.deepEqual(proof.originalParentIssues,old.modelReview.issues);assert.deepEqual(proof.originalParentVerification,old.verification);assert(raw.output.issues.every(x=>x.severity==='source-note'));assert.equal(raw.requestExecution.model,'gpt-6.1-terra');assert.equal(raw.requestExecution.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);
const archive=[];for(const f of [...new Map(bindings.map(x=>[x.path,x])).values()]){const name='e'+String(archive.length).padStart(3,'0');await writeFile(dir+'/'+name,await readFile(f.path));archive.push({...f,local:name});}await save(dir+'/archive.json',archive);
await save(dir+'/verified.json',{schema:'coac250-224-seven-native-evidence-verification/1',checkedAt:new Date().toISOString(),passed:true,canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,receipt:{path:base+'/coac249-224-seven-reviewed-20261028.json',sha256:pins['coac249-224-seven-reviewed-20261028.json']},raw:r.raw,runtime:r.runtime,frozenFiles:35,productionAndRecursiveParentChainRecomputed:true,actualRequestRebuiltExactly:true,nativeVerification:v,standardLedgerUnique:true,unchangedBodyBlocks:15,changedCells:proof.changedCells,unchangedExistingReadings:81,approximateValues:88,remainingUnknownCells:proof.retainedOtherUnknownCells,remainingUnknownCellIds:q.remainingUnknownCellIds,requiredDisplayLimitations:limits,sourceNote:raw.output.issues,wholeChapterPassed:false,admissionGranted:false,displayImplementationVerified:false,actual250Readback:false,newModelCalls:0,newProductionCalls:0});
console.log('224 native execution/production/recursive parent/request/35 dependencies verified;88 approximate readings,17 unknown;10 display limitations still require exact owner admission and actual readback.');
