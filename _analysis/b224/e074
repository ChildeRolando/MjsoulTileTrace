// One fixed 224 scope, using the original production/review verifiers without model invocation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const ROOT='E:/AgentData/Coach/knowledge/processing',PIN='c38fbdd237d21b3f3d0093ebc0ebb06c0223cfe34b3953a3b61506041cc9291a';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p));
export const series=['流局率','放铳率','和牌中自摸所占比例','立直棒被没收率','和牌率','被他家自摸率','和牌时一发比例'];
export function table(figure){return series.map(name=>{const lines=figure.transcription.split(/\r?\n/).filter(s=>s.startsWith(name+'：'));assert.equal(lines.length,1);const v=lines[0].slice(name.length+1).replace(/。$/,'').split(',');assert.equal(v.length,15);assert(v.every(x=>x==='unknown'||/^约\d+$/.test(x)));return {series:name,values:v};});}
export function assertScope(c,p,raw,oldRaw,r,q,proof){
 assert.equal(r.canonical,'nemata-jp-chapter-224-1');assert.equal(r.candidate.sha256,PIN);assert.equal(r.source.sha256,'8a77c2035e209cf221d497a9965bc8fdb5a264875c5b3837eb98304e88ee080a');assert.equal(r.parent.sha256,'82c282e5546ed39278a878cb160ef5ef7645d0190fded81d5b21fd5f5a3b01ea');
 assert.deepEqual(c.body,p.body);assert.equal(c.body.blocks.length,15);assert.deepEqual(c.source,p.source);assert.equal(c.figures.length,1);
 const cf=structuredClone(c.figures[0]),pf=structuredClone(p.figures[0]);for(const f of[cf,pf]){delete f.transcription;delete f.provenance;}assert.deepEqual(cf,pf);assert.equal(cf.unknowns.length,2);
 const old=table(p.figures[0]),now=table(c.figures[0]),diff=[];for(let i=0;i<7;i++)for(let t=0;t<15;t++)if(old[i].values[t]!==now[i].values[t])diff.push({row:i,turn:t+1,before:old[i].values[t],after:now[i].values[t]});
 assert.deepEqual(diff,[[1,6,16],[1,7,16],[2,6,49],[3,12,21],[6,6,16],[6,7,17],[6,12,22]].map(([row,turn,n])=>({row,turn,before:'unknown',after:'约'+n})));
 assert.equal(now.flatMap(x=>x.values).filter(x=>x==='unknown').length,17);assert.equal(now.flatMap(x=>x.values).filter(x=>x!=='unknown').length,88);
 assert.deepEqual(q.remainingUnknownCellIds,now.flatMap(r=>r.values.flatMap((v,i)=>v==='unknown'?[{series:r.series,turn:i+1}]:[])));
 assert.equal(proof.unchangedBodyBlocks,15);assert.equal(proof.unchangedExistingReadings,81);assert.equal(proof.retainedOtherUnknownCells,17);assert.equal(proof.changedCells.length,7);
 assert.equal(raw.callId,'6dd562f2-2025-47b3-a48d-e8c6e5fdd12b');assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);
 const m=raw.output;assert.equal(m.cellChecks.length,7);assert.deepEqual(m.cellChecks.map(x=>x.cellId),proof.changedCells.map(x=>x.id));assert(m.cellChecks.every(x=>x.verdict==='faithful'));assert.equal(m.contextContinuity.verdict,'faithful');assert.equal(m.completeRequestedScopeCompared,true);
 assert.equal(m.unknownImpacts.length,3);assert(m.unknownImpacts.every(x=>x.disposition==='nonblocking-with-limits'&&x.requiredDisplayLimitations.length));assert.equal(m.issues.length,1);assert.equal(m.issues[0].severity,'source-note');
 const limits=[...new Set(m.unknownImpacts.flatMap(x=>x.requiredDisplayLimitations))];assert.equal(limits.length,10);assert.deepEqual(q.requiredDisplayLimitations,limits);assert.equal(q.canonical,r.canonical);assert.deepEqual(q.candidate,r.candidate);assert.equal(q.authorBodyInjection,false);assert.equal(q.implementationVerified,false);assert.equal(q.admissionGranted,false);
 assert.equal(r.verification.repairPassed,true);assert.equal(r.verification.limitedUnknownOkay,true);assert.equal(r.verification.wholeChapterPassed,false);assert.equal(r.wholeChapterPassed,false);assert.equal(r.admissionGranted,false);
 assert.equal(oldRaw.callId,'7d1efbaa-589f-4b2e-9199-28f7141f890b');assert(oldRaw.output.issues.some(x=>x.severity==='error'));assert(oldRaw.output.issues.some(x=>x.severity==='source-note'));
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const m=await load(new URL('./manifest.json',import.meta.url));const bound=async f=>{const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);return f.path.endsWith('.json')?JSON.parse(b):b;};for(const f of m.files)await bound(f);
 assert.equal(m.receipt.sha256,'3b9bab561f2ea1c0450156ef1135e879471c503cc8ff1a3e709d981188c79e2e');assert.equal(m.proposal.sha256,'e64d2e9ca2a6996adfb4ef676edbf2f4f4f27e6ab469812ca3e14a751e3e2257');
 const r=await bound(m.receipt),c=await bound(r.candidate),p=await bound(r.parent),raw=await bound(r.raw),old=await bound(r.parentAudit),oldRaw=await bound(r.parentRaw),q=await bound(m.proposal),rt=await bound(r.runtime),plan=await bound(r.plan);
 assert.equal(rt.files.length,35);for(const f of rt.files)await bound(f);assert.deepEqual(oldRaw.output,old.modelReview);assert.equal(old.verification.repairPassed,false);assert.equal(old.verification.limitedUnknownOkay,false);
 const seven=await import(pathToFileURL(m.sevenModule.path));const proof=await seven.verifyProduction(r.candidate.path,r.runtime.sha256);assert.deepEqual(proof,r.productionProof);assert.equal(JSON.stringify(await seven.prepareReview(r.candidate.path,r.runtime.sha256)),JSON.stringify(plan));assert.deepEqual(await seven.verifyReviewExecution(raw,plan,r.runtime.sha256),r.verification);
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.deepEqual(ledger,[r.call]);assertScope(c,p,raw,oldRaw,r,q,proof);
 return {schema:'coac244-exact224-seven-limited-display/1',status:'verified-exact224-seven-limited-display',key:'224',canonical:r.canonical,production:{sha256:PIN},candidate:r.candidate,source:r.source,parent:r.parent,
  auditPath:m.receipt.path,auditSha256:m.receipt.sha256,independentReceipt:m.receipt,raw:r.raw,parentAudit:r.parentAudit,parentRaw:r.parentRaw,
  requiredDisplayLimitations:q.requiredDisplayLimitations,remainingUnknownCellIds:q.remainingUnknownCellIds,originalIssues:old.modelReview.issues,independentIssues:raw.output.issues,originalStrictVerification:old.verification,currentStrictVerification:r.verification,
  anchor:{beforeSourceBlockId:'modern-yabejp-ja:chapter04-section005:b0013',followingSourceBlockId:'modern-yabejp-ja:chapter04-section005:b0014'},ordinaryWholeArticlePassed:false,globalAdmissionGranted:false,newModelCalls:0};
}
