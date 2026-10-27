import assert from 'node:assert/strict';
import {readFile, writeFile, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir='_analysis/coac250-b8-jpeg',root='E:/AgentData/Coach/knowledge/processing',integration=root+'/integration';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const proof=await load(dir+'/readback.json'),coverage=await load(dir+'/coverage.json'),pre=await load(dir+'/preconsume.json');
const pointer=await load(integration+'/accepted-preview-current.json'),register=await load(coverage.register.path),before=await load(coverage.register.backup);
assert.equal(pointer.corpusId,proof.preview.corpusId);assert.equal(sha(await readFile(coverage.register.path)),coverage.register.afterSha256);
assert.equal(sha(await readFile(coverage.register.backup)),coverage.register.beforeSha256);
const targets=new Set(pre.items.map(i=>i.chapterId));
for(const row of before.rows)if(!targets.has(row.originalChapterId))assert.deepEqual(register.rows.find(r=>r.originalChapterId===row.originalChapterId),row);
assert.equal(register.counts.effectiveCoveredOriginalChapters,222);assert.equal(register.remainingTypes.total,34);
for(const file of pre.protectedFiles)assert.equal(sha(await readFile(file.path)),file.sha256,file.path);
assert.equal(sha(await readFile(pointer.formalCorpusPath)),proof.formalSha256);
for(const path of [integration+'/accepted-consumer.lock',integration+'/selection-maintainer.lock.json']){
 try{await access(path);assert.fail('writer lock remains: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}
}
const diff=spawnSync('git',['apply','--check','--reverse','--ignore-space-change',process.cwd()+'/'+dir+'/compatibility.patch'],{cwd:'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach',encoding:'utf8',windowsHide:true});assert.equal(diff.status,0,diff.stderr);
const result={recordedAt:new Date().toISOString(),corpusId:pointer.corpusId,registerSha256:coverage.register.afterSha256,unchangedNonTargetRegisterRows:before.rows.length-targets.size,protectedInputsUnchanged:pre.protectedFiles.length,formalSha256:proof.formalSha256,writerLocksAbsent:true,installedPatchReverseCheck:true,modelCalls:0};
await writeFile(dir+'/final-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
