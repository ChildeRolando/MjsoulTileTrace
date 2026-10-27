// Exact COAC-222 revision contract; no new general review route or semantic waiver.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
export const targetFigureMethod='independent-target-figure-review-plus-unchanged-parent-audit';
export const exact222={
 candidate:'c51650a43ec7b124b8aaf0dba0b3d7918f674e150cc710141d7ee6230688357d',
 source:'361ae397c03f0ea2cd58a178341da860a83b6e39ff1ed0baeee6294e13361031',
 parent:'f26e0767a7c2ce54998646bea45175589f9aa48ec7ed8284824ca9e5e3ddf2d6',
 parentAudit:'403417eaef97305d99506bc9d0a2ec39d4128cfedd0a609ecb470f22a4b252ec',
 figure:'79-bilibili-cn:cv1775262:b0018:figure',block:'79-bilibili-cn:cv1775262:b0018',occurrence:'79-bilibili-cn:cv1775262:i00008',
 image:'d2274e920d3d4ce0bf95992da486067edfb14c13ccd227529a050faa0542e7cf',
 point:'55d504fb-96bb-4685-8842-229ff3779df1',pointRaw:'32007944f5764cf41e03c336005e438ff02cb5ac17269aba2afa1be26403f3d6',
 pointHandoff:'60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9',
 bbox:[170,28,196,65],production:'487c0ef8-603e-405a-83ff-5321247f180b',
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const ensure=(ok,code)=>{if(!ok)throw Error('web_target_figure_'+code);};
function bound(root,p){const path=resolve(root,p),rel=relative(resolve(root),path);ensure(rel&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../')&&!isAbsolute(rel),'path');return path;}
export function hasTargetFigureRevision(c){return !!c.provenance?.revision?.figureIds?.length;}
export function check222FigurePreservation(candidate,parent,notes){
 const x=exact222,r=candidate.provenance.revision;
 ensure(candidate.source.sourceId==='79-bilibili-cn'&&candidate.source.articleId==='cv1775262'&&candidate.source.sourceSha256===x.source,'source_scope');
 ensure(r?.parentSha256===x.parent&&r.notesSha256===x.parentAudit&&same(r.figureIds,[x.figure])&&!(r.textBlockIds??[]).length&&!r.firstRevision&&!r.groupRevision,'revision_scope');
 ensure(same(candidate.source,parent.source)&&same(candidate.body,parent.body),'body_changed');
 ensure(same(candidate.figures.map(f=>f.figureId),parent.figures.map(f=>f.figureId))&&candidate.figures.length===10,'figure_set');
 for(const f of candidate.figures){
  const old=parent.figures.find(o=>o.figureId===f.figureId);
  if(f.figureId!==x.figure){ensure(same(f,old),'non_target_changed');continue;}
  ensure((old.transcription.match(/2m/g)??[]).length===2&&f.transcription===old.transcription.replaceAll('2m','1m'),'two_reference_whitelist');
  ensure(f.provenance?.callId===x.production&&f.provenance?.method==='model-transcription'&&f.provenance?.outputSourceBlockId===x.block,'production_identity');
  ensure(same({...f,transcription:old.transcription,provenance:old.provenance},old),'target_other_fields_changed');
  ensure(same(f.sourceBlockIds,[x.block])&&same(f.sourceOccurrenceIds,[x.occurrence])&&f.sourceAssetBindings.length===1&&f.sourceAssetBindings[0].sha256===x.image,'figure_source');
 }
 const review=notes.effectiveModelReview??notes.modelReview;
 ensure(notes.status==='needs-repair'&&review.completeArticleCompared&&review.domOrder.faithful,'parent_review');
 ensure(review.issues.filter(i=>i.severity!=='source-note').length===1&&review.issues.some(i=>i.severity==='error'&&i.targetId===x.figure),'parent_issue_scope');
 ensure(review.blockChecks.every(c=>c.id===x.block?c.verdict==='needs-repair':c.verdict==='faithful')&&review.figureChecks.every(c=>c.id===x.figure?c.verdict==='needs-repair':c.verdict==='faithful')&&review.imageChecks.every(c=>c.disposition==='represented'),'parent_checks_scope');
 return true;
}
const str={type:'string'},obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const checks=(id,fields)=>({type:'array',minItems:1,maxItems:1,items:obj({id:{type:'string',enum:[id]},...fields})});
export function targetFigureSchema(){
 const verdict={enum:['faithful','needs-repair','uncertain']};
 return obj({blockChecks:checks(exact222.block,{verdict,evidence:str}),figureChecks:checks(exact222.figure,{verdict,evidence:str}),imageChecks:checks(exact222.occurrence,{disposition:{enum:['represented','missing','uncertain']},evidence:str}),domOrder:obj({faithful:{type:'boolean'},evidence:str}),contextContinuity:obj({faithful:{type:'boolean'},evidence:str}),semanticCompleteness:obj({complete:{type:'boolean'},evidence:str}),issues:{type:'array',items:obj({severity:{enum:['error','uncertain','source-note']},targetId:{type:'string',enum:[exact222.block,exact222.figure,exact222.occurrence]},sourceEvidence:str,description:str,suggestedRepair:str})},completeTargetScopeCompared:{type:'boolean'},summary:str});
}
export function validateTargetFigureReview(r){
 const errors=[],shape=targetFigureSchema();
 if(!r||!same(Object.keys(r).sort(),Object.keys(shape.properties).sort()))return {passed:false,errors:['target_figure_shape']};
 for(const [key,id,field,value] of [['blockChecks',exact222.block,'verdict','faithful'],['figureChecks',exact222.figure,'verdict','faithful'],['imageChecks',exact222.occurrence,'disposition','represented']]){
  if(!Array.isArray(r[key])||r[key].length!==1||r[key][0]?.id!==id||r[key][0]?.[field]!==value||!r[key][0]?.evidence?.trim()||!same(Object.keys(r[key][0]).sort(),['id',field,'evidence'].sort()))errors.push('target_figure_'+key);
 }
 for(const k of ['domOrder','contextContinuity','semanticCompleteness']){
  const field=k==='semanticCompleteness'?'complete':'faithful';if(r[k]?.[field]!==true||!r[k]?.evidence?.trim()||!same(Object.keys(r[k]).sort(),[field,'evidence'].sort()))errors.push('target_figure_'+k);
 }
 if(r.completeTargetScopeCompared!==true||typeof r.summary!=='string'||!r.summary.trim())errors.push('target_figure_incomplete');
 if(!Array.isArray(r.issues)||r.issues.some(i=>i.severity!=='source-note'||![exact222.block,exact222.figure,exact222.occurrence].includes(i.targetId)||!['sourceEvidence','description','suggestedRepair'].every(k=>typeof i[k]==='string'&&i[k].trim())||!same(Object.keys(i).sort(),['severity','targetId','sourceEvidence','description','suggestedRepair'].sort())))errors.push('target_figure_issue');
 return {passed:errors.length===0,errors};
}
export function mergeTargetFigureReview(parent,r,source,candidate,validateFull){
 const effective=structuredClone(parent),targets=[exact222.block,exact222.figure,exact222.occurrence],checks=validateTargetFigureReview(r);
 for(const key of ['blockChecks','figureChecks','imageChecks'])effective[key]=effective[key].map(c=>targets.includes(c.id)?(r?.[key]?.find(n=>n.id===c.id)??c):c);
 effective.issues=[...effective.issues.filter(i=>!targets.includes(i.targetId)),...(Array.isArray(r?.issues)?r.issues:[])];
 effective.semanticCompleteness={complete:checks.passed,evidence:'Original complete independent parent review plus a new independent target-figure review. All13 text blocks and9 non-target figures are byte-identical; exact two-reference production and prior point evidence independently bound. This is an assembled full review, not a claim that the new call reviewed the full article.'};
 return {review:effective,checks:validateFull(effective,source,candidate)};
}
export async function prepare222FigureRequest(root,{candidate,source,bytes,productionCall}){
 const x=exact222;ensure(sha(bytes)===x.candidate,'candidate_sha');
 const r=candidate.provenance.revision,pb=await readFile(bound(root,r.parentPath)),ab=await readFile(bound(root,r.notesPath));
 ensure(sha(pb)===x.parent&&sha(ab)===x.parentAudit,'parent_sha');
 const parent=JSON.parse(pb),notes=JSON.parse(ab);check222FigurePreservation(candidate,parent,notes);
 ensure(productionCall?.callId===x.production&&productionCall?.revision?.parentCall?.callId==='f64f0d4f-8833-475e-96dd-a9c5f80e2ba9','verified_production_chain');
 const hb=await readFile(bound(root,'integration/coac249-point-222-p217-20261028.json'));
 ensure(sha(hb)===x.pointHandoff,'point_handoff');
 const point=JSON.parse(hb).calls.find(c=>c.callId===x.point),rb=await readFile(bound(root,point.raw.path)),raw=JSON.parse(rb);
 ensure(sha(rb)===x.pointRaw&&point.raw.sha256===x.pointRaw&&raw.callId===x.point&&same(raw.output,point.result)&&same(JSON.parse(raw.rawLastMessage),raw.output)&&raw.success===true&&!raw.timedOut&&raw.exitCode===0,'point_raw');
 ensure(raw.binding.sourceFileSha256===x.source&&raw.binding.originalSha256===x.image&&raw.binding.targetId===x.figure&&same(raw.binding.bbox,x.bbox)&&point.result.tileCode==='1m'&&point.result.outcome==='readable'&&same(point.result.targetBBox,x.bbox),'point_identity');
 const figure=candidate.figures.find(f=>f.figureId===x.figure),asset=figure.sourceAssetBindings[0];
 const views=productionCall.visualInputs?.inputs??[];
 ensure(views.length===2&&views[0].role==='original'&&views[0].sha256===x.image&&views[1].role==='nearest-neighbor-enlargement'&&views[1].scale===4&&views[1].resampling==='nearest'&&views.every(v=>v.sourceSha256===x.image),'visual_scope');
 const images=[];for(const v of views){const path=bound(root,v.path),b=await readFile(path);ensure(sha(b)===v.sha256,'visual_bytes');images.push(path);}
 const targetSource=source.blocks.find(b=>b.id===x.block);ensure(targetSource?.images?.length===1&&targetSource.images[0].occurrenceId===x.occurrence&&targetSource.images[0].assetId===asset.assetId,'source_occurrence');
 const contextIds=[16,17,19,21].map(i=>'79-bilibili-cn:cv1775262:b'+String(i).padStart(4,'0'));
 const context=source.blocks.filter(b=>contextIds.includes(b.id)&&b.type==='text');ensure(context.length===3,'context');
 const projection={schema:'coach-exact-222-target-figure-review/1',canonical:'79-cn-chapter-222-5',targetFigureIds:[x.figure],targetBlockIds:[x.block],targetOccurrenceIds:[x.occurrence],source:{url:source.url,title:source.title,language:source.language,blocks:[targetSource]},candidate:{blocks:candidate.body.blocks.filter(b=>b.sourceBlockIds.includes(x.block)),figures:[figure]},unchangedTeachingContext:{scope:'context-only; no new checks for these source-bound faithful parent text contributions',source:context,candidate:candidate.body.blocks.filter(b=>b.type==='text'&&b.sourceBlockIds.some(id=>contextIds.includes(id)))},originalImages:views,priorIndependentPoint:{callId:x.point,bbox:x.bbox,result:point.result,scope:'Prior independently read1m; verify this real production applies the two references faithfully, not a request to repeat point adjudication or infer other tiles.'},coverage:'Only block b0018, its figure and occurrence are newly reviewed. Original full parent13 text/9 other figures inherit only after exact byte/provenance verification; completeTargetScopeCompared does not mean full article newly reviewed.'};
 const proof={schema:'coach-exact-222-target-figure-contract/1',candidateSha256:x.candidate,sourceSha256:x.source,parent:{path:r.parentPath,sha256:sha(pb)},parentAudit:{path:r.notesPath,sha256:sha(ab)},point:{handoffSha256:sha(hb),rawPath:point.raw.path,rawSha256:sha(rb),callId:x.point,bbox:x.bbox,reading:'1m'},helperSha256:sha(await readFile(new URL(import.meta.url))),targetFigureIds:[x.figure],targetBlockIds:[x.block],targetOccurrenceIds:[x.occurrence],views,contextSourceBlockIds:context.map(b=>b.id)};
 const prompt='独立校对唯一目标figure的真实修订产物及所附原图/原图4倍最近邻。沿已绑定独立单点1m裁决核两处修订是否忠实，保留例5标签、9张牌顺序、箭头、横置、赤牌、unknown与完整教学上下文；不是重做单点裁决。其它13文字块及9图已按完整独立父审逐字段继承，不输出其新检查。只输出目标block/figure/occurrence各一条检查，允许needs-repair/uncertain，影响教学缺口继续阻断，不能凭主控声明通过。completeTargetScopeCompared仅指本次目标；不得声称新审比较全章。严禁工具/网络/资源读取，只输出schema JSON。\n'+JSON.stringify(projection);
 return {projection,prompt,schema:targetFigureSchema(),model:'gpt-6.1-terra',reasoningEffort:'max',images,timeoutMs:900000,proof,parentReview:notes.effectiveModelReview??notes.modelReview,inheritedCalls:notes.calls};
}
export function verifyTargetFigureExecution(execution,plan){
 if(!execution||execution.schema!=='coach-textbook-cli-request/1'||execution.model!==plan.model||execution.reasoningEffort!==plan.reasoningEffort||execution.images?.length!==2||!same(execution.callerRequested,{model:plan.model,reasoningEffort:plan.reasoningEffort}))return false;
 const a=execution.args??[];
 return a.filter(x=>x==='--model').length===1&&a[a.indexOf('--model')+1]===plan.model&&a.includes('model_reasoning_effort="max"')&&a.filter(x=>x==='-i').length===2&&execution.images.every((i,n)=>i.path===plan.images[n]&&i.sha256===plan.proof.views[n].sha256&&i.bytes>0&&a[a.map((v,k)=>v==='-i'?k:-1).filter(k=>k>=0)[n]+1]===i.path);
}
