// COAC-250 ninth batch: targeted body-integrity check for the three newly staged chapters.
// Staged blocks merge candidate text blocks by paragraph and render inline tile figures as codes,
// so the check is inclusion-based: every candidate text block must be present verbatim
// (whitespace-insensitive) in the staged paragraph it maps to through locator.sourceBlockIds,
// and every revised block must carry the new text. Read-only; zero model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing';
const preview=process.argv[2];
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=s=>String(s??'').replace(/\s+/g,'');
const corpus=await load(join(preview,'textbook-corpus.json'));

const chapters=[
 {original:'nemata-jp-chapter-201-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.display.json',chapterId:'modern-yabejp-ja-chapter03-section015-chapter',
  targets:[{id:'modern-yabejp-ja:chapter03-section015:b0041',newPhrase:'单骑的优先度低于所选的单骑听牌',oldPhrase:'更优先选择的单骑听牌'}]},
 {original:'nemata-jp-chapter-338-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',chapterId:'modern-yabejp-ja-archive01-section006-chapter',
  targets:[{id:'modern-yabejp-ja:archive01-section006:b0518',newPhrase:'至于根据场况判断牌的',oldPhrase:'对场上牌的疏密情况的考虑'}]},
 {original:'nemata-jp-chapter-273-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',chapterId:'modern-yabejp-ja-chapter06-exercise002-02-chapter',
  targets:[{id:'modern-yabejp-ja:chapter06-exercise002-02:b0263',newPhrase:'立直与本方案相比，待牌张数仅相差1张',oldPhrase:'立直相比，待牌张数仅相差1张'},
           {id:'modern-yabejp-ja:chapter06-exercise002-02:b0545',newPhrase:'选择七对子一向听',oldPhrase:'选择七对子的向听形'}]}
];

const results=[];
for(const ch of chapters){
 const candidateBytes=await readFile(join(root,ch.candidate));
 const candidate=JSON.parse(candidateBytes),parent=await load(join(root,ch.parent));
 const units=corpus.units.filter(u=>u.chapterId===ch.chapterId);
 const blocks=units.flatMap(u=>u.blocks);
 const stagedBySource=new Map();
 for(const b of blocks)for(const id of b.locator?.sourceBlockIds??[])if(!stagedBySource.has(id))stagedBySource.set(id,b);
 const texts=candidate.body.blocks.filter(b=>b.type==='text');
 const missingSources=texts.filter(b=>!stagedBySource.has(b.sourceBlockIds[0])).map(b=>b.sourceBlockIds[0]);
 const containment=texts.map(b=>{
   const staged=stagedBySource.get(b.sourceBlockIds[0]);
   return {id:b.sourceBlockIds[0],candidateChars:norm(b.text).length,stagedChars:norm(staged?.text).length??0,contained:!!staged&&norm(staged.text).includes(norm(b.text))};
 });
 const notContained=containment.filter(c=>!c.contained).map(c=>c.id);
 const perStaged=[...new Set(texts.map(b=>stagedBySource.get(b.sourceBlockIds[0])).filter(Boolean))].map(staged=>{
   const ids=new Set(staged.locator.sourceBlockIds??[]);
   const members=texts.filter(b=>ids.has(b.sourceBlockIds[0]));
   const candChars=members.reduce((n,b)=>n+norm(b.text).length,0);
   return {stagedBlockId:staged.id,memberBlocks:members.length,candidateChars:candChars,stagedChars:norm(staged.text).length,tileRenderDeltaChars:norm(staged.text).length-candChars};
 });
 const revised=ch.targets.map(t=>{
   const targetStaged=stagedBySource.get(t.id);
   const targetCandidate=candidate.body.blocks.find(b=>b.sourceBlockIds?.[0]===t.id);
   const targetParent=parent.body.blocks.find(b=>b.sourceBlockIds?.[0]===t.id);
   const parentIsSubstringOfCandidate=!!targetParent&&!!targetCandidate&&targetCandidate.text.includes(targetParent.text);
   return {id:t.id,
    parentText:targetParent?targetParent.text:null,
    candidateText:targetCandidate?targetCandidate.text:null,
    stagedText:targetStaged?targetStaged.text:null,
    candidateDiffersFromParent:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,
    stagedCarriesNewPhrase:!!targetStaged&&targetStaged.text.includes(t.newPhrase),
    parentPhraseIsSubstringOfCandidate:parentIsSubstringOfCandidate,
    stagedDropsOldPhrase:parentIsSubstringOfCandidate?null:!!targetStaged&&!targetStaged.text.includes(t.oldPhrase),
    pass:{staged:!!targetStaged,revisedTextLanded:(!!targetStaged&&targetStaged.text.includes(t.newPhrase))&&(parentIsSubstringOfCandidate||!targetStaged.text.includes(t.oldPhrase))}};
 });
 const stagedFigureCount=(corpus.images||[]).filter(i=>String(i.figureId).startsWith(ch.chapterId.replace(/-chapter$/,'-'))).length;
 const r={
  chapterId:ch.chapterId,original:ch.original,
  candidateSha256:sha(candidateBytes),
  candidateBlocks:candidate.body.blocks.length,candidateTextBlocks:texts.length,
  stagedUnits:units.map(u=>u.unitId),stagedBlocks:blocks.length,
  stagedFigures:stagedFigureCount,candidateFigures:candidate.figures.length,
  mapping:'staged locator.sourceBlockIds -> candidate sourceBlockIds; staged paragraphs merge candidate text blocks and render inline tile figures as codes',
  missingSourceBlocks:missingSources,
  blocksNotContainedVerbatim:notContained,
  stagedParagraphs:perStaged,
  revised
 };
 r.pass={
  allSourceBlocksStaged:missingSources.length===0,
  everyCandidateTextBlockPresent:notContained.length===0,
  allRevisedBlocksStaged:revised.every(x=>x.pass.staged),
  allRevisedTextsLanded:revised.every(x=>x.pass.revisedTextLanded),
  figureAssetsInherited:candidate.figures.length===stagedFigureCount
 };
 r.allPassed=Object.values(r.pass).every(Boolean);
 results.push(r);
}
const out={schema:'coac250-9th-batch-body-integrity/1',modelCalls:0,preview,chapters:results,allPassed:results.every(r=>r.allPassed)};
await writeFile(join('E:/AgentData/Coach/knowledge/processing/integration','coac250-9th-batch-body-integrity-20261027.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,chapters:results.map(r=>({chapterId:r.chapterId,candidateTextBlocks:r.candidateTextBlocks,stagedBlocks:r.stagedBlocks,stagedFigures:r.stagedFigures,candidateFigures:r.candidateFigures,pass:r.pass,revised:r.revised.map(x=>({id:x.id,staged:x.pass.staged,landed:x.pass.revisedTextLanded}))}))},null,1));
