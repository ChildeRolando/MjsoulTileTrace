// COAC-250 ninth batch: deterministic pre-consume verification for the three ready web chapters
// 201-1 (COAC-248 handoff) and 338-1 / 273-1 (COAC-269 line-B first batch, reviewed by COAC-249,
// handed to 250 as integration/coac249-incremental-269-line-b-20261027.json). Zero model calls,
// zero production calls. Recomputes every declared SHA, the revision chain, the auditor snapshot
// and the dependency manifest before anything is selected or built.
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
 {key:'201-1',original:'nemata-jp-chapter-201-1',sourceId:'modern-yabejp-ja',articleId:'chapter03-section015',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section015.d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed.json',
  expectedCandidateSha256:'d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed',
  expectedAuditSha256:'6034b9a13d54bd4992da8fcb5fa5002ed158ca2d0722aefa30c58cef77d14db6',
  expectedParentSha256:'41c7c1bfc78a528fb4a1991f44613efd7dd7a9ec5089aaa859054badcdfb2bbf',
  expectedParentAuditSha256:'77f02f9acceb64517962360e11f536152c36517b73848dcd3a99da8b98cdbeea',
  expectedSourceSha256:'8939308a3d76e724013b74b04de6d17c733314b67117a9bced68dc4bc169289a',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter03-section015-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter03-section015:b0041'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json',
  expectedManifestSha256:'ed07f6b824de75f5999d0f3169c7dae37580c2474035f0cb5ec234e2ed6cac5d',
  expectedAuditorSnapshotSha256:'453ba938015d244e36a1b8aad05e7500c598de7a5dd97768f2defab4b973b8e1',
  handoffPath:'integration/coac250-incremental-201-1-20261027.json'},
 {key:'338-1',original:'nemata-jp-chapter-338-1',sourceId:'modern-yabejp-ja',articleId:'archive01-section006',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/archive01-section006.ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782.json',
  expectedCandidateSha256:'ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782',
  expectedAuditSha256:'74b936308db353a73831061d468a44897dd5bc34118efcf6cf20120d466bafc2',
  expectedParentSha256:'04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427',
  expectedParentAuditSha256:'6d41a520affd04f57c515e02d37ef58746e88794149f385d701a9814c0be5597',
  expectedSourceSha256:'6438c449b1284be3a7be4fd5004bfcda10517716c7cbbbf8b09df2cc92722548',
  expectedPreviewChapterId:'modern-yabejp-ja-archive01-section006-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:archive01-section006:b0518'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:'audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json',
  expectedManifestSha256:'0aa071a4b6ad74acdf4dceb6538438f88b5c8278800ea21acf0687b0aa0cd789',
  expectedAuditorSnapshotSha256:'856dad9d46d2d0d47436388e792caa2aac251ad68b4b8d03ff2e1fbd03158881',
  handoffPath:'integration/coac249-incremental-269-line-b-20261027.json'},
 {key:'273-1',original:'nemata-jp-chapter-273-1',sourceId:'modern-yabejp-ja',articleId:'chapter06-exercise002-02',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e.json',
  expectedCandidateSha256:'42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e',
  expectedAuditSha256:'0553be30ea63d55cb6969b120e726ec05146d3817520cc3cf4fec18f7ab9395a',
  expectedParentSha256:'c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b',
  expectedParentAuditSha256:'3aa7dc1d73dbcf0caa710ca8a46799f69178435113c289ab53a8c4f44d9dd270',
  expectedSourceSha256:'460025a88a0adcc545afa893594c6653d0b121f75fdcfd9512350f9292b984f4',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter06-exercise002-02-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter06-exercise002-02:b0263','modern-yabejp-ja:chapter06-exercise002-02:b0545'],
  manifestBase:'audit/runtimes/web-target-text-chain-20261027',
  manifestPath:'audit/runtime-patches/20261027-coac250-215-4-target-text-chain/manifest-web-target-text-chain.json',
  expectedManifestSha256:'0aa071a4b6ad74acdf4dceb6538438f88b5c8278800ea21acf0687b0aa0cd789',
  expectedAuditorSnapshotSha256:'856dad9d46d2d0d47436388e792caa2aac251ad68b4b8d03ff2e1fbd03158881',
  handoffPath:'integration/coac249-incremental-269-line-b-20261027.json'}
];

const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const handoffPaths=[...new Set(items.map(i=>i.handoffPath))];
const handoffs={};
for(const p of handoffPaths)handoffs[p]={path:p,sha256:sha(await readFile(join(root,p)))};
const out={schema:'coac250-pre-consume-verification-20261027j/1',modelCalls:0,productionCalls:0,handoffs,
 prior:{preview:pointer.output,pointerSha256:sha(pointerBytes),corpusId:pointer.corpusId,chapters:priorReceipt.chapters,units:priorReceipt.units,blocks:priorReceipt.blocks,figures:priorReceipt.figures,selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},
 items:[]};

for(const it of items){
 const r={key:it.key,original:it.original,checks:{}};
 const cBytes=await readFile(join(root,it.candidate)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
 const aBytes=await readFile(join(root,it.audit)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
 r.handoff=handoffs[it.handoffPath];
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
 r.chain={kind:rev.firstRevision?'first-revision':(secondOrder?'second-order-revision':'targeted-revision'),parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds,notesPath:rev.notesPath};
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
await writeFile('_analysis/coac250-9th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,handoffs:out.handoffs,items:out.items.map(i=>({key:i.key,allChecksPassed:i.allChecksPassed,failedChecks:Object.entries(i.checks).filter(([,v])=>!v).map(([k])=>k),diff:i.chain.diff,gate:i.gate.status,auditStatus:i.audit.status,auditRecordedAt:i.audit.recordedAt,manifest:i.dependencyManifest.recordedSha256,dedupe:i.dedupe}))},null,2));
