const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { admit, parseResult, decide, GATES, hash } from './protocol.mjs';

const sha = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = () => ({ number: 8, state: 'open', draft: false, body: '```review-loop-admission\n' + JSON.stringify({protocol_version:'review-loop/v2', authoritative_spec_paths:['coach/docs/specs/example.md'], rubric:'Review all acceptance criteria.'}) + '\n```', base:{sha:base,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}, head:{sha,ref:'codex/test',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}} });
const job = () => ({kind:'review',issue_id:'review-id',agent_id:'reviewer-id',round:1,base_sha:base,head_sha:sha,pr_number:8,admission_hash:hash('admission')});
const result = () => ({protocol_version:'review-loop/v2',pr_number:8,base_sha:base,head_sha:sha,round:1,verdict:'NO_P1_P2',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:[]});
const comment = (r=result()) => ({id:'comment-id',author_type:'agent',author_id:'reviewer-id',issue_id:'review-id',source_task_id:'run-id',content:'Full findings\n```review-loop-result\n'+JSON.stringify(r)+'\n```'});
const runs = [{id:'run-id',issue_id:'review-id',agent_id:'reviewer-id',status:'completed'}];
const read = (comments=[comment()], j=job(), issue={id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'}) => parseResult(j,issue,comments,runs);

test('admission pins repository, SHA, exact spec paths and version', () => {
  assert.equal(admit(pr()).head_sha,sha);
  for (const change of [p=>p.draft=true,p=>p.state='closed',p=>p.head.repo.full_name='other/fork',p=>p.head.sha='short',p=>p.body=p.body.replace('example.md','../escape.md'),p=>p.body+=p.body,p=>p.body=p.body.replace('v2','v1')]) {
    const p=pr(); change(p); assert.throws(()=>admit(p));
  }
});
test('clean and P3-only reviews pass; P1/P2 route exact raw bytes', () => {
  assert.equal(decide(job(),read(),admit(pr())).transition,'PASS');
  const r=result(); r.findings.P3.push({id:'style',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'});
  assert.equal(decide(job(),read([comment(r)]),admit(pr())).transition,'PASS');
  r.findings.P2=r.findings.P3; r.findings.P3=[]; r.verdict='CHANGES_REQUIRED';
  const c=comment(r), parsed=read([c]);
  assert.equal(parsed.raw,c.content); assert.equal(parsed.sha256,hash(c.content));
  assert.equal(decide(job(),parsed,admit(pr())).transition,'ROUTE_TO_FIXER');
});
test('forged author, wrong issue, non-terminal run, duplicate results fail closed', () => {
  for(const change of [c=>c.author_id='fixer',c=>c.author_type='member',c=>c.issue_id='other',c=>c.source_task_id='other']) {
    const c=comment(); change(c); assert.throws(()=>read([c]));
  }
  assert.throws(()=>read([comment(),{...comment(),id:'second'}]));
  assert.throws(()=>parseResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment()],[{...runs[0],status:'running'}]));
});
test('missing/duplicate/unknown gates and contradictory verdicts fail closed', () => {
  for(const change of [r=>r.gates.pop(),r=>r.gates[1]=r.gates[0],r=>r.gates[0].command='echo pass',r=>r.gates[0].exit_code=1,r=>r.extra=true,r=>r.findings.P1.push({}),r=>r.verdict='CHANGES_REQUIRED']) {
    const r=result(); change(r); assert.throws(()=>read([comment(r)]));
  }
});
test('valid gate failures/environment block even without findings', () => {
  const r=result(); r.verdict='ENVIRONMENT_BLOCKED';r.gates[0].status='FAIL';r.gates[0].exit_code=1;r.environment_failures=['build environment unavailable'];
  assert.equal(decide(job(),read([comment(r)]),admit(pr())).transition,'BLOCKED');
});
test('stale base/head requires fresh round; cap is global per PR', () => {
  const live=admit(pr()); live.head_sha='c'.repeat(40);
  assert.equal(decide(job(),read(),live).transition,'DISCARD_AND_REVIEW');
  assert.equal(decide({...job(),round:3},read(),live).transition,'BLOCKED');
  live.head_sha=sha;live.base_sha='c'.repeat(40);
  assert.equal(decide(job(),read(),live).transition,'DISCARD_AND_REVIEW');
});
test('fixer must push a new live SHA before another review', () => {
  const j={...job(),kind:'fix'}, live=admit(pr());
  assert.equal(decide(j,{data:{head_sha:sha}},live).transition,'BLOCKED');
  live.head_sha='c'.repeat(40);
  assert.equal(decide(j,{data:{head_sha:live.head_sha}},live).transition,'DISCARD_AND_REVIEW');
  assert.equal(decide({...j,round:3},{data:{head_sha:live.head_sha}},live).transition,'BLOCKED');
});
