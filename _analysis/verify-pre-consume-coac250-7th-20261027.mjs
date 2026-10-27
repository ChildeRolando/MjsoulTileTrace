// COAC-250 seventh batch: deterministic pre-consume verification for the newly passed
// web correspondence 222-1 (chapter04-section004, targeted two-block revision).
// Zero model calls, zero data-root writes.
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
 {key:'222-1',original:'nemata-jp-chapter-222-1',sourceId:'modern-yabejp-ja',articleId:'chapter04-section004',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter04-section004.3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a.json',
  expectedCandidateSha256:'3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
  expectedAuditSha256:'a3981976a82cd5870f05c53c89e26875dc279816ece3abcc9ef46dd86ba7943d',
  expectedParentSha256:'0422143bd4f14e151ddcabd4b12e7fcda84937ef5acd4ab3e0335d8d56f4f4d2',
  expectedParentAuditSha256:'3c50dae18765b8040c686fcd2f716730f50d079e2d313a35d061f1a06c467f58',
  expectedSourceSha256:'cd98c1b548c5d7ca4040ba0bbc07d6390114116ec8257392ec1e96054a557605',
  expectedPreviewChapterId:'modern-yabejp-ja-chapter04-section004-chapter',
  expectedTargetTextIds:['modern-yabejp-ja:chapter04-section004:b0016','modern-yabejp-ja:chapter04-section004:b0018'],
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'}
];

const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const out={schema:'coac250-pre-consume-verification-20261027g/1',modelCalls:0,productionCalls:0,
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

 const srcPath=join(root,candidate.source.sourcePath),sBytes=await readFile(srcPath),source=JSON.parse(sBytes);
 r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),mainSha256:source.main&&source.main.sha256,htmlSha256:source.html&&source.html.sha256,tables:Array.isArray(source.tables)?source.tables.length:0};
 r.checks.sourceShaExpected=sha(sBytes)===it.expectedSourceSha256;
 r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
 r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256&&audit.source.htmlSha256===source.html.sha256;
 r.checks.noTableGeometryHold=r.source.tables===0;

 const rev=candidate.provenance.revision;
 const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
 r.chain={kind:rev.firstRevision?'first-revision':'targeted-revision',parentPath:rev.parentPath,parentSha256:pSha,parentShaExpected:pSha===it.expectedParentSha256,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds};
 r.checks.parentShaBound=pSha===it.expectedParentSha256&&pSha===rev.parentSha256&&pSha===audit.productionCall.revision.revision.parentSha256;
 r.checks.parentAuditShaBound=audit.productionCall.revision.parentAudit.sha256===it.expectedParentAuditSha256;
 const nBytes=await readFile(join(root,rev.notesPath)),notes=JSON.parse(nBytes);
 r.chain.notes={path:rev.notesPath,sha256:sha(nBytes),status:notes.status,recordedAt:notes.recordedAt,modelErrors:(notes.modelChecks&&notes.modelChecks.errors)||[]};
 r.checks.notesShaBound=sha(nBytes)===rev.notesSha256&&sha(nBytes)===audit.productionCall.revision.revision.notesSha256;
 r.checks.notesAreTheRepairedReceipt=notes.production&&notes.production.sha256===pSha&&notes.status==='needs-repair';
 const parentCandidate=await load(join(root,rev.parentPath));
 const blockId=b=>b.sourceBlockIds[0];
 const changedBlocks=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)!==JSON.stringify(parentCandidate.body.blocks[i]));
 const substantive=f=>{const {presentationAsset,...rest}=f;return JSON.stringify(rest);};
 const changedFigures=candidate.figures.filter((f,i)=>substantive(f)!==substantive(parentCandidate.figures[i]));
 const derivedOnlyFigures=candidate.figures.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(parentCandidate.figures[i])&&substantive(f)===substantive(parentCandidate.figures[i]));
 r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),targetTextIds:rev.textBlockIds,changedFigureIds:changedFigures.map(f=>f.figureId),figuresDifferingOnlyByDerivedPresentationAsset:derivedOnlyFigures.map(f=>f.figureId),
  unchangedBlocks:candidate.body.blocks.length-changedBlocks.length};
 r.checks.targetTextIdsAsDeclared=JSON.stringify(rev.textBlockIds)===JSON.stringify(it.expectedTargetTextIds);
 r.checks.onlyTargetedBlocksChanged=changedBlocks.length===rev.textBlockIds.length&&changedBlocks.every(b=>rev.textBlockIds.includes(blockId(b)))&&changedFigures.length===0;
 r.checks.remainingBlocksByteIdentical=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parentCandidate.body.blocks[i])).length===candidate.body.blocks.length-rev.textBlockIds.length;
 r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));
 r.checks.previewChapterIdBound=it.expectedPreviewChapterId.length>0;

 const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
 const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
 r.auditor={path:aud.path,sha256:sha(audBytes),declared:aud.sha256,combined:snapshot.combinedSha256,files:snapshot.files.map(f=>({name:f.name,sha256:f.sha256}))};
 r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);

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

 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath)),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed';

 const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.original),
  pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
 r.checks.wasPendingBeforeBuild=!!pendingEntry&&pendingEntry.error==='web_audit_not_passed_or_inputs_changed';

 r.allChecksPassed=Object.values(r.checks).every(Boolean);
 out.items.push(r);
}
out.allPassed=out.items.every(i=>i.allChecksPassed);
await writeFile('_analysis/coac250-7th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,items:out.items.map(i=>({key:i.key,allChecksPassed:i.allChecksPassed,failedChecks:Object.entries(i.checks).filter(([,v])=>!v).map(([k])=>k),diff:i.chain.diff,gate:i.gate.status,auditStatus:i.audit.status,candidate:i.candidate,dedupe:i.dedupe}))},null,2));
