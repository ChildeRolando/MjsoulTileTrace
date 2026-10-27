// COAC-250 eighth batch: deterministic pre-consume verification for the four newly passed
// web correspondences 174-1 / 187-1 / 198-1 (COAC-248 handoffs) and 215-4 (COAC-249 handoff).
// Zero model calls, zero production calls. Recomputes every declared SHA, the revision chain,
// the auditor snapshot and the dependency manifest before anything is selected or built.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
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

const items=[
 {key:'174-1',original:'nemata-jp-chapter-174-1',sourceId:'modern-yabejp-ja',articleId:'chapter02-section024',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter02-section024.7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7.json',
  expectedCandidateSha256:'7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7',
  expectedAuditSha256:'8f586cab236f47fdddbb4a7e9fc3a53721205d5fae72e10ef5d0dff08c9290fa',
  expectedParentSha256:'0af14db9257c169c8dd0884fac2668d1d222b53b31bd00d319e9f02950cfb659',
  expectedParentAuditSha256:'678e5c8d03559643b5fbbc2ba7b09fb542d5cc6f57b2ce16ef50b2a19cd197d2',
  expectedSourceSha256:'732efdb6692088602c843f21574b251013482e826be79c14669f8c336bce6e1f',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter02-section024-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter02-section024:b0036'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'187-1',original:'nemata-jp-chapter-187-1',sourceId:'modern-yabejp-ja',articleId:'chapter03-section006',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section006.310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2.json',
  expectedCandidateSha256:'310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2',
  expectedAuditSha256:'1dff00c2dad7381519e44ee225d8dcc9550e8cb659aa3a031effc414362e3e45',
  expectedParentSha256:'a09441ee2d656618bcf2ed97e573e4524d62ba5b3c94fbcc7ec714aeb77a4d73',
  expectedParentAuditSha256:'02b455cc98418b076cc876d98cc3bfdb07be270efca1ec8e5c298c892acdd3d7',
  expectedSourceSha256:'cc67a6d1dcb9ed4415176da143bce497a806174f0bad22952c0fd61c6a29737f',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter03-section006-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter03-section006:b0095'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'198-1',original:'nemata-jp-chapter-198-1',sourceId:'modern-yabejp-ja',articleId:'chapter03-section012',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section012.af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b.json',
  expectedCandidateSha256:'af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b',
  expectedAuditSha256:'d930c9ef68a2771347e182c9964ed7c48a9b5aacc3cc90fa72127109be802669',
  expectedParentSha256:'62d901f6a2c5b8fb6c4512693cf2c90ad6ed931a9e812449cad5ec3125d5d1f6',
  expectedParentAuditSha256:'69dc54916a0913ae0c3976130a0ce44f8896187b1a9f05a8a6416d2b47d59ec4',
  expectedSourceSha256:'894d33804c0b8528a38f91fc1750759f26588936791bc981cd0bf2870c364092',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter03-section012-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter03-section012:b0082'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'215-4',original:'nemata-jp-chapter-215-4',sourceId:'modern-yabejp-ja',articleId:'chapter03-section027',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section027.a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817.json',
  expectedCandidateSha256:'a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817',
  expectedAuditSha256:'8f02f59353b4b44da822bbab2d0713c509c90c9a1e215082c38f6fffd91e2e15',
  expectedParentSha256:'e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9',
  expectedParentAuditSha256:'42d80845eb434439bf7d81a811749b743de18b5043ed4ff930683a6d0c9ed918',
  expectedSourceSha256:'76944539e0a90d8d6063968465768e01a13badf8b589e7d36fe0db7317d8b0c4',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter03-section027-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter03-section027:b0011'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:null,
  expectedManifestSha256:'0aa071a4b6ad74acdf4dceb6538438f88b5c8278800ea21acf0687b0aa0cd789',
  expectedAuditorSnapshotSha256:'856dad9d46d2d0d47436388e792caa2aac251ad68b4b8d03ff2e1fbd03158881',
  manifestOut:'audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json'}
];

const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const handoffNames=[
 ['174-1','integration/coac250-incremental-174-1-20261027.json'],
 ['187-1/198-1','integration/coac250-incremental-187-1-198-1-20261027.json'],
 ['215-4','integration/coac249-incremental-215-4-rev2-20261027.json']
];
const handoffs={};
for(const [k,p] of handoffNames)handoffs[k]={path:p,sha256:sha(await readFile(join(root,p)))};
const out={schema:'coac250-pre-consume-verification-20261027h/1',modelCalls:0,productionCalls:0,handoffs,
 prior:{preview:pointer.output,pointerSha256:sha(pointerBytes),corpusId:pointer.corpusId,chapters:priorReceipt.chapters,units:priorReceipt.units,blocks:priorReceipt.blocks,figures:priorReceipt.figures,selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},
 items:[]};

