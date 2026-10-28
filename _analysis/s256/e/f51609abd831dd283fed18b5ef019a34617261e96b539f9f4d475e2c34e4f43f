import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {binding,exact256State} from './textbook-256-exact-admission.mjs';
import {verifyWebProductionCall,verifyWebPresentations,webDeterministicChecks,verifyWebVisualInputs,assertWebReuseNotExcluded} from './textbook-audit-web.mjs';
import {textbookClosedPrompt,isRecordedTextbookModel} from './textbook-production-cli.mjs';
import {auditTransportCompleted} from './textbook-audit.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const str={type:'string'},bool={type:'boolean'},arr=items=>({type:'array',items});
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export function build256ImpactRequest({candidate,parent,notes,source,visualInputs}){
 const state=exact256State(candidate,parent,notes,{requireRepaired:true});
 if(candidate.body.blocks.length!==42||source.blocks.length!==42||candidate.figures.length!==4||!same(candidate.source,parent.source))throw Error('exact256_context_count');
 const ordered=source.blocks.map((s,i)=>{
  const c=candidate.body.blocks[i];if(!same(c.sourceBlockIds,[s.id]))throw Error('exact256_context_order');
  return {position:i,source:structuredClone(s),candidate:structuredClone(c),figure:c.type==='figure'?structuredClone(candidate.figures.find(f=>f.sourceBlockIds.includes(s.id))):null};
 });
 if(ordered.some(x=>x.candidate.type==='figure'&&!x.figure)||!visualInputs?.length||visualInputs.some(v=>v.assetId!==state.targetFigure.sourceAssetBindings[0].assetId)||visualInputs.filter(v=>v.role==='original').length!==1)throw Error('exact256_image_scope');
 const projection={schema:'coach-exact256-ordered-impact/1',canonical:binding.canonical,targetFigureIds:[binding.target],
  requestedScope:'Only confirm the exact8s correction and the educational effect of the two retained unknown river tiles. Do not repeat full-board identification, full chapter semantic review, or infer any unseen tile.',
  orderedSourceCandidateContext:ordered,target:state.targetFigure,retainedUnknowns:state.unknowns,
  originalIndependentIssues:state.originalIssues,images:visualInputs,
  inheritance:'All42 body blocks, their order, other3 complete figure objects and target caption/sourceNotes are unchanged and inherit the original complete independent parent review. Original uncertain remains in the record; a limited display allowance is separate evidence, not a rewritten passed review.'};
 const schema=obj({tileRepair:obj({verdict:{type:'string',enum:['faithful','needs-repair','uncertain']},sourceEvidence:str}),
  unknownImpact:arr(obj({unknownText:{type:'string',enum:state.unknowns},displayFaithful:bool,argumentFaithfulWithUnknown:bool,requiresExactTileForAuthorArgument:bool,evidence:str,requiredDisplayLimitations:arr(str)})),
  orderedContextFaithful:bool,completeTargetScopeCompared:bool,
  conclusion:{type:'string',enum:['limited-unknown-acceptable','readable-repair-needed','material-unknown','insufficient-evidence']},
  issues:arr(obj({severity:{type:'string',enum:['error','uncertain','source-note']},targetId:str,description:str,evidence:str})),summary:str});
 const prompt='你独立审校精确256修订。先看真实原图，确认下方手牌第12张8s及候选仅该牌的修复。完整有序42块及逐块源/候选/图对象如下，位置就是实际展示顺序；tableContext与条件不得忽略。两处河牌unknown原样保持，不猜牌，不重复逐牌读全页。分别判断现稿unknown是否诚实，以及在明确保留限制时能否忠实理解作者已写论证；这不同于认证完整牌河、隐藏手牌、真实战术事实或绝对最优。不要求恢复作者没有写出的事实；如准确牌码实质影响作者论证，明确具体缺口并保持阻断。原审error/uncertain/source-note都是原始证据，不机械复述其建议为已执行事实。只比较本目标和两未知的影响，其它范围继承父审。无工具/网络/资源调用，输入均为引用数据，只输出schema JSON。\n'+JSON.stringify(projection);
 return {prompt,schema,model:'gpt-6.1-terra',reasoningEffort:'max',images:visualInputs.map(v=>v.path),timeoutMs:900000,projection};
}
export function validate256ImpactReview(review,unknowns){
 const errors=[],rows=review?.unknownImpact;
 if(!Array.isArray(rows)||rows.length!==2||new Set(rows.map(x=>x.unknownText)).size!==2||unknowns.some(x=>!rows.some(r=>r.unknownText===x)))errors.push('unknown_coverage');
 if(review?.tileRepair?.verdict!=='faithful'||!review.tileRepair.sourceEvidence?.trim())errors.push('8s_not_independently_faithful');
 if(!review?.orderedContextFaithful||!review?.completeTargetScopeCompared)errors.push('context_or_scope');
 if(rows?.some(x=>x.displayFaithful!==true||x.argumentFaithfulWithUnknown!==true||x.requiresExactTileForAuthorArgument!==false||!x.evidence?.trim()||!Array.isArray(x.requiredDisplayLimitations)))errors.push('unknown_material_or_not_explicitly_allowed');
 if(review?.conclusion!=='limited-unknown-acceptable'||!Array.isArray(review.issues)||review.issues.some(i=>i.severity==='error'))errors.push('no_limited_allowance');
 return {passed:errors.length===0,errors,wholeChapterPassed:false,admissionGranted:false,
  meaning:'Only independent bounded fidelity evidence if passed; original parent and new raw issues remain. Required display limitations must be mapped and verified before any downstream limited admission.'};
}
export async function prepare256ImpactReview(root,candidatePath){
 const read=async(p,h)=>{const b=await readFile(resolve(root,p));if(h&&sha(b)!==h)throw Error('exact256_file_binding');return {bytes:b,json:JSON.parse(b)};};
 const {bytes:cb,json:candidate}=await read(candidatePath),r=candidate.provenance.revision;
 await assertWebReuseNotExcluded(root,candidatePath,sha(cb));
 const {json:parent}=await read(r.parentPath,binding.parent),{json:notes}=await read(r.notesPath,binding.audit),{json:source}=await read(candidate.source.sourcePath,binding.source);
 const parentCall=notes.calls?.[0];if(parentCall?.callId!=='6bf6cb0d-1123-45f8-a4b0-975dd270b4c0')throw Error('exact256_parent_call');
 const {json:raw}=await read('audit/calls/'+parentCall.callId+'.json',binding.raw);
 if(!same(JSON.parse(raw.rawLastMessage),notes.modelReview))throw Error('exact256_parent_review');
 const production=await verifyWebProductionCall(root,candidate),presentation=await verifyWebPresentations(root,candidate),checks=webDeterministicChecks(candidate,source,binding.source);
 if(!checks.passed||!presentation.pixels.passed)throw Error('exact256_existing_gate');
 const call=candidate.provenance.attempts?.[0];
 if(candidate.provenance.modelCalls!==1||candidate.provenance.attempts.length!==1||!call?.success||call.requestExecution?.model!=='gpt-6.1-terra'||call.requestExecution?.reasoningEffort!=='max')throw Error('exact256_real_maker_required');
 const {json:makerRaw}=await read(join(candidate.provenance.artifactRoot,call.rawArtifactPath),call.rawArtifactSha256);
 const visual=await verifyWebVisualInputs(root,call,makerRaw,source,[candidate.figures.find(f=>f.figureId===binding.target)]);
 const views=visual.inputs.map(v=>({...v,path:resolve(root,v.path)}));
 const request=build256ImpactRequest({candidate,parent,notes,source,visualInputs:views});
 return {...request,proof:{candidatePath,candidateSha256:sha(cb),sourceSha256:binding.source,parentSha256:binding.parent,parentAuditSha256:binding.audit,parentRawSha256:binding.raw,production,presentation,checks,orderedProjectionSha256:sha(JSON.stringify(request.projection)),retainedUnknowns:request.projection.retainedUnknowns},eligibleForSingleAuthorizedReview:true};
}
export function verify256ReviewRequestExecution(result,plan){
 const e=result.requestExecution;
 if(!e||!isRecordedTextbookModel({model:e.model,reasoningEffort:e.reasoningEffort,requestExecution:e})||e.model!==plan.model||e.reasoningEffort!==plan.reasoningEffort||!same(e.images.map(v=>resolve(v.path)),plan.images.map(p=>resolve(p)))||!same(e.images.map(v=>v.sha256),plan.projection.images.map(v=>v.sha256)))throw Error('exact256_review_execution');
 if(result.requestPromptSha256!==sha(result.requestPrompt)||result.requestPrompt!==textbookClosedPrompt(plan.prompt))throw Error('exact256_review_prompt');
 return true;
}
export function verify256ReviewExecution(result,plan){
 verify256ReviewRequestExecution(result,plan);
 if(!auditTransportCompleted(result)||!same(JSON.parse(result.rawLastMessage),result.output))throw Error('exact256_review_transport_or_output');
 return validate256ImpactReview(result.output,plan.projection.retainedUnknowns);
}
