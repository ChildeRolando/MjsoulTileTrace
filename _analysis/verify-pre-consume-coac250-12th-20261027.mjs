// COAC-250 twelfth batch: deterministic pre-consume verification for the two handoffs the member
// named on 2026-10-27T12:23:36Z. Chapters:
//   COAC-249 b7  -> nemata-jp-chapter-089-1 (chapter01-section031), nemata-jp-chapter-060-1 (chapter01-section021-06)
//   COAC-248     -> 79-cn-chapter-081-8     (cv1721475), figure-only correction
// Zero model calls, zero production calls. Recomputes every declared SHA, the revision chain, the
// auditor snapshot, the dependency manifest and the live audit gate before anything is selected or built.
// Dedupe is by canonical article of the same book (sourceId:articleId), never by numeric tail:
// 79-cn-chapter-215-4 (p217 disputed) and nemata-jp-chapter-215-4 are different books.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root='E:/AgentData/Coach/knowledge/processing';
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const rel=p=>String(p).split('\\').join('/');
const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
const {buildVerificationDependencyManifest,verifyVerificationDependencyManifest,diffVerificationDependencies}=
 await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-verification-dependencies.mjs'));

const HANDOFFS=[
 {ticket:'COAC-249',path:'integration/coac249-incremental-269-b7-20261027.json',expectedSha256:'ccedd72ff0a61c6cedf72e76b44a4f97d6e9a26ef2824bd9ee5da54a4c77524b'},
 {ticket:'COAC-248',path:'integration/coac250-incremental-081-8-20261027.json',expectedSha256:'9a456aefd74356b940372e1f691ee9845815696dabe6cbbcc14c517974ae78ef'}
];
const TARGET_MANIFEST='audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json';
const TARGET_MANIFEST_SHA='0aa071a4b6ad74acdf4dceb6538438f88b5c8278800ea21acf0687b0aa0cd789';
const TARGET_SNAPSHOT='856dad9d46d2d0d47436388e792caa2aac251ad68b4b8d03ff2e1fbd03158881';
const E89_MANIFEST='audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json';
const E89_MANIFEST_SHA='ed07f6b824de75f5999d0f3169c7dae37580c2474035f0cb5ec234e2ed6cac5d';
const E89_SNAPSHOT='453ba938015d244e36a1b8aad05e7500c598de7a5dd97768f2defab4b973b8e1';

