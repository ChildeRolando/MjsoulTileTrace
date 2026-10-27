// Zero-call construction and verification of the sole authorized independent plan.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',runtime=root+'/audit/runtimes/coac244-256-exact-8s-v1-20261028';
const local=import.meta.dirname,sha=b=>createHash('sha256').update(b).digest('hex');
const candidatePath=root+'/web-production/v1/candidates/79-bilibili-cn/cv1785770.r2.display.json';
assert.equal(sha(await readFile(candidatePath)),'0877ccd8c34fed1b2728eec6c8dd912559e852d653b5fedda8f5b6e4469aa0bd');
const manifestBytes=await readFile(runtime+'/runtime-manifest.json');
assert.equal(sha(manifestBytes),'7068edaa377784a0823c4c6b942d41f5e4533dfbd2f3331962bede454b01bf15');
const manifest=JSON.parse(manifestBytes);assert.equal(manifest.files.length,30);
for(const f of manifest.files)assert.equal(sha(await readFile(runtime+'/'+f.path)),f.sha256);
const {prepare256ImpactReview}=await import(pathToFileURL(runtime+'/textbook-256-impact.mjs'));
const {prepareTextbookCliRequest}=await import(pathToFileURL(runtime+'/textbook-production-cli.mjs'));
const plan=await prepare256ImpactReview(root,candidatePath);
assert.equal(plan.proof.candidateSha256,sha(await readFile(candidatePath)));
assert.equal(plan.projection.orderedSourceCandidateContext.length,42);
assert.equal(plan.projection.retainedUnknowns.length,2);
assert.equal(plan.model,'gpt-6.1-terra');assert.equal(plan.reasoningEffort,'max');assert.equal(plan.images.length,2);
const work=local+'/request-construction';await mkdir(work,{recursive:false});
const actual=await prepareTextbookCliRequest({...plan,work});
assert.equal(actual.requestExecution.model,plan.model);assert.equal(actual.requestExecution.reasoningEffort,plan.reasoningEffort);
assert.equal(actual.args.filter(x=>x==='-i').length,2);
assert.deepEqual(actual.requestExecution.images.map(x=>x.sha256),plan.projection.images.map(x=>x.sha256));
await writeFile(local+'/review-plan.json',JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
await writeFile(local+'/review-construction.json',JSON.stringify({modelCalls:0,actualRequestConstructed:true,
 runtimeManifestSha256:sha(manifestBytes),actualVerifiedRuntimeFiles:30,candidateSha256:plan.proof.candidateSha256,
 promptSha256:sha(plan.prompt),schemaSha256:sha(JSON.stringify(plan.schema)),requestExecution:actual.requestExecution,
 orderedPairs:42,images:2,retainedUnknowns:plan.projection.retainedUnknowns,
 note:'Request construction only; 249 must acquire original audit guard, recheck STOP/claim/dedupe and invoke once. This is not a semantic review result.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({prepared:true,modelCalls:0,candidateSha256:plan.proof.candidateSha256,orderedPairs:42,images:2}));
