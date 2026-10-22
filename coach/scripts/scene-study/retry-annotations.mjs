import {readdir,mkdir,rename} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {read,exists,save} from './common.mjs';
import {annotate} from './annotate.mjs';
export async function retryAnnotations(out,attempt,run=annotate) {
  out=resolve(out);if(![1,2].includes(attempt))throw new Error('annotation_retry_cap');
  if(await exists(join(out,'automatic/active.lock')))throw new Error('annotation_run_active');
  const dir=join(out,'automatic/runs'),failed=[];
  for(const file of await readdir(dir))if(file.endsWith('.json')&&!file.endsWith('.started.json')){const r=await read(join(dir,file));if(file!==r.caseId+'.json')throw new Error('annotation_retry_file_binding');if(r.status!=='completed')failed.push(r);}
  if(!failed.length)return {retried:0};
  const archive=join(out,'automatic/retries',`attempt-${attempt}`);
  if(await exists(join(archive,'receipt.json')))throw new Error('annotation_retry_already_recorded');
  await mkdir(archive,{recursive:true});
  for(const row of failed){if(!/^[a-f0-9]{24}$/.test(row.caseId))throw new Error('annotation_retry_case_id');for(const suffix of ['.json','.started.json']){
    const source=resolve(dir,row.caseId+suffix),target=resolve(archive,row.caseId+suffix);
    if(!source.startsWith(out+sep)||!target.startsWith(out+sep))throw new Error('annotation_retry_path');
    if(await exists(target))throw new Error('annotation_retry_target_exists');
    if(await exists(source))await rename(source,target);
  }}
  await save(join(archive,'receipt.json'),{at:new Date().toISOString(),attempt,reason:'Retry failed annotation cases only, preserving every earlier response and timeout. Model, prompt and input are unchanged.',cases:failed.map(r=>({caseId:r.caseId,status:r.status}))});
  await run(out,60,3);return {retried:failed.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(await retryAnnotations(process.argv[2],Number(process.argv[3]??1)));
