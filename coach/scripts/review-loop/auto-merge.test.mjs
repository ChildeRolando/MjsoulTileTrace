const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { GATES, hash } from './protocol.mjs';
import { buildEligibility, advanceAutoMerge, validateAutoMergeConfig } from './auto-merge.mjs';
import { advanceDurability } from './controller.mjs';

const sha=n=>String(n).repeat(40),admission={protocol_version:'review-loop/v2.1',authoritative_spec_paths:['coach/docs/specs/x.md'],rubric:'x'};
const config=(enabled=true)=>({enabled:true,auto_merge:{version:1,enabled,expected_actor:{login:'merge-bot',id:7}}});
function fixture() {
  const live={pr_number:8,base_sha:sha(1),head_sha:sha(2),branch:'feature',base_branch:'master',admission_hash:hash(JSON.stringify(admission))};
  const gates=Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0}));
  const state={protocol_version:'review-loop/v2.1',pr_number:8,status:'PASS',admission_hash:live.admission_hash,history:[],job:{kind:'review',pr_number:8,round:1,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,issue_id:'review'},result:{verdict:'NO_P1_P2',base_sha:live.base_sha,head_sha:live.head_sha,issue_id:'review',run_id:'run',comment_id:'comment',sha256:'a'.repeat(64),gates,findings:{P1:[],P2:[],P3:[]}}};
  const evidence={pr:{number:8,state:'open',draft:false,merged:false,mergeable:true,mergeable_state:'clean',body:'```review-loop-admission\n'+JSON.stringify(admission)+'\n```',base:{sha:live.base_sha,ref:live.base_branch,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:live.head_sha,ref:live.branch,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}},repository:{full_name:'ChildeRolando/MjsoulTileTrace',allow_merge_commit:true},actor:{login:'merge-bot',id:7},permission:{permission:'write',role_name:'write'},protection:null,rules:[],statuses:[],check_runs:[],protection_complete:true,rules_complete:true,actor_can_bypass:false};
  return {live,state,evidence};
}

test('configuration is versioned, strict and defaults can be disabled',()=>{
  assert.equal(validateAutoMergeConfig(config(false)).enabled,false);
  assert.throws(()=>validateAutoMergeConfig({enabled:true,auto_merge:{version:1,enabled:true,expected_actor:{login:'x',id:1},extra:true}}));
});

test('eligible proof requires trusted PASS and exact base/head',()=>{
  const {live,state,evidence}=fixture();assert.equal(buildEligibility(state,live,evidence,config()).eligible,true);
  for(const mutate of [
    (s,l,e)=>{l.head_sha=sha(3);},(s,l,e)=>{l.base_sha=sha(3);},(s)=>{s.result.findings.P2=[{}];},
    (s,l,e)=>{e.pr.mergeable_state='dirty';},(s,l,e)=>{e.permission={permission:'admin',role_name:'admin'};},(s,l,e)=>{e.actor_can_bypass=true;},
    (s,l,e)=>{e.rules_complete=false;},(s,l,e)=>{e.pr.state='closed';},
  ]) {const f=fixture();mutate(f.state,f.live,f.evidence);assert.equal(buildEligibility(f.state,f.live,f.evidence,config()).eligible,false);}
});

test('required checks fail closed for pending/fail/unknown/missing/ambiguous and accept exact app success',()=>{
  for(const stateName of ['pending','failure','unknown']) {const f=fixture();f.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};f.evidence.statuses=[{context:'ci',state:stateName,creator:{id:9}}];assert.equal(buildEligibility(f.state,f.live,f.evidence,config()).eligible,false);}
  const missing=fixture();missing.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};assert.match(buildEligibility(missing.state,missing.live,missing.evidence,config()).reason,/missing/);
  const ambiguous=fixture();ambiguous.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};ambiguous.evidence.check_runs=[{name:'ci',status:'completed',conclusion:'success',app:{id:9}},{name:'ci',status:'completed',conclusion:'success',app:{id:9}}];assert.match(buildEligibility(ambiguous.state,ambiguous.live,ambiguous.evidence,config()).reason,/ambiguous/);
  const ok=fixture();ok.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};ok.evidence.check_runs=[{name:'ci',status:'completed',conclusion:'neutral',app:{id:9}}];assert.equal(buildEligibility(ok.state,ok.live,ok.evidence,config()).eligible,true);
});

