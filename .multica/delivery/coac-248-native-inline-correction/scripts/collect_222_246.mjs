// Preserve existing display objects exactly; never change a model's raw output.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='E:/AgentData/Coach/knowledge/processing',local=new URL('../',import.meta.url);
const key=process.argv[2],art=({'222-5':'cv1775262','246-3':'cv1785741'})[key];
assert(art,'explicit chapter key required');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=p=>readFile(join(root,p));
const json=async p=>JSON.parse(await bytes(p));
const write=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const run=`web-production/v1/runs/coac248-web-${key}-r1-20261027`;
const pf=await json(run+'/preflight.json'),parentPath=pf.parentPath;
const pb=await bytes(parentPath),p=JSON.parse(pb),nb=await bytes(pf.parentAuditPath),notes=JSON.parse(nb);
assert.equal(sha(pb),pf.parentSha256); assert.equal(sha(nb),pf.parentAuditSha256);
const rawCandidatePath=`web-production/v1/candidates/79-bilibili-cn/${art}.r1.json`;
const candidatePath=`web-production/v1/candidates/79-bilibili-cn/${art}.r1.display.json`;
const rb=await bytes(rawCandidatePath),c=JSON.parse(rb);
assert.equal(c.provenance.modelCalls,1); assert.equal(c.provenance.attempts.length,1);
assert.equal(c.provenance.attempts[0].success,true);
assert.equal(JSON.stringify(c.body),JSON.stringify(p.body));
assert.deepEqual(c.figures.map(f=>f.figureId),p.figures.map(f=>f.figureId));
assert.deepEqual(c.provenance.revision.figureIds,pf.targets);
const runtime='audit/runtimes/web-b8-transport-diag-20261027/textbook-audit-web.mjs';
assert.equal(sha(await bytes('audit/runtimes/web-b8-transport-diag-20261027/textbook-production-cli.mjs')),'ff04388dc5bca14a290ec1e4e1868907063c5bc349d9c1a058f7bfec75e1486a');
const {webDeterministicChecks,verifyWebRevisionContent,verifyWebProductionCall,verifyWebPresentations}=await import(pathToFileURL(join(root,runtime)));
verifyWebRevisionContent(c,p,notes);
const rawProof=await verifyWebProductionCall(root,c);
// Standard lossless display derivation: all figures use their original, byte-bound
// source-image presentation. This restores complete non-target figure objects.
for(const f of c.figures){
 const old=p.figures.find(x=>x.figureId===f.figureId);
 assert(old.presentationAsset);
 assert.deepEqual(f.sourceAssetBindings,old.sourceAssetBindings);
 f.presentationAsset=structuredClone(old.presentationAsset);
}
c.provenance.derivedFromCandidate={path:rawCandidatePath,sha256:sha(rb),reason:'Lossless display bindings inherited from bound parent; model output and all body/figure semantic content unchanged'};
c.provenance.presentationRendererSha256=p.provenance.presentationRendererSha256;
delete c.candidateSha256;c.candidateSha256=sha(JSON.stringify(c));
assert.equal(verifyWebRevisionContent(c,p,notes),true);
const sb=await bytes(c.source.sourcePath),source=JSON.parse(sb);
const checks=webDeterministicChecks(c,source,sha(sb)); assert.equal(checks.passed,true,JSON.stringify(checks));
const productionProof=await verifyWebProductionCall(root,c);
const presentationProof=await verifyWebPresentations(root,c);
assert.equal(presentationProof.pixels.passed,true);
const inherited=[],changes=[];
for(const f of c.figures){
 const old=p.figures.find(x=>x.figureId===f.figureId);
 if(!pf.targets.includes(f.figureId)){
  assert.equal(JSON.stringify(f),JSON.stringify(old));
  inherited.push({figureId:f.figureId,completeObjectSha256:sha(JSON.stringify(f))});
 }else{
  const fields=[...new Set([...Object.keys(old),...Object.keys(f)])].filter(k=>JSON.stringify(old[k])!==JSON.stringify(f[k]));
  changes.push({figureId:f.figureId,fields:fields.map(field=>({field,from:old[field]??null,to:f[field]??null}))});
 }
}
const cb=Buffer.from(JSON.stringify(c,null,2)+'\n');await writeFile(join(root,candidatePath),cb,{flag:'wx'});
const at=new Date().toISOString(),call=c.provenance.attempts[0];
const evidence={schema:'coac248-bounded-figure-revision-evidence/1',recordedAt:at,chapterId:pf.chapter,articleId:art,
 sourcePath:c.source.sourcePath,sourceSha256:sha(sb),parentPath,parentSha256:sha(pb),parentAuditPath:pf.parentAuditPath,parentAuditSha256:sha(nb),
 rawCandidate:{path:rawCandidatePath,sha256:sha(rb),productionProof:rawProof},
 candidatePath,candidateSha256:sha(cb),internalDigest:c.candidateSha256,targets:pf.targets,
 modelCalls:{production:1,audit:0,void:0,failed:call.transportRecovery?1:0,recoveredWithoutNewCall:call.transportRecovery?1:0},productionAttempt:call,checks,productionProof,presentationProof,
 preservation:{bodySha256:sha(JSON.stringify(c.body)),textBlocks:c.body.blocks.filter(x=>x.type==='text').length,
                completeNonTargetFigures:inherited,figureOrder:p.figures.map(f=>f.figureId),allNonTargetBytesPreserved:true},
 changes,assembly:'Existing lossless display derivation restores only bound presentationAsset objects; no raw or model-authored field edited. Complete non-target objects match parent byte for byte under JSON serialization.',
 dispatch:await json(run+'/dispatch-started.json'),release:await json(run+'/slot-released.json'),
 preflight:{path:run+'/preflight.json',sha256:sha(await bytes(run+'/preflight.json'))},
 validator:{path:runtime,sha256:sha(await bytes(runtime))},independentAcceptance:null,status:'awaiting-COAC-249-first-independent-full-article-review'};