const items=[
 {key:'089-1',original:'nemata-jp-chapter-089-1',ticket:'COAC-249',sourceId:'modern-yabejp-ja',articleId:'chapter01-section031',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.coac269rev1.json',
  expectedCandidateSha256:'c5317d995648afeefdb370b314047e36f0368609a19a2db6be103385646565a6',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section031.c5317d995648afeefdb370b314047e36f0368609a19a2db6be103385646565a6.json',
  expectedAuditSha256:'11e0c9f0e612fd99f30316abbe28fa420a84bf60284a296287018fc6d8b51d18',
  expectedParentSha256:'9fa0255f1dbe5bdf38e94d0e6c447c09d4a97d689611f41fd1676af27fd89ffb',
  expectedParentAuditSha256:'38463b0c66018574d1cca6a52a4c667346b70864ad5bcf2e84454f759e2fdba9',
  expectedSourceSha256:'c69694f31974fc506ba30b69434ed64a700112dc6d7bb2d67916aa9ef19126a4',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter01-section031-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter01-section031:b0042','modern-yabejp-ja:chapter01-section031:b0084','modern-yabejp-ja:chapter01-section031:b0102','modern-yabejp-ja:chapter01-section031:b0153'],
  expectedChangedFigureIds:[],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:TARGET_MANIFEST,expectedManifestSha256:TARGET_MANIFEST_SHA,expectedAuditorSnapshotSha256:TARGET_SNAPSHOT,
  attestationPath:null},
 {key:'060-1',original:'nemata-jp-chapter-060-1',ticket:'COAC-249',sourceId:'modern-yabejp-ja',articleId:'chapter01-section021-06',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.coac269rev1.json',
  expectedCandidateSha256:'6de46bfb824281e9facea8bd30eebf1498b7ae047e4c006250aeaa2800b0c64c',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section021-06.6de46bfb824281e9facea8bd30eebf1498b7ae047e4c006250aeaa2800b0c64c.json',
  expectedAuditSha256:'949a48561b8f2f02d3b677b0e210f2d12d6978b9315161ec85fdb5437f136235',
  expectedParentSha256:'ff1f57ff633d050ec1edff51301a3e4a4e3f68d690774a7a8c60893f4300f828',
  expectedParentAuditSha256:'f13f9da62cd633bf21c036ba4439b913e987b5334a4660e465ad80f0772d0cf7',
  expectedSourceSha256:'febc8cef9c299b375c225843e4d33a27a2167c3729bf8c590e472433f548eda5',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter01-section021-06-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter01-section021-06:b0027','modern-yabejp-ja:chapter01-section021-06:b0033'],
  expectedChangedFigureIds:[],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:TARGET_MANIFEST,expectedManifestSha256:TARGET_MANIFEST_SHA,expectedAuditorSnapshotSha256:TARGET_SNAPSHOT,
  attestationPath:null},
 {key:'081-8',original:'79-cn-chapter-081-8',ticket:'COAC-248',sourceId:'79-bilibili-cn',articleId:'cv1721475',
  candidate:'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json',
  expectedCandidateSha256:'d1fc1ea8f072cc73c3c1a1649f3a7608f6fd55ecb38be8ff19a34340d5c2a3dd',
  audit:'audit/web/articles/79-bilibili-cn/cv1721475.d1fc1ea8f072cc73c3c1a1649f3a7608f6fd55ecb38be8ff19a34340d5c2a3dd.json',
  expectedAuditSha256:'f1328e6a67ddce5f3df448d8533ac7e83009a7e18132ae7e6c070d5385468458',
  expectedParentSha256:'50b62ce5b808d89f5f6231e8a88ed7ce546731211bb73684642d54d700d11853',
  expectedParentAuditSha256:'c5513deefd2d8863fdfed92bbd725fb934199174a0556a9c18e6774b143aea86',
  expectedSourceSha256:'f0f3fe12b457bc7d0ffcb34cfc6b1e4e5e37781759f55ebe22cbfdc8343b55f3',
  expectedPreviewChapterId:'79-bilibili-cn-cv1721475-chapter',
  expectedTargetTextIds:[],
  expectedChangedFigureIds:['79-bilibili-cn:cv1721475:b0004:figure','79-bilibili-cn:cv1721475:b0006:figure','79-bilibili-cn:cv1721475:b0008:figure','79-bilibili-cn:cv1721475:b0018:figure'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:E89_MANIFEST,expectedManifestSha256:E89_MANIFEST_SHA,expectedAuditorSnapshotSha256:E89_SNAPSHOT,
  attestationPath:null}
];

const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const pointerReceiptBytes=await readFile(join(pointer.output,'accepted-preview-receipt.json'));
const priorReceipt=JSON.parse(pointerReceiptBytes);
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const structureHolds=await load(join(root,'integration/source-structure-holds.json'));
const definitionSelection=await load(join(root,'integration/definition-boundary-stage-selection.json'));
const definitionArticles=new Set(definitionSelection.entries.map(e=>e.articleId));

const out={schema:'coac250-pre-consume-verification-20261027l/1',recordedAt:new Date().toISOString(),modelCalls:0,productionCalls:0,
 handoffs:[],prior:{preview:pointer.output,pointerReceiptSha256:sha(pointerReceiptBytes),corpusId:pointer.corpusId,
  chapters:priorReceipt.chapters,units:priorReceipt.units,blocks:priorReceipt.blocks,figures:priorReceipt.figures,
  selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},
 structureHolds:{path:'integration/source-structure-holds.json',articleIds:structureHolds.articleIds},
 definitionSelectionArticles:[...definitionArticles],items:[]};
for(const h of HANDOFFS){
 const b=await readFile(join(root,h.path));
 out.handoffs.push({ticket:h.ticket,path:h.path,sha256:sha(b),shaMatchesExpected:sha(b)===h.expectedSha256});
}

for(const it of items){
 const r={key:it.key,original:it.original,ticket:it.ticket,articleId:it.articleId,sourceId:it.sourceId,checks:{}};
 const cBytes=await readFile(join(root,it.candidate)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
 const aBytes=await readFile(join(root,it.audit)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
 r.candidate={path:it.candidate,sha256:cSha,blocks:candidate.body.blocks.length,figures:candidate.figures.length,title:candidate.title};
 r.audit={path:it.audit,sha256:aSha,status:audit.status,recordedAt:audit.recordedAt,method:audit.method,
  effectiveModelChecks:audit.effectiveModelChecks,semanticCompleteness:audit.semanticCompleteness,
  calls:(audit.calls||[]).map(c=>({callId:c.callId,model:c.model,reasoningEffort:c.reasoningEffort,success:c.success,usage:c.usage})),
  inheritedCalls:(audit.inheritedCalls||[]).map(c=>({callId:c.callId,model:c.model,success:c.success}))};
 r.checks.candidateShaExpected=cSha===it.expectedCandidateSha256;
 r.checks.auditShaExpected=aSha===it.expectedAuditSha256;
 r.checks.receiptBindsCandidate=cSha===audit.production.sha256&&rel(audit.production.path).endsWith('/'+it.candidate);
 r.checks.receiptPassed=audit.status==='passed';

 const sBytes=await readFile(join(root,candidate.source.sourcePath)),source=JSON.parse(sBytes);
 r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),mainSha256:source.main&&source.main.sha256,htmlSha256:source.html&&source.html.sha256,tables:Array.isArray(source.tables)?source.tables.length:0};
 r.checks.sourceShaExpected=sha(sBytes)===it.expectedSourceSha256;
 r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
 r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256&&audit.source.htmlSha256===source.html.sha256;
 r.checks.noTableGeometryHold=r.source.tables===0;

 const rev=candidate.provenance.revision;
 const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
 r.chain={parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds||[],figureIds:rev.figureIds||[],notesPath:rev.notesPath};
 r.checks.parentShaBound=pSha===it.expectedParentSha256&&pSha===rev.parentSha256&&pSha===audit.productionCall.revision.revision.parentSha256;
 r.checks.parentAuditShaBound=audit.productionCall.revision.parentAudit.sha256===it.expectedParentAuditSha256;
 r.checks.parentAuditPathBound=rel(audit.productionCall.revision.parentAudit.path)===rel(rev.notesPath);
 const nBytes=await readFile(join(root,rev.notesPath)),notes=JSON.parse(nBytes);
 r.chain.notes={path:rev.notesPath,sha256:sha(nBytes),status:notes.status,recordedAt:notes.recordedAt,originalStatus:audit.productionCall.revision.parentAudit.originalStatus};
 r.checks.notesShaBound=sha(nBytes)===rev.notesSha256&&sha(nBytes)===audit.productionCall.revision.revision.notesSha256;
 r.checks.notesAreTheRepairedReceipt=!!(notes.production&&notes.production.sha256===pSha&&notes.status==='needs-repair');
 const parentCandidate=await load(join(root,rev.parentPath));
 const blockId=b=>b.sourceBlockIds[0];
 const changedBlocks=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)!==JSON.stringify(parentCandidate.body.blocks[i]));
 const substantive=f=>{const {presentationAsset,...rest}=f;return JSON.stringify(rest);};
 const changedFigures=candidate.figures.filter((f,i)=>substantive(f)!==substantive(parentCandidate.figures[i]));
 const derivedOnlyFigures=candidate.figures.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(parentCandidate.figures[i])&&substantive(f)===substantive(parentCandidate.figures[i]));
 r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),targetTextIds:rev.textBlockIds||[],changedFigureIds:changedFigures.map(f=>f.figureId),figuresDifferingOnlyByDerivedPresentationAsset:derivedOnlyFigures.length,unchangedBlocks:candidate.body.blocks.length-changedBlocks.length};
 r.checks.targetTextIdsAsDeclared=JSON.stringify(rev.textBlockIds||[])===JSON.stringify(it.expectedTargetTextIds);
 r.checks.changedBlocksAreTargets=changedBlocks.length===it.expectedTargetTextIds.length&&changedBlocks.every(b=>it.expectedTargetTextIds.includes(blockId(b)));
 r.checks.changedFiguresAsDeclared=JSON.stringify(changedFigures.map(f=>f.figureId).sort())===JSON.stringify([...it.expectedChangedFigureIds].sort());
 r.checks.remainingBlocksByteIdentical=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parentCandidate.body.blocks[i])).length===candidate.body.blocks.length-it.expectedTargetTextIds.length;
 const parentFigById=new Map(parentCandidate.figures.map(f=>[f.figureId,f]));
 r.checks.remainingFiguresInherited=candidate.figures.every(f=>it.expectedChangedFigureIds.includes(f.figureId)?true:substantive(f)===substantive(parentFigById.get(f.figureId)));
 r.checks.undelaredFigureSubstanceUnchanged=candidate.figures.filter(f=>!it.expectedChangedFigureIds.includes(f.figureId)&&substantive(f)!==substantive(parentFigById.get(f.figureId))).length===0;
 r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));

 const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
 const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
 r.auditor={path:aud.path,sha256:sha(audBytes),declared:aud.sha256,combined:snapshot.combinedSha256,files:snapshot.files.map(f=>({name:f.name,sha256:f.sha256}))};
 r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);
 r.checks.auditorSnapshotMatchesHandoff=r.auditor.combined===it.expectedAuditorSnapshotSha256;

 const baseDir=join(root,it.manifestBase);
 const recorded=await load(join(root,it.manifestPath));
 const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
 r.dependencyManifest={base:it.manifestBase,recordedPath:it.manifestPath,recordedSha256:recorded.manifest.manifestSha256,rebuiltSha256:rebuilt.manifestSha256,diff:diffVerificationDependencies(recorded.manifest.files,rebuilt.files),
  snapshotJsFilesCoveredByManifest:snapshot.files.filter(f=>f.name.endsWith('.mjs')).every(f=>rebuilt.files.some(x=>x.name===f.name&&x.sha256===f.sha256)),
  snapshotNonModuleFilesVerifiedBySnapshotOnly:snapshot.files.filter(f=>!f.name.endsWith('.mjs')).map(f=>({name:f.name,sha256:f.sha256,verified:sha(f.content)===f.sha256}))};
 r.checks.manifestShaMatchesHandoff=recorded.manifest.manifestSha256===it.expectedManifestSha256;
 r.checks.manifestFilesMatchAuditorSnapshot=r.dependencyManifest.snapshotJsFilesCoveredByManifest&&r.dependencyManifest.snapshotNonModuleFilesVerifiedBySnapshotOnly.every(f=>f.verified);
 const v=await verifyVerificationDependencyManifest({baseDir,manifest:recorded.manifest});
 r.checks.manifestStillMatchesBase=v.ok===true;

 if(it.attestationPath){
  const ab=await readFile(join(root,it.attestationPath)),att=JSON.parse(ab);
  const callChecks=[];
  for(const c of att.originalModelCalls||[]){const cb=await readFile(join(root,c.path));callChecks.push({path:c.path,declared:c.sha256,actual:sha(cb),matches:sha(cb)===c.sha256});}
  r.attestation={path:it.attestationPath,sha256:sha(ab),kind:att.kind,manifestSha256:att.manifest&&att.manifest.manifestSha256,receipt:{path:att.receipt&&att.receipt.path,sha256:att.receipt&&att.receipt.sha256,status:att.receipt&&att.receipt.status},originalModelCalls:callChecks};
  r.checks.attestationManifestIsFrozen=!!att.manifest&&att.manifest.manifestSha256===it.expectedManifestSha256;
  r.checks.attestationReceiptBindsThisAudit=!!att.receipt&&rel(att.receipt.path)===rel(it.audit)&&att.receipt.sha256===aSha&&att.receipt.status==='passed';
  r.checks.attestationModelCallsPresent=callChecks.length>0&&callChecks.every(c=>c.matches);
  r.checks.attestationManifestStillVerifies=(await verifyVerificationDependencyManifest({baseDir,manifest:att.manifest})).ok===true;
 }

 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath)),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed'&&rel(gate.auditPath).endsWith('/'+it.audit);

 const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.expectedPreviewChapterId),pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
 r.expectedPreviewChapterId=it.expectedPreviewChapterId;

 // canonical version inventory: every candidate file for this canonical article of THIS book, its receipt status
 const dir=join(root,'web-production/v1/candidates',it.sourceId);
 const canon=n=>{let v=n.replace(/\.json$/,'');for(;;){const w=v.replace(/\.(?:display|coac269rev\d+|rev\d+|r\d+)$/,'');if(w===v)return v;v=w;}};
 const names=(await readdir(dir)).filter(n=>n.endsWith('.json')&&canon(n)===it.articleId);
 const auditDir=join(root,'audit/web/articles',it.sourceId);
 const auditNames=await readdir(auditDir);
 const resolveReceipt=async (article,hash)=>{
  const baseName=article+'.'+hash+'.json',basePath=join(auditDir,baseName);
  let prior=null;
  try{const b=await readFile(basePath);prior={path:basePath,name:baseName,receipt:JSON.parse(b),sha256:sha(b)};}catch(error){if(error.code!=='ENOENT')throw error;return {status:'none',path:null,recordedAt:null,chain:[]};}
  const chain=[{file:prior.name,status:prior.receipt.status,recordedAt:prior.receipt.recordedAt}];
  const retries=auditNames.filter(n=>n.startsWith(article+'.'+hash+'.retry-')&&n.endsWith('.json')&&!n.endsWith('.transport-recovery.json')).sort();
  for(const name of retries){
   const rb=await readFile(join(auditDir,name)),rec=JSON.parse(rb),r0=rec.retryOfAudit;
   const binds=!!r0&&prior.receipt.status==='failed'&&rel(r0.path)===rel(prior.path)&&r0.sha256===prior.sha256;
   chain.push({file:name,status:rec.status,recordedAt:rec.recordedAt,retryOfBound:binds});
   if(!binds)continue;
   prior={path:join(auditDir,name),name,receipt:rec,sha256:sha(rb)};
  }
  return {status:prior.receipt.status,path:rel(prior.path),recordedAt:prior.receipt.recordedAt,chain};
 };
 const versions=[];
 for(const n of names.sort()){
  const b=await readFile(join(dir,n)),h=sha(b);
  const receipt=await resolveReceipt(it.articleId,h);
  versions.push({file:n,sha256:h,auditStatus:receipt.status,auditRecordedAt:receipt.recordedAt,effectiveReceiptPath:receipt.path,receiptChain:receipt.chain});
 }
 const passed=versions.filter(x=>x.auditStatus==='passed').sort((x,y)=>(x.auditRecordedAt<y.auditRecordedAt?1:x.auditRecordedAt>y.auditRecordedAt?-1:0));
 r.canonicalVersions={articleId:it.articleId,versions,effectiveLatestPassed:passed[0]?{file:passed[0].file,sha256:passed[0].sha256,recordedAt:passed[0].auditRecordedAt}:null,
  chosenVersionMatchesEffectiveLatestPassed:!!passed[0]&&passed[0].sha256===cSha};
 r.checks.chosenIsEffectiveLatestPassed=r.canonicalVersions.chosenVersionMatchesEffectiveLatestPassed;

 const heldByStructure=structureHolds.sourceId===it.sourceId&&structureHolds.articleIds.includes(it.articleId)&&!definitionArticles.has(it.articleId);
 r.hold={sourceStructureHeld:heldByStructure,definitionSelectionEntry:definitionArticles.has(it.articleId),articleIdsHeld:structureHolds.articleIds.includes(it.articleId)};
 r.blockedByDefinitionBoundaryHold=heldByStructure;
 r.eligible=Object.entries(r.checks).every(([,v])=>v)&&!heldByStructure;
 out.items.push(r);
}
out.eligibleKeys=out.items.filter(i=>i.eligible).map(i=>i.key);
out.heldKeys=out.items.filter(i=>i.blockedByDefinitionBoundaryHold).map(i=>i.key);
out.allEligiblePassedChecks=out.items.filter(i=>i.eligible).every(i=>Object.values(i.checks).every(Boolean));
out.handoffHashesAllMatchExpected=out.handoffs.every(h=>h.shaMatchesExpected);
// cross-book numbering guard: same numeric tail, different books, never merged
out.crossBookGuard={checked:[
 {chapterId:'nemata-jp-chapter-215-4',sourceId:'nemata-jp',inRegister:true,coveredInPreview:true},
 {chapterId:'79-cn-chapter-215-4',sourceId:'79-cn',inRegister:true,coveredInPreview:false,pdfGapPages:[217]},
 {chapterId:'79-cn-chapter-081-8',sourceId:'79-cn',stagedThisBatch:true},
 {chapterId:'nemata-jp-chapter-089-1',sourceId:'nemata-jp',stagedThisBatch:true},
 {chapterId:'nemata-jp-chapter-060-1',sourceId:'nemata-jp',stagedThisBatch:true}],
 rule:'dedupe key is book+canonical article id; a shared numeric tail is not identity'};
await writeFile('_analysis/coac250-12th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({handoffs:out.handoffs,prior:out.prior,eligible:out.eligibleKeys,held:out.heldKeys,allEligiblePassedChecks:out.allEligiblePassedChecks,handoffHashesAllMatchExpected:out.handoffHashesAllMatchExpected,
 items:out.items.map(i=>({key:i.key,eligible:i.eligible,failedChecks:Object.entries(i.checks).filter(([,v])=>!v).map(([k])=>k),
  diff:i.chain.diff,gate:i.gate.status,auditRecordedAt:i.audit.recordedAt,manifest:i.dependencyManifest.recordedSha256,
  versions:i.canonicalVersions.versions,effective:i.canonicalVersions.effectiveLatestPassed,pendingBefore:i.dedupe.pendingEntryBefore}))},null,1));
