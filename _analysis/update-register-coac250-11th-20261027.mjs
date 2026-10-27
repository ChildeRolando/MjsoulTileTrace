// COAC-250 eleventh run: correct the unified register's stale verdict for the chapters that carry a
// real independent passed receipt but are not staged. The tenth batch wrote produced-passed-not-staged: 0
// and asserted "none is audited-passed-but-unstaged"; four such chapters exist (027-1 held by the existing
// source-structure hold, 081-8/089-1/060-1 passed after the dispatch list was cut). Rows, counters and the
// remaining-type note are refreshed from the verified receipts; history is kept verbatim and nothing is deleted.
// Zero model calls.
import {readFile,writeFile,rename,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration'),
 register=join(out,'coac250-unified-chapter-register-20261027b.json'),
 evidencePath='_analysis/coac250-11th-batch-passed-not-staged-20261027.json';
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(out,'accepted-preview-current.json'));
const receipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const evidence=await load(evidencePath);
const registerBytes=await readFile(register),prior=JSON.parse(registerBytes);
const registerBeforeSha=sha(registerBytes);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-11th-run-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));
const held=evidence.items.filter(x=>x.notStagedReason.startsWith('confirmed-source-structure-hold')).map(x=>x.originalChapterId);
const eligible=evidence.items.filter(x=>x.notStagedReason.startsWith('passed receipt')).map(x=>x.originalChapterId);

for(const item of evidence.items){
 const row=prior.rows.find(r=>r.originalChapterId===item.originalChapterId);
 if(!row)throw Error('register_row_missing:'+item.originalChapterId);
 if(row.verdict!=='produced-needs-repair')throw Error('row_not_needs_repair_before:'+item.originalChapterId+':'+row.verdict);
 if(!item.sourceBoundCurrent)throw Error('source_not_current:'+item.originalChapterId);
 if(!item.modelPassed||!item.deterministicPassed)throw Error('receipt_not_independently_passed:'+item.originalChapterId);
 if(item.articleInPreview)throw Error('article_already_staged:'+item.originalChapterId);
 const auditBytes=await readFile(item.auditPath),audit=JSON.parse(auditBytes);
 if(audit.status!=='passed'||audit.production.sha256!==item.candidateSha256)throw Error('receipt_binding_mismatch:'+item.originalChapterId);
 const candBytes=await readFile(item.candidatePath),cand=JSON.parse(candBytes);
 if(sha(candBytes)!==item.candidateSha256)throw Error('candidate_sha_drift:'+item.originalChapterId);
 row.priorCandidate=Object.assign({},row.existingCandidate);
 row.existingCandidate=Object.assign({},row.existingCandidate,{
  path:item.candidatePath.replace(root.replace(/\\/g,'/')+'/',''),
  sha256:item.candidateSha256,bodyBlocks:cand.body.blocks.length,
  sourceSha256:cand.source.sourceSha256,currentSourceSha256:item.currentSourceSha256,sourceBoundCurrent:true,
  auditStatus:audit.status,auditPath:item.auditPath,auditRecordedAt:audit.recordedAt,
  deterministicPassed:audit.deterministicChecks?.passed===true,
  semanticComplete:(audit.modelChecks?.passed===true)||(audit.effectiveModelChecks?.passed===true),
  revision:(audit.productionCall&&audit.productionCall.revision&&audit.productionCall.revision.revision)||null});
 row.verdict='produced-passed-not-staged';
 row.notStaged={status:'not-staged',reason:item.notStagedReason,auditPath:item.auditPath,auditSha256:sha(auditBytes),
  auditRecordedAt:audit.recordedAt,sourceBoundCurrent:true,withinSourceStructureHold:held.includes(item.originalChapterId),
  eligibleForNextStage:eligible.includes(item.originalChapterId),modelCalls:0};
}

const remainingRows=prior.rows.filter(r=>r.verdict!=='covered-effective');
const needsRepair=remainingRows.filter(r=>r.verdict==='produced-needs-repair').length;
const passedNotStaged=remainingRows.filter(r=>r.verdict==='produced-passed-not-staged').length;
if(receipt.chapters+needsRepair+passedNotStaged!==prior.denominator.originalChapters)
 throw Error('population_mismatch:'+receipt.chapters+'+'+needsRepair+'+'+passedNotStaged);
