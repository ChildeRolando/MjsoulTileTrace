import {it,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {applyProtectedSupplement} from './apply-protected-supplements.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'coach-supplement-')),stage=join(root,'stage');
 await mkdir(join(stage,'assets'),{recursive:true});
 const parentChapterId='nemata-jp-chapter-067-1',parentSourceId='nemata-jp';
 const parentSourceSha=sha('parent-source'),htmlSha=sha('html'),sourceSha=sha('source-json');
 const parentBlocks=[
  {id:'nemata-jp-p67-b1-t1',type:'p',page:67,text:'父稿第一段'},
  {id:'nemata-jp-p68-b1-t1',type:'p',page:68,text:'父稿第二段'}
 ];
 const library={schema:'coach-textbook-index/1',status:'accepted-pdf-chapter-subset',title:'fixture',policy:{cardRole:'index-only',bodyRole:'complete-source-body-with-chinese-translation',modelExperiments:false,reviewStatus:'pending-user-review'},sources:[{id:parentSourceId,title:'PDF',format:'pdf',sha256:parentSourceSha,bytes:100,gitBlob:'b'.repeat(40),pages:100}],chapters:[{id:parentChapterId,title:'副露役种的构思',sourceId:parentSourceId,startPage:67,bodyStartPage:67,endPage:68,topics:[],anchors:[],relatedChapterIds:[]}]};
 const bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[{chapterId:parentChapterId,sourceId:parentSourceId,sourceSha256:parentSourceSha,translationStatus:'batch-audited-pending-user-review',translatorNote:'fixture',blocks:parentBlocks}]};
 const definitions=[{id:`${parentChapterId}-unit-1`,chapterId:parentChapterId,title:'副露役种的构思',from:1,to:parentBlocks.length}];
 const parentPath=join(root,'parent-page.json'),parentBytes=Buffer.from(json({body:{blocks:[{id:'page-68'}]}}));
 await writeFile(parentPath,parentBytes);
 await writeFile(join(stage,'pdf-stage-receipt.json'),json({schema:'coach-approved-pdf-chapter-stage/1',status:'complete-chapter-subset-not-full-publication',pages:[{sourceId:parentSourceId,page:68,candidateSha256:sha(parentBytes)}]}));
 const targetIds=['modern-yabejp-ja:chapter01-section022-03:b0029','modern-yabejp-ja:chapter01-section022-03:b0032','modern-yabejp-ja:chapter01-section022-03:b0034'];
 const source={schema:'coach-textbook-web-source/1',sourceId:'modern-yabejp-ja',articleId:'chapter01-section022-03',url:'https://example.com/tactics/chapter01/section022-03.html',title:'フーロ手役の構想',language:'ja',html:{sha256:htmlSha,bytes:1200},blocks:targetIds.map((id,index)=>({id,paragraphId:`modern-yabejp-ja:chapter01-section022-03:p00${15+index}`,tag:'p',domPath:`main/p[${31+index}]`,type:'text',text:['例：ドラ','　ポン','　ポン'][index]}))};
 const sourcePath=join(root,'web-source.json'),sourceBytes=Buffer.from(json(source));
 await writeFile(sourcePath,sourceBytes);
 const candidate={schema:'coach-protected-web-supplement-draft/1',status:'draft-awaiting-independent-audit',sourceId:'modern-yabejp-ja',articleId:'chapter01-section022-03',sourcePath:'web-source.json',sourceSha256:sha(sourceBytes),targetParagraphIds:['modern-yabejp-ja:chapter01-section022-03:p0015'],targetTextBlockIds:targetIds,targetFigureBlockIds:[],sourceFigureBindings:[],translations:targetIds.map((sourceBlockId,index)=>({sourceBlockId,text:['**例：**宝牌','　碰','　碰'][index]})),figures:[],policy:'supplement only; preserve existing accepted PDF translations and hold unresolved source differences for exact merge'};
 const candidatePath=join(root,'candidate.json'),candidateBytes=Buffer.from(json(candidate));
 await writeFile(candidatePath,candidateBytes);
 const audit={schema:'coach-protected-supplement-semantic-audit/1',status:'passed',recordedAt:'2026-10-26T14:33:10.921Z',candidatePath,candidateSha256:sha(candidateBytes),sourceSha256:sha(sourceBytes),parent:{path:parentPath,sha256:sha(parentBytes),audits:[{path:'fixture-parent-audit',status:'passed',sha256:sha('parent-audit')}]},review:{verdict:'passed',semanticCompleteness:{complete:true,evidence:'fixture'},issues:[]},issues:[],semanticCompleteness:{complete:true,evidence:'fixture'},verification:'fixture'};
 const auditPath=join(root,'audit.json');
 await writeFile(auditPath,json(audit));
 await writeFile(join(stage,'knowledge-index.json'),json(library));
 await writeFile(join(stage,'textbook-bodies.json'),json(bodies));
 await writeFile(join(stage,'textbook-unit-map.json'),json(definitions));
 return {root,stage,parentChapterId,candidatePath,auditPath,parentBlocks,targetIds};
}

