// Two fixed supplementary scopes. The original strict false is never rewritten.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT='E:/AgentData/Coach/knowledge/processing';
const pins={109:['3cfe3a27bd799782d6ac8e626fcf97d26e1724ce544b6ccf26bcd740bd259dcb','67421d448b13f720947ca5472d7a0dfba1ee95e2f710f79ec1d5e86703baa986','4fe3048c-dbf1-4b52-a4f2-80ab94310477'],167:['5bfa90e3e15deb0c3f868ee1811fe50cdba75357f2805b3c37ed5f1d86538a58','e291ebb02ed244689be9a7060659d4214d267189eb62e868c6747b7db9b027fe','edf73a16-7c1c-44e2-9d22-52d2f3c0e267']};
export const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p));
export function assertScope(key,c,p,old,raw,q,j){
 assert(Object.hasOwn(pins,key));assert.equal(j.canonical,'79-cn-chapter-'+key+'-4');assert.equal(j.candidate.sha256,pins[key][0]);
 assert.deepEqual(c.source,p.source);assert.equal(c.source.sourceSha256,j.source.sha256);assert.deepEqual(c.body,p.body);
 assert.equal(c.body.blocks.length,key==='109'?17:6);assert.equal(c.figures.length,p.figures.length);
 for(let i=0;i<c.figures.length;i++){
  const f=c.figures[i],expected=structuredClone(p.figures[i]),w=j.exactChanges.find(w=>w.path==='/figures/'+i+'/transcription');
  if(w){assert.equal(expected.transcription,w.from);expected.transcription=w.to;expected.provenance=structuredClone(f.provenance);}
  assert.deepEqual(f,expected,'only authorized transcription/provenance differ');
 }
 assert.equal(raw.callId,pins[key][2]);const m=raw.output;
 assert.equal(m.wholeChapterAccepted,false);assert.equal(m.completeTargetScopeCompared,true);assert.equal(m.contextContinuity.faithful,true);
 assert.deepEqual(m.repairChecks.map(x=>x.figureId),j.repairFigureIds);assert(m.repairChecks.every(x=>x.verdict==='faithful'));
 assert.equal(old.status,'needs-repair');assert(old.modelReview.completeArticleCompared&&old.modelReview.domOrder.faithful);
 const allowed=new Set([...j.repairFigureIds,j.unknownFigure]);
 for(const issue of old.modelReview.issues)if(issue.severity!=='source-note')assert(allowed.has(issue.targetId),'no unreviewed inherited issue');
 for(const x of old.modelReview.blockChecks)if(!allowed.has((x.id??x.blockId)+':figure'))assert.equal(x.verdict,'faithful');
 for(const x of old.modelReview.figureChecks)if(!allowed.has(x.id??x.figureId))assert.equal(x.verdict,'faithful');
 assert.equal(m.issues.length,1);assert.equal(m.issues[0].severity,'uncertain');assert.equal(m.issues[0].targetId,j.unknownFigure);
 const f=c.figures.find(f=>f.figureId===j.unknownFigure);assert(f);
 assert.equal(sha(JSON.stringify(f)),j.fullFigureSha256);assert.deepEqual(f.unknowns,j.unknowns);
 assert.equal(f.unknowns.length,key==='109'?3:1);assert.equal(m.unknownImpacts.length,f.unknowns.length);
 for(const u of f.unknowns){
  const rows=m.unknownImpacts.filter(x=>x.figureId===f.figureId&&x.unknownText===u);assert.equal(rows.length,1);
  const row=rows[0];assert.equal(row.faithfulWithExplicitUnknown,true);assert.equal(row.requiresExactTile,false);assert(row.authorClaim&&row.evidence);
  assert.deepEqual(row.sourceBlockIds,j.impactSourceBlockIds);assert(row.requiredDisplayLimitations.length>0);
 }
 assert.equal(q.canonical,j.canonical);assert.equal(q.candidate.sha256,pins[key][0]);assert.equal(q.figureBindings.length,1);
 const b=q.figureBindings[0];assert.equal(b.figureId,f.figureId);assert.equal(b.fullFigureSha256,j.fullFigureSha256);
 for(const k of ['unknowns','sourceBlockIds','sourceNotes'])assert.deepEqual(b[k],f[k]);
 assert.deepEqual(q.requiredDisplayLimitations,[...new Set(m.unknownImpacts.flatMap(x=>x.requiredDisplayLimitations))]);
 assert.deepEqual(q.requiredDisplayLimitations,j.limits);assert.equal(j.limits.length,key==='109'?6:3);
 for(const k of ['implementationVerified','authorBodyInjection','admissionGranted','wholeChapterPassed'])assert.equal(q[k],false);
 assert.equal(q.proposalOnly,true);assert.equal(q.label,'审校限制（非原文）');
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));const pin=sha(await readFile(candidatePath)),key=Object.keys(pins).find(k=>pins[k][0]===pin);assert(key,'only exact two candidate SHAs');
 const manifest=await load(new URL('./manifest.json',import.meta.url));
 const bound=async b=>{const bytes=await readFile(b.path);assert.equal(sha(bytes),b.sha256,b.path);return b.path.endsWith('.json')?JSON.parse(bytes):bytes;};
 for(const b of manifest.files)await bound(b);
 const contract=await bound(manifest.contract),j=contract.jobs[key];assert.equal(j.receipt.sha256,pins[key][1]);
 const r=await bound(j.receipt),raw=await bound(r.raw),plan=await bound(r.plan),c=await bound(r.candidate),p=await bound(r.parent),old=await bound(r.parentAudit),q=await bound(j.proposal);
 assert.equal(resolve(r.candidate.path),resolve(candidatePath));assert.equal(r.canonical,j.canonical);
 for(const k of ['source','parent','parentAudit'])assert.equal(r[k].sha256,j[k].sha256);
 const rt=await bound(r.runtime);assert.equal(rt.files.length,30);for(const f of rt.files)await bound(f);
 const pair=await import(pathToFileURL(manifest.reviewModule.path));
 const actualPlan=await pair.prepareReview(key,r.candidate.path,r.runtime.sha256);assert.deepEqual(actualPlan,plan);
 const v=await pair.verifyReviewExecution(key,raw,plan,r.runtime.sha256);assert.deepEqual(v,r.verification);
 assert.equal(v.transportCompleted,true);assert.equal(v.repairPassed,true);assert.equal(v.limitedUnknownOkay,false);assert.equal(v.wholeChapterAccepted,false);assert.equal(r.verificationError,null);
 // The raw contains positive contribution-specific permission, but the original verifier
 // also requires zero non-source-note issues. Preserve its false and the uncertain issue.
 assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.deepEqual(raw.output,r.modelReview);
 assert.equal(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);
 assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,key==='109'?3:1);
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===pins[key][2]);assert.deepEqual(ledger,[r.call]);
 assertScope(key,c,p,old,raw,q,j);assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);
 return {schema:'coac244-exact109167-limited-display/1',status:'admitted-exact109167-editorial-display',key,canonical:j.canonical,
  production:{sha256:pin},candidate:r.candidate,source:r.source,parent:r.parent,auditPath:j.receipt.path,auditSha256:j.receipt.sha256,
  independentReceipt:j.receipt,raw:r.raw,originalIssues:old.modelReview.issues,independentIssues:raw.output.issues,
  originalStrictVerification:r.verification,ordinaryWholeArticlePassed:false,requiredDisplayLimitations:q.requiredDisplayLimitations,
  anchor:j.anchor,unknownFigure:j.unknownFigure,fullFigureSha256:j.fullFigureSha256,newModelCalls:0};
}
