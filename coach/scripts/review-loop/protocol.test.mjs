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

function resultBearingTerminalFixture() {
  const base='a'.repeat(40),heads=['b','c','d'].map(value=>value.repeat(40)),admissionHash=admit(pr()).admission_hash;
  const snapshotContents=new Map(),resultArchives=new Map(),sources=new Map(),history=[];
  const candidateSnapshot=(candidateBase,head,round)=>{
    const raw={...pr(),base:{...pr().base,sha:candidateBase},head:{...pr().head,sha:head}};
    const bytes=Buffer.from(JSON.stringify(raw)),ref={semantics:'github-rest-json-utf8/v1',sha256:hash(bytes),observed_at:`2026-10-0${round}T00:00:00.000Z`};
    snapshotContents.set(ref.sha256,bytes);return ref;
  };
  const archive=(job,data,id)=>{
    const name=job.kind === 'review' ? 'review-loop-result' : 'review-loop-fix';
    const content=`source\n\`\`\`${name}\n${JSON.stringify(data)}\n\`\`\``;
    const comment={id:`${id}-comment`,issue_id:job.issue_id,author_type:'agent',author_id:job.agent_id,source_task_id:`${id}-run`,content};
    const run={id:comment.source_task_id,issue_id:job.issue_id,agent_id:job.agent_id,status:'completed'};
    const issue={id:job.issue_id,assignee_type:'agent',assignee_id:job.agent_id};
    const parsed=parseResult(job,issue,[comment],[run]);
    const key=`${job.issue_id}:${parsed.sha256}`;
    resultArchives.set(key,Buffer.from(JSON.stringify(parsed)));sources.set(key,{issue,comments:[comment],runs:[run]});
    return parsed;
  };
  const review=(round,head)=>({kind:'review',pr_number:8,round,issue_id:`review-${round}`,agent_id:'reviewer',base_sha:base,head_sha:head,admission_hash:admissionHash});
  const fix=(round,head,id,rawReviewSha)=>({kind:'fix',pr_number:8,round,issue_id:`fix-${round}`,agent_id:'fixer',base_sha:base,head_sha:head,raw_review_sha256:rawReviewSha});
  let clock=Date.parse('2026-10-01T00:00:00.000Z');
  const stamp=()=>new Date(clock+=1000).toISOString();
  const transitionResult=(job,transition,parsed,snapshot)=>({event:'result',transition,issue_id:job.issue_id,comment_id:parsed.comment_id,run_id:parsed.run_id,sha256:parsed.sha256,
    head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot,at:stamp()});
  for(let round=1;round<=2;round++) {
    const before=heads[round-1],after=heads[round],reviewJob=review(round,before),reviewSnapshot=candidateSnapshot(base,before,round);
    const reviewData={...result(),base_sha:base,head_sha:before,round,verdict:'CHANGES_REQUIRED',findings:{P1:[],P2:[{id:`p2-${round}`,path:'coach/a.ts',line:1,scenario:'gap',consequence:'blocks review',minimal_fix:'repair',durability:'repository_required',durable_owner:'coach/a.ts',regression:null,basis:'explicit_contract_violation'}],P3:[]}};
    const reviewResult=archive(reviewJob,reviewData,`review-${round}`);
    history.push({event:'dispatch',kind:'review',round,head_sha:before,base_sha:base,issue_id:reviewJob.issue_id,snapshot:reviewSnapshot,at:stamp()});
    history.push(transitionResult(reviewJob,'ROUTE_TO_FIXER',reviewResult,candidateSnapshot(base,before,round)));
    const fixJob=fix(round,before,`f${round}`,reviewResult.sha256),fixSnapshot=candidateSnapshot(base,before,round);
    const fixData={protocol_version:'review-loop/v2.1',pr_number:8,base_sha:base,previous_head_sha:before,head_sha:after,round,raw_review_sha256:reviewResult.sha256};
    const fixResult=archive(fixJob,fixData,`fix-${round}`);
    history.push({event:'dispatch',kind:'fix',round,head_sha:before,base_sha:base,issue_id:fixJob.issue_id,snapshot:fixSnapshot,at:stamp()});
    history.push(transitionResult(fixJob,'DISCARD_AND_REVIEW',fixResult,candidateSnapshot(base,after,round)));
  }
  const reviewJob=review(3,heads[2]),reviewSnapshot=candidateSnapshot(base,heads[2],3);
  const reviewData={...result(),base_sha:base,head_sha:heads[2],round:3,verdict:'CHANGES_REQUIRED',findings:{P1:[],P2:[{id:'p2-3',path:'coach/a.ts',line:1,scenario:'gap',consequence:'blocks review',minimal_fix:'repair',durability:'repository_required',durable_owner:'coach/a.ts',regression:null,basis:'explicit_contract_violation'}],P3:[]}};
  const reviewResult=archive(reviewJob,reviewData,'review-3');
  history.push({event:'dispatch',kind:'review',round:3,head_sha:heads[2],base_sha:base,issue_id:reviewJob.issue_id,snapshot:reviewSnapshot,at:stamp()});
  history.push(transitionResult(reviewJob,'BLOCKED',reviewResult,candidateSnapshot(base,heads[2],3)));
  const state={protocol_version:'review-loop/v2.1',pr_number:8,round:3,status:'BLOCKED',reason:'review gates, environment or round limit',admission_hash:admissionHash,
    pending:null,history,job:{...reviewJob},result:{issue_id:reviewJob.issue_id,comment_id:reviewResult.comment_id,sha256:reviewResult.sha256}};
  const live=admit({...pr(),base:{...pr().base,sha:base},head:{...pr().head,sha:'e'.repeat(40)}});
  return {state,live,snapshotContents,resultArchives,sources,actors:{reviewerId:'reviewer',fixerId:'fixer'},reviewJob,reviewResult,base,heads,
    context:{sources,resultArchives,reviewerId:'reviewer',fixerId:'fixer',isAncestorBase:true,isAncestorHead:true,containsLiveBase:true}};
}

