// COAC-250 sixth batch: deterministic pre-consume verification for the two newly passed
// web correspondences (227-1 / 246-1). Zero model calls, zero data-root writes.
import {readFile,writeFile} from 'node:fs/promises';
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

const items=[
 {key:'227-1',original:'nemata-jp-chapter-227-1',sourceId:'modern-yabejp-ja',articleId:'chapter04-section007',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section007.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter04-section007.4e1c6ed36bef34ff0a9848ba8915f46b0422a9f71b611775f5ee7981292590d6.json',
  expectedCandidateSha256:'4e1c6ed36bef34ff0a9848ba8915f46b0422a9f71b611775f5ee7981292590d6',
  expectedAuditSha256:'b3b209a31ea5c0a78ae4dad7300959322472b5fae9f8d79fb17481849b225696',
  expectedParentSha256:'b496daf315d5278e20aa81e233c156fad909add5efd97438acbbace5c6902740',
  expectedParentAuditSha256:'594ec4dfe289633fc3e0734a10241cbf924b64a4b4a2ce5b763e324a61ca1c9a',
  expectedSourceSha256:'c4357e17bac3e079bffc1f39f53c6d190a4d4597f1ecde07275d29fba5e53d5b',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter04-section007-chapter',
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'246-1',original:'nemata-jp-chapter-246-1',sourceId:'modern-yabejp-ja',articleId:'chapter06-section002',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter06-section002.bbf15bbd1390a0b7ce729d5205a65dad72e0f24cb6c2fe1f9789aaaea26e1904.json',
  expectedCandidateSha256:'bbf15bbd1390a0b7ce729d5205a65dad72e0f24cb6c2fe1f9789aaaea26e1904',
  expectedAuditSha256:'8e573eb3a4500da4ff55dc6e5788616830cdbf61a1857fad7e3991f80f7dcd3b',
  expectedParentSha256:'eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4',
  expectedParentAuditSha256:'53f38a52975a3a4545ff4c405f981127e706aaef104fe1b173505d84a4d22dab',
  expectedSourceSha256:'8ea3a7139a78ed4fcdfd36f663c2a47d0eb15efb8c4b88d4aff07336642f2933',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter06-section002-chapter',
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'}
];

const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const out={schema:'coac250-pre-consume-verification-20261027f/1',modelCalls:0,productionCalls:0,
 prior:{preview:pointer.output,pointerSha256:sha(pointerBytes),corpusId:pointer.corpusId,chapters:priorReceipt.chapters,units:priorReceipt.units,blocks:priorReceipt.blocks,figures:priorReceipt.figures,selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},
 items:[]};

for(const it of items){
 const r={key:it.key,original:it.original,checks:{}};
 const cBytes=await readFile(join(root,it.candidate)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
 const aBytes=await readFile(join(root,it.audit)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
 r.candidate={path:it.candidate,sha256:cSha,blocks:candidate.body.blocks.length,figures:candidate.figures.length,title:candidate.title};
 r.audit={path:it.audit,sha256:aSha,status:audit.status,recordedAt:audit.recordedAt,method:audit.method,effectiveModelChecks:audit.effectiveModelChecks,effectiveModelReviewSummary:audit.effectiveModelReview&&audit.effectiveModelReview.summary,
  calls:(audit.calls||[]).map(c=>({callId:c.callId,model:c.model,reasoningEffort:c.reasoningEffort,success:c.success,usage:c.usage})),
  inheritedCalls:(audit.inheritedCalls||[]).map(c=>({callId:c.callId,scope:c.scope,model:c.model,success:c.success})),
  productionCallId:audit.productionCall&&audit.productionCall.callId};
 r.checks.candidateShaExpected=cSha===it.expectedCandidateSha256;
 r.checks.auditShaExpected=aSha===it.expectedAuditSha256;
 r.checks.receiptBindsCandidate=cSha===audit.production.sha256&&rel(audit.production.path).endsWith('/'+it.candidate);
 r.checks.receiptPassed=audit.status==='passed';
 r.checks.auditRecordedForThisRuntimeBase=!!audit.auditor&&audit.auditor.combinedSha256!==undefined;

 // source binding against the live extracted source
 const srcPath=join(root,candidate.source.sourcePath),sBytes=await readFile(srcPath),source=JSON.parse(sBytes);
 r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),mainSha256:source.main&&source.main.sha256,htmlSha256:source.html&&source.html.sha256,tables:Array.isArray(source.tables)?source.tables.length:0};
 r.checks.sourceShaExpected=sha(sBytes)===it.expectedSourceSha256;
 r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
 r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256&&audit.source.htmlSha256===source.html.sha256;
 r.checks.noTableGeometryHold=r.source.tables===0;

 // parent / targeted-revision chain
 const rev=candidate.provenance.revision;
 const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
 r.chain={kind:rev.firstRevision?'first-revision':'targeted-revision',parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds};
 r.checks.parentShaBound=pSha===it.expectedParentSha256&&pSha===rev.parentSha256&&pSha===audit.productionCall.revision.revision.parentSha256;
 r.checks.parentAuditShaBound=audit.productionCall.revision.parentAudit.sha256===it.expectedParentAuditSha256;
 const nBytes=await readFile(join(root,rev.notesPath)),notes=JSON.parse(nBytes);
 r.chain.notes={path:rev.notesPath,sha256:sha(nBytes),status:notes.status,recordedAt:notes.recordedAt,modelErrors:(notes.modelChecks&&notes.modelChecks.errors)||[]};
 r.checks.notesShaBound=sha(nBytes)===rev.notesSha256&&sha(nBytes)===audit.productionCall.revision.revision.notesSha256;
 r.checks.notesAreTheRepairedReceipt=notes.production&&notes.production.sha256===pSha&&notes.status==='needs-repair';
 // the only rewritten text is the one the parent review flagged as error.
 // presentationAsset is a derived presentation field recomputed by the gate
 // (verifyWebPresentations), so figures are compared on their substantive fields only.
 const parentCandidate=await load(join(root,rev.parentPath));
 const blockId=b=>b.sourceBlockIds[0];
 const changedBlocks=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)!==JSON.stringify(parentCandidate.body.blocks[i]));
 const substantive=f=>{const {presentationAsset,...rest}=f;return JSON.stringify(rest);};
 const changedFigures=candidate.figures.filter((f,i)=>substantive(f)!==substantive(parentCandidate.figures[i]));
 const derivedOnlyFigures=candidate.figures.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(parentCandidate.figures[i])&&substantive(f)===substantive(parentCandidate.figures[i]));
 r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),owedSourceBlockIds:parentCandidate.body.blocks.map(blockId).filter((id,i)=>id!==blockId(candidate.body.blocks[i])),changedFigureIds:changedFigures.map(f=>f.figureId),figuresDifferingOnlyByDerivedPresentationAsset:derivedOnlyFigures.map(f=>f.figureId),targetTextIds:rev.textBlockIds};
 r.checks.onlyTargetedBlockChanged=changedBlocks.length===1&&blockId(changedBlocks[0])===rev.textBlockIds[0]&&rev.textBlockIds.length===1&&changedFigures.length===0;
 r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));

 // auditor snapshot identity
 const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
 const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
 r.auditor={path:aud.path,sha256:sha(audBytes),declared:aud.sha256,combined:snapshot.combinedSha256,files:snapshot.files.map(f=>({name:f.name,sha256:f.sha256}))};
 r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);

 // dependency manifest for the runtime base the audit actually used
 const baseDir=join(root,it.manifestBase);
 const recorded=await load(join(root,it.manifestPath));
 const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
 r.dependencyManifest={
  base:it.manifestBase,
  recordedPath:it.manifestPath,
  recordedSha256:recorded.manifest.manifestSha256,
  rebuiltSha256:rebuilt.manifestSha256,
  diff:diffVerificationDependencies(recorded.manifest.files,rebuilt.files),
  snapshotJsFilesCoveredByManifest:snapshot.files.filter(f=>f.name.endsWith('.mjs')).every(f=>rebuilt.files.some(x=>x.name===f.name&&x.sha256===f.sha256)),
  snapshotNonModuleFilesVerifiedBySnapshotOnly:snapshot.files.filter(f=>!f.name.endsWith('.mjs')).map(f=>({name:f.name,sha256:f.sha256,verified:sha(f.content)===f.sha256}))
 };
 r.checks.manifestFilesMatchAuditorSnapshot=r.dependencyManifest.snapshotJsFilesCoveredByManifest&&r.dependencyManifest.snapshotNonModuleFilesVerifiedBySnapshotOnly.every(f=>f.verified);
 const v=await verifyVerificationDependencyManifest({baseDir,manifest:recorded.manifest});
 r.checks.manifestStillMatchesBase=v.ok===true;

 // live gate (what the stage/build path will use)
 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath)),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed';

 // dedupe against the current preview
 const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.original),
  pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
 r.checks.wasPendingBeforeBuild=!!pendingEntry&&pendingEntry.error==='web_audit_not_passed_or_inputs_changed';

 r.allChecksPassed=Object.values(r.checks).every(Boolean);
 out.items.push(r);
}
out.allPassed=out.items.every(i=>i.allChecksPassed);
console.log(JSON.stringify(out,null,2));
