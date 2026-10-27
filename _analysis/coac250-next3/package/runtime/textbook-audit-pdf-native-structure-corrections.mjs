import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {loadNativeInlineCorrection} from './textbook-audit-pdf-native-corrections.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),marker=/\[\[figure:([^\]\r\n]+)\]\]/g;

/**
 * Immutable, page-scoped root acceptances for exact native-inline STRUCTURAL corrections.
 *
 * This route exists only for a page whose source layout was misread by the per-row slice
 * regions of the deterministic native plan: it re-groups the existing source image blocks
 * of the named figures into semantic regions (for page 330, one hand -> pon -> discard
 * group per example). It never produces a page, never rewrites the preserved production
 * raw, and never loosens a global binding rule:
 *  - replaced regions are declared verbatim from the preserved raw and must still match it;
 *  - every source image block of a replaced region is used exactly once (no missing, no
 *    duplicated, no foreign block);
 *  - each new region bbox is recomputed from the source block bboxes and the declared
 *    padding, and each source image SHA from the source page block itself;
 *  - the declared reading order must agree with source geometry and with the document flow;
 *  - every text entry that is not part of the approved flow diff must stay byte-identical;
 *  - the audit gate still rebuilds the candidate from the corrected raw + corrected plan,
 *    so any unlisted structural change is rejected.
 */
export const knownNativePageStructureCorrections={
 'nemata-jp:330':{path:'audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json',sha256:'8b96b361f4517322c40a555748713914a3bff8f7b902a7c01057040111a7cd61'},
};

function bound(root,path){
 if(typeof path!=='string'||!path)throw Error('audit_native_structure_path_missing');
 const target=resolve(root,path),rel=relative(resolve(root),target);
 if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('audit_native_structure_path_outside_processing');
 return target;
}
const clamp=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);
function expectedRegionBbox(blocks,padding,size){
 if(!Array.isArray(size)||size.length!==4||!blocks.length)throw Error('audit_native_structure_region_bbox');
 const x0=Math.min(...blocks.map(b=>b.bbox[0])),y0=Math.min(...blocks.map(b=>b.bbox[1])),x1=Math.max(...blocks.map(b=>b.bbox[2])),y1=Math.max(...blocks.map(b=>b.bbox[3]));
 return [clamp(x0-padding,size[0],size[2]),clamp(y0-padding,size[1],size[3]),clamp(x1+padding,size[0],size[2]),clamp(y1+padding,size[1],size[3])];
}
const markersOf=text=>[...text.matchAll(marker)].map(m=>m[1]);
const stripMarkers=text=>text.replace(marker,'');
function applyTextReplacements(change){
 if(typeof change.fromText!=='string'||typeof change.toText!=='string'||!Array.isArray(change.textReplacements)||!change.textReplacements.length)throw Error('audit_native_structure_flow_text_changed');
 let value=change.fromText;
 for(const r of change.textReplacements){
  if(!r||typeof r.from!=='string'||!r.from||typeof r.to!=='string'||!Number.isInteger(r.occurrences)||r.occurrences<1)throw Error('audit_native_structure_flow_text_changed');
  if(value.split(r.from).length-1!==r.occurrences)throw Error('audit_native_structure_flow_text_changed');
  value=value.replaceAll(r.from,r.to);
 }
 if(value!==change.toText||value===change.fromText)throw Error('audit_native_structure_flow_text_changed');
 return value;
}
const canonicalFigure=f=>JSON.stringify({regionId:f.regionId,kind:f.kind,transcription:f.transcription,unknowns:f.unknowns,caption:f.caption});
const canonicalFlow=f=>JSON.stringify({sourceBlockIds:f.sourceBlockIds,text:f.text});
const digest=items=>sha(JSON.stringify(items.map(canonicalFigure)));
const flowDigest=items=>sha(JSON.stringify(items.map(canonicalFlow)));
function reviewTargets(errors,replacedIds,blockIds){
 const targets=new Set();
 for(const error of errors??[]){
  if(error==='visual_reading_flow_not_faithful'||error==='error:flowCheck'){targets.add('flow');continue;}
  const match=/^(?:error|needs-repair|uncertain|source-note):(.+)$/.exec(error);
  if(!match)throw Error('audit_native_structure_structural_error');
  const id=match[1];
  if(replacedIds.has(id)){targets.add('figure:'+id);continue;}
  if(blockIds.has(id)){targets.add('block:'+id);continue;}
  throw Error('audit_native_structure_unapproved_target');
 }
 return targets;
}
/**
 * Pure verification of one root-accepted native-inline structural correction.
 * Rebuilds both the corrected production raw and the corrected native plan from the
 * preserved parent chain; the caller still feeds them through checkNativePdfInlineContent.
 */
