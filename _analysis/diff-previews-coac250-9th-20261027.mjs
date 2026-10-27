// COAC-250 ninth batch: compare the new preview against the 211-chapter one — chapter add/remove,
// per-unit block fingerprint stability for retained chapters, pending/selected web deltas,
// formal-library non-switch evidence, and preservation of the previous pointer.
// Read-only; zero model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing',out=join(root,'integration');
const sha=b=>createHash('sha256').update(b).digest('hex'),load=async p=>JSON.parse(await readFile(p,'utf8'));
const current=await load(join(out,'accepted-preview-current.json'));
const next=await load(join(current.output,'accepted-preview-receipt.json'));
const priorPath='E:/AgentData/Coach/knowledge/processing/integration/accepted-content-preview-2026-10-27T09-53-06-371Z';
const prior=await load(join(priorPath,'accepted-preview-receipt.json'));
const priorPointerReceiptSha=sha(await readFile(join(priorPath,'accepted-preview-receipt.json')));
const nextCorpus=await load(join(current.output,'textbook-corpus.json'));
const priorCorpus=await load(join(priorPath,'textbook-corpus.json'));

const fp=u=>sha(JSON.stringify(u.blocks));
const priorUnits=new Map(priorCorpus.units.map(u=>[u.unitId,fp(u)]));
const nextUnits=new Map(nextCorpus.units.map(u=>[u.unitId,fp(u)]));
const added=[...nextUnits.keys()].filter(k=>!priorUnits.has(k));
const removed=[...priorUnits.keys()].filter(k=>!nextUnits.has(k));
const rewritten=[...nextUnits.keys()].filter(k=>priorUnits.has(k)&&priorUnits.get(k)!==nextUnits.get(k));

const priorChapters=new Map(prior.selectedWeb.flatMap(s=>s.chapterIds.map(c=>[c,s.candidateSha256])));
const nextChapters=new Map(next.selectedWeb.flatMap(s=>s.chapterIds.map(c=>[c,s.candidateSha256])));
const addedChapters=[...nextChapters.keys()].filter(c=>!priorChapters.has(c));
const removedChapters=[...priorChapters.keys()].filter(c=>!nextChapters.has(c));
const changedRetainedChapters=[...priorChapters.keys()].filter(c=>nextChapters.has(c)&&priorChapters.get(c)!==nextChapters.get(c));

const pendingKey=p=>String(p.path).split(String.fromCharCode(92)).join('/').split('/').at(-1);
const priorPending=new Map(prior.pendingWeb.map(p=>[pendingKey(p),p.error]));
const nextPending=new Map(next.pendingWeb.map(p=>[pendingKey(p),p.error]));
const pendingResolved=[...priorPending.keys()].filter(k=>!nextPending.has(k));
const pendingAdded=[...nextPending.keys()].filter(k=>!priorPending.has(k));

const imageIds=new Set(nextCorpus.images.map(i=>i.figureId));
const priorImageIds=new Set(priorCorpus.images.map(i=>i.figureId));

const formalCorpusBytes=await readFile('E:/AgentData/Coach/knowledge/review/textbook-corpus.json');
const formalCorpus=JSON.parse(formalCorpusBytes);

const expectedChapters=['modern-yabejp-ja-chapter03-section015-chapter','modern-yabejp-ja-archive01-section006-chapter','modern-yabejp-ja-chapter06-exercise002-02-chapter'];
const expectedPendingResolved=['chapter03-section015.display.json','archive01-section006.display.json','chapter06-exercise002-02.display.json','archive01-section006.coac269rev1.json','chapter06-exercise002-02.coac269rev1.json'];

