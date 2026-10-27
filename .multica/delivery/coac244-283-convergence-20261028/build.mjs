// Bounded 283 evidence composition. No invokeTextbookCodex, audit/producer entry, or consumer.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',out=dirname(fileURLToPath(import.meta.url));
const shared=join(root,'integration/coac244-283-convergence-20261028');
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks=[],protectedFiles=new Map();
function ck(name,ok){checks.push({name,passed:!!ok});if(!ok)throw Error(name);}
async function bind(r){const p=isAbsolute(r.path)?r.path:join(root,r.path),b=await readFile(p);ck('bound SHA:'+p,sha(b)===r.sha256);protectedFiles.set(p,r.sha256);return JSON.parse(b);}
async function save(n,d){await writeFile(join(out,n),JSON.stringify(d,null,2)+'\n');return {path:join(shared,n),sha256:sha(await readFile(join(out,n)))};}
const b=await bind({path:'integration/coac249-b0168-reviewed-target-20261028.json',sha256:'3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c'});
const t=await bind({path:'integration/coac249-283-six-table-supplement-20261028.json',sha256:'984eb65c84e40842bc0b0db324e715df309915b3907860a255a149415b3ff946'});
const c=await bind(b.candidate),p=await bind(b.parent),s=await bind(b.source),oldAudit=await bind(b.parentAudit),newAudit=await bind(b.audit),cp=await bind(b.checkpoint),br=await bind(b.raw);
const tr=await bind(t.raw),receipt=await bind(t.receipt),request=await bind(t.request);
const packet=JSON.parse(request.prompt.slice(request.prompt.indexOf('{')));
const runtime=dirname(b.runtime.path),manifest=await bind(b.runtime);
for(const f of manifest.files){const bytes=await readFile(f.path);ck('frozen:'+f.name,sha(bytes)===f.sha256);protectedFiles.set(f.path,f.sha256);}
const mod=await import(pathToFileURL(join(runtime,'textbook-audit-web.mjs')).href);
const cli=await import(pathToFileURL(join(runtime,'textbook-production-cli.mjs')).href);
const ledgerPaths=['audit/calls.jsonl','web-production/v1/calls.jsonl'];
const ledgerBefore={};for(const rel of ledgerPaths)ledgerBefore[rel]=sha(await readFile(join(root,rel)));
const groupProof=await mod.verifyGroupRevisionAudit(root,b.candidate.path);
ck('real b0168 target checkpoint accepts; aggregate remains blocked',groupProof.auditSha256===b.audit.sha256&&cp.status==='passed'&&newAudit.status==='needs-repair'&&same(cp.modelReview,br.output));
ck('b0168 independent target true',br.output.textChecks[0].verdict==='faithful'&&br.output.contextContinuity.faithful&&br.output.completeTargetScopeCompared&&br.output.issues.length===0);
ck('original table receipt and raw passed within limited scope',receipt.status==='passed-for-target-tables'&&!receipt.chapterAccepted&&same(receipt.modelReview,tr.output)&&same(JSON.parse(tr.rawLastMessage),tr.output)&&tr.success&&tr.exitCode===0&&!tr.timedOut);
ck('actual table raw prompt and schema bound to request',request.prompt===tr.prompt&&same(request.schema,tr.schema)&&tr.requestExecution.model==='gpt-6.1-terra'&&tr.requestExecution.reasoningEffort==='max');
ck('actual30 original inputs same order',same(request.images,tr.requestExecution.images.map(i=>i.path))&&request.images.length===30&&tr.requestExecution.args.filter(i=>i==='-i').length===30);
for(const i of tr.requestExecution.images){const bytes=await readFile(i.path);ck('table image bytes:'+i.sha256,sha(bytes)===i.sha256);protectedFiles.set(i.path,i.sha256);}
ck('old candidate and new parent same SHA',t.candidate.sha256===b.parent.sha256&&t.source.sha256===b.source.sha256);
const selected=new Set(packet.projection.source.blocks.map(x=>x.id));
const select=candidate=>{const ss={...s,blocks:s.blocks.filter(x=>selected.has(x.id)),tables:s.tables.filter(x=>packet.targetTableIds.includes(x.tableId??x.id))};const cc={...candidate,body:{...candidate.body,blocks:candidate.body.blocks.filter(x=>selected.has(x.sourceBlockIds[0]))},figures:candidate.figures.filter(x=>selected.has(x.sourceBlockIds[0]))};return mod.webSemanticProjection(ss,cc,[],[],true,3);};
function verifyContent(candidate,source,raw=tr,oldReceipt=receipt,oldRequest=packet){
 const fail=n=>{throw Error(n);};
 if(candidate.body.blocks.length!==1195||candidate.figures.length!==524)fail('candidate-cardinality');
 for(let i=0;i<1195;i++){const x=candidate.body.blocks[i],y=p.body.blocks[i];if(i===167){const clone={...x,text:y.text};if(x.text!==y.text+'或'||!same(clone,y))fail('b0168-only-authorized-diff');}else if(!same(x,y))fail('non-target-body-changed');}
 if(!same(candidate.figures,p.figures))fail('figure-content-changed');
 if(!same(source,s))fail('source-tables-context-changed');
 const projection=select(candidate);
 if(!same(projection.candidate,oldRequest.projection.candidate))fail('actual-audited-candidate-projection-changed');
 if(!same(projection.source,oldRequest.projection.source))fail('actual-audited-source-projection-changed');
 if(!same(raw.output,oldReceipt.modelReview)||!raw.output.completeTargetScopeCompared)fail('raw-receipt-conclusion-unbound');
 if(raw.output.figureChecks.length!==66||raw.output.tableChecks.length!==6||[...raw.output.figureChecks,...raw.output.tableChecks].some(x=>x.verdict!=='faithful'||!x.evidence||x.remainingProblem!=='无'))fail('original-independent-target-not-passed');
 return projection;
}
const projection=verifyContent(c,s);
ck('137 table blocks94 figures6 tables match actual audited payload',projection.candidate.blocks.length===137&&projection.candidate.figures.length===94&&projection.source.tables.length===6);
ck('94 figure tableContext not omitted',projection.candidate.blocks.filter(x=>x.type==='figure').length===94&&projection.candidate.blocks.filter(x=>x.type==='figure').every(x=>x.tableContext&&['tableId','row','column','rowspan','colspan','header'].every(k=>k in x.tableContext)));
const allhash={schema:'coac244-283-value-byte-hashes/1',serialization:'UTF-8 JSON.stringify of each stored object, original property and array order, no text normalization. File formatting bytes are separately bound by candidate SHA.',source:b.source,parent:b.parent,candidate:b.candidate,blocks:c.body.blocks.map((x,i)=>({index:i,id:x.sourceBlockIds[0],parent:hash(p.body.blocks[i]),candidate:hash(x),unchanged:same(x,p.body.blocks[i]),tableContextSha256:hash(x.tableContext??null)})),figures:c.figures.map((x,i)=>({index:i,id:x.figureId,parent:hash(p.figures[i]),candidate:hash(x),unchanged:same(x,p.figures[i])})),sourceBlocks:s.blocks.map((x,i)=>({index:i,id:x.id,sha256:hash(x)}))};
ck('1194 unchanged blocks and524 unchanged figures proven',allhash.blocks.filter(x=>x.unchanged).length===1194&&allhash.figures.every(x=>x.unchanged));
const hashesRef=await save('content-hashes.json',allhash);
const graphRef=await save('inheritance-graph.json',{schema:'coac244-283-candidate-evidence-graph/1',nodes:{source:b.source,parent:b.parent,latest:b.candidate,parentAudit:b.parentAudit,latestAggregate:b.audit,tableReceipt:t.receipt,tableRaw:t.raw,targetCheckpoint:b.checkpoint,targetRaw:b.raw,batch010:b.inheritedBatch010.checkpoint},edges:[{from:'parent',to:'latest',changed:[b.targetId],unchangedBlocks:1194,unchangedFigures:524,hashes:hashesRef},{from:'tableReceipt',to:'latest',kind:'independent-supplement-reuse-on-identical-target-content-and-context',sourceBlocks:137,tableFigures:94,newIndependentFigureTargets:66,tables:6,actualProjectionHash:hash(projection),presentationHash:hash(packet.presentation),imageAttachmentOrderHash:hash(packet.imageAttachmentOrder)},{from:'targetCheckpoint',to:'latest',kind:'independent-first-target-review',target:b.targetId,status:'passed'},{from:'batch010',to:'latest',kind:'unchanged-block-context-inheritance',blocks:113}],wholeChapterAccepted:false});
const negative=[];
function reject(name,fn){let err;try{fn();}catch(e){err=e.message;}ck('negative:'+name,!!err);negative.push({name,error:err});}
reject('missing target tableContext',()=>{const x=structuredClone(c);delete x.body.blocks.find(b=>b.type==='figure'&&b.tableContext).tableContext;verifyContent(x,s);});
reject('changed cell coordinate',()=>{const x=structuredClone(c);x.body.blocks.find(b=>b.type==='figure'&&b.tableContext).tableContext.column=99;verifyContent(x,s);});
reject('changed transcription or unknown',()=>{const x=structuredClone(c);x.figures.find(f=>selected.has(f.sourceBlockIds[0])).unknowns.push('injected');verifyContent(x,s);});
reject('changed table caption or teaching context',()=>{const x=structuredClone(c);x.body.blocks.find(b=>selected.has(b.sourceBlockIds[0])&&b.type==='text').text+='x';verifyContent(x,s);});
reject('changed source blank or arrow table geometry',()=>{const x=structuredClone(s);x.tables[0].cells.pop();verifyContent(c,x);});
reject('omitted actual-audited candidate tableContext',()=>{const q=structuredClone(packet);delete q.projection.candidate.blocks.find(b=>b.type==='figure').tableContext;verifyContent(c,s,tr,receipt,q);});
reject('original raw independent uncertain cannot become passed',()=>{const x=structuredClone(tr),rr=structuredClone(receipt);x.output.figureChecks[0].verdict='uncertain';rr.modelReview=structuredClone(x.output);verifyContent(c,s,x,rr);});
const reuse={schema:'coac244-283-independent-table-supplement-reuse/1',authorization:'01a17f35-32cd-734f-bf71-13be8b8a7eae',chapterId:b.chapterId,status:'passed-for-identical-target-tables-on-derived-candidate',chapterAccepted:false,candidate:b.candidate,source:b.source,parent:b.parent,originalIndependentReceipt:t.receipt,originalIndependentRaw:t.raw,originalRequest:t.request,originalCallId:t.call.callId,contentHashes:hashesRef,inheritanceGraph:graphRef,sourceProjectionSha256:hash(projection.source),candidateProjectionSha256:hash(projection.candidate),tableContextAndConditions:'All137 table blocks,94 figure payloads,6 full tables and exact presentation/30 original-image order equal the independently audited request. No newly inferred tile or semantic verdict.',presentationSha256:hash(packet.presentation),imageAttachmentOrderSha256:hash(packet.imageAttachmentOrder),inheritedIndependentReview:tr.output,inherited28Faithful:t.inheritedFaithfulIds,newModelCalls:0,originalReceiptOrAggregateChanged:false};
reuse.verifier={path:join(shared,'verify-supplement.mjs'),sha256:sha(await readFile(join(out,'verify-supplement.mjs')))};
const reuseRef=await save('table-reuse-supplement.json',reuse);
const geometry=new Set(t.tableResults.map(x=>x.id));geometry.add('modern-yabejp-ja:chapter06-exercise003:b0502');
const issues=oldAudit.modelReview.issues.map(issue=>{const id=issue.targetId;const kind=geometry.has(id)?'DOM/表格几何':issue.severity==='source-note'?'source-note':issue.severity==='uncertain'?'关键未知图/源场况':'语义/条件/图转录';let status='open',evidence=null;if(geometry.has(id)){status='resolved-by-independent-supplement';evidence=reuseRef;}else if(id===b.targetId){status='resolved-by-independent-target-checkpoint';evidence=b.checkpoint;}return {originalIssueSha256:hash(issue),originalIssue:issue,category:kind,status,evidence,owner:id.endsWith('b0099')?'COAC-249/Q8既有在途，不重复派发':'COAC-244/248/269既有目标路径'};});
ck('effective ledger converges19 to7 resolved10 blockers2 notes',issues.filter(x=>x.status.startsWith('resolved')).length===7&&issues.filter(x=>x.status==='open'&&x.category!=='source-note').length===10&&issues.filter(x=>x.category==='source-note').length===2);
const deferred=b.deferredOriginalIssues.map(d=>{const row=issues.find(x=>x.originalIssueSha256===d.issueSha256);if(!row)throw Error('unmapped-original-deferred');return {...d,effectiveStatus:row.status,supplement:row.evidence,originalIssue:row.originalIssue};});
ck('all16 deferred matched6 resolved10 open',deferred.length===16&&deferred.filter(x=>x.effectiveStatus.startsWith('resolved')).length===6&&deferred.filter(x=>x.effectiveStatus==='open').length===10);
const issueRef=await save('effective-issue-register.json',{schema:'coac244-283-effective-issue-register/1',chapterId:b.chapterId,candidate:b.candidate,originalAudit:b.parentAudit,aggregateAuditUnchanged:b.audit,tableSupplement:reuseRef,targetCheckpoint:b.checkpoint,issues,deferred,counts:{originalIssues:19,resolved:7,remainingBlocking:10,sourceNotes:2,originalDeferred:16,effectiveDeferredResolved:6,effectiveDeferredOpen:10},wholeChapterAccepted:false,oldRawOrDeferredModified:false});