await write(join(root,run,'production-evidence.json'),evidence);
await write(new URL(`receipt-web${key}.rev1-awaiting-review.json`,local),evidence);
await copyFile(join(root,candidatePath),new URL(`candidates/${art}.r1.display.json`,local));
const target={kind:'complete-web-candidate',chapterId:pf.chapter,articleId:art,path:join(root,candidatePath).replaceAll('\\','/'),
 sourceId:c.source.sourceId,sourceSha256:sha(sb),sha256:sha(cb),parentSha256:sha(pb),parentAuditSha256:sha(nb),category:'coac248-line-a-targeted-figure-revision',targets:pf.targets};
const configPath=`audit/explicit-targets-coac248-${key}-rev1-20261027.json`;
await write(join(root,configPath),{schema:'coach-explicit-audit-targets/1',createdAt:at,totalTargets:1,source:'COAC-248 authorized finite 222-5/246-3 batch; only this new display SHA',targets:[target]});
const handoffPath=`integration/coac249-incremental-${key}-20261027.json`;
const handoff={schema:'coac248-incremental-independent-review-handoff/1',recordedAt:at,from:'COAC-248',to:'COAC-249',targets:[target],
 auditConfig:{path:configPath,sha256:sha(await bytes(configPath))},
 evidence:{path:run+'/production-evidence.json',sha256:sha(await bytes(run+'/production-evidence.json'))},
 parent:{path:parentPath,sha256:sha(pb),auditPath:pf.parentAuditPath,auditSha256:sha(nb)},
 rawCandidate:{path:rawCandidatePath,sha256:sha(rb),role:'unpresented intermediate of same production call; do not separately review or integrate'},
 transportRecovery:c.provenance.transportRecovery??null,
 limits:{firstIndependentFullArticleReview:1,retry:0,failedVoidCount:true},
 instructions:'独立核完整原文/原图/新稿；父审仅定位。完整from/to含目标caption/sourceNotes，非目标全部字节保留，lossless display逐像素机械验过。只审display交付SHA，不为未展示中间稿另派；passed交250，退回反馈248，不自动重试。B线157-11/205-5、p217/p257、已交090-6不属本件。',semanticAcceptance:null};
await write(join(root,handoffPath),handoff);await write(new URL(`coac249-incremental-${key}-20261027.json`,local),handoff);
await writeFile(new URL(`wakeup-249-${key}-20261027.md`,local),
 `COAC-248 已交 ${pf.chapter}（${art}）首次独立全章审校。先读取本票当前指令/评论，不打断已有在途工作。\n\n`+
 `只新增一个交付SHA：${sha(cb)}，源SHA ${sha(sb)}。\n`+
 `交接：${handoffPath}；显式配置：${configPath}。路径均相对于 E:/AgentData/Coach/knowledge/processing。\n\n`+
 `派发前以完整canonical章ID核最新preview/register/真实passed、候选/源/父审/raw、匹配冻结runtime、STOP和终态同SHA；select-only只应选本候选。不得用尾号跨书匹配。\n`+
 `本件上限1次首次独立全章审校，failed/void计额度，失败即停不自动retry。用完整原文原图独立核对，父审仅作定位；目标caption/sourceNotes全部from/to位于evidence，非目标完整对象及正文/顺序逐字节保留。无损display恢复仅引用绑定源图，已做像素验证，raw未改。\n`+
 `请沿用已验证的web-b8-transport-diag-20261027冻结snapshot（helper ff04388d…），核全依赖manifest，不能热改旧snapshot。${call.transportRecovery?'本件制作原始ledger仍为failed；精确已知HTTPS回退诊断之后turn.completed且schema/usage完整，已有恢复契约导出候选，0新增调用，完整恢复链见candidate.provenance.transportRecovery。':'制作调用直接成功。'}\n`+
 `只审${art}.r1.display.json；${art}.r1.json是同次制作的未展示中间稿，不另审不另合库。passed即交COAC-250；退回精确反馈248。\n`+
 `A线本批仅79-cn-chapter-222-5/246-3，各1制作；B线157-11/205-5互斥，不能揽入本清单。p217/p257保持分流，090-6已交，081-8已通过，都不重做。本线没有自审或宣告passed。每轮前台有限取回收据后退出。\n`,{flag:'wx'});
console.log(JSON.stringify({chapterId:pf.chapter,candidateSha256:sha(cb),checksPassed:true,allNonTargetBytesPreserved:true,
 unchangedFigures:inherited.length,changedFigures:changes.length,callId:call.callId,usage:call.usage,handoff:handoffPath,
 figures:c.figures.filter(f=>pf.targets.includes(f.figureId)).map(f=>({figureId:f.figureId,caption:f.caption,sourceNotes:f.sourceNotes,transcription:f.transcription}))}));
