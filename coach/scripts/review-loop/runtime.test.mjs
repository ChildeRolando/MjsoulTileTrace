const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLock, recoverLock, atomicJson, command, makeIO, tick, recoverInvalidReview, authorizeSixthReviewRun, acceptExternalReviewRun } from './runtime.mjs';
import { GATES, hash, admit, VERSION, externalReviewAcceptance } from './protocol.mjs';
import { advanceDurability, captureDurability } from './controller.mjs';

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
    const missing=structuredClone(result);missing.data.artifacts[0].path='coach/absent.md';await assert.rejects(()=>io.verifyDurability(job,missing),/missing or not regular/);
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

test('mode-only owner or regression changes cannot complete durability',{timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-durable-mode-'));
  try {
    const repo=path.join(dir,'repo'),remote=path.join(dir,'remote.git');await mkdir(repo);
    await command('git',['init','--bare',remote],dir);await command('git',['init'],repo);
    const git=args=>command('git',args,repo);
    const commit=message=>git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m',message]);
    const owner='coach/owner.md',regression='coach/regression.test.mjs';
    await git(['remote','add','origin',remote]);await mkdir(path.join(repo,'coach'));
    await writeFile(path.join(repo,owner),'old owner\n');await writeFile(path.join(repo,regression),'old regression\n');
    await git(['add','.']);await commit('base');const head=(await git(['rev-parse','HEAD'])).trim();
    {
      await writeFile(path.join(repo,owner),'missing branch owner\n');await writeFile(path.join(repo,regression),'missing branch regression\n');
      await git(['add','.']);await commit('valid commit on absent branch');
      const sha=(await git(['rev-parse','HEAD'])).trim(),identity=hash('missing remote branch'),branch=`review-loop/durability/${identity}`;
      const finding={id:'missing-branch',durable_owner:owner,regression:{path:regression,command:'npm test'}};
      const job={kind:'durability',identity,pr_number:8,base_sha:head,head_sha:head,round:1,raw_review_sha256:hash('review'),finding,agent_id:'fixer',issue_id:'durability',prepared_at:'prepared',status:'WAITING'};
      const receipt={protocol_version:VERSION,pr_number:8,base_sha:head,head_sha:head,round:1,identity,raw_review_sha256:job.raw_review_sha256,finding_id:finding.id,commit_sha:sha,branch,artifacts:[{path:owner,sha256:hash('missing branch owner\n')},{path:regression,sha256:hash('missing branch regression\n')}],checks:[{command:'npm test',status:'PASS',exit_code:0}]};
      const comment={id:'comment',author_type:'agent',author_id:'fixer',issue_id:'durability',source_task_id:'run',content:'```review-loop-durability\n'+JSON.stringify(receipt)+'\n```'};
      const state={durability:[job],history:[]},io={...makeIO({...config(dir),repository_path:repo},path.join(dir,'state.json'),dir),save:async()=>{},issue:async()=>({id:'durability',assignee_type:'agent',assignee_id:'fixer'}),runs:async()=>[{id:'run',issue_id:'durability',agent_id:'fixer',status:'completed'}],comments:async()=>[comment],archiveResult:async()=>{}};
      await advanceDurability(state,io,config(dir));
      assert.equal(job.status,'DURABLE_KNOWLEDGE_BLOCKED');assert.equal(job.completion,undefined);assert.match(job.error,/branch missing/);
      await git(['checkout','--detach',head]);
    }
    {
      const identity=hash('missing receipt commit'),branch=`review-loop/durability/${identity}`;
      await git(['push','origin',`HEAD:refs/heads/${branch}`]);
      const finding={id:'missing-commit',durable_owner:owner,regression:{path:regression,command:'npm test'}};
      const job={kind:'durability',identity,pr_number:8,base_sha:head,head_sha:head,round:1,raw_review_sha256:hash('review'),finding,agent_id:'fixer',issue_id:'durability',prepared_at:'prepared',status:'WAITING'};
      const receipt={protocol_version:VERSION,pr_number:8,base_sha:head,head_sha:head,round:1,identity,raw_review_sha256:job.raw_review_sha256,finding_id:finding.id,commit_sha:'0'.repeat(40),branch,artifacts:[{path:owner,sha256:hash('old owner\n')},{path:regression,sha256:hash('old regression\n')}],checks:[{command:'npm test',status:'PASS',exit_code:0}]};
      const comment={id:'comment',author_type:'agent',author_id:'fixer',issue_id:'durability',source_task_id:'run',content:'```review-loop-durability\n'+JSON.stringify(receipt)+'\n```'};
      const state={durability:[job],history:[]},io={...makeIO({...config(dir),repository_path:repo},path.join(dir,'state.json'),dir),save:async()=>{},issue:async()=>({id:'durability',assignee_type:'agent',assignee_id:'fixer'}),runs:async()=>[{id:'run',issue_id:'durability',agent_id:'fixer',status:'completed'}],comments:async()=>[comment],archiveResult:async()=>{}};
      await advanceDurability(state,io,config(dir));
      assert.equal(job.status,'DURABLE_KNOWLEDGE_BLOCKED');assert.equal(job.completion,undefined);assert.match(job.error,/commit missing or not a commit/);
    }
    for(const variant of [
      {name:'owner-only',modes:[owner],contents:{[regression]:'changed regression\n'}},
      {name:'regression-only',modes:[regression],contents:{[owner]:'changed owner\n'}},
      {name:'both',modes:[owner,regression],contents:{}}
    ]) {
      await git(['checkout','--detach',head]);
      for(const file of variant.modes)await git(['update-index','--chmod=+x',file]);
      for(const [file,content] of Object.entries(variant.contents)){await writeFile(path.join(repo,file),content);await git(['add',file]);}
      await commit(`mode-only ${variant.name}`);const sha=(await git(['rev-parse','HEAD'])).trim();
      const identity=hash(`mode-only-${variant.name}`),branch=`review-loop/durability/${identity}`;
      await git(['push','origin',`HEAD:refs/heads/${branch}`]);
      const finding={id:'mode-only',durable_owner:owner,regression:{path:regression,command:'npm test'}};
      const job={kind:'durability',identity,pr_number:8,base_sha:head,head_sha:head,round:1,raw_review_sha256:hash('review'),finding,agent_id:'fixer',issue_id:'durability',prepared_at:'prepared',status:'WAITING'};
      const artifact=async file=>({path:file,sha256:hash(await git(['show',`${sha}:${file}`]))});
      const receipt={protocol_version:VERSION,pr_number:8,base_sha:head,head_sha:head,round:1,identity,raw_review_sha256:job.raw_review_sha256,finding_id:finding.id,commit_sha:sha,branch,artifacts:[await artifact(owner),await artifact(regression)],checks:[{command:'npm test',status:'PASS',exit_code:0}]};
      const comment={id:'comment',author_type:'agent',author_id:'fixer',issue_id:'durability',source_task_id:'run',content:'```review-loop-durability\n'+JSON.stringify(receipt)+'\n```'};
      const state={durability:[job],history:[]},io={...makeIO({...config(dir),repository_path:repo},path.join(dir,'state.json'),dir),save:async()=>{},issue:async()=>({id:'durability',assignee_type:'agent',assignee_id:'fixer'}),runs:async()=>[{id:'run',issue_id:'durability',agent_id:'fixer',status:'completed'}],comments:async()=>[comment],archiveResult:async()=>{}};
      await advanceDurability(state,io,config(dir));
      assert.equal(job.status,'DURABLE_KNOWLEDGE_BLOCKED',variant.name);assert.equal(job.completion,undefined,variant.name);
      assert.match(job.error,/content unchanged/,variant.name);
    }
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
const pr=(head='b'.repeat(40),base='a'.repeat(40),marker='live')=>({number:8,state:'open',draft:false,body:'```review-loop-admission\n'+JSON.stringify(admission)+'\n```',base:{sha:base,ref:'master',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:head,ref:'codex/a',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},marker});
const config=dir=>({protocol_version:'review-loop/v2.1',repository:'ChildeRolando/MjsoulTileTrace',reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project',enabled:true,auto_merge:{version:2,enabled:false,method:'merge',expected_actor:{login:'merger',id:1}},state_dir:dir,repository_path:dir,gh_path:'gh',git_path:'git',multica_path:'multica',profile:'profile',workspace_id:'workspace'});

test('native auto-merge evidence proves GitHub constrains an admin and requires Review Loop',async()=>{
  const raw=pr(),requests=[];
  const runner=async(_file,args)=>{
    const endpoint=args[1];requests.push(endpoint);
    if(endpoint === 'repos/ChildeRolando/MjsoulTileTrace/pulls/8')return JSON.stringify(raw);
    if(endpoint === 'repos/ChildeRolando/MjsoulTileTrace')return JSON.stringify({full_name:'ChildeRolando/MjsoulTileTrace',allow_auto_merge:true,allow_merge_commit:true});
    if(endpoint === 'user')return JSON.stringify({login:'merger',id:1});
    if(endpoint.startsWith('user/teams'))return JSON.stringify([[]]);
    if(endpoint.includes('/rules/branches/master?'))return JSON.stringify([[]]);
    if(endpoint.endsWith('/collaborators/merger/permission'))return JSON.stringify({permission:'admin',role_name:'admin'});
    if(endpoint.endsWith('/branches/master'))return JSON.stringify({protected:true});
    if(endpoint.endsWith('/branches/master/protection'))return JSON.stringify({enforce_admins:{enabled:true},required_status_checks:{checks:[{context:'Review Loop v2',app_id:null}],contexts:[]},required_pull_request_reviews:{bypass_pull_request_allowances:{users:[],teams:[],apps:[]}}});
    throw new Error(`unexpected request ${endpoint}`);
  };
  const evidence=await makeIO(config('.'),'state.json','.',runner).autoMergeEvidence(8,'master');
  assert.deepEqual(evidence.permission,{permission:'admin',role_name:'admin'});assert.equal(evidence.actor_constrained,true);assert.equal(evidence.review_loop_required,true);
  assert(requests.some(x=>x.includes('/rules/branches/master?')));assert(!requests.some(x=>x.includes('/rules/branches/codex%2Fa')));
  assert(!requests.some(x=>x.includes('/statuses') || x.includes('/check-runs')));
});

test('native auto-merge request binds the reviewed head and never requests admin bypass',async()=>{
  let invoked;
  const runner=async(_file,args)=>{invoked=args;return '';};
  await makeIO(config('.'),'state.json','.',runner).requestAutoMerge(8,'b'.repeat(40),'merge');
  assert.deepEqual(invoked,['pr','merge','8','--repo','ChildeRolando/MjsoulTileTrace','--auto','--merge','--match-head-commit','b'.repeat(40)]);
  assert.equal(invoked.includes('--admin'),false);assert.equal(invoked.includes('--delete-branch'),false);
});

async function invalidReviewRecoveryFixture(dir) {
  const reviewHead='b'.repeat(40),currentHead='c'.repeat(40),base='a'.repeat(40),raw=pr(currentHead,base);
  const prior={pr_number:8,max_rounds:4,approved_after_round:3,review_issue_id:'third-review',result_sha256:'d'.repeat(64),head_sha:reviewHead,base_sha:base,approval_ref:'fourth approved',approved_at:'2026-09-21T00:00:00Z'};
  const state={protocol_version:VERSION,pr_number:8,round:4,status:'BLOCKED',reason:'contradictory verdict',admission_hash:admit(raw).admission_hash,history:[{event:'result',transition:'BLOCKED',round:3,issue_id:'third-review',sha256:prior.result_sha256,head_sha:reviewHead,base_sha:base},{event:'authorize_extra_review',...prior}],extra_review_authorization:prior,result:{issue_id:'third-review',sha256:prior.result_sha256},job:{kind:'review',round:4,pr_number:8,issue_id:'fourth-review',identifier:'COAC-78',agent_id:'reviewer',head_sha:reviewHead,base_sha:base,admission_hash:admit(raw).admission_hash}};
  const result={protocol_version:VERSION,pr_number:8,base_sha:base,head_sha:reviewHead,round:4,verdict:'CHANGES_REQUIRED',findings:{P1:[],P2:[{id:'p2',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z',durability:'repository_required',durable_owner:'coach/docs/specs/a.md',regression:null,basis:'explicit_contract_violation'}],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:['historical recovered failure']};
  const comment={id:'fourth-comment',author_type:'agent',author_id:'reviewer',issue_id:'fourth-review',source_task_id:'fourth-run',content:'review\n```review-loop-result\n'+JSON.stringify(result)+'\n```'};
  const request={protocol_version:VERSION,pr_number:8,review_issue_id:'fourth-review',comment_id:comment.id,run_id:comment.source_task_id,raw_review_sha256:hash(comment.content),review_base_sha:base,review_head_sha:reviewHead,round:4,current_base_sha:base,current_head_sha:currentHead,approval_ref:'COAC-79 user-approved fifth review'};
  await atomicJson(path.join(dir,'pr-8.json'),state);
  let creates=0,archives=0;const issues=[];
  let observed=raw;
  const io={openPRs:async()=>[observed],live:async()=>observed,snapshot:async value=>({semantics:'test',sha256:hash(value.head.sha)}),save:s=>atomicJson(path.join(dir,'pr-8.json'),s),issue:async()=>({id:'fourth-review',assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[comment],runs:async()=>[{id:'fourth-run',issue_id:'fourth-review',agent_id:'reviewer',status:'completed'}],archiveResult:async()=>{archives++;},prepare:async()=>path.join(dir,'review-5'),issues:async()=>issues,checkSpecs:async()=>{},create:async job=>{creates++;const issue={id:'fifth-review',identifier:'COAC-80',title:job.title,description:job.description,assignee_id:'reviewer',assignee_type:'agent',project_id:'project'};issues.push(issue);return issue;},publish:async()=>{}};
  return {request,io,result,comment,issues,setLiveHead(head){observed=pr(head,base);},get creates(){return creates;},get archives(){return archives;}};
}
test('operator recovery is lock-serialized, rejects stale candidates, and dispatches exactly one fifth review',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-invalid-recovery-'));
  try {
    const fixture=await invalidReviewRecoveryFixture(dir),disabled={...config(dir),enabled:false};
    const release=await acquireLock(dir);
    await assert.rejects(()=>recoverInvalidReview(disabled,fixture.request,()=>fixture.io),/already running/);await release();
    const stale={...fixture.request,current_head_sha:'e'.repeat(40)};
    await assert.rejects(()=>recoverInvalidReview(disabled,stale,()=>fixture.io),/current head changed/);
    const receipt=await recoverInvalidReview(disabled,fixture.request,()=>fixture.io),saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(receipt.round,5);assert.equal(receipt.issue_id,'fifth-review');assert.equal(receipt.head_sha,fixture.request.current_head_sha);
    assert.equal(fixture.creates,1);assert.equal(fixture.archives,1);assert.equal(saved.status,'REVIEWING');
    assert.equal(saved.history.filter(e=>e.event==='reject_invalid_review_result').length,1);
    assert.equal(saved.history.filter(e=>e.event==='authorize_extra_review').length,2);
    await assert.rejects(()=>recoverInvalidReview(disabled,fixture.request,()=>fixture.io),/unsupported review-result rejection|contradictory terminal review|already recovered/);
    assert.equal(fixture.creates,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('operator recovery persists its exact candidate across preparation failure and never rebinds',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-recovery-candidate-'));
  try {
    const fixture=await invalidReviewRecoveryFixture(dir),disabled={...config(dir),enabled:false};
    let failPrepare=true;
    fixture.io.prepare=async()=>{if(failPrepare){failPrepare=false;throw new Error('prepare interrupted');}return path.join(dir,'review-5');};
    await assert.rejects(()=>recoverInvalidReview(disabled,fixture.request,()=>fixture.io),/prepare interrupted/);
    const interrupted=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.deepEqual({base_sha:interrupted.recovery_candidate.base_sha,head_sha:interrupted.recovery_candidate.head_sha},{base_sha:fixture.request.current_base_sha,head_sha:fixture.request.current_head_sha});
    assert.equal(interrupted.pending.head_sha,fixture.request.current_head_sha);

    fixture.setLiveHead('e'.repeat(40));
    const drifted=await tick(config(dir),()=>fixture.io);
    assert.equal(drifted.prs[0].status,'BLOCKED');assert.match(drifted.prs[0].reason,/approved recovery candidate changed/);
    assert.equal(fixture.creates,0);

    fixture.setLiveHead(fixture.request.current_head_sha);
    const repeated=await tick(config(dir),()=>fixture.io);
    assert.equal(repeated.prs[0].status,'BLOCKED');assert.match(repeated.prs[0].reason,/approved recovery candidate.*invalidated/);
    assert.equal(fixture.creates,0,'a stale authorization must not become reusable when the old SHA returns');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('operator recovery rejects invalid verdict schema without authorization or dispatch',async()=>{
  for(const verdict of ['BOGUS',42,null]) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-recovery-verdict-'));
    try {
      const fixture=await invalidReviewRecoveryFixture(dir),disabled={...config(dir),enabled:false};
      fixture.result.verdict=verdict;
      fixture.comment.content='review\n```review-loop-result\n'+JSON.stringify(fixture.result)+'\n```';
      fixture.request.raw_review_sha256=hash(fixture.comment.content);
      await assert.rejects(()=>recoverInvalidReview(disabled,fixture.request,()=>fixture.io),/unsupported review-result rejection/);
      const saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
      assert.equal(saved.history.filter(e=>e.event==='authorize_extra_review').length,1);
      assert.equal(saved.history.filter(e=>e.event==='reject_invalid_review_result').length,0);
      assert.equal(fixture.creates,0);assert.equal(fixture.archives,0);
    } finally {await rm(dir,{recursive:true,force:true});}
  }
});

test('operator recovery reconciles a lost create response without rebinding or duplicate dispatch',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-recovery-response-'));
  try {
    const fixture=await invalidReviewRecoveryFixture(dir),disabled={...config(dir),enabled:false};
    let sends=0;
    fixture.io.create=async job=>{
      sends++;
      fixture.issues.push({id:'fifth-review',identifier:'COAC-80',title:job.title,description:job.description,assignee_id:'reviewer',assignee_type:'agent',project_id:'project'});
      throw new Error('create response lost');
    };
    await assert.rejects(()=>recoverInvalidReview(disabled,fixture.request,()=>fixture.io),/create response lost/);
    const uncertain=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(uncertain.pending.attempted_at !== undefined,true);
    assert.equal(uncertain.pending.head_sha,fixture.request.current_head_sha);

    const resumed=await tick(config(dir),()=>fixture.io);
    assert.equal(resumed.prs[0].status,'REVIEWING');assert.equal(resumed.prs[0].round,5);
    assert.equal(sends,1);assert.equal(fixture.issues.length,1);
    const saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(saved.job.head_sha,fixture.request.current_head_sha);assert.equal(saved.pending,null);
  } finally {await rm(dir,{recursive:true,force:true});}
});

async function sixthReviewFixture(dir) {
  const reviewHead='b'.repeat(40),currentHead='c'.repeat(40),base='a'.repeat(40),raw=pr(currentHead,base),admissionHash=admit(raw).admission_hash;
  const third={event:'result',transition:'BLOCKED',round:3,issue_id:'third-review',comment_id:'third-comment',run_id:'third-run',sha256:'d'.repeat(64),head_sha:reviewHead,base_sha:base};
  const fourthAuthorization={pr_number:8,max_rounds:4,approved_after_round:3,review_issue_id:third.issue_id,result_sha256:third.sha256,head_sha:third.head_sha,base_sha:third.base_sha,approval_ref:'fourth approved',approved_at:'2026-09-20T00:00:00Z'};
  const fourth={event:'result',transition:'BLOCKED',round:4,issue_id:'fourth-review',comment_id:'fourth-comment',run_id:'fourth-run',sha256:'e'.repeat(64),head_sha:reviewHead,base_sha:base};
  const rejectedFourth={event:'reject_invalid_review_result',reason:'contradictory verdict',issue_id:fourth.issue_id,comment_id:fourth.comment_id,run_id:fourth.run_id,sha256:fourth.sha256,head_sha:fourth.head_sha,base_sha:fourth.base_sha,round:4};
  const fifthAuthorization={pr_number:8,max_rounds:5,approved_after_round:4,review_issue_id:fourth.issue_id,result_sha256:fourth.sha256,head_sha:fourth.head_sha,base_sha:fourth.base_sha,approval_ref:'fifth approved',approved_at:'2026-09-21T00:00:00Z'};
  const result={protocol_version:VERSION,pr_number:8,base_sha:base,head_sha:reviewHead,round:5,verdict:'CHANGES_REQUIRED',findings:{P1:[],P2:[{id:'p2',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z',durability:'repository_required',durable_owner:'coach/docs/specs/a.md',regression:null,basis:'explicit_contract_violation'}],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:[]};
  const comment={id:'fifth-comment',author_type:'agent',author_id:'reviewer',issue_id:'fifth-review',source_task_id:'fifth-run',content:'review\n```review-loop-result\n'+JSON.stringify(result)+'\n```'};
  const resultHash=hash(comment.content),fifth={event:'result',transition:'BLOCKED',round:5,issue_id:comment.issue_id,comment_id:comment.id,run_id:comment.source_task_id,sha256:resultHash,head_sha:reviewHead,base_sha:base};
  const recoveryCandidate={pr_number:8,base_sha:base,head_sha:reviewHead,recovered_review_issue_id:fourth.issue_id,recovered_result_sha256:fourth.sha256,bound_at:'2026-09-21T00:00:00Z'};
  const state={protocol_version:VERSION,pr_number:8,round:5,status:'BLOCKED',reason:'review gates, environment or round limit',admission_hash:admissionHash,history:[third,{event:'authorize_extra_review',...fourthAuthorization},rejectedFourth,{event:'authorize_extra_review',...fifthAuthorization},fifth],extra_review_authorization:fifthAuthorization,recovery_candidate:recoveryCandidate,result:{issue_id:fifth.issue_id,comment_id:fifth.comment_id,sha256:fifth.sha256},job:{kind:'review',round:5,pr_number:8,issue_id:fifth.issue_id,identifier:'COAC-83',agent_id:'reviewer',head_sha:reviewHead,base_sha:base,admission_hash:admissionHash}};
  const parsed={data:result,raw:comment.content,sha256:resultHash,comment_id:comment.id,run_id:comment.source_task_id};
  const request={protocol_version:VERSION,pr_number:8,review_issue_id:fifth.issue_id,comment_id:fifth.comment_id,run_id:fifth.run_id,raw_review_sha256:fifth.sha256,review_base_sha:base,review_head_sha:reviewHead,round:5,current_base_sha:base,current_head_sha:currentHead,approval_ref:'COAC-77 comment explicitly approved one sixth review'};
  await atomicJson(path.join(dir,'pr-8.json'),state);await mkdir(path.join(dir,'results'));
  await atomicJson(path.join(dir,'results',`${fifth.issue_id}-${fifth.sha256}.json`),parsed);
  let creates=0,observed=raw;const issues=[];
  const io={openPRs:async()=>[observed],live:async()=>observed,snapshot:async value=>({semantics:'test',sha256:hash(value.head.sha)}),save:s=>atomicJson(path.join(dir,'pr-8.json'),s),issue:async()=>({id:fifth.issue_id,assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[comment],runs:async()=>[{id:fifth.run_id,issue_id:fifth.issue_id,agent_id:'reviewer',status:'completed'}],prepare:async()=>path.join(dir,'review-6'),issues:async()=>issues,checkSpecs:async()=>{},create:async job=>{creates++;const issue={id:'sixth-review',identifier:'COAC-84',title:job.title,description:job.description,assignee_id:'reviewer',assignee_type:'agent',project_id:'project'};issues.push(issue);return issue;},publish:async()=>{}};
  return {request,io,issues,setLiveHead(head){observed=pr(head,base);},get creates(){return creates;}};
}
test('valid fifth-round operator path is lock-serialized, archive-bound, idempotent and dispatches one sixth review',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-sixth-'));
  try {
    const fixture=await sixthReviewFixture(dir),disabled={...config(dir),enabled:false};
    const release=await acquireLock(dir);await assert.rejects(()=>authorizeSixthReviewRun(disabled,fixture.request,()=>fixture.io),/already running/);await release();
    const stale={...fixture.request,current_head_sha:'9'.repeat(40)};await assert.rejects(()=>authorizeSixthReviewRun(disabled,stale,()=>fixture.io),/current head changed/);
    const receipt=await authorizeSixthReviewRun(disabled,fixture.request,()=>fixture.io),saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(receipt.round,6);assert.equal(receipt.issue_id,'sixth-review');assert.equal(fixture.creates,1);assert.equal(saved.history.filter(e=>e.event==='authorize_extra_review').length,3);
    assert.equal(saved.recovery_candidate.recovered_review_issue_id,'fourth-review');
    await assert.rejects(()=>authorizeSixthReviewRun(disabled,fixture.request,()=>fixture.io));assert.equal(fixture.creates,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('sixth-review operator path rejects missing or changed archived evidence before authorization',async()=>{
  for(const mutate of [async(dir,fixture)=>rm(path.join(dir,'results',`${fixture.request.review_issue_id}-${fixture.request.raw_review_sha256}.json`)),async(dir,fixture)=>atomicJson(path.join(dir,'results',`${fixture.request.review_issue_id}-${fixture.request.raw_review_sha256}.json`),{forged:true})]) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-sixth-archive-'));
    try {const fixture=await sixthReviewFixture(dir);await mutate(dir,fixture);await assert.rejects(()=>authorizeSixthReviewRun({...config(dir),enabled:false},fixture.request,()=>fixture.io));assert.equal(fixture.creates,0);} finally {await rm(dir,{recursive:true,force:true});}
  }
});

async function externalReviewFixture(dir) {
  const base='a'.repeat(40),automaticHead='b'.repeat(40),head='c'.repeat(40),raw=pr(head,base),live=admit(raw);
  const blocked=(round,issue,sha)=>({event:'result',transition:'BLOCKED',round,issue_id:issue,comment_id:`${issue}-comment`,run_id:`${issue}-run`,sha256:sha,head_sha:automaticHead,base_sha:base});
  const third=blocked(3,'third','3'.repeat(64)),fourth=blocked(4,'fourth','4'.repeat(64)),fifth=blocked(5,'fifth','5'.repeat(64)),sixth=blocked(6,'sixth','6'.repeat(64));
  const auth=(limit,source)=>({pr_number:8,max_rounds:limit,approved_after_round:limit-1,review_issue_id:source.issue_id,result_sha256:source.sha256,head_sha:source.head_sha,base_sha:source.base_sha,approval_ref:`round ${limit} approved`,approved_at:`2026-09-2${limit}T00:00:00Z`});
  const a4=auth(4,third),a5=auth(5,fourth),a6=auth(6,fifth);
  const state={protocol_version:VERSION,pr_number:8,round:6,status:'BLOCKED',reason:'review gates, environment or round limit',admission_hash:live.admission_hash,history:[third,{event:'authorize_extra_review',...a4},fourth,{event:'authorize_extra_review',...a5},fifth,{event:'authorize_extra_review',...a6},sixth],extra_review_authorization:a6,result:{issue_id:sixth.issue_id,comment_id:sixth.comment_id,sha256:sixth.sha256},job:{kind:'review',round:6,pr_number:8,issue_id:sixth.issue_id,agent_id:'reviewer',head_sha:automaticHead,base_sha:base,admission_hash:live.admission_hash}};
  const description=`Human-dispatched independent review for PR 8 at ${base} / ${head}.\n${live.admission.authoritative_spec_paths.join('\n')}\n${live.admission.rubric}`;
  const result={protocol_version:VERSION,pr_number:8,base_sha:base,head_sha:head,round:8,verdict:'NO_P1_P2',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:[]};
  const comment={id:'external-comment',author_type:'agent',author_id:'reviewer',issue_id:'external-review',source_task_id:'external-run',content:'independent\n```review-loop-result\n'+JSON.stringify(result)+'\n```'};
  const issue={id:'external-review',creator_type:'member',project_id:'project',assignee_type:'agent',assignee_id:'reviewer',description};
  const run={id:'external-run',issue_id:issue.id,agent_id:'reviewer',status:'completed'};
  const request={protocol_version:VERSION,pr_number:8,review_issue_id:issue.id,comment_id:comment.id,run_id:run.id,raw_review_sha256:hash(comment.content),issue_contract_sha256:hash(description),external_sequence:8,base_sha:base,head_sha:head,admission_hash:live.admission_hash,approval_ref:'COAC-79 explicit external-review closure approval'};
  await atomicJson(path.join(dir,'pr-8.json'),state);
  let archives=0,saves=0,publishes=0,liveReads=0,observed=raw;
  const after={issue:null,comments:null,runs:null};
  const read=(key,value)=>{after[key]?.();return value;};
  const io={live:async()=>{liveReads++;return observed;},issue:async()=>read('issue',issue),comments:async()=>read('comments',[comment]),runs:async()=>read('runs',[run]),archiveExternalResult:async()=>{archives++;},save:async s=>{saves++;await atomicJson(path.join(dir,'pr-8.json'),s);},publish:async s=>{publishes++;assert(externalReviewAcceptance(s,live));}};
  return {state,result,comment,issue,run,request,io,raw,after,setLive(value){observed=value;},get archives(){return archives;},get saves(){return saves;},get publishes(){return publishes;},get liveReads(){return liveReads;}};
}
test('external independent review closure preserves automatic BLOCKED and publishes one exact acceptance',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-external-'));
  try {
    const f=await externalReviewFixture(dir),disabled={...config(dir),enabled:false};
    const release=await acquireLock(dir);await assert.rejects(()=>acceptExternalReviewRun(disabled,f.request,()=>f.io),/already running/);await release();
    const receipt=await acceptExternalReviewRun(disabled,f.request,()=>f.io),saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(receipt.status,'EXTERNAL_REVIEW_ACCEPTED');assert.equal(receipt.ledger_status,'BLOCKED');
    assert.equal(saved.status,'BLOCKED');assert.equal(saved.round,6);assert.equal(saved.history.length,f.state.history.length+1);
    assert.equal(saved.history.filter(e=>e.event==='accept_external_review').length,1);assert.equal(saved.external_review_acceptance.source,'external_independent_review');
    assert.equal(f.archives,1);assert.equal(f.saves,1);assert.equal(f.publishes,1);
    await assert.rejects(()=>acceptExternalReviewRun(disabled,f.request,()=>f.io),/already accepted/);assert.equal(f.publishes,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('external review closure rejects stale, forged, incomplete, non-green and mismatched evidence without saving',async()=>{
  const mutations=[
    f=>{f.request.head_sha='9'.repeat(40);},
    f=>{f.request.raw_review_sha256='0'.repeat(64);},
    f=>{f.issue.creator_type='agent';},
    f=>{f.issue.assignee_id='fixer';},
    f=>{f.issue.description+=' changed';},
    f=>{f.run.status='running';},
    f=>{f.result.gates.pop();f.comment.content='independent\n```review-loop-result\n'+JSON.stringify(f.result)+'\n```';f.request.raw_review_sha256=hash(f.comment.content);},
    f=>{f.result.gates[0]={...f.result.gates[0],status:'FAIL',exit_code:1};f.result.verdict='ENVIRONMENT_BLOCKED';f.result.environment_failures=['blocked'];f.comment.content='independent\n```review-loop-result\n'+JSON.stringify(f.result)+'\n```';f.request.raw_review_sha256=hash(f.comment.content);},
    f=>{f.request.admission_hash='0'.repeat(64);},
  ];
  for(const mutate of mutations) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-external-reject-'));
    try {const f=await externalReviewFixture(dir);mutate(f);await assert.rejects(()=>acceptExternalReviewRun({...config(dir),enabled:false},f.request,()=>f.io));assert.equal(f.saves,0);assert.equal(f.archives,0);assert.equal(f.publishes,0);} finally {await rm(dir,{recursive:true,force:true});}
  }
});
test('external review closure rejects pending, wrong-job and mismatched automatic ledgers before external reads',async()=>{
  const mutations=[
    state=>{state.pending={kind:'review'};},
    state=>{state.job.round=5;},
    state=>{state.result.comment_id='wrong-comment';},
    state=>{state.history=state.history.filter(e=>!(e.event === 'result' && e.round === 6));},
  ];
  for(const mutate of mutations) {
    const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-external-ledger-reject-'));
    try {
      const f=await externalReviewFixture(dir);mutate(f.state);await atomicJson(path.join(dir,'pr-8.json'),f.state);
      await assert.rejects(()=>acceptExternalReviewRun({...config(dir),enabled:false},f.request,()=>f.io));
      assert.equal(f.liveReads,0);assert.equal(f.saves,0);assert.equal(f.archives,0);assert.equal(f.publishes,0);
    } finally {await rm(dir,{recursive:true,force:true});}
  }
});
test('external review closure rejects a round-six source failure produced by tick',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-external-invalid-sixth-'));
  try {
    const f=await externalReviewFixture(dir),automatic=structuredClone(f.state);
    const sixth=automatic.history.pop(),fifth=automatic.history.findLast(e=>e.event === 'result' && e.round === 5);
    automatic.status='REVIEWING';automatic.reason=null;
    automatic.result={issue_id:fifth.issue_id,comment_id:fifth.comment_id,sha256:fifth.sha256};
    await atomicJson(path.join(dir,'pr-8.json'),automatic);
    const invalid={...f.result,head_sha:automatic.job.head_sha,round:6,verdict:'CHANGES_REQUIRED',findings:{P1:[],P2:[{id:'p2',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z',durability:'repository_required',durable_owner:'coach/docs/development/REVIEW_LOOP.md',regression:{path:'coach/scripts/review-loop/runtime.test.mjs',command:'npm run test:review-loop-protocol'},basis:'explicit_contract_violation'}],P3:[]}};
    const rejectedComment={id:sixth.comment_id,author_type:'agent',author_id:'fixer',issue_id:sixth.issue_id,source_task_id:sixth.run_id,content:'```review-loop-result\n'+JSON.stringify(invalid)+'\n```'};
    const automaticRaw=pr(automatic.job.head_sha,automatic.job.base_sha);
    const tickIO={
      openPRs:async()=>[automaticRaw],live:async()=>automaticRaw,snapshot:async()=>({sha256:hash('snapshot')}),checkSpecs:async()=>{},
      save:s=>atomicJson(path.join(dir,'pr-8.json'),s),publish:async()=>{},runs:async()=>[{id:sixth.run_id,issue_id:sixth.issue_id,agent_id:'reviewer',status:'completed'}],
      issue:async()=>({id:sixth.issue_id,assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[rejectedComment],verifyCheckout:async()=>{},archiveResult:async()=>{assert.fail('a rejected source must not be archived');},
    };
    const report=await tick(config(dir),()=>tickIO),blocked=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8'));
    assert.equal(report.prs[0].status,'BLOCKED');assert.match(blocked.reason,/untrusted result author\/owner/);
    assert.equal(blocked.result.issue_id,fifth.issue_id);assert.equal(blocked.history.some(e=>e.event === 'result' && e.round === 6),false);
    await assert.rejects(()=>acceptExternalReviewRun({...config(dir),enabled:false},f.request,()=>f.io),/automatic round-6 (accepted|terminal) result/);
    assert.equal(f.saves,0);assert.equal(f.archives,0);assert.equal(f.publishes,0);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('external review closure revalidates candidate after every external evidence read before writing',async()=>{
  const changes=[
    ['issue',f=>pr('9'.repeat(40),f.request.base_sha)],
    ['comments',f=>pr(f.request.head_sha,'9'.repeat(40))],
    ['runs',f=>({...f.raw,body:'```review-loop-admission\n'+JSON.stringify({...admission,rubric:'changed rubric'})+'\n```'})],
  ];
  for(const [phase,changed] of changes) {
    const dir=await mkdtemp(path.join(os.tmpdir(),`review-loop-external-${phase}-race-`));
    try {
      const f=await externalReviewFixture(dir),disabled={...config(dir),enabled:false};
      f.after[phase]=()=>f.setLive(changed(f));
      await assert.rejects(()=>acceptExternalReviewRun(disabled,f.request,()=>f.io),/external-review (current base|current head|admission) changed/);
      assert.equal(f.liveReads,2);assert.equal(f.archives,0);assert.equal(f.saves,0);assert.equal(f.publishes,0);
      f.after[phase]=null;f.setLive(f.raw);
      const receipt=await acceptExternalReviewRun(disabled,f.request,()=>f.io);
      assert.equal(receipt.status,'EXTERNAL_REVIEW_ACCEPTED');assert.equal(f.archives,1);assert.equal(f.saves,1);assert.equal(f.publishes,1);
    } finally {await rm(dir,{recursive:true,force:true});}
  }
});
test('aggregate publication reports success from a validated external acceptance while automatic ledger stays BLOCKED',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-external-publish-'));
  try {
    const f=await externalReviewFixture(dir);await acceptExternalReviewRun({...config(dir),enabled:false},f.request,()=>f.io);
    const saved=JSON.parse(await readFile(path.join(dir,'pr-8.json'),'utf8')),writes=[];
    const runner=async(_file,args)=>{
      if(args.includes('POST')){writes.push({sha:args[1].split('/').at(-1),status:args.find(x=>x.startsWith('state='))});return '{}';}
      if(args.includes('--paginate'))return JSON.stringify([[f.raw]]);
      return JSON.stringify(f.raw);
    };
    await makeIO(config(dir),path.join(dir,'pr-8.json'),dir,runner).publish(saved);
    assert.equal(saved.status,'BLOCKED');assert(writes.some(w=>w.sha===f.request.head_sha && w.status==='state=success'));
  } finally {await rm(dir,{recursive:true,force:true});}
});

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
test('corrected first admission resumes only a pristine round-zero ledger',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'review-loop-initial-admission-'));
  try {
    const file=path.join(dir,'pr-8.json');let current={...pr(),body:'```review-loop-admission\n'+JSON.stringify({...admission,protocol_version:'review-loop/v2'})+'\n```'};
    let creates=0;
    const factory=()=>({
      openPRs:async()=>[current],live:async()=>current,snapshot:async value=>({semantics:'test',sha256:hash(JSON.stringify(value))}),
      save:s=>atomicJson(file,s),publish:async()=>{},checkSpecs:async()=>{},prepare:async()=>'/worktree',issues:async()=>[],
      create:async job=>{creates++;return {id:'review',identifier:'COAC-1',title:job.title,description:job.description,assignee_id:job.agent_id,assignee_type:'agent',project_id:'project'};}
    });
    const blocked=await tick(config(dir),factory);assert.equal(blocked.prs[0].status,'BLOCKED');
    let saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.round,0);assert.equal(saved.admission_hash,undefined);assert.equal(saved.history.length,0);
    current=pr();
    const resumed=await tick(config(dir),factory);saved=JSON.parse(await readFile(file,'utf8'));
    assert.equal(resumed.prs[0].status,'REVIEWING');assert.equal(saved.round,1);assert.equal(creates,1);
    assert.equal(saved.history[0].event,'recover_initial_admission');assert.match(saved.history[0].reason,/review-loop\/v2/);
    assert.equal(saved.history[0].admission_hash,admit(current).admission_hash);
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
