// COAC-250 ninth batch (same turn): deterministic pre-consume verification for 201-1
// (chapter03-section015 rev1), handed off by COAC-248 at 2026-10-27T09:55Z after the eighth
// batch was already building. Zero model calls, zero production calls.
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

const handoffPath='integration/coac250-incremental-201-1-20261027.json';
const handoffBytes=await readFile(join(root,handoffPath));
const handoff=JSON.parse(handoffBytes);
const it=handoff.chapters[0];
const manifestBase='audit/runtimes/e89dcffe73c9100a12218b79dfba66da3f1bb08d7adaf2b64e87d9eb34619a49';
const manifestPath='audit/runtime-patches/20261027-web-audit-batch/manifest-web-e89dcffe.json';
const pointerBytes=await readFile(join(root,'integration/accepted-preview-current.json'));
const pointer=JSON.parse(pointerBytes);
const priorReceipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const priorChapters=new Set(priorReceipt.selectedWeb.flatMap(s=>s.chapterIds));
const priorWebSha=new Set(priorReceipt.selectedWeb.map(s=>s.candidateSha256));

const r={key:'201-1',original:it.chapterId,checks:{}};
const cBytes=await readFile(join(root,it.candidatePath)),cSha=sha(cBytes),candidate=JSON.parse(cBytes);
const aBytes=await readFile(join(root,it.auditPath)),aSha=sha(aBytes),audit=JSON.parse(aBytes);
r.handoff={path:handoffPath,sha256:sha(handoffBytes),recordedAt:handoff.recordedAt,currentPreviewAtHandoff:handoff.before.pointer};
r.candidate={path:it.candidatePath,sha256:cSha,blocks:candidate.body.blocks.length,figures:candidate.figures.length,title:candidate.title};
r.audit={path:it.auditPath,sha256:aSha,status:audit.status,recordedAt:audit.recordedAt,method:audit.method,effectiveModelChecks:audit.effectiveModelChecks,
 calls:(audit.calls||[]).map(c=>({callId:c.callId,model:c.model,success:c.success,usage:c.usage})),inheritedCalls:(audit.inheritedCalls||[]).map(c=>({callId:c.callId,success:c.success}))};
r.checks.candidateShaMatchesHandoff=cSha===it.candidateSha256;
r.checks.auditShaMatchesHandoff=aSha===it.auditSha256;
r.checks.receiptBindsCandidate=cSha===audit.production.sha256&&rel(audit.production.path).endsWith('/'+it.candidatePath);
r.checks.receiptPassed=audit.status==='passed'&&audit.status===it.auditStatus;

const srcPath=join(root,candidate.source.sourcePath),sBytes=await readFile(srcPath),source=JSON.parse(sBytes);
r.source={path:candidate.source.sourcePath,sha256:sha(sBytes),tables:Array.isArray(source.tables)?source.tables.length:0};
r.checks.sourceShaMatchesHandoff=sha(sBytes)===it.sourceSha256;
r.checks.sourceBoundCurrent=candidate.source.sourceSha256===sha(sBytes)&&audit.source.sourceSha256===sha(sBytes);
r.checks.sourceMainHtmlBound=candidate.source.mainSha256===source.main.sha256&&candidate.source.htmlSha256===source.html.sha256&&audit.source.mainSha256===source.main.sha256&&audit.source.htmlSha256===source.html.sha256;
r.checks.noTableGeometryHold=r.source.tables===0;

const rev=candidate.provenance.revision;
const pBytes=await readFile(join(root,rev.parentPath)),pSha=sha(pBytes);
r.chain={kind:'targeted-revision',parentPath:rev.parentPath,parentSha256:pSha,targetTextIds:rev.textBlockIds,figureIds:rev.figureIds,notesPath:rev.notesPath};
r.checks.parentShaMatchesHandoff=pSha===it.parentSha256;
r.checks.parentShaBound=pSha===it.parentSha256&&pSha===rev.parentSha256&&pSha===audit.productionCall.revision.revision.parentSha256;
r.checks.parentAuditShaMatchesHandoff=audit.productionCall.revision.parentAudit.sha256===it.parentAuditSha256;
r.checks.parentAuditPathMatchesHandoff=rel(audit.productionCall.revision.parentAudit.path)===it.parentAuditPath;
r.checks.parentAuditPathBound=rel(audit.productionCall.revision.parentAudit.path)===rel(rev.notesPath);
const nBytes=await readFile(join(root,rev.notesPath)),notes=JSON.parse(nBytes);
r.chain.notes={path:rev.notesPath,sha256:sha(nBytes),status:notes.status,recordedAt:notes.recordedAt};
r.checks.notesShaBound=sha(nBytes)===rev.notesSha256&&sha(nBytes)===audit.productionCall.revision.revision.notesSha256;
r.checks.notesAreTheRepairedReceipt=!!(notes.production&&notes.production.sha256===pSha&&notes.status==='needs-repair');

