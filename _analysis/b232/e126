// Only the two explicitly authorized inline translations. Carrying a rejection
// through production does not accept it or change the original review.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const jobs=JSON.parse(readFileSync(new URL('./jobs.json',import.meta.url)));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assertExactCarryPlan(plan,parent,notes,source,bindings){
 const j=jobs.find(j=>j.chapterId===plan?.chapterId);assert(j,'exact_inline_chapter');
 assert(eq(plan,j.plan)&&eq(bindings,j.plan.bindings),'exact_inline_plan_binding');
 assert.equal(sha(parent),j.parentObjectSha256,'exact_inline_parent_object');
 assert.equal(sha(notes),j.notesObjectSha256,'exact_inline_review_object');
 assert.equal(sha(source),j.sourceObjectSha256,'exact_inline_source_object');
 assert.equal(source.language,'zh-CN');assert.equal(parent.body.mode,'verbatim');
 const b=parent.body.blocks.find(b=>eq(b.sourceBlockIds,[j.targetId])),s=source.blocks.find(b=>b.id===j.targetId);
 assert(b&&s&&b.text===s.text&&eq(b.sourceSegments,s.segments),'exact_inline_source_target');
 assert.equal(b.text.split(plan.edits[0].quotedText).length,2);
 assert(notes.modelReview.issues.some(i=>i.targetId===j.targetId&&i.severity==='error'));
 assert(notes.modelReview.issues.some(i=>i.targetId===j.carryId&&['error','uncertain'].includes(i.severity)));
 assert.equal(notes.modelReview.blockChecks.find(c=>c.id===j.targetId)?.verdict,'needs-repair');
 assert(notes.modelReview.completeArticleCompared&&notes.modelReview.domOrder.faithful);
 return [j.targetId];
}
export function exactCarryScope(candidate,parent,notes){
 const r=candidate.provenance?.revision,p=r?.inlineJapanese?.plan;
 if(p?.authorizationCommentId!=='01a181a7-0e17-79cd-9f13-c8fe5cf060b2')return false;
 const j=jobs.find(j=>j.chapterId===p.chapterId);assert(j,'exact_inline_scope_chapter');
 assert.equal(sha(parent),j.parentObjectSha256);assert.equal(sha(notes),j.notesObjectSha256);
 assert(eq(p,j.plan)&&eq(r.textBlockIds,[j.targetId])&&eq(r.figureIds,[]),'exact_inline_scope_targets');
 assert(r.parentSha256===j.parentSha256&&r.notesSha256===j.notesSha256&&candidate.source.sourceSha256===j.sourceSha256,'exact_inline_scope_hashes');
 assert(r.inlineJapanese.path===j.planPath&&r.inlineJapanese.sha256===j.planSha256,'exact_inline_scope_plan');
 assert(eq(candidate.source,parent.source),'exact_inline_source');
 assert(eq(candidate.figures,parent.figures),'exact_inline_all_figures_including_unknowns');
 const c=structuredClone(candidate.body),o=parent.body.blocks.find(b=>eq(b.sourceBlockIds,[j.targetId]));
 const block=c.blocks.find(b=>eq(b.sourceBlockIds,[j.targetId]));assert(block,'exact_inline_target');block.text=o.text;
 assert(eq(c,parent.body),'exact_inline_non_target_body');
 return true;
}
