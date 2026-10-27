// Exact legacy-PDF bridge through the existing field-correction loader.
// This is an external revision proof, never a model response or a page passed receipt.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const admissionPath='audit/source-corrections/native-inline-field-corrections.p217.root-acceptance.json';
export const admissionSha256='5fc316e8150c927e0c49bfb49b120a348040ee6c7707847984d585b8023cf8f7';
export const parentSha256='7766c2217ecb1bc04dfa98ecad9ca9d0e1221a695259a791d1d214e3a8c77777';
const pageSha='f8de2eddd4ba2939ae40796ffd8d1d1f971d49474dede72d108e61809ef1d6f8';
const continuationSha='83d1909e9e92a9622c46c9ba0ea46efca12bef60cb27ec5b35d72fcbd8f92abd';
const imageSha='64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978';
const originalRawSha='6112c207fc1d5922e88af671f0a02b7e13623af7edee15a18a9b0c76bed59203';
export const limitationText='【审校注（非原文）：图中北家舍牌第二行第一张及西家舍牌第二行第二张均为万子，数字未辨清。西家该数字不影响本段亲家染索、南场领先、无役愚形一向听、留两家切过的9饼、拆8万对子扣索及争取亲家未听下庄的六项论证；北家第一张的未知不妨碍总体扣牌说明。两处未知限制精确牌谱复原，不能据此确定相关万子的精确可见张数、余张、进张和安全度。原文“现在亲家应该还没有听牌吧”为推测，扣索是战术意图，不证明对手暗手、实际结局、打法绝对安全或最优。】';
const fail=code=>{throw Error('audit_p217_'+code)};
const textOf=b=>(b.lines??[]).map(l=>l.text).join('');
export function derive217(parent,note){
 const c=structuredClone(parent),f=c.figures[0];
 if(c.source.sourceId!=='79-cn'||c.source.page!==217||c.source.pageDataSha256!==pageSha||c.provenance.flowMode||f.figureId!=='79-cn-p217-r1'||f.chapterId!=='79-cn-chapter-217-4'||!same(f.sourceImageBlockIds,['79-cn-p217-b8'])||!same(f.sourceImageSha256s,[imageSha]))fail('scope');
 if(f.transcription.split('第二行5m 9m。').length!==2||f.unknowns.length!==1)fail('parent_fields');
 f.transcription=f.transcription.replace('第二行5m 9m。','第二行万子（数字未辨清） 9m。');
 f.unknowns=[f.unknowns[0]+' 原嵌图坐标[81,175,112,199)，西家自身第二行第二张；保留未知，不赋点数。','北家舍牌第二行第一张为万子，数字未辨清；原嵌图坐标[150,325,175,357)，不再赋5m或6m。第二张9m另有独立坐标裁决，保持不变。'];
 c.editorialAnnotations=[structuredClone(note)];
 return c;
}
export function assemble217Note(page,note){
 if(note.kind!=='non-author-limitation'||note.chapterId!=='79-cn-chapter-217-4'||note.text!==limitationText||note.sourcePageSha256!==continuationSha||!same(note.evidenceIds,['north-first','north-second','west-impact']))fail('unsupported_note');
 const block=page.blocks.find(b=>b.id==='79-cn-p218-b3'&&b.type==='text');
 if(!block||note.sourceBlockId!==block.id||note.afterExactText!=='施行让亲家未听下庄的战术。'||note.afterCharacterOffset!==165)fail('note_anchor');
 const text=textOf(block),needle=note.afterExactText;
 if(text.split(needle).length!==2||text.indexOf(needle)+needle.length!==165||!text.slice(165).includes('后付的字牌'))fail('note_anchor');
 // Segments, not a rewrite of the source block. Removing the editorial segment
 // reconstructs the complete original string exactly, including whitespace.
 const segments=[{type:'source-text',sourceBlockId:block.id,start:0,end:165,text:text.slice(0,165)},
  {type:'editorial-note',authorText:false,text:note.text,evidenceIds:note.evidenceIds},
  {type:'source-text',sourceBlockId:block.id,start:165,end:text.length,text:text.slice(165)}];
 if(segments.filter(s=>s.type==='source-text').map(s=>s.text).join('')!==text)fail('author_text_changed');
 return {sourceBlockId:block.id,sourcePageSha256:continuationSha,segments,sourceTextUnchanged:true};
}
export function verify217({candidate,parent,approval,candidateSha256,documents}){
 if(approval.schema!=='coach-pdf217-exact-field-admission/1'||approval.authorizationComment!=='01a17f03-f390-7185-930a-57862eabdc33'||approval.candidate.sha256!==candidateSha256||approval.parent.sha256!==parentSha256)fail('admission');
 const n=candidate.provenance?.sourceFieldCorrection;
 if(!n||n.route!=='p217-exact-legacy-field-correction'||n.newProductionModelCalls!==0||n.parentSha256!==parentSha256||!same(n,approval.sourceFieldCorrection))fail('provenance');
 if(approval.inputs.parent.sha256!==parentSha256||approval.inputs.page217.sha256!==pageSha||approval.inputs.page218.sha256!==continuationSha||approval.inputs.image.sha256!==imageSha||approval.inputs.originalRaw.sha256!==originalRawSha)fail('source_binding');
 const note=approval.note;
 const expected=derive217(parent,note);
 expected.provenance.sourceFieldCorrection=structuredClone(n);
 delete expected.candidateSha256;
 expected.candidateSha256=sha(JSON.stringify(expected));
 // Whole-object equality is the whitelist. Arrays cannot lose/reorder an entry,
 // and metadata/body/caption/non-target figures cannot be smuggled through.
 if(!same(candidate,expected))fail('non_whitelisted_diff');
 if(new Set(candidate.figures[0].unknowns).size!==2)fail('duplicate_unknown');
 const a=documents['north-first'].calls.find(c=>c.callId==='09362d05-d221-427e-b474-a79017ff7619');
 const b=documents['north-second'].pointReceipt,w=documents['west-impact'].receipt;
 if(!a||a.result.outcome!=='unreadable'||!same(a.result.targetBBox,[150,325,175,357]))fail('north_first_evidence');
 if(b.callId!=='20ba52ad-a36c-4edb-b7aa-ae8ff9b89ec6'||b.result.tileCode!=='9m'||!same(b.result.targetBBox,[174,325,196,357]))fail('north_second_evidence');
 if(w.callId!=='6dd8a1d9-44a7-4a8b-958e-cf6a64c18636'||w.classification!=='limited-unknown-acceptable'||!w.result.unknownDisplayFaithful||!w.result.completeRelevantTextCompared||w.result.tileRankReadAttempted||w.result.premiseChecks.length!==6||w.result.premiseChecks.some(p=>p.dependency!=='independent-of-target-number')||!same(w.result.targetBBox,[81,175,112,199]))fail('west_impact_evidence');
 for(const [id,receipt] of [['north-first',a],['north-second',b],['west-impact',w]]){
  const raw=documents[id+'-raw'];
  if(raw.callId!==receipt.callId||!raw.success||!same(raw.output,receipt.result)||raw.requestExecution.model!=='gpt-6.1-terra'||raw.requestExecution.reasoningEffort!=='max'||!raw.requestExecution.images.some(i=>i.sha256===imageSha))fail('independent_raw:'+id);
 }
 const audit=documents.parentAudit,review=audit.modelReview;
 if(audit.status!=='needs-repair'||audit.production.sha256!==approval.inputs.rev4.sha256||!review.completePageCompared||review.flowCheck.verdict!=='faithful'||review.bodyChecks.length!==7||review.bodyChecks.some(b=>b.verdict!=='faithful')||review.issues.some(i=>['error','uncertain'].includes(i.severity)&&i.targetId!=='79-cn-p217-r1'))fail('parent_audit_coverage');
 if(!same(documents.rev4AuditRaw.structuredOutput,review))fail('parent_audit_raw');
 for(const block of parent.body.blocks){
  const owner=block.type==='figure'?parent.figures.find(f=>f.figureId===block.figureId):block;
  const ids=owner.sourceImageBlockIds??owner.sourceBlockIds;
  if(ids.some(id=>!documents.ownership.blocks.some(o=>o.sourceId==='79-cn'&&o.page===217&&o.sourceBlockId===id&&o.chapterId===owner.chapterId&&o.unitId===owner.unitId)))fail('ownership');
 }
 const original=documents.originalRaw;
 if(original.callId!=='e12aa4a6-65f4-4a23-9579-09f887f568be'||!same(original.parsedOutput,JSON.parse(original.rawLastMessage)))fail('original_raw');
 const flow=parent.body.blocks.map(b=>b.type==='text'?{kind:'text',sourceBlockIds:b.sourceBlockIds,text:b.text}:{kind:'figure',regionId:b.figureId});
 if(!same(flow,original.parsedOutput.pageFlow)||!same(parent.body,candidate.body))fail('flow_changed');
 const image=documents.page217.blocks.find(b=>b.id==='79-cn-p217-b8');
 if(image?.imageSha256!==imageSha||image.width!==430||image.height!==463)fail('image_binding');
 // Preserve the actual model raw; the returned overlay explicitly includes the
 // prior, byte-pinned revision chain rather than claiming those were this call.
 const correctedRaw=structuredClone(original.parsedOutput),f=candidate.figures[0];
 correctedRaw.figures[0]={...correctedRaw.figures[0],transcription:f.transcription,unknowns:f.unknowns,caption:f.caption};
 return {correctedRaw,annotationProjection:assemble217Note(documents.page218,note),
  classification:'exact-fields-installed-pending-independent-evidence-consistency',newModelCalls:0,
  pageOrChapterPassed:false,remainingScope:['PDF218–220完整候选及章节覆盖未由本次装配验收','网页变体不在本次修订范围']};
}
function bound(root,p){const t=resolve(root,p),r=relative(resolve(root),t);if(!r||r.startsWith('..')||isAbsolute(r))fail('path');return t;}
export async function load217Correction(root,candidate,candidateSha256){
 const ab=await readFile(bound(root,admissionPath));
 if(sha(ab)!==admissionSha256)fail('approval_changed');
 const approval=JSON.parse(ab),documents={};
 const cb=await readFile(bound(root,approval.candidate.path));
 if(sha(cb)!==candidateSha256||!same(JSON.parse(cb),candidate))fail('candidate_changed');
 for(const [id,input] of Object.entries(approval.inputs)){
  const bytes=await readFile(bound(root,input.path));if(sha(bytes)!==input.sha256)fail('input_changed:'+id);
  if(input.path.endsWith('.json'))documents[id]=JSON.parse(bytes);
 }
 const result=verify217({candidate,parent:documents.parent,approval,candidateSha256,documents});
 return {...result,parent:documents.parent,originalRaw:documents.originalRaw,originalAudit:documents.parentAudit,
  sourcePage:documents.page217,correctionProof:{schema:'coach-pdf217-external-revision-proof/1',
   candidateSha256,parentSha256,admission:{path:admissionPath,sha256:admissionSha256},
   sourceFieldCorrection:candidate.provenance.sourceFieldCorrection,inputs:approval.inputs,
   inheritedAuditStatus:documents.parentAudit.status,pageOrChapterPassed:false}};
}
