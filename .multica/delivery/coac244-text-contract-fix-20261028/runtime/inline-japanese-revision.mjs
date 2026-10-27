import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=s=>{throw Error('inline_japanese_'+s);};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const han=s=>s.length>0&&s.length<=120&&/\p{Script=Han}/u.test(s)&&/^[\p{Script=Han}，、。！？；：·—（）\s]+$/u.test(s);
export function assertInlinePlan(plan,parent,notes,source,bindings){
 if(plan?.schema!=='coach-inline-japanese-revision/1'||plan.authorizationCommentId!=='01a17e4c-8ec2-73f3-8c59-92bb3f8910db'||source.language!=='zh-CN'||parent.body.mode!=='verbatim'||!eq(plan.bindings,bindings)||!Array.isArray(plan.edits)||!plan.edits.length)fail('plan_binding');
 const review=notes.effectiveModelReview??notes.modelReview,ids=[...new Set(plan.edits.map(e=>e.sourceBlockId))];
 const issueIds=[...new Set(review.issues.filter(i=>i.severity!=='source-note').map(i=>i.targetId))];
 if(!eq([...ids].sort(),issueIds.sort())||review.issues.some(i=>i.severity!=='source-note'&&i.severity!=='error'))fail('unresolved_parent_scope');
 for(const id of ids){
  const b=parent.body.blocks.find(b=>b.type==='text'&&eq(b.sourceBlockIds,[id])),s=source.blocks.find(b=>b.id===id);
  if(!b||s?.type!=='text'||b.text!==s.text||!eq(b.sourceSegments,s.segments)||review.blockChecks.find(b=>b.id===id)?.verdict!=='needs-repair')fail('target_source_or_parent_check');
  const seen=[];
  for(const e of plan.edits.filter(e=>e.sourceBlockId===id)){
   if(typeof e.quotedText!=='string'||!/[\u3040-\u30ff]/u.test(e.quotedText)||!['replace','gloss'].includes(e.operation)||s.text.split(e.quotedText).length!==2)fail('non_unique_japanese_span');
   const a=s.text.indexOf(e.quotedText),z=a+e.quotedText.length;
   if(seen.some(([x,y])=>a<y&&z>x))fail('overlapping_span');seen.push([a,z]);
  }
 }
 return ids;
}
export function inlineTextAllowed(plan,id,original,current){
 const edits=plan?.edits?.filter(e=>e.sourceBlockId===id)??[];
 if(!edits.length||typeof current!=='string')return false;
 // The unchanged parent remains a valid input probe; only the independent new
 // review may accept semantic adequacy. An unchanged quote cannot bypass it.
 if(current===original)return true;
 const sorted=edits.map(e=>({...e,at:original.indexOf(e.quotedText)})).sort((a,b)=>a.at-b.at);
 let at=0,pattern='^';
 for(const e of sorted){if(e.at<at)return false;pattern+=escape(original.slice(at,e.at));pattern+=e.operation==='gloss'?escape(e.quotedText)+'（([^（）]*)）':'([\\s\\S]*?)';at=e.at+e.quotedText.length;}
 pattern+=escape(original.slice(at))+'$';const match=new RegExp(pattern,'u').exec(current);
 return Boolean(match&&match.slice(1).every(han));
}
export async function loadInlinePlan(root,binding,candidate,parent,notes,source){
 const p=resolve(root,binding.path),r=relative(resolve(root),p);if(!r||isAbsolute(r)||r==='..'||r.startsWith('..\\')||r.startsWith('../'))fail('path');
 const bytes=await readFile(p),plan=JSON.parse(bytes),revision=candidate.provenance.revision;
 if(sha(bytes)!==binding.sha256||!eq(binding.plan,plan))fail('plan_hash');
 const ids=assertInlinePlan(plan,parent,notes,source,{parentSha256:revision.parentSha256,notesSha256:revision.notesSha256,sourceSha256:candidate.source.sourceSha256});
 if(!eq(ids,revision.textBlockIds)||revision.figureIds.length)fail('targets');
 for(const id of ids){const a=parent.body.blocks.find(b=>b.sourceBlockIds[0]===id),b=candidate.body.blocks.find(b=>b.sourceBlockIds[0]===id);if(!inlineTextAllowed(plan,id,a.text,b.text))fail('outside_quote_whitelist');}
 return {plan,binding,sourceLanguage:'zh-CN',bodyMode:'verbatim-with-bound-inline-translation-only'};
}

export function normalizeKnownInline155(text,parent,plan,callId,rawSha256){
 if(plan.chapterId!=='79-cn-chapter-155-4'||callId!=='676d346d-772e-4662-8fa9-02b236073167'||rawSha256!=='58e786828e31e3acc28fdef753733861a14e1b5331241f515a552d760c557519'||plan.edits.length!==1||plan.edits[0].operation!=='replace')fail('normalization_not_exact_completed_155_call');
 const id=plan.edits[0].sourceBlockId,b=parent.body.blocks.find(b=>eq(b.sourceBlockIds,[id]));
 if(!b.sourceSegments.some(s=>s.text.includes(plan.edits[0].quotedText)&&s.marks.some(m=>m.startsWith('strong:')))||text.split('**').length!==3)fail('normalization_not_duplicate_source_strong');
 const normalized=text.replaceAll('**','');
 if(!inlineTextAllowed(plan,id,b.text,normalized)||normalized===text)fail('normalization_outside_original_quote_whitelist');
 return {text:normalized,proof:{method:'exact-completed-155-duplicate-strong-markup-removal/1',callId,rawArtifactSha256:rawSha256,rawTextSha256:sha(text),normalizedTextSha256:sha(normalized),sourceSegmentsSha256:sha(JSON.stringify(b.sourceSegments)),removedMarkers:['**','**'],modelCalls:0}};
}
