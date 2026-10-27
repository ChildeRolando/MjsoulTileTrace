// COAC-250 tenth batch: targeted body-integrity check for the three newly staged chapters
// (199-1/chapter03-section013, 142-1/chapter01-section054, 127-1/chapter01-section047).
// Staged blocks merge candidate text blocks by paragraph and render inline tile figures as codes,
// so the check is inclusion-based: every candidate text block must be present verbatim
// (whitespace-insensitive) in the staged paragraph it maps to through locator.sourceBlockIds, and
// every revised block must carry the new span and drop the parent span it replaced.
// Read-only; zero model calls.
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
 {original:'nemata-jp-chapter-199-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.display.json',chapterId:'modern-yabejp-ja-chapter03-section013-chapter'},
 {original:'nemata-jp-chapter-142-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.display.json',chapterId:'modern-yabejp-ja-chapter01-section054-chapter'},
 {original:'nemata-jp-chapter-127-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.display.json',chapterId:'modern-yabejp-ja-chapter01-section047-chapter'}
];

// longest single differing span between the parent block text and the candidate block text
function spanDiff(a,b){
 a=norm(a);b=norm(b);
 let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
 let s=0;while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s])s++;
 return {oldSpan:a.slice(p,a.length-s),newSpan:b.slice(p,b.length-s),prefix:p,suffix:s};
}

const results=[];
for(const ch of chapters){
 const candidateBytes=await readFile(join(root,ch.candidate));
 const candidate=JSON.parse(candidateBytes),parent=await load(join(root,ch.parent));
 const targetIds=candidate.provenance.revision.textBlockIds;
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
 const revised=targetIds.map(id=>{
   const targetStaged=stagedBySource.get(id);
   const targetCandidate=candidate.body.blocks.find(b=>b.sourceBlockIds?.[0]===id);
   const targetParent=parent.body.blocks.find(b=>b.sourceBlockIds?.[0]===id);
   const diff=(targetCandidate&&targetParent)?spanDiff(targetParent.text,targetCandidate.text):{oldSpan:'',newSpan:''};
   const newSpanLanded=!!targetStaged&&!!diff.newSpan&&norm(targetStaged.text).includes(norm(diff.newSpan));
   const oldSpanGone=!diff.oldSpan||(!!targetStaged&&!norm(targetStaged.text).includes(norm(diff.oldSpan)));
   return {id,
    parentText:targetParent?targetParent.text:null,
    candidateText:targetCandidate?targetCandidate.text:null,
    stagedText:targetStaged?targetStaged.text:null,
    replacedOldSpan:diff.oldSpan,replacedWithNewSpan:diff.newSpan,
    candidateDiffersFromParent:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,
    stagedCarriesCandidateText:!!targetStaged&&!!targetCandidate&&norm(targetStaged.text).includes(norm(targetCandidate.text)),
    stagedCarriesNewSpan:newSpanLanded,
    stagedDropsOldSpan:oldSpanGone,
    pass:{staged:!!targetStaged,candidateDiffers:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,revisedTextLanded:newSpanLanded&&oldSpanGone}};
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
  allRevisedBlocksActuallyChanged:revised.every(x=>x.pass.candidateDiffers),
  allRevisedTextsLanded:revised.every(x=>x.pass.revisedTextLanded),
  allRevisedCandidateTextsStaged:revised.every(x=>x.stagedCarriesCandidateText),
  figureAssetsInherited:candidate.figures.length===stagedFigureCount
 };
 r.allPassed=Object.values(r.pass).every(Boolean);
 results.push(r);
}
const out={schema:'coac250-10th-batch-body-integrity/1',modelCalls:0,preview,chapters:results,allPassed:results.every(r=>r.allPassed)};
await writeFile(join('E:/AgentData/Coach/knowledge/processing/integration','coac250-10th-batch-body-integrity-20261027.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,chapters:results.map(r=>({chapterId:r.chapterId,candidateTextBlocks:r.candidateTextBlocks,stagedBlocks:r.stagedBlocks,stagedFigures:r.stagedFigures,candidateFigures:r.candidateFigures,pass:r.pass,revised:r.revised.map(x=>({id:x.id,changed:x.pass.candidateDiffers,landed:x.pass.revisedTextLanded,oldSpan:x.replacedOldSpan.slice(0,40),newSpan:x.replacedWithNewSpan.slice(0,40)}))}))},null,1));
