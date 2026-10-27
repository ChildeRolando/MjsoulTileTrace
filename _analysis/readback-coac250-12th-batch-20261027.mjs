// COAC-250 twelfth batch: independent zero-model-call readback of the delivered preview for the three
// chapters the member named (089-1/chapter01-section031, 060-1/chapter01-section021-06, 081-8/cv1721475),
// an explicit absence check for the held 027-1, and a cross-book numbering guard: the already-covered
// nemata-jp-chapter-215-4 stays in the catalog while the still-disputed 79-cn-chapter-215-4 stays out.
// Read-only against the accepted preview; writes only its own evidence. Zero model calls.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const sdkRoot='file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/node_modules/@modelcontextprotocol/sdk/dist/esm';
const {Client}=await import(sdkRoot+'/client/index.js');
const {StdioClientTransport}=await import(sdkRoot+'/client/stdio.js');

const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const directory=resolve(process.argv[2]??''),outPath=process.argv[3];
const corpus=JSON.parse(await readFile(join(directory,'textbook-corpus.json'),'utf8'));
const cli=repo+'/bin/textbook-mcp-server.mjs';
const targets=[
 {chapterId:'modern-yabejp-ja-chapter01-section031-chapter',newPhrase:'只在没有其他宝牌、且点棒状况需要高分时追求三色即可',revisedFigureIds:[]},
 {chapterId:'modern-yabejp-ja-chapter01-section021-06-chapter',newPhrase:'理由与往上数第二个比较',revisedFigureIds:[]},
 {chapterId:'79-bilibili-cn-cv1721475-chapter',newPhrase:'无雀头形的牌，改良是非常重要的一个要素',revisedFigureIds:['79-bilibili-cn:cv1721475:b0004:figure','79-bilibili-cn:cv1721475:b0006:figure','79-bilibili-cn:cv1721475:b0008:figure','79-bilibili-cn:cv1721475:b0018:figure']}
];
const absentTargets=[
 {chapterId:'modern-yabejp-ja-chapter01-section010-chapter',articleId:'chapter01-section010',reason:'confirmed_source_definition_boundary_hold (027-1 held, not staged)'},
 {chapterId:'79-cn-chapter-215-4',articleId:'215-4',reason:'p217 still needs-repair; open item kept, never merged with nemata-jp-chapter-215-4'}
];
const unitsFor=chapterId=>corpus.units.filter(u=>u.chapterId===chapterId);
const stagedFigureId=fid=>{const m=String(fid).match(/^(.+):b(\d+):figure$/);if(!m)return null;const book=m[1].slice(0,m[1].lastIndexOf(':'));const article=m[1].slice(m[1].lastIndexOf(':')+1);return book+'-'+article+'-b'+Number(m[2]);};
const queryFor=(unitId,phrase)=>{
 const unit=corpus.units.find(u=>u.unitId===unitId);
 const block=unit.blocks.find(b=>String(b.text||'').includes(phrase));
 const text=block?block.text:String(block?.text??'');
 const at=text.indexOf(phrase);
 return at>=0?text.slice(Math.max(0,at-2),at+22):phrase.slice(0,24);
};
const client=new Client({name:'coac250-12th-readback',version:'1.0.0'});
const rows=[];let maxTextBytes=0,totalMs=0;
async function call(name,args){const start=performance.now();const r=await client.callTool({name,arguments:args});totalMs+=performance.now()-start;maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(r.content.find(x=>x.type==='text').text));return JSON.parse(r.content.find(x=>x.type==='text').text);}
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,directory],stderr:'pipe'}));
 const catalog=[];let offset=0;
 do{const d=await call('catalog_textbook',{offset,limit:20});catalog.push(...d.entries);offset=d.nextOffset;}while(offset!==null);
 for(const target of targets){
  const chapterId=target.chapterId;
  const entry=catalog.find(e=>e.chapterId===chapterId);
  for(const unit of unitsFor(chapterId)){
   const blocks=[];let blockOffset=0;
   do{const d=await call('read_textbook',{unitId:unit.unitId,blockOffset});blocks.push(...d.unit.blocks);blockOffset=d.nextBlockOffset;}while(blockOffset!==null);
   const query=queryFor(unit.unitId,target.newPhrase);
   const search=await call('search_textbook',{query,limit:5});
   rows.push({chapterId,unitId:unit.unitId,catalogPresent:!!entry,catalogTitle:entry?entry.title:null,
    corpusBlocks:unit.blocks.length,readBlocks:blocks.length,
    exactBody:JSON.stringify(blocks)===JSON.stringify(unit.blocks),
    revisedTextInBody:blocks.some(b=>String(b.text||'').includes(target.newPhrase)),
    revisedFiguresStaged:target.revisedFigureIds.every(id=>(corpus.images||[]).some(i=>i.figureId===stagedFigureId(id))),
    query,searchTop5:search.hits.map(h=>h.unitId),searchHitsUnit:search.hits.some(h=>h.unitId===unit.unitId),
    searchTop1IsUnit:search.hits[0]?.unitId===unit.unitId});
  }
 }
 const absent=[];
 for(const a of absentTargets){
  const inCatalog=catalog.some(e=>e.chapterId===a.chapterId||String(e.chapterId).includes(a.articleId));
  const inCorpus=corpus.units.some(u=>u.chapterId===a.chapterId||String(u.chapterId).includes(a.articleId));
  const hits=await call('search_textbook',{query:a.articleId,limit:5});
  absent.push({...a,inCatalog,inCorpus,searchHits:hits.hits.map(h=>h.unitId)});
 }
 const crossBook={
  nemata215catalog:catalog.filter(e=>String(e.chapterId).includes('chapter03-section027')).map(e=>e.chapterId),
  nemata215corpus:corpus.units.filter(u=>String(u.chapterId).includes('chapter03-section027')).map(u=>u.unitId),
  cn215catalog:catalog.filter(e=>String(e.chapterId).includes('215-4')).map(e=>e.chapterId),
  cn215corpus:corpus.units.filter(u=>String(u.chapterId).includes('215-4')).map(u=>u.chapterId),
  rule:'book+canonical article id is identity; a shared numeric tail is not'};
 const figurePrefixes=targets.map(t=>t.chapterId.replace(/-chapter$/,'-'));
 const images=[];
 for(const image of corpus.images||[]){
  if(!figurePrefixes.some(p=>String(image.figureId||'').startsWith(p)))continue;
  const bytes=await readFile(join(directory,image.path));
  const actual=createHash('sha256').update(bytes).digest('hex');
  images.push({figureId:image.figureId,path:image.path,declared:image.sha256,actual,reachable:true,matches:image.sha256===actual});
 }
 const receipt={schema:'coac250-12th-batch-readback/1',checkedAt:new Date().toISOString(),preview:directory,corpusId:corpus.corpusId,catalogEntries:catalog.length,rows,absent,crossBook,
  images:{checked:images.length,allReachable:images.every(i=>i.reachable&&i.matches),mismatched:images.filter(i=>!i.matches).map(i=>i.path)},
  maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0};
 if(outPath)await writeFile(outPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({catalogEntries:catalog.length,rows:rows.map(r=>({chapter:r.chapterId,unit:r.unitId,catalog:r.catalogPresent,blocks:r.readBlocks,exact:r.exactBody,revisedTextInBody:r.revisedTextInBody,revisedFiguresStaged:r.revisedFiguresStaged,query:r.query,searchTop1IsUnit:r.searchTop1IsUnit})),absent:absent.map(a=>({article:a.articleId,inCatalog:a.inCatalog,inCorpus:a.inCorpus,searchHits:a.searchHits.length})),crossBook,images:receipt.images,maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0},null,1));
}finally{await client.close();}
