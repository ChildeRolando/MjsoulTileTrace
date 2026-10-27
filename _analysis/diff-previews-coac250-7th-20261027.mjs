// COAC-250 seventh batch: compare the new preview against the previous one — chapter add/remove,
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

const key=u=>u.unitId,fp=u=>sha(JSON.stringify(u.blocks));
const priorUnits=new Map(priorCorpus.units.map(u=>[key(u),fp(u)]));
const nextUnits=new Map(nextCorpus.units.map(u=>[key(u),fp(u)]));
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

const imageIds=new Set(nextCorpus.images.map(i=>i.figureId));
const priorImageIds=new Set(priorCorpus.images.map(i=>i.figureId));

const formalCorpusBytes=await readFile('E:/AgentData/Coach/knowledge/review/textbook-corpus.json');
const formalCorpus=JSON.parse(formalCorpusBytes);

const result={
 schema:'coac250-7th-batch-preview-delta/1',
 modelCalls:0,
 priorPreview:priorPath,priorCorpusId:prior.corpusId,priorChapters:prior.chapters,priorUnits:prior.units,priorBlocks:prior.blocks,priorFigures:prior.figures,
 nextPreview:current.output,nextCorpusId:next.corpusId,nextChapters:next.chapters,nextUnits:next.units,nextBlocks:next.blocks,nextFigures:next.figures,
 chapters:{added:addedChapters,removed:removedChapters,retained:priorChapters.size-removedChapters.length},
 units:{added,removed,rewritten},
 selectedWeb:{prior:prior.selectedWeb.length,next:next.selectedWeb.length},
 pendingWeb:{prior:prior.pendingWeb.length,next:next.pendingWeb.length,resolved:pendingResolved,added:pendingAdded},
 figures:{prior:priorImageIds.size,next:imageIds.size,added:[...imageIds].filter(i=>!priorImageIds.has(i)),removed:[...priorImageIds].filter(i=>!imageIds.has(i))},
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
  note:'The previous pointer is not deleted: it is byte-identical to the previous preview directory receipt, which is left untouched.',
  previousReceiptPath:join(priorPath,'accepted-preview-receipt.json'),
  previousReceiptSha256:sha(await readFile(join(priorPath,'accepted-preview-receipt.json')))
 },
 build:{corpusId:next.corpusId,crossChapterNavigation:next.crossChapterNavigation,activeLibraryChanged:next.activeLibraryChanged,maxUnitBytes:next.maxUnitBytes}
};
result.pass={
 retainedUnitsNotRewritten:rewritten.length===0,
 noChaptersLost:removedChapters.length===0,
 oneChapterAdded:addedChapters.length===1&&addedChapters[0]==='modern-yabejp-ja-chapter04-section004-chapter',
 pendingResolvedForSection004:pendingResolved.includes('chapter04-section004.display.json'),
 formalLibraryUntouched:result.formalLibrary.corpusFileSha256===result.formalLibrary.receiptFormalCorpusFileSha256&&result.formalLibrary.corpusId===result.formalLibrary.receiptFormalCorpusId&&next.activeLibraryChanged===false,
 pointerAdvancedToNewPreview:result.pointer.equalsNewReceipt,
 previousPreviewPreserved:result.previousPointerPreserved.previousReceiptSha256==='f54af915694aa7865ebb8edb1e943c46b72d2b0603bfd2533378c26ef797023a'
};
result.allPassed=Object.values(result.pass).every(Boolean);
await writeFile(join(root,'integration','coac250-7th-batch-preview-delta-20261027.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