for(const it of items){
 const r={key:it.key,original:it.original,checks:{}};
 const cBytes=await readFile(join(root,it.candidate)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
 const aBytes=await readFile(join(root,it.audit)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
 r.candidate={path:it.candidate,sha256:cSha,blocks:candidate.body.blocks.length,figures:candidate.figures.length,title:candidate.title};
 r.audit={path:it.audit,sha256:aSha,status:audit.status,recordedAt:audit.recordedAt,method:audit.method,effectiveModelChecks:audit.effectiveModelChecks,
  calls:(audit.calls||[]).map(c=>({callId:c.callId,model:c.model,reasoningEffort:c.reasoningEffort,success:c.success,usage:c.usage})),
  inheritedCalls:(audit.inheritedCalls||[]).map(c=>({callId:c.callId,model:c.model,success:c.success}))};
 r.checks.candidateShaExpected=cSha===it.expectedCandidateSha256;
 r.checks.auditShaExpected=aSha===it.expectedAuditSha256;
 r.checks.receiptBindsCandidate=cSha===audit.production.sha256&&rel(audit.production.path).endsWith('/'+it.candidate);
 r.checks.receiptPassed=audit.status==='passed';

 const srcPath=join(root,candidate.source.sourcePath),sBytes=await readFile(srcPath),source=JSON.parse(sBytes);
 r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),mainSha256:source.main&&source.main.sha256,htmlSha256:source.html&&source.html.sha256,tables:Array.isArray(source.tables)?source.tables.length:0};
 r.checks.sourceShaExpected=sha(sBytes)===it.expectedSourceSha256;
 r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
 r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256&&audit.source.htmlSha256===source.html.sha256;
 r.checks.noTableGeometryHold=r.source.tables===0;

 const rev=candidate.provenance.revision;
 const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
 const secondOrder=/\.rev\d+\.json$/.test(rev.parentPath);
 r.chain={kind:rev.firstRevision?'first-revision':(secondOrder?'second-order-revision':'targeted-revision'),parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds};
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
 r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),targetTextIds:rev.textBlockIds,changedFigureIds:changedFigures.map(f=>f.figureId),figuresDifferingOnlyByDerivedPresentationAsset:derivedOnlyFigures.map(f=>f.figureId),unchangedBlocks:candidate.body.blocks.length-changedBlocks.length};
 r.checks.targetTextIdsAsDeclared=JSON.stringify(rev.textBlockIds)===JSON.stringify(it.expectedTargetTextIds);
 r.checks.onlyTargetedBlocksChanged=changedBlocks.length===rev.textBlockIds.length&&changedBlocks.every(b=>rev.textBlockIds.includes(blockId(b)))&&changedFigures.length===0;
 r.checks.remainingBlocksByteIdentical=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parentCandidate.body.blocks[i])).length===candidate.body.blocks.length-rev.textBlockIds.length;
 r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));
 r.checks.figureAssetsInheritedFromParent=candidate.figures.length===0?true:(changedFigures.length===0&&derivedOnlyFigures.length===candidate.figures.length);

 const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
 const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
 r.auditor={path:aud.path,sha256:sha(audBytes),declared:aud.sha256,combined:snapshot.combinedSha256,files:snapshot.files.map(f=>({name:f.name,sha256:f.sha256}))};
 r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);
 if(it.expectedAuditorSnapshotSha256)r.checks.auditorSnapshotMatchesHandoff=r.auditor.combined===it.expectedAuditorSnapshotSha256;

 const baseDir=join(root,it.manifestBase);
 let manifestPath=it.manifestPath,recorded;
 if(!manifestPath){
  const built=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
  recorded={schema:'coac250-recorded-verification-dependency-manifest/1',recordedAt:new Date().toISOString(),reason:'COAC-249 declared dependency manifest for the frozen target-text-chain runtime; recorded deterministically from the frozen base, zero model calls.',manifest:built};
  await mkdir(dirname(join(root,it.manifestOut)),{recursive:true});
  await writeFile(join(root,it.manifestOut),JSON.stringify(recorded,null,2)+'\n');
  manifestPath=it.manifestOut;
 } else recorded=await load(join(root,manifestPath));
 const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
 r.dependencyManifest={base:it.manifestBase,recordedPath:manifestPath,recordedSha256:recorded.manifest.manifestSha256,rebuiltSha256:rebuilt.manifestSha256,diff:diffVerificationDependencies(recorded.manifest.files,rebuilt.files),
  snapshotJsFilesCoveredByManifest:snapshot.files.filter(f=>f.name.endsWith('.mjs')).every(f=>rebuilt.files.some(x=>x.name===f.name&&x.sha256===f.sha256)),
  snapshotNonModuleFilesVerifiedBySnapshotOnly:snapshot.files.filter(f=>!f.name.endsWith('.mjs')).map(f=>({name:f.name,sha256:f.sha256,verified:sha(f.content)===f.sha256}))};
 if(it.expectedManifestSha256)r.checks.manifestShaMatchesHandoff=recorded.manifest.manifestSha256===it.expectedManifestSha256;
 r.checks.manifestFilesMatchAuditorSnapshot=r.dependencyManifest.snapshotJsFilesCoveredByManifest&&r.dependencyManifest.snapshotNonModuleFilesVerifiedBySnapshotOnly.every(f=>f.verified);
 const v=await verifyVerificationDependencyManifest({baseDir,manifest:recorded.manifest});
 r.checks.manifestStillMatchesBase=v.ok===true;

 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath)),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed';

 const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.original),pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
 r.checks.wasPendingBeforeBuild=!!pendingEntry&&pendingEntry.error==='web_audit_not_passed_or_inputs_changed';
 r.expectedPreviewChapterId=it.expectedPreviewChapterId;

 r.allChecksPassed=Object.values(r.checks).every(Boolean);
 out.items.push(r);
}
out.allPassed=out.items.every(i=>i.allChecksPassed);
await writeFile('_analysis/coac250-8th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,handoffs:out.handoffs,items:out.items.map(i=>({key:i.key,allChecksPassed:i.allChecksPassed,failedChecks:Object.entries(i.checks).filter(([,v])=>!v).map(([k])=>k),diff:i.chain.diff,gate:i.gate.status,auditStatus:i.audit.status,manifest:i.dependencyManifest.recordedSha256,dedupe:i.dedupe}))},null,2));
