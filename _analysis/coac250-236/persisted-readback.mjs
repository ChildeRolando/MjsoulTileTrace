import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dir,repo,integration} from './config.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),destination=process.cwd()+'/'+dir+'/persisted-route-stage';
for(const [name,script]of [['mcp',repo+'/scripts/scene-study/verify-textbook-mcp.mjs'],['arena',integration+'/verify-accepted-preview-arena.mjs']]){
 const log=execFileSync(process.execPath,[script,destination],{cwd:repo,encoding:'utf8',windowsHide:true,maxBuffer:2000000});await writeFile(dir+'/persisted-'+name+'.log',log);
}
const mcp=await load(destination+'/mcp-validation.json'),arena=await load(destination+'/arena-validation.json');assert.equal(mcp.units.length,1);assert.equal(mcp.exactImageCount,0);assert.equal(arena.units.length,1);assert.equal(arena.exactBody,true);assert.equal(arena.units[0].reads.reduce((n,r)=>n+r.blocks,0),4);assert.equal(arena.units[0].reads.at(-1).sourceRefs,1);
const before=await load(dir+'/persisted-route-verification.json'),proof={...before,realStdioMcp:{units:1,images:0,blocks:4,allPagedContentExact:true},arena:{units:1,blocks:4,exactBody:true,completeReadSourceRefs:1},newModelCalls:0};await writeFile(dir+'/persisted-route-verification.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
