// COAC-250 eighth batch: compare the new preview against the previous one — chapter add/remove,
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
const priorPath=process.argv[2];
const prior=await load(join(priorPath,'accepted-preview-receipt.json'));
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

const pendingKey=p=>String(p.path).split(/[\\/]/).at(-1);
const priorPending=new Map(prior.pendingWeb.map(p=>[pendingKey(p),p.error]));
const nextPending=new Map(next.pendingWeb.map(p=>[pendingKey(p),p.error]));
const pendingResolved=[...priorPending.keys()].filter(k=>!nextPending.has(k));
const pendingAdded=[...nextPending.keys()].filter(k=>!priorPending.has(k));
const allowedNewPending=['archive01-section006.coac269rev1.json','chapter06-exercise002-02.coac269rev1.json'];

const imageIds=new Set(nextCorpus.images.map(i=>i.figureId));
const priorImageIds=new Set(priorCorpus.images.map(i=>i.figureId));

const formalCorpusBytes=await readFile('E:/AgentData/Coach/knowledge/review/textbook-corpus.json');
const formalCorpus=JSON.parse(formalCorpusBytes);

const expectedChapters=['modern-yabejp-ja-chapter02-section024-chapter','modern-yabejp-ja-chapter03-section006-chapter','modern-yabejp-ja-chapter03-section012-chapter','modern-yabejp-ja-chapter03-section027-chapter'];
const expectedPending=['chapter02-section024.display.json','chapter03-section006.display.json','chapter03-section012.display.json','chapter03-section027.display.json'];

const result={
 schema:'coac250-8th-batch-preview-delta/1',
 modelCalls:0,
 priorPreview:priorPath,priorCorpusId:prior.corpusId,priorChapters:prior.chapters,priorUnits:prior.units,priorBlocks:prior.blocks,priorFigures:prior.figures,
 nextPreview:current.output,nextCorpusId:next.corpusId,nextChapters:next.chapters,nextUnits:next.units,nextBlocks:next.blocks,nextFigures:next.figures,
 chapters:{added:addedChapters,removed:removedChapters,retained:priorChapters.size-removedChapters.length},
 units:{added,removed,rewritten},
 selectedWeb:{prior:prior.selectedWeb.length,next:next.selectedWeb.length},
 pendingWeb:{prior:prior.pendingWeb.length,next:next.pendingWeb.length,resolved:pendingResolved,added:pendingAdded,addedDetail:pendingAdded.map(k=>({file:k,error:nextPending.get(k)})),allowedNewPendingReason:'Both are newly produced COAC-269 first-audit candidates that landed in the candidates directory after the prior preview was built; they are awaiting their first independent audit and were never in the prior selection.'},
 figures:{prior:priorImageIds.size,next:imageIds.size,added:[...imageIds].filter(i=>!priorImageIds.has(i)).length,removed:[...priorImageIds].filter(i=>!imageIds.has(i)).length},
 newChapterContent:addedChapters.map(c=>{
   const units=nextCorpus.units.filter(u=>u.chapterId===c);
   return {chapterId:c,units:units.length,blocks:units.reduce((n,u)=>n+u.blocks.length,0),unitIds:units.map(u=>u.unitId)};
 }),
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
  previousReceiptSha256:sha(await readFile(join(priorPath,'accepted-preview-receipt.json')))
 },
 build:{corpusId:next.corpusId,crossChapterNavigation:next.crossChapterNavigation,activeLibraryChanged:next.activeLibraryChanged,maxUnitBytes:next.maxUnitBytes}
};
result.pass={
 retainedUnitsNotRewritten:rewritten.length===0,
 noChaptersLost:removedChapters.length===0,
 fourChaptersAdded:addedChapters.length===4&&expectedChapters.every(c=>addedChapters.includes(c)),
 pendingResolvedForAllFour:expectedPending.every(p=>pendingResolved.includes(p)),
 noUnexpectedNewPending:pendingAdded.every(k=>allowedNewPending.includes(k)),
 formalLibraryUntouched:result.formalLibrary.corpusFileSha256===result.formalLibrary.receiptFormalCorpusFileSha256&&result.formalLibrary.corpusId===result.formalLibrary.receiptFormalCorpusId&&next.activeLibraryChanged===false,
 pointerAdvancedToNewPreview:result.pointer.equalsNewReceipt,
 previousPreviewPreserved:result.previousPointerPreserved.previousReceiptSha256==='4502ebc09774251a12c3d251ad14327a9016dfb7177075b619333051fed10b4b'
};
result.allPassed=Object.values(result.pass).every(Boolean);
await writeFile(join(out,'coac250-8th-batch-preview-delta-20261027.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