const result={
 schema:'coac250-9th-batch-preview-delta/1',
 modelCalls:0,
 priorPreview:priorPath,priorReceiptPathSha256:priorPointerReceiptSha,priorCorpusId:prior.corpusId,priorChapters:prior.chapters,priorUnits:prior.units,priorBlocks:prior.blocks,priorFigures:prior.figures,
 nextPreview:current.output,nextCorpusId:next.corpusId,nextChapters:next.chapters,nextUnits:next.units,nextBlocks:next.blocks,nextFigures:next.figures,
 chapters:{added:addedChapters,removed:removedChapters,changedRetained:changedRetainedChapters,retained:priorChapters.size-removedChapters.length},
 units:{added,removed,rewritten},
 selectedWeb:{prior:prior.selectedWeb.length,next:next.selectedWeb.length},
 pendingWeb:{prior:prior.pendingWeb.length,next:next.pendingWeb.length,resolved:pendingResolved,added:pendingAdded,addedDetail:pendingAdded.map(k=>({file:k,error:nextPending.get(k)}))},
 figures:{prior:priorImageIds.size,next:imageIds.size,added:[...imageIds].filter(i=>!priorImageIds.has(i)).length,removed:[...priorImageIds].filter(i=>!imageIds.has(i)).length},
 newChapterContent:addedChapters.map(c=>{
   const units=nextCorpus.units.filter(u=>u.chapterId===c);
   return {chapterId:c,units:units.length,blocks:units.reduce((n,u)=>n+u.blocks.length,0),unitIds:units.map(u=>u.unitId)};
 }),
 dedupeInventory:{articles:next.webCandidateDedupe.articles.length,multiVersionArticles:next.webCandidateDedupe.articles.filter(a=>a.versions.length>1).length,
  duplicatedChaptersStagedTwice:[...nextChapters.keys()].filter(c=>next.selectedWeb.filter(s=>s.chapterIds.includes(c)).length>1)},
 formalLibrary:{
  corpusPath:'E:/AgentData/Coach/knowledge/review/textbook-corpus.json',
  corpusFileSha256:sha(formalCorpusBytes),
  corpusId:formalCorpus.corpusId,
  activeLibraryChanged:next.activeLibraryChanged,
  receiptFormalCorpusFileSha256:next.formalCorpusFileSha256,
  receiptFormalCorpusId:next.formalCorpusId
 },
 pointer:{path:join(out,'accepted-preview-current.json'),sha256:sha(await readFile(join(out,'accepted-preview-current.json'))),equalsNewReceipt:sha(await readFile(join(out,'accepted-preview-current.json')))===sha(await readFile(join(current.output,'accepted-preview-receipt.json')))},
 previousPointerPreserved:{
  note:'The previous pointer is not deleted: its preview directory receipt is byte-identical to the previous pointer value and left untouched.',
  previousReceiptPath:join(priorPath,'accepted-preview-receipt.json'),
  previousReceiptSha256:priorPointerReceiptSha,
  expectedPreviousPointerSha256:'0633fdc03750eac7451419a42d874922bec3c55e4c10cb17af1705cadfcf78de'
 },
 build:{corpusId:next.corpusId,crossChapterNavigation:next.crossChapterNavigation,activeLibraryChanged:next.activeLibraryChanged,maxUnitBytes:next.maxUnitBytes}
};
result.pass={
 retainedUnitsNotRewritten:rewritten.length===0,
 noChaptersLost:removedChapters.length===0,
 noRetainedChapterVersionChanged:changedRetainedChapters.length===0,
 threeChaptersAdded:addedChapters.length===3&&expectedChapters.every(c=>addedChapters.includes(c)),
 pendingResolvedForAllThreePlusStaleDuplicates:expectedPendingResolved.every(p=>pendingResolved.includes(p)),
 noUnexpectedNewPending:pendingAdded.length===0,
 noChapterStagedTwice:result.dedupeInventory.duplicatedChaptersStagedTwice.length===0,
 formalLibraryUntouched:result.formalLibrary.corpusFileSha256===result.formalLibrary.receiptFormalCorpusFileSha256&&result.formalLibrary.corpusId===result.formalLibrary.receiptFormalCorpusId&&next.activeLibraryChanged===false,
 pointerAdvancedToNewPreview:result.pointer.equalsNewReceipt,
 previousPreviewPreserved:priorPointerReceiptSha===result.previousPointerPreserved.expectedPreviousPointerSha256
};
result.allPassed=Object.values(result.pass).every(Boolean);
await writeFile(join(out,'coac250-9th-batch-preview-delta-20261027.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({allPassed:result.allPassed,pass:result.pass,chapters:result.chapters,units:result.units,selectedWeb:result.selectedWeb,pendingWeb:result.pendingWeb,figures:result.figures,newChapterContent:result.newChapterContent,formalLibrary:result.formalLibrary,pointer:result.pointer.sha256},null,1));
