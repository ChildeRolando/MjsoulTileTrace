import {it,expect} from 'vitest';
import {checkNativePdfInlineContent} from './textbook-audit-pdf-native.mjs';
import {verifyNativeInlineCorrection} from './textbook-audit-pdf-native-corrections.mjs';

function fixture(){
 const hash='a'.repeat(64),sourceText='原文2s';
 const page={page:7,blocks:[{id:'t1',type:'text',lines:[{text:sourceText,bbox:[0,0,10,10]}]},{id:'i1',type:'image',bbox:[10,0,20,10],imageSha256:hash}]};
 const captionOld='677m 5067p 224088s',captionNew='677m 5067p 224588s';
 const figure={figureId:'r1',bbox:[10,0,20,10],chapterId:'c',unitId:'u',sourceImageBlockIds:['i1'],sourceImageSha256s:[hash],kind:'mahjong-example',transcription:'手牌 4s 0s 8s 8s，其余非赤。',unknowns:[],caption:captionOld};
 const block={type:'text',sourceBlockIds:['t1'],chapterId:'c',unitId:'u',titleSource:false,sourceText,rawSlotText:'首段[[figure:r1]]尾',text:'首段'+captionOld+'尾',inlineFigureIds:['r1'],inlineContent:[{type:'text',text:'首段'},{type:'figure',figureId:'r1',text:captionOld},{type:'text',text:'尾'}]};
 const source={sourceId:'nemata-jp',page:7,pageDataSha256:'page-sha'};
 const changes=[
  {target:'figure',figureId:'r1',field:'transcription',fromValue:figure.transcription,toValue:'手牌 4s 5s 8s 8s，其余非赤。',replacements:[{from:'0s 8s',to:'5s 8s',occurrences:1}],sourceEvidence:'11th tile is the ordinary 5s in the bound crop.',sourceCrop:{path:'production/x/renders/nemata-jp/page-0007-r1.png',sha256:'crop'}},
  {target:'figure',figureId:'r1',field:'caption',fromValue:captionOld,toValue:captionNew,replacements:[{from:'224088s',to:'224588s',occurrences:1}],sourceEvidence:'hand total follows the corrected 5s.',sourceCrop:{path:'production/x/renders/nemata-jp/page-0007-r1.png',sha256:'crop'}},
 ];
 const correction={schema:'coach-native-inline-field-correction/1',sourceId:'nemata-jp',page:7,parentPath:'production/p/candidates/nemata-jp/page-0007.json',parentSha256:'parent-sha',notesPath:'audit/pages/nemata-jp/page-0007.parent-sha.6baa.json',notesSha256:'notes-sha',originalProductionRaw:{path:'production/p/raw-calls/call.json',sha256:'raw-sha'},sourcePageDataSha256:'page-sha',newProductionModelCalls:0,changes};
 const parent={schema:'coach-textbook-page-draft/3',source,provenance:{flowMode:'native-source-inline-slots'},body:{language:'zh-CN',mode:'translated',flowOrder:'model-inline-source-regions',blocks:[block]},figures:[figure],candidateSha256:'parent-self'};
 const revision=structuredClone(parent);
 revision.figures[0].transcription=changes[0].toValue;revision.figures[0].caption=captionNew;
 revision.body.blocks[0].inlineContent[1].text=captionNew;revision.body.blocks[0].text='首段'+captionNew+'尾';
 revision.provenance.sourceFieldCorrection=correction;revision.candidateSha256='cand-self';
 const raw={pageFlow:[{kind:'text',sourceBlockIds:['t1'],text:block.rawSlotText}],figures:[{regionId:'r1',kind:'mahjong-example',transcription:figure.transcription,unknowns:[],caption:captionOld}]};
 const job={schema:'coach-native-inline-field-correction-job/1',sourceId:'nemata-jp',page:7,candidatePath:'production/x/candidates/nemata-jp/page-0007.json',candidateSha256:'candidate-sha',parentPath:correction.parentPath,parentSha256:'parent-sha',originalAuditSha256:'notes-sha',originalProductionRaw:correction.originalProductionRaw,sourcePageDataSha256:'page-sha',changes,originalReviewErrors:['needs-repair:t1','needs-repair:r1','error:r1']};
 const approval={schema:'coach-native-inline-field-corrections-approval/1',status:'accepted-exact-native-field-corrections-only',approvedBy:'root',approvedAt:'2026-10-27T00:00:00.000Z',jobs:[job]};
 const proof={schema:'coach-native-inline-field-correction-proof/1',candidateSha256:'candidate-sha',parentSha256:'parent-sha',sourceFieldCorrection:correction};
 return {page,parent,revision,raw,job,approval,proof,changes,correction,candidateSha256:'candidate-sha',apply:()=>verifyNativeInlineCorrection({candidate:revision,parent,rawParsed:raw,page,approval,job,correctionProof:proof,candidateSha256:'candidate-sha'})};
}
it('rebuilds exactly the approved revision from the preserved raw and accepts it',()=>{
 const f=fixture(),corrected=f.apply();
 expect(corrected.figures[0].transcription).toBe('手牌 4s 5s 8s 8s，其余非赤。');
 expect(corrected.figures[0].caption).toBe('677m 5067p 224588s');
 expect(()=>checkNativePdfInlineContent(f.revision,f.page,null,corrected)).not.toThrow();
});
it('rejects any field change outside the approved diff',()=>{
 const f=fixture();f.revision.figures[0].unknowns=['1p'];const corrected=f.apply();
 expect(()=>checkNativePdfInlineContent(f.revision,f.page,null,corrected)).toThrow('audit_native_pdf_raw_figure_changed');
});
it('rejects a wrong parent candidate SHA',()=>{
 const f=fixture();f.revision.provenance.sourceFieldCorrection.parentSha256='other';
 expect(f.apply).toThrow('audit_native_inline_correction_provenance');
});
it('rejects a wrong source page SHA',()=>{
 const f=fixture();f.job.sourcePageDataSha256='other';
 expect(f.apply).toThrow('audit_native_inline_correction_provenance');
});
it('rejects a revision whose candidate object does not contain the approved value',()=>{
 const f=fixture();f.revision.figures[0].caption='677m 5067p 224088s';
 expect(f.apply).toThrow('audit_native_inline_correction_candidate_field_mismatch');
});
it('rejects a missed failing audit item',()=>{
 const f=fixture();f.revision.figures.push({...f.revision.figures[0],figureId:'r2'});f.job.originalReviewErrors=['needs-repair:t1','needs-repair:r1','needs-repair:r2'];
 expect(f.apply).toThrow('audit_native_inline_correction_unresolved_audit_item');
});
it('rejects a failing audit item that is not a figure or source block on this page',()=>{
 const f=fixture();f.job.originalReviewErrors=['needs-repair:t1','needs-repair:unknown-target'];
 expect(f.apply).toThrow('audit_native_inline_correction_unapproved_target');
});
it('rejects a non-unique replacement',()=>{
 const f=fixture();f.revision.provenance.sourceFieldCorrection.changes[0].replacements=[{from:'s',to:'x',occurrences:1}];f.job.changes=f.revision.provenance.sourceFieldCorrection.changes;
 expect(f.apply).toThrow('audit_native_inline_correction_replacement_not_unique');
});
it('rejects a from-value that differs from the preserved production raw',()=>{
 const f=fixture();f.raw.figures[0].transcription='手牌 4s 0s 8s 8s，其他。';
 expect(f.apply).toThrow('audit_native_inline_correction_raw_field_mismatch');
});
it('rejects a failing audit item that a field diff cannot resolve',()=>{
 const f=fixture();f.job.originalReviewErrors=['needs-repair:t1','review_coverage:bodyChecks'];
 expect(f.apply).toThrow('audit_native_inline_correction_structural_error');
});
it('rejects a change without bound source evidence',()=>{
 const f=fixture();f.revision.provenance.sourceFieldCorrection.changes[0].sourceCrop=null;f.job.changes=f.revision.provenance.sourceFieldCorrection.changes;
 expect(f.apply).toThrow('audit_native_inline_correction_source_evidence');
});
