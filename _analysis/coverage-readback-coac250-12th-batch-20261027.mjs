// COAC-250 twelfth batch: coverage readback derived from the corrected unified register and the delivered
// preview receipt, plus this run's readback/Arena/body-integrity evidence. Zero model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const pointer=await load(join(out,'accepted-preview-current.json'));
const receipt=await load(join(pointer.output,'accepted-preview-receipt.json'));
const registerBytes=await readFile(join(out,'coac250-unified-chapter-register-20261027b.json'));
const register=JSON.parse(registerBytes);
const readback=await load('_analysis/coac250-12th-batch-readback-20261027.json');
const arena=await load('_analysis/coac250-12th-batch-arena-validation-20261027.json');
const body=await load('_analysis/coac250-12th-batch-body-integrity-20261027.json');

const staged=['nemata-jp-chapter-089-1','nemata-jp-chapter-060-1','79-cn-chapter-081-8'];
const stagedRows=staged.map(id=>{
 const row=register.rows.find(r=>r.originalChapterId===id);
 return {originalChapterId:id,previewChapterId:row.staging.previewChapterId,corpusId:row.staging.corpusId,
  blocks:row.staging.blocks,figures:row.staging.figures,auditStatus:row.staging.auditStatus,
  candidateSha256:row.existingCandidate.sha256,auditPath:row.staging.auditPath};
});
const byVerdict={};for(const r of register.rows){if(r.verdict==='covered-effective')continue;byVerdict[r.verdict]=(byVerdict[r.verdict]??0)+1;}
const doc={schema:'coac250-12th-batch-coverage-readback/1',recordedAt:new Date().toISOString(),modelCalls:0,
 preview:{output:pointer.output,corpusId:pointer.corpusId,displayChapters:receipt.chapters,displayUnits:receipt.units,
  displayBlocks:receipt.blocks,displayFigures:receipt.figures,selectedWeb:receipt.selectedWeb.length,
  pendingWeb:receipt.pendingWeb.length,pdfStages:receipt.selectedPdf.stages.length,
  activeLibraryUnchanged:receipt.activeLibraryChanged===false,formalCorpusId:receipt.formalCorpusId,
  formalCorpusFileSha256:receipt.formalCorpusFileSha256},
 denominator:register.denominator,
 coverage:{originalChaptersCovered:receipt.chapters,originalChaptersRemaining:register.denominator.originalChapters-receipt.chapters,
  originalUnitsCovered:register.denominator.originalUnits-register.rows.filter(r=>r.verdict!=='covered-effective').reduce((n,r)=>n+(r.units??0),0),
  originalUnitsNote:'covered = 303 original units minus the units of the remaining original chapters; display units are merged presentation units, not the same measure'},
 stagedThisDispatch:stagedRows,
 remaining:{total:register.remainingTypes.total,byVerdict,byAdjudicationGroup:register.remainingTypes.byAdjudicationGroup,
  byRoute:register.remainingTypes.byRoute,blockedBySourceStructureHold:register.remainingTypes.blockedBySourceStructureHold,
  eligibleForNextStage:register.remainingTypes.eligibleForNextStage},
 crossBookNumbering:register.crossBookNumbering,
 readback:{catalogEntries:readback.catalogEntries,units:readback.rows.map(r=>({unitId:r.unitId,blocks:r.readBlocks,exactBody:r.exactBody,
  revisedTextInBody:r.revisedTextInBody,revisedFiguresStaged:r.revisedFiguresStaged,searchTop1IsUnit:r.searchTop1IsUnit})),images:{checked:readback.images.checked,allReachable:readback.images.allReachable},
  absentArticles:readback.absent.map(a=>({articleId:a.articleId,inCatalog:a.inCatalog,inCorpus:a.inCorpus})),maxTextBytes:readback.maxTextBytes},
 arena:{units:arena.units.length,maxEnvelopeBytes:arena.maxEnvelopeBytes,realStdioMcp:arena.realStdioMcp,exactBody:arena.exactBody,
  tailCannotGrantCitation:arena.units.every(u=>u.tailCannotGrantCitation),
  targets:arena.units.filter(u=>stagedRows.some(s=>s.previewChapterId===u.chapterId)).map(u=>({unitId:u.unitId,pages:u.reads.length,
   blocks:u.reads.reduce((n,x)=>n+x.blocks,0),maxEnvelopeBytes:Math.max(...u.reads.map(x=>x.bytes)),finalPageSourceRefs:u.reads.at(-1).sourceRefs}))},
 bodyIntegrity:{allPassed:body.allPassed,chapters:body.chapters.map(c=>({chapterId:c.chapterId,pass:c.pass}))},
 register:{path:'integration/coac250-unified-chapter-register-20261027b.json',sha256:sha(registerBytes),recordedAt:register.recordedAt,verdicts:register.counts.verdicts}};
await writeFile(join(out,'coac250-12th-batch-coverage-readback-20261027.json'),JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({preview:doc.preview,coverage:doc.coverage,remaining:{total:doc.remaining.total,byVerdict,blockedBySourceStructureHold:doc.remaining.blockedBySourceStructureHold,eligibleForNextStage:doc.remaining.eligibleForNextStage},registerSha:doc.register.sha256,bodyIntegrity:doc.bodyIntegrity.allPassed,arena:doc.arena.maxEnvelopeBytes,readback:doc.readback.catalogEntries},null,1));
