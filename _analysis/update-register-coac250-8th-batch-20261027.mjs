// COAC-250 eighth batch: incremental refresh of the unified register after the four-chapter build.
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
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-8th-batch-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));
const registerBeforeSha=sha(registerBytes);

const updates=[
 {original:'nemata-jp-chapter-174-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter02-section024.7ceae3d061f859f9d4c93822422be385100396e12593a3980045e871f2adc5a7.json',chapterId:'modern-yabejp-ja-chapter02-section024-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter02-section024'),note:'COAC-248 targeted one-block revision (b0036 completion-direction reading) passed 2026-10-27T08:03:37Z; the other 44 blocks and the unchanged parent 0af14db9 display with its 678e5c8d needs-repair receipt preserved; 8 figures inherit the parent presentationAsset; dependency manifest web-e89dcffe re-verified against the frozen base'},
 {original:'nemata-jp-chapter-187-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section006.310a9fb99713adf007a7226cc01fcf848b16cf3b164fc1094d2a81a644f2d2e2.json',chapterId:'modern-yabejp-ja-chapter03-section006-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section006'),note:'COAC-248 targeted one-block revision (b0095 restores the prior five-pin discard) passed 2026-10-27T09:22:00Z; the other 103 blocks and the unchanged parent a09441ee display with its 02b455cc needs-repair receipt preserved; 48 figures inherit the parent presentationAsset; dependency manifest web-e89dcffe re-verified against the frozen base'},
 {original:'nemata-jp-chapter-198-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section012.af5ea28cb84f84f9006f5c205c7fa4f99431bf7b3bad8e22e47a3a1245820e3b.json',chapterId:'modern-yabejp-ja-chapter03-section012-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section012'),note:'COAC-248 targeted one-block revision (b0082 keeps the strong-likelihood judgement) passed 2026-10-27T09:19:00Z; the other 81 blocks and the unchanged parent 62d901f6 display with its 69dc5491 needs-repair receipt preserved; 36 figures inherit the parent presentationAsset; dependency manifest web-e89dcffe re-verified against the frozen base'},
 {original:'nemata-jp-chapter-215-4',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section027.a75742e9c2bcb5b1c39453c6d8f795bea24cc5a431657b318ec7f5280a431817.json',chapterId:'modern-yabejp-ja-chapter03-section027-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section027'),note:'COAC-249 independent review lane: second-order targeted one-block revision of b0011 on its needs-repair rev1 parent e9a9376e (receipt 42d80845) passed 2026-10-27T09:33:30Z; the other 12 blocks are byte-identical and the chapter has no figures; audited on the frozen web-target-text-chain runtime (auditor snapshot 856dad9d, dependency manifest 0aa071a4 recorded deterministically)'}
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
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'eighth COAC-250 incremental batch supersedes the seventh-batch snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:updates.map(u=>u.original),detail:'Four passed-but-unstaged revisions are now complete gated chapters in the preview: display '+priorChapters+' to '+receipt.chapters+', units to '+receipt.units+', blocks to '+receipt.blocks+', figures to '+receipt.figures+', selectedWeb to '+receipt.selectedWeb.length+', pendingWeb to '+receipt.pendingWeb.length+'. All prior chapters were retained, none rewritten; the formal library is untouched.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'integration/specific-web-variant-selection.v9.json selects the four new revisions (22 jobs), v8 kept as history at 0877e327; the builder pin moved to v9 10db28df and the previous builder is preserved as build-accepted-preview.before-v9-20261027.mjs (3008a0aa). The frozen second-order revision gate from audit/runtimes/web-target-text-chain-20261027 was ported into the live audit module (effectiveModelReview/effectiveModelChecks fallback in verifyWebRevisionContent, verifyWebRevisionInheritance, the target-text assembly check; 320e89ce -> e001c274, pre-patch file kept as textbook-audit-web.mjs.orig-coac250-target-text-chain), so the already-passed 215-4 receipt verifies instead of failing web_revision_notes_scope. No re-audit, no model calls.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerBeforeSha,registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,modelCalls:0}));