// Next two bounded requests are diagnostics on proposed target strings, not produced candidates.
const configs=[{n:396,after:'选择进张宽的④。即使出现不利的',reason:'裏目表示选择后摸到不利进张，不新增选择本身失算的判断。'}, {n:962,after:'也有立直＋断幺九＋平和或345三色同顺的可能，因此不预先锁定染手。染手只考虑清一色就足够了。',reason:'保留メンタンピン三个役的组合关系、或345三色的备选关系以及不预先锁定染手的原判断。'}];
const next=[];
for(const cfg of configs){
 const id='modern-yabejp-ja:chapter06-exercise003:b'+String(cfg.n).padStart(4,'0'),idx=s.blocks.findIndex(x=>x.id===id),old=c.body.blocks[idx];
 const group=oldAudit.batchReviews.find(x=>x.group.sourceBlockIds.includes(id)).group;
 let start=idx;while(start>0&&!/^【問題\d+】/.test(s.blocks[start].text??''))start--;
 let end=idx+1;while(end<s.blocks.length&&!/^【問題\d+】/.test(s.blocks[end].text??''))end++;
 const q=s.blocks.slice(start,end),assets=new Set(q.flatMap(x=>x.images??[]).map(x=>x.assetId));
 const known=s.assets.filter(x=>!assets.has(x.assetId)).map(x=>x.assetId),revision={parentSha256:b.parent.sha256,notesSha256:b.parentAudit.sha256,textBlockIds:[id],figureIds:[]};
 const preview=structuredClone(p);preview.body.blocks[idx].text=cfg.after;
 const scope=mod.webGroupRevisionScope(s,preview,group,revision,known);
 ck('next target preserves complete question:'+id,q.every(x=>scope.projection.source.blocks.some(v=>v.id===x.id)));
 ck('next target only named text:'+id,same(scope.textIds,[id])&&scope.figureIds.length===0);
 ck('next target v3 keeps all tableContext fields:'+id,scope.projection.candidate.blocks.every(x=>same(x.tableContext,p.body.blocks.find(v=>v.sourceBlockIds[0]===x.sourceBlockIds[0]).tableContext)));
 const paths=scope.originals.map(x=>join(root,'web-sources/v1',x.path));const images=[];for(let i=0;i<paths.length;i++){const bytes=await readFile(paths[i]);ck('next original asset hash:'+scope.originals[i].assetId,sha(bytes)===scope.originals[i].sha256);images.push({path:paths[i],sha256:sha(bytes),assetId:scope.originals[i].assetId});}
 const reviewRequest={prompt:mod.groupRevisionPrompt(scope),schema:mod.webGroupRevisionSchema(scope),images:paths,model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:900000};
 const priorIssue=issues.find(x=>x.originalIssue.targetId===id).originalIssue;
 const makerPayload={chapterId:b.chapterId,parent:b.parent,parentAudit:b.parentAudit,source:b.source,target:id,before:old.text,expected:cfg.after,priorIssue,repairGoal:cfg.reason,completeOrderedSource:scope.projection.source,completeOrderedParent:{...scope.projection.candidate,blocks:scope.projection.candidate.blocks.map(x=>({...x,...(x.type==='text'?{text:p.body.blocks.find(v=>v.sourceBlockIds[0]===x.sourceBlockIds[0]).text}:{})}))},imageOccurrenceOrder:q.flatMap(x=>(x.images??[]).map(v=>({sourceBlockId:x.id,occurrenceId:v.occurrenceId,assetId:v.assetId,attachmentIndex:images.findIndex(z=>z.assetId===v.assetId)+1}))),approvedDiffOnly:'Replace the single target text with expected; other characters/blocks/figures/sourceSegments/tableContext unchanged; no new editor note or tile reading.'};
 const makerRequest={prompt:'只执行明确的一段修订目标；不得重译其它段落、增加校注、补齐行内牌或改变作者判断。完整条件/日中上下文均附。仅返回唯一目标的expected文本，其它1194块及524图继承真实父稿；本预检不是已制作候选。\n'+JSON.stringify(makerPayload),schema:{type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[id]},text:{type:'string',enum:[cfg.after]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}},images:[],model:'gpt-6.1-sol',reasoningEffort:'high',timeoutMs:900000};
 const bound={schema:'coac244-283-next-target-preflight/1',notDispatched:true,notProducedCandidate:true,canonical:b.chapterId,target:id,baseParent:b.parent,latestCandidate:b.candidate,latestTargetEqualsBaseParent:true,priorIssue,proposedText:cfg.after,approvedRepairIsNotProduction:true,makerRequest,makerClosedPrompt:cli.textbookClosedPrompt(makerRequest.prompt),makerResolved:cli.textbookRequestConfig([],makerRequest.model,makerRequest.reasoningEffort),reviewRequest,reviewClosedPrompt:cli.textbookClosedPrompt(reviewRequest.prompt),reviewResolved:cli.textbookRequestConfig(paths,reviewRequest.model,reviewRequest.reasoningEffort),actualSourceAndCandidateProjection:scope.projection,images,imageOccurrenceOrder:makerPayload.imageOccurrenceOrder,questionRange:{from:q[0].id,to:q.at(-1).id},group,unchangedScope:'Future branch must preserve all non-target fields and be linked to the latest merged evidence graph; never replace b0168 or table accepted proofs with this diagnostic parent preview.',executionBoundary:'Review payload is built using the original exported groupRevisionPrompt/webGroupRevisionSchema/v3 scope and CLI closed-prompt/config functions. It cannot be dispatched as a passed production candidate. A future actual candidate must first be made by the existing legal group-target producer, its raw/output/source/parent ledger verified, then the independent audit request rebuilt and hash-bound to that actual SHA. The b0168-only exact producer is not reusable for these IDs; the existing generic group-target producer needs the two fixed request targets/expected-output whitelist attached before spending. No producer adapter was changed or claimed exercised in this 0-call stage.',budgetProposal:{maker:1,independentFirstAudit:1,total:2,retry:0,failedVoidCount:true,authorizedNow:false}};
 ck('next actual bound request includes precise expected and whitelist:'+id,bound.makerClosedPrompt.includes(cfg.after)&&same(makerRequest.schema.properties.translations.items.properties.text.enum,[cfg.after]));
 ck('next review request real image order bound:'+id,paths.length>0&&bound.reviewResolved.model==='gpt-6.1-terra'&&bound.reviewResolved.reasoningEffort==='max'&&same(JSON.parse(reviewRequest.prompt.slice(reviewRequest.prompt.indexOf('{'))),scope.projection));
 const ref=await save('next-'+cfg.n+'-request.json',bound);next.push({target:id,packet:ref,maker:1,firstAudit:1,total:2,questionRange:bound.questionRange,images:images.length,scope:'Only the exact text; tiles and source ambiguity retained. Proposed text is not a model product.'});
}
const nextRef=await save('next-two-plan.json',{schema:'coac244-283-next-two-plan/1',chapterId:b.chapterId,targets:next,newCalls:0,futureMaximum:4,failedVoidIncluded:true,retry:0,authorizedNewCalls:0,fee:null,excluded:['Q8/b0099 existing249 run','six tables already independently passed/reused','b0168 already independently passed','batch010113passed','complex images not re-read by these text requests']});
for(const [p,expected]of protectedFiles)ck('original bytes unchanged:'+p,sha(await readFile(p))===expected);
for(const rel of ledgerPaths)ck('no model ledger append:'+rel,sha(await readFile(join(root,rel)))===ledgerBefore[rel]);
const verificationRef=await save('verification.json',{schema:'coac244-283-convergence-verification/1',passed:true,checks,negative,newCalls:0,protectedFiles:[...protectedFiles].map(([path,sha256])=>({path,sha256})),ledgerBefore,verifierSha256:sha(await readFile(fileURLToPath(import.meta.url)))});
await save('registration.json',{schema:'coac244-283-convergence-registration/1',authorization:'01a17f35-32cd-734f-bf71-13be8b8a7eae',chapterId:b.chapterId,candidate:b.candidate,inheritanceGraph:graphRef,contentHashes:hashesRef,independentTableReuse:reuseRef,effectiveIssueRegister:issueRef,nextTwoPlan:nextRef,verification:verificationRef,newModelCalls:0,chapterAccepted:false,wholeAuditUnchanged:b.audit,oldRawChanged:false,newConsumers:0});
await mkdir(shared,{recursive:true});
const {readdir}=await import('node:fs/promises');for(const n of await readdir(out))if(n.endsWith('.json')||n.endsWith('.mjs'))await writeFile(join(shared,n),await readFile(join(out,n)));
console.log(JSON.stringify({passed:true,checks:checks.length,negativeTests:negative.length,resolved:7,remainingBlockers:10,sourceNotes:2,nextTargets:next.map(x=>({target:x.target,images:x.images,questionRange:x.questionRange})),newCalls:0}));
