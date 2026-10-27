// COAC-250 twelfth batch: incremental refresh of the unified register after the three-chapter build
// (089-1/chapter01-section031, 060-1/chapter01-section021-06, 081-8/cv1721475).
// History kept verbatim; only the newly staged rows and the counters change. Zero model calls.
// Cross-book numbering is preserved as identity = book + canonical article id: covering 79-cn-chapter-081-8
// does not touch nemata-jp-chapter-215-4, and 79-cn-chapter-215-4 (p217 disputed) stays an open item.
import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration'),
 register=join(out,'coac250-unified-chapter-register-20261027b.json');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(out,'accepted-preview-current.json')),preview=pointer.output;
const receipt=await load(join(preview,'accepted-preview-receipt.json'));
const registerBytes=await readFile(register),prior=JSON.parse(registerBytes);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-12th-batch-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));
const registerBeforeSha=sha(registerBytes);

const updates=[
 {original:'nemata-jp-chapter-089-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.coac269rev1.json',
  auditPath:'audit/web/articles/modern-yabejp-ja/chapter01-section031.c5317d995648afeefdb370b314047e36f0368609a19a2db6be103385646565a6.json',
  chapterId:'modern-yabejp-ja-chapter01-section031-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter01-section031'),
  note:'COAC-249 batch b7 (COAC-269 line-B): targeted re-translation of b0042/b0084/b0102/b0153 (restores the source strength of「が有力」and the「のみで良いとみる」qualifier); the other 29 text blocks and all 14 figures are byte-identical to the parent display. Independent target-text audit passed 2026-10-27T12:00:09Z (receipt 11e0c9f0); the parent 9fa0255f display with its 38463b0c needs-repair retry receipt is preserved byte-for-byte. Verified on the frozen web-target-text-chain runtime (auditor snapshot 856dad9d, dependency manifest 0aa071a4).'},
 {original:'nemata-jp-chapter-060-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.coac269rev1.json',
  auditPath:'audit/web/articles/modern-yabejp-ja/chapter01-section021-06.6de46bfb824281e9facea8bd30eebf1498b7ae047e4c006250aeaa2800b0c64c.json',
  chapterId:'modern-yabejp-ja-chapter01-section021-06-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter01-section021-06'),
  note:'COAC-249 batch b7 (COAC-269 line-B): targeted re-translation of b0027 and b0033 (restores the「二つ上」referent and the 1-vs-2 normal-dora comparison); the other 19 text blocks and all 7 figures are byte-identical to the parent display. Independent target-text audit passed 2026-10-27T12:01:14Z (receipt 949a4856); the parent ff1f57ff display with its f13f9da6 needs-repair receipt is preserved. Same frozen web-target-text-chain runtime.'},
 {original:'79-cn-chapter-081-8',candidate:'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json',
  auditPath:'audit/web/articles/79-bilibili-cn/cv1721475.d1fc1ea8f072cc73c3c1a1649f3a7608f6fd55ecb38be8ff19a34340d5c2a3dd.json',
  chapterId:'79-bilibili-cn-cv1721475-chapter',stageDir:join(preview,'stages','79-bilibili-cn-cv1721475'),
  note:'COAC-248 targeted figure correction: four figures re-read from the source image (b0004/b0006/b0008/b0018, last-tile 9s restored to 7s and the 4p/5p cut-row first tile); all 19 text blocks are byte-identical and the other 4 figures differ only by derived presentationAsset. Independent full-article audit passed 2026-10-27T11:51:50Z (receipt f1328e6a); the parent 50b62ce5 display and its c5513dee needs-repair receipt are preserved. Verified on the e89dcffe web-audit base (auditor snapshot 453ba938, dependency manifest ed07f6b8).'}
];
const priorChapters=prior.counts.displayChapters;
for(const u of updates){
  const row=prior.rows.find(r=>r.originalChapterId===u.original);
  if(!row)throw Error('register_row_missing:'+u.original);
  if(row.verdict!=='produced-passed-not-staged')throw Error('register_row_not_passed_not_staged_before:'+u.original+':'+row.verdict);
  const bytes=await readFile(join(root,u.candidate)),candidate=JSON.parse(bytes),digest=sha(bytes);
  const auditBytes=await readFile(join(root,u.auditPath)),audit=JSON.parse(auditBytes);
  const stageReceipt=await load(join(u.stageDir,'web-stage-receipt.json'));
  if(audit.status!=='passed')throw Error('audit_not_passed:'+u.original);
  if(digest!==audit.production.sha256)throw Error('receipt_does_not_bind_candidate:'+u.original);
  if(stageReceipt.auditStatus!=='passed')throw Error('stage_receipt_audit_not_passed:'+u.original);
  row.covered=true;row.coverageRoute='web';row.verdict='covered-effective';
  row.approvedWebCorrespondence.articleInPreview=true;
  row.existingCandidate=Object.assign({},row.existingCandidate,{path:u.candidate,sha256:digest,bodyBlocks:candidate.body.blocks.length,sourceSha256:candidate.source.sourceSha256,currentSourceSha256:candidate.source.sourceSha256,sourceBoundCurrent:candidate.source.sourceSha256===audit.source.sourceSha256,auditStatus:audit.status,auditPath:u.auditPath,auditRecordedAt:audit.recordedAt,deterministicPassed:audit.deterministicChecks?audit.deterministicChecks.passed===true:null,semanticComplete:audit.effectiveModelChecks?audit.effectiveModelChecks.passed===true:null,revision:(audit.productionCall&&audit.productionCall.revision&&audit.productionCall.revision.revision)||null});
  row.staging={previewOutput:preview,corpusId:pointer.corpusId,previewChapterId:u.chapterId,blocks:stageReceipt.blocks,figures:stageReceipt.figures,auditStatus:stageReceipt.auditStatus,auditPath:u.auditPath,auditSha256:sha(auditBytes),stageReceiptPath:join(u.stageDir,'web-stage-receipt.json'),stagedAt:receipt.createdAt||pointer.createdAt,note:u.note};
}
prior.display={previewOutput:preview,corpusId:pointer.corpusId,displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,selectedWeb:receipt.selectedWeb.length,pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length};
Object.assign(prior.counts,{displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,effectiveCoveredOriginalChapters:receipt.chapters,effectiveUncoveredOriginalChapters:prior.denominator.originalChapters-receipt.chapters,uncoveredProduced:prior.denominator.originalChapters-receipt.chapters,trulyUnproduced:0});
const rowNeedsRepair=prior.rows.filter(r=>r.verdict==='produced-needs-repair').length;
const rowPassedNotStaged=prior.rows.filter(r=>r.verdict==='produced-passed-not-staged').length;
if(rowNeedsRepair+rowPassedNotStaged!==prior.denominator.originalChapters-receipt.chapters)throw Error('register_verdict_population_mismatch:'+(rowNeedsRepair+rowPassedNotStaged)+'!='+(prior.denominator.originalChapters-receipt.chapters));
prior.counts.verdicts={'covered-effective':receipt.chapters,'produced-needs-repair':rowNeedsRepair,'produced-passed-not-staged':rowPassedNotStaged,'produced-pdf-passed-not-staged':0,'produced-unreviewed':0,'produced-audit-failed':0,total:prior.denominator.originalChapters};
const remainingRows=prior.rows.filter(r=>r.verdict!=='covered-effective');
const remainingByGroup={};
for(const r of remainingRows){const g=r.adjudicationGroup??'unclassified';remainingByGroup[g]=(remainingByGroup[g]??0)+1;}
prior.remainingTypes={
  denominator:'original chapters (256) minus covered (receipt.chapters); one chapter can be one original chapter only, no overlap',
  total:remainingRows.length,
  byVerdict:{'produced-needs-repair':rowNeedsRepair,'produced-passed-not-staged':rowPassedNotStaged},
  byAdjudicationGroup:remainingByGroup,
  byRoute:{web:remainingRows.filter(r=>r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId).length,pdfOnly:remainingRows.filter(r=>!(r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId)).length},
  blockedBySourceStructureHold:remainingRows.filter(r=>['chapter01-section009','chapter01-section010','chapter01-section011','chapter01-section012','chapter01-section014','chapter01-section015','chapter01-section016'].includes(r.approvedWebCorrespondence&&r.approvedWebCorrespondence.articleId)).map(r=>r.originalChapterId),
  eligibleForNextStage:remainingRows.filter(r=>r.verdict==='produced-passed-not-staged').map(r=>r.originalChapterId),
  note:'35 remaining chapters are produced but carry no passed receipt for a complete chapter yet (needs-repair or awaiting re-audit). 1 is audited-passed-but-unstaged: 027-1 is held by the frozen source-structure hold (chapter01-section010 has no definition-boundary sidecar/stage proof). 081-8, 089-1 and 060-1 were staged this batch and no longer count here. None is unproduced.'
};
prior.crossBookNumbering={
  rule:'identity is book + canonical article id; a shared numeric tail is never identity and never a dedupe key',
  entries:[
   {chapterId:'nemata-jp-chapter-215-4',book:'nemata-jp',articleId:'chapter03-section027',status:'covered-effective',stagedBeforeThisBatch:true,
    note:'in the preview since the eighth batch; untouched by this batch'},
   {chapterId:'79-cn-chapter-215-4',book:'79-cn',articleId:null,status:'produced-needs-repair',openPages:[217],
    note:'p217 is still needs-repair and is NOT removed or merged with nemata-jp-chapter-215-4; it stays an open remaining item'},
   {chapterId:'79-cn-chapter-081-8',book:'79-cn',articleId:'cv1721475',status:'covered-effective',stagedThisBatch:true}],
  checkedAt:new Date().toISOString()};
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'twelfth COAC-250 incremental batch supersedes the eleventh-run snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:updates.map(u=>u.original),detail:'Three passed-but-unstaged chapters are now complete gated chapters in the preview: display '+priorChapters+' to '+receipt.chapters+', units to '+receipt.units+', blocks to '+receipt.blocks+', figures to '+receipt.figures+', selectedWeb to '+receipt.selectedWeb.length+', pendingWeb to '+receipt.pendingWeb.length+'. All prior chapters were retained with identical unit fingerprints, none rewritten, none lost; the formal library is untouched and the previous pointer preserved. No re-audit: every receipt named by the member is the effective latest passed receipt for its own book+article.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'cross-book-numbering',detail:'79-cn-chapter-215-4 (p217 disputed, produced-needs-repair, openPages 217) is kept as an open remaining item and was not merged with or removed against the already-covered nemata-jp-chapter-215-4 (chapter03-section027). Dedupe key is book+canonical article id throughout, never the numeric tail; the preview chapter ids carry the book prefix, so no collision is possible.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'integration/specific-web-variant-selection.v12.json adds the three canonical articles (31 jobs); v11 kept as history at 3e222bac. The builder pin moved to v12 943b47ee and the previous builder is preserved as build-accepted-preview.before-v12-20261027.mjs (7ddd83f3). No model calls, no re-audit.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'open-items',detail:'027-1 (chapter01-section010) remains held by the frozen source-structure hold and is the only audited-passed-but-unstaged chapter left. 283-1 (chapter06-exercise003) latest receipt remains needs-repair; 183-1 (chapter03-section003) is still without an audit receipt. 79-cn-chapter-215-4 p217 remains needs-repair. All stay out of the preview.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerBeforeSha,registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,remainingTypes:prior.remainingTypes,crossBookNumbering:prior.crossBookNumbering,modelCalls:0}));
