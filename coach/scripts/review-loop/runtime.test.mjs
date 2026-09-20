const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, recoverLock, atomicJson } from './runtime.mjs';

test('exclusive lock prevents concurrent controllers and can be reacquired',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-lock-'));
  try {
    const outcomes=await Promise.all([acquireLock(dir),acquireLock(dir)]);
    assert.equal(outcomes.filter(Boolean).length,1);
    await assert.rejects(()=>recoverLock(dir),/PID still exists/);
    await outcomes.find(Boolean)();
    const release=await acquireLock(dir);assert(release);await release();
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('atomic ledger replacement survives process-independent reload',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-state-'));
  try {
    const file=path.join(dir,'pr-1.json');await atomicJson(file,{round:1,status:'REVIEWING'});
    await atomicJson(file,{round:2,status:'FIXING'});
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{round:2,status:'FIXING'});
  } finally {await rm(dir,{recursive:true,force:true});}
});
