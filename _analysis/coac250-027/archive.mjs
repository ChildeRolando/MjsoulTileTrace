import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile,mkdir,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {repo,dir,integration,article} from './config.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const pre=await load(dir+'/preconsume.json'),coverage=await load(dir+'/coverage.json'),proof=await load(dir+'/readback.json'),pointer=await load(integration+'/accepted-preview-current.json');assert.equal(pointer.corpusId,proof.preview.corpusId);
const results=[];
for(const [name,args] of [['definition-regressions',['node_modules/vitest/vitest.mjs','run','scripts/textbook-processing/stage-definition-boundaries.test.mjs','scripts/scene-study/textbook-audit-definition.test.mjs','--no-file-parallelism','--testTimeout','30000']],['guard-syntax',['--check',integration+'/stage-definition-chapters.mjs']],['builder-syntax',['--check',integration+'/build-accepted-preview.mjs']]]){
 const r=spawnSync(process.execPath,args,{cwd:repo,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});await writeFile(dir+'/'+name+'.log',(r.stdout??'')+(r.stderr??''));assert.equal(r.status,0,name+': '+r.stderr);results.push({name,args,exitCode:r.status,log:name+'.log'});
}
for(const file of ['mcp-validation.json','arena-validation.json','source-deduplication-validation.json'])await copyFile(pointer.output+'/'+file,dir+'/'+file);
const patches=spawnSync('python',['-c',`import pathlib,difflib
p=pathlib.Path('${dir}')
items=[('guard.before.mjs','guard.after.mjs','integration/stage-definition-chapters.mjs'),('builder.before.mjs','builder.after.mjs','integration/build-accepted-preview.mjs'),('manifest.before.json','manifest.after.json','integration/definition-boundaries-v1/manifest.v2.json'),('definitionSelection.before.json','definitionSelection.after.json','integration/definition-boundary-stage-selection.json'),('owner.before.md','owner.after.md','docs/plans/2026-10-24-full-textbook-processing.md')]
out=''
for a,b,name in items:
 out+=''.join(difflib.unified_diff((p/a).read_text(encoding='utf-8').splitlines(True),(p/b).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+name,tofile='b/'+name))
with (p/'bounded-closure.patch').open('w',encoding='utf-8',newline='') as f:f.write(out)`],{encoding:'utf8',windowsHide:true});assert.equal(patches.status,0,patches.stderr);
// Persist operational history in the data root as well as on the delivered branch.
const history=integration+'/coac250-027-history-20261027';await mkdir(history,{recursive:false});
const hashes={};for(const name of (await readdir(dir)).filter(n=>/\.before\./.test(n))){const bytes=await readFile(dir+'/'+name);await writeFile(history+'/'+name,bytes,{flag:'wx'});hashes[name]=sha(bytes);}
await writeFile(history+'/history.json',JSON.stringify({createdAt:new Date().toISOString(),hashes,oldSidecarPath:pre.sidecar.oldPath,oldSidecarSha256:pre.sidecar.oldSha256},null,2)+'\n');
for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);assert.equal(sha(await readFile(coverage.register.path)),coverage.register.afterSha256);
const before=await load(coverage.register.backup),current=await load(coverage.register.path);for(const row of before.rows.filter(r=>r.originalChapterId!=='nemata-jp-chapter-027-1'))assert.deepEqual(current.rows.find(r=>r.originalChapterId===row.originalChapterId),row);
assert.deepEqual((await readdir(integration)).filter(n=>/(?:\.lock(?:\.json)?|selection.*lock)$/.test(n)),[]);
const builder=await readFile(integration+'/build-accepted-preview.mjs','utf8');assert.ok(builder.includes(sha(await readFile(integration+'/definition-boundary-stage-selection.json'))));assert.ok(builder.includes(sha(await readFile(integration+'/specific-web-variant-selection.v14.json'))));
const files={};for(const n of ['bounded-closure.patch','guard.after.mjs','builder.after.mjs','manifest.after.json','definitionSelection.after.json','variants.after.json','owner.after.md','stage-proof.json','stage-receipt.json','readback.json','coverage.json'])files[n]=sha(await readFile(dir+'/'+n));
const result={recordedAt:new Date().toISOString(),checks:results,allPassed:true,coverage:coverage.coverage,history,files,oldSidecarPreserved:true,protectedInputsUnchanged:pre.protectedFiles.length,unchangedOtherRegisterRows:before.rows.length-1,otherHoldFileUnchanged:true,builderPinsVerified:true,writerLocksAbsent:true,activeLibraryChanged:false,modelCalls:0,productionCalls:0};await writeFile(dir+'/final-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,files:undefined}));
