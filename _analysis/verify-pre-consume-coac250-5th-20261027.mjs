// COAC-250 fifth batch: deterministic pre-consume verification for the three newly passed
// web correspondences (211-1 / 173-1 / 116-1). Zero model calls, zero data-root writes except
// the one new dependency manifest recorded for the first-revision runtime base.
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
 {key:'211-1',original:'nemata-jp-chapter-211-1',sourceId:'modern-yabejp-ja',articleId:'chapter03-section024',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json',
  expectedCandidateSha256:'643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba',
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'173-1',original:'nemata-jp-chapter-173-1',sourceId:'modern-yabejp-ja',articleId:'chapter02-section023',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json',
  expectedCandidateSha256:'098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3',
  manifestBase:'audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49',
  manifestPath:'audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json'},
 {key:'116-1',original:'nemata-jp-chapter-116-1',sourceId:'modern-yabejp-ja',articleId:'chapter01-section041',
  candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.rev3.json',
  audit:'audit/web/articles/modern-yabejp-ja/chapter01-section041.6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46.json',
  expectedCandidateSha256:'6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46',
  manifestBase:'audit/runtimes/web-first-revision-20261027',
  manifestPath:null,
  manifestOut:'audit/runtime-patches/20261027-coac250-116-1-first-revision/manifest-web-first-revision.json'}
];

const pointer=await load(join(root,'integration/accepted-preview-current.json'));
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));
const out={schema:'coac250-pre-consume-verification-20261027e/1',modelCalls:0,productionCalls:0,prior:{preview:pointer.output,corpusId:pointer.corpusId,chapters:priorReceipt.chapters,units:priorReceipt.units,selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},items:[]};

