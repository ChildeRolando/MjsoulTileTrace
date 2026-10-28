// Exact zero-call receipt consumption. No producer, reviewer, service, or queue invocation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const P='E:/AgentData/Coach/knowledge/processing',D=P+'/integration/coac244-311-curves-recorded-20261028';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p)),refs=[];
async function pin(path,expected){const b=await readFile(path),h=sha(b);assert.equal(h,expected,path);refs.push({path,sha256:h,bytes:b.length});return b;}
const fixed=[
 ['coac249-311-curves-owner-handoff-20261028.md','2f51f6c955db20cdef23b6b6a9aaf74107e1a082e6db667db343ed76224da258'],
 ['coac249-311-curves-reviewed-20261028.json','3d86eddcfb776a7eaf07dd8e511b71cb8d501f6d74c35930da6c486dfdd14200'],
 ['coac249-311-curves-inheritance-20261028.json','c98fbb4c76f855fdb4353237977bde62bf52f37e50393f6cd7d23e63375714cd'],
 ['coac249-311-curves-limited-scope-20261028.json','8780afc3098bbbfe3bc6b179535cf8e37188b418517788521b632120ccc23704']];
for(const [n,h]of fixed)await pin(P+'/integration/'+n,h);
const r=await load(P+'/integration/'+fixed[1][0]),proof=await load(P+'/integration/'+fixed[2][0]),scope=await load(P+'/integration/'+fixed[3][0]);
assert.equal(r.canonical,'79-cn-chapter-311-18');assert.equal(r.candidate.sha256,'f44231f95310e33608a596f1f4153f0e35afb55490fc3db1fdccd3fc11d3a125');
for(const k of ['candidate','source','parent','parentAudit','parentRaw','makerRaw','runtime','handoff','raw','plan'])await pin(r[k].path,r[k].sha256);
const manifest=await load(r.runtime.path);assert.equal(manifest.files.length,33);for(const f of manifest.files)await pin(f.path,f.sha256);
const module=await import(pathToFileURL(r.runtime.path.replace('runtime-manifest.json','curves.mjs')));
// Existing immutable gates run on real material, without calling produce or a model.
const production=await module.verifyProduction(r.candidate.path,r.runtime.sha256),plan=await module.prepareReview(r.candidate.path,r.runtime.sha256),raw=await load(r.raw.path);
assert.deepEqual(plan,await load(r.plan.path));assert.deepEqual(raw.output,JSON.parse(raw.rawLastMessage));assert.deepEqual(raw.output,r.modelReview);assert.deepEqual(raw.schema,plan.schema);assert.equal(raw.semanticPrompt,plan.prompt);
const verified=await module.verifyReviewExecution(raw,plan,r.runtime.sha256);assert.deepEqual(verified,r.verification);
assert.equal(verified.transportCompleted,true);for(const k of ['repairPassed','limitedUnknownOkay','wholeChapterPassed'])assert.equal(verified[k],false);
assert.equal(raw.callId,'7777908d-0298-450a-a5f8-a3ff98af7329');assert.equal(raw.binding.productionSha256,r.candidate.sha256);assert.equal(raw.binding.sourceFileSha256,r.source.sha256);assert.equal(raw.binding.parentSha256,r.parent.sha256);assert.equal(raw.binding.parentAuditSha256,r.parentAudit.sha256);
const ledger=(await readFile(P+'/audit/calls.jsonl','utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse).filter(x=>x.callId===raw.callId);assert.equal(ledger.length,1);assert.equal(ledger[0].success,true);
assert.equal(raw.requestExecution.images.length,8);for(const im of raw.requestExecution.images)await pin(im.path,im.sha256);
const candidate=await load(r.candidate.path),parent=await load(r.parent.path),maker=await load(r.makerRaw.path),source=await load(r.source.path),mr=r.modelReview;
assert.deepEqual(candidate.body,parent.body);assert.equal(candidate.body.blocks.length,225);assert.equal(source.blocks.length,225);assert.equal(candidate.figures.length,21);
let unchanged=0;for(const f of parent.figures){const next=candidate.figures.find(x=>x.figureId===f.figureId);if(!r.targetFigureIds.includes(f.figureId)){assert.deepEqual(next,f);unchanged++;}assert.deepEqual(next.sourceAssetBindings,f.sourceAssetBindings);assert.deepEqual(next.presentationAsset,f.presentationAsset);assert.equal(next.caption,f.caption);assert.deepEqual(next.sourceNotes,f.sourceNotes);}
assert.equal(unchanged,13);assert.equal(r.targetFigureIds.length,8);assert(mr.targetChecks.every(x=>x.verdict==='uncertain'));assert.equal(mr.contextContinuity.verdict,'faithful');
const rows=maker.output.charts.flatMap(c=>c.series.map(s=>({figureId:c.figureId,...s})));assert.equal(rows.length,16);assert.equal(rows.reduce((n,s)=>n+s.values.length,0),144);assert(rows.every(s=>s.binding==='unknown'&&s.marker==='unknown'&&s.values.every(v=>v==='unknown')));
const counts={};for(const u of mr.unknownImpacts)counts[u.disposition]=(counts[u.disposition]??0)+1;assert.deepEqual(counts,{'nonblocking-with-limits':12,blocking:24,uncertain:4});assert.equal(mr.unknownImpacts.length,40);
assert.deepEqual(scope.requiredDisplayLimitations,proof.requiredDisplayLimitations);assert.equal(scope.requiredDisplayLimitations.length,80);assert.equal(scope.implementationVerified,false);assert.equal(scope.admissionGranted,false);
const figures=r.targetRules.map(t=>{
 const f=candidate.figures[t.index],m=mr.targetChecks.find(x=>x.id===f.figureId),impacts=mr.unknownImpacts.filter(u=>u.figureId===f.figureId),data=rows.filter(s=>s.figureId===f.figureId);
 assert.deepEqual(impacts.map(u=>u.unknownText).sort(),[...f.unknowns].sort());
 return {figureId:f.figureId,title:f.transcription.split('\n')[0],originalImages:f.sourceAssetBindings,fullFigureSha256:sha(JSON.stringify(f)),parentFullFigureSha256:sha(JSON.stringify(parent.figures[t.index])),independentTargetVerdict:m,series:data.map(s=>({name:s.name,marker:s.marker,binding:s.binding,turns:t.turns,values:s.values,evidence:s.evidence})),unknownImpacts:impacts,requiredDisplayLimitations:impacts.flatMap(u=>u.requiredDisplayLimitations),legendCorrectionIndependentlyConfirmed:t.index>=14,minimumRemainingGap:t.index<14?'图例第3/4项至实际轨迹绑定及这两条件七巡约值尚未核定；不是缺少槽位。':'两指定系列的标记/轨迹绑定及十五巡约值尚未核定；正文22%/约7000点不能反填图读数据。',admissionGranted:false};
});
const wrongIssue=mr.issues.find(x=>x.targetId.endsWith(':b0156:figure')&&x.description.includes('12张'));assert(wrongIssue);
const hand=parent.figures.find(x=>x.figureId==='79-bilibili-cn:cv1815400:b0154:figure');assert(hand);assert.deepEqual(hand,candidate.figures.find(x=>x.figureId===hand.figureId));
const parentAudit=await load(r.parentAudit.path);assert(parentAudit.modelReview.issues.some(x=>x.targetId===hand.figureId&&x.severity==='uncertain'));
const record={schema:'coac244-recorded-cn311-targets/1',canonical:r.canonical,candidate:r.candidate,source:r.source,parent:r.parent,receipt:{path:P+'/integration/'+fixed[1][0],sha256:fixed[1][1]},raw:r.raw,
 actualCall:{callId:raw.callId,model:raw.model,reasoningEffort:raw.reasoningEffort,images:8,usage:raw.usage,durationMs:raw.durationMs,ledgerEntries:1},
 existingFrozenGatesReexecuted:['verifyProduction','prepareReview','verifyReviewExecution'],frozenFiles:33,verifiedBindings:refs,
 transportCompleted:true,repairPassed:false,limitedUnknownOkay:false,wholeChapterPassed:false,admissionGranted:false,
 unchanged:{bodyBlocks:225,nonTargetFigures:13,originalFiguresAndAssets:21},targetSeries:16,newUnknownSlots:144,newNumericReadings:0,
 impactCounts:counts,figures,originalModelIssues:mr.issues,scopeAttribution:{originalWrongIssuePreserved:wrongIssue,actualTarget:hand.figureId,kind:'inherited-non-target-source-incompleteness',isNewCurveError:false,basis:'Unchanged complete b0154 figure and original parent uncertain; output targetId typo remains unchanged.'},
 sourceNote:mr.issues.filter(x=>x.severity==='source-note'),requiredDisplayLimitations:scope.requiredDisplayLimitations,displayImplementationVerified:false,
 phaseBudget:{maker:1,review:1,total:2,used:2,remaining:0,retry:0},thisRun:{modelCalls:0,productionCalls:0,reviewCalls:0,newConsumers:0},fee:'unknown',upstreamExecutionCount:'unknown',remoteWeights:'unknown',
 nextAction:'保留八个具体曲线未决及非靶b0154源缺张；只复用已确认图例译义，不凭80限制提案放行；任何后续需先有明确证据/授权，不自动重制/重审。'};
await mkdir(D,{recursive:true});await writeFile(D+'/record.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({record:D+'/record.json',bindings:refs.length,frozenFiles:33,targetFigures:figures.length,slots:144,newNumbers:0,impacts:counts,transport:true,repairPassed:false,limitedUnknownOkay:false,newModelCalls:0}));
