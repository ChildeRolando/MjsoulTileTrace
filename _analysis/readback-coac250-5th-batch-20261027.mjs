// COAC-250 fifth batch: targeted real-stdio-MCP readback for the three newly staged chapters
// (211-1 / 173-1 / 116-1). Read-only against the accepted preview; writes only its own evidence.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const directory=resolve(process.argv[2]??''),outPath=process.argv[3];
const corpus=JSON.parse(await readFile(join(directory,'textbook-corpus.json'),'utf8'));
const cli='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/bin/textbook-mcp-server.mjs';
const targets=[
 {unitId:'modern-yabejp-ja-chapter03-section024-argument',chapterId:'modern-yabejp-ja-chapter03-section024-chapter',query:'反射读牌 从其他玩家打出的牌推测牌山'},
 {unitId:'modern-yabejp-ja-chapter02-section023-argument',chapterId:'modern-yabejp-ja-chapter02-section023-chapter',query:'副露后的听牌判断 中张牌手出'},
 {unitId:'modern-yabejp-ja-chapter01-section041-argument',chapterId:'modern-yabejp-ja-chapter01-section041-chapter',query:'后后付 役牌孤立牌 先鸣牌确保面子'},
];
const client=new Client({name:'coac250-5th-batch-readback',version:'1.0.0'});
const rows=[];let maxTextBytes=0,totalMs=0;
async function call(name,args){const start=performance.now();const r=await client.callTool({name,arguments:args});totalMs+=performance.now()-start;maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(r.content.find(x=>x.type==='text').text));return JSON.parse(r.content.find(x=>x.type==='text').text);}
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,directory],stderr:'pipe'}));
 const catalog=[];let offset=0;
 do{const d=await call('catalog_textbook',{offset,limit:20});catalog.push(...d.entries);offset=d.nextOffset;}while(offset!==null);
 for(const t of targets){
  const entry=catalog.find(e=>e.chapterId===t.chapterId);
  const unit=corpus.units.find(u=>u.unitId===t.unitId);
  const blocks=[];let blockOffset=0;
  do{const d=await call('read_textbook',{unitId:t.unitId,blockOffset});blocks.push(...d.unit.blocks);blockOffset=d.nextBlockOffset;}while(blockOffset!==null);
  const search=await call('search_textbook',{query:t.query,limit:3});
  rows.push({chapterId:t.chapterId,unitId:t.unitId,catalogPresent:!!entry,catalogTitle:entry?entry.title:null,corpusBlocks:unit?unit.blocks.length:null,readBlocks:blocks.length,exactBody:JSON.stringify(blocks)===JSON.stringify(unit?unit.blocks:null),searchTop3:search.hits.map(h=>h.unitId),searchHitsChapter:search.hits.some(h=>h.unitId===t.unitId)});
 }
 const receipt={checkedAt:new Date().toISOString(),preview:directory,corpusId:corpus.corpusId,catalogEntries:catalog.length,rows,maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0};
 if(outPath)await writeFile(outPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({catalogEntries:catalog.length,rows:rows.map(r=>({chapter:r.chapterId,blocks:r.readBlocks,exact:r.exactBody,search:r.searchHitsChapter})),maxTextBytes,modelCalls:0}));
}finally{await client.close();}
