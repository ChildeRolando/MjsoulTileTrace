// COAC-250 tenth batch: coverage readback derived from the refreshed unified register and the
// delivered preview receipt. No new measurement of the corpus is made here; this is a restatement
// of the register counters in the shape the batch report needs (original chapters/units covered,
// remaining types). Zero model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(out,'accepted-preview-current.json'));
const receipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const registerBytes=await readFile(join(out,'coac250-unified-chapter-register-20261027b.json'));
const register=JSON.parse(registerBytes);
const held=['chapter01-section009','chapter01-section010','chapter01-section011','chapter01-section012','chapter01-section014','chapter01-section015','chapter01-section016'];

const uncoveredRows=register.rows.filter(r=>r.verdict==='produced-needs-repair');
const coveredRows=register.rows.filter(r=>r.verdict==='covered-effective');
const uncoveredUnits=uncoveredRows.reduce((n,r)=>n+(r.units??0),0);
const uncoveredBlocks=uncoveredRows.reduce((n,r)=>n+(r.gaps?.missingProductionBlocks??0),0);

const byArticle=[];
for(const r of uncoveredRows){
 const a=r.approvedWebCorrespondence??{};
 byArticle.push({originalChapterId:r.originalChapterId,units:r.units,adjudicationGroup:r.adjudicationGroup,
  webArticleId:a.articleId??null,webTier:a.tier??null,pdfPagesTotal:r.pdfRoute?.pagesTotal??null,
  missingPassedPages:r.pdfRoute?.missingPassedPages??[],auditStatus:r.existingCandidate?.auditStatus??null,
  heldBySourceStructureHold:!!a.articleId&&held.includes(a.articleId)});
}

const doc={schema:'coac250-10th-batch-coverage-readback/1',recordedAt:new Date().toISOString(),modelCalls:0,
 preview:{output:pointer.output,corpusId:pointer.corpusId,displayChapters:receipt.chapters,displayUnits:receipt.units,displayBlocks:receipt.blocks,displayFigures:receipt.figures,selectedWeb:receipt.selectedWeb.length,pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length,activeLibraryUnchanged:receipt.activeLibraryChanged===false,formalCorpusId:receipt.formalCorpusId,formalCorpusFileSha256:receipt.formalCorpusFileSha256},
 denominator:register.denominator,
 coverage:{originalChaptersCovered:receipt.chapters,originalChaptersRemaining:register.denominator.originalChapters-receipt.chapters,
  originalUnitsCovered:register.denominator.originalUnits-uncoveredUnits,originalUnitsRemaining:uncoveredUnits,
  originalUnitsNote:'covered = 303 original units minus the units of the 39 remaining original chapters recorded in the register rows; display units (225) are merged presentation units and are not the same measure'},
 remaining:{total:uncoveredRows.length,byAdjudicationGroup:register.remainingTypes.byAdjudicationGroup,byRoute:register.remainingTypes.byRoute,
  allProduced:true,unproduced:0,auditedPassedButUnstaged:0,needsRepairOrReaudit:uncoveredRows.length,heldBySourceStructureHold:uncoveredRows.filter(r=>held.includes((r.approvedWebCorrespondence??{}).articleId)).map(r=>r.originalChapterId),
  chapters:byArticle},
 register:{path:'integration/coac250-unified-chapter-register-20261027b.json',sha256:sha(registerBytes),recordedAt:register.recordedAt,verdicts:register.counts.verdicts}};
await writeFile(join(out,'coac250-10th-batch-coverage-readback-20261027.json'),JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({coverage:doc.coverage,remaining:{total:doc.remaining.total,byAdjudicationGroup:doc.remaining.byAdjudicationGroup,byRoute:doc.remaining.byRoute,held:doc.remaining.heldBySourceStructureHold},preview:doc.preview,registerSha:doc.register.sha256},null,1));