test('ordinary write requires the exact permission and base role, and user IDs cannot impersonate apps',()=>{
  for(const permission of [
    {permission:'write',role_name:'maintain'},
    {permission:'write',role_name:'custom-release-role'},
    {permission:'admin',role_name:'admin'},
    {permission:'push',role_name:'write'},
  ]) {const f=fixture();f.evidence.permission=permission;assert.match(buildEligibility(f.state,f.live,f.evidence,config()).reason,/ordinary write/);}
  const collision=fixture();collision.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};
  collision.evidence.statuses=[{context:'ci',state:'success',creator:{id:9,type:'User'}}];
  assert.match(buildEligibility(collision.state,collision.live,collision.evidence,config()).reason,/missing/);
  collision.evidence.check_runs=[{name:'ci',status:'completed',conclusion:'success',app:{id:9}}];
  assert.equal(buildEligibility(collision.state,collision.live,collision.evidence,config()).eligible,true);
});

test('each eligibility read strictly revalidates the live admission',async()=>{
  const first=fixture(),firstRevoked=structuredClone(first.evidence);firstRevoked.pr.body='admission removed';let firstWrites=0;
  await advanceAutoMerge(first.state,first.live,{save:async()=>{},live:async()=>structuredClone(first.evidence.pr),verifyMergeCommit:async()=>{},mergeEvidence:async()=>structuredClone(firstRevoked),merge:async()=>{firstWrites++;}},config());
  assert.equal(firstWrites,0);assert.equal(first.state.merge.status,'WAITING_ELIGIBILITY');
  const {live,state,evidence}=fixture();let reads=0,writes=0;
  const revoked=structuredClone(evidence);revoked.pr.body='admission removed';
  const io={save:async()=>{},live:async()=>structuredClone(evidence.pr),verifyMergeCommit:async()=>{},
    mergeEvidence:async()=>structuredClone(reads++ === 0 ? evidence : revoked),merge:async()=>{writes++;}};
  await advanceAutoMerge(state,live,io,config());
  assert.equal(writes,0);assert.equal(state.merge.status,'INVALIDATED');
});

test('intent is saved before one merge write and duplicate tick only reads back',async()=>{
  const {live,state,evidence}=fixture();let saves=0,writes=0,merged=false;
  const raw=()=>({...evidence.pr,merged,state:merged?'closed':'open',merged_at:merged?'2026-09-22T00:00:00Z':null,merge_commit_sha:merged?sha(4):null,merged_by:merged?evidence.actor:null});
  const io={save:async()=>{saves++;},mergeEvidence:async()=>structuredClone(evidence),merge:async(n,head)=>{assert.equal(head,live.head_sha);assert(saves>0);writes++;merged=true;return {merged:true,sha:sha(4)};},live:async()=>raw(),verifyMergeCommit:async s=>assert.equal(s,sha(4))};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);
  await advanceAutoMerge(state,live,io,config());assert.equal(writes,1);
});

test('disabled and rollback mode performs zero writes but reconciles merged/closed intents',async()=>{
  for(const merged of [true,false]) {const {live,state,evidence}=fixture();let writes=0;state.merge={status:'RETRY_IO',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,actor:evidence.actor,request_attempted:true}};
    const raw={...evidence.pr,state:'closed',merged,merged_at:merged?'2026-09-22T00:00:00Z':null,merge_commit_sha:merged?sha(4):null,merged_by:merged?evidence.actor:null};
    const io={save:async()=>{},live:async()=>raw,verifyMergeCommit:async()=>{},merge:async()=>{writes++;}};
    await advanceAutoMerge(state,live,io,config(false));assert.equal(writes,0);assert.equal(state.merge.status,merged?'MERGED':'CLOSED_NO_MERGE');}
});

test('lost response is durable RETRY_IO and same intent can retry only after full revalidation',async()=>{
  const {live,state,evidence}=fixture();let writes=0;
  const io={save:async()=>{},mergeEvidence:async()=>structuredClone(evidence),merge:async()=>{writes++;throw new Error('lost');},live:async()=>evidence.pr,verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());const id=state.merge.intent.attempt_id;assert.equal(state.merge.status,'RETRY_IO');
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.intent.attempt_id,id);assert.equal(writes,2);
});

