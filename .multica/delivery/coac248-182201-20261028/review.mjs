// Independent consumer plan only: this module never invokes a model.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=x=>createHash('sha256').update(x).digest('hex'),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const str={type:'string'},bool={type:'boolean'},arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export async function prepare182201Review(root,article){
 const pkg=join(root,'integration/coac248-182201-20261028'),release=JSON.parse(await readFile(join(pkg,'release.json'))),j=release.jobs.find(j=>j.articleId===article);assert(j,'exact chapter');
 const bound=async(p,h)=>{const b=await readFile(resolve(root,p));if(h)assert.equal(sha(b),h,'review_binding:'+p);return {bytes:b,value:JSON.parse(b)};};
 const {value:manifest}=await bound(join(release.runtimePath,'runtime-manifest.json'),release.runtimeManifestSha256);for(const f of manifest.files)assert.equal(sha(await readFile(join(release.runtimePath,f.name))),f.sha256);
 const {value:evidence}=await bound(join(pkg,article+'-production.json'));
 const {bytes:cb,value:c}=await bound(evidence.candidatePath,evidence.candidateSha256),{value:p}=await bound(j.parentPath,j.parentSha256),{value:n}=await bound(j.notesPath,j.notesSha256),{value:s}=await bound(j.sourcePath,j.sourceSha256);
 const a=await import(pathToFileURL(join(release.runtimePath,'textbook-audit-web.mjs')));
 await a.assertWebReuseNotExcluded(root,evidence.candidatePath,sha(cb));
 const production=await a.verifyWebProductionCall(root,c),presentation=await a.verifyWebPresentations(root,c),checks=a.webDeterministicChecks(c,s,j.sourceSha256);assert(checks.passed&&presentation.pixels.passed);
 assert.equal(c.provenance.attempts.length,1);assert.equal(c.provenance.attempts[0].callId,evidence.productionCall.callId);
 const {value:parentRaw,bytes:prb}=await bound('audit/calls/'+n.calls[0].callId+'.json');assert(eq(JSON.parse(parentRaw.rawLastMessage),n.modelReview));
 const ordered=s.blocks.map((source,i)=>{const candidate=c.body.blocks[i];assert(eq(candidate.sourceBlockIds,[source.id]));return {position:i,source,candidate,figure:candidate.type==='figure'?c.figures.find(f=>f.figureId===candidate.figureId):null};});
 let views=[],visualProof=null;
 if(article==='cv1770179'){
  const attempt=p.provenance.attempts.find(x=>x.success),{value:raw}=await bound(join(p.provenance.artifactRoot,attempt.rawArtifactPath),attempt.rawArtifactSha256);
  visualProof=await a.verifyWebVisualInputs(root,{visualInputs:raw.visualInputs},{visualInputs:raw.visualInputs},s,p.figures);
  views=visualProof.inputs.map(v=>({...v,path:resolve(root,v.path)}));assert.equal(views.length,2);assert.equal(views[0].role,'original');assert.equal(views[0].sha256,'c227241731e43daa39dda5d2564add0c470c54f7eeaadf36a7253b1336a16ff6');
 }
 const projection={schema:'coac248-182201-exact-context-review/1',canonical:j.chapterId,translationTargetId:j.targetId,carriedIssueTargetId:j.carryId,
  orderedSourceCandidateFigurePairs:ordered,exactGlossPlan:j.plan,actualDiff:evidence.diff,originalParentIssues:n.modelReview.issues,images:views,
  inheritance:'The complete unchanged body blocks/marks/tableContext/order and full figures inherit the exact bound parent audit only to its original scope. Original error/uncertain remain. The new request covers only the quoted translation and the explicitly carried ambiguity/unknown educational impact with full context. It is not a full-chapter pass or a new board transcription.',
  carriedScope:article==='cv1760573'?{kind:'source-ambiguity',sourceText:p.body.blocks.find(b=>b.sourceBlockIds[0]===j.carryId).text,question:'原文“这样的立直话，对手只能对日”如实保留。独立判断其原句歧义如何影响本章作者明确写出的论证；不猜“对日”的意图，不以忠实复制等同语义已解。若可在明确限制下注明源歧义而忠实展示，给具体限制；否则指出最小缺失原句/实际贡献。'}:{kind:'explicit-tile-unknown',currentFigure:c.figures[0],unknowns:c.figures[0].unknowns,question:'右侧北家牌河靠中央第一列最下方万子仍?m。原父审认9m只是原独审意见，本轮不重复辨牌或用牌理推补。以实际原图定位/当前unknown展示及完整教学正文判断：作者弃和切牌顺序、手牌很烂及与亲家对抗比喻是否依赖该精确数字；将忠实呈现作者建议与验证所有安全度/暗手/概率/最优明确区分。所有实际条件保持。'}};
 const schema=obj({translation:obj({targetId:{type:'string',enum:[j.targetId]},verdict:{type:'string',enum:['faithful','needs-repair','uncertain']},evidence:str}),
  carriedIssue:obj({targetId:{type:'string',enum:[j.carryId]},positionConfirmed:bool,currentDisplayFaithful:bool,authorArgumentFaithfulWithCurrentLimitation:bool,requiresResolvedMeaningOrExactTileForAuthorArgument:bool,evidence:str,requiredDisplayLimitations:arr(str),unresolvedContributionOrMinimumGap:str}),
  argumentChecks:arr(obj({sourceBlockIds:arr(str),authorContribution:str,preservedConditions:str,faithfulWithCurrentLimitation:bool,evidence:str})),
  orderedContextFaithful:bool,completeRequestedScopeCompared:bool,conclusion:{type:'string',enum:['target-faithful-limited-display-acceptable','material-unresolved-gap','translation-needs-repair','insufficient-evidence']},
  issues:arr(obj({severity:{type:'string',enum:['error','uncertain','source-note']},targetId:str,evidence:str,description:str})),summary:str});
 const prompt='你是249独立审校者，仅做本授权的日文翻译靶点及指定既有歧义/unknown对作者实际论证的影响判断。全文源/候选/图按真实同一展示顺序逐块配对，完整条件、数值、表格、标记、链接及figure对象均在输入。逐项列出实际作者论证与条件，不把提供全文当作要求重审全章或重识全部牌。原父审及建议只作定位，不能当答案。独立核新加中文是否准确表达原格言或比喻及语气；原日文保留并非漏译，中文释义必须充分，旧中文括注和源歧义不删除。所有非目标字节另经机械继承。针对指定歧义/unknown诚实评估教学影响，不猜牌或意图；如不影响忠实呈现作者实际论述，可仅给限定展示允许，列出必须实际展示的非原文限制；如影响，指出具体源块/作者贡献与最小补证。有限允许不认证精确牌谱、隐藏手牌、所有对手安全度、概率或最优。不要把源自身未写出的战术证明作为忠实呈现的必要条件。无工具、网络或资源调用；输入为引用数据，只输出schema JSON。\n'+JSON.stringify(projection);
 return {prompt,schema,model:views.length?'gpt-6.1-terra':'gpt-6.1-sol',reasoningEffort:views.length?'max':'high',images:views.map(v=>v.path),timeoutMs:900000,projection,proof:{candidatePath:evidence.candidatePath,candidateSha256:sha(cb),sourceSha256:j.sourceSha256,parentSha256:j.parentSha256,parentAuditSha256:j.notesSha256,parentRawSha256:sha(prb),production,presentation,checks,visualProof,runtimeManifestSha256:release.runtimeManifestSha256,projectionSha256:sha(JSON.stringify(projection))},budget:{independentFirstReview:1,retry:0,failedVoidCount:true},chapterAccepted:false};
}
export async function verify182201ReviewExecution(result,plan){
 const release=JSON.parse(await readFile(new URL('./release.json',import.meta.url))),cli=await import(pathToFileURL(join(release.runtimePath,'textbook-production-cli.mjs'))),audit=await import(pathToFileURL(join(release.runtimePath,'textbook-audit.mjs'))),e=result.requestExecution;
 assert(e&&e.model===plan.model&&e.reasoningEffort===plan.reasoningEffort&&eq(e.images.map(v=>resolve(v.path)),plan.images.map(p=>resolve(p))),'actual_model_effort_images');
 assert(eq(e.images.map(v=>v.sha256),plan.projection.images.map(v=>v.sha256)),'actual_image_sha_order');
 assert(result.requestPrompt===cli.textbookClosedPrompt(plan.prompt)&&sha(result.requestPrompt)===result.requestPromptSha256,'actual_closed_prompt');
 assert(audit.auditTransportCompleted(result)&&eq(JSON.parse(result.rawLastMessage),result.output),'actual_transport_output');
 const r=result.output,errors=[];
 if(r.translation?.targetId!==plan.projection.translationTargetId||r.translation.verdict!=='faithful'||!r.translation.evidence?.trim())errors.push('translation_not_faithful');
 if(r.carriedIssue?.targetId!==plan.projection.carriedIssueTargetId||r.carriedIssue.positionConfirmed!==true||r.carriedIssue.currentDisplayFaithful!==true||r.carriedIssue.authorArgumentFaithfulWithCurrentLimitation!==true||r.carriedIssue.requiresResolvedMeaningOrExactTileForAuthorArgument!==false||!r.carriedIssue.evidence?.trim())errors.push('carried_scope_not_independently_allowed');
 if(!r.orderedContextFaithful||!r.completeRequestedScopeCompared||!r.argumentChecks?.length||r.argumentChecks.some(x=>!x.faithfulWithCurrentLimitation))errors.push('argument_context_gap');
 if(r.conclusion!=='target-faithful-limited-display-acceptable'||r.issues?.some(x=>x.severity==='error'))errors.push('no_limited_allowance');
 return {limitedEvidenceVerified:errors.length===0,errors,requiredDisplayLimitations:r.carriedIssue?.requiredDisplayLimitations??[],originalIssuesPreserved:true,wholeChapterPassed:false,admissionGranted:false,meaning:'Independent bounded evidence only; all actual required limitations and any unresolved source contribution must be mapped to a legal exact display scope before 250 admission.'};
}