for(const it of items){
 const r={key:it.key,original:it.original,checks:{}};
 const cBytes=await readFile(join(root,it.candidate)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
 const aBytes=await readFile(join(root,it.audit)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
 r.candidate={path:it.candidate,sha256:cSha,blocks:candidate.body.blocks.length,figures:candidate.figures.length};
 r.audit={path:it.audit,sha256:aSha,status:audit.status,recordedAt:audit.recordedAt,method:audit.method,effectiveModelChecks:audit.effectiveModelChecks,effectiveModelReviewSummary:audit.effectiveModelReview&&audit.effectiveModelReview.summary};
 r.checks.candidateShaExpected=cSha===it.expectedCandidateSha256;
 r.checks.receiptBindsCandidate=cSha===audit.production.sha256&&rel(audit.production.path).endsWith('/'+it.candidate);
 r.checks.receiptPassed=audit.status==='passed';

 // source binding against the live extracted source
 const srcPath=join(root,candidate.source.sourcePath),sBytes=await readFile(srcPath),source=JSON.parse(sBytes);
 r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),mainSha256:source.main&&source.main.sha256,htmlSha256:source.html&&source.html.sha256};
 r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
 r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256;

 // parent / first-revision chain
 const rev=candidate.provenance.revision;
 const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
 r.chain={kind:rev.firstRevision?'first-revision':'targeted-revision',parentPath:rev.parentPath,parentSha256:pSha,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds};
 r.checks.parentShaBound=pSha===rev.parentSha256&&pSha===audit.productionCall.revision.revision.parentSha256;
 if(rev.firstRevision){
  const eBytes=await readFile(join(root,rev.evidencePath)),evidence=JSON.parse(eBytes);
  r.chain.evidence={path:rev.evidencePath,sha256:sha(eBytes),schema:evidence.schema,auditReceipt:evidence.auditReceipt,rejection:evidence.deterministicRejection,parentProductionCall:evidence.parentProductionCall};
  r.checks.evidenceShaBound=sha(eBytes)===rev.evidenceSha256&&sha(eBytes)===rev.notesSha256&&rel(rev.evidencePath)===rel(rev.notesPath);
  r.checks.evidenceBindsParent=evidence.production.sha256===pSha&&rel(evidence.production.path)===rel(rev.parentPath);
  r.checks.evidenceTargetsMatch=JSON.stringify(evidence.deterministicRejection.targetTextBlockIds)===JSON.stringify(rev.textBlockIds)&&evidence.deterministicRejection.modelCalls===0;
 }else{
  const nBytes=await readFile(join(root,rev.notesPath)),notes=JSON.parse(nBytes);
  r.chain.notes={path:rev.notesPath,sha256:sha(nBytes),status:notes.status,recordedAt:notes.recordedAt,modelErrors:(notes.modelChecks&&notes.modelChecks.errors)||[]};
  r.checks.notesShaBound=sha(nBytes)===rev.notesSha256;
  r.checks.notesAreTheRepairedReceipt=notes.production&&notes.production.sha256===pSha;
 }

 // auditor snapshot identity
 const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
 const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
 r.auditor={path:aud.path,sha256:sha(audBytes),declared:aud.sha256,combined:snapshot.combinedSha256,files:snapshot.files.map(f=>({name:f.name,sha256:f.sha256}))};
 r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);

 // dependency manifest for the runtime base the audit actually used
 const baseDir=join(root,it.manifestBase);
 let recorded=null;
 if(it.manifestPath){recorded=await load(join(root,it.manifestPath));r.checks.manifestRecorded=true;}
 const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
 const declaredFiles=recorded?recorded.manifest.files:rebuilt.files;
 r.dependencyManifest={
  base:it.manifestBase,
  recordedPath:it.manifestPath,
  recordedSha256:recorded?recorded.manifest.manifestSha256:null,
  rebuiltSha256:rebuilt.manifestSha256,
  diff:diffVerificationDependencies(declaredFiles,rebuilt.files),
  files:rebuilt.files.map(f=>({name:f.name,sha256:f.sha256})),
  snapshotJsFilesCoveredByManifest:snapshot.files.filter(f=>f.name.endsWith('.mjs')).every(f=>rebuilt.files.some(x=>x.name===f.name&&x.sha256===f.sha256)),
  snapshotNonModuleFilesVerifiedBySnapshotOnly:snapshot.files.filter(f=>!f.name.endsWith('.mjs')).map(f=>({name:f.name,sha256:f.sha256,verified:sha(f.content)===f.sha256}))
 };
 r.checks.manifestFilesMatchAuditorSnapshot=r.dependencyManifest.snapshotJsFilesCoveredByManifest&&r.dependencyManifest.snapshotNonModuleFilesVerifiedBySnapshotOnly.every(f=>f.verified);
 if(recorded){
  const v=await verifyVerificationDependencyManifest({baseDir,manifest:recorded.manifest});
  r.checks.manifestStillMatchesBase=v.ok===true;
 }else{
  let written;
  try{written=await load(join(root,it.manifestOut));}
  catch(error){
   if(error.code!=='ENOENT')throw error;
   await writeFile(join(root,it.manifestOut),JSON.stringify({schema:'coach-textbook-audit-verification-dependencies/1',recordedAt:new Date().toISOString(),base:it.manifestBase,entry:'textbook-audit-web.mjs',note:'Recorded retroactively by COAC-250 for the frozen first-revision runtime that produced the 116-1 receipt; the receipt itself already binds this runtime through audit.auditor.combinedSha256.',manifest:rebuilt},null,2)+'\n');
   written=await load(join(root,it.manifestOut));
  }
  const v=await verifyVerificationDependencyManifest({baseDir,manifest:written.manifest});
  r.dependencyManifest.recordedPath=it.manifestOut;
  r.dependencyManifest.recordedSha256=written.manifest.manifestSha256;
  r.checks.manifestCreatedForBase=v.ok===true;
 }

 // live gate (what the stage/build path will use)
 const gate=await verifyAuditForWebCandidate(root,join(root,it.candidate));
 r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),modelChecks:gate.modelChecks,effectiveModelChecks:gate.effectiveModelChecks};
 r.checks.gatePassedLive=gate.status==='passed';

 // dedupe against the current preview
 r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.original)};
 r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;

 r.allChecksPassed=Object.values(r.checks).every(Boolean);
 out.items.push(r);
}
out.allPassed=out.items.every(i=>i.allChecksPassed);
console.log(JSON.stringify(out,null,2));
