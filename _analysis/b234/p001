// Fixed CN234 evidence composition; no general audit gate changes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const ROOT='E:/AgentData/Coach/knowledge/processing';
export const TARGET='79-bilibili-cn:cv1780400:b0003',PIN='7b5f2c2866bc39dc4e375f063d560765a8acd1a6078d34e583d03a1eae8866ae';
export const glosses=[['ゴットー','（五—十）'],['ワンツー','（一—二）'],['ワンスリー','（一—三）']];
const load=async p=>JSON.parse(await readFile(p));
export function displayExactSegments(b){
 if(!b.sourceBlockIds.includes(TARGET))return b.sourceSegments;
 assert.equal(b.sourceSegments.map(s=>s.text).join(''),b.sourceText);
 const counts=[0,0,0],segments=b.sourceSegments.map(s=>({...s,text:glosses.reduce((t,[a,z],i)=>{if(t.includes(a)){assert.equal(t.split(a).length,2);counts[i]++;return t.replace(a,a+z);}return t;},s.text)}));
 assert.deepEqual(counts,[1,1,1]);assert.equal(segments.map(s=>s.text).join(''),b.text);return segments;
}
export function assertScope(c,p,raw,parentRaw,audit,r,side,q){
 assert.equal(r.canonical,'79-cn-chapter-234-12');assert.equal(r.textTarget,TARGET);assert.equal(r.candidate.sha256,PIN);
 assert.equal(r.source.sha256,'7c68b1e68b499637d7ebf6178beb31840f0925cf670a34f21dfd112454c49c57');
 assert.equal(r.parent.sha256,'e6424e8c99c01ac0d344af26374e0fc57ee656c5c72f19902010bb1c2618d110');
 assert.equal(r.parentAudit.sha256,'87d822baddef33cd01535f7b5b0fd000c8a23d2adc5382170f85af3945f7ac60');
 assert.deepEqual(c.source,p.source);assert.equal(c.body.blocks.length,5);assert.equal(c.figures.length,1);assert.deepEqual(c.figures,p.figures);
 const body=structuredClone(p.body);for(const[a,z]of glosses){assert.equal(body.blocks[2].text.split(a).length,2);body.blocks[2].text=body.blocks[2].text.replace(a,a+z);}assert.deepEqual(c.body,body);displayExactSegments(c.body.blocks[2]);
 assert.deepEqual(audit.modelReview,parentRaw.output);const old=parentRaw.output;assert.equal(old.completeArticleCompared,true);assert.equal(old.domOrder.faithful,true);assert.equal(old.issues.length,1);assert.equal(old.issues[0].severity,'error');
 assert.equal(old.issues[0].targetId,TARGET);assert.equal(old.blockChecks.length,5);assert(old.blockChecks.filter(x=>x.id!==TARGET).every(x=>x.verdict==='faithful'));assert.equal(old.figureChecks.length,1);assert(old.figureChecks.every(x=>x.verdict==='faithful'));assert(old.imageChecks.every(x=>x.disposition==='represented'));
 const m=raw.output;assert.equal(raw.callId,'22b90f5e-1807-4b83-87f7-41df5485067d');assert.equal(m.translation.targetId,TARGET);assert.equal(m.translation.verdict,'faithful');assert.equal(m.conclusion,'text-target-faithful');
 assert.equal(m.argumentChecks.length,11);assert(m.argumentChecks.every(x=>x.faithful));assert.equal(m.orderedContextFaithful,true);assert.equal(m.completeRequestedScopeCompared,true);assert.deepEqual(m.issues,[]);
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(m,r.modelReview);assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');assert.deepEqual(raw.requestExecution.images,[]);
 assert.equal(r.call.binding.canonical,r.canonical);assert.equal(r.call.binding.scope,'cn234-b0003-text-only-r1');assert.equal(r.call.binding.textTarget,TARGET);assert.equal(r.call.binding.productionSha256,PIN);
 assert.equal(r.verification.textTargetEvidenceVerified,true);assert.deepEqual(r.verification.errors,[]);assert.equal(r.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);
 assert.equal(r.schema,'coac249-jp193-independent-text-r2/1');assert.equal(side.originalReceiptSchemaLabel,r.schema);assert.equal(side.metadataBindingOnly,true);assert.equal(side.newSemanticVerdict,false);assert.equal(side.originalReceiptAndRawUnchanged,true);
 for(const k of ['canonical','textTarget','candidate','source','parent','parentAudit','raw'])assert.deepEqual(side[k],r[k]);assert.equal(side.callId,raw.callId);assert.equal(side.modelReviewSha256,sha(JSON.stringify(m)));assert.deepEqual(side.actualVerification,r.verification);
 assert.equal(side.originalReceipt.sha256,'d0a8e533bfcd1fc5b48fab3a064e8d674b8cd92111e0b242a2ed2c6fde0b4ba6');
 assert.equal(q.canonical,r.canonical);assert.deepEqual(q.candidate,r.candidate);assert.equal(q.implementationVerified,false);assert.equal(q.admissionGranted,false);assert.deepEqual(q.requiredDisplayLimitations,m.requiredDisplayLimitations);assert.equal(q.requiredDisplayLimitations.length,3);
 const t=q.oldTimeout;assert.equal(t.callId,'ba432ee3-0d28-42b9-ad34-cde09c97313e');assert.equal(t.localInvocations,1);assert.equal(t.reconnectionNotices,2);assert.equal(t.usage,null);assert.equal(t.fee,'unknown');assert.equal(t.upstreamExecutions,'unknown');assert.equal(t.recoverableOutput,false);assert.equal(t.newAttemptIsNewCall,true);assert.equal(t.rawSha256,'0c73fb1bf6957c0cc44f1b2ec5d705f4cd7152c425f311f28168492b62e47734');
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const manifest=await load(new URL('./manifest.json',import.meta.url));
 const bound=async f=>{const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);return f.path.endsWith('.json')?JSON.parse(b):b;};
 for(const f of manifest.files)await bound(f);
 assert.equal(manifest.receipt.sha256,'d0a8e533bfcd1fc5b48fab3a064e8d674b8cd92111e0b242a2ed2c6fde0b4ba6');
 const r=await bound(manifest.receipt),c=await bound(r.candidate),p=await bound(r.parent),raw=await bound(r.raw),pr=await bound(r.parentRaw),a=await bound(r.parentAudit),side=await bound(manifest.sidecar),q=await bound(manifest.proposal),plan=await bound(r.plan);
 await bound(q.oldTimeout.raw);const rt=await bound(r.runtime);assert.equal(rt.files.length,21);for(const f of rt.files)await bound({path:join(dirname(r.runtime.path),f.name),sha256:f.sha256});for(const f of rt.externalDependencies)await bound(f);
 const helper=await import(pathToFileURL(manifest.textModule.path)),actual=await helper.prepare193234TextReview(ROOT,'234');assert.equal(JSON.stringify(actual),JSON.stringify(plan));assert.deepEqual(await helper.verify193234TextReviewExecution(raw,plan),r.verification);
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);
 assertScope(c,p,raw,pr,a,r,side,q);
 return {schema:'coac244-exact-cn234-text-composition/1',status:'verified-exact-cn234-text-evidence',canonical:r.canonical,production:{sha256:PIN},candidate:r.candidate,source:r.source,parent:r.parent,auditPath:manifest.receipt.path,auditSha256:manifest.receipt.sha256,
  independentReceipt:manifest.receipt,raw:r.raw,parentAudit:r.parentAudit,parentRaw:r.parentRaw,metadataBinding:manifest.sidecar,auditScopeRequirements:q.requiredDisplayLimitations,oldTimeout:q.oldTimeout,
  standardWholeArticlePassed:false,admissionGranted:false,newModelCalls:0};
}
