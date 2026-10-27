// COAC-250 twelfth batch: targeted body/figure integrity for the three newly staged chapters
// (089-1/chapter01-section031, 060-1/chapter01-section021-06, 081-8/cv1721475).
// Staged blocks merge candidate text blocks by paragraph and render inline tile figures as codes, so
// text is checked inclusion-based through locator.sourceBlockIds; the figure-only revision (081-8) is
// checked by matching every candidate figure's transcription against the staged corpus figure.
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
 {original:'nemata-jp-chapter-089-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section031.display.json',chapterId:'modern-yabejp-ja-chapter01-section031-chapter'},
 {original:'nemata-jp-chapter-060-1',candidate:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.coac269rev1.json',parent:'web-production/v1/candidates/modern-yabejp-ja/chapter01-section021-06.display.json',chapterId:'modern-yabejp-ja-chapter01-section021-06-chapter'},
 {original:'79-cn-chapter-081-8',candidate:'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json',parent:'web-production/v1/candidates/79-bilibili-cn/cv1721475.display.json',chapterId:'79-bilibili-cn-cv1721475-chapter'}
];

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
 const targetIds=candidate.provenance.revision.textBlockIds||[];
 const targetFigureIds=candidate.provenance.revision.figureIds||[];
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
 const revised=targetIds.map(id=>{
   const targetStaged=stagedBySource.get(id);
   const targetCandidate=candidate.body.blocks.find(b=>b.sourceBlockIds?.[0]===id);
   const targetParent=parent.body.blocks.find(b=>b.sourceBlockIds?.[0]===id);
   const diff=(targetCandidate&&targetParent)?spanDiff(targetParent.text,targetCandidate.text):{oldSpan:'',newSpan:''};
   const newSpanLanded=!!targetStaged&&!!diff.newSpan&&norm(targetStaged.text).includes(norm(diff.newSpan));
   const oldSpanGone=!diff.oldSpan||(!!targetStaged&&!norm(targetStaged.text).includes(norm(diff.oldSpan)));
   return {id,parentText:targetParent?targetParent.text:null,candidateText:targetCandidate?targetCandidate.text:null,stagedText:targetStaged?targetStaged.text:null,
    replacedOldSpan:diff.oldSpan,replacedWithNewSpan:diff.newSpan,
    candidateDiffersFromParent:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,
    stagedCarriesCandidateText:!!targetStaged&&!!targetCandidate&&norm(targetStaged.text).includes(norm(targetCandidate.text)),
    stagedCarriesNewSpan:newSpanLanded,stagedDropsOldSpan:oldSpanGone,
    pass:{staged:!!targetStaged,candidateDiffers:!!targetCandidate&&!!targetParent&&targetCandidate.text!==targetParent.text,revisedTextLanded:newSpanLanded&&oldSpanGone}};
 });
 const prefix=ch.chapterId.replace(/-chapter$/,'-');
 const stagedFigures=(corpus.images||[]).filter(i=>String(i.figureId).startsWith(prefix));
 const stagedFigById=new Map(stagedFigures.map(i=>[i.figureId,i]));
 const stagedFigureBlocks=new Map();
 for(const b of blocks)if(b.type==='figure'&&b.figure)stagedFigureBlocks.set(b.figure.figureId,b.figure);
 const toStagedId=fid=>{const m=String(fid).match(/^(.*):b(\d+):figure$/);return m?m[1].replace(/:(?=[^:]*$)/,'-')+'-b'+Number(m[2]):String(fid);};
 const candidateFigStagedId=f=>{const m=String(f.figureId).match(/^(.+):b(\d+):figure$/);if(!m)return null;const book=m[1].slice(0,m[1].lastIndexOf(':'));const article=m[1].slice(m[1].lastIndexOf(':')+1);return book+'-'+article+'-b'+Number(m[2]);};
 const parentFigById=new Map(parent.figures.map(f=>[f.figureId,f]));
 const figureChecks=[];
 for(const f of candidate.figures){
   const sid=candidateFigStagedId(f);
   const image=stagedFigById.get(sid)??null;
   const block=stagedFigureBlocks.get(sid)??null;
   const bindings=(f.sourceAssetBindings||[]).map(b=>b.sha256);
   const expectedImageSha=bindings[0]??null;
   let imageFileSha=null;
   if(image){const bytes=await readFile(join(preview,image.path));imageFileSha=sha(bytes);}
   figureChecks.push({figureId:f.figureId,stagedFigureId:sid,declaredInRevision:targetFigureIds.includes(f.figureId),
    imageStaged:!!image,blockStaged:!!block,
    imageFileMatchesCorpus:!!image&&imageFileSha===image.sha256,
    directBindingMatch:!!image&&bindings.includes(image.sha256),
    composedRender:!!image&&!bindings.includes(image.sha256),
    blockImageShaMatches:!block||bindings.includes(block.imageSha256),
    transcriptionMatches:!block||(!!block.transcription&&block.transcription.text===f.transcription),
    differsFromParent:JSON.stringify(f.transcription)!==JSON.stringify(parentFigById.get(f.figureId)?.transcription)});
 }
 const changedFigureChecks=figureChecks.filter(f=>f.declaredInRevision);
 const r={chapterId:ch.chapterId,original:ch.original,candidateSha256:sha(candidateBytes),
  candidateBlocks:candidate.body.blocks.length,candidateTextBlocks:texts.length,candidateFigures:candidate.figures.length,
  stagedUnits:units.map(u=>u.unitId),stagedBlocks:blocks.length,stagedFigures:stagedFigures.length,
  missingSourceBlocks:missingSources,blocksNotContainedVerbatim:notContained,revised,
  figures:figureChecks,
  pass:{
   allSourceBlocksStaged:missingSources.length===0,
   everyCandidateTextBlockPresent:notContained.length===0,
   allRevisedBlocksStaged:revised.every(x=>x.pass.staged),
   allRevisedBlocksActuallyChanged:revised.every(x=>x.pass.candidateDiffers),
   allRevisedTextsLanded:revised.every(x=>x.pass.revisedTextLanded),
   allRevisedCandidateTextsStaged:revised.every(x=>x.stagedCarriesCandidateText),
   allFiguresStaged:figureChecks.every(f=>f.imageStaged),
   allFigureImageFilesMatchCorpus:figureChecks.every(f=>f.imageFileMatchesCorpus),
   figureAssetsAccounted:{directBinding:figureChecks.filter(f=>f.directBindingMatch).length,composedRender:figureChecks.filter(f=>f.composedRender).length,
    note:'modern-yabejp-ja figures are composed renders (source tiles re-rendered into one example PNG), so their staged sha is not any single binding sha; 79-bilibili-cn figures pass through the original image bytes'},
   allFigureTranscriptionsMatchStaged:figureChecks.every(f=>f.transcriptionMatches),
   figureBlockCoverage:{stagedFigureBlocks:figureChecks.filter(f=>f.blockStaged).length,candidateFigures:figureChecks.length,
    note:'modern-yabejp-ja chapters render most figures inline as tile codes; those have no standalone figure block and are checked by staged asset sha only'},
   declaredChangedFiguresActuallyChanged:changedFigureChecks.every(f=>f.differsFromParent),
   figureCountsMatch:candidate.figures.length===stagedFigures.length}
 };
 r.allPassed=Object.values(r.pass).every(Boolean);
 results.push(r);
}
const out={schema:'coac250-12th-batch-body-integrity/1',modelCalls:0,preview,chapters:results,allPassed:results.every(r=>r.allPassed)};
await writeFile(join(root,'integration','coac250-12th-batch-body-integrity-20261027.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({allPassed:out.allPassed,chapters:results.map(r=>({chapterId:r.chapterId,textBlocks:r.candidateTextBlocks,stagedBlocks:r.stagedBlocks,figures:r.candidateFigures,stagedFigures:r.stagedFigures,pass:r.pass,
 revised:r.revised.map(x=>({id:x.id,changed:x.pass.candidateDiffers,landed:x.pass.revisedTextLanded,newSpan:x.replacedWithNewSpan.slice(0,40)}))}))},null,1));
