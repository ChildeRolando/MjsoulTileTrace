// COAC-250 eighth batch: targeted body-integrity check for the four newly staged chapters.
// Staged blocks merge candidate text blocks by paragraph and render inline tile figures as
// codes, so the check is inclusion-based: every candidate text block must be present verbatim
// (whitespace-insensitive) in the staged paragraph it maps to through locator.sourceBlockIds,
// and the revised block must carry the new text. Read-only; zero model calls.
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
 {original:'nemata-jp-chapter-174-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter02-section024.display.json',chapterId:'modern-yabejp-ja-chapter02-section024-chapter',targetId:'modern-yabejp-ja:chapter02-section024:b0036',newPhrase:'对方处于一向听或已经听牌的可能性会变高',oldPhrase:'处于1向听或以上'},
 {original:'nemata-jp-chapter-187-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section006.display.json',chapterId:'modern-yabejp-ja-chapter03-section006-chapter',targetId:'modern-yabejp-ja:chapter03-section006:b0095',newPhrase:'被切出后，鸣了某张牌，再切出',oldPhrase:'后，鸣了某张牌，再切出'},
 {original:'nemata-jp-chapter-198-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section012.display.json',chapterId:'modern-yabejp-ja-chapter03-section012-chapter',targetId:'modern-yabejp-ja:chapter03-section012:b0082',newPhrase:'那么特殊牌型的可能性就很高了',oldPhrase:'那就更有可能是特殊牌型'},
 {original:'nemata-jp-chapter-215-4',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev2.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev1.json',chapterId:'modern-yabejp-ja-chapter03-section027-chapter',targetId:'modern-yabejp-ja:chapter03-section027:b0011',newPhrase:'若这张牌不是进张完成面子后切出的余牌',oldPhrase:'若打出的这张牌并非新摸入的牌'}
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
 const targetStaged=stagedBySource.get(ch.targetId);
 const targetCandidate=candidate.body.blocks.find(b=>b.sourceBlockIds?.[0]===ch.targetId);
 const targetParent=parent.body.blocks.find(b=>b.sourceBlockIds?.[0]===ch.targetId);
 const parentIsSubstringOfCandidate=!!targetParent&&!!targetCandidate&&targetCandidate.text.includes(targetParent.text);
 const r={
  chapterId:ch.chapterId,original:ch.original,
  candidateSha256:sha(candidateBytes),
  candidateBlocks:candidate.body.blocks.length,candidateTextBlocks:texts.length,
  stagedUnits:units.map(u=>u.unitId),stagedBlocks:blocks.length,
  stagedFigures:(corpus.images||[]).filter(i=>String(i.figureId).startsWith(ch.chapterId.replace(/-chapter$/,'-'))).length,
  candidateFigures:candidate.figures.length,
  mapping:'staged locator.sourceBlockIds -> candidate sourceBlockIds; staged paragraphs merge candidate text blocks and render inline tile figures as codes',
  missingSourceBlocks:missingSources,
  blocksNotContainedVerbatim:notContained,
  stagedParagraphs:perStaged,
  revised:{id:ch.targetId,
   parentText:targetParent?targetParent.text:null,
   candidateText:targetCandidate?targetCandidate.text:null,
   stagedText:targetStaged?targetStaged.text:null,
   candidateDiffersFromParent:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,
   stagedCarriesNewPhrase:!!targetStaged&&targetStaged.text.includes(ch.newPhrase),
   parentPhraseIsSubstringOfCandidate:parentIsSubstringOfCandidate,
   stagedDropsOldPhrase:parentIsSubstringOfCandidate?null:!!targetStaged&&!targetStaged.text.includes(ch.oldPhrase)}
 };
 r.pass={
  allSourceBlocksStaged:missingSources.length===0,
  everyCandidateTextBlockPresent:notContained.length===0,
  revisedBlockStaged:!!targetStaged,
  revisedTextLanded:r.revised.stagedCarriesNewPhrase&&(r.revised.stagedDropsOldPhrase===null||r.revised.stagedDropsOldPhrase===true),
  figureAssetsInherited:candidate.figures.length===r.stagedFigures
 };
 r.allPassed=Object.values(r.pass).every(Boolean);
 results.push(r);
}
const out={schema:'coac250-8th-batch-body-integrity/1',modelCalls:0,preview,chapters:results,allPassed:results.every(r=>r.allPassed)};
await writeFile(join('E:/AgentData/Coach/knowledge/processing/integration','coac250-8th-batch-body-integrity-20261027.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
