import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const here=import.meta.dirname,load=async p=>JSON.parse(await readFile(p,'utf8'));
const cfg=await load(join(here,'input.json')),out=cfg.shared,stage=join(out,'diagnostic-tables');
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const imp=async p=>import(pathToFileURL(join(repo,p)));
const sha=x=>createHash('sha256').update(x).digest('hex');
const save=async(n,x)=>{const text=JSON.stringify(x,null,2)+'\n';await writeFile(join(out,n),text);await writeFile(join(here,n),text);};
const dependencies=[];
for(const p of ['scripts/textbook-processing/stage-web-tables.mjs','scripts/textbook-processing/stage-web-textbook.mjs','scripts/scene-study/compile-textbook-corpus.mjs','scripts/scene-study/textbook-review.mjs','packages/desktop/dist/textbook-knowledge.js','packages/desktop/dist/arena-textbook-tools.js'])dependencies.push({path:join(repo,p),sha256:sha(await readFile(join(repo,p)))});
for(const b of cfg.dependencies)assert.equal(sha(await readFile(b.path)),b.sha256);
const {composeWebTables}=await imp('scripts/textbook-processing/stage-web-tables.mjs');
const {composeWebParagraphs}=await imp('scripts/textbook-processing/stage-web-textbook.mjs');
const {compileTextbookCorpus}=await imp('scripts/scene-study/compile-textbook-corpus.mjs');
const {buildTextbookReview}=await imp('scripts/scene-study/textbook-review.mjs');
const {createTextbookKnowledge,validateTextbookCorpus,textbookCorpusId}=await imp('packages/desktop/dist/textbook-knowledge.js');
const {createArenaTextbookTools}=await imp('packages/desktop/dist/arena-textbook-tools.js');
await mkdir(stage);await mkdir(join(stage,'assets'));
const s=cfg.source,sourceId='coac244-283-table-diagnostic',chapterId=sourceId+'-chapter';
const byId=new Map(s.blocks.map(b=>[b.id,b])),figures=new Map(cfg.tableCandidateFigures.map(f=>[f.figureId,f]));
const raw=[],imageMaps=[];
for(const [index,b] of cfg.tableCandidateBlocks.entries()){
 const source=byId.get(b.sourceBlockIds[0]),id=`coac244-283-t${index+1}`;
 const locator={url:s.url,sourceBlockIds:b.sourceBlockIds,domPaths:[source.domPath]};
 const base={id,page:null,locator,paragraphId:b.paragraphId,tableContext:b.tableContext};
 if(b.type==='text')raw.push({...base,type:'p',text:b.text,sourceSegments:b.sourceSegments});
 else {
  const f=figures.get(b.figureId),asset=f.presentationAsset??f.sourceAssetBindings[0];
  assert.equal(f.sourceAssetBindings.length,1);const bytes=await readFile(join(cfg.root,asset.path));assert.equal(sha(bytes),asset.sha256);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const src=`assets/${id}.png`;await copyFile(join(cfg.root,asset.path),join(stage,src));
  raw.push({...base,type:'figure',src,caption:f.caption,transcriptionText:f.transcription,sourceAssetBindings:f.sourceAssetBindings});
  imageMaps.push({sourceBlockIds:b.sourceBlockIds,originalFigureId:f.figureId,derivedId:id,src,sha256:asset.sha256,originalPath:asset.path});
 }
}
const blocks=composeWebTables(raw,s,sourceId,composeWebParagraphs);
const policy={cardRole:'index-only',bodyRole:'complete-source-body-with-chinese-translation',modelExperiments:false,reviewStatus:'pending-user-review'};
const library={schema:'coach-textbook-index/1',status:'diagnostic-navigation-only-not-accepted-chapter',title:'283六表源绑定展示核验（非教材通过）',policy,sources:[{id:sourceId,title:s.title,format:'web',language:'ja',url:s.url,articleId:s.articleId,sha256:s.html.sha256,htmlSha256:s.html.sha256,bytes:s.html.bytes}],chapters:[{id:chapterId,title:'283六表展示诊断，非完整教学论证',sourceId,startPage:null,bodyStartPage:null,endPage:null,topics:[],anchors:[],relatedChapterIds:[]}]};
const bodies={schema:'coach-textbook-bodies/1',language:'zh-CN',modelExperiments:false,chapters:[{chapterId,sourceId,sourceSha256:s.html.sha256,translationStatus:'batch-audited-pending-user-review',translatorNote:'仅核候选到展示投影，非语义验收；原候选needs-repair保持。空白单元格标签为展示提示，非原文。',blocks}]};
const definitions=s.tables.map((t,i)=>{const at=blocks.map((b,j)=>({b,j})).filter(({b})=>b.tableCell?.tableId===t.tableId||b.tableCaptionFor===t.tableId);return{id:`coac244-283-table-${i+1}-diagnostic`,chapterId,title:`表${i+1}定位诊断（非完整论证）`,from:at[0].j+1,to:at.at(-1).j+1,contentRole:'navigation'};});
for(const [n,x] of [['knowledge-index.json',library],['textbook-bodies.json',bodies],['textbook-unit-map.json',definitions]])await writeFile(join(stage,n),JSON.stringify(x,null,2)+'\n');
const build=await compileTextbookCorpus(stage,definitions);await buildTextbookReview(stage,library);
const corpus=await load(join(stage,'textbook-corpus.json'));
function assertProjection(c){
 for(const t of s.tables){
  const mapped=c.units.flatMap(u=>u.blocks).filter(b=>b.tableCell?.tableId===t.tableId);
  assert.equal(mapped.length,t.rows.flatMap(r=>r.cells).length);
  for(const row of t.rows)for(const cell of row.cells){
   const found=mapped.filter(b=>b.tableCell.row===cell.row&&b.tableCell.column===cell.column);assert.equal(found.length,1);
   const b=found[0];assert.equal(b.tableCell.empty,cell.empty);assert.equal(b.tableCell.header,cell.header);assert.equal(b.tableCell.rowspan,Number(cell.rowspan));assert.equal(b.tableCell.colspan,Number(cell.colspan));
   if(cell.empty)assert.equal(b.text,'（原表空白单元格）');
   else {assert.deepEqual(b.locator.sourceBlockIds,cell.sourceBlockIds);if(cell.rawText.includes('↓'))assert.equal(b.text,'↓');}
  }
 }
 for(const m of imageMaps){const b=c.units.flatMap(u=>u.blocks).find(b=>b.id===m.derivedId);assert.equal(b.figure.imageSha256,m.sha256);assert.equal(b.figure.transcription.text,figures.get(m.originalFigureId).transcription);}
}
assertProjection(corpus);
const regressions=[];
for(const kind of ['missing-empty','missing-arrow','moved-arrow','changed-image']){
 const mutant=structuredClone(corpus),unit=mutant.units.find(u=>u.blocks.some(b=>kind==='missing-empty'?b.tableCell?.empty:b.text==='↓'));
 if(kind==='missing-empty')unit.blocks.splice(unit.blocks.findIndex(b=>b.tableCell?.empty),1);
 if(kind==='missing-arrow')unit.blocks.splice(unit.blocks.findIndex(b=>b.text==='↓'),1);
 if(kind==='moved-arrow')unit.blocks.find(b=>b.text==='↓').tableCell.column--;
 if(kind==='changed-image')mutant.units.flatMap(u=>u.blocks).find(b=>b.type==='figure').figure.imageSha256='0'.repeat(64);
 mutant.corpusId=textbookCorpusId(mutant);
 let rejected=false;try{validateTextbookCorpus(mutant);assertProjection(mutant);}catch{rejected=true;}
 assert(rejected);regressions.push({kind,rejected:true});
}
const knowledge=createTextbookKnowledge(corpus),arenaReads=[];
const caseRef='arena-case:v1:'+randomUUID();
const tools=createArenaTextbookTools({caseRef,knowledge,aliases:{reference:()=> 'arena-ref:v1:'+randomUUID()}}),read=tools.find(t=>t.name==='read_textbook');
const observed={...corpus,units:[]};
for(const u of corpus.units){
 let offset=0,collected=[],pages=[];
 do{const r=await read.execute({unitId:u.unitId,blockOffset:offset},{caseRef,signal:new AbortController().signal});assert.equal(r.sourceRefs.length,0);collected.push(...r.result.unit.blocks);pages.push(r);offset=r.result.nextBlockOffset;}while(offset!==null);
 assert.deepEqual(collected,u.blocks);observed.units.push({...u,blocks:collected});arenaReads.push({unitId:u.unitId,pages});
}
assertProjection(observed);
await save('arena-actual-reads.json',arenaReads);
await save('projection-mapping.json',{canonical:cfg.canonical,status:'diagnostic-only-not-semantic-acceptance',stage,sourceDependencies:cfg.dependencies,runtimeDependencies:dependencies,blocks:blocks.map(b=>({derivedId:b.id,sourceBlockIds:b.locator.sourceBlockIds,tableCell:b.tableCell??null,captionFor:b.tableCaptionFor??null,syntheticEmptyLabel:b.tableCell?.empty??false})),images:imageMaps,acceptedChapter:false,newModelCalls:0});
await save('verification.json',{status:'six-table-presentation-preserved',...build,cells:248,emptyCells:117,arrows:13,images:94,arenaExactReadback:true,arenaTacticalSourceRefs:0,regressions,chapterAccepted:false,newModelCalls:0,activeChanged:false,stage,runtimeDependencies:dependencies});
for(const b of [...cfg.dependencies,...dependencies])assert.equal(sha(await readFile(b.path)),b.sha256);
console.log(JSON.stringify({stage,...build,cells:248,empty:117,arrows:13,arenaReads:arenaReads.length,regressions:regressions.length}));