test('result-bearing round-three terminal verifies the archived ten-event source chain and real snapshots',()=>{
  const f=resultBearingTerminalFixture();
  assert.equal(externalReviewTerminal(f.state,f.live,f.snapshotContents,f.context).kind,'result-bearing-exhaustion');
  const accepted=structuredClone(f.state),acceptance={source:'external_independent_review',pr_number:8,review_issue_id:'external-review',comment_id:'external-comment',run_id:'external-run',
    raw_review_sha256:hash('external raw'),issue_contract_sha256:hash('external contract'),external_sequence:5,base_sha:f.live.base_sha,head_sha:f.live.head_sha,
    admission_hash:f.live.admission_hash,approval_ref:'explicitly approved',accepted_at:'2026-10-03T01:00:00.000Z'};
  accepted.external_review_acceptance=acceptance;accepted.history.push({event:'accept_external_review',...acceptance});
  assert.equal(externalReviewAcceptance(accepted,f.live,f.snapshotContents,f.context).source,'external_independent_review');
});

test('result-bearing terminal rejects forged archives, source transitions, snapshots and non-green terminal results',()=>{
  const f=resultBearingTerminalFixture();
  for(const mutate of [
    state=>{state.history[9].transition='ROUTE_TO_FIXER';},
    state=>{state.history[7].sha256='f'.repeat(64);},
    state=>{state.history[5].issue_id=state.history[0].issue_id;},
    state=>{state.result.comment_id='wrong-comment';},
    state=>{state.reason='other BLOCKED reason';},
    state=>{state.extra_review_authorization={};},
    state=>{state.pending={kind:'review'};},
  ]) {
    const changed=structuredClone(f.state);mutate(changed);
    assert.throws(()=>externalReviewTerminal(changed,f.live,f.snapshotContents,f.context));
  }
  for(const kind of ['missing-archive','corrupt-archive','wrong-raw-hash','non-green-result','snapshot-mismatch','missing-snapshot']) {
    const archives=new Map(f.resultArchives),snapshots=new Map(f.snapshotContents),changed=structuredClone(f.state),event=changed.history[9],key=`${event.issue_id}:${event.sha256}`;
    if(kind === 'missing-archive')archives.delete(key);
    else if(kind === 'corrupt-archive')archives.set(key,Buffer.from('{'));
    else if(kind === 'wrong-raw-hash') {
      const parsed=JSON.parse(archives.get(key).toString('utf8'));parsed.raw+='tampered';archives.set(key,Buffer.from(JSON.stringify(parsed)));
    } else if(kind === 'non-green-result') {
      const parsed=JSON.parse(archives.get(key).toString('utf8')),data={...parsed.data,environment_failures:['blocked']};
      parsed.raw=`source\n\`\`\`review-loop-result\n${JSON.stringify(data)}\n\`\`\``;parsed.data=data;parsed.sha256=hash(parsed.raw);
      archives.delete(key);archives.set(`${event.issue_id}:${parsed.sha256}`,Buffer.from(JSON.stringify(parsed)));event.sha256=parsed.sha256;event.comment_id=parsed.comment_id;changed.result.sha256=parsed.sha256;
    } else if(kind === 'snapshot-mismatch') {
      const dispatch=changed.history[0],bytes=Buffer.from(JSON.stringify({...pr(),base:{...pr().base,sha:dispatch.base_sha},head:{...pr().head,sha:'f'.repeat(40)}})),sha256=hash(bytes);
      snapshots.set(sha256,bytes);dispatch.snapshot={...dispatch.snapshot,sha256};
    } else snapshots.delete(event.snapshot.sha256);
    const context={...f.context,resultArchives:archives};
    assert.throws(()=>externalReviewTerminal(changed,f.live,snapshots,context),undefined,kind);
  }
});

test('result-bearing terminal accepts known failed or cancelled history runs and rejects unknown or missing run states',()=>{
  const f=resultBearingTerminalFixture(),[key,source]=f.sources.entries().next().value;
  const knownSources=new Map(f.sources);knownSources.set(key,{...source,runs:[...source.runs,
    {id:'known-failure',issue_id:source.issue.id,agent_id:source.runs[0].agent_id,status:'failed'},
    {id:'known-cancellation',issue_id:source.issue.id,agent_id:source.runs[0].agent_id,status:'cancelled'}]});
  assert.equal(externalReviewTerminal(f.state,f.live,f.snapshotContents,{...f.context,sources:knownSources}).kind,'result-bearing-exhaustion');
  for(const extra of [
    {id:'unknown-state',issue_id:source.issue.id,agent_id:source.runs[0].agent_id,status:'awaiting'},
    {id:'missing-state',issue_id:source.issue.id,agent_id:source.runs[0].agent_id},
  ]) {
    const sources=new Map(f.sources);sources.set(key,{...source,runs:[...source.runs,extra]});
    assert.throws(()=>externalReviewTerminal(f.state,f.live,f.snapshotContents,{...f.context,sources}),/unknown or foreign run/);
  }
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
