// Reuse the complete unpublished assembly after correcting only a readback assertion
// about the existing rendering of candidate unknowns in figure transcriptions. No chapter is staged a second time.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,access,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {updateBuilder} from './builder-patch.mjs';
import {dir,integration,article} from './config.mjs';
const load=async p=>JSON.parse(await readFile(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const pre=await load(dir+'/preconsume.json'),assembly=await load(dir+'/assembly.json'),output=assembly.output,receipt=await load(output+'/accepted-preview-receipt.json');
const selected=receipt.selectedWeb.find(s=>s.candidateSha256===pre.candidate.sha256),{inlineCompatibility,displaySegmentsProof,intakeAnnotations}=selected;
const lock=integration+'/accepted-consumer.lock';await writeFile(lock,JSON.stringify({pid:process.pid,scope:'COAC-250 162-3 resume already assembled preview',startedAt:new Date().toISOString()})+'\n',{flag:'wx'});
const atomic=async(path,value)=>{const temp=path+'.tmp-'+process.pid;await writeFile(temp,typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value,null,2)+'\n');await rename(temp,path);};
const unchanged=async()=>{for(const path of [integration+'/ACCEPTED-CONSUMER-STOP',integration+'/selection-maintainer.lock.json']){try{await access(path);assert.fail('stop or other writer: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}}for(const f of pre.protectedFiles)assert.equal(sha(await readFile(f.path)),f.sha256,f.path);assert.equal(sha(await readFile(integration+'/accepted-preview-current.json')),pre.prior.sha256);for(const c of Object.values(pre.configs))assert.equal(sha(await readFile(c.path)),c.sha256,c.path);};
try{
 await unchanged();assert.equal(receipt.incrementalAssembly.retainedUnits,236);assert.deepEqual(receipt.incrementalAssembly.addedChapters,['79-cn-chapter-162-3']);
 const result=spawnSync(process.execPath,[dir+'/readback.mjs',output],{windowsHide:true,encoding:'utf8',maxBuffer:2*1024*1024});await writeFile(dir+'/target-readback-corrected.log',(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,result.stderr?.slice(-2500));
 await unchanged();
 const v19=await load(pre.configs.variants.path);assert.equal(v19.jobs.some(j=>j.articleId===article),false);
 const newJob={sourceId:'79-bilibili-cn',articleId:article,candidatePath:pre.candidate.path,candidateSha256:pre.candidate.sha256,sourceSha256:pre.source.sha256,selectionReason:'162-3: only authorized inline Japanese span translated; frozen v2 gate and bound shadow stager preserve all display emphasis, parent image audit and source-note. No integration model call.',inlineCompatibility,displaySegmentsProof,intakeAnnotations};
 const v20={...v19,recordedAt:new Date().toISOString(),previousSelection:pre.configs.variants,jobs:[...v19.jobs,newJob]},v20Path=integration+'/specific-web-variant-selection.v20.json';
 await writeFile(v20Path,JSON.stringify(v20,null,2)+'\n',{flag:'wx'});await copyFile(v20Path,dir+'/variants.after.json');const v20Sha=sha(await readFile(v20Path));
 const nextBuilder=updateBuilder(await readFile(pre.configs.builder.path,'utf8'),pre,v20Sha);await atomic(pre.configs.builder.path,nextBuilder);await writeFile(dir+'/builder.after.mjs',nextBuilder);
 await atomic(dir+'/publication-journal.json',{phase:'validated-before-pointer',output,v20Sha,priorPointerSha256:pre.prior.sha256,reusedUnpublishedAssembly:true});
 await atomic(integration+'/accepted-preview-current.json',receipt);await atomic(integration+'/current-web-candidate-selection.json',{schema:'coach-textbook-web-candidate-selection/1',recordedAt:receipt.createdAt,selectionScope:'independently verified and staged accepted subset; not full textbook publication',previewReceiptPath:output+'/accepted-preview-receipt.json',previewReceiptSha256:sha(await readFile(output+'/accepted-preview-receipt.json')),corpusId:receipt.corpusId,candidates:receipt.selectedWeb,pending:receipt.pendingWeb,modelCalls:0});
 await atomic(dir+'/publication-journal.json',{phase:'published',output,pointerSha256:sha(await readFile(integration+'/accepted-preview-current.json')),v20Sha,reusedUnpublishedAssembly:true});console.log(JSON.stringify({chapters:receipt.chapters,units:receipt.units,blocks:receipt.blocks,figures:receipt.figures,output,v20Sha}));
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
