const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { admit, parseResult, parseRejectedReviewResult, parseTransportRecoveryResult, decide, externalReviewTerminal, externalReviewAcceptance, GATES, hash } from './protocol.mjs';

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
test('transport recovery binds one completed source to the original failed review',()=>{
  const request={comment_id:'comment-id',run_id:'run-id',raw_review_sha256:hash(comment().content),review_base_sha:base,review_head_sha:sha,round:1};
  const failed={id:'failed',issue_id:'review-id',agent_id:'reviewer-id',status:'failed',failure_reason:'runtime_offline'};
  const source=[failed,...runs];
  assert.equal(parseTransportRecoveryResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment()],source,request).run_id,'run-id');
  for(const change of [r=>r[0].failure_reason='other',r=>r[0].issue_id='other',r=>r.push({...runs[0],id:'second'}),r=>r[1].status='running']) {
    const changed=structuredClone(source);change(changed);
    assert.throws(()=>parseTransportRecoveryResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment()],changed,request));
  }
  assert.throws(()=>parseTransportRecoveryResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment()],source,{...request,raw_review_sha256:'f'.repeat(64)}));
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
test('operator recovery rejects verdicts outside the complete review schema',()=>{
  for(const verdict of ['BOGUS',42,null]) {
    const r=result();r.verdict=verdict;
    assert.throws(()=>read([comment(r)]),/invalid verdict/);
    assert.throws(()=>parseRejectedReviewResult(job(),{id:'review-id',assignee_type:'agent',assignee_id:'reviewer-id'},[comment(r)],runs),/unsupported review-result rejection/);
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
test('shared external terminal guard accepts only the exact three-round candidate-change history',()=>{
  const base='b'.repeat(40),heads=['c','d','e'].map(value=>value.repeat(40)),admissionHash=admit(pr()).admission_hash;
  const history=[],snapshotContents=new Map();
  const candidateSnapshot=(head,marker,round)=>{
    const template=pr(),raw={...template,base:{...template.base,sha:base},head:{...template.head,sha:head},marker};
    const bytes=Buffer.from(JSON.stringify(raw)),ref={semantics:'github-rest-json-utf8/v1',sha256:hash(bytes),observed_at:`2026-09-2${round}T00:00:00.000Z`};
    snapshotContents.set(ref.sha256,bytes);return ref;
  };
  for(let round=1;round<=3;round++) {
    const issueId=`review-${round}`,head=heads[round-1],nextHead=heads[round] ?? 'f'.repeat(40),at=`2026-09-2${round}T00:00:00.000Z`;
    const dispatchSnapshot=candidateSnapshot(head,`dispatch-${round}`,round),discardSnapshot=candidateSnapshot(nextHead,`discard-${round}`,round);
    history.push({event:'dispatch',kind:'review',round,head_sha:head,base_sha:base,issue_id:issueId,snapshot:dispatchSnapshot,at});
    history.push({event:'discard',reason:'candidate changed before result consumption',round,head_sha:head,base_sha:base,issue_id:issueId,snapshot:discardSnapshot,at});
  }
  const state={protocol_version:'review-loop/v2.1',pr_number:8,round:3,status:'BLOCKED',reason:'round limit after candidate changed',
    admission_hash:admissionHash,result:null,history,job:{kind:'review',round:3,pr_number:8,issue_id:'review-3',agent_id:'reviewer',base_sha:base,head_sha:heads[2],admission_hash:admissionHash}};
  const live={pr_number:8,base_sha:base,head_sha:'f'.repeat(40),admission_hash:admissionHash};
  assert.equal(externalReviewTerminal(state,live,snapshotContents).kind,'candidate-change-exhaustion');
  for(const mutate of [
    s=>{s.history.pop();},
    s=>{s.history[2].issue_id=s.history[0].issue_id;},
    s=>{s.history[3].head_sha='f'.repeat(40);},
    s=>{s.history[4].unexpected=true;},
    s=>{s.result={issue_id:'review-3'};},
    s=>{s.extra_review_authorization={};},
    s=>{s.reason='review gates, environment or round limit';},
  ]) {
    const malformed=structuredClone(state);mutate(malformed);assert.throws(()=>externalReviewTerminal(malformed,live,snapshotContents));
  }
  const metadataOnly=structuredClone(state),dispatch=metadataOnly.history[0],discard=metadataOnly.history[1];
  const template=pr(),sameCandidate={...template,base:{...template.base,sha:dispatch.base_sha},head:{...template.head,sha:dispatch.head_sha},marker:'different metadata'};
  const sameBytes=Buffer.from(JSON.stringify(sameCandidate)),sameRef={semantics:'github-rest-json-utf8/v1',sha256:hash(sameBytes),observed_at:'2026-10-01T00:00:00.000Z'};
  snapshotContents.set(sameRef.sha256,sameBytes);discard.snapshot=sameRef;
  assert.notEqual(discard.snapshot.sha256,dispatch.snapshot.sha256);
  assert.throws(()=>externalReviewTerminal(metadataOnly,live,snapshotContents),/candidate did not change/);
  const acceptance={source:'external_independent_review',pr_number:8,review_issue_id:'external-review',comment_id:'external-comment',run_id:'external-run',
    raw_review_sha256:hash('raw'),issue_contract_sha256:hash('contract'),external_sequence:5,base_sha:live.base_sha,head_sha:live.head_sha,
    admission_hash:live.admission_hash,approval_ref:'human approval',accepted_at:'2026-10-01T00:00:00.000Z'};
  const accepted=structuredClone(state);accepted.external_review_acceptance=acceptance;accepted.history.push({event:'accept_external_review',...acceptance});
  assert.equal(externalReviewAcceptance(accepted,live,snapshotContents).source,'external_independent_review');
  assert.throws(()=>externalReviewAcceptance(accepted,{...live,head_sha:accepted.job.head_sha},snapshotContents),/discarded automatic candidate/);
});
test('fixer must push a new live SHA before another review', () => {
  const j={...job(),kind:'fix'}, live=admit(pr());
  assert.equal(decide(j,{data:{head_sha:sha}},live).transition,'BLOCKED');
  live.head_sha='c'.repeat(40);
  assert.equal(decide(j,{data:{head_sha:live.head_sha}},live).transition,'DISCARD_AND_REVIEW');
  assert.equal(decide({...j,round:3},{data:{head_sha:live.head_sha}},live).transition,'BLOCKED');
});

for(const limit of [4,5,6]) test(`authorized round ${limit} preserves all result gates and never opens another round`,()=>{
  const j={...job(),round:limit},r={...result(),round:limit};
  const parsed=read([comment(r)],j);
  assert.throws(()=>decide(j,parsed,admit(pr())),/round limit/);
  assert.equal(decide(j,parsed,admit(pr()),limit).transition,'PASS');
  r.verdict='CHANGES_REQUIRED';r.findings.P2=[{durability:'ephemeral',durable_owner:null,regression:null,basis:'local_observation',id:'remaining',path:'coach/a.ts',line:1,scenario:'x',consequence:'y',minimal_fix:'z'}];
  assert.equal(decide(j,read([comment(r)],j),admit(pr()),limit).transition,'BLOCKED');
  r.verdict='ENVIRONMENT_BLOCKED';r.environment_failures=['gate failed'];r.gates[0].status='FAIL';r.gates[0].exit_code=1;
  assert.equal(decide(j,read([comment(r)],j),admit(pr()),limit).transition,'BLOCKED');
});