const byGroup={};for(const r of remainingRows){const g=r.adjudicationGroup??'unclassified';byGroup[g]=(byGroup[g]??0)+1;}
prior.display=Object.assign({},prior.display,{previewOutput:pointer.output,corpusId:pointer.corpusId,
 displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,
 selectedWeb:receipt.selectedWeb.length,pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length});
prior.counts.verdicts={'covered-effective':receipt.chapters,'produced-needs-repair':needsRepair,
 'produced-passed-not-staged':passedNotStaged,'produced-pdf-passed-not-staged':0,'produced-unreviewed':0,
 'produced-audit-failed':0,total:prior.denominator.originalChapters};
prior.counts.effectiveCoveredOriginalChapters=receipt.chapters;
prior.counts.effectiveUncoveredOriginalChapters=prior.denominator.originalChapters-receipt.chapters;
prior.counts.uncoveredProduced=prior.denominator.originalChapters-receipt.chapters;
prior.counts.trulyUnproduced=0;
prior.remainingTypes={
 denominator:'original chapters (256) minus covered (receipt.chapters); one chapter can be one original chapter only, no overlap',
 total:remainingRows.length,
 byVerdict:{'produced-needs-repair':needsRepair,'produced-passed-not-staged':passedNotStaged},
 byAdjudicationGroup:byGroup,
 byRoute:{web:remainingRows.filter(r=>r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId).length,
  pdfOnly:remainingRows.filter(r=>!(r.approvedWebCorrespondence&&r.approvedWebCorrespondence.webSourceId)).length},
 blockedBySourceStructureHold:held,
 eligibleForNextStage:eligible,
 note:'35 remaining chapters are produced but carry no passed receipt for a complete chapter yet (needs-repair or awaiting re-audit). 4 are audited-passed-but-unstaged: 027-1 is held by the frozen source-structure hold (chapter01-section010 has no definition-boundary sidecar/stage proof), and 081-8/089-1/060-1 passed after the dispatched batch list was cut and await the next dispatch. None is unproduced.'};
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,
 reason:'eleventh COAC-250 run supersedes the tenth-batch snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'verdict-correction',chapterIds:evidence.items.map(x=>x.originalChapterId),
  detail:'produced-passed-not-staged corrected from 0 to 4 per real independent passed receipts: 027-1 chapter01-section010 coac269rev1 44ce506d receipt bdb29387 passed 2026-10-27T11:27:18.797Z (held, not staged); 081-8 79-bilibili-cn cv1721475.r1 d1fc1ea8 receipt passed 2026-10-27T11:51:50.380Z; 089-1 chapter01-section031 coac269rev1 c5317d99 receipt passed 2026-10-27T12:00:09.252Z; 060-1 chapter01-section021-06 coac269rev1 6de46bfb receipt passed 2026-10-27T12:01:14.606Z. Each candidate sha equals its receipt production sha, each candidate source sha equals its receipt source sha and the current source file, each revision parent is bound by sha, and each receipt carries a passed independent model check. Counters now reconcile 217 covered + 35 needs-repair + 4 passed-not-staged = 256.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'held-out',detail:'027-1 is not staged by this run: chapter01-section010 is inside integration/source-structure-holds.json (evidence ee816566), has no entry in integration/definition-boundary-stage-selection.json, and integration/stage-definition-chapters.mjs still asserts it held pending an unresolved semantic review of the dt/dd boundary presentation. Its b0056-only revision neither resolves nor waives that question. No hold lifted, no re-audit performed.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'not-dispatched',detail:'081-8, 089-1 and 060-1 are eligible for a zero-model-call stage under the existing flow (passed, source-bound, parent-bound, absent from the preview) but were not named in this dispatch (their receipts postdate the 11:34Z staging-ready-4.json). Left untouched for the next dispatch; none of their files, receipts or candidates was modified or removed.',modelCalls:0,productionCalls:0}]);
const tmp=register+'.tmp-'+process.pid;
await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
await copyFile(register,'_analysis/coac250-unified-chapter-register-20261027b.json');
console.log(JSON.stringify({registerBeforeSha,registerSha256:sha(await readFile(register)),history:historyPath,
 verdicts:prior.counts.verdicts,remainingTypes:{total:prior.remainingTypes.total,byVerdict:prior.remainingTypes.byVerdict,blockedBySourceStructureHold:prior.remainingTypes.blockedBySourceStructureHold,eligibleForNextStage:prior.remainingTypes.eligibleForNextStage},modelCalls:0},null,1));