const parentCandidate=await load(join(root,rev.parentPath));
const blockId=b=>b.sourceBlockIds[0];
const changedBlocks=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)!==JSON.stringify(parentCandidate.body.blocks[i]));
const substantive=f=>{const {presentationAsset,...rest}=f;return JSON.stringify(rest);};
const changedFigures=candidate.figures.filter((f,i)=>substantive(f)!==substantive(parentCandidate.figures[i]));
const derivedOnly=candidate.figures.filter((f,i)=>JSON.stringify(f)!==JSON.stringify(parentCandidate.figures[i])&&substantive(f)===substantive(parentCandidate.figures[i]));
r.chain.diff={blockCountSame:candidate.body.blocks.length===parentCandidate.body.blocks.length,figureCountSame:candidate.figures.length===parentCandidate.figures.length,changedBlockIds:changedBlocks.map(blockId),changedFigureIds:changedFigures.map(f=>f.figureId),derivedOnlyFigureCount:derivedOnly.length,unchangedBlocks:candidate.body.blocks.length-changedBlocks.length};
r.checks.onlyTargetedBlockChanged=changedBlocks.length===1&&rev.textBlockIds.includes(blockId(changedBlocks[0]))&&changedFigures.length===0;
r.checks.remainingBlocksByteIdentical=candidate.body.blocks.filter((b,i)=>JSON.stringify(b)===JSON.stringify(parentCandidate.body.blocks[i])).length===candidate.body.blocks.length-1;
r.checks.blockOrderAndIdentityPreserved=JSON.stringify(candidate.body.blocks.map(blockId))===JSON.stringify(parentCandidate.body.blocks.map(blockId))&&JSON.stringify(candidate.figures.map(f=>f.figureId))===JSON.stringify(parentCandidate.figures.map(f=>f.figureId));
r.checks.figureAssetsInheritedFromParent=changedFigures.length===0&&derivedOnly.length===candidate.figures.length;

const aud=audit.auditor,audBytes=await readFile(join(root,aud.path)),snapshot=JSON.parse(audBytes);
const recombined=sha(Buffer.concat(snapshot.files.map(f=>Buffer.from(f.content))));
r.auditor={path:aud.path,sha256:sha(audBytes),combined:snapshot.combinedSha256,files:snapshot.files.map(f=>f.name)};
r.checks.auditorSnapshotIntact=sha(audBytes)===aud.sha256&&snapshot.combinedSha256===aud.combinedSha256&&recombined===aud.combinedSha256&&snapshot.files.every(f=>sha(f.content)===f.sha256);
const baseDir=join(root,manifestBase),recorded=await load(join(root,manifestPath));
const rebuilt=await buildVerificationDependencyManifest({baseDir,entry:'textbook-audit-web.mjs'});
r.dependencyManifest={base:manifestBase,recordedPath:manifestPath,recordedSha256:recorded.manifest.manifestSha256,rebuiltSha256:rebuilt.manifestSha256,diff:diffVerificationDependencies(recorded.manifest.files,rebuilt.files),
 snapshotJsFilesCoveredByManifest:snapshot.files.filter(f=>f.name.endsWith('.mjs')).every(f=>rebuilt.files.some(x=>x.name===f.name&&x.sha256===f.sha256))};
r.checks.manifestDiffEmpty=r.dependencyManifest.diff.added.length===0&&r.dependencyManifest.diff.removed.length===0&&r.dependencyManifest.diff.changed.length===0;
r.checks.manifestFilesMatchAuditorSnapshot=r.dependencyManifest.snapshotJsFilesCoveredByManifest;
const v=await verifyVerificationDependencyManifest({baseDir,manifest:recorded.manifest});
r.checks.manifestStillMatchesBase=v.ok===true;

const gate=await verifyAuditForWebCandidate(root,join(root,it.candidatePath));
r.gate={status:gate.status,auditPath:rel(gate.auditPath||''),auditSha256:sha(await readFile(gate.auditPath))};
r.checks.gatePassedLive=gate.status==='passed';

const pendingEntry=priorReceipt.pendingWeb.find(p=>rel(p.path).endsWith('/'+it.articleId+'.display.json'));
r.dedupe={candidateShaAlreadyInPreview:priorWebSha.has(cSha),originalAlreadyCovered:priorChapters.has(it.chapterId),pendingEntryBefore:pendingEntry?{path:rel(pendingEntry.path),error:pendingEntry.error}:null};
r.checks.notAlreadyInPreview=!r.dedupe.candidateShaAlreadyInPreview&&!r.dedupe.originalAlreadyCovered;
r.checks.wasPendingBeforeBuild=!!pendingEntry&&pendingEntry.error==='web_audit_not_passed_or_inputs_changed';
r.expectedPreviewChapterId='modern-yabejp-ja-chapter03-section015-chapter';
r.allChecksPassed=Object.values(r.checks).every(Boolean);
const out={schema:'coac250-pre-consume-verification-20261027i/1',modelCalls:0,productionCalls:0,prior:{preview:pointer.output,pointerSha256:sha(pointerBytes),corpusId:pointer.corpusId,chapters:priorReceipt.chapters,units:priorReceipt.units,selectedWeb:priorReceipt.selectedWeb.length,pendingWeb:priorReceipt.pendingWeb.length},items:[r],allPassed:r.allChecksPassed};
await writeFile('_analysis/coac250-9th-batch-preconsume-20261027.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,failedChecks:Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>k),candidate:r.candidate,audit:{status:r.audit.status,recordedAt:r.audit.recordedAt},diff:r.chain.diff,dedupe:r.dedupe,manifest:r.dependencyManifest.recordedSha256},null,1));
