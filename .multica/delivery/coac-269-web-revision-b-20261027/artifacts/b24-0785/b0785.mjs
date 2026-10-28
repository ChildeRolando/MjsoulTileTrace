// One authorized figure, exact parent/donor bindings; never whole-chapter admission.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyGroupRevisionAudit,verifyWebProductionCall,verifyAuditForWebCandidate} from './textbook-audit-web.mjs';
import {webProductionSchema,validateWebProductionOutput} from './production-schema.mjs';
import {invokeTextbookCodex,prepareTextbookCliRequest} from './textbook-production-cli.mjs';
export const root='E:/AgentData/Coach/knowledge/processing';
export const runtime=fileURLToPath(new URL('.',import.meta.url));
export const stage=root+'/web-production/v1/runs/coac269-283-0785-v1-20261028';
export const load=async p=>JSON.parse(await readFile(p));
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const bind=async p=>({path:p,sha256:sha(await readFile(p))});
export const contract=await load(join(runtime,'0785-contract.json'));
const same=(a,b)=>assert.deepEqual(a,b),figure=(x,id)=>x.figures.find(f=>f.figureId===id);
const json=x=>JSON.stringify(x),save=async(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n',{flag:'wx'});
export async function assertSnapshot(expected){
 assert.match(expected??'',/^[a-f0-9]{64}$/);const bytes=await readFile(join(runtime,'runtime-manifest.json'));assert.equal(sha(bytes),expected);
 for(const f of JSON.parse(bytes).files)assert.equal(sha(await readFile(f.path)),f.sha256);
 for(const b of [contract.source,contract.parent,contract.parentAudit,contract.donor,contract.donorAudit,contract.packet,contract.recoveryManifest,contract.parentRuntime,contract.b1017Pass,contract.donorMaker.raw,contract.donorReview.raw,contract.donorReview.checkpoint,...contract.images,...contract.priorAcceptedEvidence])assert.equal(sha(await readFile(b.path)),b.sha256);
}
export function validatePacket(p){
 same(p.current,contract.parent);same(p.donor,contract.donor);same(p.source,contract.source);
 assert.equal(p.canonical,contract.canonical);assert.equal(p.target,'b0785');assert.equal(p.question,48);
 const expectedIds=[...Array.from({length:9},(_,i)=>i+1),...Array.from({length:7},(_,i)=>784+i)].map(n=>'modern-yabejp-ja:chapter06-exercise003:b'+String(n).padStart(4,'0'));
 same(p.orderedSourceCandidatePairs.map(x=>x.source.id),expectedIds);same(p.commonDefinitionsIds,expectedIds.slice(0,9));same(p.questionSourceBlockIds,expectedIds.slice(9));
 for(const [n,x] of p.orderedSourceCandidatePairs.entries()){assert.equal(x.position,Number(expectedIds[n].split(':b')[1])-1);same(x.candidate.sourceBlockIds,[x.source.id]);assert(Object.hasOwn(x.source,'tableContext')&&Object.hasOwn(x.candidate,'tableContext'));same(x.source.tableContext,x.candidate.tableContext);}
 same(p.originalImagesAndDerivedViews,contract.images);assert.equal(p.donorFigure.provenance.callId,contract.donorMaker.callId);
 assert(p.donorFigureIndependentCheck.preservedUnknowns.acknowledged&&p.donorContextCheck.faithful);
 same(p.expectedFigureNotProduced,contract.expected);
 const restored=structuredClone(contract.expected);restored.transcription=restored.transcription.replace('左上西、右上北、左下南、右下东','左上东、右上北、左下南、右下西');same(restored,p.donorFigure);
 same(p.donorIndependentIssues,[{severity:'error',targetId:contract.targetId,sourceEvidence:'原图中央四角方位为：左上西、右上北、左下南、右下东。',description:'候选将中央左上与右下的东、西对调，造成座位方位信息错误。',suggestedRepair:'将该句改为“四角方位字样按画面位置为：左上西、右上北、左下南、右下东。”'}]);
 return true;
}
export async function verifyInputs(expected){
 await assertSnapshot(expected);const packet=await load(contract.packet.path);validatePacket(packet);
 const parent=await load(contract.parent.path),donor=await load(contract.donor.path),source=await load(contract.source.path);
 same(figure(parent,contract.targetId),packet.currentFigure);same(figure(donor,contract.targetId),packet.donorFigure);
 assert.equal(source.blocks.length,1195);assert.equal(parent.body.blocks.length,1195);assert.equal(parent.figures.length,524);
 for(const x of packet.orderedSourceCandidatePairs){same(source.blocks[x.position],x.source);same(parent.body.blocks[x.position],x.candidate);same(figure(parent,x.currentFigure?.figureId),x.currentFigure??undefined);}
 for(const b of [source.html,source.main,...source.assets])assert.equal(sha(await readFile(root+'/web-sources/v1/'+b.path)),b.sha256);
 const parentReview=await verifyGroupRevisionAudit(root,contract.parent.path),donorReview=await verifyGroupRevisionAudit(root,contract.donor.path);
 assert.equal(parentReview.auditSha256,contract.parentAudit.sha256);assert.equal(donorReview.auditSha256,contract.donorAudit.sha256);
 const current=await load(contract.b1017Pass.path);assert.equal(current.results[0].status,'passed');same(current.candidate.sha256,contract.parent.sha256);
 const cp=await load(contract.donorReview.checkpoint.path),raw=await load(contract.donorReview.raw.path);
 const output=raw.parsedOutput??raw.output;assert(output);assert(json(cp).includes(json(packet.donorFigureIndependentCheck)));assert(json(output).includes(json(packet.donorFigureIndependentCheck)));
 const oldProduction=await verifyWebProductionCall(root,donor);
 let ordinaryError;try{await verifyAuditForWebCandidate(root,contract.parent.path);}catch(e){ordinaryError=e.message;}
 assert.equal(ordinaryError,'web_audit_not_passed_or_inputs_changed');
 return {packet,parent,donor,source,parentAuditSha256:parentReview.auditSha256,donorAuditSha256:donorReview.auditSha256,donorProduction:oldProduction,ordinaryParentError:ordinaryError};
}
export function fields(){return {sourceBlockId:contract.expected.sourceBlockIds[0],...Object.fromEntries(contract.figureFields.map(k=>[k,contract.expected[k]]))};}
export function validateOutput(output){return validateWebProductionOutput(output,{textIds:[],figureIds:[fields().sourceBlockId],fixedFigure:fields(),expectedTranscription:fields().transcription});}
export function validateCandidate(candidate,parent,callId){
 same(candidate.schema,parent.schema);same(candidate.source,parent.source);same(candidate.body,parent.body);assert.equal(candidate.figures.length,524);
 for(let i=0;i<524;i++){
  if(parent.figures[i].figureId!==contract.targetId){assert.equal(json(candidate.figures[i]),json(parent.figures[i]));continue;}
  const expected=structuredClone(contract.expected);expected.provenance={method:'model-transcription',callId,outputSourceBlockId:fields().sourceBlockId};same(candidate.figures[i],expected);
 }
 for(const key of Object.keys(parent).filter(k=>!['provenance','candidateSha256','figures'].includes(k)))same(candidate[key],parent[key]);
 return true;
}
export async function makerPlan(expected){
 const verified=await verifyInputs(expected),p=verified.packet;
 const schema=webProductionSchema({textIds:[],figureIds:[fields().sourceBlockId],fixedFigure:fields()});schema.properties.figures.items.properties.transcription.enum=[fields().transcription];
 const goal={authorization:contract.authorizationComment,currentParent:contract.parent,donor:contract.donor,donorMaker:contract.donorMaker,donorReview:contract.donorReview,assembly:contract.assembly,orderedSourceCandidateContext:p.orderedSourceCandidatePairs,reviewedDonorFigure:p.donorFigure,independentSeatError:p.donorIndependentIssues,expectedFigureNotProduced:fields(),coordinates:p.coordinatesHalfOpen};
 const prompt='仅执行本次已授权的方位修订。以真实独审确认的donor完整figure为固定基线，只把中央左上东/右下西改为左上西/右下东。手牌、摸牌、隐手/牌墙区分、所有unknown、caption/sourceNotes和其它字符原样。完整Q48、9段共同定义与四张原图/像素放大图仅用于核该方位和条件，不重读未知牌，不重译正文。固定expected是制作目标，不是已通过。仅返回translations:[]和唯一完整figure。\n'+json(goal);
 return {prompt,schema,images:contract.images.map(x=>x.path),model:'gpt-6.1-terra',reasoningEffort:'max',timeoutMs:900000};
}
export async function checkExecution(result,plan){
 const ex=result.requestExecution;assert.equal(ex.model,'gpt-6.1-terra');assert.equal(ex.reasoningEffort,'max');assert.equal(ex.policy,'coac244-vision-production-schema-v2-20261028');
 assert.equal(result.requestPromptSha256,sha(result.requestPrompt));
 const {textbookClosedPrompt}=await import('./textbook-production-cli.mjs');assert.equal(result.requestPrompt,textbookClosedPrompt(plan.prompt));
 assert.equal(ex.args[ex.args.indexOf('--model')+1],'gpt-6.1-terra');assert(ex.args.includes('model_reasoning_effort="max"'));
 same(ex.args.flatMap((x,i)=>x==='-i'?[ex.args[i+1]]:[]),plan.images);
 assert.equal(ex.images.length,contract.images.length);
 for(let i=0;i<ex.images.length;i++){assert.equal(ex.images[i].path,plan.images[i]);assert.equal(ex.images[i].sha256,contract.images[i].sha256);assert.equal(sha(await readFile(plan.images[i])),contract.images[i].sha256);assert.equal((await readFile(plan.images[i])).length,contract.images[i].bytes);}
 return true;
}
export async function produce(expected){
 const plan=await makerPlan(expected),parent=await load(contract.parent.path),callId=randomUUID(),runner=await bind(fileURLToPath(import.meta.url)),cli=await bind(join(runtime,'textbook-production-cli.mjs'));
 const result=await invokeTextbookCodex({...plan,stopFiles:[root+'/STOP',root+'/web-production/v1/STOP']});
 const rawPath=root+'/web-production/v1/raw-calls/'+callId+'.json';
 await save(rawPath,{callId,method:'coac269-exact-0785-seat/1',...result,parsedOutput:result.output,semanticPrompt:plan.prompt,schema:plan.schema,runtime:await bind(join(runtime,'runtime-manifest.json')),runner,cli,contract:await bind(join(runtime,'0785-contract.json')),parent:contract.parent,donor:contract.donor});
 const record={callId,sourceId:parent.source.sourceId,articleId:parent.source.articleId,sourceSha256:parent.source.sourceSha256,model:result.requestExecution.model,reasoningEffort:result.requestExecution.reasoningEffort,requestExecution:result.requestExecution,startedAt:result.startedAt,durationMs:result.durationMs,usage:result.usage,success:result.success,transportStatus:result.success?'completed':'failed',rawArtifactPath:relative(root+'/web-production/v1',rawPath).replaceAll('\\','/'),rawArtifactSha256:sha(await readFile(rawPath)),promptSha256:result.requestPromptSha256,schemaSha256:sha(json(plan.schema)),method:'coac269-exact-0785-seat/1',batchId:'chapter06-exercise003-batch-007',targets:{textIds:[],figureIds:[fields().sourceBlockId]},parent:contract.parent,donor:contract.donor,runtime:await bind(join(runtime,'runtime-manifest.json')),runner,cliSnapshot:cli};
 await appendFile(root+'/web-production/v1/calls.jsonl',json(record)+'\n');await save(stage+'/production-result.json',{record,raw:await bind(rawPath),candidate:null});
 if(!result.success)throw Error('0785_maker_failed_raw_and_ledger_preserved_no_retry');
 await checkExecution(result,plan);validateOutput(result.output);await assertSnapshot(expected);
 const candidate=structuredClone(parent),f=figure(candidate,contract.targetId);for(const k of contract.figureFields)f[k]=result.output.figures[0][k];f.provenance={method:'model-transcription',callId,outputSourceBlockId:fields().sourceBlockId};
 candidate.provenance={...parent.provenance,model:record.model,reasoningEffort:record.reasoningEffort,requestExecution:record.requestExecution,attempts:[record],modelCalls:1,usage:record.usage,runnerSha256:runner.sha256,revision:{method:'coac269-exact-parent-and-reviewed-donor-0785/1',parentPath:contract.parent.path,parentSha256:contract.parent.sha256,notesPath:contract.parentAudit.path,notesSha256:contract.parentAudit.sha256,donor:contract.donor,donorAudit:contract.donorAudit,textBlockIds:[],figureIds:[contract.targetId],runtime:record.runtime,contract:await bind(join(runtime,'0785-contract.json'))}};
 validateCandidate(candidate,parent,callId);delete candidate.candidateSha256;candidate.candidateSha256=sha(json(candidate));
 const path=root+'/web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.coac269b0785r1.json';await save(path,candidate);
 const proof={candidate:await bind(path),record,raw:await bind(rawPath),independentStatus:'not-reviewed',wholeChapterAccepted:false};await save(stage+'/candidate-result.json',proof);return proof;
}
export async function verify0785Production(rootArg,candidatePath,expected){
 assert.equal(rootArg,root);await assertSnapshot(expected);const candidate=await load(candidatePath),parent=await load(contract.parent.path),r=candidate.provenance.revision;
 assert.equal(r.method,'coac269-exact-parent-and-reviewed-donor-0785/1');assert.equal(r.parentSha256,contract.parent.sha256);assert.equal(r.notesSha256,contract.parentAudit.sha256);same(r.donor,contract.donor);same(r.donorAudit,contract.donorAudit);same(r.textBlockIds,[]);same(r.figureIds,[contract.targetId]);assert.equal(r.runtime.sha256,expected);
 assert.equal(candidate.provenance.attempts.length,1);const record=candidate.provenance.attempts[0],path=root+'/web-production/v1/'+record.rawArtifactPath,bytes=await readFile(path),raw=JSON.parse(bytes);
 assert.equal(sha(bytes),record.rawArtifactSha256);assert.equal(raw.callId,record.callId);assert(record.success&&raw.success);same(raw.parent,contract.parent);same(raw.donor,contract.donor);assert.equal(raw.runtime.sha256,expected);
 const plan=await makerPlan(expected);same(raw.schema,plan.schema);assert.equal(raw.semanticPrompt,plan.prompt);await checkExecution(raw,plan);validateOutput(raw.parsedOutput);validateCandidate(candidate,parent,record.callId);
 const ledger=(await readFile(root+'/web-production/v1/calls.jsonl','utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.callId===record.callId);same(ledger,[record]);
 assert.equal(record.method,'coac269-exact-0785-seat/1');assert.equal(record.model,'gpt-6.1-terra');assert.equal(record.reasoningEffort,'max');same(record.targets,{textIds:[],figureIds:[fields().sourceBlockId]});
 for(const k of ['startedAt','durationMs','usage','success','requestExecution'])same(record[k],raw[k]);
 assert.equal(record.promptSha256,sha(raw.requestPrompt));assert.equal(record.schemaSha256,sha(json(raw.schema)));
 same(record.runner,await bind(fileURLToPath(import.meta.url)));same(record.cliSnapshot,await bind(join(runtime,'textbook-production-cli.mjs')));
 same(raw.runner,record.runner);same(raw.cli,record.cliSnapshot);same(raw.contract,await bind(join(runtime,'0785-contract.json')));
 const expectedProvenance={...parent.provenance,model:record.model,reasoningEffort:record.reasoningEffort,requestExecution:record.requestExecution,attempts:[record],modelCalls:1,usage:record.usage,runnerSha256:record.runner.sha256,revision:{method:'coac269-exact-parent-and-reviewed-donor-0785/1',parentPath:contract.parent.path,parentSha256:contract.parent.sha256,notesPath:contract.parentAudit.path,notesSha256:contract.parentAudit.sha256,donor:contract.donor,donorAudit:contract.donorAudit,textBlockIds:[],figureIds:[contract.targetId],runtime:record.runtime,contract:await bind(join(runtime,'0785-contract.json'))}};
 same(candidate.provenance,expectedProvenance);
 const copy=structuredClone(candidate);delete copy.candidateSha256;assert.equal(sha(json(copy)),candidate.candidateSha256);
 return {passed:true,candidate:await bind(candidatePath),parent:contract.parent,donor:contract.donor,raw:await bind(path),call:record,unchangedBodyBlocks:1195,unchangedNonTargetBlocks:1194,unchangedNonTargetFigures:523,unknownsPreservedFromReviewedDonor:true,wholeChapterAccepted:false};
}
export async function prepare0785Review(rootArg,candidatePath,expected){
 const production=await verify0785Production(rootArg,candidatePath,expected),candidate=await load(candidatePath),p=await load(contract.packet.path);
 const pairs=p.orderedSourceCandidatePairs.map(x=>({...x,candidate:candidate.body.blocks[x.position],currentFigure:x.currentFigure?figure(candidate,x.currentFigure.figureId):null}));
 const prompt='独立核验唯一b0785方位修订及明确unknown对作者实际论证的影响。真实新候选只对已独审的donor东/西字样作修订，不能因制作提示就判通过。连读完整Q48和9段定义，核原图中央坐标与相关题目条件。此前已审手牌/隐手区分原样继承，不逐牌重识未知，不补猜万子、暗手、遮挡、骰子或裁切。仅审本figure方位和保留未知能否忠实呈现作者论证；若关键unknown仍阻断，要给具体作者论证/字段证据。保留uncertain，不把unknown改error或source-note。不得声称整章passed。\n'+json({candidate:production.candidate,parent:contract.parent,reviewedDonor:contract.donor,priorReview:contract.donorReview,priorFigureCheck:p.donorFigureIndependentCheck,priorContext:p.donorContextCheck,originalSeatError:p.donorIndependentIssues,orderedSourceCandidatePairs:pairs,figure:figure(candidate,contract.targetId),coordinates:p.coordinatesHalfOpen,targetFigureIds:[contract.targetId],targetTextIds:[],excluded:['other figures','other blocks','whole chapter','new tile reading','b0947 assembly']});
 const string={type:'string'},bool={type:'boolean'};
 const schema={type:'object',additionalProperties:false,properties:{targetId:{type:'string',enum:[contract.targetId]},seatVerdict:{type:'string',enum:['faithful','needs-repair','uncertain']},seatEvidence:string,preservedUnknowns:{type:'object',additionalProperties:false,properties:{acknowledged:bool,evidence:string},required:['acknowledged','evidence']},contextFaithful:bool,contextEvidence:string,unknownTeachingImpact:{type:'string',enum:['nonblocking-with-limits','blocking','uncertain']},impactEvidence:string,mandatoryLimits:{type:'array',items:string},issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{severity:{type:'string',enum:['error','uncertain','source-note']},targetId:{type:'string',enum:[contract.targetId]},description:string,sourceEvidence:string},required:['severity','targetId','description','sourceEvidence']}},wholeChapterAccepted:{type:'boolean',enum:[false]}},required:['targetId','seatVerdict','seatEvidence','preservedUnknowns','contextFaithful','contextEvidence','unknownTeachingImpact','impactEvidence','mandatoryLimits','issues','wholeChapterAccepted']};
 return {production,prompt,schema,images:contract.images.map(x=>x.path),model:'gpt-6.1-terra',reasoningEffort:'max',timeoutMs:900000};
}
export async function verify0785ReviewExecution(result,plan,expected){
 await assertSnapshot(expected);await checkExecution(result,plan);assert(result.success,'independent_transport_failed');
 const o=result.output;assert.equal(o.targetId,contract.targetId);assert.equal(o.wholeChapterAccepted,false);assert(['faithful','needs-repair','uncertain'].includes(o.seatVerdict));assert(['nonblocking-with-limits','blocking','uncertain'].includes(o.unknownTeachingImpact));assert.equal(typeof o.contextFaithful,'boolean');assert.equal(typeof o.preservedUnknowns?.acknowledged,'boolean');assert(Array.isArray(o.issues)&&Array.isArray(o.mandatoryLimits));
 for(const k of ['seatEvidence','contextEvidence','impactEvidence'])assert.equal(typeof o[k],'string');
 return {transportCompleted:true,targetPassed:o.seatVerdict==='faithful'&&o.contextFaithful&&o.preservedUnknowns.acknowledged&&!o.issues.some(i=>i.severity!=='source-note'),limitedUnknownOkay:o.unknownTeachingImpact==='nonblocking-with-limits'&&o.mandatoryLimits.length>0,wholeChapterAccepted:false,modelReview:o};
}
if(process.argv[1]===fileURLToPath(import.meta.url)&&process.argv[2]==='produce')console.log(JSON.stringify(await produce(process.argv[3])));
