import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const jobs=JSON.parse(readFileSync(new URL('./mixed-contract.json',import.meta.url)));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const mixedJob=key=>{const j=jobs.find(j=>j.key===key);assert(j,'exact_mixed_chapter');return j;};
export function validateMixedText(j,text){
 assert(typeof text==='string'&&text.startsWith(j.textPrefix)&&text.endsWith(j.textSuffix)&&text!==j.textBefore,'exact_mixed_text_outer');
 const span=text.slice(j.textPrefix.length,text.length-j.textSuffix.length);
 assert(span.length>0&&span.length<=150&&/\p{Script=Han}/u.test(span)&&!/[0-9a-zA-Z\n\r]/u.test(span),'exact_mixed_text_span');
 assert(!/[\u3040-\u30ff]/u.test(span.replaceAll('入り目','')),'exact_mixed_untranslated_span');
 return true;
}
export function verifyMixedContent(candidate,parent,notes){
 const r=candidate.provenance.revision,j=mixedJob(r.exact193213.key);
 assert.equal(r.exact193213.authorizationCommentId,j.authorizationCommentId);assert.equal(r.exact193213.contractSha256,createHash('sha256').update(readFileSync(new URL('./mixed-contract.json',import.meta.url))).digest('hex'));
 assert.equal(sha(parent),j.parentObjectSha256);assert.equal(sha(notes),j.notesObjectSha256);
 assert(r.parentSha256===j.parentSha256&&r.notesSha256===j.notesSha256&&candidate.source.sourceSha256===j.sourceSha256,'exact_mixed_hashes');
 assert(eq(r.textBlockIds,[j.targetTextId])&&eq(r.figureIds,[j.targetFigureId]),'exact_mixed_targets');
 assert(eq(candidate.source,parent.source)&&candidate.body.mode==='translated','exact_mixed_source');
 const body=structuredClone(candidate.body),b=body.blocks.find(b=>eq(b.sourceBlockIds,[j.targetTextId]));assert(b,'exact_mixed_text_id');
 if(b.text!==j.textBefore)validateMixedText(j,b.text);b.text=j.textBefore;assert(eq(body,parent.body),'exact_mixed_other_body_or_order');
 assert(eq(candidate.figures.map(f=>f.figureId),parent.figures.map(f=>f.figureId)),'exact_mixed_figure_order');
 for(const f of candidate.figures){const old=parent.figures.find(x=>x.figureId===f.figureId);if(f.figureId!==j.targetFigureId){assert(eq(f,old),'exact_mixed_non_target_figure');continue;}
  const copy=structuredClone(f);assert([j.expectedTranscription,old.transcription].includes(copy.transcription),'exact_mixed_transcription');
  assert(eq(copy.unknowns,copy.transcription===old.transcription?old.unknowns:j.expectedUnknowns),'exact_mixed_unknowns');
  copy.transcription=old.transcription;copy.unknowns=old.unknowns;copy.provenance=old.provenance;assert(eq(copy,old),'exact_mixed_other_figure_fields');
 }
 assert(notes.status==='needs-repair'&&notes.modelReview.completeArticleCompared&&notes.modelReview.domOrder.faithful,'exact_mixed_parent_scope');
 for(const id of [j.targetTextId,j.targetFigureId])assert(notes.modelReview.issues.some(i=>i.severity==='error'&&i.targetId===id),'exact_mixed_real_error');
 assert(notes.modelReview.issues.some(i=>i.severity==='uncertain'&&i.targetId===j.targetFigureId),'exact_mixed_uncertain_not_removed');
 return true;
}
export function validateMixedOutput(output,j){
 assert(eq(Object.keys(output).sort(),['figures','translations']));assert.equal(output.translations?.length,1);assert.equal(output.figures?.length,1);
 const t=output.translations[0],f=output.figures[0];assert(eq(Object.keys(t).sort(),['sourceBlockId','text']));assert.equal(t.sourceBlockId,j.targetTextId);validateMixedText(j,t.text);
 assert(eq(Object.keys(f).sort(),['caption','kind','sourceBlockId','sourceNotes','transcription','unknowns'].sort()));assert.equal(f.sourceBlockId,j.targetFigureId.replace(/:figure$/,''));assert.equal(f.transcription,j.expectedTranscription);assert(eq(f.unknowns,j.expectedUnknowns));for(const[k,v]of Object.entries(j.fixedFigure))assert(eq(f[k],v),'exact_mixed_fixed_'+k);
 return true;
}
