const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GATES, hash } from './protocol.mjs';
import { advanceAutoMerge, buildAutoMergeAdmission, validateAutoMergeConfig } from './auto-merge.mjs';

const sha=n=>String(n).repeat(40);
const admission={protocol_version:'review-loop/v2.1',authoritative_spec_paths:['coach/docs/specs/x.md'],rubric:'x'};
const config=(enabled=true)=>({enabled:true,auto_merge:{version:2,enabled,method:'merge',expected_actor:{login:'admin-owner',id:7}}});

function fixture() {
  const live={pr_number:8,base_sha:sha(1),head_sha:sha(2),branch:'feature',base_branch:'master',admission_hash:hash(JSON.stringify(admission))};
  const gates=Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0}));
  const state={protocol_version:'review-loop/v2.1',pr_number:8,status:'PASS',admission_hash:live.admission_hash,history:[],
    job:{kind:'review',pr_number:8,round:1,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,issue_id:'review'},
    result:{verdict:'NO_P1_P2',base_sha:live.base_sha,head_sha:live.head_sha,issue_id:'review',run_id:'run',comment_id:'comment',sha256:'a'.repeat(64),gates,findings:{P1:[],P2:[],P3:[]}}};
  const pr={number:8,state:'open',draft:false,merged:false,mergeable:true,mergeable_state:'blocked',auto_merge:null,
    body:'```review-loop-admission\n'+JSON.stringify(admission)+'\n```',
    base:{sha:live.base_sha,ref:live.base_branch,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},
    head:{sha:live.head_sha,ref:live.branch,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}};
  const evidence={pr,repository:{full_name:'ChildeRolando/MjsoulTileTrace',allow_auto_merge:true,allow_merge_commit:true},
    actor:{login:'admin-owner',id:7},permission:{permission:'admin',role_name:'admin'},
    protection:{enforce_admins:{enabled:true},required_status_checks:{checks:[{context:'Review Loop v2',app_id:null}]},required_pull_request_reviews:{bypass_pull_request_allowances:{users:[],teams:[],apps:[]}}},
    rules:[],rulesets:[],enforcement_complete:true,actor_constrained:true,review_loop_required:true};
  return {live,state,evidence};
}

function ioFor(f,{afterRequest}={}) {
  let requests=0,saves=0,reads=0;
  return {io:{
    autoMergeEvidence:async()=>{reads++;return structuredClone(f.evidence);},
    requestAutoMerge:async(n,head,method)=>{requests++;assert.deepEqual([n,head,method],[8,f.live.head_sha,'merge']);if(afterRequest)afterRequest(f);},
    save:async()=>{saves++;},
  },get requests(){return requests;},get saves(){return saves;},get reads(){return reads;}};
}

test('configuration is strict, versioned and default-disabled capable',()=>{
  assert.equal(validateAutoMergeConfig(config(false)).enabled,false);
  assert.throws(()=>validateAutoMergeConfig({enabled:true,auto_merge:{version:1,enabled:true,expected_actor:{login:'x',id:1}}}));
  assert.throws(()=>validateAutoMergeConfig({enabled:true,auto_merge:{version:2,enabled:true,method:'squash',expected_actor:{login:'x',id:1}}}));
});

test('P1/P2 deny native auto-merge admission and P3 waits for a user decision',()=>{
  for(const severity of ['P1','P2']) {const f=fixture();f.state.result.findings[severity]=[{}];assert.equal(buildAutoMergeAdmission(f.state,f.live,f.evidence,config()).policy,'DENY');}
  const p3=fixture();p3.state.result.findings.P3=[{}];const result=buildAutoMergeAdmission(p3.state,p3.live,p3.evidence,config());
  assert.equal(result.policy,'P3_DECISION_REQUIRED');assert.equal(result.admitted,false);
});

test('empty findings admit the exact reviewed head even while GitHub checks are pending',()=>{
  const f=fixture(),result=buildAutoMergeAdmission(f.state,f.live,f.evidence,config());
  assert.equal(result.admitted,true);assert.equal(result.policy,'NATIVE_AUTO_MERGE');
  assert.equal('statuses' in f.evidence,false);assert.equal('check_runs' in f.evidence,false);
});

test('stale head/base/admission and conflicting mergeability fail closed',()=>{
  for(const mutate of [f=>{f.live.head_sha=sha(3);},f=>{f.live.base_sha=sha(3);},f=>{f.evidence.pr.body='no admission';},f=>{f.evidence.pr.mergeable_state='dirty';}]) {
    const f=fixture();mutate(f);assert.equal(buildAutoMergeAdmission(f.state,f.live,f.evidence,config()).admitted,false);
  }
});

test('GitHub auto-merge, required Review Loop status and actor enforcement are mandatory',()=>{
  const mutations=[f=>{f.evidence.repository.allow_auto_merge=false;},f=>{f.evidence.review_loop_required=false;},
    f=>{f.evidence.actor_constrained=false;},f=>{f.evidence.enforcement_complete=false;},f=>{f.evidence.actor.login='other';}];
  for(const mutate of mutations) {const f=fixture();mutate(f);assert.equal(buildAutoMergeAdmission(f.state,f.live,f.evidence,config()).admitted,false);}
  const admin=fixture();assert.equal(admin.evidence.permission.permission,'admin');assert.equal(buildAutoMergeAdmission(admin.state,admin.live,admin.evidence,config()).admitted,true);
});

test('only P3 records the decision gate and performs no native request',async()=>{
  const f=fixture();f.state.result.findings.P3=[{}];const harness=ioFor(f);
  await advanceAutoMerge(f.state,f.live,harness.io,config());
  assert.equal(f.state.auto_merge.status,'P3_DECISION_REQUIRED');assert.equal(harness.requests,0);
});

