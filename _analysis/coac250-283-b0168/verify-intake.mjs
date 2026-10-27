// Read-only check of the completed intake; no model or consumer execution.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const dir='_analysis/coac250-283-b0168',sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p)),v=await load(dir+'/verification.json'),h=await load(dir+'/handoff.json');
for(const f of [...v.canonicalBefore,...v.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
for(const [name,f]of Object.entries({handoff:v.handoff,producerHandoff:h.producerHandoff,audit:h.audit,checkpoint:h.checkpoint,raw:h.raw,candidate:h.candidate,parent:h.parent,parentAudit:h.parentAudit,source:h.source}))assert.equal(sha(await readFile(dir+'/'+name+'.json')),f.sha256,name);
for(const f of v.recoveredRequestBoundary)assert.equal(sha(await readFile(dir+'/'+f.name)),f.sha256,f.name);
const manifest=await load(dir+'/runtime/b0168-review-runtime-manifest.json');
assert.equal(sha(await readFile(dir+'/runtime/b0168-review-runtime-manifest.json')),v.runtime.sha256);
for(const f of manifest.files)assert.equal(sha(await readFile(join(dir,'runtime',f.name))),f.sha256,'archive '+f.name);
const registered=await load(v.registration);assert.equal(registered.handoff.sha256,v.handoff.sha256);assert.equal(registered.checkpoint.sha256,v.checkpoint.sha256);assert.equal(registered.candidate.sha256,v.candidate.sha256);assert.deepEqual(registered.scope,v.scope);
assert.equal(v.actualVerification.target.passed,true);assert.equal(v.actualVerification.wholeArticle.error,'web_audit_not_passed_or_inputs_changed');assert.equal(v.chapterAccepted,false);assert.equal(v.coverage.increment,0);assert.equal(v.modelCalls,0);assert.equal(v.previewBuilt,false);
console.log(JSON.stringify({allPassed:true,targetPassed:true,wholeChapterAccepted:false,archivedOriginalBytesVerified:true,canonicalUnchanged:true,separateTableBranchPreserved:true,coverageUnchanged:true,modelCalls:0}));
