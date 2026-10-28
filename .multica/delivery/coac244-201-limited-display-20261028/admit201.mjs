// Only exact201 independent evidence. No model invocation and no ordinary pass override.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT='E:/AgentData/Coach/knowledge/processing',PIN='de5da8288a2af771e2eb3a421d2460d31e3024b6591679d9661f2c55b522da77';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p));
export const exact201={canonical:'79-cn-chapter-201-6',parent:'52cf8e02d3418e6587acd964a6b784bc51badc1d4a0d15c3229da24822eb89d8',source:'fafa213e1995f8bc2ff6f8b12ee421a9e3d5212e537ee726ac5c8a4bfec398cb',audit:'0d15827cbe532a21534b80263177db5768484007d240c6d7a6af4c24aaf24911',candidate:PIN,figure:'79-bilibili-cn:cv1770179:b0005:figure',figureHash:'03ef8146c401257365b544f6b037f055acd80c6c3a11a15a12d5bd5e83e92fdc',call:'47cad59c-6a7b-41a6-9ae5-9a977e9d34b7'};
export function assert201Scope(c,parent,old,raw,proposal){
 assert.equal(c.source.sourceSha256,exact201.source);assert.deepEqual(c.source,parent.source);
 assert.equal(c.body.blocks.length,7);assert.equal(c.figures.length,1);assert.deepEqual(c.figures,parent.figures);
 for(let i=0;i<7;i++)if(i!==5)assert.deepEqual(c.body.blocks[i],parent.body.blocks[i]);
 const expected=structuredClone(parent.body.blocks[5]);
 assert.equal(expected.text.split('日本がアメリカに戦争を挑むくらい無謀でしょう。').length,2);
 expected.text=expected.text.replace('日本がアメリカに戦争を挑むくらい無謀でしょう。','日本がアメリカに戦争を挑むくらい無謀でしょう。（恐怕就像日本向美国挑起战争一样鲁莽吧。）');
 assert.deepEqual(c.body.blocks[5],expected);
 assert.equal(old.status,'needs-repair');assert(old.modelReview.completeArticleCompared&&old.modelReview.domOrder.faithful);
 for(const x of old.modelReview.blockChecks)if(!['79-bilibili-cn:cv1770179:b0005','79-bilibili-cn:cv1770179:b0006'].includes(x.id))assert.equal(x.verdict,'faithful');
 for(const i of old.modelReview.issues)if(i.severity!=='source-note')assert(['79-bilibili-cn:cv1770179:b0006',exact201.figure].includes(i.targetId));
 const r=raw.output;assert.equal(raw.callId,exact201.call);assert.equal(r.translation.targetId,'79-bilibili-cn:cv1770179:b0006');assert.equal(r.translation.verdict,'faithful');
 assert.equal(r.carriedIssue.targetId,exact201.figure);assert(r.carriedIssue.positionConfirmed&&r.carriedIssue.currentDisplayFaithful&&r.carriedIssue.authorArgumentFaithfulWithCurrentLimitation);
 assert.equal(r.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument,false);assert(r.argumentChecks.every(x=>x.faithfulWithCurrentLimitation===true));
 assert.equal(r.conclusion,'target-faithful-limited-display-acceptable');
 assert.equal(r.issues.length,2);assert.equal(r.issues[0].severity,'uncertain');assert.equal(r.issues[0].targetId,exact201.figure);assert.equal(r.issues[1].severity,'source-note');
 assert.equal(proposal.candidate.sha256,PIN);assert.equal(proposal.proposalOnly,true);assert.equal(proposal.implementationVerified,false);assert.equal(proposal.authorBodyInjection,false);
 assert.equal(proposal.admissionGranted,false);assert.equal(proposal.wholeChapterPassed,false);assert.equal(proposal.label,'审校限制（非原文）');
 assert.equal(proposal.figureBindings.length,1);const f=c.figures[0],b=proposal.figureBindings[0];
 assert.equal(f.figureId,exact201.figure);assert.equal(sha(JSON.stringify(f)),exact201.figureHash);assert.equal(b.fullFigureSha256,exact201.figureHash);
 for(const k of ['unknowns','sourceBlockIds','sourceNotes'])assert.deepEqual(f[k],b[k]);assert.equal(f.unknowns.length,1);assert(f.transcription.includes('?m'));
 assert.deepEqual(proposal.requiredDisplayLimitations,r.carriedIssue.requiredDisplayLimitations);assert.equal(proposal.requiredDisplayLimitations.length,5);
 assert.equal(proposal.requiredDisplayLimitations[0],'以下限制是审校补充说明，并非原文内容。');
}
export async function verify201Limited(root,candidatePath){
 assert.equal(resolve(root),resolve(ROOT));assert.equal(sha(await readFile(candidatePath)),PIN);
 const manifest=await load(new URL('./manifest.json',import.meta.url));
 const bound=async b=>{const bytes=await readFile(b.path);assert.equal(sha(bytes),b.sha256,b.path);return b.path.endsWith('.json')?JSON.parse(bytes):bytes;};
 for(const b of manifest.files)await bound(b);
 const r=await bound(manifest.receipt),raw=await bound(r.raw),plan=await bound(r.plan),c=await bound(r.candidate),p=await bound(r.parent),old=await bound(r.parentAudit),proposal=await bound(manifest.proposal),inheritance=await bound(manifest.inheritance);
 assert.equal(r.candidate.sha256,PIN);assert.equal(r.parent.sha256,exact201.parent);assert.equal(r.source.sha256,exact201.source);assert.equal(r.parentAudit.sha256,exact201.audit);
 const runtime=await bound(r.runtime);assert.equal(runtime.files.length,19);
 for(const f of runtime.files)await bound({path:resolve(r.runtime.path,'..',f.name),sha256:f.sha256});
 const module=await import(pathToFileURL(manifest.reviewModule.path));
 const actualPlan=await module.prepare182201Review(ROOT,'cv1770179');assert.deepEqual(actualPlan,plan);assert.deepEqual(await module.verify182201ReviewExecution(raw,plan),r.verification);
 assert.equal(r.verification.limitedEvidenceVerified,true);assert.deepEqual(r.verification.errors,[]);assert.equal(r.verificationError,null);
 assert.equal(raw.model,'gpt-6.1-terra');assert.equal(raw.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,2);assert.equal(plan.projection.orderedSourceCandidateFigurePairs.length,7);
 assert.deepEqual(JSON.parse(raw.rawLastMessage),raw.output);assert.deepEqual(raw.output,r.modelReview);assert.equal(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);
 const ledger=(await readFile(ROOT+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===exact201.call);assert.deepEqual(ledger,[r.call]);
 assert.equal(r.admissionGranted,false);assert.equal(r.wholeChapterPassed,false);assert.equal(proposal.actualReadbackRequired,true);
 assert201Scope(c,p,old,raw,proposal);assert.equal(inheritance.admissionGranted,false);
 const contract=await bound(manifest.contract);assert.equal(contract.candidate.sha256,PIN);assert.equal(contract.ordinaryWholeArticlePassed,false);assert.equal(contract.scope,'exact201-translation-and-unknown-impact-with-five-editorial-limits');
 return {schema:'coac244-exact201-limited-display/1',status:'admitted-exact201-five-limit-display',production:{sha256:PIN},auditPath:manifest.receipt.path,auditSha256:manifest.receipt.sha256,
  canonical:exact201.canonical,candidate:r.candidate,source:r.source,parent:r.parent,independentReceipt:manifest.receipt,raw:r.raw,proposal,
  originalIssues:old.modelReview.issues,independentIssues:raw.output.issues,originalModelChecks:old.modelChecks,
  ordinaryWholeArticlePassed:false,requiredDisplayLimitations:proposal.requiredDisplayLimitations,newModelCalls:0};
}
