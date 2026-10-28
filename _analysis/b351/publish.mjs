import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='_analysis/b351',base='E:/AgentData/Coach/knowledge/processing/integration',load=async p=>JSON.parse(await readFile(p)),sha=x=>createHash('sha256').update(x).digest('hex'),save=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n'),atomic=async(p,x)=>{const t=p+'.tmp-'+process.pid;await writeFile(t,typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');await rename(t,p);},pre=await load(dir+'/pre.json'),assembly=await load(dir+'/assembly.json'),proof=await load(dir+'/readback.json'),lock=base+'/accepted-consumer.lock';
assert.equal(proof.allPassed,true);assert.equal(proof.preview.corpusId,assembly.corpusId);
await writeFile(lock,JSON.stringify({pid:process.pid,scope:'Existing250 publish already-built fully-read-back preview; no rebuild'})+'\n',{flag:'wx'});
try{
 for(const f of [...['pointer','variants','builder','webSelection'].map(k=>pre.before[k]),...pre.protectedFiles])assert.equal(sha(await readFile(f.path)),f.sha256,f.path);
 for(const n of ['selection-maintainer.lock.json','ACCEPTED-CONSUMER-STOP'])await assert.rejects(access(base+'/'+n),{code:'ENOENT'});
 const output=assembly.output,receipt=await load(output+'/accepted-preview-receipt.json');assert.equal(receipt.corpusId,assembly.corpusId);
 const bytes=await readFile(dir+'/variants.after.json'),vp=base+'/specific-web-variant-selection.v35.json',builder=await readFile(dir+'/builder.after.mjs','utf8');
 await writeFile(vp,bytes,{flag:'wx'});await atomic(pre.before.builder.path,builder);await save(dir+'/publication.json',{phase:'validated-before-pointer',output,selection:{path:vp,sha256:sha(bytes)}});
 await atomic(pre.before.pointer.path,receipt);await atomic(pre.before.webSelection.path,{...(await load(pre.before.webSelection.path)),recordedAt:receipt.createdAt,previewReceiptPath:output+'/accepted-preview-receipt.json',previewReceiptSha256:sha(await readFile(output+'/accepted-preview-receipt.json')),corpusId:assembly.corpusId,candidates:receipt.selectedWeb,pending:receipt.pendingWeb});
 await save(dir+'/publication.json',{phase:'published',output,selection:{path:vp,sha256:sha(bytes)},pointerSha256:sha(await readFile(pre.before.pointer.path)),reusedVerifiedOutput:true});console.log('Published existing verified output v35 without rebuild');
}finally{assert.equal((await load(lock)).pid,process.pid);await unlink(lock);}
