// COAC-250 ninth batch: incremental refresh of the unified register after the three-chapter build.
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
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-9th-batch-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));
const registerBeforeSha=sha(registerBytes);

const updates=[
 {original:'nemata-jp-chapter-201-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter03-section015.d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed.json',chapterId:'modern-yabejp-ja-chapter03-section015-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter03-section015'),note:'COAC-248 targeted one-block revision (b0041: the chosen single-wait priority wording) passed 2026-10-27T09:47:54Z; the other 46 blocks and the unchanged parent 41c7c1bf display with its 77f02f9a needs-repair receipt preserved; 19 figures inherit the parent presentationAsset; dependency manifest web-e89dcffe (ed07f6b8) re-verified against the frozen base'},
 {original:'nemata-jp-chapter-338-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/archive01-section006.ff5a9b524d8e10c62f97011bde7f6a5a837f58e8557230ca60c67581b426f782.json',chapterId:'modern-yabejp-ja-archive01-section006-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-archive01-section006'),note:'COAC-269 line-B first batch, independently audited by COAC-249: targeted one-block revision (b0518: board cheap/expensive reading) passed 2026-10-27T10:01:45Z (receipt 74b93630); the other 587 blocks and the unchanged parent 04ab7640 display with its 6d41a520 needs-repair receipt preserved; 260 figures inherit the parent presentationAsset; audited on the frozen web-target-text-chain runtime (auditor snapshot 856dad9d, dependency manifest 0aa071a4)'},
 {original:'nemata-jp-chapter-273-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.42991d764c900c46cba313848cc1c5138789c60079e6a988d4f6df5e09da330e.json',chapterId:'modern-yabejp-ja-chapter06-exercise002-02-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter06-exercise002-02'),note:'COAC-269 line-B first batch, independently audited by COAC-249: targeted two-block revision (b0263 comparison object of the wait-count sentence, b0545 chiitoitsu one-shanten wording) passed 2026-10-27T10:02:55Z (receipt 0553be30); the other 690 blocks and the unchanged parent c57c30e4 display with its 3aa7dc1d needs-repair receipt preserved; 292 figures inherit the parent presentationAsset; same frozen web-target-text-chain runtime'}
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
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'ninth COAC-250 incremental batch supersedes the eighth-batch snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:updates.map(u=>u.original),detail:'Three passed-but-unstaged chapters are now complete gated chapters in the preview: display '+priorChapters+' to '+receipt.chapters+', units to '+receipt.units+', blocks to '+receipt.blocks+', figures to '+receipt.figures+', selectedWeb to '+receipt.selectedWeb.length+', pendingWeb to '+receipt.pendingWeb.length+'. All 182 prior chapters were retained with identical unit fingerprints, none rewritten, none lost; the formal library is untouched and the previous pointer preserved.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'canonical-version-dedupe',detail:'Selection v10 adds exactly the three canonical articles. The COAC-269 second round re-produced 246-1 (chapter06-section002), 237-1 (chapter04-section016) and 131-1 (chapter01-section049), which are already covered by their ingested .rev1 versions; those duplicate drafts have no passed receipt and were deliberately left out, so no already-passed chapter was overwritten. Dedupe is now keyed on canonical chapter id: the builder derives each candidate file name to its canonical article, ranks display > plain > revision/draft, keeps one entry per canonical article, and records every version with its audit status and effective-latest-passed choice in the preview receipt (webCandidateDedupe). Batch 9 thus staged 3 chapters, not 6; a candidate-SHA-only rule would have needed a per-file exception list.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'integration/specific-web-variant-selection.v10.json selects the three new revisions (25 jobs), v9 kept as history at 10db28df; the builder pin moved to v10 901cd88f and the previous builder is preserved as build-accepted-preview.before-v10-20261027.mjs (bcf2f2a2, patched to a64310c6). The flat candidate scan was the source of the duplicate-key risk: it keyed selections by the raw file name, so a draft named <article>.coac269rev1.json became a separate pseudo-article and could only ever be pending or collide at staging. It now canonicalises the file name first. No model calls, no re-audit.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'open-items',detail:'183-1 (chapter03-section003) is independently verified as still unaudited: its only receipt is the parent display needs-repair 889adf0d, and the COAC-269 b3 draft 5083143 has no audit receipt at all, so it is not consumable and stays out of the preview. 283-1 (chapter06-exercise003) latest receipt remains needs-repair.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerBeforeSha,registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,modelCalls:0}));