test('empty findings request GitHub native auto-merge for the reviewed head and read it back',async()=>{
  const f=fixture(),harness=ioFor(f,{afterRequest:x=>{x.evidence.pr.auto_merge={enabled_at:'2026-09-24T00:00:00Z'};}});
  await advanceAutoMerge(f.state,f.live,harness.io,config());
  assert.equal(harness.requests,1);assert.equal(f.state.auto_merge.status,'REQUESTED');assert.equal(harness.reads,2);
});

test('a repeated tick with an existing native request is idempotent',async()=>{
  const f=fixture();f.evidence.pr.auto_merge={enabled_at:'2026-09-24T00:00:00Z'};const harness=ioFor(f);
  await advanceAutoMerge(f.state,f.live,harness.io,config());await advanceAutoMerge(f.state,f.live,harness.io,config());
  assert.equal(harness.requests,0);assert.equal(f.state.auto_merge.status,'REQUESTED');
});

test('GitHub merge completion is authoritative and read back against the reviewed head',async()=>{
  const f=fixture();Object.assign(f.evidence.pr,{state:'closed',merged:true,merged_at:'2026-09-24T00:01:00Z',merge_commit_sha:sha(9)});const harness=ioFor(f);
  await advanceAutoMerge(f.state,f.live,harness.io,config());
  assert.equal(f.state.auto_merge.status,'MERGED');assert.equal(f.state.auto_merge.merge_commit_sha,sha(9));assert.equal(harness.requests,0);
});

test('an unreviewed head cannot replace the requested identity before merged read-back',async()=>{
  const f=fixture(),requestedHead=f.live.head_sha,requestedBase=f.live.base_sha;
  f.evidence.pr.auto_merge={enabled_at:'2026-09-24T00:00:00Z'};
  await advanceAutoMerge(f.state,f.live,ioFor(f).io,config());

  f.live.head_sha=sha(3);f.state.status='REVIEWING';f.state.result=null;
  f.state.job={...f.state.job,head_sha:f.live.head_sha};
  f.evidence.pr.head.sha=f.live.head_sha;f.evidence.pr.auto_merge=null;
  await advanceAutoMerge(f.state,f.live,ioFor(f).io,config());
  assert.equal(f.state.auto_merge.status,'ADMISSION_BLOCKED');
  assert.equal(f.state.auto_merge.reviewed_head,requestedHead);
  assert.equal(f.state.auto_merge.reviewed_base,requestedBase);

  Object.assign(f.evidence.pr,{state:'closed',merged:true,merged_at:'2026-09-24T00:01:00Z',merge_commit_sha:sha(9)});
  await advanceAutoMerge(f.state,f.live,ioFor(f).io,config());
  assert.equal(f.state.auto_merge.status,'MERGE_READ_BACK_INCOMPLETE');
  assert.equal(f.state.auto_merge.reviewed_head,requestedHead);
  assert.equal(f.state.auto_merge.reviewed_base,requestedBase);
  assert.equal(f.state.auto_merge.observed_head,f.live.head_sha);
});

test('base drift and platform read failure preserve the requested identity',async()=>{
  for(const failure of ['base drift','platform read failure']) {
    const f=fixture(),requestedHead=f.live.head_sha,requestedBase=f.live.base_sha;
    f.evidence.pr.auto_merge={enabled_at:'2026-09-24T00:00:00Z'};
    await advanceAutoMerge(f.state,f.live,ioFor(f).io,config());

    f.live.base_sha=sha(4);f.state.status='REVIEWING';f.state.result=null;
    f.state.job={...f.state.job,base_sha:f.live.base_sha};f.evidence.pr.base.sha=f.live.base_sha;
    const harness=failure === 'platform read failure'
      ? {autoMergeEvidence:async()=>{throw new Error('unavailable');},requestAutoMerge:async()=>{assert.fail('unexpected request');},save:async()=>{}}
      : ioFor(f).io;
    await advanceAutoMerge(f.state,f.live,harness,config());
    assert.equal(f.state.auto_merge.status,failure === 'platform read failure' ? 'PLATFORM_READ_FAILED' : 'ADMISSION_BLOCKED');
    assert.equal(f.state.auto_merge.reviewed_head,requestedHead);
    assert.equal(f.state.auto_merge.reviewed_base,requestedBase);
  }
});

test('disabled and blocked platform enforcement produce zero merge writes',async()=>{
  const disabled=fixture(),disabledHarness=ioFor(disabled);await advanceAutoMerge(disabled.state,disabled.live,disabledHarness.io,config(false));assert.equal(disabledHarness.requests,0);
  const blocked=fixture();blocked.evidence.actor_constrained=false;const blockedHarness=ioFor(blocked);await advanceAutoMerge(blocked.state,blocked.live,blockedHarness.io,config());
  assert.equal(blockedHarness.requests,0);assert.equal(blocked.state.auto_merge.status,'ADMISSION_BLOCKED');
});

test('legacy direct-merge orchestration and its round-three P2 paths are absent',async()=>{
  const [policy,runtime]=await Promise.all([
    readFile(new URL('./auto-merge.mjs',import.meta.url),'utf8'),
    readFile(new URL('./runtime.mjs',import.meta.url),'utf8'),
  ]);
  for(const obsolete of ['merge_intent','MERGED_EXTERNALLY','request_attempted','check_runs','required check ambiguous'])assert.equal(policy.includes(obsolete),false);
  assert.equal(runtime.includes('mergeEvidence'),false);
  assert.equal(runtime.includes('pulls/${n}/merge'),false);
  assert.match(runtime,/\['pr','merge'.*'--auto'.*'--match-head-commit'/s);
});
