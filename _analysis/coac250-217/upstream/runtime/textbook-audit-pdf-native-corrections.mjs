import {load217Correction} from './textbook-audit-pdf-p217-correction.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';

const sha=b=>createHash('sha256').update(b).digest('hex'),marker=/\[\[figure:([^\]\r\n]+)\]\]/g;
/**
 * Immutable, page-scoped root acceptances for exact native-inline field corrections.
 * A revision candidate is only auditable through this route while its own file hash is
 * listed in the matching page approval file. Every unlisted field must still equal the
 * preserved production raw byte-for-byte.
 */
export const knownNativeInlineCorrections={
 'nemata-jp:309':{path:'audit/source-corrections/native-inline-field-corrections.p309.root-acceptance.json',sha256:'cfd69a864f554b9dd13544ccd8a40d009dc1d3fd857251fb419f67fdac48620e'},
 'nemata-jp:315':{path:'audit/source-corrections/native-inline-field-corrections.p315.root-acceptance.json',sha256:'2804f43bd32fe7ad1a9417893be9e2b1a5a018ce30aa0c0b488c35d7c4ee2ae8'},
 'nemata-jp:329':{path:'audit/source-corrections/native-inline-field-corrections.p329.root-acceptance.json',sha256:'d3d33f0beec52652d821d5a1495778ef318a48b04a2a9e56990a1fed66740537'},
 'nemata-jp:330':{path:'audit/source-corrections/native-inline-field-corrections.p330.root-acceptance.json',sha256:'4052166a6355296221367a1eec967758d1f1c07a71e438e3856a86c0744fc6e5'},
 'nemata-jp:261':{path:'audit/source-corrections/native-inline-field-corrections.p261.root-acceptance.json',sha256:'6074d74646753bd6dfc0d91cd68945357e6978a22f88cdae4774b95a6a586416'},
 'nemata-jp:262':{path:'audit/source-corrections/native-inline-field-corrections.p262.root-acceptance.json',sha256:'dbc8842a9b3c062fbc35d117e826405add463c777f02a9c52dbfa17fec5d9338'},
 'nemata-jp:260':{path:'audit/source-corrections/native-inline-field-corrections.p260.root-acceptance.json',sha256:'ae8962aec39d3e86b3c9154f3e5e906cc42677533fdfc7ce5c91590d7ba1d603'},
 '79-cn:50':{path:'audit/source-corrections/native-inline-field-corrections.p50.root-acceptance.json',sha256:'1d1e22613606f6ed4c061e45bbfbee1c199b59ec330b6eec64d28f32a06c3300'},
};

