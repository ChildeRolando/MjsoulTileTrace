// COAC-250 sixth batch: incremental refresh of the unified register after the 227-1/246-1 build.
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
const historyPath=join(out,'coac250-unified-chapter-register-20261027b.before-coac250-6th-batch-'+stamp+'.json');
await copyFile(register,historyPath);
const historySha=sha(await readFile(historyPath));

const updates=[
 {original:'nemata-jp-chapter-227-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter04-section007.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter04-section007.4e1c6ed36bef34ff0a9848ba8915f46b0422a9f71b611775f5ee7981292590d6.json',chapterId:'modern-yabejp-ja-chapter04-section007-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter04-section007'),note:'COAC-248 targeted b0007 revision passed 2026-10-27T05:24:25Z; parent b496daf3 display and its 594ec4df needs-repair receipt preserved; dependency manifest web-e89dcffe re-verified against the frozen base'},
 {original:'nemata-jp-chapter-246-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.rev1.json',auditPath:'audit/web/articles/modern-yabejp-ja/chapter06-section002.bbf15bbd1390a0b7ce729d5205a65dad72e0f24cb6c2fe1f9789aaaea26e1904.json',chapterId:'modern-yabejp-ja-chapter06-section002-chapter',stageDir:join(preview,'stages','modern-yabejp-ja-chapter06-section002'),note:'COAC-248 targeted b0070 revision passed 2026-10-27T05:26:32Z; parent eb4caf1b display and its 53f38a52 needs-repair receipt preserved; 10 figures substantively unchanged; dependency manifest web-e89dcffe re-verified against the frozen base'}
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
prior.supersedes=Object.assign({},prior.supersedes,{previousRegister:{path:historyPath,sha256:historySha,reason:'sixth COAC-250 incremental batch supersedes the fifth-batch snapshot; history kept verbatim'}});
prior.recordedAt=new Date().toISOString();
prior.corrections=(prior.corrections||[]).concat([
 {at:new Date().toISOString(),kind:'staged-into-preview',chapterIds:['nemata-jp-chapter-227-1','nemata-jp-chapter-246-1'],detail:'Two passed-but-unstaged targeted revisions are now complete gated chapters in the preview: display '+priorChapters+' to '+receipt.chapters+', units to '+receipt.units+', blocks to '+receipt.blocks+', figures to '+receipt.figures+', selectedWeb to '+receipt.selectedWeb.length+', pendingWeb to '+receipt.pendingWeb.length+'. All prior chapters were retained, none rewritten; the formal library is untouched.',modelCalls:0,productionCalls:0},
 {at:new Date().toISOString(),kind:'wiring-fixes',detail:'integration/specific-web-variant-selection.v7.json selects the two new revisions (17 jobs), v6 kept as history at 16745299; the builder pin moved to v7 758b043a and the previous builder is preserved as build-accepted-preview.before-v7-20261027.mjs.',modelCalls:0,productionCalls:0}
]);
const tmp=register+'.tmp-'+process.pid;await writeFile(tmp,JSON.stringify(prior,null,2)+'\n');await rename(tmp,register);
console.log(JSON.stringify({registerSha256:sha(await readFile(register)),history:historyPath,display:prior.display,verdicts:prior.counts.verdicts,modelCalls:0}));