it('appends an ordered source-bound supplement without changing the PDF parent or duplicating body blocks',async()=>{
 const f=await fixture();
 try{
  const receipt=await applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:f.auditPath,parentChapterId:f.parentChapterId});
  expect(receipt.status).toBe('passed-supplement-stage');
  expect(receipt.bodyAccounting).toMatchObject({parentBlockCountBefore:2,parentBlockCountAfter:2,supplementBlockCount:3,targetBlocksRepresented:3,duplicateTargetBlocks:0,countedAsOriginalChapter:false});
  const library=JSON.parse(await readFile(join(f.stage,'knowledge-index.json'),'utf8'));
  const bodies=JSON.parse(await readFile(join(f.stage,'textbook-bodies.json'),'utf8'));
  const corpus=JSON.parse(await readFile(join(f.stage,'textbook-corpus.json'),'utf8'));
  const parent=library.chapters.find(chapter=>chapter.id===f.parentChapterId);
  const parentBody=bodies.chapters.find(chapter=>chapter.chapterId===f.parentChapterId);
  expect(parent.sourceId).toBe('nemata-jp');
  expect(parentBody.blocks).toEqual(f.parentBlocks);
  const supplement=library.chapters.find(chapter=>chapter.id===receipt.supplementChapterId);
  expect(supplement.sourceId).toBe('modern-yabejp-ja-supplement-chapter01-section022-03');
  expect(supplement.supplementOf).toBe(f.parentChapterId);
  expect(supplement.relatedChapterIds).toEqual([f.parentChapterId]);
  const supplementBody=bodies.chapters.find(chapter=>chapter.chapterId===supplement.id);
  expect(supplementBody.blocks.map(block=>block.text)).toEqual(['**例：**宝牌','　碰','　碰']);
  expect(supplementBody.blocks.map(block=>block.locator.sourceBlockIds[0])).toEqual(f.targetIds);
  const unit=corpus.units.find(item=>item.unitId===receipt.supplementUnitId);
  expect(unit.source).toMatchObject({sourceId:'modern-yabejp-ja-supplement-chapter01-section022-03',format:'web',web:{articleId:'chapter01-section022-03'}});
  expect(unit.contentRole).toBe('navigation');
  expect(unit.blocks.map(block=>block.locator.sourceBlockIds[0])).toEqual(f.targetIds);
  const ids=bodies.chapters.flatMap(chapter=>chapter.blocks.map(block=>block.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(f.targetIds.filter(id=>supplementBody.blocks.filter(block=>block.locator.sourceBlockIds.includes(id)).length===1)).toEqual(f.targetIds);
  expect(receipt.corpusId).toBe(corpus.corpusId);
  expect(receipt.modelCalls).toBe(0);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

it('is idempotent on a repeated run: same supplement ids and no extra body blocks',async()=>{
 const f=await fixture();
 try{
  const first=await applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:f.auditPath,parentChapterId:f.parentChapterId});
  const before=JSON.parse(await readFile(join(f.stage,'textbook-bodies.json'),'utf8'));
  const second=await applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:f.auditPath,parentChapterId:f.parentChapterId});
  expect(second).toMatchObject({status:'already-applied',duplicate:true,supplementChapterId:first.supplementChapterId,supplementBlockCount:3,parentBlockCount:2});
  const after=JSON.parse(await readFile(join(f.stage,'textbook-bodies.json'),'utf8'));
  expect(after).toEqual(before);
  expect(after.chapters).toHaveLength(2);
  expect(after.chapters.find(chapter=>chapter.chapterId===f.parentChapterId).blocks).toEqual(f.parentBlocks);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

it('rejects translations that do not follow targetTextBlockIds order',async()=>{
 const f=await fixture();
 try{
  const candidate=JSON.parse(await readFile(f.candidatePath,'utf8'));
  candidate.translations.reverse();
  await writeFile(f.candidatePath,json(candidate));
  const audit=JSON.parse(await readFile(f.auditPath,'utf8'));
  audit.candidateSha256=sha(await readFile(f.candidatePath));
  await writeFile(f.auditPath,json(audit));
  await expect(applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:f.auditPath,parentChapterId:f.parentChapterId})).rejects.toThrow('protected_supplement_order');
  const library=JSON.parse(await readFile(join(f.stage,'knowledge-index.json'),'utf8'));
  const bodies=JSON.parse(await readFile(join(f.stage,'textbook-bodies.json'),'utf8'));
  expect(library.chapters).toHaveLength(1);
  expect(bodies.chapters[0].blocks).toEqual(f.parentBlocks);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

it('rejects a missing or non-passed audit before writing any supplement',async()=>{
 const f=await fixture();
 try{
  await expect(applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:join(f.root,'missing-audit.json'),parentChapterId:f.parentChapterId})).rejects.toThrow('protected_supplement_audit_missing');
  const audit=JSON.parse(await readFile(f.auditPath,'utf8'));
  audit.status='needs-repair';
  await writeFile(f.auditPath,json(audit));
  await expect(applyProtectedSupplement({processingRoot:f.root,destination:f.stage,candidatePath:f.candidatePath,auditPath:f.auditPath,parentChapterId:f.parentChapterId})).rejects.toThrow('protected_supplement_not_passed');
  const library=JSON.parse(await readFile(join(f.stage,'knowledge-index.json'),'utf8'));
  const bodies=JSON.parse(await readFile(join(f.stage,'textbook-bodies.json'),'utf8'));
  expect(library.chapters).toHaveLength(1);
  expect(bodies.chapters).toHaveLength(1);
  expect(bodies.chapters[0].blocks).toEqual(f.parentBlocks);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
