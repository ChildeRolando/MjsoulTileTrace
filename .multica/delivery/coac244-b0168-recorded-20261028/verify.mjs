// Read-only validation of existing receipts. Never invoke a maker, auditor, or consumer.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root='E:/AgentData/Coach/knowledge/processing',out=dirname(fileURLToPath(import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex'),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const checks=[],protectedFiles=new Map();
function check(name,passed){checks.push({name,passed:!!passed});if(!passed)throw Error(name);}
async function bind(ref){const p=isAbsolute(ref.path)?ref.path:join(root,ref.path),b=await readFile(p);check('sha:'+p,sha(b)===ref.sha256);protectedFiles.set(p,sha(b));return JSON.parse(b);}
const hp=join(root,'integration/coac249-b0168-reviewed-target-20261028.json');
const h=await bind({path:hp,sha256:'3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c'});
const data={};for(const k of ['candidate','source','parent','parentAudit','producerHandoff','runtime','audit','checkpoint','raw'])data[k]=await bind(h[k]);
const {candidate:c,parent:p,source:s,audit:a,checkpoint:cp,raw,producerHandoff:ph,runtime:manifest}=data;
for(const f of manifest.files){const b=await readFile(f.path);check('frozen:'+f.name,sha(b)===f.sha256);protectedFiles.set(f.path,f.sha256);}
check('exact31 frozen dependencies',manifest.files.length===31);
const id=h.targetId;
check('canonical and target',h.chapterId==='nemata-jp-chapter-283-1'&&id==='modern-yabejp-ja:chapter06-exercise003:b0168');
check('1195 original blocks and524 figures',c.body.blocks.length===1195&&p.body.blocks.length===1195&&c.figures.length===524);
const changed=[];for(let i=0;i<c.body.blocks.length;i++)if(!same(c.body.blocks[i],p.body.blocks[i]))changed.push(i);
check('single target block changed',changed.length===1&&same(c.body.blocks[changed[0]].sourceBlockIds,[id]));
const before=p.body.blocks[changed[0]],after=c.body.blocks[changed[0]],clone=structuredClone(after);clone.text=before.text;
check('only insert 或 after 摸入宝牌',after.text===before.text+'或'&&before.text.endsWith('摸入宝牌')&&same(clone,before));
check('other1194 blocks unchanged',c.body.blocks.filter((_,i)=>i!==changed[0]).every((b,i)=>same(b,p.body.blocks.filter((_,j)=>j!==changed[0])[i])));
check('all524 figures unchanged',same(c.figures,p.figures));
check('target review raw checkpoint handoff exact',same(cp.modelReview,raw.output)&&same(h.modelReview,raw.output)&&same(JSON.parse(raw.rawLastMessage),raw.output));
check('raw model successful terminal',raw.success===true&&raw.exitCode===0&&!raw.timedOut&&raw.events.some(e=>e.type==='turn.completed'));
check('target passed whole chapter remains needs-repair',cp.status==='passed'&&cp.modelChecks.passed&&h.targetStatus==='passed'&&a.status===h.status&&h.status==='needs-repair'&&h.chapterAccepted===false);
check('only target text independently checked',same(raw.output.textChecks.map(x=>x.id),[id])&&raw.output.textChecks[0].verdict==='faithful'&&raw.output.figureChecks.length===0&&raw.output.contextContinuity.faithful&&raw.output.completeTargetScopeCompared&&raw.output.issues.length===0);
check('exact exhausted budget',h.totalBatchCalls===2&&h.totalBatchMax===2&&h.remaining===0&&h.retry===0);
check('same source version',c.source.sourceSha256===h.source.sha256&&p.source.sourceSha256===h.source.sha256);
const ex=raw.requestExecution;
check('actual terra max argv 2 image inputs',ex.model==='gpt-6.1-terra'&&ex.reasoningEffort==='max'&&ex.args[ex.args.indexOf('--model')+1]==='gpt-6.1-terra'&&ex.args.includes('model_reasoning_effort="max"')&&ex.images.length===2&&ex.args.filter(x=>x==='-i').length===2);
for(const image of ex.images){const b=await readFile(image.path);check('real original image:'+image.sha256,sha(b)===image.sha256);protectedFiles.set(image.path,image.sha256);}
const boundaryRel='.multica/delivery/coac-269-web-revision-b-20261027/artifacts/b15-283-b0168/review-request-boundary.json';
const boundaryBytes=execFileSync('git',['show','8a561add329def958c67d9347fe35109ac140ae5:'+boundaryRel]);
check('immutable published boundary recovered exact',sha(boundaryBytes)===h.requestBoundarySha256);
await writeFile(join(out,'original-review-request-boundary.json'),boundaryBytes);
const boundary=JSON.parse(boundaryBytes);
check('actual semantic and transport prompt match published request',raw.prompt===boundary.request.prompt&&raw.requestPrompt===boundary.closedPrompt&&same(raw.schema,boundary.request.schema));
check('exact published image strings enter CLI',same(ex.images.map(x=>x.path),boundary.request.images)&&ex.images.every((x,i)=>ex.args[ex.args.map((v,j)=>v==='-i'?j:-1).filter(j=>j>=0)[i]+1]===boundary.request.images[i]));
check('published only b0168 target no figure targets',same(boundary.scope.targetTextIds,[id])&&same(boundary.scope.targetFigureIds,[]));
const projection=JSON.parse(boundary.request.prompt.slice(boundary.request.prompt.indexOf('{')));
check('full127 source and candidate context includes Q12 all45',projection.source.blocks.length===127&&projection.candidate.blocks.length===127&&Array.from({length:45},(_,i)=>'modern-yabejp-ja:chapter06-exercise003:b'+String(i+151).padStart(4,'0')).every(x=>projection.source.blocks.some(b=>b.id===x)&&projection.candidate.blocks.some(b=>b.sourceBlockIds.includes(x))));
check('published request preserves caller and resolved model distinction',boundary.request.model==='gpt-6.1-sol'&&boundary.request.reasoningEffort==='high'&&boundary.resolvedModel.model==='gpt-6.1-terra'&&boundary.resolvedModel.reasoningEffort==='max');
check('parent source raw production binding',h.producerHandoff.sha256===sha(await readFile(h.producerHandoff.path))&&ph.productionCall.callId==='ae79bc97-e5d0-426c-9845-4c5a1bd17135');
const ledgerPaths=['audit/calls.jsonl','web-production/v1/calls.jsonl'],ledgerBefore={};
for(const rel of ledgerPaths){const b=await readFile(join(root,rel));ledgerBefore[rel]=sha(b);const rows=b.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse),call=rel.startsWith('audit/')?h.call.callId:ph.productionCall.callId;check('one original call ledger record:'+rel,rows.filter(x=>x.callId===call).length===1);}
await bind(h.inheritedBatch010.checkpoint);
const runtimeDir=dirname(h.runtime.path),mod=await import(pathToFileURL(join(runtimeDir,'textbook-audit-web.mjs')).href);
const production=await mod.verifyWebGroupRevisionProduction(root,c);
check('real frozen production verifier succeeds',!!production);
const group=await mod.verifyGroupRevisionAudit(root,h.candidate.path);
check('real frozen target verifier matches aggregate SHA and scope',group.auditSha256===h.audit.sha256&&same(group.revisedGroups,['chapter06-exercise003-batch-002'])&&group.receipt.status==='needs-repair');
let wholeError=null;try{await mod.verifyAuditForWebCandidate(root,h.candidate.path);}catch(e){wholeError=e.message;}
check('whole article verifier still refuses without retry',wholeError==='web_audit_not_passed_or_inputs_changed');
check('original16 deferred issues retained by exact issue hashes',h.deferredOriginalIssues.length===16&&same(h.deferredOriginalIssues,c.provenance.revision.groupRevision.deferred)&&h.deferredOriginalIssues.every(d=>data.parentAudit.batchReviews.some(b=>b.group.batchId===d.batchId&&b.modelReview.issues.some(i=>i.targetId===d.targetId&&i.severity===d.severity&&sha(JSON.stringify(i))===d.issueSha256))));
check('batch010 113 original blocks remains passed',h.inheritedBatch010.status==='passed'&&h.inheritedBatch010.blocks===113);
for(const rel of ledgerPaths)check('no calls appended:'+rel,sha(await readFile(join(root,rel)))===ledgerBefore[rel]);
for(const [path,expected]of protectedFiles)check('original bytes unchanged:'+path,sha(await readFile(path))===expected);
const report={schema:'coac244-b0168-zero-model-verification/1',newCalls:0,passed:true,checks,protectedFiles:[...protectedFiles].map(([path,sha256])=>({path,sha256})),verifierResults:{productionPassed:true,targetGroup:{passed:true,auditSha256:group.auditSha256,revisedGroups:group.revisedGroups},wholeArticle:{passed:false,error:wholeError},originalWrapperExit:1,actualModelRawExit:raw.exitCode},ledgerBefore,ledgerAfter:ledgerBefore,requestBoundarySha256:sha(boundaryBytes),remoteBackend:'Unverified; CLI model/effort and returned events are visible, weights and upstream execution total are not.'};
await writeFile(join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,passed:true,targetStatus:cp.status,chapterStatus:a.status,newCalls:0}));
