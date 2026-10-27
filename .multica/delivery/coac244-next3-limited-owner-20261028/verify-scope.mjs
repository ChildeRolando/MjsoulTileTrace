// Zero-model proof of the only original review findings supplemented by existing independent evidence.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=import.meta.dirname,sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const load=async p=>JSON.parse(await readFile(p));
export function validateScopedOriginalFindings(key,{pin,candidate,source,old,review,projection,current}){
 assert.equal(current.candidate.sha256,pin.candidate.sha256);assert.equal(current.canonical,pin.canonical);
 assert(same(candidate.body,pin.expectedBody)&&same(candidate.figures,pin.expectedFigures)&&same(source.blocks,pin.expectedSourceBlocks),'current content changed');
 assert(same(old.modelReview,pin.expectedOriginalReview),'original findings changed');
 assert(same(projection.candidateBody,candidate.body)&&same(projection.candidateFigures,candidate.figures)&&same(projection.sourceBlocks??projection.sourceContext,source.blocks),'request scope changed');
 assert.equal(review.conclusion,'limited-unknown-acceptable');assert.equal(review.canonical,pin.canonical);assert.equal(review.candidateSha256,pin.candidate.sha256);
 assert(same(review.requiredDisplayLimitations,current.mandatoryDisplayLimits));assert.equal(sha(JSON.stringify(current.mandatoryDisplayLimits)),current.mandatoryDisplayLimitsSha256);
 assert.equal(review.pointChecks.length,key==='193'?1:4);assert.equal(current.pointBindings.length,review.pointChecks.length);
 for(const p of review.pointChecks){assert.equal(p.reading,'unknown');assert.equal(p.tileCodeOrUnknown,'unknown');const b=current.pointBindings.find(b=>b.independentPoint.pointId===p.pointId);assert(b&&same(b.independentPoint,p));const f=candidate.figures.find(f=>f.figureId===p.figureId);assert(f&&same(f.unknowns,b.unknowns)&&f.transcription===b.transcription&&same(f.sourceAssetBindings,b.sourceAssetBindings));assert.equal(sha(JSON.stringify(f)),b.fullFigureJsonSha256);}
 assert.equal(review.contributionChecks.length,current.propositions.length);let sourceFragment=0;
 for(const [i,m]of review.contributionChecks.entries()){
  assert(same(m,current.propositions[i].independentStatement));assert.equal(m.requiresExactPointForAuthorArgument,'no');
  if(m.faithfulWithCurrentExplicitUnknown!=='yes'){
   assert.equal(key,'193');assert.equal(m.faithfulWithCurrentExplicitUnknown,'uncertain');
   assert(same(m.sourceBlockIds,[8,9,15,16].map(n=>`79-bilibili-cn:cv1765377:b${String(n).padStart(4,'0')}`)));sourceFragment++;
  }
 }
 assert.equal(sourceFragment,key==='193'?1:0);assert.equal(old.modelReview.domOrder.faithful,true);
 const supplemental=new Set(projection.targetFigureIds),blocks=new Set([...supplemental].map(id=>id.replace(/:figure$/,'')));
 if(key==='193')for(const n of [8,9,15,16])blocks.add(`79-bilibili-cn:cv1765377:b${String(n).padStart(4,'0')}`);
 if(key==='276')for(const n of [14,25]){const b=`79-bilibili-cn:cv1793434:b${String(n).padStart(4,'0')}`;blocks.add(b);supplemental.add(b+':figure');}
 assert.equal(old.modelReview.blockChecks.length,source.blocks.length);assert.equal(new Set(old.modelReview.blockChecks.map(x=>x.id)).size,source.blocks.length);
 assert.equal(old.modelReview.figureChecks.length,candidate.figures.length);
 for(const c of old.modelReview.blockChecks)if(!blocks.has(c.id))assert.equal(c.verdict,'faithful');
 for(const f of old.modelReview.figureChecks)if(!supplemental.has(f.id))assert.equal(f.verdict,'faithful');
 for(const i of old.modelReview.issues)if(i.severity!=='source-note')assert(supplemental.has(i.targetId)||blocks.has(i.targetId));
 //193 image occurrence i00003 is the SAME b0042 target, not an extra unread image.
 const uncertainImages=old.modelReview.imageChecks.filter(x=>x.disposition!=='represented');
 if(key==='193')assert(same(uncertainImages.map(x=>[x.id,x.disposition]),[['79-bilibili-cn:cv1765377:i00003','uncertain']]));
 else assert.equal(uncertainImages.length,0);
 for(const image of uncertainImages){const target=source.blocks.find(b=>projection.targetFigureIds.includes(b.id+':figure'));assert(target&&JSON.stringify(target).includes(image.id),'uncertain image not same target occurrence');}
 return {key,canonical:pin.canonical,status:'exact-original-findings-supplemented-for-limited-author-fidelity',unknownPoints:review.pointChecks.length,sourceFragmentsStillUncertain:sourceFragment,originalReviewUnchanged:true,ordinaryPassed:false,admissionGranted:false,modelCalls:0};
}
export async function verifyScope(key){
 const pins=await load(base+'/pins.json'),pin=pins[key];assert(pin,'not authorized');
 const bound=async r=>{const b=await readFile(r.path);assert.equal(sha(b),r.sha256,r.path);return JSON.parse(b);};
 const [candidate,source,old,raw,receipt,request,current]=await Promise.all(['candidate','source','oldAudit','raw','receipt','request','binding'].map(n=>bound(pin[n])));
 assert(same(raw.output,JSON.parse(raw.rawLastMessage))&&same(raw.output,receipt.modelReview));assert.equal(raw.callId,current.actualCallId);assert.equal(raw.success,true);assert.equal(raw.exitCode,0);assert.equal(raw.timedOut,false);assert.equal(raw.outputOverflow,false);assert.equal(raw.events.at(-1).type,'turn.completed');
 assert.equal(raw.binding.productionSha256,pin.candidate.sha256);assert.equal(raw.binding.sourceFileSha256,pin.source.sha256);assert.equal(raw.binding.originalAuditSha256,pin.oldAudit.sha256);assert.equal(raw.binding.requestSha256,pin.request.sha256);
 assert.equal(raw.prompt,request.prompt);assert(same(raw.schema,request.schema));assert.equal(sha(raw.prompt),raw.semanticPromptSha256);assert.equal(sha(JSON.stringify(raw.schema)),raw.schemaSha256);assert.equal(sha(raw.requestPrompt),raw.requestPromptSha256);
 assert.equal(raw.requestExecution.model,'gpt-6.1-terra');assert.equal(raw.requestExecution.reasoningEffort,'max');assert.equal(raw.requestExecution.images.length,{'193':3,'208':9,'276':7}[key]);assert(same(raw.requestExecution.images.map(x=>x.path),request.images));
 for(const image of raw.requestExecution.images){const b=await readFile(image.path);assert.equal(sha(b),image.sha256);assert.equal(b.length,image.bytes);}
 const projection=JSON.parse(request.prompt.slice(request.prompt.indexOf('{')));
 return {proof:validateScopedOriginalFindings(key,{pin,candidate,source,old,review:raw.output,projection,current}),inputs:{pin,candidate,source,old,review:raw.output,projection,current},rawCall:{callId:raw.callId,model:raw.requestExecution.model,effort:raw.requestExecution.reasoningEffort,usage:raw.usage,durationMs:raw.durationMs},frozenRawAndReceiptChecked:true};
}
