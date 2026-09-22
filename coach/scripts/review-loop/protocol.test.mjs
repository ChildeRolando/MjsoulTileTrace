const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { admit, parseResult, parseRejectedReviewResult, decide, GATES, hash } from './protocol.mjs';

const sha = 'a'.repeat(40), base = 'b'.repeat(40);
const pr = () => ({ number: 8, state: 'open', draft: false, body: '```review-loop-admission\n' + JSON.stringify({protocol_version:'review-loop/v2.1', authoritative_spec_paths:['coach/docs/specs/example.md'], rubric:'Review all acceptance criteria.'}) + '\n```', base:{sha:base,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}, head:{sha,ref:'codex/test',repo:{full_name:'ChildeRolando/MjsoulTileTrace'}} });
const job = () => ({kind:'review',issue_id:'review-id',agent_id:'reviewer-id',round:1,base_sha:base,head_sha:sha,pr_number:8,admission_hash:hash('admission')});
const result = () => ({protocol_version:'review-loop/v2.1',pr_number:8,base_sha:base,head_sha:sha,round:1,verdict:'NO_P1_P2',findings:{P1:[],P2:[],P3:[]},gates:Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0})),environment_failures:[]});
const comment = (r=result()) => ({id:'comment-id',author_type:'agent',author_id:'reviewer-id',issue_id:'review-id',source_task_id:'run-id',content:'Full findings\n```review-loop-result\n'+JSON.stringify(r)+'\n```'});
const runs = [{id:'run-id',issue_id:'review-id',agent_id:'reviewer-id',status:'completed'}];
const read = (comments=[comment()], j=job(), issue={id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'}) => parseResult(j,issue,comments,runs);

test('legacy findings without durability fail closed',()=>{
  const r=result();r.findings.P3=[{id:'gap',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'}];
  assert.throws(()=>read([comment(r)]));
});

test('strict durability metadata and COAC-26 explicit architecture claim calibration',()=>{
  const finding={id:'architecture-bypass',path:'coach/scripts/check-architecture.mjs',line:1,scenario:'review_report_generation_seam admits a bypass',consequence:'explicit acceptance claim is false',minimal_fix:'enforce seam and add regression',durability:'repository_required',durable_owner:'coach/docs/development/INVARIANTS.md',regression:{path:'coach/scripts/check-architecture.test.mjs',command:'npm run test:architecture-checker'},basis:'explicit_contract_violation'};
  const r=result();r.findings.P3=[finding];
  assert.throws(()=>read([comment(r)]),/requires P1\/P2/);
  r.findings.P2=r.findings.P3;r.findings.P3=[];r.verdict='CHANGES_REQUIRED';
  assert.equal(decide(job(),read([comment(r)]),admit(pr())).transition,'ROUTE_TO_FIXER');
  for(const change of [f=>delete f.durability,f=>f.durability='optional',f=>f.durable_owner=null,f=>f.durable_owner='../outside',f=>delete f.regression,f=>f.regression={path:'coach/a.test.mjs'},f=>f.basis='guessed',f=>f.durability='ephemeral',f=>f.extra=true]) {
    const malformed=structuredClone(r);change(malformed.findings.P2[0]);assert.throws(()=>read([comment(malformed)]));
  }
  const legacy=result();legacy.protocol_version='review-loop/v2';assert.throws(()=>read([comment(legacy)]));
});

test('admission pins repository, SHA, exact spec paths and version', () => {
  assert.equal(admit(pr()).head_sha,sha);
  for (const change of [p=>p.draft=true,p=>p.state='closed',p=>p.head.repo.full_name='other/fork',p=>p.head.sha='short',p=>p.body=p.body.replace('example.md','../escape.md'),p=>p.body+=p.body,p=>p.body=p.body.replace('v2','v1')]) {
    const p=pr(); change(p); assert.throws(()=>admit(p));
  }
});
test('clean and P3-only reviews pass; P1/P2 route exact raw bytes', () => {
  assert.equal(decide(job(),read(),admit(pr())).transition,'PASS');
  const r=result(); r.findings.P3.push({durability:'ephemeral',durable_owner:null,regression:null,basis:'local_observation',id:'style',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'});
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
test('operator recovery accepts only a fully valid review rejected for a contradictory verdict',()=>{
  const r=result();r.verdict='CHANGES_REQUIRED';r.findings.P2=[{durability:'repository_required',durable_owner:'coach/docs/specs/example.md',regression:null,basis:'explicit_contract_violation',id:'p2',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'}];r.environment_failures=['historical recovered failure'];
  const c=comment(r),rejected=parseRejectedReviewResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[c],runs);
  assert.equal(rejected.rejection_reason,'contradictory verdict');assert.equal(rejected.raw,c.content);assert.equal(rejected.sha256,hash(c.content));
  const wrong=structuredClone(c);wrong.author_id='other';
  assert.throws(()=>parseRejectedReviewResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[wrong],runs),/unsupported review-result rejection/);
  assert.throws(()=>parseRejectedReviewResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment()],runs),/already protocol-valid/);
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

for(const limit of [4,5]) test(`authorized round ${limit} preserves all result gates and never opens another round`,()=>{
  const j={...job(),round:limit},r={...result(),round:limit};
  const parsed=read([comment(r)],j);
  assert.throws(()=>decide(j,parsed,admit(pr())),/round limit/);
  assert.equal(decide(j,parsed,admit(pr()),limit).transition,'PASS');
  r.verdict='CHANGES_REQUIRED';r.findings.P2=[{durability:'ephemeral',durable_owner:null,regression:null,basis:'local_observation',id:'remaining',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'}];
  assert.equal(decide(j,read([comment(r)],j),admit(pr()),limit).transition,'BLOCKED');
  r.verdict='ENVIRONMENT_BLOCKED';r.environment_failures=['gate failed'];r.gates[0].status='FAIL';r.gates[0].exit_code=1;
  assert.equal(decide(j,read([comment(r)],j),admit(pr()),limit).transition,'BLOCKED');
});
