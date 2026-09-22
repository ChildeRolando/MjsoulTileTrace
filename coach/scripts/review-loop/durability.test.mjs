const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { advance, advanceDurability, captureDurability, jobDescription, reviewerInstructions } from './controller.mjs';
import { VERSION, GATES, REPOSITORY, admit, hash } from './protocol.mjs';
const config={reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project'};
const head='a'.repeat(40),base='b'.repeat(40);
const finding=()=>({id:'gap',path:'coach/scripts/check-architecture.mjs',line:1,scenario:'checker blind spot',consequence:'future edits can bypass',minimal_fix:'add regression and document limitation',durability:'repository_required',durable_owner:'coach/docs/development/INVARIANTS.md',regression:{path:'coach/scripts/check-architecture.test.mjs',command:'npm run test:architecture-checker'},basis:'future_limitation'});
function fixture(severity='P3',f=finding()) {
  const raw={number:10,state:'open',draft:false,body:'```review-loop-admission\n'+JSON.stringify({protocol_version:VERSION,authoritative_spec_paths:['coach/docs/specs/2026-09-20-review-loop-v2.md'],rubric:'all criteria'})+'\n```',base:{sha:base,ref:'master',repo:{full_name:REPOSITORY}},head:{sha:head,ref:'feature',repo:{full_name:REPOSITORY}}};
  const live=admit(raw),job={kind:'review',issue_id:'review',agent_id:'reviewer',round:1,pr_number:10,head_sha:head,base_sha:base};
  const s={protocol_version:VERSION,pr_number:10,round:1,status:'REVIEWING',history:[],job,admission_hash:live.admission_hash};
  const data={protocol_version:VERSION,pr_number:10,base_sha:base,head_sha:head,round:1,verdict:severity === 'P3' ? 'NO_P1_P2' : 'CHANGES_REQUIRED',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:[]};
  data.findings[severity]=[f];
  const comment={id:'review-comment',author_type:'agent',author_id:'reviewer',issue_id:'review',source_task_id:'review-run',content:'Complete review\n```review-loop-result\n'+JSON.stringify(data)+'\n```'};
  const reviewRun={id:'review-run',issue_id:'review',agent_id:'reviewer',status:'completed'};
  const issues=[],saves=[],archives=[];let created=0,verified=0;
  const io={live:async()=>raw,snapshot:async()=>({sha256:hash('snapshot')}),checkSpecs:async()=>{},
    save:async state=>saves.push(structuredClone(state)),prepare:async j=>`/worktree/${j.identity ?? j.kind}`,
    issues:async()=>issues,saveReview:async(j,content)=>{assert.equal(hash(content),j.raw_review_sha256);return '/review.txt';},
    create:async j=>{created++;assert(saves.some(s=>s.pending?.attempted_at || s.durability?.some(d=>d.identity===j.identity && d.attempted_at)));
      const issue={id:`issue-${created}`,identifier:`COAC-${created}`,title:j.title,description:j.description,assignee_type:'agent',assignee_id:j.agent_id,project_id:'project'};issues.push(issue);return issue;},
    runs:async id=>id === 'review' ? [reviewRun] : [{status:'running'}],
    issue:async()=>({id:'review',assignee_type:'agent',assignee_id:'reviewer'}),comments:async()=>[comment],
    verifyCheckout:async()=>{},archiveResult:async(j,r)=>archives.push({job:structuredClone(j),result:structuredClone(r)}),
    verifyDurability:async()=>{verified++;return {commit_sha:'c'.repeat(40)};}};
  return {s,io,job,live,raw,comment,data,issues,saves,archives,get created(){return created;},get verified(){return verified;}};
}
test('P3 ephemeral PASS creates no durability work',async()=>{
  const x=fixture('P3',{...finding(),durability:'ephemeral',durable_owner:null,regression:null,basis:'local_observation'});
  await advance(x.s,x.live,x.io,config);await advanceDurability(x.s,x.io,config);
  assert.equal(x.s.status,'PASS');assert.equal(x.s.durability.length,0);assert.equal(x.created,0);
});
test('P3 required PASS has exactly one follow-up across duplicate ticks and restart',async()=>{
  const x=fixture();await advance(x.s,x.live,x.io,config);assert.equal(x.s.status,'PASS');
  await advanceDurability(x.s,x.io,config);const restarted=structuredClone(x.s);
  await advance(restarted,x.live,x.io,config);await advanceDurability(restarted,x.io,config);
  assert.equal(x.created,1);assert.equal(restarted.status,'PASS');assert.equal(restarted.round,1);
  assert.match(restarted.durability[0].description,/DURABLE_KNOWLEDGE_BLOCKED/);
  assert.equal(restarted.durability[0].raw_review,x.comment.content);
  assert.match(restarted.durability[0].title,/\[知识持久化\]/);
  assert.match(restarted.durability[0].description,/将这项非阻断 finding 持久化/);
  assert(!restarted.durability[0].description.includes('Persist this non-blocking finding'));
});
for(const severity of ['P1','P2'])test(`${severity} required still uses Fixer with exact raw metadata`,async()=>{
  const x=fixture(severity);await advance(x.s,x.live,x.io,config);
  assert.equal(x.s.status,'FIXING');assert.equal(x.s.job.kind,'fix');assert.equal(x.s.durability.length,0);
  assert.equal(x.s.job.raw_review_sha256,hash(x.comment.content));
  assert.equal(x.archives[0].result.raw,x.comment.content);
  assert.match(x.s.job.description,/durability metadata/);assert.match(x.s.job.description,/权威 owner/);
});
test('durability create response lost reconciles; unknown send never duplicates',async()=>{
  for(const createdOnServer of [true,false]) {
    const x=fixture();await advance(x.s,x.live,x.io,config);const create=x.io.create;
    x.io.create=async j=>{if(createdOnServer)await create(j);throw Object.assign(new Error('lost'),{transport:true});};
    await advanceDurability(x.s,x.io,config);x.io.create=create;
    const restarted=structuredClone(x.s);await advanceDurability(restarted,x.io,config);
    assert.equal(x.created,createdOnServer ? 1 : 0);assert.equal(restarted.status,'PASS');
    assert.equal(restarted.durability[0].status,createdOnServer ? 'WAITING' : 'DURABLE_KNOWLEDGE_BLOCKED');
  }
});
function receipt(x) {
  const j=x.s.durability[0];
  const r={protocol_version:VERSION,pr_number:j.pr_number,base_sha:j.base_sha,head_sha:j.head_sha,round:j.round,identity:j.identity,raw_review_sha256:j.raw_review_sha256,finding_id:j.finding.id,commit_sha:'c'.repeat(40),branch:`review-loop/durability/${j.identity}`,artifacts:[{path:j.finding.durable_owner,sha256:hash('owner')},{path:j.finding.regression.path,sha256:hash('test')}],checks:[{command:j.finding.regression.command,status:'PASS',exit_code:0}]};
  const comment={id:'durable-comment',author_type:'agent',author_id:'fixer',issue_id:j.issue_id,source_task_id:'durable-run',content:''};
  const run={id:'durable-run',issue_id:j.issue_id,agent_id:'fixer',status:'completed'};
  x.io.issue=async()=>({id:j.issue_id,assignee_type:'agent',assignee_id:'fixer',status:'done'});
  x.io.runs=async()=>[run];x.io.comments=async()=>[{...comment,content:'```review-loop-durability\n'+JSON.stringify(r)+'\n```'}];
  return {r,comment,run,j};
}
test('only verified repository commit completes; review source remains byte-identical',async()=>{
  const x=fixture();await advance(x.s,x.live,x.io,config);await advanceDurability(x.s,x.io,config);
  const {j}=receipt(x),source=j.raw_review,reviewResult=structuredClone(x.s.result);
  x.io.verifyDurability=async()=>{throw new Error('artifact not committed');};await advanceDurability(x.s,x.io,config);
  assert.equal(j.status,'DURABLE_KNOWLEDGE_BLOCKED');assert.equal(j.completion,undefined);assert.equal(x.s.status,'PASS');
  x.io.verifyDurability=async()=>({commit_sha:'c'.repeat(40),artifacts:['verified']});await advanceDurability(x.s,x.io,config);
  assert.equal(j.status,'COMPLETE');assert.equal(j.completion.comment_id,'durable-comment');assert.equal(j.raw_review,source);assert.deepEqual(x.s.result,reviewResult);
  const count=x.s.history.length;await advanceDurability(x.s,x.io,config);assert.equal(x.s.history.length,count);
});
test('transport failure remains retryable instead of becoming a semantic durability block',async()=>{
  const x=fixture();await advance(x.s,x.live,x.io,config);await advanceDurability(x.s,x.io,config);
  const {j}=receipt(x);x.io.verifyDurability=async()=>{const e=new Error('origin unavailable');e.transport=true;throw e;};
  await advanceDurability(x.s,x.io,config);
  assert.equal(j.status,'RETRY_IO');assert.equal(j.completion,undefined);assert.match(j.error,/origin unavailable/);
});
test('untrusted, missing, mismatched and incomplete durability receipts cannot complete',async()=>{
  for(const change of [y=>y.comment.author_id='other',y=>y.run.status='failed',y=>y.r.head_sha='d'.repeat(40),y=>y.r.identity='other',y=>y.r.raw_review_sha256='e'.repeat(64),y=>y.r.artifacts.pop(),y=>y.r.checks[0].exit_code=1,y=>y.r.commit_sha=head,y=>y.r.extra=true]) {
    const x=fixture();await advance(x.s,x.live,x.io,config);await advanceDurability(x.s,x.io,config);change(receipt(x));
    await advanceDurability(x.s,x.io,config);assert.equal(x.s.durability[0].status,'DURABLE_KNOWLEDGE_BLOCKED');assert.equal(x.verified,0);
  }
  const x=fixture();await advance(x.s,x.live,x.io,config);await advanceDurability(x.s,x.io,config);receipt(x);x.io.comments=async()=>[];
  await advanceDurability(x.s,x.io,config);assert.equal(x.s.durability[0].completion,undefined);
});
test('stale result never queues; captured old source survives head change and result replacement',async()=>{
  const stale=fixture();stale.raw.head.sha='d'.repeat(40);await advance(stale.s,stale.live,stale.io,config);
  assert.equal(stale.s.durability,undefined);assert.equal(stale.s.job.kind,'review');
  const x=fixture();await advance(x.s,x.live,x.io,config);const original=structuredClone(x.s.durability[0]);
  const replacement={data:x.data,raw:'replacement',sha256:hash('replacement'),comment_id:'new-comment',run_id:'new-run'};
  await captureDurability(x.s,x.job,replacement,x.live,x.io,config);await captureDurability(x.s,x.job,replacement,x.live,x.io,config);
  assert.equal(x.s.durability.length,2);assert.deepEqual(x.s.durability[0],original);assert.notEqual(x.s.durability[1].identity,original.identity);
  x.raw.head.sha='e'.repeat(40);await advanceDurability(x.s,x.io,config);
  assert(x.s.durability.every(j=>j.head_sha===head));assert.equal(x.created,2);
});
test('reviewer prompt includes independent durability and explicit-claim calibration',()=>{
  const x=fixture();const prompt=jobDescription(x.job,x.live);
  assert(prompt.includes(reviewerInstructions));assert.match(prompt,/COAC-26/);assert.match(prompt,/至少按 P2/);assert.match(prompt,/只读评审/);
  assert.match(prompt,/P3 repository_required 仍可不阻断当前 PR/);assert.match(prompt,/完整保留 durability metadata/);
});