function bound(root,path){
 if(typeof path!=='string'||!path)throw Error('audit_native_inline_correction_path_missing');
 const target=resolve(root,path),rel=relative(resolve(root),target);
 if(!rel||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw Error('audit_native_inline_correction_path_outside_processing');
 return target;
}
function applyReplacements(change){
 if(!Array.isArray(change.replacements)||!change.replacements.length)throw Error('audit_native_inline_correction_replacement_invalid');
 for(const r of change.replacements)if(!r||typeof r.from!=='string'||!r.from||typeof r.to!=='string'||!Number.isInteger(r.occurrences)||r.occurrences<1)throw Error('audit_native_inline_correction_replacement_invalid');
 // Page-scoped evidence entries (for example an unknowns array) are replaced
 // entry-by-entry: every matching entry is swapped and the count must match.
 // Nothing else in the array may move, so an approved entry can never smuggle
 // in a body or tile-shape change.
 if(Array.isArray(change.fromValue)){
  if(!Array.isArray(change.toValue)||change.fromValue.some(v=>typeof v!=='string'))throw Error('audit_native_inline_correction_replacement_invalid');
  const value=[...change.fromValue];
  for(const r of change.replacements){
   const hits=value.flatMap((v,i)=>v===r.from?[i]:[]);
   if(hits.length!==r.occurrences)throw Error('audit_native_inline_correction_replacement_not_unique');
   for(const i of hits)value[i]=r.to;
  }
  if(!same(value,change.toValue)||same(value,change.fromValue))throw Error('audit_native_inline_correction_replacement_not_exact');
  return value;
 }
 if(typeof change.fromValue!=='string'||typeof change.toValue!=='string')throw Error('audit_native_inline_correction_replacement_invalid');
 let value=change.fromValue;
 for(const r of change.replacements){
  if(value.split(r.from).length-1!==r.occurrences)throw Error('audit_native_inline_correction_replacement_not_unique');
  value=value.replaceAll(r.from,r.to);
 }
 if(value!==change.toValue||value===change.fromValue)throw Error('audit_native_inline_correction_replacement_not_exact');
 return value;
}
function failingTargets(errors,candidate){
 const targets=new Set();
 for(const error of errors??[]){
  const match=/^(?:error|needs-repair|uncertain|source-note):(.+)$/.exec(error);
  if(match){
   const id=match[1];
   if(id==='flowCheck'){targets.add('flow');continue;}
   if(candidate.figures.some(f=>f.figureId===id)){targets.add('figure:'+id);continue;}
   if(candidate.body.blocks.some(b=>b.type==='text'&&(b.sourceBlockIds??[]).includes(id))){targets.add('block:'+id);continue;}
   throw Error('audit_native_inline_correction_unapproved_target');
  }
  if(error==='visual_reading_flow_not_faithful'){targets.add('flow');continue;}
  throw Error('audit_native_inline_correction_structural_error');
 }
 return targets;
}
function addressedTargets(change,candidate){
 const targets=new Set(['flow']);
 if(change.target==='figure'){
  targets.add('figure:'+change.figureId);
  for(const block of candidate.body.blocks)if((block.inlineFigureIds??[]).includes(change.figureId)||(block.type==='figure'&&block.figureId===change.figureId))for(const id of block.sourceBlockIds??[])targets.add('block:'+id);
 }else if(change.target==='paragraph'){
  for(const id of change.sourceBlockIds??[])targets.add('block:'+id);
 }else throw Error('audit_native_inline_correction_target_invalid');
 return targets;
}
function sourceBlockText(page,id){
 const block=page.blocks.find(b=>b.id===id&&b.type==='text');
 return block?(block.lines??[]).map(l=>l.text).join(''):null;
}
/**
 * Pure verification of one root-accepted native-inline field correction.
 * It never trusts the revision candidate: every approved field is rebuilt from the
 * preserved production raw, and every field that is not explicitly approved is rejected.
 */
export function verifyNativeInlineCorrection({candidate,parent,rawParsed,page,approval,job,correctionProof,candidateSha256}){
 const n=candidate.provenance?.sourceFieldCorrection;
 if(approval.status!=='accepted-exact-native-field-corrections-only'||approval.approvedBy!=='root'||!approval.approvedAt||!Array.isArray(approval.jobs))throw Error('audit_native_inline_correction_approval');
 if(!job||job.schema!=='coach-native-inline-field-correction-job/1'||job.sourceId!==candidate.source?.sourceId||job.page!==candidate.source?.page||job.candidateSha256!==candidateSha256||job.parentSha256!==correctionProof?.parentSha256||!n)throw Error('audit_native_inline_correction_scope');
 if(n.newProductionModelCalls!==0||n.parentSha256!==job.parentSha256||n.notesSha256!==job.originalAuditSha256||!same(n.changes,job.changes)||!same(n.originalProductionRaw,job.originalProductionRaw)||n.sourcePageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_inline_correction_provenance');
 if(parent.source?.sourceId!==candidate.source?.sourceId||parent.source?.page!==candidate.source?.page)throw Error('audit_native_inline_correction_parent_scope');
 if(!Array.isArray(n.changes)||!n.changes.length)throw Error('audit_native_inline_correction_changes_invalid');
 const keys=n.changes.map(c=>c.target==='figure'?c.figureId+':'+c.field:c.target==='paragraph'?'block:'+(c.sourceBlockIds??[]).join(','):String(c.target));
 if(new Set(keys).size!==keys.length)throw Error('audit_native_inline_correction_changes_invalid');
 if(!same(correctionProof?.sourceFieldCorrection,n)||correctionProof?.candidateSha256!==candidateSha256)throw Error('audit_native_inline_correction_proof_changed');
 const correctedRaw=structuredClone(rawParsed);
 for(const change of n.changes){
  if(typeof change.sourceEvidence!=='string'||!change.sourceEvidence.trim()||!change.sourceCrop?.path||!change.sourceCrop?.sha256)throw Error('audit_native_inline_correction_source_evidence');
  for(const evidence of change.sourceTextEvidence??[]){
   const text=sourceBlockText(page,evidence.sourceBlockId);
   if(text===null||typeof evidence.contains!=='string'||!evidence.contains||!text.includes(evidence.contains))throw Error('audit_native_inline_correction_source_text_evidence');
  }
  const toValue=applyReplacements(change);
  if(change.target==='figure'){
   const rawFigure=(correctedRaw.figures??[]).find(f=>f.regionId===change.figureId),figure=candidate.figures.find(f=>f.figureId===change.figureId);
   if(!rawFigure||!['transcription','caption','unknowns'].includes(change.field)||!same(rawFigure[change.field],change.fromValue))throw Error('audit_native_inline_correction_raw_field_mismatch');
   if(!figure||!same(figure[change.field],toValue))throw Error('audit_native_inline_correction_candidate_field_mismatch');
   rawFigure[change.field]=toValue;
  }else{
   const entry=(correctedRaw.pageFlow??[]).find(f=>f.kind==='text'&&same(f.sourceBlockIds,change.sourceBlockIds)),block=candidate.body.blocks.find(b=>b.type==='text'&&same(b.sourceBlockIds,change.sourceBlockIds));
   if(!entry||!same(entry.text,change.fromValue))throw Error('audit_native_inline_correction_raw_field_mismatch');
   if(!block||!same(block.rawSlotText,toValue))throw Error('audit_native_inline_correction_candidate_field_mismatch');
   entry.text=toValue;
  }
 }
 const failing=failingTargets(job.originalReviewErrors,candidate),addressed=new Set();
 for(const change of n.changes)for(const target of addressedTargets(change,candidate))addressed.add(target);
 for(const target of failing)if(!addressed.has(target))throw Error('audit_native_inline_correction_unresolved_audit_item');
 for(const change of n.changes)if(![...addressedTargets(change,candidate)].some(target=>failing.has(target)))throw Error('audit_native_inline_correction_unapproved_target');
 return correctedRaw;
}
export async function loadNativeInlineCorrection(root,candidate,candidateSha256){
 if(candidate.source?.sourceId==='79-cn'&&candidate.source?.page===217)return load217Correction(root,candidate,candidateSha256);
 const key=candidate.source?.sourceId+':'+candidate.source?.page,known=knownNativeInlineCorrections[key];
 if(!known)throw Error('audit_native_inline_correction_unapproved_page');
 const approvalBytes=await readFile(bound(root,known.path)),approval=JSON.parse(approvalBytes);
 if(known.sha256.startsWith('PENDING')||sha(approvalBytes)!==known.sha256)throw Error('audit_native_inline_correction_approval_changed');
 const n=candidate.provenance?.sourceFieldCorrection,job=approval.jobs.find(j=>j.candidateSha256===candidateSha256);
 if(!job||!n)throw Error('audit_native_inline_correction_job_missing');
 const parentBytes=await readFile(bound(root,job.parentPath)),parent=JSON.parse(parentBytes);
 if(sha(parentBytes)!==job.parentSha256||n.parentSha256!==job.parentSha256||bound(root,n.parentPath)!==bound(root,job.parentPath))throw Error('audit_native_inline_correction_parent_changed');
 const auditBytes=await readFile(bound(root,job.originalAuditPath)),originalAudit=JSON.parse(auditBytes);
 if(sha(auditBytes)!==job.originalAuditSha256||n.notesSha256!==job.originalAuditSha256||bound(root,n.notesPath)!==bound(root,job.originalAuditPath)||originalAudit.status!=='needs-repair'||originalAudit.production?.sha256!==job.parentSha256)throw Error('audit_native_inline_correction_original_review_changed');
 const originalRawBytes=await readFile(bound(root,job.originalProductionRaw.path)),originalRaw=JSON.parse(originalRawBytes);
 if(sha(originalRawBytes)!==job.originalProductionRaw.sha256||n.originalProductionRaw.sha256!==job.originalProductionRaw.sha256)throw Error('audit_native_inline_correction_original_raw_changed');
 const proofBytes=await readFile(bound(root,job.proofPath)),proof=JSON.parse(proofBytes);
 if(sha(proofBytes)!==job.proofSha256||proof.candidateSha256!==candidateSha256||proof.parentSha256!==job.parentSha256||!same(proof.sourceFieldCorrection,n))throw Error('audit_native_inline_correction_proof_changed');
 const pageBytes=await readFile(bound(root,job.sourcePagePath)),sourcePage=JSON.parse(pageBytes);
 if(sha(pageBytes)!==job.sourcePageDataSha256||candidate.source?.pageDataSha256!==job.sourcePageDataSha256||n.sourcePageDataSha256!==job.sourcePageDataSha256)throw Error('audit_native_inline_correction_source_page_changed');
 const originalChecks=originalAudit.modelChecks;
 if(!originalChecks||originalChecks.passed||!Array.isArray(originalChecks.errors))throw Error('audit_native_inline_correction_original_review_changed');
 const reviewErrors=[...originalChecks.errors];
 for(const supplemental of job.supplementalAudits??[]){
  const sb=await readFile(bound(root,supplemental.path)),supplement=JSON.parse(sb);
  if(sha(sb)!==supplemental.sha256||supplement.schema!=='coach-textbook-page-audit/1'||supplement.status!=='needs-repair'||supplement.production?.sha256!==supplemental.productionSha256||!Array.isArray(supplement.modelChecks?.errors)||!same(supplement.modelChecks.errors,supplemental.errors))throw Error('audit_native_inline_correction_supplemental_audit_changed');
  const priorBytes=await readFile(bound(root,supplement.production.path)),prior=JSON.parse(priorBytes);
  if(sha(priorBytes)!==supplemental.productionSha256||prior.provenance?.sourceFieldCorrection?.parentSha256!==job.parentSha256)throw Error('audit_native_inline_correction_supplemental_audit_changed');
  for(const change of prior.provenance.sourceFieldCorrection.changes??[])if(!job.changes.some(x=>same(x,change)))throw Error('audit_native_inline_correction_supplemental_change_not_in_job');
  reviewErrors.push(...supplemental.errors);
 }
 const correctionProof={schema:'coach-native-inline-field-correction-proof/1',candidateSha256,parentSha256:job.parentSha256,parentPath:job.parentPath,originalAudit:{path:job.originalAuditPath,sha256:job.originalAuditSha256,status:originalAudit.status},originalProductionRaw:job.originalProductionRaw,sourcePage:{path:job.sourcePagePath,sha256:job.sourcePageDataSha256},sourceFieldCorrection:n};
 const correctedRaw=verifyNativeInlineCorrection({candidate,parent,rawParsed:originalRaw.parsedOutput,page:sourcePage,approval,job:{...job,originalReviewErrors:reviewErrors},correctionProof,candidateSha256});
 return {correctedRaw,parent,originalAudit,originalRaw,sourcePage,correctionProof};
}
