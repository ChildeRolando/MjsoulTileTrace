// COAC-250 fifth batch: incremental refresh of the unified register after the 05:19Z build.
// History kept verbatim; only the newly staged rows, the newly receipted repair row and the
// counters change. Zero model calls.
import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration'),
 register=join(out,'coac250-unified-chapter-register-20261027b.json');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(out,'accepted-preview-current.json')),preview=pointer.output;
const receipt=await load(join(preview,'accepted-preview-receipt.json'));
const registerBytes=await readFile(register),prior=JSON.parse(registerBytes);
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-5th-batch-20261027T0520Z.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));

const updates=[
 {original:'nemata-jp-chapter-211-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json',chapterId:'modern-yabejp-ja-chapter03-section024-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section024'),note:'COAC-248 targeted b0039 revision passed 2026-10-27T04:09:52Z; dependency manifest web-e89dcffe re-verified against the frozen base'},
 {original:'nemata-jp-chapter-173-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json',chapterId:'modern-yabejp-ja-chapter02-section023-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter02-section023'),note:'COAC-248 targeted b0004 revision: first audit transport failed, retryOfAudit passed 2026-10-27T04:15:18Z'},
 {original:'nemata-jp-chapter-116-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.rev3.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter01-section041.6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46.json',chapterId:'modern-yabejp-ja-chapter01-section041-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter01-section041'),note:'COAC-248 first revision of the placeholder-rejected b0016 only; full-article first independent review passed 2026-10-27T03:22:55Z under the frozen web-first-revision runtime; dependency manifest recorded retroactively'}
];
for(const u of updates){
  const row=prior.rows.find(r=>r.originalChapterId===u.original);
  if(!row)throw Error('register_row_missing:'+u.original);
  const bytes=await readFile(join(root,u.candidate)),candidate=JSON.parse(bytes),digest=sha(bytes);
  const auditBytes=await readFile(join(root,u.auditPath)),audit=JSON.parse(auditBytes);
  const stageReceipt=await load(join(u.stageDir,'web-stage-receipt.json'));
  if(audit.status!=='passed')throw Error('audit_not_passed:'+u.original);
  row.covered=true;row.coverageRoute='web';row.verdict='covered-effective';
  row.approvedWebCorrespondence.articleInPreview=true;
  row.existingCandidate=Object.assign({},row.existingCandidate,{path:u.candidate,sha256:digest,bodyBlocks:candidate.body.blocks.length,sourceSha256:candidate.source.sourceSha256,currentSourceSha256:candidate.source.sourceSha256,sourceBoundCurrent:candidate.source.sourceSha256===audit.source.sourceSha256,auditStatus:audit.status,auditPath:u.auditPath,auditRecordedAt:audit.recordedAt,deterministicPassed:audit.deterministicChecks?audit.deterministicChecks.passed===true:null,semanticComplete:audit.effectiveModelChecks?audit.effectiveModelChecks.passed===true:null,revision:(audit.productionCall&&audit.productionCall.revision&&audit.productionCall.revision.revision)||null});
  row.staging={previewOutput:preview,corpusId:pointer.corpusId,previewChapterId:u.chapterId,blocks:stageReceipt.blocks,figures:stageReceipt.figures,auditStatus:stageReceipt.auditStatus,auditPath:u.auditPath,auditSha256:sha(auditBytes),stageReceiptPath:join(u.stageDir,'web-stage-receipt.json'),stagedAt:receipt.createdAt||pointer.createdAt,note:u.note};
}
// nemata-jp-chapter-283-1 (chapter06-exercise003) received a real needs-repair first revision after
// the previous register snapshot; it is no longer "unreviewed".
{
  const candidatePath='web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json';
  const candidateSha='dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899';
  const auditPath='audit/web/articles/modern-yabejp-ja/chapter06-exercise003.'+candidateSha+'.json';
  const bytes=await readFile(join(root,candidatePath)),candidate=JSON.parse(bytes);
  const auditBytes=await readFile(join(root,auditPath)),audit=JSON.parse(auditBytes);
  if(sha(bytes)!==candidateSha||audit.status!=='needs-repair')throw Error('exercise003_expectation_changed');
  const row=prior.rows.find(r=>r.originalChapterId==='nemata-jp-chapter-283-1');
  if(!row)throw Error('register_row_missing:283-1');
  row.verdict='produced-needs-repair';
  row.existingCandidate=Object.assign({},row.existingCandidate,{path:candidatePath,sha256:candidateSha,bodyBlocks:candidate.body.blocks.length,sourceSha256:candidate.source.sourceSha256,currentSourceSha256:candidate.source.sourceSha256,sourceBoundCurrent:candidate.source.sourceSha256===audit.source.sourceSha256,auditStatus:'needs-repair',auditPath,auditRecordedAt:audit.recordedAt,deterministicPassed:audit.deterministicChecks?audit.deterministicChecks.passed===true:null,semanticComplete:false,repairErrors:(audit.modelChecks&&audit.modelChecks.errors||[]).length,revision:(audit.productionCall&&audit.productionCall.revision&&audit.productionCall.revision.revision)||null});
}
prior.display={previewOutput:preview,corpusId:pointer.corpusId,displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,selectedWeb:receipt.selectedWeb.length,pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length};
Object.assign(prior.counts,{displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,effectiveCoveredOriginalChapters:receipt.chapters,effectiveUncoveredOriginalChapters:prior.denominator.originalChapters-receipt.chapters,uncoveredProduced:prior.denominator.originalChapters-receipt.chapters,trulyUnproduced:0});
// The verdict block is expressed on the 256-original-chapter denominator, exactly like the previous
// snapshots: covered = staged chapters, and every remaining original chapter is either needs-repair
// or (now) nothing unreviewed. `rows` only carries the 80-row COAC-246 subset, so row counting alone
// would understate coverage.
const rowNeedsRepair=prior.rows.filter(r=>r.verdict==='produced-needs-repair').length;
if(rowNeedsRepair!==prior.denominator.originalChapters-receipt.chapters)throw Error('register_verdict_population_mismatch');
prior.counts.verdicts={'covered-effective':receipt.chapters,'produced-needs-repair':rowNeedsRepair,'produced-passed-not-staged':0,'produced-pdf-passed-not-staged':0,'produced-unreviewed':0,'produced-audit-failed':0,total:prior.denominator.originalChapters};
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'fifth COAC-250 incremental batch supersedes the 04:26Z snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:['nemata-jp-chapter-211-1','nemata-jp-chapter-173-1','nemata-jp-chapter-116-1'],detail:'Three passed-but-unstaged web correspondences are now complete gated chapters in the preview: display 201 to '+receipt.chapters+', units 209 to '+receipt.units+', blocks 5342 to '+receipt.blocks+', figures 3935 to '+receipt.figures+', selectedWeb 172 to '+receipt.selectedWeb.length+', pendingWeb 51 to '+receipt.pendingWeb.length+'. 201 prior chapters retained byte-identical, 0 lost, 0 rewritten; the formal library is untouched.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'(1) integration/specific-web-variant-selection.v6.json selects the three new revisions, v5 kept as history; (2) the live textbook-audit-web.mjs now carries the first-revision gate (verifyWebFirstRevision + the full-article audit projection guard) that the frozen web-first-revision-20261027 runtime already had, so the passed 116-1 receipt is verified rather than re-audited; the COAC-249 batch-retry patch is kept.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'register-truth',detail:'116-1 is covered-effective, not unaudited. 283-1 (chapter06-exercise003) moved from produced-unreviewed to produced-needs-repair because a real needs-repair first revision (candidate dea1ba24) was recorded after the previous snapshot; its 48-item repair list is the remaining work, not a missing receipt.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,modelCalls:0}));
