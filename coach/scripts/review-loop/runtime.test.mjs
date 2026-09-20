const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, recoverLock, atomicJson, command, makeIO, tick } from './runtime.mjs';
import { GATES, hash, admit, VERSION } from './protocol.mjs';
import { captureDurability } from './controller.mjs';

test('real Git durable verification requires pushed, changed regular artifacts and exact hashes',{timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-durable-git-'));
  try {
    const repo=path.join(dir,'repo'),remote=path.join(dir,'remote.git');await mkdir(repo);
    await command('git',['init','--bare',remote],dir);await command('git',['init'],repo);
    const git=args=>command('git',args,repo);
    // Explicit per-command identity belongs only to this disposable test fixture.
    const commit=message=>git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m',message]);
    await git(['remote','add','origin',remote]);await mkdir(path.join(repo,'coach'));
    const owner='coach/owner.md';await writeFile(path.join(repo,owner),'old\n');await git(['add','.']);await commit('base');
    const head=(await git(['rev-parse','HEAD'])).trim(),identity=hash('durability'),branch=`review-loop/durability/${identity}`;
    await writeFile(path.join(repo,owner),'durable limitation\n');await git(['add','.']);await commit('persist');
    const sha=(await git(['rev-parse','HEAD'])).trim();await git(['push','origin',`HEAD:refs/heads/${branch}`]);
    const io=makeIO({...config(dir),repository_path:repo},path.join(dir,'pr-8.json'),dir);
    const job={identity,head_sha:head},result={data:{branch,commit_sha:sha,artifacts:[{path:owner,sha256:hash('durable limitation\n')}]}};
    assert.equal((await io.verifyDurability(job,result)).commit_sha,sha);
    const wrong=structuredClone(result);wrong.data.artifacts[0].sha256=hash('forged');await assert.rejects(()=>io.verifyDurability(job,wrong),/hash mismatch/);
    const missing=structuredClone(result);missing.data.artifacts[0].path='coach/absent.md';await assert.rejects(()=>io.verifyDurability(job,missing),/unchanged/);
    await writeFile(path.join(repo,'coach/other.md'),'unrelated');await git(['add','.']);await commit('unrelated');
    const next=(await git(['rev-parse','HEAD'])).trim();const unpushed={data:{...result.data,commit_sha:next}};
    await assert.rejects(()=>io.verifyDurability(job,unpushed),/reachability/);
    await git(['push','origin',`HEAD:refs/heads/${branch}`]);
    await assert.rejects(()=>io.verifyDurability({...job,head_sha:sha},unpushed),/unchanged/);
    // Git mode 120000 is rejected even on Windows hosts without symlink privilege.
    await git(['update-index','--add','--cacheinfo',`120000,${(await git(['rev-parse',`${sha}:${owner}`])).trim()},coach/link.md`]);await commit('symlink mode');
    const linkSha=(await git(['rev-parse','HEAD'])).trim();await git(['push','origin',`HEAD:refs/heads/${branch}`]);
    await assert.rejects(()=>io.verifyDurability(job,{data:{...result.data,commit_sha:linkSha,artifacts:[{path:'coach/link.md',sha256:hash('durable limitation\n')}]}}),/not regular/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('closed PR queue remains tracked across ticks; disabled config dispatches nothing',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-closed-durable-'));
  try {
    const file=path.join(dir,'pr-8.json'),live=admit(pr()),state={protocol_version:VERSION,pr_number:8,round:1,status:'PASS',history:[]};
    const finding={id:'gap',durability:'repository_required',durable_owner:'coach/docs/development/INVARIANTS.md',regression:null};
    const issues=[];let creates=0;
    const io={openPRs:async()=>[],save:s=>atomicJson(file,s),prepare:async()=>'/durable',saveReview:async()=>'/review',issues:async()=>issues,
      create:async job=>{creates++;const i={id:'durable',identifier:'COAC-D',title:job.title,description:job.description,project_id:'project',assignee_type:'agent',assignee_id:'fixer'};issues.push(i);return i;},runs:async()=>[{status:'running'}]};
    await captureDurability(state,{pr_number:8,head_sha:live.head_sha,base_sha:live.base_sha,round:1,issue_id:'review'},
      {data:{findings:{P3:[finding]}},raw:'source',sha256:hash('source'),comment_id:'comment',run_id:'run'},live,io,config(dir));
    await tick({...config(dir),enabled:false},()=>io);assert.equal(creates,0);
    await tick(config(dir),()=>io);const report=await tick(config(dir),()=>io);
    assert.equal(creates,1);assert.equal(report.prs[0].status,'PASS');assert.equal(report.prs[0].durability[0].status,'WAITING');
    const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.durability[0].head_sha,live.head_sha);assert.equal(saved.round,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('live P3 PASS tick dispatches durability before publication and never duplicates',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-live-durable-'));
  try {
    const file=path.join(dir,'pr-8.json'),raw=pr(),live=admit(raw),job={kind:'review',issue_id:'review',agent_id:'reviewer',pr_number:8,head_sha:live.head_sha,base_sha:live.base_sha,round:1};
    await atomicJson(file,{protocol_version:VERSION,pr_number:8,round:1,status:'REVIEWING',history:[],job,admission_hash:live.admission_hash});
    const result={protocol_version:VERSION,pr_number:8,head_sha:live.head_sha,base_sha:live.base_sha,round:1,verdict:'NO_P1_P2',environment_failures:[],gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),findings:{P1:[],P2:[],P3:[{id:'gap',path:'coach/a.ts',line:1,scenario:'future gap',consequence:'known limitation',minimal_fix:'document',durability:'repository_required',durable_owner:'coach/docs/development/INVARIANTS.md',regression:null,basis:'future_limitation'}]}};
    const issues=[];let creates=0,publishes=0;
    const io={openPRs:async()=>[raw],live:async()=>raw,snapshot:async()=>({sha256:hash('snapshot')}),checkSpecs:async()=>{},save:s=>atomicJson(file,s),prepare:async()=>'/durable',saveReview:async()=>'/review',issues:async()=>issues,
      create:async j=>{creates++;const i={id:'durable',title:j.title,description:j.description,project_id:'project',assignee_id:'fixer',assignee_type:'agent'};issues.push(i);return i;},
      runs:async id=>id==='review' ? [{id:'run',issue_id:'review',agent_id:'reviewer',status:'completed'}] : [{status:'running'}],
      issue:async()=>({id:'review',assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[{id:'comment',author_type:'agent',author_id:'reviewer',issue_id:'review',source_task_id:'run',content:'```review-loop-result\n'+JSON.stringify(result)+'\n```'}],verifyCheckout:async()=>{},archiveResult:async()=>{},
      publish:async s=>{publishes++;assert.equal(s.status,'PASS');assert.equal(s.durability[0].issue_id,'durable');assert.equal(s.job.issue_id,'review');}};
    await tick(config(dir),()=>io);await tick(config(dir),()=>io);
    assert.equal(creates,1);assert.equal(publishes,2);
  } finally {await rm(dir,{recursive:true,force:true});}
});

const admission={protocol_version:'review-loop/v2.1',authoritative_spec_paths:['coach/docs/specs/a.md'],rubric:'all criteria'};
const pr=(head='b'.repeat(40),base='a'.repeat(40),marker='live')=>({number:8,state:'open',draft:false,body:'```review-loop-admission\n'+JSON.stringify(admission)+'\n```',base:{sha:base,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:head,ref:'codex/a',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},marker});
const config=dir=>({protocol_version:'review-loop/v2.1',repository:'ChildeRolando/MjsoulTileTrace',reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project',enabled:true,state_dir:dir,repository_path:dir,gh_path:'gh',git_path:'git',multica_path:'multica',profile:'profile',workspace_id:'workspace'});

test('one SHA publication owner aggregates conflicting PR results and caches the aggregate',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-shared-head-'));
  try {
    const a=pr(),b={...pr(a.head.sha,'c'.repeat(40)),number:9};let list=[a,b];const writes=[];
    const ledger=(raw,status)=>({protocol_version:'review-loop/v2.1',pr_number:raw.number,round:1,status,admission_hash:admit(raw).admission_hash,job:{pr_number:raw.number,round:1,head_sha:raw.head.sha,base_sha:raw.base.sha}});
    const sa=ledger(a,'BLOCKED'),sb=ledger(b,'PASS');
    const save=async()=>{await atomicJson(path.join(dir,'pr-8.json'),sa);await atomicJson(path.join(dir,'pr-9.json'),sb);};
    await save();
    const runner=async(_file,args)=>{
      if(args.includes('POST')) {writes.push(args.find(x=>x.startsWith('state=')));return '{}';}
      if(args.includes('--paginate'))return JSON.stringify([list]);
      const number=Number(args[1].split('/').at(-1));return JSON.stringify(list.find(x=>x.number===number));
    };
    const io=n=>makeIO(config(dir),path.join(dir,`pr-${n}.json`),dir,runner);
    await io(8).publish(sa);await io(9).publish(sb);await io(8).publish(sa);
    assert.deepEqual(writes,['state=failure']);
    sa.status='PASS';await save();await io(8).publish(sa);await io(9).publish(sb);
    assert.deepEqual(writes,['state=failure','state=success']);
    b.base.sha='d'.repeat(40);await io(8).publish(sa);
    assert.equal(writes.at(-1),'state=pending','old base PASS cannot cover the new base');
    b.body='admission removed';await io(8).publish(sa);
    assert.equal(writes.at(-1),'state=failure','ledger-owned admission removal remains a veto');
    list=[a];await io(8).publish(sa);
    assert.equal(writes.at(-1),'state=success','a closed competing PR no longer vetoes the live candidate');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('shared SHA remains pending for an unreviewed admitted PR, but ignores non-opt-in PRs',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-unreviewed-head-'));
  try {
    const a=pr(),b={...pr(),number:9},sa={protocol_version:'review-loop/v2.1',pr_number:8,status:'PASS',round:1,admission_hash:admit(a).admission_hash,job:{pr_number:8,head_sha:a.head.sha,base_sha:a.base.sha}};
    const writes=[];
    const runner=async(_file,args)=>{
      if(args.includes('POST')){writes.push(args.find(x=>x.startsWith('state=')));return '{}';}
      if(args.includes('--paginate'))return JSON.stringify([[a,b]]);
      return JSON.stringify(args[1].endsWith('/8') ? a : b);
    };
    const io=makeIO(config(dir),path.join(dir,'pr-8.json'),dir,runner);
    await io.publish(sa);assert.equal(writes.at(-1),'state=pending');
    b.body='ordinary PR';await io.publish(sa);assert.equal(writes.at(-1),'state=success');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('a blocked PR moving onto another passed SHA invalidates the new shared slot too',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-moving-head-'));
  try {
    const a=pr(),b={...pr(),number:9},old='e'.repeat(40),writes=[];let list=[b];
    const sb={protocol_version:'review-loop/v2.1',pr_number:9,status:'PASS',round:1,admission_hash:admit(b).admission_hash,job:{pr_number:9,head_sha:b.head.sha,base_sha:b.base.sha}};
    const sa={...sb,pr_number:8,status:'BLOCKED',job:{pr_number:8,head_sha:old,base_sha:a.base.sha}};
    await atomicJson(path.join(dir,'pr-9.json'),sb);await atomicJson(path.join(dir,'pr-8.json'),sa);
    const runner=async(_file,args)=>{
      if(args.includes('POST')){writes.push({sha:args[1].split('/').at(-1),status:args.find(x=>x.startsWith('state='))});return '{}';}
      if(args.includes('--paginate'))return JSON.stringify([list]);
      return JSON.stringify(args[1].endsWith('/8') ? a : b);
    };
    await makeIO(config(dir),path.join(dir,'pr-9.json'),dir,runner).publish(sb);
    assert.deepEqual(writes,[{sha:b.head.sha,status:'state=success'}]);
    list=[a,b];a.body='removed admission after pushing onto the passed commit';
    await makeIO(config(dir),path.join(dir,'pr-8.json'),dir,runner).publish(sa);
    assert(writes.some(w=>w.sha===a.head.sha && w.status==='state=failure'),'the new shared HEAD must not retain another PR success');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('lost status response cannot reuse an older confirmed identity after close and reopen',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-uncertain-publication-'));
  try {
    const a=pr(),b={...pr(),number:9};let list=[a,b],loseResponse=false,remote;
    const ledger=(p,status)=>({protocol_version:'review-loop/v2.1',pr_number:p.number,round:1,status,admission_hash:admit(p).admission_hash,job:{pr_number:p.number,head_sha:p.head.sha,base_sha:p.base.sha}});
    const sa=ledger(a,'PASS'),sb=ledger(b,'BLOCKED'),writes=[];
    await atomicJson(path.join(dir,'pr-8.json'),sa);await atomicJson(path.join(dir,'pr-9.json'),sb);
    const runner=async(_file,args)=>{
      if(args.includes('POST')) {
        remote=args.find(x=>x.startsWith('state=')).slice(6);writes.push(remote);
        if(loseResponse){loseResponse=false;throw Object.assign(new Error('accepted but response lost'),{transport:true});}
        return '{}';
      }
      if(args.includes('--paginate'))return JSON.stringify([list]);
      return JSON.stringify(list.find(p=>String(p.number)===args[1].split('/').at(-1)));
    };
    const io=()=>makeIO(config(dir),path.join(dir,'pr-8.json'),dir,runner);
    await io().publish(sa);assert.equal(remote,'failure');
    list=[a];loseResponse=true;await assert.rejects(()=>io().publish(sa),/response lost/);
    assert.equal(remote,'success');
    list=[a,b];await io().publish(sa);await io().publish(sa);
    assert.equal(remote,'failure');assert.deepEqual(writes,['failure','success','failure']);
  } finally {await rm(dir,{recursive:true,force:true});}
});

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
    await atomicJson(file,{protocol_version:'review-loop/v2.1',pr_number:8,round:1,status:'PASS',history:[],admission_hash:'old',job:{pr_number:8,round:1,head_sha:head,base_sha:base}});
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
    await atomicJson(file,{protocol_version:'review-loop/v2.1',pr_number:8,round:1,status:'PASS',history:[],admission_hash:hash(JSON.stringify(admission)),job:{pr_number:8,round:1,head_sha:head,base_sha:oldBase}});
    let publications=0,checks=0;
    const factory=()=>({openPRs:async()=>[live],live:async()=>live,snapshot:async value=>({sha256:hash(JSON.stringify(value))}),save:s=>atomicJson(file,s),publish:async()=>{publications++;if(publications === 1){const e=new Error('status unavailable');e.transport=true;throw e;}},checkSpecs:async()=>{checks++;const e=new Error('fetch failed');e.transport=true;throw e;}});
    await tick(config(dir),factory);await tick(config(dir),factory);
    const saved=JSON.parse(await readFile(file,'utf8'));
    assert.equal(saved.status,'STALE');assert.equal(publications,2);assert.equal(checks,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('blocked prior job resumes a stale-intent replacement after preparation transport failure',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-replacement-'));
  try {
    const file=path.join(dir,'pr-8.json'),base='a'.repeat(40),oldHead='b'.repeat(40),newHead='c'.repeat(40),current=pr(newHead,base);
    const admissionHash=hash(JSON.stringify(admission));
    await atomicJson(file,{protocol_version:'review-loop/v2.1',pr_number:8,round:1,status:'BLOCKED',history:[],admission_hash:admissionHash,
      job:{kind:'review',round:1,pr_number:8,issue_id:'old-review',agent_id:'reviewer',head_sha:oldHead,base_sha:base},
      pending:{kind:'review',round:2,pr_number:8,agent_id:'reviewer',head_sha:oldHead,base_sha:base,admission_hash:admissionHash,title:'stale-review',worktree:'/stale',description:'stale',description_hash:'stale',prepared_at:'then'}});
    let prepareCalls=0,creates=0;const saves=[];
    const factory=()=>({
      openPRs:async()=>[current],live:async()=>current,snapshot:async value=>({semantics:'test',sha256:hash(value.head.sha)}),
      save:async s=>{saves.push(structuredClone(s));await atomicJson(file,s);},publish:async()=>{},checkSpecs:async()=>{},issues:async()=>[],
      prepare:async job=>{prepareCalls++;assert.equal(job.head_sha,newHead);if(prepareCalls === 1){const error=new Error('git fetch unavailable');error.transport=true;throw error;}return '/fresh-review';},
      create:async job=>{creates++;return {id:'new-review',identifier:'COAC-23',title:job.title,description:job.description,assignee_id:job.agent_id,assignee_type:'agent',project_id:'project'};}
    });
    const first=await tick(config(dir),factory),afterFailure=JSON.parse(await readFile(file,'utf8'));
    assert.equal(first.prs[0].status,'RETRY_IO');assert.equal(afterFailure.status,'BLOCKED');
    assert.equal(afterFailure.pending.head_sha,newHead);assert.equal(afterFailure.pending.prepared_at,undefined);
    assert(!saves.some(value=>value.pending === null));assert.equal(creates,0);
    const second=await tick(config(dir),factory),recovered=JSON.parse(await readFile(file,'utf8'));
    assert.equal(second.prs[0].status,'REVIEWING');assert.equal(recovered.status,'REVIEWING');
    assert.equal(recovered.round,2);assert.equal(recovered.job.head_sha,newHead);assert.equal(prepareCalls,2);assert.equal(creates,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('list, freshness and decision races bind exact live snapshots to history and next job',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-snapshot-'));
  try {
    const file=path.join(dir,'pr-8.json'),base='a'.repeat(40),oldHead='b'.repeat(40),newHead='c'.repeat(40);
    const oldLive=pr(oldHead,base,'initial-live'),decisionLive=pr(newHead,base,'decision-live'),dispatchLive=pr(newHead,base,'dispatch-live');
    const list={...pr('d'.repeat(40),base,'list')};
    const job={kind:'review',round:1,pr_number:8,issue_id:'review-id',agent_id:'reviewer',head_sha:oldHead,base_sha:base};
    await atomicJson(file,{protocol_version:'review-loop/v2.1',pr_number:8,round:1,status:'REVIEWING',history:[],admission_hash:hash(JSON.stringify(admission)),job});
    const result={protocol_version:'review-loop/v2.1',pr_number:8,base_sha:base,head_sha:oldHead,round:1,verdict:'NO_P1_P2',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,cmd])=>({id,command:cmd,status:'PASS',exit_code:0})),environment_failures:[]};
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
