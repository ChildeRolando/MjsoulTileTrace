import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {TextbookMcpClient} from '@riichi-coach/desktop/textbook-mcp';
import {createArenaTextbookTools} from '@riichi-coach/desktop/arena-textbook-tools';
import {ArenaRunAliasVault} from '@riichi-coach/desktop/blind-discard-arena';

const directory=resolve(process.argv[2]??''),corpus=JSON.parse(await readFile(join(directory,'textbook-corpus.json'),'utf8'));
const client=new TextbookMcpClient(),aliases=new ArenaRunAliasVault(),caseRef=aliases.caseRef('offline-textbook-transcription-validation');
const tools=createArenaTextbookTools({caseRef,aliases,knowledge:client}),context={caseRef,signal:new AbortController().signal};
const checks=[];
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../../bin/textbook-mcp-server.mjs',import.meta.url)),directory],stderr:'pipe'}));
 for(const unit of corpus.units){
  let offset=0,blocks=[],read;do{read=await tools[1].execute({unitId:unit.unitId,blockOffset:offset},context);blocks.push(...read.result.unit.blocks);offset=read.result.nextBlockOffset;}while(offset!==null);
  assert.deepEqual(blocks,unit.blocks);assert.equal(tools[1].references(read).sourceRefs.length,1);
  for(const b of unit.blocks.filter(b=>b.type==='figure')){
   const expected=b.figure;
   assert.ok(expected.transcription);assert.equal(expected.requiresImageForFullExample,false);
   const detail=await tools[2].execute({figureId:b.id},context);
   assert.deepEqual(detail.result.figure,expected);
   assert.equal(detail.imageDelivery,'not-delivered-text-only');
   assert.equal(tools[2].references(detail).sourceRefs.length,1);assert.deepEqual(tools[2].references(detail).evidenceRefs,[]);
   checks.push({figureId:b.id,unitId:unit.unitId,kind:expected.transcription.diagram?'diagram':expected.transcription.hand?'hand':expected.transcription.text?'text':'table',exactInParent:true,exactInFigureTool:true,requiresImage:false,unknownTileCount:expected.transcription.diagram?.hiddenTileCount??0});
  }
 }
 assert.equal(checks.length,corpus.images.length);
 const receipt={checkedAt:new Date().toISOString(),corpusId:corpus.corpusId,bodySha256:corpus.bodySha256,transport:'actual stdio MCP -> typed client -> Arena tools',checks,completeTextFigures:checks.length,imageOnlyFigures:0,modelExperimentCalls:0,modelExperimentTokens:0};
 await writeFile(join(directory,'arena-figure-validation.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({completeTextFigures:checks.length,imageOnlyFigures:0,modelExperimentCalls:0}));
}finally{await client.close();}