export function verifyNativePageStructureCorrection({candidate,parent,baselineRaw,page,plan,approval,job,diff,structureProof,candidateSha256}){
 const n=candidate.provenance?.sourceStructureCorrection;
 if(approval.status!=='accepted-exact-native-page-structure-only'||approval.approvedBy!=='root'||!approval.approvedAt||!Array.isArray(approval.jobs))throw Error('audit_native_structure_approval');
 if(!job||job.schema!=='coach-native-page-structure-correction-job/1'||job.sourceId!==candidate.source?.sourceId||job.page!==candidate.source?.page||job.candidateSha256!==candidateSha256||job.parentSha256!==n?.parentSha256||!n)throw Error('audit_native_structure_scope');
 if(!diff||diff.schema!=='coach-native-page-structure-diff/1'||diff.sourceId!==candidate.source?.sourceId||diff.page!==candidate.source?.page||diff.parentSha256!==job.parentSha256||diff.sourcePageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_structure_diff_scope');
 if(job.structureDiffSha256!==n.structureDiffSha256||job.structureDiffPath!==n.structureDiffPath||structureProof?.structureDiff?.sha256!==job.structureDiffSha256||structureProof?.structureDiff?.path!==job.structureDiffPath)throw Error('audit_native_structure_diff_changed');
 if(n.schema!=='coach-native-page-structure-correction/1'||n.sourceId!==job.sourceId||n.page!==job.page||n.newProductionModelCalls!==0||n.parentPath!==job.parentPath||n.notesPath!==job.originalAuditPath||n.notesSha256!==job.originalAuditSha256||!same(n.originalProductionRaw,job.originalProductionRaw)||n.sourcePageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_structure_provenance');
 if(structureProof?.candidateSha256!==candidateSha256||structureProof?.parentSha256!==job.parentSha256||structureProof?.parentPath!==job.parentPath||!same(structureProof?.structureDiff,{path:job.structureDiffPath,sha256:job.structureDiffSha256})||structureProof?.sourcePage?.sha256!==job.sourcePageDataSha256||!same(structureProof?.originalProductionRaw,job.originalProductionRaw))throw Error('audit_native_structure_proof_changed');
 if(parent.source?.sourceId!==candidate.source?.sourceId||parent.source?.page!==candidate.source?.page)throw Error('audit_native_structure_parent_scope');
 if(candidate.source?.pageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_structure_source_page_changed');
 if(!Array.isArray(diff.replacedFigures)||!diff.replacedFigures.length||!Array.isArray(diff.newFigures)||!diff.newFigures.length||!Array.isArray(diff.flowChanges)||!diff.flowChanges.length)throw Error('audit_native_structure_diff_invalid');
 if(!Number.isFinite(diff.regionPadding)||diff.regionPadding<0||diff.regionPadding>36)throw Error('audit_native_structure_region_padding');
 if(!same(diff.baseline,job.originalProductionRaw))throw Error('audit_native_structure_original_raw_changed');
 const replacedIds=new Set(diff.replacedFigures.map(f=>f.figureId)),newIds=new Set(diff.newFigures.map(f=>f.figureId));
 if(replacedIds.size!==diff.replacedFigures.length||newIds.size!==diff.newFigures.length||[...newIds].some(id=>replacedIds.has(id)))throw Error('audit_native_structure_diff_invalid');
 const pageBlocks=new Map(page.blocks.filter(b=>b.type==='image').map(b=>[b.id,b])),textIds=new Set(page.blocks.filter(b=>b.type==='text').map(b=>b.id));
 const planRegions=new Map((plan.regions??[]).map(r=>[r.regionId,r]));
 // The replaced regions must still equal the preserved raw AND the original deterministic plan.
 const replacedBlocks=new Set();
 for(const declared of diff.replacedFigures){
  const rawFigure=(baselineRaw.figures??[]).find(f=>f.regionId===declared.figureId),region=planRegions.get(declared.figureId);
  if(!rawFigure||!region||!same(rawFigure,{regionId:declared.figureId,kind:declared.kind,transcription:declared.transcription,unknowns:declared.unknowns,caption:declared.caption}))throw Error('audit_native_structure_replaced_figure_changed');
  if(!same(declared.bbox,region.bbox)||!same(declared.sourceImageBlockIds,region.sourceImageBlockIds)||!same(declared.sourceImageSha256s,region.sourceImageSha256s))throw Error('audit_native_structure_parent_plan_changed');
  for(const id of declared.sourceImageBlockIds){if(replacedBlocks.has(id))throw Error('audit_native_structure_duplicate_block');replacedBlocks.add(id);}
 }
 const units=new Set([...replacedIds].map(id=>planRegions.get(id).unitId+'\u0000'+planRegions.get(id).chapterId));
 if(units.size!==1)throw Error('audit_native_structure_unit_scope');
 // New regions: exact partition of the replaced blocks, source-derived geometry and SHAs.
 const used=new Set();
 for(const region of diff.newFigures){
  if(typeof region.figureId!=='string'||!region.figureId||typeof region.kind!=='string'||typeof region.transcription!=='string'||!region.transcription.trim()||typeof region.caption!=='string'||!region.caption.trim()||!Array.isArray(region.unknowns)||typeof region.sourceEvidence!=='string'||!region.sourceEvidence.trim()||!region.crop?.path||!region.crop?.sha256)throw Error('audit_native_structure_new_figure_invalid');
  if(!Array.isArray(region.sourceImageBlockIds)||!region.sourceImageBlockIds.length)throw Error('audit_native_structure_new_figure_invalid');
  const blocks=region.sourceImageBlockIds.map(id=>pageBlocks.get(id));
  if(blocks.some(b=>!b))throw Error('audit_native_structure_unknown_block');
  for(const id of region.sourceImageBlockIds){if(!replacedBlocks.has(id))throw Error('audit_native_structure_foreign_block');if(used.has(id))throw Error('audit_native_structure_duplicate_block');used.add(id);}
  if(!same(region.bbox,expectedRegionBbox(blocks,diff.regionPadding,page.size)))throw Error('audit_native_structure_region_bbox');
  if(!same(region.sourceImageSha256s,blocks.map(b=>b.imageSha256)))throw Error('audit_native_structure_source_sha');
 }
 for(const id of replacedBlocks)if(!used.has(id))throw Error('audit_native_structure_missing_block');
 // Reading order: dense, geometry-consistent, and identical to the document flow order.
 const ordered=[...diff.newFigures].sort((a,b)=>a.readingOrder-b.readingOrder);
 if(!same(ordered.map(f=>f.readingOrder),diff.newFigures.map((_,i)=>i)))throw Error('audit_native_structure_reading_order');
 for(let i=1;i<ordered.length;i++){
  const a=ordered[i-1],b=ordered[i],overlapY=Math.min(a.bbox[3],b.bbox[3])-Math.max(a.bbox[1],b.bbox[1]);
  if(overlapY>0?!(a.bbox[2]<=b.bbox[0]):!(a.bbox[1]<=b.bbox[1]))throw Error('audit_native_structure_reading_order');
 }
 // Flow diff: explicit marker placement plus explicit text replacements only.
 const flowEntries=new Map((baselineRaw.pageFlow??[]).filter(e=>e.kind==='text').map(e=>[e.sourceBlockIds.join(','),e]));
 const blockLines=new Map(page.blocks.filter(b=>b.type==='text').map(b=>[b.id,(b.lines??[]).length]));
 const seenFrom=[],seenTo=[],changedBlocks=new Set(),flowOrder=[];
 for(const change of diff.flowChanges){
  if(!Array.isArray(change.sourceBlockIds)||change.sourceBlockIds.length!==1||!textIds.has(change.sourceBlockIds[0]))throw Error('audit_native_structure_flow_target');
  const key=change.sourceBlockIds.join(','),entry=flowEntries.get(key);
  if(!entry||entry.text!==change.fromRawSlotText)throw Error('audit_native_structure_flow_parent_mismatch');
  const fromMarkers=markersOf(change.fromRawSlotText),toMarkers=markersOf(change.toRawSlotText);
  if(!same(fromMarkers,change.fromFigureIds)||!same(toMarkers,change.toFigureIds))throw Error('audit_native_structure_flow_figures');
  if(fromMarkers.some(id=>!replacedIds.has(id))||toMarkers.some(id=>!newIds.has(id)))throw Error('audit_native_structure_flow_figures');
  for(const id of fromMarkers){if(seenFrom.includes(id))throw Error('audit_native_structure_flow_figures');seenFrom.push(id);}
  for(const id of toMarkers){if(seenTo.includes(id))throw Error('audit_native_structure_flow_figures');seenTo.push(id);}
  if(!same(stripMarkers(change.toRawSlotText),applyTextReplacements({...change,fromText:stripMarkers(change.fromRawSlotText),toText:stripMarkers(change.toRawSlotText)})))throw Error('audit_native_structure_flow_text_changed');
  if(!Array.isArray(change.markerLineIndexes)||change.markerLineIndexes.length!==toMarkers.length||change.markerLineIndexes.some((v,i)=>!Number.isInteger(v)||v<0||v>=(blockLines.get(change.sourceBlockIds[0])??0)||(i&&v<=change.markerLineIndexes[i-1])))throw Error('audit_native_structure_marker_position');
  changedBlocks.add(key);flowOrder.push(...toMarkers);
 }
 if(!same(seenTo,ordered.map(f=>f.figureId)))throw Error('audit_native_structure_reading_order');
 if(seenFrom.length!==replacedIds.size||[...replacedIds].some(id=>!seenFrom.includes(id)))throw Error('audit_native_structure_flow_figures');
 // Failing audit items must all be addressed, and nothing outside them may change.
 const failing=reviewTargets(job.originalReviewErrors,replacedIds,textIds);
 const addressed=new Set(['flow']);
 for(const change of diff.flowChanges)for(const id of change.sourceBlockIds)addressed.add('block:'+id);
 for(const target of failing)if(!addressed.has(target)&&!target.startsWith('figure:'))throw Error('audit_native_structure_unresolved_audit_item');
 for(const change of diff.flowChanges)for(const id of change.sourceBlockIds)if(!failing.has('block:'+id)&&!failing.has('flow'))throw Error('audit_native_structure_unapproved_target');
 // Explicit statements that the untouched records stay byte-identical.
 const untouchedFigures=(baselineRaw.figures??[]).filter(f=>!replacedIds.has(f.regionId));
 if(diff.unaffected?.figureCount!==untouchedFigures.length||diff.unaffected?.figureDigest!==digest(untouchedFigures))throw Error('audit_native_structure_unaffected_figures_changed');
 const untouchedFlow=(baselineRaw.pageFlow??[]).filter(e=>e.kind==='text'&&!changedBlocks.has(e.sourceBlockIds.join(',')));
 if(diff.unaffected?.flowCount!==untouchedFlow.length||diff.unaffected?.flowDigest!==flowDigest(untouchedFlow))throw Error('audit_native_structure_unaffected_flow_changed');
 // Rebuild the corrected production raw: only the declared figures and flow entries change.
 const removed=new Set([...replacedIds]),newFlow=new Map(diff.flowChanges.map(c=>[c.sourceBlockIds.join(','),c.toRawSlotText]));
 const correctedRaw=structuredClone(baselineRaw);
 correctedRaw.figures=[...correctedRaw.figures.filter(f=>!removed.has(f.regionId)),...ordered.map(f=>({regionId:f.figureId,kind:f.kind,transcription:f.transcription,unknowns:f.unknowns,caption:f.caption}))];
 if(correctedRaw.figures.length!==untouchedFigures.length+ordered.length)throw Error('audit_native_structure_rebuild_failed');
 correctedRaw.pageFlow=correctedRaw.pageFlow.map(e=>e.kind==='text'&&newFlow.has(e.sourceBlockIds.join(','))?{...e,text:newFlow.get(e.sourceBlockIds.join(','))}:e);
 // Rebuild the corrected native plan: same text tokens, re-grouped image tokens at the declared anchors.
 const correctedPlan=structuredClone(plan);
 const insertAfter=new Map();
 for(const change of diff.flowChanges){
  const anchorBlock=change.sourceBlockIds[0];
  change.toFigureIds.forEach((figureId,index)=>{
   const region=ordered.find(f=>f.figureId===figureId),tokens=region.sourceImageBlockIds.map(id=>plan.nativeTokens.find(t=>t.type==='image'&&t.sourceImageBlockId===id)).sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
   if(tokens.some(t=>!t))throw Error('audit_native_structure_plan_token_missing');
   const key=anchorBlock+':'+change.markerLineIndexes[index];
   if(insertAfter.has(key))throw Error('audit_native_structure_marker_position');
   insertAfter.set(key,tokens);
  });
 }
 const tokens=[];
 for(const token of plan.nativeTokens){
  if(token.type==='image'&&replacedBlocks.has(token.sourceImageBlockId))continue;
  tokens.push(token);
  if(token.type==='text'){
   const queued=insertAfter.get(token.sourceBlockId+':'+token.lineIndex);
   if(queued){tokens.push(...queued);insertAfter.delete(token.sourceBlockId+':'+token.lineIndex);}
  }
 }
 if(insertAfter.size)throw Error('audit_native_structure_marker_position');
 correctedPlan.nativeTokens=tokens;
 const firstRemovedAt=plan.regions.findIndex(r=>removed.has(r.regionId));
 const newRegions=ordered.map(f=>({regionId:f.figureId,bbox:f.bbox,sourceImageBlockIds:f.sourceImageBlockIds,sourceImageSha256s:f.sourceImageSha256s,unitId:planRegions.get([...replacedIds][0]).unitId,chapterId:planRegions.get([...replacedIds][0]).chapterId}));
 correctedPlan.regions=[...plan.regions.filter(r=>!removed.has(r.regionId))];
 correctedPlan.regions.splice(firstRemovedAt<0?correctedPlan.regions.length:firstRemovedAt,0,...newRegions);
 return {correctedRaw,correctedPlan};
}
export async function loadNativePageStructureCorrection(root,candidate,candidateSha256){
 const key=candidate.source?.sourceId+':'+candidate.source?.page,known=knownNativePageStructureCorrections[key];
 if(!known)throw Error('audit_native_structure_unapproved_page');
 const approvalBytes=await readFile(bound(root,known.path)),approval=JSON.parse(approvalBytes);
 if(known.sha256.startsWith('PENDING')||sha(approvalBytes)!==known.sha256)throw Error('audit_native_structure_approval_changed');
 const n=candidate.provenance?.sourceStructureCorrection,job=approval.jobs.find(j=>j.candidateSha256===candidateSha256);
 if(!job||!n)throw Error('audit_native_structure_job_missing');
 const parentBytes=await readFile(bound(root,job.parentPath)),parent=JSON.parse(parentBytes);
 if(sha(parentBytes)!==job.parentSha256||n.parentSha256!==job.parentSha256||bound(root,n.parentPath)!==bound(root,job.parentPath))throw Error('audit_native_structure_parent_changed');
 const auditBytes=await readFile(bound(root,job.originalAuditPath)),originalAudit=JSON.parse(auditBytes);
 if(sha(auditBytes)!==job.originalAuditSha256||n.notesSha256!==job.originalAuditSha256||bound(root,n.notesPath)!==bound(root,job.originalAuditPath)||originalAudit.status!=='needs-repair'||originalAudit.production?.sha256!==job.parentSha256)throw Error('audit_native_structure_original_review_changed');
 if(!Array.isArray(originalAudit.modelChecks?.errors)||originalAudit.modelChecks.passed||!same(originalAudit.modelChecks.errors,job.originalReviewErrors))throw Error('audit_native_structure_original_review_changed');
 // Baseline raw: the parent's own accepted correction chain, never a rewrite of it.
 let baselineRaw;
 if(parent.provenance?.sourceStructureCorrection)throw Error('audit_native_structure_chain_nested');
 else if(parent.provenance?.sourceFieldCorrection){
  if(!same(parent.provenance.sourceFieldCorrection.originalProductionRaw,job.originalProductionRaw))throw Error('audit_native_structure_original_raw_changed');
  baselineRaw=(await loadNativeInlineCorrection(root,parent,job.parentSha256)).correctedRaw;
 }else{
  const attempt=parent.provenance?.attempts?.filter(a=>a.success).at(-1);
  if(!attempt||bound(root,attempt.rawArtifactPath)!==bound(root,job.originalProductionRaw.path)||attempt.rawArtifactSha256!==job.originalProductionRaw.sha256)throw Error('audit_native_structure_original_raw_changed');
  baselineRaw=JSON.parse(await readFile(bound(root,job.originalProductionRaw.path))).parsedOutput;
 }
 const rawBytes=await readFile(bound(root,job.originalProductionRaw.path));
 if(sha(rawBytes)!==job.originalProductionRaw.sha256)throw Error('audit_native_structure_original_raw_changed');
 const originalRawParsed=JSON.parse(rawBytes).parsedOutput;
 const pageBytes=await readFile(bound(root,job.sourcePagePath)),page=JSON.parse(pageBytes);
 if(sha(pageBytes)!==job.sourcePageDataSha256||candidate.source?.pageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_structure_source_page_changed');
 const nsf=candidate.provenance?.nativeSourceFlow;
 if(!nsf?.path||!nsf?.sha256)throw Error('audit_native_structure_plan_missing');
 const planBytes=await readFile(bound(root,nsf.path)),plan=JSON.parse(planBytes);
 if(sha(planBytes)!==nsf.sha256||plan.page!==candidate.source.page||plan.pageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_structure_plan_changed');
 const diffBytes=await readFile(bound(root,job.structureDiffPath)),diff=JSON.parse(diffBytes);
 if(sha(diffBytes)!==job.structureDiffSha256)throw Error('audit_native_structure_diff_changed');
 const proofBytes=await readFile(bound(root,job.proofPath)),proof=JSON.parse(proofBytes);
 if(sha(proofBytes)!==job.proofSha256||proof.candidateSha256!==candidateSha256||proof.parentSha256!==job.parentSha256||!same(proof.structureDiff,{path:job.structureDiffPath,sha256:job.structureDiffSha256})||!same(proof.originalProductionRaw,job.originalProductionRaw)||proof.sourcePage?.path!==job.sourcePagePath||proof.sourcePage?.sha256!==job.sourcePageDataSha256||proof.originalAudit?.path!==job.originalAuditPath||proof.originalAudit?.sha256!==job.originalAuditSha256)throw Error('audit_native_structure_proof_changed');
 const structureProof={schema:'coach-native-page-structure-correction-proof/1',candidateSha256,parentSha256:job.parentSha256,parentPath:job.parentPath,originalAudit:{path:job.originalAuditPath,sha256:job.originalAuditSha256,status:originalAudit.status},originalProductionRaw:job.originalProductionRaw,sourcePage:{path:job.sourcePagePath,sha256:job.sourcePageDataSha256},structureDiff:{path:job.structureDiffPath,sha256:job.structureDiffSha256}};
 const {correctedRaw,correctedPlan}=verifyNativePageStructureCorrection({candidate,parent,baselineRaw,page,plan,approval,job,diff,structureProof,candidateSha256});
 return {baselineRaw,originalRawParsed,correctedRaw,correctedPlan,parent,originalAudit,sourcePage:page,plan,structureProof};
}
