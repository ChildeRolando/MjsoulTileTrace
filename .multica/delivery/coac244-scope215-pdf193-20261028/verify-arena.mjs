import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const config=JSON.parse(await readFile(join(import.meta.dirname,'config.json'),'utf8'));
const repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const {createTextbookKnowledge}=await import(pathToFileURL(join(repo,'packages/desktop/dist/textbook-knowledge.js')));
const {createArenaTextbookTools}=await import(pathToFileURL(join(repo,'packages/desktop/dist/arena-textbook-tools.js')));
const results=[];
for(const name of ['stage-215','stage-193-supplement']){
 const corpus=JSON.parse(await readFile(join(config.shared,name,'textbook-corpus.json'),'utf8'));
 const caseRef='arena-case:v1:'+randomUUID(),aliases=new Map();
 const tools=createArenaTextbookTools({caseRef,knowledge:createTextbookKnowledge(corpus),aliases:{reference:key=>{if(!aliases.has(key))aliases.set(key,'arena-ref:v1:'+randomUUID());return aliases.get(key);}}});
 const read=tools.find(t=>t.name==='read_textbook'),context={caseRef,signal:new AbortController().signal};
 const r=await read.execute({unitId:corpus.units[0].unitId},context);
 assert.deepEqual(r.result.unit.blocks,corpus.units[0].blocks);
 const expected=name==='stage-215'?1:0;assert.equal(r.sourceRefs.length,expected);assert.equal(read.references(r).sourceRefs.length,expected);
 results.push({stage:name,unitId:corpus.units[0].unitId,blocks:r.result.unit.blocks.length,fullTextExact:true,sourceRefs:r.sourceRefs.length,contentRole:r.result.unit.contentRole??'instruction',modelCalls:0});
}
await writeFile(join(config.shared,'arena-verification.json'),JSON.stringify({modelCalls:0,results},null,2)+'\n');
console.log(JSON.stringify(results));
