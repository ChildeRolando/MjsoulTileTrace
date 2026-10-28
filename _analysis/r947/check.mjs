// Read-only acceptance of COAC-244's exact b0947 composition; never run compose's CLI.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
const root='E:/AgentData/Coach/knowledge/processing', base=join(root,'integration');
const pkg=join(base,'coac244-283-0947-composition-20261028'), dir=resolve('_analysis/r947');
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=x=>sha(JSON.stringify(x)), json=async p=>JSON.parse(await readFile(p));
const save=(n,x)=>writeFile(join(dir,n),JSON.stringify(x,null,2)+'\n');
await mkdir(dir,{recursive:true});
try { await access(join(dir,'checked.json')); throw Error('Checked snapshot already exists; preserve it instead of overwriting.'); }
catch(e){if(e.code!=='ENOENT')throw e;}
const protectedNames=['accepted-preview-current.json','specific-web-variant-selection.v33.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','source-structure-holds.json','candidate-exclusions.json'];
const protectedPaths=protectedNames.map(n=>join(base,n));
protectedPaths.push('E:/AgentData/Coach/knowledge/review/textbook-corpus.json');
const protectedFiles=[];
for(const path of protectedPaths)protectedFiles.push({path,sha256:sha(await readFile(path))});
const preview=await json(protectedPaths[0]);
assert.equal(preview.corpusId,'d05520874d6d617f7fcd20f3686d39f0799da8f8067d4bf16cb2182575ab11a5');
const manifest=await json(join(pkg,'files.sha256.json'));
assert.equal(manifest.find(x=>x.path==='compose.mjs').sha256,'6a6b950b78451ac3fa4f5b7ad3b2c5a95ab17e1f470999908b7a1d89df6236e9');
const archived=[];
async function archive(path,expected){
 const b=await readFile(path),digest=sha(b);if(expected)assert.equal(digest,expected,path);
 const old=archived.find(x=>x.path===path);if(old){assert.equal(old.sha256,digest);return;}
 const local=`e${String(archived.length).padStart(3,'0')}`;
 await writeFile(join(dir,local),b);archived.push({path,sha256:digest,bytes:b.length,local});
}
for(const f of manifest)await archive(join(pkg,f.path),f.sha256);
await archive(join(pkg,'files.sha256.json'));
const proof=await json(join(pkg,'composition-proof.json'));
assert.equal(proof.derived.sha256,'ec43d8af0c82a3b53bf7c924804ebf00d6c65515ac3a7b21728b26f9e10ac85b');
for(const key of ['parent','donor','source','parentAudit','donorAudit','runtime','independentCheckpoint','independentRaw','productionRaw'])await archive(proof[key].path,proof[key].sha256);
const runtime=await json(proof.runtime.path);
assert.equal(runtime.files.length,32);
for(const f of runtime.files)await archive(f.path,f.sha256);
const {verify0947Composition}=await import(pathToFileURL(join(pkg,'compose.mjs')));
const verified=await verify0947Composition(join(pkg,'composition-proof.json'),proof.derived.path);
assert.equal(verified.passed,true);assert.equal(verified.wholeChapterAccepted,false);
const upstream=await json(join(pkg,'verification.json'));
assert.deepEqual(upstream.verification,verified);assert.equal(upstream.negativeTests.length,21);
assert(upstream.negativeTests.every(t=>t.rejected===true));
const issues=await json(join(pkg,'effective-issue-register.json'));
const original=await json(issues.originalAudit.path);
await archive(issues.originalAudit.path,issues.originalAudit.sha256);
assert.equal(issues.issues.length,19);
for(const issue of issues.issues){
 assert.equal(hash(issue.originalIssue),issue.originalIssueSha256);
 assert(original.modelReview.issues.some(i=>hash(i)===issue.originalIssueSha256));
}
const blocking=issues.issues.filter(i=>i.status==='open'&&i.category!=='source-note');
assert.equal(blocking.length,3);assert(blocking.every(i=>i.originalIssue.targetId.endsWith(':b0785:figure')));
assert.equal(issues.issues.filter(i=>i.category==='source-note').length,2);
assert.equal(issues.issues.filter(i=>i.status.startsWith('resolved')).length,14);
const fixed=issues.issues.filter(i=>i.originalIssue.targetId.endsWith(':b0947:figure')&&i.category!=='source-note');
assert.equal(fixed.length,2);assert(fixed.every(i=>i.status==='resolved-for-exact-reviewed-figure-composition'));
for(const f of protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256);
for(const f of archived)assert.equal(sha(await readFile(f.path)),f.sha256);
await save('archive.json',archived);
await save('checked.json',{schema:'coac250-b0947-read-only-check/1',recordedAt:new Date().toISOString(),verified,counts:issues.counts,closedOriginalIssues:fixed,remaining:blocking,upstreamNegativeRegressions:{count:21,allRejected:true,rerun:false,source:join(pkg,'verification.json')},protectedFiles,protectedUnchanged:true,preview:{corpusId:preview.corpusId,output:preview.output},newModelCalls:0,wholeChapterAccepted:false});
console.log(JSON.stringify({verified,counts:issues.counts,archived:archived.length,protectedUnchanged:true}));
