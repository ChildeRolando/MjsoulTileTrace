import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const base='E:/AgentData/Coach/knowledge/processing/integration',dir=resolve('_analysis/r785');
const chapter='nemata-jp-chapter-283-1',target='modern-yabejp-ja:chapter06-exercise003:b0785:figure';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
const load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const checked=await load(join(dir,'checked.json')),archive=await load(join(dir,'archive.json')),mapping=await load(join(dir,'mapping.json'));
assert.equal(checked.verified.targetPassed,false);assert.equal(checked.verified.limitedUnknownOkay,true);
for(const f of [...archive,...checked.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const receipt=await load(checked.receipt.path),scope=await load(checked.scope.path);
const intakePath=join(base,'coac250-b0785-evidence-intake-20261028.json');
if(await exists(intakePath)){const old=await load(intakePath);assert.equal(old.receipt.sha256,checked.receipt.sha256);assert.equal(old.candidate.sha256,checked.candidate.sha256);console.log(JSON.stringify({deduplicated:true,targetPassed:false,wholeChapterAccepted:false}));process.exit(0);}
const oldIntake=await load(join(base,'coac250-b0947-composition-intake-20261028.json'));
const effective=await load(oldIntake.effectiveIssueRegister.path);
assert.equal(sha(await readFile(oldIntake.effectiveIssueRegister.path)),oldIntake.effectiveIssueRegister.sha256);
assert.equal(effective.counts.resolved,14);assert.equal(effective.counts.remainingBlocking,3);
const originalOpen=effective.issues.filter(i=>i.status==='open'&&i.category!=='source-note');assert.equal(originalOpen.length,3);
assert(originalOpen.every(i=>i.originalIssue.targetId===target));
const beforeEffective=structuredClone(effective);
for(const i of originalOpen){
 assert.equal(hash(i.originalIssue),i.originalIssueSha256);
 i.currentScopedEvidence={receipt:checked.receipt,candidate:checked.candidate,raw:receipt.raw,scope:checked.scope,seatVerdict:'faithful',contextFaithful:true,unknownTeachingImpact:'nonblocking-with-limits',limitedUnknownOkay:true,targetPassed:false,originalModelUncertainPreserved:true};
 i.technicalRepairEvidence=i.originalIssue.severity==='error'?'Existing independently reviewed donor hand/hidden-hand distinction inherited exactly; new target seat correction faithful. No new unresolved transcription repair identified.':'Explicit unknown retained; independently nonblocking for Q48 qualitative argument under all four mandatory limits. Do not schedule tile reading.';
 i.remainingAction='Pending exact-SHA limited display contract: install four verbatim editorial limitations, especially defaults versus screenshot; admission/readback not yet granted. No maker/OCR/review call.';
}
assert.deepEqual(effective.issues.map(i=>i.originalIssue),beforeEffective.issues.map(i=>i.originalIssue));
assert.deepEqual(effective.issues.map(i=>[i.originalIssueSha256,i.status]),beforeEffective.issues.map(i=>[i.originalIssueSha256,i.status]));
effective.b0785BoundedEvidence={receipt:checked.receipt,scope:checked.scope,candidate:checked.candidate,raw:receipt.raw,verification:checked.verified,mandatoryLimits:receipt.modelReview.mandatoryLimits,displayMapping:mapping,admissionGranted:false};
effective.supersedes=oldIntake.effectiveIssueRegister;
effective.nextOperationalRepair='Existing COAC-244 owner: zero-model exact-SHA editorial display contract and loader pin for all four independent b0785 limitations. No repeated tile reading. Retain strict targetPassed=false and one uncertain. Future legal combination must preserve already registered b0947 full figure/15 context hashes before whole-chapter readback.';
effective.countsWarning='Original19 effective accounting stays14 supported/3 pending admission/2 source-note. Three original b0785 issues are historical identities, not three new OCR jobs; their repair/impact evidence is registered but no ordinary pass or display acceptance is granted.';
effective.recordedAt=new Date().toISOString();
const effectivePath=join(base,'coac250-283-0785-effective-issues-20261028.json');
const effectiveBytes=Buffer.from(JSON.stringify(effective,null,2)+'\n'),effectiveRef={path:effectivePath,sha256:sha(effectiveBytes)};
const operational=originalOpen.map(i=>({severity:i.originalIssue.severity,targetId:target,originalIssueSha256:i.originalIssueSha256,sourceEvidence:`Existing donor evidence plus call ${receipt.call.callId}; receipt ${checked.receipt.sha256}; original finding retained in effective register.`,description:i.technicalRepairEvidence,suggestedRepair:i.remainingAction,blockingKind:'limited-display-contract-pending',notANewOcrOrModelTask:true}));
const registration={schema:'coac250-b0785-scoped-target-registration/1',status:'evidence-verified-display-contract-pending',receipt:checked.receipt,scope:checked.scope,candidate:checked.candidate,parent:checked.parent,donor:checked.donor,raw:receipt.raw,runtime:checked.runtime,seatVerdict:'faithful',contextFaithful:true,unknownTeachingImpact:'nonblocking-with-limits',limitedUnknownOkay:true,strictTargetPassed:false,originalIssues:receipt.modelReview.issues,mandatoryLimits:receipt.modelReview.mandatoryLimits,limitsInstalled:false,displayVerified:false,displayContractOwner:'Existing COAC-244 owner',effectiveIssueRegister:effectiveRef,b0947CompositionUnchanged:oldIntake.derived,wholeChapterAccepted:false,standardWholeArticlePassed:false,admissionGranted:false,newModelCalls:0,newProductionCalls:0,remainingModelBudget:0,intakePath};
const lock=join(base,'accepted-consumer.lock');
for(const n of ['selection-maintainer.lock.json','ACCEPTED-CONSUMER-STOP'])assert.equal(await exists(join(base,n)),false,n+' occupied');
if(await exists(lock))throw Error('Existing writer owner: '+await readFile(lock,'utf8'));
await writeFile(lock,JSON.stringify({pid:process.pid,issueId:'01a17471-25e6-7731-a529-3df99acf3d42',scope:'b0785 evidence registration only; no preview consumer',createdAt:new Date().toISOString()})+'\n',{flag:'wx'});
const changes=[];
try{
 const names=['coac250-unified-chapter-register-20261027b.json','coac250-uncovered-chapter-continuation-register-20261027b.json','coac244-remaining26-closure-register-20261028.json'],pending=[];
 for(let n=0;n<names.length;n++){
  const path=join(base,names[n]),bytes=await readFile(path),data=JSON.parse(bytes),before=structuredClone(data);
  const row=data.rows.find(r=>r.chapterId===chapter);assert(row);assert.notEqual(row.covered,true);
  assert.deepEqual(row.b0947Composition.derived,oldIntake.derived);
  const previous=structuredClone(row);await save(join(dir,`row${n}.before.json`),previous);
  row.b0785Evidence=registration;
  row.currentEffectiveIssueRegister=effectiveRef;
  if(n===0){assert.equal(data.counts.effectiveCoveredOriginalChapters,244);assert.deepEqual(row.latestScopedCandidate,previous.latestScopedCandidate);}
  else{
   row.historicalProblemSummaryBeforeB0785={blockingIssues:previous.blockingIssues,effectiveBlockingIssues:previous.effectiveBlockingIssues,nextAction:previous.nextAction,closurePlan:previous.closurePlan};
   row.blockingIssues=operational;row.effectiveBlockingIssues=operational;
   row.b0785DisplayLimitations=mapping.mandatoryLimits;
   row.nextAction='b0785真实独审已结束：方位faithful、contextFaithful、unknown影响nonblocking-with-limits；原targetPassed=false及1条uncertain原样。当前只待现有244零模型落实四条原显示限制及精确SHA合法scope/loader，尤其默认条件与截图实况区分；不再派识字、制作或复审。原19=14已有补证/3限定准入待核/2source-note。b0947装配保留；整283不合库，不启动MCP/Arena整章验收，不切active。';
   row.wholeChapterPassed=false;
   row.category='b0785-evidence-collected-limited-display-contract-pending';
   row.evidenceConvergence={...row.evidenceConvergence,effectiveIssueRegister:effectiveRef,counts:effective.counts,chapterAccepted:false,newModelCalls:0,b0785Evidence:checked.receipt};
   if(row.closurePlan)Object.assign(row.closurePlan,{category:row.category,nextAction:row.nextAction,evidenceRegister:effectivePath,effectiveBlockingIssues:operational,modelCallsThisStage:0});
  }
  assert.deepEqual(row.b0947Composition,previous.b0947Composition);
  assert.deepEqual(data.rows.filter(r=>r.chapterId!==chapter),before.rows.filter(r=>r.chapterId!==chapter));
  const {rows:a,...meta}=data,{rows:b,...oldMeta}=before;assert.deepEqual(meta,oldMeta);
  await save(join(dir,`row${n}.after.json`),row);pending.push({path,bytes,data});
 }
 for(const f of [...archive,...checked.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 for(const p of pending)assert.equal(sha(await readFile(p.path)),sha(p.bytes),'concurrent register change');
 await writeFile(effectivePath,effectiveBytes,{flag:'wx'});await writeFile(join(dir,'effective.json'),effectiveBytes);
 for(const p of pending){const tmp=p.path+'.r785-'+process.pid;await save(tmp,p.data);await rename(tmp,p.path);changes.push({path:p.path,beforeSha256:sha(p.bytes),afterSha256:sha(await readFile(p.path)),onlyChangedCanonical:chapter,otherRowsAndMetadataUnchanged:true});}
 for(const f of [...archive,...checked.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 const result={schema:'coac250-b0785-evidence-intake/1',recordedAt:new Date().toISOString(),...registration,actualVerification:checked.verified,protectedFiles:checked.protectedFiles,protectedUnchanged:true,changes,counts:effective.counts,originalIssueIdentitiesAndStatusesPreserved:true,operationalBlockers:operational,remainingDisplayWork:mapping.mandatoryLimits,preview:checked.preview,coverage:{originalChaptersCovered:244,originalChaptersTotal:256,originalUnitsCovered:276,originalUnitsTotal:303,remainingChapters:12,remainingUnits:27,increment:0},selectionVersion:33,previewBuilt:false,consumerStarted:false,formalActiveChanged:false,wholeChapterReadbackPerformed:false,newCalls:0,bookComplete:false,safeToResume:true,upstreamUsage:receipt.call.usage,upstreamDurationMs:receipt.call.durationMs,measurementLimits:{fee:null,remoteWeights:'unknown',upstreamExecutionCount:null}};
 await writeFile(intakePath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});await save(join(dir,'result.json'),result);
 console.log(JSON.stringify({registered:true,counts:result.counts,targetPassed:false,displayContractPending:true,registers:changes.length,previewUnchanged:true,newCalls:0}));
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
