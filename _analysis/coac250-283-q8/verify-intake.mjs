// Read-only verification of the recorded Q8 evidence; no model/consumer invocation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
const dir='_analysis/coac250-283-q8',sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const v=await load(dir+'/verification.json'),h=await load(dir+'/handoff.json');
for(const f of [...v.canonicalBefore,...v.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
for(const [name,f]of Object.entries({handoff:v.handoff,raw:v.raw,request:v.request,receipt:v.receipt}))assert.equal(sha(await readFile(dir+'/'+name+'.json')),f.sha256,name);
for(const f of v.recovered.filter(f=>f.name))assert.equal(sha(await readFile(dir+'/consumer/'+f.name)),f.sha256,f.name);
const raw=await load(dir+'/raw.json');for(const f of raw.requestExecution.images){const name=f.path.endsWith('scene-x4-nearest.png')?'scene-x4-nearest.png':basename(f.path);assert.equal(sha(await readFile(dir+'/images/'+name)),f.sha256,name);}
for(const [name,f]of Object.entries({parent:h.candidate,source:h.source,parentAudit:h.originalAudit,candidate:h.currentQ8IdenticalCandidate}))assert.equal(sha(await readFile('_analysis/coac250-283-b0168/'+name+'.json')),f.sha256,'existing archived '+name);
const registered=await load(v.registration);assert.equal(registered.handoff.sha256,v.handoff.sha256);assert.equal(registered.raw.sha256,v.raw.sha256);assert.deepEqual(registered.scope,v.scope);
assert.equal(v.chapterAccepted,false);assert.equal(v.coverage.increment,0);assert.equal(v.modelCalls,0);assert.equal(v.previewBuilt,false);assert.equal(v.requestCoverage.actualCliImageArgs,15);assert.equal(v.imageProof.nearestNeighborPixelsExact,true);
console.log(JSON.stringify({allPassed:true,q8TargetOnly:true,chapterAccepted:false,originalArchivedInputsVerified:true,images:15,canonicalUnchanged:true,coverageUnchanged:true,otherBranchesPreserved:true,modelCalls:0}));
