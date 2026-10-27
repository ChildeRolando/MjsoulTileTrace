import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const binding=Object.freeze({canonical:'79-cn-chapter-256-18',article:'cv1785770',
 parent:'56ea08c0868e87628f61a777a35c40a9a8372bddfcca23a7daef6be3a3bdafe2',
 source:'53bbca13df84b169a751041b20f080d244b21684ce896128e5ad8f07b0cd4b23',
 audit:'8341055fc9fec8aacf5c8dd6344cb5af99cfc6998f76105f7dc7d8e13a9a4b21',
 raw:'6ed8519078198ecb6310bf2ed36dc5aaddff786ea5b79a82afdf555146ffcf1c',
 target:'79-bilibili-cn:cv1785770:b0016:figure',block:'79-bilibili-cn:cv1785770:b0016',
 parentDigest:'8123db1a65f90ee506eb7b6c570c4a71309d634431969c0155571435b857bd8b',auditDigest:'9b7ba9975cdaa8204191c931ff68d88098633c899695379709acef8ac9a3a60d',bbox:[368,459,391,489]});
export function exact256State(candidate,parent,notes,{requireRepaired=false}={}){
 const r=candidate.provenance?.revision;
 if(sha(JSON.stringify(parent))!==binding.parentDigest||sha(JSON.stringify(notes))!==binding.auditDigest||
  candidate.source?.articleId!==binding.article||candidate.source.sourceSha256!==binding.source||
  r?.parentSha256!==binding.parent||r?.notesSha256!==binding.audit||
  !same(r.figureIds,[binding.target])||(r.textBlockIds??[]).length||r.groupRevision||r.firstRevision)
  throw Error('exact256_binding');
 const old=parent.figures.find(f=>f.figureId===binding.target),f=candidate.figures.find(f=>f.figureId===binding.target);
 const from='7s [索子，数字不明] 9s',to='7s 8s 9s';
 if(!old||!f||old.transcription.split(from).length!==2||old.unknowns.length!==3)throw Error('exact256_parent_scope');
 const expected=old.transcription.replace(from,to),unknowns=old.unknowns.slice(1);
 const repaired=f.transcription===expected&&same(f.unknowns,unknowns);
 if(!repaired&&(!same(f.transcription,old.transcription)||!same(f.unknowns,old.unknowns)||requireRepaired))throw Error('exact256_field_whitelist');
 const rewind=structuredClone(candidate),rf=rewind.figures.find(f=>f.figureId===binding.target);
 // Existing producer's explicitly non-reviewable semantic intermediate omits presentations.
 // It may omit all four, never replace any display asset or selectively omit one.
 if(rewind.figures.every(f=>!Object.hasOwn(f,'presentationAsset')))for(const f of rewind.figures)f.presentationAsset=structuredClone(parent.figures.find(p=>p.figureId===f.figureId).presentationAsset);
 rf.transcription=old.transcription;rf.unknowns=structuredClone(old.unknowns);rf.provenance=structuredClone(old.provenance);
 rewind.provenance=structuredClone(parent.provenance);rewind.candidateSha256=parent.candidateSha256;
 if(!same(rewind,parent))throw Error('exact256_unrequested_bytes');
 return {repaired,expected,unknowns,originalIssues:structuredClone(notes.modelReview.issues),targetFigure:f};
}
// This only admits production. It never resolves an independent issue, edits notes, or grants acceptance.
export function isExact256Revision(candidate,parent,notes){
 if(candidate.source?.articleId!==binding.article||candidate.provenance?.revision?.parentSha256!==binding.parent)return false;
 exact256State(candidate,parent,notes);return true;
}
