// COAC-250 tenth batch: deterministic pre-consume verification for the COAC-249 b5b6 handoff
// (142-1/chapter01-section054, 127-1/chapter01-section047, 027-1/chapter01-section010) plus the
// already-passed 199-1 companion (chapter03-section013). Zero model calls, zero production calls.
// Recomputes every declared SHA, the revision chain, the auditor snapshot, the dependency manifest
// and (for the three 269 receipts) the dependency attestation before anything is selected or built.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root='E:/AgentData/Coach/knowledge/processing';
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const rel=p=>p.split('\\').join('/');
const {verifyAuditForWebCandidate}=await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-web.mjs'));
const {buildVerificationDependencyManifest,verifyVerificationDependencyManifest,diffVerificationDependencies}=
 await import(pathToFileURL(repo+'/scripts/scene-study/textbook-audit-verification-dependencies.mjs'));

const HANDOFF='integration/coac249-incremental-269-b5b6-20261027.json';
const TARGET_MANIFEST='audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json';
const TARGET_MANIFEST_SHA='0aa071a4b6ad74acdf4dceb6538438f88b5c8278800ea21acf0687b0aa0cd789';
const TARGET_SNAPSHOT='856dad9d46d2d0d47436388e792caa2aac251ad68b4b8d03ff2e1fbd03158881';
const E89_MANIFEST='audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json';
const E89_MANIFEST_SHA='ed07f6b824de75f5999d0f3169c7dae37580c2474035f0cb5ec234e2ed6cac5d';
const E89_SNAPSHOT='453ba938015d244e36a1b8aad05e7500c598de7a5dd97768f2defab4b973b8e1';

