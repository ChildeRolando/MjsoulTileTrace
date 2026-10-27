// COAC-250 eighth batch: targeted real-stdio-MCP readback for the four newly staged chapters
// (174-1/chapter02-section024, 187-1/chapter03-section006, 198-1/chapter03-section012,
// 215-4/chapter03-section027). Read-only against the accepted preview; writes only its evidence.
import {readFile,writeFile,readFile as rf} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const directory=resolve(process.argv[2]??''),outPath=process.argv[3];
const corpus=JSON.parse(await readFile(join(directory,'corpus-manifest.json'),'utf8').catch(()=>readFile(join(directory,'textbook-corpus.json'),'utf8')));
const cli=repo+'/bin/textbook-mcp-server.mjs';
const targets=[
 {chapterId:'modern-yabejp-ja-chapter02-section024-chapter',newPhrase:'对方处于一向听或已经听牌的可能性会变高'},
 {chapterId:'modern-yabejp-ja-chapter03-section006-chapter',newPhrase:'被切出后，鸣了某张牌，再切出'},
 {chapterId:'modern-yabejp-ja-chapter03-section012-chapter',newPhrase:'那么特殊牌型的可能性就很高了'},
 {chapterId:'modern-yabejp-ja-chapter03-section027-chapter',newPhrase:'若这张牌不是进张完成面子后切出的余牌'}
];
const unitsFor=chapterId=>corpus.units.filter(u=>u.chapterId===chapterId);
const queryFor=(unitId,phrase)=>{
 const unit=corpus.units.find(u=>u.unitId===unitId);
 const block=unit.blocks.find(b=>String(b.text||'').includes(phrase));
 const text=block?block.text:String(block?.text??'');
 const at=text.indexOf(phrase);
 return at>=0?text.slice(Math.max(0,at-2),at+22):phrase.slice(0,24);
};
const client=new Client({name:'coac250-8th-batch-readback',version:'1.0.0'});
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
    corpusBlocks:unit.blocks.length,readBlocks:blocks.length,exactBody:JSON.stringify(blocks)===JSON.stringify(unit.blocks),
    revisedTextInBody:blocks.some(b=>String(b.text||'').includes(target.newPhrase)),
    query,searchTop5:search.hits.map(h=>h.unitId),searchHitsUnit:search.hits.some(h=>h.unitId===unit.unitId)});
  }
 }
 const figurePrefixes=targets.map(t=>t.chapterId.replace(/-chapter$/,'-'));
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
 console.log(JSON.stringify({catalogEntries:catalog.length,rows:rows.map(r=>({chapter:r.chapterId,unit:r.unitId,blocks:r.readBlocks,exact:r.exactBody,revisedTextInBody:r.revisedTextInBody,query:r.query,searchTop5:r.searchTop5,searchHitsUnit:r.searchHitsUnit})),images:receipt.images,maxTextBytes,totalCallMs:Math.round(totalMs),modelCalls:0},null,1));
}finally{await client.close();}
