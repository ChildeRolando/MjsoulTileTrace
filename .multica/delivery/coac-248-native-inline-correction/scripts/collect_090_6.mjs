// Mechanical provenance/scope checks only. Semantic acceptance belongs to COAC-249.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root='E:/AgentData/Coach/knowledge/processing';
const local=new URL('../',import.meta.url);
const run='web-production/v1/runs/coac248-web-090-6-r1-20261027';
const parentPath='web-production/v1/candidates/79-bilibili-cn/cv1721510.display.json';
const candidatePath='web-production/v1/candidates/79-bilibili-cn/cv1721510.r1.json';
const notesPath='audit/web/articles/79-bilibili-cn/cv1721510.4cb573da8c93c6764aaccb68db5b5dad2fcec66ab3486b39e93696f23745149f.retry-1792942848957-13e1430c.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=async p=>readFile(join(root,p));
const json=async p=>JSON.parse(await bytes(p));
const write=async (p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const cb=await bytes(candidatePath),pb=await bytes(parentPath),nb=await bytes(notesPath);
const c=JSON.parse(cb),p=JSON.parse(pb),notes=JSON.parse(nb),sb=await bytes(c.source.sourcePath),source=JSON.parse(sb);
assert.equal(sha(pb),'4cb573da8c93c6764aaccb68db5b5dad2fcec66ab3486b39e93696f23745149f');
assert.equal(sha(sb),c.source.sourceSha256);
const {candidateSha256,...content}=c;
assert.equal(sha(JSON.stringify(content)),candidateSha256);
const runtime='audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49/textbook-audit-web.mjs';
const {webDeterministicChecks,verifyWebRevisionContent,verifyWebProductionCall}=await import(pathToFileURL(join(root,runtime)));
assert.equal(verifyWebRevisionContent(c,p,notes),true);
const checks=webDeterministicChecks(c,source,sha(sb));
assert.equal(checks.passed,true,JSON.stringify(checks));
const productionProof=await verifyWebProductionCall(root,c);
assert.equal(c.provenance.modelCalls,1);
assert.equal(c.provenance.attempts.length,1);
assert.equal(c.provenance.attempts[0].success,true);
assert.equal(JSON.stringify(c.body),JSON.stringify(p.body));
const targets=c.provenance.revision.figureIds;
assert.deepEqual(targets,['b0004','b0008','b0012'].map(x=>'79-bilibili-cn:cv1721510:'+x+':figure'));
const clean=f=>{const copy={...f};delete copy.presentationAsset;return copy;};
const inherited=[],changes=[];
for(const f of c.figures){
 const old=p.figures.find(x=>x.figureId===f.figureId);
 if(!targets.includes(f.figureId)){
  assert.equal(JSON.stringify(clean(f)),JSON.stringify(clean(old)));
  inherited.push({figureId:f.figureId,contentSha256:sha(JSON.stringify(clean(f))),presentationAssetRemoved:Object.hasOwn(old,'presentationAsset')&&!Object.hasOwn(f,'presentationAsset')});
 }else{
  const fields=[...new Set([...Object.keys(old),...Object.keys(f)])].filter(k=>JSON.stringify(old[k])!==JSON.stringify(f[k]));
  changes.push({figureId:f.figureId,fields:fields.map(field=>({field,from:old[field]??null,to:f[field]??null}))});
 }
}
const record={schema:'coac248-090-6-production-evidence/1',recordedAt:new Date().toISOString(),
 chapterId:'79-cn-chapter-090-6',sourcePath:c.source.sourcePath,sourceSha256:sha(sb),
 parentPath,parentSha256:sha(pb),parentAuditPath:notesPath,parentAuditSha256:sha(nb),parentAuditStatus:notes.status,
 candidatePath,candidateSha256:sha(cb),internalDigest:candidateSha256,targets,
 modelCalls:{production:1,audit:0,void:0,failed:0},productionAttempt:c.provenance.attempts[0],
 checks,productionProof,validator:{path:runtime,sha256:sha(await bytes(runtime))},
 unchangedBody:{sha256:sha(JSON.stringify(c.body)),textBlocks:c.body.blocks.filter(x=>x.type==='text').length},
 unchangedFigures:inherited,changes,
 presentationNote:'Existing runner removes derived presentationAsset references on all six figures; source bindings and non-target semantic figure objects remain identical. Source and previous presentation files are retained.',
 slotAcquired:await json(run+'/dispatch-started.json'),slotReleased:await json(run+'/slot-released.json'),
 reviewStatus:'awaiting-independent-COAC-249-full-article-review',semanticAcceptance:null};
await write(new URL('receipt-web090-6.rev1-awaiting-review.json',local),record);
await write(join(root,run,'production-evidence.json'),record);
const target={kind:'complete-web-candidate',chapterId:record.chapterId,articleId:c.source.articleId,
 path:join(root,candidatePath).replaceAll('\\','/'),sourceId:c.source.sourceId,sourceSha256:sha(sb),sha256:sha(cb),
 parentSha256:sha(pb),parentAuditSha256:sha(nb),category:'coac248-line-a-targeted-figure-revision',targets};
const cfg={schema:'coach-explicit-audit-targets/1',createdAt:record.recordedAt,source:'COAC-248 090-6 bounded revision; one new SHA, first independent full-article audit only',totalTargets:1,targets:[target]};
await write(join(root,'audit/explicit-targets-coac248-090-6-rev1-20261027.json'),cfg);
const handoff={schema:'coac248-incremental-independent-review-handoff/1',recordedAt:record.recordedAt,from:'COAC-248',to:'COAC-249',
 auditConfig:{path:'audit/explicit-targets-coac248-090-6-rev1-20261027.json',sha256:sha(await bytes('audit/explicit-targets-coac248-090-6-rev1-20261027.json'))},
 targets:[target],parent:{path:parentPath,sha256:sha(pb),auditPath:notesPath,auditSha256:sha(nb)},
 productionEvidence:{path:run+'/production-evidence.json',sha256:sha(await bytes(run+'/production-evidence.json'))},
 sourcePrecheck:{path:run+'/preflight.json',sha256:sha(await bytes(run+'/preflight.json'))},
 limits:{firstIndependentFullArticleReview:1,retries:0,failedAndVoidConsumeBudget:true},
 instructions:'核源SHA、候选SHA、父审、真实制作raw/usage和冻结依赖；按完整原文原图逐章独审。父审是定位信息，不是答案。不自审、不重复任何终态同SHA；failed/void也占1次额度，失败即停。passed后交250，needs-repair反馈248。p217/p257本阶段不派。',
 excluded:['081-8 already passed','p217/p257 deferred by owner','B-line claims'],semanticAcceptance:null};
await write(join(root,'integration/coac249-incremental-090-6-20261027.json'),handoff);
await write(new URL('coac249-incremental-090-6-20261027.json',local),handoff);
console.log(JSON.stringify({candidateSha256:sha(cb),checksPassed:true,bodyUnchanged:true,unchangedFigures:inherited.length,changedFigures:changes.length,callId:c.provenance.attempts[0].callId,usage:c.provenance.usage,handoff:'integration/coac249-incremental-090-6-20261027.json'}));
