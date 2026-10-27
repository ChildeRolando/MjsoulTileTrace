// Exact input repair for chapter100. Constructs a request; never invokes a model.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',here=import.meta.dirname;
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const runtime=join(here,'verification-runtime');
const web=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')));
const cli=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')));
const auditBase=await import(pathToFileURL(join(runtime,'textbook-audit.mjs')));
export async function prepareContext100Request(){
 const input=await load(join(here,'100-input.json'));
 const candidateBytes=await readFile(input.candidate.path),sourceBytes=await readFile(input.source.path),auditBytes=await readFile(input.audit.path);
 assert.equal(sha(candidateBytes),input.candidate.sha256);assert.equal(input.candidate.sha256,'0439c38228989d2f997036eaa0e4a4522cfb40e6c141469b1c83abf66db2c077');
 assert.equal(sha(sourceBytes),input.source.sha256);assert.equal(sha(auditBytes),input.audit.sha256);
 const candidate=JSON.parse(candidateBytes),source=JSON.parse(sourceBytes),old=JSON.parse(auditBytes);
 for(const f of [source.html,source.main])assert.equal(sha(await readFile(join(root,'web-sources/v1',f.path))),f.sha256);
 // Execute the existing immutable production/parent/raw, pixel and every checkpoint gates.
 await web.verifyWebProductionCall(root,candidate);await web.verifyWebPresentations(root,candidate);
 const records=old.batchReviews,originalGroup=records[1].group;
 assert.equal(records[0].status,'passed');assert.equal(records[2].status,'passed');assert.equal(records[1].status,'needs-repair');
 for(const record of records)await web.verifyWebBatchCheckpoint(root,{source,candidate,bytes:candidateBytes},record.group,record,[],[]);
 const originalRaw=await load(join(root,'audit/calls',records[1].calls[0].callId+'.json'));
 const oldProjection=JSON.parse(originalRaw.prompt.slice(originalRaw.prompt.indexOf('\n')+1));
 assert.equal(oldProjection.source.blocks.some(b=>b.id.endsWith('b0036')),false);
 const contextSourceBlockIds=records[0].group.sourceBlockIds;
 assert.equal(contextSourceBlockIds.length,39);
 const augmentedGroup={...originalGroup,contextSourceBlockIds};
 const selected=new Set([...originalGroup.sourceBlockIds,...contextSourceBlockIds]);
 const figures=candidate.figures.filter(f=>f.sourceBlockIds.some(id=>selected.has(id)));
 for(const f of figures){assert(old.modelReview.figureChecks.some(c=>c.id===f.figureId&&c.verdict==='faithful'));for(const i of f.sourceOccurrenceIds)assert(old.modelReview.imageChecks.some(c=>c.id===i&&c.disposition==='represented'));for(const a of f.sourceAssetBindings)assert.equal(sha(await readFile(join(root,a.path))),a.sha256);}
 // All exact tile identities already have same-SHA independent image checks. No new vision request.
 const known=[...new Set(figures.flatMap(f=>f.sourceAssetBindings.map(a=>a.assetId)))];
 const scope=web.webBatchReviewScope(source,candidate,augmentedGroup,known,[]);
 assert.equal(scope.originals.length,0);assert.equal(scope.supplemental.length,0);
 scope.projection.schema='coach-chapter100-bound-premise-supplement/1';
 scope.projection.originalReviewGroup=originalGroup;
 scope.projection.imageReuseEvidence={sourceAuditSha256:input.audit.sha256,originalCalls:records.map(r=>r.calls[0].callId),scope:'Unchanged exact figures/occurrences inherit existing independent faithful image checks; this call is not another visual examination.'};
 const schema=web.webBatchReviewSchema(source,candidate,originalGroup);
 const proof={schema:'coach-chapter100-context-input-binding/1',canonical:input.canonical,candidate:input.candidate,source:input.source,oldAudit:input.audit,originalGroup,additionalContextSourceBlockIds:contextSourceBlockIds.filter(id=>!originalGroup.contextSourceBlockIds.includes(id)),inheritedPassedGroups:[records[0].group.batchId,records[2].group.batchId],inheritedPassedBlockCount:243,originalFailedContextCall:records[1].calls[0].callId,productionPlan:input.productionPlan,preparerSha256:sha(await readFile(new URL(import.meta.url))),verificationEntrySha256:sha(await readFile(join(runtime,'textbook-audit-web.mjs'))),semanticProjectionSha256:sha(JSON.stringify(scope.projection)),schemaSha256:sha(JSON.stringify(schema))};
 const prompt='独立核第100章唯一原受阻题解组的A/B共享前提关联。目标仍是原batch002的68块，不重审另外两组已pass243块；b0001–b0039及对应候选只作完整定义上下文，不输出其新检查。b0036明确定义A/B；b0004起四项条件及反向条件、例外和b0037–39解释须共同理解，不根据牌例猜定义。原同SHA独立图检查/精确资产继承，本次无图片，不声称新视觉审校。保持词义、力度、条件、例外和全部题解的忠实对应；可输出uncertain，不能因补了上下文自动通过。completeBatchCompared仅指目标组。严禁工具/网络/资源，只输出schema JSON。\n'+JSON.stringify(scope.projection);
 return {prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:[],timeoutMs:900000,projection:scope.projection,proof,old,source,candidate};
}
export function validateContext100Response(review,plan){return web.validateWebBatchReview(review,plan.source,plan.candidate,plan.proof.originalGroup);}
export function mergeContext100Response(review,plan){
 const checks=validateContext100Response(review,plan);assert(checks.passed,'independent context review must pass, including every target and contextContinuity');
 // This is an effective-review reconstruction only, never a replacement raw/checkpoint.
 const old=plan.old.modelReview,targetIds=new Set(plan.proof.originalGroup.sourceBlockIds),targetFigures=new Set(plan.candidate.figures.filter(f=>f.sourceBlockIds.some(id=>targetIds.has(id))).map(f=>f.figureId)),targetImages=new Set(plan.source.blocks.filter(b=>targetIds.has(b.id)).flatMap(b=>b.images??[]).map(i=>i.occurrenceId));
 const effective=structuredClone(old);
 for(const [k,ids]of[['blockChecks',targetIds],['figureChecks',targetFigures],['imageChecks',targetImages]])effective[k]=old[k].map(c=>ids.has(c.id)?review[k].find(n=>n.id===c.id):c);
 effective.issues=[...old.issues.filter(i=>!targetIds.has(i.targetId)&&!targetFigures.has(i.targetId)&&!targetImages.has(i.targetId)),...review.issues];
 effective.domOrder={faithful:review.domOrder.faithful&&review.contextContinuity.faithful,evidence:'Bound original full review plus independent context-supplement group review; all source/candidate bytes and other passed groups unchanged.'};
 effective.semanticCompleteness={complete:checks.passed,evidence:'Only original batch002 received added original A/B definitions; accepted batch001 and003 remain inherited.'};
 return {review:effective,checks:web.validateWebReview(effective,plan.source,plan.candidate)};
}
export function verifyContext100Raw(raw,plan){
 assert.equal(raw.scope,'textbook-web-chapter100-bound-context-supplement');
 assert.deepEqual(raw.binding.contextSupplement,plan.proof);
 assert.equal(raw.model,'gpt-6.1-sol');assert.equal(raw.reasoningEffort,'high');assert(cli.isRecordedTextbookModel(raw));assert.deepEqual(raw.requestExecution.images,[]);
 assert.equal(raw.requestExecution.args.includes('-i'),false);assert.equal(raw.requestExecution.args[raw.requestExecution.args.indexOf('--model')+1],'gpt-6.1-sol');assert(raw.requestExecution.args.includes('model_reasoning_effort="high"'));
 assert.equal(raw.prompt,plan.prompt);assert.deepEqual(raw.schema,plan.schema);assert.equal(raw.requestPrompt,cli.textbookClosedPrompt(plan.prompt));
 assert.equal(raw.semanticPromptSha256,sha(plan.prompt));assert.equal(raw.promptSha256,sha(raw.requestPrompt));assert.equal(raw.schemaSha256,sha(JSON.stringify(plan.schema)));assert.equal(raw.outputSha256,sha(raw.rawLastMessage));
 assert(auditBase.auditTransportCompleted(raw));assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));
 return mergeContext100Response(raw.output,plan);
}
/** Read a real immutable ledger/raw after an authorized call. This function cannot invoke one. */
export async function verifyRecordedContext100Call(callId){
 assert(/^[a-f0-9-]{36}$/.test(callId));const plan=await prepareContext100Request(),rawPath=join(root,'audit/calls',callId+'.json'),bytes=await readFile(rawPath),raw=JSON.parse(bytes);
 assert.equal(raw.callId,callId);assert(raw.success);assert(!plan.old.calls.some(c=>c.callId===callId),'cannot reuse an old missing-input call as new review');
 const ledger=(await readFile(join(root,'audit/calls.jsonl'),'utf8')).split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(c=>c.callId===callId);assert.equal(ledger.length,1);
 for(const k of ['callId','scope','model','reasoningEffort','requestExecution','binding','success','usage','promptSha256','semanticPromptSha256','schemaSha256','outputSha256'])assert.deepEqual(raw[k],ledger[0][k]);
 const merged=verifyContext100Raw(raw,plan);assert(merged.checks.passed);
 return {schema:'coach-exact100-independent-context-supplement/1',status:'passed',method:'independent-bound-context-review-plus-unchanged-passed-groups',source:plan.candidate.source,production:{path:plan.proof.candidate.path,sha256:plan.proof.candidate.sha256},contextSupplement:plan.proof,originalAudit:plan.proof.oldAudit,newCall:ledger[0],raw:{path:rawPath,sha256:sha(bytes)},calls:[ledger[0]],inheritedCalls:plan.old.calls,modelReview:raw.output,modelChecks:validateContext100Response(raw.output,plan),effectiveModelReview:merged.review,effectiveModelChecks:merged.checks,semanticCompleteness:merged.review.semanticCompleteness,originalAuditChanged:false,originalCandidateChanged:false};
}
/** A new sidecar is never an overwrite of the original needs-repair audit. */
export async function recordContext100Supplement(callId){
 const verified=await verifyRecordedContext100Call(callId),path=join(root,'audit/web/articles/modern-yabejp-ja','chapter01-section035.'+verified.production.sha256+'.context100-v2.json');
 await writeFile(path,JSON.stringify(verified,null,2)+'\n',{flag:'wx'});return verifyContext100Supplement(root,verified.production.path);
}
/** Existing stageWebTextbook supports a verified callback; no generic gate is relaxed. */
export async function verifyContext100Supplement(processingRoot,candidatePath){
 assert.equal(resolve(processingRoot),resolve(root));const plan=await prepareContext100Request();assert.equal(resolve(root,candidatePath),resolve(plan.proof.candidate.path));
 const path=join(root,'audit/web/articles/modern-yabejp-ja','chapter01-section035.'+plan.proof.candidate.sha256+'.context100-v2.json'),bytes=await readFile(path),saved=JSON.parse(bytes),verified=await verifyRecordedContext100Call(saved.newCall.callId);assert.deepEqual(saved,verified);return {...verified,auditPath:path,auditSha256:sha(bytes)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const plan=await prepareContext100Request(),work=await mkdtemp(join(here,'request100-'));
const actual=await cli.prepareTextbookCliRequest({...plan,work});
const tests=[];function test(name,fn){fn();tests.push({name,passed:true});}
test('actual wrapped CLI stdin includes full bound definitions and all68 target blocks',()=>{assert(actual.closedPrompt.includes(JSON.stringify(plan.projection)));assert.equal(plan.projection.source.blocks.length,107);assert.equal(plan.projection.reviewScope.targetSourceBlockIds.length,68);assert.equal(plan.projection.reviewScope.contextSourceBlockIds.length,39);});
test('same source/candidate definition b0036 actually present',()=>{assert(plan.projection.source.blocks.find(b=>b.id.endsWith('b0036')).text.includes('条件A'));assert(plan.projection.candidate.blocks.some(b=>b.sourceBlockIds.some(id=>id.endsWith('b0036'))));});
test('no original plan/group bytes changed',()=>assert.deepEqual(plan.proof.originalGroup,plan.old.batchReviews[1].group));
test('only original68 IDs enter output schema',()=>assert.deepEqual(plan.schema.properties.blockChecks.items.properties.id.enum,plan.proof.originalGroup.sourceBlockIds));
test('243 passed blocks are context or excluded, never target checks',()=>assert.equal(plan.proof.inheritedPassedBlockCount,243));
test('no image API argument, sol/high unchanged',()=>{assert.equal(actual.args.includes('-i'),false);assert.equal(actual.requestExecution.model,'gpt-6.1-sol');assert.equal(actual.requestExecution.reasoningEffort,'high');});
const old=structuredClone(plan.old.batchReviews[1].modelReview);
test('old missing-context uncertain does not pass just because input was repaired',()=>assert(!validateContext100Response(old,plan).passed));
test('old raw cannot masquerade as new independent supplement',()=>assert.throws(()=>verifyContext100Raw({scope:'textbook-web-complete-unit-batch-audit'},plan)));
const fake=structuredClone(old);for(const c of fake.blockChecks)c.verdict='faithful';fake.issues=[];fake.contextContinuity={faithful:true,evidence:'OFFLINE_FIXTURE'};fake.semanticCompleteness={complete:true,evidence:'OFFLINE_FIXTURE'};
test('fixture merger preserves all non-target original checks',()=>{const merged=mergeContext100Response(fake,plan);assert(merged.checks.passed);const target=new Set(plan.proof.originalGroup.sourceBlockIds);for(const c of plan.old.modelReview.blockChecks)if(!target.has(c.id))assert.deepEqual(merged.review.blockChecks.find(x=>x.id===c.id),c);});
for(const kind of ['missing target','extra context check','uncertain','lost context']){
 const q=structuredClone(fake);if(kind==='missing target')q.blockChecks.pop();if(kind==='extra context check')q.blockChecks.push({id:plan.projection.reviewScope.contextSourceBlockIds[0],verdict:'faithful',evidence:'fixture'});if(kind==='uncertain')q.blockChecks[0].verdict='uncertain';if(kind==='lost context')q.contextContinuity.faithful=false;
 test('reject '+kind,()=>assert(!validateContext100Response(q,plan).passed));
}
const packet={schema:'coac244-chapter100-context-preparation/1',status:'prepared-not-dispatched-not-passed',newModelCalls:0,request:{prompt:plan.prompt,schema:plan.schema,model:plan.model,reasoningEffort:plan.reasoningEffort,images:[]},actualCliConstruction:actual,proof:plan.proof,projection:plan.projection,tests,notes:'Future actual call requires explicit budget authorization, original guard/admission/ledger and bound new raw. verifyContext100Raw rejects old raw and uncertain; no standard audit/raw is written by preparation. Standard downstream sidecar must point to actual new raw and consume this verifier, never fabricate old checkpoint calls.'};
for(const path of [join(here,'100-context-v2.json'),join(root,'integration/coac244-next3-zero-20261028/100-context-v2.json')])await writeFile(path,JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({newModelCalls:0,targets:68,context:39,inheritedPassed:243,images:0,tests:tests.length}));
}
