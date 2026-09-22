const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensureDispatch, advance, authorizeExtraReview, recoverRejectedTerminalReview, jobDescription, reviewerInstructions } from './controller.mjs';
import { admit } from './protocol.mjs';
const config={reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project'};
const raw={number:8,state:'open',draft:false,body:'```review-loop-admission\n{"protocol_version":"review-loop/v2.1","authoritative_spec_paths":["coach/docs/specs/a.md"],"rubric":"all criteria"}\n```',base:{sha:'a'.repeat(40),repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:'b'.repeat(40),ref:'codex/a',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}};
const live=admit(raw);
const state=()=>({round:0,history:[],status:'NEW'});
test('review job composes the authoritative instructions with pinned parameters',()=>{
  const source=readFileSync(new URL('./reviewer-instructions.md',import.meta.url),'utf8').trim();
  const description=jobDescription({kind:'review',pr_number:8,round:1,base_sha:live.base_sha,head_sha:live.head_sha,worktree:'/review'},live);
  assert.equal(reviewerInstructions,source);
  assert(description.startsWith(`${source}\n\n# 本轮固定任务参数`));
  for(const expected of ['父/兄弟 issue','不能继承旧 PASS','当前固定候选重新核验','review-loop-result',live.head_sha,live.base_sha]) assert(description.includes(expected),expected);
  for(const forbidden of ['outside the review input',"Use only this task's input",'不输入旧 findings、父/兄弟 issue']) assert(!description.includes(forbidden),forbidden);
});
test('review and fix jobs use Chinese user-facing templates',async()=>{
  const review=fake(),reviewState=state();await ensureDispatch(reviewState,live,'review',review.io,config);
  assert.match(review.issues[0].title,/\[审查\]\[第1轮\]/);
  assert.match(review.issues[0].description,/本轮固定任务参数/);
  const fix=fake(),fixState={...state(),round:1,job:{issue_id:'source-review'}};
  const result={comment_id:'source-comment',sha256:'d'.repeat(64),raw:'raw review'};
  await ensureDispatch(fixState,live,'fix',fix.io,config,result);
  assert.match(fix.issues[0].title,/\[修复\]\[第1轮\]/);
  assert.match(fix.issues[0].description,/修复附件中针对该 PR 的完整独立评审/);
  assert(!fix.issues[0].description.includes('Fix the attached'));
});
function fake() {
  const issues=[], saves=[];let creates=0;
  return {issues,saves,get creates(){return creates;},io:{prepare:async()=>'/worktree',save:async s=>saves.push(structuredClone(s)),issues:async()=>issues,live:async()=>raw,snapshot:async value=>({semantics:'test',sha256:value.head.sha,observed_at:'now'}),checkSpecs:async()=>{},saveReview:async()=>'/review.txt',create:async j=>{creates++;const issue={id:'id',identifier:'COAC-20',title:j.title,description:j.description,assignee_id:j.agent_id,assignee_type:'agent',project_id:config.project_id};issues.push(issue);return issue;}}};
}
test('persist intent before create; repeat tick with live run does not dispatch twice',async()=>{
  const f=fake(),s=state();await ensureDispatch(s,live,'review',f.io,config);
  assert(f.saves.some(x=>x.pending?.attempted_at && !x.job));assert.equal(f.creates,1);
  f.io.runs=async()=>[{status:'running'}];await advance(s,live,f.io,config);assert.equal(f.creates,1);
});
test('reconcile response lost after server created issue',async()=>{
  const f=fake(),s=state(),original=f.io.create;
  f.io.create=async j=>{await original(j);throw new Error('lost response');};
  await assert.rejects(()=>ensureDispatch(s,live,'review',f.io,config));
  await ensureDispatch(s,live,'review',f.io,config);assert.equal(f.creates,1);assert.equal(s.job.issue_id,'id');
});
test('unknown create without visible issue fails closed, never duplicates',async()=>{
  const f=fake(),s=state();f.io.create=async()=>{throw new Error('timeout');};
  await assert.rejects(()=>ensureDispatch(s,live,'review',f.io,config));
  await assert.rejects(()=>ensureDispatch(s,live,'review',f.io,config),/response unknown/);
});
test('restart discards an unattempted stale intent and repeated ticks keep one fresh dispatch',async()=>{
  const f=fake(),initial=state(),changed=structuredClone(raw);changed.head.sha='c'.repeat(40);
  let persisted,crashed=false;
  f.io.save=async s=>{
    persisted=structuredClone(s);
    if(s.pending && !s.pending.attempted_at && !crashed) {crashed=true;throw new Error('controller stopped after persisting intent');}
  };
  await assert.rejects(()=>ensureDispatch(initial,live,'review',f.io,config),/controller stopped/);
  assert.equal(persisted.pending.head_sha,live.head_sha);assert.equal(persisted.pending.attempted_at,undefined);
  f.io.live=async()=>changed;f.io.save=async s=>{persisted=structuredClone(s);};
  await advance(persisted,admit(changed),f.io,config);
  assert.equal(f.creates,1);assert.equal(persisted.job.head_sha,changed.head.sha);assert.equal(persisted.round,1);
  assert.equal(persisted.history[0].event,'discard');assert.equal(persisted.history[0].kind,'review');
  f.io.runs=async()=>[{status:'running'}];
  await advance(persisted,admit(changed),f.io,config);await advance(persisted,admit(changed),f.io,config);
  assert.equal(f.creates,1);
});
test('blocked prior job resumes replacement preparation after a transport failure and restart',async()=>{
  const f=fake(),changed=structuredClone(raw);changed.head.sha='c'.repeat(40);
  const oldJob={kind:'review',round:1,pr_number:8,issue_id:'old-review',agent_id:'reviewer',head_sha:live.head_sha,base_sha:live.base_sha};
  const stalePending={kind:'review',round:2,pr_number:8,agent_id:'reviewer',head_sha:live.head_sha,base_sha:live.base_sha,admission_hash:live.admission_hash,title:'stale-review',worktree:'/stale',description:'stale',description_hash:'stale',prepared_at:'then'};
  const s={...state(),round:1,status:'BLOCKED',admission_hash:live.admission_hash,job:oldJob,pending:stalePending};
  let persisted,prepareCalls=0;const saved=[];
  f.io.live=async()=>changed;f.io.save=async value=>{persisted=structuredClone(value);saved.push(persisted);};
  f.io.prepare=async job=>{
    prepareCalls++;assert.equal(job.kind,'review');assert.equal(job.head_sha,changed.head.sha);
    if(prepareCalls === 1) {const error=new Error('git fetch unavailable');error.transport=true;throw error;}
    return '/fresh-review';
  };
  await assert.rejects(()=>advance(s,admit(changed),f.io,config),error=>error.transport === true);
  assert(!saved.some(value=>value.pending === null),'replacement must atomically supersede stale pending');
  assert.equal(persisted.status,'BLOCKED');assert.equal(persisted.pending.head_sha,changed.head.sha);
  assert.equal(persisted.pending.prepared_at,undefined);assert.equal(f.creates,0);
  const restarted=structuredClone(persisted);
  await advance(restarted,admit(changed),f.io,config);
  assert.equal(prepareCalls,2);assert.equal(f.creates,1);assert.equal(restarted.status,'REVIEWING');
  assert.equal(restarted.round,2);assert.equal(restarted.job.head_sha,changed.head.sha);
});
test('stale pending fix discards old findings and starts a fresh review',async()=>{
  const f=fake(),changed=structuredClone(raw);changed.head.sha='c'.repeat(40);
  const staleFix={kind:'fix',round:1,pr_number:8,agent_id:'fixer',head_sha:live.head_sha,base_sha:live.base_sha,admission_hash:live.admission_hash,title:'stale-fix',worktree:'/stale-fix',description:'stale',description_hash:'stale',prepared_at:'then',raw_review_sha256:'d'.repeat(64),source_review_issue_id:'review-issue',source_comment_id:'review-comment'};
  const s={...state(),round:1,status:'BLOCKED',admission_hash:live.admission_hash,job:{kind:'review',round:1,issue_id:'review-issue',head_sha:live.head_sha,base_sha:live.base_sha},pending:staleFix};
  f.io.live=async()=>changed;
  await advance(s,admit(changed),f.io,config);
  assert.equal(f.creates,1);assert.equal(s.job.kind,'review');assert.equal(s.job.round,2);assert.equal(s.job.head_sha,changed.head.sha);
  assert.equal(s.history[0].event,'discard');assert.equal(s.history[0].kind,'fix');
  assert.equal(s.job.raw_review_sha256,undefined);assert.equal(s.job.source_comment_id,undefined);
});
test('newly observed dispatch candidate is spec-checked before create',async()=>{
  const f=fake(),s=state(),changed=structuredClone(raw);changed.head.sha='c'.repeat(40);let prepared=false;
  f.io.prepare=async()=>{prepared=true;return '/worktree';};
  f.io.live=async()=>changed;
  f.io.checkSpecs=async candidate=>{assert(prepared);assert.equal(candidate.head_sha,changed.head.sha);throw new Error('spec missing or symlink');};
  await assert.rejects(()=>ensureDispatch(s,live,'review',f.io,config),/spec missing or symlink/);
  assert.equal(f.creates,0);assert.equal(s.pending.head_sha,changed.head.sha);assert.equal(s.pending.attempted_at,undefined);
});
test('conflicting existing issue or changed admission cannot dispatch',async()=>{
  const f=fake(),s=state();await ensureDispatch(s,live,'review',f.io,config);
  s.pending=s.job;s.job=null;f.issues[0].assignee_id='other';
  await assert.rejects(()=>ensureDispatch(s,live,'review',f.io,config),/conflict/);
  await assert.rejects(()=>advance({...state(),admission_hash:'other'},live,f.io,config),/admission changed/);
});
test('three reviews exhausted stays blocked on external push',async()=>{
  const f=fake(),s={...state(),round:3,status:'PASS',admission_hash:live.admission_hash,job:{head_sha:'c'.repeat(40),base_sha:live.base_sha}};
  await assert.rejects(()=>advance(s,live,f.io,config),/round limit/);assert.equal(f.creates,0);
});

function exhausted(prNumber=8,observed=live) {
  const source={event:'result',transition:'BLOCKED',round:3,issue_id:'third-review',head_sha:observed.head_sha,base_sha:observed.base_sha,sha256:'d'.repeat(64)};
  return {...state(),protocol_version:'review-loop/v2.1',pr_number:prNumber,round:3,status:'BLOCKED',admission_hash:observed.admission_hash,
    history:[source],result:{issue_id:source.issue_id,sha256:source.sha256},
    job:{kind:'review',round:3,pr_number:prNumber,issue_id:source.issue_id,head_sha:observed.head_sha,base_sha:observed.base_sha}};
}
test('explicit operator authorization preserves history and permits only a fourth review',async()=>{
  const f=fake(),s=exhausted(),previous=structuredClone(s.history),changed=structuredClone(raw);changed.head.sha='c'.repeat(40);
  authorizeExtraReview(s,'user approved PR 8 extension');
  assert.equal(s.round,3);assert.deepEqual(s.history.slice(0,1),previous);
  assert.throws(()=>authorizeExtraReview(s,'repeat'),/exhausted blocked/);
  f.io.live=async()=>changed;f.io.runs=async()=>[{status:'completed'}];
  await advance(s,admit(changed),f.io,config);
  assert.equal(s.round,4);assert.equal(s.status,'REVIEWING');assert.equal(f.creates,1);
  s.status='PASS';changed.head.sha='e'.repeat(40);
  await assert.rejects(()=>advance(s,admit(changed),f.io,config),/round limit/);
  assert.equal(f.creates,1);
});
test('a fifth review needs a second bound approval and keeps both authorizations; no sixth',async()=>{
  const raw11=structuredClone(raw);raw11.number=11;const live11=admit(raw11);
  const s=exhausted(11,live11);authorizeExtraReview(s,'fourth approved');
  const source={...s.history[0],round:4,issue_id:'fourth-review',sha256:'e'.repeat(64)};
  s.history.push(source);s.round=4;s.status='BLOCKED';s.job={...s.job,round:4,issue_id:source.issue_id};
  s.result={issue_id:source.issue_id,sha256:source.sha256};
  const before=structuredClone(s.history);
  authorizeExtraReview(s,'fifth explicitly approved');
  assert.deepEqual(s.history.slice(0,-1),before);assert.equal(s.extra_review_authorization.max_rounds,5);
  assert.throws(()=>authorizeExtraReview(s,'repeat'));
  const f=fake(),changed=structuredClone(raw11);changed.head.sha='f'.repeat(40);
  f.io.live=async()=>changed;f.io.runs=async()=>[{status:'completed'}];
  await advance(s,admit(changed),f.io,config);assert.equal(s.round,5);assert.equal(f.creates,1);
  s.status='BLOCKED';assert.throws(()=>authorizeExtraReview(s,'sixth'));
  s.status='PASS';changed.head.sha='e'.repeat(40);
  await assert.rejects(()=>advance(s,admit(changed),f.io,config),/round limit/);
  const missing=structuredClone(s);missing.history=missing.history.filter(e=>e.event!=='authorize_extra_review');
  await assert.rejects(()=>advance(missing,live11,fake().io,config),/prior fourth/);
  const other=structuredClone(s);other.pr_number=12;other.extra_review_authorization.pr_number=12;
  await assert.rejects(()=>advance(other,live11,fake().io,config),/authorization/);
});
function rejectedFourth() {
  const s=exhausted();authorizeExtraReview(s,'fourth approved');
  s.round=4;s.status='BLOCKED';s.reason='contradictory verdict';
  s.job={...s.job,round:4,issue_id:'fourth-review'};
  const result={comment_id:'fourth-comment',run_id:'fourth-run',sha256:'e'.repeat(64),rejection_reason:'contradictory verdict'};
  const request={pr_number:8,round:4,review_issue_id:'fourth-review',comment_id:'fourth-comment',run_id:'fourth-run',raw_review_sha256:'e'.repeat(64),review_base_sha:s.job.base_sha,review_head_sha:s.job.head_sha,current_base_sha:s.job.base_sha,current_head_sha:'f'.repeat(40),approval_ref:'fifth approved'};
  return {s,result,request};
}
test('invalid terminal review recovery preserves the rejection and grants only one fifth review',()=>{
  const {s,result,request}=rejectedFourth(),oldResult=structuredClone(s.result);
  recoverRejectedTerminalReview(s,result,request,'2026-09-22T00:00:00Z');
  assert.deepEqual(s.result,oldResult);assert.equal(s.status,'REVIEWING');assert.equal(s.round,4);
  assert.equal(s.extra_review_authorization.max_rounds,5);
  const rejected=s.history.at(-2),authorization=s.history.at(-1);
  assert.equal(rejected.event,'reject_invalid_review_result');assert.equal(rejected.reason,'contradictory verdict');assert.equal(rejected.comment_id,result.comment_id);
  assert.equal(authorization.event,'authorize_extra_review');assert.equal(authorization.result_sha256,result.sha256);
  assert.throws(()=>recoverRejectedTerminalReview(s,result,request),/requires contradictory terminal review/);
});
test('invalid terminal review recovery rejects wrong identity, hash and missing prior authorization',()=>{
  for(const change of [x=>x.request.review_issue_id='other',x=>x.request.comment_id='other',x=>x.request.run_id='other',x=>x.request.raw_review_sha256='f'.repeat(64),x=>x.request.review_head_sha='f'.repeat(40)]) {
    const fixture=rejectedFourth();change(fixture);assert.throws(()=>recoverRejectedTerminalReview(fixture.s,fixture.result,fixture.request));
  }
  const {s,result,request}=rejectedFourth();delete s.extra_review_authorization;s.history=s.history.filter(e=>e.event!=='authorize_extra_review');
  assert.throws(()=>recoverRejectedTerminalReview(s,result,request),/authorized fourth review/);
});

test('extension cannot be copied to another PR or bypass an unrelated block',async()=>{
  const s=exhausted();authorizeExtraReview(s,'user approved PR 8 extension');s.pr_number=9;
  await assert.rejects(()=>advance(s,live,fake().io,config),/authorization/);
  for(const change of [s=>s.round=2,s=>s.status='PASS',s=>s.pending={attempted_at:'unknown'},s=>s.history=[]]) {
    const candidate=exhausted();change(candidate);
    assert.throws(()=>authorizeExtraReview(candidate,'user approval'));
  }
});
test('obsolete completed review is discarded before its missing result is parsed',async()=>{
  const f=fake(),s={...state(),round:1,status:'REVIEWING',admission_hash:live.admission_hash,job:{kind:'review',round:1,pr_number:8,issue_id:'old',agent_id:'reviewer',head_sha:live.head_sha,base_sha:live.base_sha}};
  const changed=structuredClone(raw);changed.head.sha='c'.repeat(40);changed.marker='fresh-candidate';
  f.io.live=async()=>changed;f.io.runs=async()=>[{status:'completed'}];
  f.io.issue=async()=>{throw new Error('obsolete result must not be read');};
  f.io.comments=f.io.issue;
  await advance(s,live,f.io,config);
  assert.equal(s.round,2);assert.equal(s.status,'REVIEWING');assert.equal(f.creates,1);
  assert.equal(s.history[0].event,'discard');assert.equal(s.history[0].snapshot.sha256,changed.head.sha);
});
test('obsolete completed review respects the global three-round cap',async()=>{
  const f=fake(),s={...state(),round:3,status:'REVIEWING',admission_hash:live.admission_hash,job:{kind:'review',round:3,pr_number:8,issue_id:'old',agent_id:'reviewer',head_sha:live.head_sha,base_sha:live.base_sha}};
  const changed=structuredClone(raw);changed.base.sha='c'.repeat(40);
  f.io.live=async()=>changed;f.io.runs=async()=>[{status:'completed'}];
  await advance(s,live,f.io,config);
  assert.equal(s.status,'BLOCKED');assert.match(s.reason,/round limit/);assert.equal(f.creates,0);
});
function fixFixture() {
  const f=fake(),nextHead='c'.repeat(40),rawReviewSha='d'.repeat(64),changed=structuredClone(raw);
  changed.head.sha=nextHead;
  const job={kind:'fix',round:1,pr_number:8,issue_id:'fix-id',agent_id:'fixer',head_sha:live.head_sha,base_sha:live.base_sha,raw_review_sha256:rawReviewSha};
  const s={...state(),round:1,status:'FIXING',admission_hash:live.admission_hash,job};
  const result={protocol_version:'review-loop/v2.1',pr_number:8,base_sha:live.base_sha,previous_head_sha:live.head_sha,head_sha:nextHead,round:1,raw_review_sha256:rawReviewSha};
  const comment={id:'fix-comment',author_type:'agent',author_id:'fixer',issue_id:'fix-id',source_task_id:'fix-run',content:'fixed\n```review-loop-fix\n'+JSON.stringify(result)+'\n```'};
  const run={id:'fix-run',issue_id:'fix-id',agent_id:'fixer',status:'completed'};
  Object.assign(f.io,{live:async()=>changed,runs:async()=>[run],issue:async()=>({id:'fix-id',assignee_type:'agent',assignee_id:'fixer'}),comments:async()=>[comment],verifyCheckout:async()=>{},archiveResult:async()=>{}});
  return {f,s,changed,job,result,comment,run};
}
test('changed live head does not bypass failed, missing or untrusted fixer results',async()=>{
  const cases=[
    x=>{x.run.status='failed';return /result run not completed/;},
    x=>{x.f.io.comments=async()=>[];return /missing\/conflicting results/;},
    x=>{x.comment.author_id='reviewer';return /untrusted result author/;},
  ];
  for(const change of cases) {
    const x=fixFixture(),expected=change(x);let verified=false;
    x.f.io.verifyCheckout=async()=>{verified=true;};
    await assert.rejects(()=>advance(x.s,live,x.f.io,config),expected);
    assert.equal(verified,false);assert.equal(x.f.creates,0);
  }
});
test('valid new-head fix reaches fresh review only after source and checkout verification',async()=>{
  const {f,s,changed,job,result}=fixFixture();let verified=false,archived=false;
  f.io.verifyCheckout=async(actualJob,parsed,decisionLive)=>{
    assert.equal(actualJob,job);assert.deepEqual(parsed.data,result);assert.equal(decisionLive.head_sha,changed.head.sha);verified=true;
  };
  f.io.archiveResult=async()=>{assert(verified);archived=true;};
  f.io.prepare=async()=>{assert(verified);assert(archived);return '/fresh-review-worktree';};
  await advance(s,live,f.io,config);
  assert(verified);assert(archived);assert.equal(f.creates,1);assert.equal(s.status,'REVIEWING');assert.equal(s.round,2);
  assert.equal(s.history[0].event,'result');assert.equal(s.history[0].transition,'DISCARD_AND_REVIEW');
});
