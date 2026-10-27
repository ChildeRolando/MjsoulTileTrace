import assert from 'node:assert/strict';
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const dir='_analysis/coac250-b8-jpeg',repo='E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach';
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const receipt=await load(dir+'/install-receipt.json'),coverage=await load(dir+'/coverage.json');
assert.equal(sha(await readFile(receipt.stage.path)),receipt.stage.afterSha256);
assert.equal(sha(await readFile(receipt.owner.path)),receipt.owner.afterSha256);
assert.equal(sha(await readFile(repo+'/scripts/textbook-processing/stage-web-image.py')),receipt.workerSha256);
const patches=spawnSync('python',['-c',`import difflib,pathlib
p=pathlib.Path('${dir}')
items=[('stage-web-textbook.before.mjs','stage-web-textbook.after.mjs','scripts/textbook-processing/stage-web-textbook.mjs'),('stage-web-textbook.test.before.mjs','stage-web-textbook.test.after.mjs','scripts/textbook-processing/stage-web-textbook.test.mjs'),('owner.before.md','owner.after.md','docs/plans/2026-10-24-full-textbook-processing.md')]
out=''
for before,after,name in items:
 out+=''.join(difflib.unified_diff((p/before).read_text(encoding='utf-8').splitlines(True),(p/after).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+name,tofile='b/'+name))
name='scripts/textbook-processing/stage-web-image.py'
out+=''.join(difflib.unified_diff([], (p/'stage-web-image.py').read_text(encoding='utf-8').splitlines(True),fromfile='/dev/null',tofile='b/'+name))
(p/'compatibility.patch').write_text(out,encoding='utf-8')`],{encoding:'utf8',windowsHide:true});assert.equal(patches.status,0,patches.stderr);
const checks=[
 ['compatibility',process.execPath,['--test',dir+'/compatibility.test.mjs'],process.cwd()],
 ['stage-regressions',process.execPath,['node_modules/vitest/vitest.mjs','run','scripts/textbook-processing/stage-web-textbook.test.mjs','scripts/textbook-processing/stage-web-tables.test.mjs','scripts/textbook-processing/stage-inline-chunks.test.mjs','--no-file-parallelism','--testTimeout','30000'],repo],
 ['architecture',process.execPath,['scripts/check-architecture.mjs'],repo],
 ['package-smoke',process.execPath,['--test','smoke/package-import-smoke.mjs'],repo],
 ['desktop-types',process.execPath,['node_modules/typescript/bin/tsc','--noEmit','-p','packages/desktop/tsconfig.json'],repo]
];
const results=[];
for(const [name,exe,args,cwd] of checks){
 const result=spawnSync(exe,args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 await writeFile(dir+'/'+name+'.log',(result.stdout??'')+(result.stderr??''));
 results.push({name,command:[exe,...args],cwd,exitCode:result.status,log:name+'.log'});
 assert.equal(result.status,0,name+': '+(result.stderr??''));
}
const pointer=await load('E:/AgentData/Coach/knowledge/processing/integration/accepted-preview-current.json');
assert.equal(pointer.corpusId,coverage.preview.corpusId);
for(const [i,item] of (await load(dir+'/preconsume.json')).items.entries()){
 const selected=pointer.selectedWeb.find(s=>s.candidateSha256===item.candidateSha256);
 await copyFile(selected.stageReceiptPath,dir+'/stage-'+(i===0?'128':'145')+'.json');
}
for(const file of ['mcp-validation.json','arena-validation.json','source-deduplication-validation.json'])await copyFile(pointer.output+'/'+file,dir+'/'+file);
await writeFile(dir+'/tests.json',JSON.stringify({recordedAt:new Date().toISOString(),checks:results,allPassed:true,modelCalls:0},null,2)+'\n');
console.log(JSON.stringify({checks:results.map(r=>({name:r.name,exitCode:r.exitCode})),coverage:coverage.coverage,corpusId:pointer.corpusId}));
