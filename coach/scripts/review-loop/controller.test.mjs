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
  return {issues,saves,get creates(){return creates;},io:{prepare:async()=>'/worktree',save:async s=>saves.push(structuredClone(s)),issues:async()=>issues,live:async()=>raw,create:async j=>{creates++;const issue={id:'id',identifier:'COAC-20',title:j.title,description:j.description,assignee_id:j.agent_id,assignee_type:'agent',project_id:config.project_id};issues.push(issue);return issue;}}};
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