test('external merge, incomplete read-back and P3 durability are preserved',async()=>{
  const {live,state,evidence}=fixture();state.durability=[{identity:'p3',status:'WAITING'}];state.merge={status:'RETRY_IO',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,actor:evidence.actor,request_attempted:false}};
  const io={save:async()=>{},live:async()=>({...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:{login:'external',id:99}}),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED_EXTERNALLY');assert.equal(state.durability[0].status,'WAITING');
  const bad=fixture();bad.state.merge=structuredClone(state.merge);bad.state.merge.status='RETRY_IO';bad.state.merge.intent.request_attempted=true;bad.state.merge.read_back=null;
  await advanceAutoMerge(bad.state,bad.live,{...io,live:async()=>({...evidence.pr,state:'closed',merged:true,merged_at:null,merge_commit_sha:null})},config());assert.equal(bad.state.merge.status,'WAITING_READ_BACK');
});

test('merged terminal fact wins over an advanced base and requires a persisted request for attribution',async()=>{
  for(const [actor,status] of [[{login:'merge-bot',id:7},'MERGED'],[{login:'external-human',id:99},'MERGED_EXTERNALLY']]) {
    const {live,state,evidence}=fixture();state.merge={status:'REQUESTING',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,actor:evidence.actor,request_attempted:true}};
    const advanced={...live,base_sha:sha(9)};
    const raw={...evidence.pr,base:{...evidence.pr.base,sha:sha(9)},state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:actor};
    let evidenceReads=0;await advanceAutoMerge(state,advanced,{save:async()=>{},live:async()=>raw,verifyMergeCommit:async()=>{},mergeEvidence:async()=>{evidenceReads++;}},config());
    assert.equal(state.merge.status,status);assert.equal(evidenceReads,0);
  }
});

test('same-account external merge before the request is not attributed to the intent',async()=>{
  const {live,state,evidence}=fixture();state.merge={status:'INTENT_SAVED',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,actor:evidence.actor,request_attempted:false}};
  const raw={...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor};
  await advanceAutoMerge(state,live,{save:async()=>{},live:async()=>raw,verifyMergeCommit:async()=>{}},config(false));
  assert.equal(state.merge.status,'MERGED_EXTERNALLY');
});

test('recoverable intent states rebuild eligibility and reuse the same expected-HEAD intent',async()=>{
  for(const initial of ['INTENT_SAVED','REQUESTING','WAITING_GITHUB','WAITING_ELIGIBILITY','RETRY_IO']) {
    const {live,state,evidence}=fixture();let writes=0;
    state.merge={status:initial,intent:{attempt_id:'same-attempt',repository:'ChildeRolando/MjsoulTileTrace',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,method:'merge',admission_hash:live.admission_hash,actor:evidence.actor,evidence_sha256:buildEligibility(state,live,evidence,config()).evidence_sha256,request_attempted:initial !== 'INTENT_SAVED'}};
    let merged=false;const io={save:async()=>{},mergeEvidence:async()=>structuredClone(evidence),merge:async()=>{writes++;merged=true;return {merged:true,sha:sha(4)};},
      live:async()=>merged?{...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor}:structuredClone(evidence.pr),verifyMergeCommit:async()=>{}};
    await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);assert.equal(state.merge.intent.attempt_id,'same-attempt');
  }
});

test('a 405 or 409 observation retries only on a later fully revalidated tick',async()=>{
  const {live,state,evidence}=fixture();let attempts=0,merged=false;
  const io={save:async()=>{},mergeEvidence:async()=>structuredClone(evidence),merge:async()=>{attempts++;if(attempts === 1)throw Object.assign(new Error('GitHub not ready'),{waiting:true});merged=true;return {merged:true,sha:sha(4)};},
    live:async()=>merged?{...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor}:structuredClone(evidence.pr),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());const attemptId=state.merge.intent.attempt_id;assert.equal(state.merge.status,'WAITING_GITHUB');assert.equal(attempts,1);
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(state.merge.intent.attempt_id,attemptId);assert.equal(attempts,2);
});

