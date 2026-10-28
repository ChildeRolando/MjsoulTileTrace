import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const names=['textbook-bodies.json','knowledge-index.json','textbook-corpus.json','knowledge.html','mcp-build.json','textbook-unit-map.json','full-publication.json'];
export const sha=x=>createHash('sha256').update(x).digest('hex');
export const load=async p=>JSON.parse(await readFile(p));
export async function atomic(path,bytes){const temp=path+'.release-'+process.pid;await writeFile(temp,bytes);await rename(temp,path);}
export async function captureBaseline(root,backup){
 await mkdir(backup,{recursive:true});const files=[];
 for(const name of [...names,'publication-in-progress.json','mcp-config.json']){
  let bytes;try{bytes=await readFile(root+'/'+name);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(bytes){await writeFile(backup+'/'+name,bytes,{flag:'wx'});files.push({name,present:true,sha256:sha(bytes)});}else files.push({name,present:false});
 }
 const corpus=await load(root+'/textbook-corpus.json');const result={root,backup,corpusId:corpus.corpusId,units:corpus.units.length,figures:corpus.images.length,files};await writeFile(backup+'/baseline.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
export async function restoreBaseline(baseline){
 const {root,backup}=baseline;
 // Restore original bytes/presence; do not touch old assets or any audit/raw.
 await atomic(root+'/publication-in-progress.json',JSON.stringify({schema:'coach-textbook-publication-journal/1',status:'publishing',rollback:true,restoreFrom:backup})+'\n');
 for(const file of baseline.files.filter(x=>x.name!=='publication-in-progress.json'&&x.name!=='mcp-config.json')){
  if(file.present){const bytes=await readFile(backup+'/'+file.name);assert.equal(sha(bytes),file.sha256);await atomic(root+'/'+file.name,bytes);}else await unlink(root+'/'+file.name).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
 const oldJournal=baseline.files.find(x=>x.name==='publication-in-progress.json');if(oldJournal.present)await atomic(root+'/publication-in-progress.json',await readFile(backup+'/publication-in-progress.json'));else await unlink(root+'/publication-in-progress.json');
 for(const f of baseline.files){if(f.present)assert.equal(sha(await readFile(root+'/'+f.name)),f.sha256,f.name);else await assert.rejects(access(root+'/'+f.name),{code:'ENOENT'});}
 assert.equal((await load(root+'/textbook-corpus.json')).corpusId,baseline.corpusId);return {rolledBack:true,corpusId:baseline.corpusId,originalFileBytesAndPresenceRestored:true,newUnreferencedContentAddressedAssetsRetained:true};
}
