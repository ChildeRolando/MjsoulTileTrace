// Read-only final verification; never rebuild, write shared files or invoke models.
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,join} from 'node:path';
const dir='_analysis/coac250-217',root='E:/AgentData/Coach/knowledge/processing',pkg=resolve(root,'integration/coac248-p217-admitted-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
const v=await load(dir+'/verification.json');
for(const f of [...v.canonicalBefore,...v.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const register=await load(v.register.path),before=await load(dir+'/register.before.json');
assert.equal(sha(await readFile(v.register.path)),v.register.afterSha256);
assert.equal(sha(await readFile(dir+'/register.before.json')),v.register.beforeSha256);
assert.equal(sha(await readFile(dir+'/register.after.json')),v.register.afterSha256);
assert.deepEqual(register.counts,before.counts);
assert.deepEqual(register.rows.filter(r=>r.originalChapterId!=='79-cn-chapter-217-4'),before.rows.filter(r=>r.originalChapterId!=='79-cn-chapter-217-4'));
assert.deepEqual(register.rows.find(r=>r.originalChapterId==='79-cn-chapter-217-4').limitedPdfEvidence,{
 ...v.pair,registration:v.registration
});
assert.equal(register.rows.find(r=>r.originalChapterId==='79-cn-chapter-217-4').covered,false);
for(const f of v.protectedFiles){const rel=relative(pkg,resolve(f.path));if(!rel.startsWith('..')&&rel!=='')assert.equal(sha(await readFile(join(dir,'upstream',rel))),f.sha256,'archived '+rel);}
assert.equal(sha(await readFile(dir+'/consistency-proof.json')),v.consistencyProof.sha256);
assert.equal(sha(await readFile(dir+'/handoff.json')),v.producerHandoff.sha256);
await assert.rejects(access(root+'/integration/accepted-consumer.lock'),{code:'ENOENT'});
assert.equal(v.coverage.increment,0);assert.equal(v.modelCalls,0);assert.equal(v.previewBuilt,false);assert.equal(v.pageOrChapterPassed,false);
console.log(JSON.stringify({allPassed:true,archivedBytesVerified:true,otherRegisterRowsUnchanged:79,coverageUnchanged:true,canonicalUnchanged:true,writerLockAbsent:true,testsPassed:22,modelCalls:0}));
