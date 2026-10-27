// COAC-250 sixth batch: targeted real-stdio-MCP readback for the two newly staged chapters
// (227-1 / 246-1). Read-only against the accepted preview; writes only its own evidence.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const directory=resolve(process.argv[2]??''),outPath=process.argv[3];
const corpus=JSON.parse(await readFile(join(directory,'corpus-manifest.json'),'utf8').catch(()=>readFile(join(directory,'textbook-corpus.json'),'utf8')));
const cli=repo+'/bin/textbook-mcp-server.mjs';
const targetChapters=[
 {chapterId:'modern-yabejp-ja-chapter04-section007-chapter',query:'速攻の局面 確和了 和了で順位を確定'},
 {chapterId:'modern-yabejp-ja-chapter06-section002-chapter',query:'何切る 議論 ３０秒未満 手番'},
];
const unitsFor=chapterId=>corpus.units.filter(u=>u.chapterId===chapterId);
const client=new Client({name:'coac250-6th-batch-readback',version:'1.0.0'});
const rows=[];let maxTextBytes=0,totalMs=0;
async function call(name,args){const start=performance.now();const r=await client.callTool({name,arguments:args});totalMs+=performance.now()-start;maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(r.content.find(x=>x.type==='text').text));return JSON.parse(r.content.find(x=>x.type==='text').text);}
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,directory],stderr:'pipe'}));
 const catalog=[];let offset=0;
 do{const d=await call('catalog_textbook',{offset,limit:20});catalog.push(...d.entries);offset=d.nextOffset;}while(offset!==null);
 for(const t of targetChapters){
  const entry=catalog.find(e=>e.chapterId===t.chapterId);
  for(const unit of unitsFor(t.chapterId)){
   const blocks=[];let blockOffset=0;
   do{const d=await call('read_textbook',{unitId:unit.unitId,blockOffset});blocks.push(...d.unit.blocks);blockOffset=d.nextBlockOffset;}while(blockOffset!==null);
   const search=await call('search_textbook',{query:t.query,limit:5});
   rows.push({chapterId:t.chapterId,unitId:unit.unitId,catalogPresent:!!entry,catalogTitle:entry?entry.title:null,
    corpusBlocks:unit.blocks.length,readBlocks:blocks.length,exactBody:JSON.stringify(blocks)===JSON.stringify(unit.blocks),
    searchTop5:search.hits.map(h=>h.unitId),searchHitsUnit:search.hits.some(h=>h.unitId===unit.unitId)});
  }
 }
 // every image belonging to the two new chapters must be reachable on disk with its recorded sha256
 const {createHash}=await import('node:crypto');
 const {readFile:rf}=await import('node:fs/promises');
 const newUnitIds=new Set(targetChapters.flatMap(t=>unitsFor(t.chapterId).map(u=>u.unitId)));
 const figurePrefixes=['modern-yabejp-ja-chapter04-section007-','modern-yabejp-ja-chapter06-section002-'];
 const images=[];
 for(const image of corpus.images||[]){
  if(!figurePrefixes.some(p=>String(image.figureId||'').startsWith(p)))continue;
  const bytes=await rf(join(directory,image.path));
  const actual=createHash('sha256').update(bytes).digest('hex');
  images.push({figureId:image.figureId,path:image.path,declared:image.sha256,actual,reachable:true,matches:image.sha256===actual});
 }
 const receipt={checkedAt:new Date().toISOString(),preview:directory,corpusId:corpus.corpusId,catalogEntries:catalog.length,rows,
  images:{checked:images.length,allReachable:images.every(i=>i.reachable&&i.matches),mismatched:images.filter(i=>!i.matches).map(i=>i.path)},
  maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0};
 if(outPath)await writeFile(outPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({catalogEntries:catalog.length,rows:rows.map(r=>({chapter:r.chapterId,unit:r.unitId,blocks:r.readBlocks,exact:r.exactBody,searchTop5:r.searchHitsUnit})),images:receipt.images,maxTextBytes,modelCalls:0},null,1));
}finally{await client.close();}
