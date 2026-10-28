import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',out=new URL('./',import.meta.url),I=root+'/integration/';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p)),save=async(n,v)=>writeFile(new URL(n,out),JSON.stringify(v,null,2)+'\n');
await mkdir(out,{recursive:true});
const refs=[];
async function pin(p,s){const b=await readFile(p);assert.equal(sha(b),s,'binding:'+p);const r={path:p,sha256:s,bytes:b.length};refs.push(r);return JSON.parse(b);}
async function runtime(ref){const m=await pin(ref.path,ref.sha256);for(const f of m.files)await pinBytes(f.path,f.sha256);return m;}
async function pinBytes(p,s){const b=await readFile(p);assert.equal(sha(b),s,'binding:'+p);refs.push({path:p,sha256:s,bytes:b.length});}
const human=await pin(I+'coac269-human257261-consumed-20261028.json','b19d4192f637f7f719e8cf63b8b59dd99ebcb975749456a489d2b243bd72f5b9');
for(const r of human.packageBindings) await pinBytes(r.path,r.sha256);
const entryPath=I+'coac244-human-final-20261028/entry.mjs';
await pinBytes(entryPath,'a7ff01b70e8e9b960e9f0c8f163465c134032145702d0511ec770fa6ba76110a');
const entry=await import(pathToFileURL(entryPath));
const owner='01a17cae-06e4-7b30-a93f-3a030d1ae63f';
const p257=await entry.verify('257',owner),p261=await entry.verify('261',owner);
assert.deepEqual(p257,human.p257.verification);assert.deepEqual(p261,human.p261.verification);
const frozen=human.p261.actualFrozenVerifier;await runtime(frozen.runtime);await pinBytes(frozen.module.path,frozen.module.sha256);
const audit=await import(pathToFileURL(frozen.module.path));
const gate=await audit.verifyAuditForCandidate(root,p261.candidate.path);assert.equal(gate.status,'passed-after-source-adjudication');assert.deepEqual(gate.adjudication,frozen.adjudication);
const reused=[];for(const r of human.reusedPages){await pinBytes(r.candidate.path,r.candidate.sha256);await pinBytes(r.audit.path,r.audit.sha256);const g=await audit.verifyAuditForCandidate(root,r.candidate.path);assert.equal(g.status,'passed');reused.push({page:r.page,sourceBlocks:r.sourceBlocks,candidate:r.candidate,audit:r.audit,status:g.status});}
assert.equal(reused.reduce((n,r)=>n+r.sourceBlocks,0),837);
await save('human-verified.json',{schema:'coac250-human257261-intake/1',recordedAt:new Date().toISOString(),p257,p261,gate261:gate,reusedPages:reused,conflictPositions:human.p257.conflictPositions,impact:human.p257.impact,latestSavedEventsRechecked:true,wholeChapterPassed:false,actualReadback:false,newModelCalls:0});
const rec=await pin(I+'coac249-311-curves-reviewed-20261028.json','3d86eddcfb776a7eaf07dd8e511b71cb8d501f6d74c35930da6c486dfdd14200');
const inheritance=await pin(I+'coac249-311-curves-inheritance-20261028.json','c98fbb4c76f855fdb4353237977bde62bf52f37e50393f6cd7d23e63375714cd');
await pinBytes(I+'coac249-311-curves-owner-handoff-20261028.md','2f51f6c955db20cdef23b6b6a9aaf74107e1a082e6db667db343ed76224da258');
await pinBytes(I+'coac249-311-curves-limited-scope-20261028.json','8780afc3098bbbfe3bc6b179535cf8e37188b418517788521b632120ccc23704');
const rt=root+'/audit/runtimes/coac269-311-curves-v1-20261028',manifestSHA='59d7d599ae1e05f05ccdd43a8127a5c21935afc8667280930461142ca1cc644b';
await runtime({path:rt+'/runtime-manifest.json',sha256:manifestSHA});
const curves=await import(pathToFileURL(rt+'/curves.mjs'));
const production=await curves.verifyProduction(rec.candidate.path,manifestSHA),plan=await curves.prepareReview(rec.candidate.path,manifestSHA);
const raw=await pin(rec.raw.path,rec.raw.sha256);assert.deepEqual(raw.output,rec.modelReview);
const checked=await curves.verifyReviewExecution(raw,plan,manifestSHA);assert.deepEqual(checked,rec.verification);assert.equal(checked.repairPassed,false);assert.equal(checked.limitedUnknownOkay,false);
await pinBytes(rec.candidate.path,rec.candidate.sha256);await pinBytes(rec.parent.path,rec.parent.sha256);
const c=await load(rec.candidate.path),parent=await load(rec.parent.path);assert.deepEqual(c.body,parent.body);assert.equal(c.body.blocks.length,225);assert.equal(c.figures.length,21);assert.equal(rec.modelReview.unknownImpacts.length,40);
const ledger=(await readFile(root+'/audit/calls.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.equal(ledger.length,1);
assert.equal(inheritance.newUnknownSlots,144);assert.equal(inheritance.newApproximateValues,0);
const impacts=rec.modelReview.unknownImpacts,counts={};for(const u of impacts)counts[u.disposition]=(counts[u.disposition]??0)+1;
assert.deepEqual(counts,{'nonblocking-with-limits':12,blocking:24,uncertain:4});
await save('311-verified.json',{schema:'coac250-cn311-evidence-intake/1',recordedAt:new Date().toISOString(),candidate:rec.candidate,raw:rec.raw,production,verification:checked,scopeInheritance:inheritance,unknownImpactCounts:counts,unknownImpacts:impacts,displayLimitations:inheritance.requiredDisplayLimitations,displayImplementationVerified:false,admissionGranted:false,actualReadback:false,newModelCalls:0,issueAttribution:{originalIssue:rec.modelReview.issues.find(x=>x.description.includes('12张')),actualTarget:'79-bilibili-cn:cv1815400:b0154:figure',newCurveIssue:false,originalIssueUnchanged:true}});
await save('bindings.json',refs);let i=0;const archive=[];for(const r of refs){if(archive.some(x=>x.path===r.path))continue;const name='e'+String(i++).padStart(3,'0');await copyFile(r.path,new URL(name,out));archive.push({...r,copy:name});}await save('archive.json',archive);
console.log(JSON.stringify({passed:true,p261:gate.status,reusePages:reused.length,sourceBlocks:837,p257MultiplicityPassed:false,cn311:checked.repairPassed,impacts:counts,newModelCalls:0}));
