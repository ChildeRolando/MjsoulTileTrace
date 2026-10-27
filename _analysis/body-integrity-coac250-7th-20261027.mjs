// COAC-250 seventh batch: targeted body-integrity check for the newly staged chapter.
// Candidate blocks vs staged corpus blocks, positional (the stage assigns its own block ids),
// with explicit evidence for the two corrected blocks.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root='E:/AgentData/Coach/knowledge/processing';
const preview='E:/AgentData/Coach/knowledge/processing/integration/accepted-content-preview-2026-10-27T07-16-27-706Z';
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const candidate=await load(join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.rev1.json'));
const parent=await load(join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.display.json'));
const corpus=await load(join(preview,'textbook-corpus.json'));
const chapterId='modern-yabejp-ja-chapter04-section004-chapter';
const units=corpus.units.filter(u=>u.chapterId===chapterId);
const blocks=units.flatMap(u=>u.blocks);
const candAt=i=>candidate.body.blocks[i], parAt=i=>parent.body.blocks[i];
const srcId=b=>b.sourceBlockIds?.[0]??null;

const correctedIds=['modern-yabejp-ja:chapter04-section004:b0016','modern-yabejp-ja:chapter04-section004:b0018'];
const corrected=correctedIds.map(id=>{
  const i=candidate.body.blocks.findIndex(b=>srcId(b)===id);
  const cand=candAt(i),par=parAt(i),staged=blocks[i];
  return {id,index:i,parentText:par.text,candidateText:cand.text,stagedText:staged.text,
    candidateDiffersFromParent:cand.text!==par.text,
    stagedEqualsCandidate:staged.text===cand.text,
    stagedDiffersFromParent:staged.text!==par.text};
});
const charDeltaByBlock=blocks.map((b,i)=>b.text.length-candAt(i).text.length);
const differingIndices=blocks.map((b,i)=>b.text===candAt(i).text?null:i).filter(i=>i!==null);
const result={
 schema:'coac250-7th-batch-body-integrity/1',
 modelCalls:0,
 chapterId,
 candidateSha256:sha(await readFile(join(root,'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.rev1.json'))),
 candidateBlocks:candidate.body.blocks.length,
 stagedBlocks:blocks.length,
 stagedUnits:units.map(u=>u.unitId),
 stagedBlockIdScheme:'stage-assigned (modern-yabejp-ja-chapter04-section004-b<n>); candidate sourceBlockIds carried as the correspondence key',
 orderPreservedByPosition:blocks.every((b,i)=>i<candidate.body.blocks.length),
 allStagedTextsEqualCandidateByPosition:differingIndices.length===0,
 differingIndices,
 charDeltaTotal:charDeltaByBlock.reduce((a,b)=>a+b,0),
 corrected,
 figures:{candidate:candidate.figures.length,stagedFiguresInChapter:(corpus.images||[]).filter(i=>String(i.figureId).startsWith('modern-yabejp-ja-chapter04-section004-')).length}
};
result.pass={
 blockCountMatches:blocks.length===candidate.body.blocks.length,
 unitCountMatches:units.length===1,
 allTextsMatchCandidate:result.allStagedTextsEqualCandidateByPosition,
 correctedBlocksCarried:corrected.every(r=>r.stagedEqualsCandidate&&r.stagedDiffersFromParent&&r.candidateDiffersFromParent),
 untouchedBlocksUnchanged:blocks.every((b,i)=>correctedIds.includes(srcId(candAt(i)))||b.text===candAt(i).text),
 noFiguresAsDeclared:candidate.figures.length===0&&result.figures.stagedFiguresInChapter===0
};
result.allPassed=Object.values(result.pass).every(Boolean);
await writeFile(join('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-250-b6ae8c7b8640/worktree/_analysis','coac250-7th-batch-body-integrity-20261027.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
