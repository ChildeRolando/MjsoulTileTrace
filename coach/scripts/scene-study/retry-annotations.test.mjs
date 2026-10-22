import {test,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {save,read,exists} from './common.mjs';
import {retryAnnotations} from './retry-annotations.mjs';
test('retry archives exact failure and start records while preserving completed cases',async()=>{
  const out=await mkdtemp(join(tmpdir(),'coach-annotation-retry-')),failed='a'.repeat(24),complete='b'.repeat(24),dir=join(out,'automatic/runs');
  const failure={caseId:failed,status:'timeout',result:{failureCode:'timeout'},request:{visible:'test'}},started={startedAt:'2026-10-23T00:00:00Z'},success={caseId:complete,status:'completed'};
  try{await save(join(dir,failed+'.json'),failure);await save(join(dir,failed+'.started.json'),started);await save(join(dir,complete+'.json'),success);let calls=0;
    expect(await retryAnnotations(out,1,async(root,count,concurrency)=>{calls++;expect(root).toBe(out);expect([count,concurrency]).toEqual([60,3]);expect(await exists(join(dir,failed+'.json'))).toBe(false);})).toEqual({retried:1});
    expect(calls).toBe(1);expect(await read(join(out,'automatic/retries/attempt-1',failed+'.json'))).toEqual(failure);expect(await read(join(out,'automatic/retries/attempt-1',failed+'.started.json'))).toEqual(started);expect(await read(join(dir,complete+'.json'))).toEqual(success);
  }finally{await rm(out,{recursive:true,force:true});}
});
test('active annotation and retry cap fail before archive mutation',async()=>{const out=await mkdtemp(join(tmpdir(),'coach-annotation-lock-'));try{await save(join(out,'automatic/active.lock'),{pid:1});await expect(retryAnnotations(out,1)).rejects.toThrow('annotation_run_active');await expect(retryAnnotations(out,3)).rejects.toThrow('annotation_retry_cap');expect(await exists(join(out,'automatic/retries/attempt-1/receipt.json'))).toBe(false);}finally{await rm(out,{recursive:true,force:true});}});
