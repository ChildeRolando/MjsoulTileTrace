// COAC-250 eleventh run: independent zero-model-call readback of the delivered preview for the three
// chapters the dispatch named (199-1/chapter03-section013, 142-1/chapter01-section054, 127-1/chapter01-section047),
// which the tenth batch staged, plus explicit absence checks for the four chapters that have passed receipts
// but are not staged (027-1 held by the source-structure hold, and 081-8/089-1/060-1 not in any dispatch yet).
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
 {chapterId:'modern-yabejp-ja-chapter03-section013-chapter',newPhrase:'此前几乎都是两面子余牌形'},
 {chapterId:'modern-yabejp-ja-chapter01-section054-chapter',newPhrase:'摸到其中任意一张也能形成两面听牌'},
 {chapterId:'modern-yabejp-ja-chapter01-section047-chapter',newPhrase:'处于希望避免仅有立直一役的愚形立直的局面'}
];
const absentTargets=[
 {chapterId:'modern-yabejp-ja-chapter01-section010-chapter',articleId:'chapter01-section010',reason:'confirmed_source_definition_boundary_hold'},
 {chapterId:'79-bilibili-cn-cv1721475-chapter',articleId:'cv1721475',reason:'passed 2026-10-27T11:51:50Z, not in the dispatched batch list'},
 {chapterId:'modern-yabejp-ja-chapter01-section031-chapter',articleId:'chapter01-section031',reason:'passed 2026-10-27T12:00:09Z, not in the dispatched batch list'},
 {chapterId:'modern-yabejp-ja-chapter01-section021-06-chapter',articleId:'chapter01-section021-06',reason:'passed 2026-10-27T12:01:14Z, not in the dispatched batch list'}
];
const unitsFor=chapterId=>corpus.units.filter(u=>u.chapterId===chapterId);
const queryFor=(unitId,phrase)=>{
 const unit=corpus.units.find(u=>u.unitId===unitId);
 const block=unit.blocks.find(b=>String(b.text||'').includes(phrase));
 const text=block?block.text:String(block?.text??'');
 const at=text.indexOf(phrase);
 return at>=0?text.slice(Math.max(0,at-2),at+22):phrase.slice(0,24);
};
const client=new Client({name:'coac250-11th-readback',version:'1.0.0'});
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
    corpusBlocks:unit.blocks.length,readBlocks:blocks.length,blockOffsets:blocks.length,
    exactBody:JSON.stringify(blocks)===JSON.stringify(unit.blocks),
    revisedTextInBody:blocks.some(b=>String(b.text||'').includes(target.newPhrase)),
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
 const figurePrefixes=targets.map(t=>t.chapterId.replace(/-chapter$/,'-'));
 const images=[];
 for(const image of corpus.images||[]){
  if(!figurePrefixes.some(p=>String(image.figureId||'').startsWith(p)))continue;
  const bytes=await readFile(join(directory,image.path));
  const actual=createHash('sha256').update(bytes).digest('hex');
  images.push({figureId:image.figureId,path:image.path,declared:image.sha256,actual,reachable:true,matches:image.sha256===actual});
 }
 const receipt={schema:'coac250-11th-batch-readback/1',checkedAt:new Date().toISOString(),preview:directory,corpusId:corpus.corpusId,catalogEntries:catalog.length,rows,absent,
  images:{checked:images.length,allReachable:images.every(i=>i.reachable&&i.matches),mismatched:images.filter(i=>!i.matches).map(i=>i.path)},
  maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0};
 if(outPath)await writeFile(outPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({catalogEntries:catalog.length,rows:rows.map(r=>({chapter:r.chapterId,unit:r.unitId,catalog:r.catalogPresent,blocks:r.readBlocks,exact:r.exactBody,revisedTextInBody:r.revisedTextInBody,query:r.query,searchTop5:r.searchTop5,searchTop1IsUnit:r.searchTop1IsUnit})),absent:absent.map(a=>({article:a.articleId,inCatalog:a.inCatalog,inCorpus:a.inCorpus,searchHits:a.searchHits.length})),images:receipt.images,maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0},null,1));
}finally{await client.close();}
