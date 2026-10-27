// COAC-250 tenth batch: incremental refresh of the unified register after the three-chapter build
// (199-1/chapter03-section013, 142-1/chapter01-section054, 127-1/chapter01-section047).
// History kept verbatim; only the newly staged rows and the counters change. Zero model calls.
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
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-10th-batch-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));
const registerBeforeSha=sha(registerBytes);

const updates=[
 {original:'nemata-jp-chapter-199-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json',
  auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.retry-1793095290967-e15ea7b7.json',
  chapterId:'modern-yabejp-ja-chapter03-section013-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section013'),
  note:'COAC-248 already-passed companion in the b5b6 handoff (not re-audited by COAC-249): targeted revision of b0006/b0009 (same-paragraph split-pair wording); the other 35 blocks are byte-identical and all 14 figures inherit the parent presentationAsset. The effective receipt is the bound retry of a voided transport call, passed 2026-10-27T10:01:30.968Z; the failed base receipt and the parent 37849d97 display with its 3856483c needs-repair retry receipt are preserved byte-for-byte. Verified on the e89dcffe web-audit base (auditor snapshot 453ba938, dependency manifest ed07f6b8).'},
 {original:'nemata-jp-chapter-142-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.coac269rev1.json',
  auditPath:'audit/web/articles/modern-yabejp-ja/chapter01-section054.f3570e7bbe61e0ef99e45a2f4185ed3f0c1fe1840f670783c7fd2402352dedca.json',
  chapterId:'modern-yabejp-ja-chapter01-section054-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter01-section054'),
  note:'COAC-249 b5b6 batch (COAC-269 line-B b5): targeted re-translation of b0173 (the all-last vs. all-second-last tree reading); the other 184 blocks are byte-identical and all 84 figures inherit the parent presentationAsset. Independent target-text audit passed 2026-10-27T11:25:33.775Z (receipt f3570e7b); the parent 264116a9 display with its 78ffbdda needs-repair receipt is preserved. Attestation verified on the frozen web-target-text-chain runtime (auditor snapshot 856dad9d, dependency manifest 0aa071a4).'},
 {original:'nemata-jp-chapter-127-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.coac269rev1.json',
  auditPath:'audit/web/articles/modern-yabejp-ja/chapter01-section047.363fd45cc99f099cfbaec296a1102af0d6dd5519596af707697c21154280c86d.json',
  chapterId:'modern-yabejp-ja-chapter01-section047-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter01-section047'),
  note:'COAC-249 b5b6 batch (COAC-269 line-B b5): targeted re-translation of b0030 (two-sided wait family vs. complete-hand family wording); the other 161 blocks are byte-identical and all 72 figures inherit the parent presentationAsset. Independent target-text audit passed 2026-10-27T11:27:18.817Z (receipt 363fd45c); the parent 0dcafc25 display with its 3d5a7175 needs-repair receipt is preserved. Same frozen web-target-text-chain runtime.'}
];
const priorChapters=prior.counts.displayChapters;
for(const u of updates){
  const row=prior.rows.find(r=>r.originalChapterId===u.original);
  if(!row)throw Error('register_row_missing:'+u.original);
  if(row.verdict!=='produced-needs-repair')throw Error('register_row_not_needs_repair_before:'+u.original+':'+row.verdict);
  const bytes=await readFile(join(root,u.candidate)),candidate=JSON.parse(bytes),digest=sha(bytes);
  const auditBytes=await readFile(join(root,u.auditPath)),audit=JSON.parse(auditBytes);
  const stageReceipt=await load(join(u.stageDir,'web-stage-receipt.json'));
  if(audit.status!=='passed')throw Error('audit_not_passed:'+u.original);
  if(digest!==audit.production.sha256)throw Error('receipt_does_not_bind_candidate:'+u.original);
  row.covered=true;row.coverageRoute='web';row.verdict='covered-effective';
  row.approvedWebCorrespondence.articleInPreview=true;
  row.existingCandidate=Object.assign({},row.existingCandidate,{path:u.candidate,sha256:digest,bodyBlocks:candidate.body.blocks.length,sourceSha256:candidate.source.sourceSha256,currentSourceSha256:candidate.source.sourceSha256,sourceBoundCurrent:candidate.source.sourceSha256===audit.source.sourceSha256,auditStatus:audit.status,auditPath:u.auditPath,auditRecordedAt:audit.recordedAt,deterministicPassed:audit.deterministicChecks?audit.deterministicChecks.passed===true:null,semanticComplete:audit.effectiveModelChecks?audit.effectiveModelChecks.passed===true:null,revision:(audit.productionCall&&audit.productionCall.revision&&audit.productionCall.revision.revision)||null});
  row.staging={previewOutput:preview,corpusId:pointer.corpusId,previewChapterId:u.chapterId,blocks:stageReceipt.blocks,figures:stageReceipt.figures,auditStatus:stageReceipt.auditStatus,auditPath:u.auditPath,auditSha256:sha(auditBytes),stageReceiptPath:join(u.stageDir,'web-stage-receipt.json'),stagedAt:receipt.createdAt||pointer.createdAt,note:u.note};
}
prior.display={previewOutput:preview,corpusId:pointer.corpusId,displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,selectedWeb:receipt.selectedWeb.length,pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length};
Object.assign(prior.counts,{displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,effectiveCoveredOriginalChapters:receipt.chapters,effectiveUncoveredOriginalChapters:prior.denominator.originalChapters-receipt.chapters,uncoveredProduced:prior.denominator.originalChapters-receipt.chapters,trulyUnproduced:0});
const rowNeedsRepair=prior.rows.filter(r=>r.verdict==='produced-needs-repair').length;
if(rowNeedsRepair!==prior.denominator.originalChapters-receipt.chapters)throw Error('register_verdict_population_mismatch:'+rowNeedsRepair+'!='+(prior.denominator.originalChapters-receipt.chapters));
prior.counts.verdicts={'covered-effective':receipt.chapters,'produced-needs-repair':rowNeedsRepair,'produced-passed-not-staged':0,'produced-pdf-passed-not-staged':0,'produced-unreviewed':0,'produced-audit-failed':0,total:prior.denominator.originalChapters};
// remaining-type inventory over every register row, so the report states what is still outstanding
const remainingByGroup={};
for(const r of prior.rows.filter(r=>r.verdict==='produced-needs-repair')){
  const g=r.adjudicationGroup??'unclassified';
  remainingByGroup[g]=(remainingByGroup[g]??0)+1;
}
prior.remainingTypes={
  denominator:'original chapters (256) minus covered (receipt.chapters); one chapter can be one original chapter only, no overlap',
  total:rowNeedsRepair,
  byAdjudicationGroup:remainingByGroup,
  byRoute:{web:prior.rows.filter(r=>r.verdict==='produced-needs-repair'&&r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId).length,pdfOnly:prior.rows.filter(r=>r.verdict==='produced-needs-repair'&&!(r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId)).length},
  blockedBySourceStructureHold:prior.rows.filter(r=>r.verdict==='produced-needs-repair'&&['chapter01-section009','chapter01-section010','chapter01-section011','chapter01-section012','chapter01-section014','chapter01-section015','chapter01-section016'].includes(r.approvedWebCorrespondence&&r.approvedWebCorrespondence.articleId)).map(r=>r.originalChapterId),
  note:'Every remaining chapter is produced but carries no passed receipt for a complete chapter yet (needs-repair, or awaiting a re-audit after repair). None is unproduced and none is audited-passed-but-unstaged.'
};
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'tenth COAC-250 incremental batch supersedes the ninth-batch snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:updates.map(u=>u.original),detail:'Three passed-but-unstaged chapters are now complete gated chapters in the preview: display '+priorChapters+' to '+receipt.chapters+', units to '+receipt.units+', blocks to '+receipt.blocks+', figures to '+receipt.figures+', selectedWeb to '+receipt.selectedWeb.length+', pendingWeb to '+receipt.pendingWeb.length+'. All 185 prior chapters were retained with identical unit fingerprints, none rewritten, none lost; the formal library is untouched and the previous pointer preserved.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'held-out',detail:'027-1 (chapter01-section010, candidate 44ce506d, audit bdb29387 passed 11:27:18Z) is deliberately NOT staged. chapter01-section010 is inside the frozen source-structure hold (integration/source-structure-holds.json, evidence ee816566) and has no entry in integration/definition-boundary-stage-selection.json; integration/stage-definition-chapters.mjs still asserts it held pending an unresolved semantic review of the dt/dd boundary presentation. The targeted revision changes only b0056, so it neither resolves nor waives that boundary question. No hold was lifted, no re-audit performed.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'integration/specific-web-variant-selection.v11.json adds the three eligible canonical articles (28 jobs); v10 kept as history at 901cd88f. The builder pin moved to v11 3e222bac and the previous builder is preserved as build-accepted-preview.before-v11-20261027.mjs (a64310c6). The ninth-batch canonical-chapter dedupe stays in force; pre-consume resolves retry receipts the same way textbook-audit-web.mjs does, so 199-1 is correctly recognised as passed through its bound retry of a voided call rather than as a failed base receipt. No model calls, no re-audit.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'open-items',detail:'283-1 (chapter06-exercise003) latest receipt remains needs-repair and did not block this batch; 183-1 (chapter03-section003) is still unaudited. Both stay out of the preview.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerBeforeSha,registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,remainingTypes:prior.remainingTypes,modelCalls:0}));