const items=[
 {key:'199-1',original:'nemata-jp-chapter-199-1',sourceId:'modern-yabejp-ja',articleId:'chapter03-section013',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json',
  expectedCandidateSha256:'3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.retry-1793095290967-e15ea7b7.json',
  expectedAuditSha256:'2247cb220cf2b82a291510f5ca06573c3c8c13720065d63d884bf2499d5c0563',
  expectedParentSha256:'37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292',
  expectedParentAuditSha256:'3856483c70366c5ba7a225ca80042f4b54072da96b8acfc9f906a78c41fd6f49',
  expectedSourceSha256:'487d432cf454023931abc6b321412162da65095954a4002fcf733133fecfd863',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter03-section013-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter03-section013:b0006','modern-yabejp-ja:chapter03-section013:b0009'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:E89_MANIFEST,expectedManifestSha256:E89_MANIFEST_SHA,expectedAuditorSnapshotSha256:E89_SNAPSHOT,
  attestationPath:null,reusedFrom:'integration/coac250-incremental-199-1-20261027.json'},
 {key:'142-1',original:'nemata-jp-chapter-142-1',sourceId:'modern-yabejp-ja',articleId:'chapter01-section054',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.coac269rev1.json',
  expectedCandidateSha256:'f3570e7bbe61e0ef99e45a2f4185ed3f0c1fe1840f670783c7fd2402352dedca',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section054.f3570e7bbe61e0ef99e45a2f4185ed3f0c1fe1840f670783c7fd2402352dedca.json',
  expectedAuditSha256:'5a8a41e7362719b52dd9b013859f9bb406d43865e33fdb548300e00fb60badff',
  expectedParentSha256:'264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e',
  expectedParentAuditSha256:'78ffbdda38185f4ae14f4caeae0a4e9ac015998658f831714e0bf856cd2a6872',
  expectedSourceSha256:'89afec31ea77168cb86f94a4919bd5ef813f59029e4452f77e3874dee88676cc',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter01-section054-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter01-section054:b0173'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:TARGET_MANIFEST,expectedManifestSha256:TARGET_MANIFEST_SHA,expectedAuditorSnapshotSha256:TARGET_SNAPSHOT,
  attestationPath:'audit/runtime-patches/20261027-coac249-batch6/attestation-chapter01-section054-f3570e7b.json'},
 {key:'127-1',original:'nemata-jp-chapter-127-1',sourceId:'modern-yabejp-ja',articleId:'chapter01-section047',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.coac269rev1.json',
  expectedCandidateSha256:'363fd45cc99f099cfbaec296a1102af0d6dd5519596af707697c21154280c86d',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section047.363fd45cc99f099cfbaec296a1102af0d6dd5519596af707697c21154280c86d.json',
  expectedAuditSha256:'05be99be66bf8c579814b0cb392c9c57f82fdde0b40dc47e63cc374e49702696',
  expectedParentSha256:'0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc',
  expectedParentAuditSha256:'3d5a7175621388527f9a3af6158cb21eb8bb83338acdcf2d0d214a8d691aad5a',
  expectedSourceSha256:'15fa058ba54622b1c812b29dd0b1d8b2b612d68b8fe1386a8f501cb6b4f83371',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter01-section047-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter01-section047:b0030'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:TARGET_MANIFEST,expectedManifestSha256:TARGET_MANIFEST_SHA,expectedAuditorSnapshotSha256:TARGET_SNAPSHOT,
  attestationPath:'audit/runtime-patches/20261027-coac249-batch6/attestation-chapter01-section047-363fd45c.json'},
 {key:'027-1',original:'nemata-jp-chapter-027-1',sourceId:'modern-yabejp-ja',articleId:'chapter01-section010',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section010.coac269rev1.json',
  expectedCandidateSha256:'44ce506db642a287d8becffe155bf287a147032cc11b0b0b992fa7a85eace50c',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section010.44ce506db642a287d8becffe155bf287a147032cc11b0b0b992fa7a85eace50c.json',
  expectedAuditSha256:'bdb29387e6fdbb875ca7150223b18659a06a8964ad6afceda4b562088450b5e0',
  expectedParentSha256:'7ebd1f9736018ab21e85e0a91d2517e1c738fa56a9d4ca060c360bf9c21a566b',
  expectedParentAuditSha256:'57d283a67ea10b4ba1ec399700a8c31fc849d625ca001bb03f5dac41ac8dd6f4',
  expectedSourceSha256:'eead468938ab9770eecc8b2323f72be0dd4dae72618355e4c9bee227dd527387',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter01-section010-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter01-section010:b0056'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:TARGET_MANIFEST,expectedManifestSha256:TARGET_MANIFEST_SHA,expectedAuditorSnapshotSha256:TARGET_SNAPSHOT,
  attestationPath:'audit/runtime-patches/20261027-coac249-batch6/attestation-chapter01-section010-44ce506d.json'}
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
const handoffBytes=await readFile(join(root,HANDOFF));

const out={schema:'coac250-pre-consume-verification-20261027k/1',modelCalls:0,productionCalls:0,
 handoff:{path:HANDOFF,sha256:sha(handoffBytes)},
 prior:{preview:pointer.output,pointerReceiptSha256:sha(pointerReceiptBytes),corpusId:pointer.corpusId,
  chapters:priorReceipt.chapters,units:priorReceipt.units,blocks:priorReceipt.blocks,figures:priorReceipt.figures,
  selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},
 structureHolds:{path:'integration/source-structure-holds.json',articleIds:structureHolds.articleIds},
 definitionSelectionArticles:[...definitionArticles],
 items:[]};

for(const it of items){
 const r={key:it.key,original:it.original,articleId:it.articleId,checks:{}};
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
 r.chain={parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds,notesPath:rev.notesPath};
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
 r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),targetTextIds:rev.textBlockIds,changedFigureIds:changedFigures.map(f=>f.figureId),figuresDifferingOnlyByDerivedPresentationAsset:derivedOnlyFigures.length,unchangedBlocks:candidate.body.blocks.length-changedBlocks.length};
 r.checks.targetTextIdsAsDeclared=JSON.stringify(rev.textBlockIds)===JSON.stringify(it.expectedTargetTextIds);
 r.checks.onlyTargetedBlocksChanged=changedBlocks.length===rev.textBlockIds.length&&changedBlocks.every(b=>rev.textBlockIds.includes(blockId(b)))&&changedFigures.length===0;
 r.checks.remainingBlocksByteIdentical=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parentCandidate.body.blocks[i])).length===candidate.body.blocks.length-rev.textBlockIds.length;
 r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));
 r.checks.figureAssetsInheritedFromParent=candidate.figures.length===0?true:(changedFigures.length===0&&derivedOnlyFigures.length===candidate.figures.length);

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
  r.attestation={path:it.attestationPath,sha256:sha(ab),kind:att.kind,verifier:att.verifier,manifestSha256:att.manifest&&att.manifest.manifestSha256,
   receipt:{path:att.receipt&&att.receipt.path,sha256:att.receipt&&att.receipt.sha256,status:att.receipt&&att.receipt.status},originalModelCalls:callChecks};
  r.checks.attestationManifestIsFrozen=!!att.manifest&&att.manifest.manifestSha256===it.expectedManifestSha256;
  r.checks.attestationReceiptBindsThisAudit=!!att.receipt&&rel(att.receipt.path)===rel(it.audit)&&att.receipt.sha256===aSha&&att.receipt.status==='passed';
  r.checks.attestationModelCallsPresent=callChecks.length>0&&callChecks.every(c=>c.matches);
  r.checks.attestationManifestStillVerifies=(await verifyVerificationDependencyManifest({baseDir,manifest:att.manifest})).ok===true;
 }

 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath)),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed';

 const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.original),pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
 r.expectedPreviewChapterId=it.expectedPreviewChapterId;

 // canonical version inventory: every candidate file for this canonical article, its receipt status
 const dir=join(root,'web-production/v1/candidates',it.sourceId);
 const canon=n=>{let v=n.replace(/\.json$/,'');for(;;){const w=v.replace(/\.(?:display|coac269rev\d+|rev\d+|r\d+)$/,'');if(w===v)return v;v=w;}};
 const names=(await readdir(dir)).filter(n=>n.endsWith('.json')&&canon(n)===it.articleId);
 const auditDir=join(root,'audit/web/articles',it.sourceId);
 const auditNames=await readdir(auditDir);
 // Mirror textbook-audit-web.mjs latestWebAuditReceipt: a failed base receipt is superseded by a
 // .retry- receipt only when retry.retryOfAudit binds the immediately prior receipt (path + sha).
 const resolveReceipt=async (article,hash)=>{
  const baseName=article+'.'+hash+'.json',basePath=join(auditDir,baseName);
  let prior=null;
  try{const b=await readFile(basePath);prior={path:basePath,name:baseName,receipt:JSON.parse(b),sha256:sha(b)};}catch(error){if(error.code!=='ENOENT')throw error;return {status:'none',path:null,recordedAt:null,chain:[]};}
  const chain=[{file:prior.name,status:prior.receipt.status,recordedAt:prior.receipt.recordedAt}];
  const retries=auditNames.filter(n=>n.startsWith(article+'.'+hash+'.retry-')&&n.endsWith('.json')&&!n.endsWith('.transport-recovery.json')).sort();
  for(const name of retries){
   const rb=await readFile(join(auditDir,name)),rec=JSON.parse(rb),r=rec.retryOfAudit;
   const binds=!!r&&prior.receipt.status==='failed'&&rel(r.path)===rel(prior.path)&&r.sha256===prior.sha256;
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
 r.canonicalVersions={articleId:it.articleId,versions,effectiveLatestPassed:passed[0]?{file:passed[0].file,sha256:passed[0].sha256}:null,chosenVersionMatchesEffectiveLatestPassed:!!passed[0]&&passed[0].sha256===cSha};
 r.checks.chosenIsEffectiveLatestPassed=r.canonicalVersions.chosenVersionMatchesEffectiveLatestPassed;

 // pre-existing structural hold (chapter01-section010 today)
 const heldByStructure=structureHolds.sourceId===it.sourceId&&structureHolds.articleIds.includes(it.articleId)&&!definitionArticles.has(it.articleId);
 r.hold={sourceStructureHeld:heldByStructure,definitionSelectionEntry:definitionArticles.has(it.articleId),articleIdsHeld:structureHolds.articleIds.includes(it.articleId)};
 r.blockedByDefinitionBoundaryHold=heldByStructure;
 r.eligible=Object.entries(r.checks).every(([,v])=>v)&&!heldByStructure;
 out.items.push(r);
}
out.eligibleKeys=out.items.filter(i=>i.eligible).map(i=>i.key);
out.heldKeys=out.items.filter(i=>i.blockedByDefinitionBoundaryHold).map(i=>i.key);
out.allEligiblePassedChecks=out.items.filter(i=>i.eligible).every(i=>Object.values(i.checks).every(Boolean));
await writeFile('_analysis/coac250-10th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({handoff:out.handoff,prior:out.prior,eligible:out.eligibleKeys,held:out.heldKeys,allEligiblePassedChecks:out.allEligiblePassedChecks,
 items:out.items.map(i=>({key:i.key,eligible:i.eligible,blockedByDefinitionBoundaryHold:i.blockedByDefinitionBoundaryHold,
  failedChecks:Object.entries(i.checks).filter(([,v])=>!v).map(([k])=>k),
  diff:i.chain.diff,gate:i.gate.status,auditRecordedAt:i.audit.recordedAt,manifest:i.dependencyManifest.recordedSha256,
  attestation:i.attestation?{manifest:i.attestation.manifestSha256,receipt:i.attestation.receipt}:null,
  versions:i.canonicalVersions.versions,effective:i.canonicalVersions.effectiveLatestPassed,
  pendingBefore:i.dedupe.pendingEntryBefore}))},null,1));
