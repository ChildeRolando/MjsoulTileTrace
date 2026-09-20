const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, recoverLock, atomicJson, command, makeIO, tick } from './runtime.mjs';
import { GATES, hash } from './protocol.mjs';

const admission={protocol_version:'review-loop/v2',authoritative_spec_paths:['coach/docs/specs/a.md'],rubric:'all criteria'};
const pr=(head='b'.repeat(40),base='a'.repeat(40),marker='live')=>({number:8,state:'open',draft:false,body:'```review-loop-admission\n'+JSON.stringify(admission)+'\n```',base:{sha:base,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:head,ref:'codex/a',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},marker});
const config=dir=>({protocol_version:'review-loop/v2',repository:'ChildeRolando/MjsoulTileTrace',reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project',enabled:true,state_dir:dir,repository_path:dir,gh_path:'gh',git_path:'git',multica_path:'multica',profile:'profile',workspace_id:'workspace'});

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
test('command preserves a nonzero process exit code',async()=>{
  await assert.rejects(()=>command(process.execPath,['-e','process.exit(7)']),error=>error.transport === true && error.exitCode === 7);
});
test('runtime adapter treats both failed ancestry checks as semantic rejection',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-ancestry-'));
  try {
    const old='a'.repeat(40),fixed='b'.repeat(40),current='c'.repeat(40);
    const worktree=path.join(dir,'worktrees',`pr-8-fix-1-${old.slice(0,12)}`);await mkdir(worktree,{recursive:true});
    const job={kind:'fix',round:1,pr_number:8,head_sha:old,worktree};
    const result={data:{head_sha:fixed}},live={head_sha:current};
    for(const failedPair of [[old,fixed],[fixed,current]]) {
      const runner=async(_file,args)=>{
        if(args[0] === 'status')return '';
        if(args[0] === 'rev-parse')return old+'\n';
        if(args[0] === 'fetch')return '';
        if(args[0] === 'merge-base' && args[2] === failedPair[0] && args[3] === failedPair[1]) {
          const error=new Error('not ancestor');error.exitCode=1;error.transport=true;throw error;
        }
        return '';
      };
      const io=makeIO(config(dir),path.join(dir,'state.json'),dir,runner);
      await assert.rejects(()=>io.verifyCheckout(job,result,live),error=>error.transport !== true && /not (descended|reachable)/.test(error.message));
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('runtime adapter pins spec checks to the candidate SHA and rejects missing files and symlinks',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-specs-'));
  try {
    const head='b'.repeat(40),live={head_sha:head,admission};
    for(const treeRow of ['',`120000 blob ${'c'.repeat(40)}\tcoach/docs/specs/a.md\n`]) {
      const calls=[];
      const runner=async(_file,args)=>{
        calls.push(args);
        if(args[0] === 'fetch')return '';
        if(args[0] === 'ls-tree')return treeRow;
        throw new Error(`unexpected command ${args[0]}`);
      };
      const io=makeIO(config(dir),path.join(dir,'state.json'),dir,runner);
      await assert.rejects(()=>io.checkSpecs(live),/spec missing or symlink/);
      assert(calls.some(args=>args[0] === 'ls-tree' && args[1] === head && args[3] === admission.authoritative_spec_paths[0]));
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('ledger-owned PR blocks and publishes failure when admission is removed',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-admission-'));
  try {
    const file=path.join(dir,'pr-8.json'),head='b'.repeat(40),base='a'.repeat(40);
    await atomicJson(file,{protocol_version:'review-loop/v2',pr_number:8,round:1,status:'PASS',history:[],admission_hash:'old',job:{pr_number:8,round:1,head_sha:head,base_sha:base}});
    const removed={...pr(head,base),body:'admission removed'};let published=0;
    const factory=()=>({openPRs:async()=>[removed],live:async()=>removed,save:s=>atomicJson(file,s),publish:async()=>{published++;}});
    const report=await tick(config(dir),factory),saved=JSON.parse(await readFile(file,'utf8'));
    assert.equal(saved.status,'BLOCKED');assert.match(saved.reason,/review-loop-admission/);assert.equal(published,1);
    assert.equal(report.prs[0].status,'BLOCKED');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('stale PASS is persisted and pending publication retries before fallible preparation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-stale-pass-'));
  try {
    const file=path.join(dir,'pr-8.json'),head='b'.repeat(40),oldBase='a'.repeat(40),newBase='c'.repeat(40),live=pr(head,newBase);
    await atomicJson(file,{protocol_version:'review-loop/v2',pr_number:8,round:1,status:'PASS',history:[],admission_hash:hash(JSON.stringify(admission)),job:{pr_number:8,round:1,head_sha:head,base_sha:oldBase}});
    let publications=0,checks=0;
    const factory=()=>({openPRs:async()=>[live],live:async()=>live,snapshot:async value=>({sha256:hash(JSON.stringify(value))}),save:s=>atomicJson(file,s),publish:async()=>{publications++;if(publications === 1){const e=new Error('status unavailable');e.transport=true;throw e;}},checkSpecs:async()=>{checks++;const e=new Error('fetch failed');e.transport=true;throw e;}});
    await tick(config(dir),factory);await tick(config(dir),factory);
    const saved=JSON.parse(await readFile(file,'utf8'));
    assert.equal(saved.status,'STALE');assert.equal(publications,2);assert.equal(checks,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('list, freshness and decision races bind exact live snapshots to history and next job',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-snapshot-'));
  try {
    const file=path.join(dir,'pr-8.json'),base='a'.repeat(40),oldHead='b'.repeat(40),newHead='c'.repeat(40);
    const oldLive=pr(oldHead,base,'initial-live'),decisionLive=pr(newHead,base,'decision-live'),dispatchLive=pr(newHead,base,'dispatch-live');
    const list={...pr('d'.repeat(40),base,'list')};
    const job={kind:'review',round:1,pr_number:8,issue_id:'review-id',agent_id:'reviewer',head_sha:oldHead,base_sha:base};
    await atomicJson(file,{protocol_version:'review-loop/v2',pr_number:8,round:1,status:'REVIEWING',history:[],admission_hash:hash(JSON.stringify(admission)),job});
    const result={protocol_version:'review-loop/v2',pr_number:8,base_sha:base,head_sha:oldHead,round:1,verdict:'NO_P1_P2',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,cmd])=>({id,command:cmd,status:'PASS',exit_code:0})),environment_failures:[]};
    const comment={id:'comment-id',author_type:'agent',author_id:'reviewer',issue_id:'review-id',source_task_id:'run-id',content:'done\n```review-loop-result\n'+JSON.stringify(result)+'\n```'};
    const reads=[oldLive,oldLive,decisionLive,dispatchLive];let read=0;
    const snapshots=[];
    const factory=()=>({
      openPRs:async()=>[list],live:async()=>reads[Math.min(read++,reads.length-1)],snapshot:async value=>{const ref={semantics:'test',sha256:hash(value.marker),marker:value.marker};snapshots.push(ref);return ref;},
      save:s=>atomicJson(file,s),publish:async()=>{},checkSpecs:async()=>{},runs:async()=>[{id:'run-id',issue_id:'review-id',agent_id:'reviewer',status:'completed'}],
      issue:async()=>({id:'review-id',assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[comment],verifyCheckout:async()=>{},archiveResult:async()=>{},
      prepare:async()=>'/worktree',issues:async()=>[],create:async j=>({id:'next-id',identifier:'COAC-21',title:j.title,description:j.description,assignee_id:j.agent_id,assignee_type:'agent',project_id:'project'})
    });
    await tick(config(dir),factory);
    const saved=JSON.parse(await readFile(file,'utf8')),resultEvent=saved.history.find(x=>x.event === 'result'),dispatchEvent=saved.history.at(-1);
    assert.equal(resultEvent.snapshot.marker,'decision-live');assert.equal(saved.job.candidate_snapshot.marker,'decision-live');
    assert.equal(saved.job.dispatch_snapshot.marker,'dispatch-live');assert.equal(dispatchEvent.snapshot.marker,'dispatch-live');
    assert(!snapshots.some(x=>x.marker === 'list'));
  } finally {await rm(dir,{recursive:true,force:true});}
});
