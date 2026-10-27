// COAC-250: targeted real-stdio-MCP readback for the five newly staged chapters.
// Read-only against the accepted preview; writes only its own evidence file.
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const directory=resolve(process.argv[2]??''),outPath=process.argv[3];
const corpus=JSON.parse(await readFile(join(directory,'textbook-corpus.json'),'utf8'));
const cli='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/bin/textbook-mcp-server.mjs';
const targets=[
 {unitId:'modern-yabejp-ja-chapter03-section011-argument',chapterId:'modern-yabejp-ja-chapter03-section011-chapter',query:'拆嵌张时从内侧开始打，听两面的可能性'},
 {unitId:'modern-yabejp-ja-chapter04-section016-argument',chapterId:'modern-yabejp-ja-chapter04-section016-chapter',query:'供托与积棒的应对'},
 {unitId:'modern-yabejp-ja-chapter01-section049-argument',chapterId:'modern-yabejp-ja-chapter01-section049-chapter',query:'两面子余剰牌形'},
 {unitId:'79-bilibili-cn-cv1726202-argument',chapterId:'79-bilibili-cn-cv1726202-chapter',query:'断幺 手役 对子'},
 {unitId:'79-cn-chapter-260-18-unit-1',chapterId:'79-cn-chapter-260-18',query:'ALL LAST 状况判断'},
];
const client=new Client({name:'coac250-targeted-readback',version:'1.0.0'});
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