test('a retry waits through pending checks and resumes when the same proof becomes successful',async()=>{
  const {live,state,evidence}=fixture();evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};evidence.check_runs=[{name:'ci',status:'completed',conclusion:'success',app:{id:9}}];
  state.merge={status:'RETRY_IO',intent:{attempt_id:'same-attempt',repository:'ChildeRolando/MjsoulTileTrace',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,method:'merge',admission_hash:live.admission_hash,actor:evidence.actor,evidence_sha256:buildEligibility(state,live,evidence,config()).evidence_sha256,request_attempted:true}};
  let pending=true,writes=0,merged=false;const io={save:async()=>{},mergeEvidence:async()=>{const e=structuredClone(evidence);if(pending)e.check_runs[0].status='in_progress';return e;},merge:async()=>{writes++;merged=true;return {merged:true,sha:sha(4)};},
    live:async()=>merged?{...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor}:structuredClone(evidence.pr),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'WAITING_ELIGIBILITY');assert.equal(writes,0);
  pending=false;await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);
});

test('durability identity conflict reached through production advancement blocks merge writes',async()=>{
  const {live,state,evidence}=fixture();let writes=0;
  state.durability=[{kind:'durability',identity:'p3',agent_id:'fixer',issue_id:'durable',prepared_at:'prepared',status:'WAITING'}];
  const io={save:async()=>{},runs:async()=>[],issue:async()=>({id:'durable',assignee_type:'agent',assignee_id:'different-agent'}),comments:async()=>[],
    mergeEvidence:async()=>structuredClone(evidence),live:async()=>structuredClone(evidence.pr),verifyMergeCommit:async()=>{},merge:async()=>{writes++;}};
  await advanceDurability(state,io,{});assert.equal(state.durability[0].status,'DURABLE_KNOWLEDGE_BLOCKED');
  await advanceAutoMerge(state,live,io,config());assert.equal(writes,0);assert.equal(state.merge.status,'WAITING_ELIGIBILITY');
  assert.match(state.merge.eligibility.reason,/durability identity blocked/);
});

test('invalidated old candidate is archived and a fresh reviewed candidate gets a new intent',async()=>{
  const {live,state,evidence}=fixture();let writes=0,merged=false;
  state.merge={status:'INVALIDATED',reason:'candidate changed',intent:{attempt_id:'old-attempt',repository:'ChildeRolando/MjsoulTileTrace',pr_number:8,
    base_sha:sha(9),head_sha:sha(8),method:'merge',admission_hash:live.admission_hash,actor:evidence.actor,
    review:{issue_id:'old-review',run_id:'old-run',comment_id:'old-comment',sha256:'b'.repeat(64)},request_attempted:true}};
  const io={save:async()=>{},mergeEvidence:async()=>structuredClone(evidence),merge:async()=>{writes++;merged=true;return {merged:true,sha:sha(4)};},
    live:async()=>merged?{...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor}:structuredClone(evidence.pr),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);
  assert.notEqual(state.merge.intent.attempt_id,'old-attempt');assert.equal(state.merge.intent.head_sha,live.head_sha);
  assert.equal(state.history.find(h=>h.event === 'merge_intent_archived')?.attempt_id,'old-attempt');
});

test('retry persists refreshed eligibility when optional checks or check metadata change',async()=>{
  const {live,state,evidence}=fixture();let writes=0,merged=false,variant=0;
  state.merge={status:'RETRY_IO',intent:{attempt_id:'same-attempt',repository:'ChildeRolando/MjsoulTileTrace',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,
    method:'merge',admission_hash:live.admission_hash,actor:evidence.actor,review:{issue_id:'review',run_id:'run',comment_id:'comment',sha256:'a'.repeat(64)},
    evidence_sha256:buildEligibility(state,live,evidence,config()).evidence_sha256,request_attempted:true}};
  const io={save:async()=>{},mergeEvidence:async()=>{const e=structuredClone(evidence);e.statuses=[{context:'optional',state:'success',description:`rerun-${variant++}`}];return e;},
    merge:async()=>{writes++;merged=true;return {merged:true,sha:sha(4)};},live:async()=>merged?{...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4),merged_by:evidence.actor}:structuredClone(evidence.pr),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);
  assert.equal(state.merge.intent.attempt_id,'same-attempt');assert.equal(state.merge.intent.validations.length,1);
  assert.notEqual(state.merge.intent.validations[0].evidence_sha256,state.merge.intent.evidence_sha256);
});
