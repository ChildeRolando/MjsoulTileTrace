// Exact 232 intake only. No invocation, model output, staging or admission writer.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verify, inputs, validateDerived, request} from 'file:///E:/AgentData/Coach/knowledge/processing/integration/coac244-human-final-20261028/entry.mjs';
export const R='E:/AgentData/Coach/knowledge/processing';
export const D=R+'/integration/coac244-human-final-20261028';
export const OWNER='01a17471-0529-7d3d-bd8d-8b54ef38290d';
export const CANONICAL='nemata-jp-chapter-232-1';
export const SHA='93fdd682bea663f000059057925e39c226c682507b9299eb9c9312a611a6c18c';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const objectSha=x=>sha(JSON.stringify(x));
export const load=async p=>JSON.parse(await readFile(p));
const pins={
 'integration/coac244-human-final-20261028/candidates/232.human-final.v2.json':SHA,
 'integration/coac249-232-target-impact-reviewed-20261028.json':'5ed3b5117151b9cf5555d223d714131c5593f1f9042c6e91a9bb005a68fbb9ea',
 'integration/coac249-232-scope-inheritance-20261028.json':'5b951df43fbd4becb26d5d3767641cf5ae68db2f71875acf89d1d6668bb50324',
 'integration/coac249-232-display-and-residual-20261028.json':'ec96eb728673aedb18fbaf9c8a801c7eb99b692690545311959577fddbc9071c',
 'audit/calls/0dae5b1a-76be-45d5-b2f0-410bc5853cb3.json':'426d49b11f72317b32fdf1b6b7a14ba6308ec8db9da9ae7706079933304eea3c'
};
export function validateMapping(mapping,expected){
 assert.deepEqual(mapping,expected,'exact 232 application/limitation map only');
 assert.equal(mapping.admissionGranted,false);
 assert.equal(mapping.semanticReviewAuthorized,false);
}
export function validateRequest(req,expected,payload,context){
 assert.deepEqual(req,expected,'prepared request transport changed');
 assert.equal(req.model,'gpt-6.1-sol');assert.equal(req.reasoningEffort,'high');assert.deepEqual(req.images,[]);
 assert.equal(payload.scope,'232');
 assert.deepEqual(payload.sourceBlocksInOriginalOrder,context.source.blocks);
 assert.deepEqual(payload.candidateBodyInVisualOrder,context.candidate.body.blocks);
 assert.deepEqual(payload.allCurrentFiguresInOrder,context.candidate.figures);
 assert.equal(payload.currentCandidate.sha256,SHA);
}
export async function inspect(){
 const checked=[];
 for(const[path,expected]of Object.entries(pins)){const b=await readFile(R+'/'+path);assert.equal(sha(b),expected,path);checked.push({path,sha256:expected,bytes:b.length});}
 const v=await verify('232',OWNER),ctx=await inputs('232',OWNER),c=await load(v.candidate.path);
 assert.equal(v.canonical,CANONICAL);assert.equal(v.candidate.sha256,SHA);
 validateDerived('232',c,ctx);assert.equal(v.requiresIndependentApplicationArgumentReview,true);
 const receipt=await load(R+'/integration/coac249-232-target-impact-reviewed-20261028.json');
 const proof=await load(R+'/integration/coac249-232-scope-inheritance-20261028.json');
 const raw=await load(receipt.raw.path),review=receipt.modelReview;
 assert(raw.success&&raw.exitCode===0&&!raw.timedOut);
 assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,review);
 assert.deepEqual(receipt.verification.modelReview,review);
 assert.equal(raw.binding.productionSha256,v.parent.sha256);
 assert.equal(raw.binding.sourceFileSha256,ctx.plan.source.sha256);
 assert.equal(raw.binding.canonical,CANONICAL);
 assert.equal(receipt.verification.repairPassed,false);assert.equal(receipt.verification.limitedUnknownOkay,false);
 assert.equal(receipt.verification.wholeChapterAccepted,false);
 assert.equal(proof.fullSourceCandidatePairingExact,true);
 const ledger=(await readFile(R+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);
 assert.equal(ledger.filter(x=>x.callId===receipt.call.callId).length,1);
 for(const binding of [receipt.source,receipt.parent,receipt.parentAudit,receipt.runtime,receipt.handoff,receipt.productionProof.raw,receipt.plan]){
  assert.equal(sha(await readFile(binding.path)),binding.sha256,binding.path);
  checked.push({path:binding.path,sha256:binding.sha256});
 }
 const grandparent=await load(receipt.parent.path),parent=ctx.parent;
 // The actual original review verifies these three repairs; no new semantic verdict is created here.
 assert.deepEqual(review.targetChecks.slice(0,2).map(x=>x.verdict),['faithful','faithful']);
 assert.equal(review.targetChecks[2].verdict,'uncertain');
 assert.equal(review.contextContinuity.verdict,'faithful');
 const changedBody=parent.body.blocks.flatMap((b,i)=>objectSha(b)===objectSha(grandparent.body.blocks[i])?[]:[i]);
 assert.deepEqual(changedBody,[1,3]);
 assert.equal(parent.figures.length,3);assert.equal(c.figures.length,3);
 assert.deepEqual(parent.figures.slice(1),grandparent.figures.slice(1));
 const repaired=structuredClone(parent.figures[0]);
 repaired.transcription=repaired.transcription.replace('4p 4p 3s 4s','4p 4p 2s 4s');
 assert.equal(repaired.provenance.callId,'3002a835-2cff-4bcf-b07b-2b03d1968e5b');
 assert.equal(grandparent.figures[0].provenance.callId,'aab4b6c9-c6c6-40e2-9d6e-33ac10c3ed4a');
 repaired.provenance.callId=grandparent.figures[0].provenance.callId;
 assert.deepEqual(repaired,grandparent.figures[0],'parent figure changes only 3s and its real producing-call provenance');
 const f=c.figures[0];assert.deepEqual(f.unknowns,parent.figures[0].unknowns.slice(1));
 assert.equal(f.unknowns.length,2);
 const impacts=review.unknownImpacts;
 assert.equal(impacts[0].disposition,'blocking');
 assert.deepEqual(impacts.slice(1).map(x=>x.disposition),['nonblocking-with-limits','nonblocking-with-limits']);
 const limitations=impacts.slice(1).flatMap(x=>x.requiredDisplayLimitations);
 assert.equal(limitations.length,4);
 const mapping={schema:'coac248-232-human-application-map/1',canonical:CANONICAL,
  candidate:v.candidate,parent:v.parent,source:ctx.plan.source,
  acceptedHumanFact:v.humanFacts[0],contentDiffFields:v.contentDiffFields,
  independentParentReceipt:{path:receipt.raw.path,sha256:receipt.raw.sha256,callId:receipt.call.callId},
  bodyObjectSha256:objectSha(c.body),figureObjectSha256:objectSha(f),
  orderedContext:c.body.blocks.map((b,i)=>({position:i,sourceBlockIds:b.sourceBlockIds,sha256:objectSha(b)})),
  inheritedTargets:review.targetChecks.slice(0,2).map(x=>({id:x.id,verdict:x.verdict,evidenceSha256:objectSha(x)})),
  inherited3sEvidence:{reviewTargetId:review.targetChecks[2].id,verdictPreserved:'uncertain',evidenceSha256:objectSha(review.targetChecks[2]),specific3sFaithfulInOriginalEvidence:true},
  remainingUnknowns:impacts.slice(1).map((x,i)=>({path:'/figures/0/unknowns/'+i,text:x.unknownText,disposition:x.disposition,independentImpactSha256:objectSha(x),sourceBlockIds:x.sourceBlockIds})),
  displayProposal:{label:'审校限制（非原文）',anchor:{afterSourceBlock:'modern-yabejp-ja:chapter04-section012:b0005',beforeSourceBlock:'modern-yabejp-ja:chapter04-section012:b0006',figureSha256:objectSha(f)},notes:limitations,installed:false,actualReadbackRequired:true},
  resolvedTileHistoricalLimits:{independentImpactSha256:objectSha(impacts[0]),originalDisposition:'blocking',originalRequiredDisplayLimitations:impacts[0].requiredDisplayLimitations,preserved:true,newFactIsHuman9m:true,oldUnknownTextMustNotBeInstalledAsCurrentFact:true,applicationArgumentReviewRequired:true},
  originalFalseAndIssues:{verificationSha256:objectSha(receipt.verification),issuesSha256:objectSha(review.issues),modified:false},
  semanticReviewAuthorized:false,admissionGranted:false,wholeChapterPassed:false,newModelCalls:0};
 const req=await load(D+'/request-232.json'),expected=await request('232',OWNER),payload=JSON.parse(req.prompt.slice(req.prompt.indexOf('\n')+1));
 validateRequest(req,expected,payload,{source:ctx.source,candidate:c});
 const report={schema:'coac248-232-zero-call-intake/1',canonical:CANONICAL,candidate:v.candidate,parent:v.parent,source:ctx.plan.source,
  deterministicApplicationVerified:true,sourcePositions:14,bodyPositions:14,figures:3,unchangedAuthorBody:true,
  unchangedNonTargetFigures:2,remainingUnknowns:2,knownPublicTiles:v.counts.after.knownTiles,overFour:v.counts.after.overFour,
  latestHumanEvent:v.humanFacts[0],rawIndependentReviewVerified:true,originalVerification:receipt.verification,
  bindings:checked,applicationMapSha256:objectSha(mapping),
  preparedRequest:{path:D+'/request-232.json',sha256:sha(await readFile(D+'/request-232.json')),promptSha256:sha(req.prompt),schemaSha256:objectSha(req.schema),model:req.model,reasoningEffort:req.reasoningEffort,images:[],dispatched:false,authorized:false},
  minimumGap:'人工9m已确定且机械应用正确；尚缺按既有提案安排的唯一纯文字应用/论证独立复核，随后组合原父审、四条剩余unknown展示限制的安装验证与250实际读回。不得把原blocking或false由主控改pass。',
  newModelCalls:0,newProductionCalls:0,modelProduced:false,admissionGranted:false,wholeChapterPassed:false,readbackCompleted:false};
 // Keep raw/body/images and full human exports at their existing shared paths; this report is metadata only.
 delete report.originalVerification.modelReview;
 return {report,mapping,ctx,c,req,expected,payload};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const {report}=await inspect();console.log(JSON.stringify(report));
}
