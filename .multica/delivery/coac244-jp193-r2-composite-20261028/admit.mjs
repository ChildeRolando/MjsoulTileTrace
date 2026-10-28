// Exact evidence composition only. Neither original verifier false becomes true.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p)),ROOT='E:/AgentData/Coach/knowledge/processing';
const PIN='f3c960182adb5913b82f22504b703cc8fe6d69561acc8c7f43c19e364184e7d7',PARENT='af8071cfdbaabf8f469f84fa4daa6fd2d7d377c3dc2b277ef766e34a22324ba1';
const textId='modern-yabejp-ja:chapter03-section009:b0081',figureId='modern-yabejp-ja:chapter03-section009:b0080:figure';
export function assertFusion(c,p,priorRaw,raw,history,proposal){
 assert.equal(c.source.sourceSha256,'0eb1e386149771dad7604fd1e13bcf06a81afbe07e2846cdc5cbfc24a9ee9743');assert.deepEqual(c.source,p.source);
 assert.equal(c.body.blocks.length,97);assert.equal(c.figures.length,41);assert.deepEqual(c.figures,p.figures);
 for(let i=0;i<97;i++)if(i!==80)assert.deepEqual(c.body.blocks[i],p.body.blocks[i]);
 const want=structuredClone(p.body.blocks[80]);assert.deepEqual(want.sourceBlockIds,[textId]);
 want.text='面对上图这样的牌河，有人立直时，若排除入り目的情形，就基本可以读出其听牌是';assert.deepEqual(c.body.blocks[80],want);
 assert.equal(raw.callId,'2c4e7f59-a462-4759-87be-30e8632ee206');assert.equal(priorRaw.callId,'45129550-169e-4015-a297-8726ee5cd9c5');
 const m=raw.output,old=priorRaw.output;assert.equal(m.translation.targetId,textId);assert.equal(m.translation.verdict,'faithful');
 assert.equal(m.argumentChecks.length,7);assert(m.argumentChecks.every(x=>x.faithful));assert.equal(m.orderedContextFaithful,true);assert.equal(m.completeRequestedScopeCompared,true);assert.equal(m.conclusion,'text-target-faithful');
 assert.equal(old.orderedContextFaithful,false);assert.equal(old.textRepair.verdict,'needs-repair');assert.equal(old.figureRepair.targetId,figureId);assert.equal(old.figureRepair.verdict,'faithful');
 assert.deepEqual(m.issues,old.issues);assert.equal(m.issues.length,4);assert.deepEqual(m.issues.map(x=>x.severity),['error','uncertain','error','error']);
 assert(m.summary.includes('指父候选'));assert.equal(history.newIssueCount,0);assert.equal(history.allFourIssuesExactlyInherited,true);assert.equal(history.newSemanticVerdict,false);assert.equal(history.admissionGranted,false);
 assert.equal(history.issuesSerializedSha256,sha(JSON.stringify(m.issues)));assert.equal(history.issueBindings.length,4);
 for(let i=0;i<4;i++){assert.equal(history.issueBindings[i].originalIssueSha256,sha(JSON.stringify(old.issues[i])));assert.equal(history.issueBindings[i].currentIssueSha256,sha(JSON.stringify(m.issues[i])));}
 const f=c.figures.find(x=>x.figureId===figureId);assert.equal(sha(JSON.stringify(f)),'8ed2c43562070bce7d31bf4a6ffd2e5028a972147458393472f218de8451f98d');
 assert.equal(f.unknowns.length,4);assert.deepEqual(f.unknowns,old.unknownImpact.map(x=>x.unknownText));
 for(const x of old.unknownImpact)assert(x.positionConfirmed&&x.displayFaithful&&x.authorArgumentFaithfulWithUnknown&&!x.requiresExactValueForAuthorArgument);
 const limits=[...new Set(old.unknownImpact.flatMap(x=>x.requiredDisplayLimitations))];assert.equal(limits.length,7);assert.deepEqual(m.requiredDisplayLimitations,limits);assert.deepEqual(proposal.requiredDisplayLimitations,limits);
 assert.equal(proposal.canonical,'nemata-jp-chapter-193-1');assert.equal(proposal.candidate.sha256,PIN);assert.equal(proposal.implementationVerified,false);assert.equal(proposal.authorBodyInjection,false);assert.equal(proposal.admissionGranted,false);assert.equal(proposal.label,'审校限制（非原文）');
}
export async function verifyLimited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN,'only current jp193 r2 exact SHA');
 const manifest=await load(new URL('./manifest.json',import.meta.url));
 const bound=async f=>{const b=await readFile(f.path);assert.equal(sha(b),f.sha256,f.path);return f.path.endsWith('.json')?JSON.parse(b):b;};
 for(const f of manifest.files)await bound(f);
 assert.equal(manifest.receipt.sha256,'0d908f3ae536e17b12380e7394f26eef64bf75afe2e910aa000797eb24b8f219');
 const r=await bound(manifest.receipt),raw=await bound(r.raw),c=await bound(r.candidate),p=await bound(r.parent),old=await bound(r.parentAudit),priorRaw=await bound(r.parentRaw),history=await bound(manifest.history),proposal=await bound(manifest.proposal),plan=await bound(r.plan);
 assert.equal(r.candidate.sha256,PIN);assert.equal(r.parent.sha256,PARENT);assert.equal(r.parentAudit.sha256,'a70006b0e912a7089bf2ae7cebd3d9e366275ca3e25cc8a3ea1356335b410b6c');
 assert.equal(sha(await readFile(old.candidate.path)),PARENT);assert.deepEqual(old.modelReview,priorRaw.output);
 const rt=await bound(r.runtime);assert.equal(rt.files.length,21);for(const f of rt.files)await bound({path:join(dirname(r.runtime.path),f.name),sha256:f.sha256});for(const f of rt.externalDependencies)await bound(f);
 const oldRt=await bound(old.runtime);assert.equal(oldRt.files.length,32);for(const f of oldRt.files)await bound({path:join(dirname(old.runtime.path),f.name),sha256:f.sha256});
 const newer=await import(pathToFileURL(manifest.textModule.path)),older=await import(pathToFileURL(manifest.visionModule.path));
 const actualPlan=await newer.prepare193234TextReview(ROOT,'193');assert.equal(JSON.stringify(actualPlan),JSON.stringify(plan));
 assert.deepEqual(await newer.verify193234TextReviewExecution(raw,plan),r.verification);assert.equal(r.verification.textTargetEvidenceVerified,false);assert.deepEqual(r.verification.errors,['target_not_accepted']);
 const priorPlan=await bound(old.plan),actualPrior=await older.prepare193213Review(ROOT,'193');assert.equal(JSON.stringify(actualPrior),JSON.stringify(priorPlan));
 assert.deepEqual(await older.verify193213ReviewExecution(priorRaw,priorPlan),old.verification);assert.equal(old.verification.limitedEvidenceVerified,false);
 for(const [receipt,rr,images,model,effort]of [[r,raw,0,'gpt-6.1-sol','high'],[old,priorRaw,2,'gpt-6.1-terra','max']]){
  assert.deepEqual(rr.output,JSON.parse(rr.rawLastMessage));assert.deepEqual(rr.output,receipt.modelReview);assert.equal(rr.model,model);assert.equal(rr.reasoningEffort,effort);assert.equal(rr.requestExecution.images.length,images);
  const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===rr.callId);assert.deepEqual(ledger,[receipt.call]);
  assert.equal(receipt.wholeChapterPassed,false);assert.equal(receipt.admissionGranted,false);
 }
 assertFusion(c,p,priorRaw,raw,history,proposal);
 return {schema:'coac244-exact-jp193-r2-evidence-composition/1',status:'verified-exact-jp193-r2-composite-evidence',key:'jp193',canonical:r.canonical,production:{sha256:PIN},candidate:r.candidate,source:r.source,parent:r.parent,
  auditPath:manifest.receipt.path,auditSha256:manifest.receipt.sha256,independentReceipt:manifest.receipt,raw:r.raw,priorVisionReceipt:r.parentAudit,priorVisionRaw:r.parentRaw,
  originalIssues:old.modelReview.issues,independentIssues:raw.output.issues,originalStrictVerification:old.verification,currentStrictVerification:r.verification,
  ordinaryWholeArticlePassed:false,admissionGranted:false,requiredDisplayLimitations:proposal.requiredDisplayLimitations,
  anchor:{afterSourceBlockId:'modern-yabejp-ja:chapter03-section009:b0080',beforeSourceBlockId:textId},newModelCalls:0};
}
