const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { ensureDispatch, advance } from './controller.mjs';
import { admit } from './protocol.mjs';
const config={reviewer_id:'reviewer',fixer_id:'fixer',project_id:'project'};
const raw={number:8,state:'open',draft:false,body:'```review-loop-admission\n{"protocol_version":"review-loop/v2","authoritative_spec_paths":["coach/docs/specs/a.md"],"rubric":"all criteria"}\n```',base:{sha:'a'.repeat(40),repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:'b'.repeat(40),ref:'codex/a',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}};
const live=admit(raw);
const state=()=>({round:0,history:[],status:'NEW'});
function fake() {
  const issues=[], saves=[];let creates=0;
  return {issues,saves,get creates(){return creates;},io:{prepare:async()=>'/worktree',save:async s=>saves.push(structuredClone(s)),issues:async()=>issues,live:async()=>raw,snapshot:async value=>({semantics:'test',sha256:value.head.sha,observed_at:'now'}),create:async j=>{creates++;const issue={id:'id',identifier:'COAC-20',title:j.title,description:j.description,assignee_id:j.agent_id,assignee_type:'agent',project_id:config.project_id};issues.push(issue);return issue;}}};
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
