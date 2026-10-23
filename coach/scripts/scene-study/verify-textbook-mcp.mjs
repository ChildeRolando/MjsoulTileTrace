import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const directory=resolve(process.argv[2]??''),corpus=JSON.parse(await readFile(join(directory,'textbook-corpus.json'),'utf8'));
const cli=fileURLToPath(new URL('../../bin/textbook-mcp-server.mjs',import.meta.url));
const client=new Client({name:'textbook-offline-validation',version:'1.0.0'});
const queries=[
 ['七对子已经听牌，碰牌返回两向听','pairs-six'],
 ['七对子一向听转对对和，有3900点以上收入，巡目尚早','pairs-five'],
 ['单骑听牌，客风字牌','pairs-waits'],
 ['三副露的听牌判断','open-tenpai'],
 ['碰了宝牌，满贯，副露手打点','open-value'],
 ['后附，役牌的生牌','open-danger'],
 ['赤牌、宝牌4饼、打7饼','nemata-dora'],
 ['第10巡以后维持向听数','nemata-shanten-back'],
];
const checks=[],diagnostics=[];let sourceImages=0,maxTextBytes=0,totalCallMs=0;
async function call(name,args){const start=performance.now();const r=await client.callTool({name,arguments:args});totalCallMs+=performance.now()-start;assert.notEqual(r.isError,true);const text=r.content.find(x=>x.type==='text').text;maxTextBytes=Math.max(maxTextBytes,Buffer.byteLength(text));return {raw:r,data:JSON.parse(text)};}
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,directory],stderr:'pipe'}));
 const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(x=>x.name),['search_textbook','read_textbook','view_textbook_figure','catalog_textbook']);
 const catalog=[];let catalogOffset=0;
 do{const {data}=await call('catalog_textbook',{offset:catalogOffset,limit:20});catalog.push(...data.entries);catalogOffset=data.nextOffset;}while(catalogOffset!==null);
 assert.equal(catalog.length,new Set(corpus.units.map(u=>u.chapterId)).size);
 for(const unit of corpus.units){let offset=0,blocks=[];do{const {data}=await call('read_textbook',{unitId:unit.unitId,blockOffset:offset});assert.equal(data.blockOffset,offset);assert.equal(data.completeArgument,offset===0&&data.unit.blocks.length===unit.blocks.length);blocks.push(...data.unit.blocks);offset=data.nextBlockOffset;}while(offset!==null);assert.deepEqual(blocks,unit.blocks);checks.push({unitId:unit.unitId,blocks:unit.blocks.length,sourcePages:unit.source.pages,exactBody:true});}
 for(const image of corpus.images){const r=await call('view_textbook_figure',{figureId:image.figureId}),content=r.raw.content.find(x=>x.type==='image');assert.ok(content);assert.equal(createHash('sha256').update(Buffer.from(content.data,'base64')).digest('hex'),image.sha256);sourceImages++;}
 for(const [query,expected] of queries.filter(([,id])=>corpus.units.some(u=>u.unitId===id))){const {data}=await call('search_textbook',{query,limit:3});diagnostics.push({query,expectedUnit:expected,returnedUnits:data.hits.map(x=>x.unitId),expectedWithinTop3:data.hits.some(x=>x.unitId===expected)});}
 const noHit=(await call('search_textbook',{query:'zzzznomatchingconcept',limit:3})).data;assert.equal(noHit.status,'no_hits');assert.equal(noHit.hits.length,0);
 const sample=await call('read_textbook',{unitId:corpus.units.find(u=>u.unitId==='pairs-five')?.unitId??corpus.units[0].unitId});await writeFile(join(directory,'mcp-read-example.json'),JSON.stringify(sample.data,null,2)+'\n');
 const config={mcpServers:{'coach-textbook':{command:process.execPath,args:[cli,directory]}}};await writeFile(join(directory,'mcp-config.json'),JSON.stringify(config,null,2)+'\n');
 const receipt={checkedAt:new Date().toISOString(),corpusId:corpus.corpusId,toolNames:tools.map(t=>t.name),units:checks,exactImageCount:sourceImages,maxTextBytes,totalCallMs:Math.round(totalCallMs),diagnosticSearches:diagnostics,diagnosticNote:'Hand-authored developer probes, not expert retrieval evaluation or model experiment.',noHitExplicit:true,modelCalls:0,modelTokens:0};
 await writeFile(join(directory,'mcp-validation.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({units:checks.length,images:sourceImages,maxTextBytes,diagnosticHits:diagnostics.filter(d=>d.expectedWithinTop3).length,diagnosticQueries:diagnostics.length,modelCalls:0}));
}finally{await client.close();}
