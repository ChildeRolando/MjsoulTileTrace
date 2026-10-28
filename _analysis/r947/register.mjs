// Register a verified scope only. No stage/compiler/model/preview entry point.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const base='E:/AgentData/Coach/knowledge/processing/integration',pkg=join(base,'coac244-283-0947-composition-20261028');
const dir=resolve('_analysis/r947'),chapter='nemata-jp-chapter-283-1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p)),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const checked=await load(join(dir,'checked.json')),archive=await load(join(dir,'archive.json'));
assert.equal(checked.verified.passed,true);
// The owner appended dispatch/current-baseline documentation after the actual verifier ran.
// Keep the first snapshot and bind the later documentation separately; no semantic input changed.
const metadataUpdates=[];
const revisedNames=new Map([['README.md','074b4016483921be336edc11f45b004ea97e41c2b1ad248e62efcc2d47d46e37'],['files.sha256.json','bd9cbb62463f7413547e977a3bd1259e911c6ec17ce67fe00f6bcbe02d905e23']]);
for(const [name,digest] of revisedNames){
 const path=join(pkg,name),b=await readFile(path);assert.equal(sha(b),digest);
 await writeFile(join(dir,name==='README.md'?'upstream-readme.current.md':'upstream-manifest.current.json'),b);
 metadataUpdates.push({path,sha256:digest,old:archive.find(f=>f.path.replaceAll('\\','/').endsWith('/'+name))});
}
const currentManifest=await load(join(pkg,'files.sha256.json'));
for(const entry of currentManifest){
 const path=join(pkg,entry.path),bytes=await readFile(path);assert.equal(sha(bytes),entry.sha256);
 const old=archive.find(f=>f.path.replaceAll('\\','/')===path.replaceAll('\\','/'));
 if(old&&!revisedNames.has(entry.path))assert.equal(old.sha256,entry.sha256,'no changed semantic input');
 if(!old){const local=`u${metadataUpdates.length}`;await writeFile(join(dir,local),bytes);metadataUpdates.push({path,sha256:entry.sha256,local});}
}
await save(join(dir,'metadata-updates.json'),metadataUpdates);
const unchangedArchive=archive.filter(f=>![...revisedNames.keys()].some(n=>f.path.replaceAll('\\','/').endsWith('/'+n)));
for(const f of [...unchangedArchive,...metadataUpdates,...checked.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
const ref=async path=>({path,sha256:sha(await readFile(path))});
const proof=await load(join(pkg,'composition-proof.json')),effective=await load(join(pkg,'effective-issue-register.json'));
const effectiveRef=await ref(join(pkg,'effective-issue-register.json'));
const intakePath=join(base,'coac250-b0947-composition-intake-20261028.json');
if(await exists(intakePath)){
 const old=await load(intakePath);assert.equal(old.derived.sha256,proof.derived.sha256);assert.equal(old.proof.sha256,sha(await readFile(join(pkg,'composition-proof.json'))));
 console.log(JSON.stringify({deduplicated:true,derived:old.derived,wholeChapterAccepted:false}));process.exit(0);
}
const blockers=effective.issues.filter(i=>i.status==='open'&&i.category!=='source-note').map(i=>i.originalIssue);
const notes=effective.issues.filter(i=>i.category==='source-note').map(i=>i.originalIssue);
const resolved=effective.issues.filter(i=>i.status.startsWith('resolved'));
assert.equal(blockers.length,3);assert.equal(notes.length,2);assert.equal(resolved.length,14);
const registration={status:'registered-exact-b0947-composition-only',derived:proof.derived,parent:proof.parent,donor:proof.donor,proof:await ref(join(pkg,'composition-proof.json')),verifier:await ref(join(pkg,'compose.mjs')),effectiveIssueRegister:effectiveRef,independentCheckpoint:proof.independentCheckpoint,independentRaw:proof.independentRaw,originalProducerRaw:proof.productionRaw,targetFigureSha256:proof.targetFigureSha256,contextHashes:proof.contextHashes,unknowns:proof.originalUnknowns,counts:effective.counts,wholeChapterAccepted:false,standardWholeArticlePassed:false,newModelCalls:0,intakePath};
const files=['coac250-unified-chapter-register-20261027b.json','coac250-uncovered-chapter-continuation-register-20261027b.json','coac244-remaining26-closure-register-20261028.json'];
const lock=join(base,'accepted-consumer.lock');
assert.equal(await exists(join(base,'selection-maintainer.lock.json')),false,'selection writer occupied');
assert.equal(await exists(join(base,'ACCEPTED-CONSUMER-STOP')),false,'STOP present');
if(await exists(lock))throw Error('Existing writer: '+await readFile(lock,'utf8'));
await writeFile(lock,JSON.stringify({pid:process.pid,issueId:'01a17471-25e6-7731-a529-3df99acf3d42',scope:'b0947 evidence registration only; no preview consumer',createdAt:new Date().toISOString()})+'\n',{flag:'wx'});
const changes=[];
try{
 // Prepare all three fresh rows before any publication. Other chapters and metadata are immutable here.
 const pending=[];
 for(let i=0;i<files.length;i++){
  const path=join(base,files[i]),bytes=await readFile(path),data=JSON.parse(bytes),before=structuredClone(data);
  const row=data.rows.find(x=>(x.originalChapterId??x.chapterId)===chapter);assert(row);assert.notEqual(row.covered,true);
  const oldRow=structuredClone(row);await save(join(dir,`row${i}.before.json`),oldRow);
  row.b0947Composition=registration;
  row.currentEffectiveIssueRegister=effectiveRef;
  if(i===0){
   assert.equal(data.counts.effectiveCoveredOriginalChapters,244);
   row.historicalScopedCandidateBeforeB0947=row.latestScopedCandidate;
   row.latestScopedCandidate={candidate:proof.derived,status:'scope-composed-not-whole-accepted',chapterAccepted:false,standardWholeArticlePassed:false,parentAudit:proof.parentAudit,donorAudit:proof.donorAudit,effectiveIssueRegister:effectiveRef,compositionProof:registration.proof};
  }else{
   row.historicalProblemSummaryBeforeB0947={blockingIssues:oldRow.blockingIssues,effectiveBlockingIssues:oldRow.effectiveBlockingIssues,evidenceConvergence:oldRow.evidenceConvergence,closurePlan:oldRow.closurePlan,nextAction:oldRow.nextAction};
   row.blockingIssues=blockers;row.effectiveBlockingIssues=blockers;row.resolvedIssuesWithEvidence=resolved;
   row.effectiveDeferredFindings=effective.deferred;row.sourceNotesPreserved=notes;
   if(row.sourceNotes)row.sourceNotes=notes;
   row.evidenceConvergence={...row.evidenceConvergence,effectiveIssueRegister:effectiveRef,counts:effective.counts,chapterAccepted:false,newModelCalls:0,b0947Composition:registration.proof};
   const next='283精确b0947完整原独审对象已装配并验真；原19=14补证/3仍b0785/2source-note。b0785沿既有269→249授权链，不新增派审或额度。未来组合必须保持b0947完整figure和15块上下文hash及其它已通过scope；全部合法范围齐后才整章MCP/Arena验收。整283继续hold，不合库、不切active。';
   row.nextAction=next;row.wholeChapterPassed=false;
   if(row.closurePlan)Object.assign(row.closurePlan,{category:'three-effective-b0785-blockers-after-exact-b0947-composition',nextAction:next,evidenceRegister:effectiveRef.path,effectiveBlockingIssues:blockers,resolvedIssuesWithEvidence:resolved,effectiveDeferredFindings:effective.deferred,sourceNotesPreserved:notes,modelCallsThisStage:0});
   else row.category='three-effective-b0785-blockers-after-exact-b0947-composition';
  }
  assert.deepEqual(data.rows.filter(x=>(x.originalChapterId??x.chapterId)!==chapter),before.rows.filter(x=>(x.originalChapterId??x.chapterId)!==chapter));
  const {rows:a,...meta}=data,{rows:b,...oldMeta}=before;assert.deepEqual(meta,oldMeta);
  await save(join(dir,`row${i}.after.json`),row);
  pending.push({path,bytes,data,oldRow});
 }
 for(const f of checked.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256);
 for(const p of pending)assert.equal(sha(await readFile(p.path)),sha(p.bytes),'register changed; reread before mutation');
 for(const p of pending){
  const tmp=p.path+'.r947-'+process.pid;await save(tmp,p.data);await rename(tmp,p.path);
  changes.push({path:p.path,beforeSha256:sha(p.bytes),afterSha256:sha(await readFile(p.path)),otherRowsUnchanged:true,metadataUnchanged:true,coverageUnchanged:true});
 }
 for(const f of [...unchangedArchive,...metadataUpdates,...checked.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 const result={schema:'coac250-exact-b0947-composition-intake/1',recordedAt:new Date().toISOString(),...registration,actualVerification:checked.verified,closedOriginalIssues:checked.closedOriginalIssues,remainingBlockers:blockers,sourceNotes:notes,changes,protectedFiles:checked.protectedFiles,protectedUnchanged:true,preview:checked.preview,coverage:{originalChaptersCovered:244,originalChaptersTotal:256,originalUnitsCovered:276,originalUnitsTotal:303,remainingChapters:12,remainingUnits:27,increment:0},selectionVersion:33,previewBuilt:false,consumerStarted:false,formalActiveChanged:false,newProductionCalls:0,bookComplete:false,safeToResume:true,nextCombinationRequirement:'Preserve complete reviewed b0947 figure and all 15 context hashes; reuse donor if b0785 branch omits it. Verify future b0785 real producer/target-review chain and all unchanged accepted scopes before whole-chapter readback.',priorCountsReconciled:'Live row summaries lagged at11/6/2; frozen parent gate verifies already accepted b1017/b1181. Current upstream effective issue ledger14/3/2 is registered without modifying historical issue hashes or model receipts.'};
 result.upstreamDocumentationUpdate={semanticInputsUnchanged:true,metadataUpdates};
 await writeFile(intakePath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 await save(join(dir,'result.json'),result);
 console.log(JSON.stringify({registered:true,counts:result.counts,changedRegisters:changes.length,coverage:result.coverage,newModelCalls:0,wholeChapterAccepted:false}));
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
