const test = process.env.VITEST === 'true' ? (await import('vitest')).test : (await import('node:test')).test;
import assert from 'node:assert/strict';
import { GATES, hash } from './protocol.mjs';
import { buildEligibility, advanceAutoMerge, validateAutoMergeConfig } from './auto-merge.mjs';

const sha=n=>String(n).repeat(40),admission={protocol_version:'review-loop/v2.1',authoritative_spec_paths:['coach/docs/specs/x.md'],rubric:'x'};
const config=(enabled=true)=>({enabled:true,auto_merge:{version:1,enabled,expected_actor:{login:'merge-bot',id:7}}});
function fixture() {
  const live={pr_number:8,base_sha:sha(1),head_sha:sha(2),branch:'feature',admission_hash:hash(JSON.stringify(admission))};
  const gates=Object.entries(GATES).map(([id,command])=>({id,command,status:'PASS',exit_code:0}));
  const state={protocol_version:'review-loop/v2.1',pr_number:8,status:'PASS',admission_hash:live.admission_hash,history:[],job:{kind:'review',pr_number:8,round:1,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,issue_id:'review'},result:{verdict:'NO_P1_P2',base_sha:live.base_sha,head_sha:live.head_sha,issue_id:'review',run_id:'run',comment_id:'comment',sha256:'a'.repeat(64),gates,findings:{P1:[],P2:[],P3:[]}}};
  const evidence={pr:{number:8,state:'open',draft:false,merged:false,mergeable:true,mergeable_state:'clean',base:{sha:live.base_sha,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}},head:{sha:live.head_sha,repo:{full_name:'ChildeRolando/MjsoulTileTrace'}}},repository:{full_name:'ChildeRolando/MjsoulTileTrace',allow_merge_commit:true},actor:{login:'merge-bot',id:7},permission:'push',protection:null,rules:[],statuses:[],check_runs:[],protection_complete:true,rules_complete:true,actor_can_bypass:false};
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
    (s,l,e)=>{e.pr.mergeable_state='dirty';},(s,l,e)=>{e.permission='admin';},(s,l,e)=>{e.actor_can_bypass=true;},
    (s,l,e)=>{e.rules_complete=false;},(s,l,e)=>{e.pr.state='closed';},
  ]) {const f=fixture();mutate(f.state,f.live,f.evidence);assert.equal(buildEligibility(f.state,f.live,f.evidence,config()).eligible,false);}
});

test('required checks fail closed for pending/fail/unknown/missing/ambiguous and accept exact app success',()=>{
  for(const stateName of ['pending','failure','unknown']) {const f=fixture();f.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};f.evidence.statuses=[{context:'ci',state:stateName,creator:{id:9}}];assert.equal(buildEligibility(f.state,f.live,f.evidence,config()).eligible,false);}
  const missing=fixture();missing.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};assert.match(buildEligibility(missing.state,missing.live,missing.evidence,config()).reason,/missing/);
  const ambiguous=fixture();ambiguous.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};ambiguous.evidence.statuses=[{context:'ci',state:'success',creator:{id:9}},{context:'ci',state:'success',creator:{id:9}}];assert.match(buildEligibility(ambiguous.state,ambiguous.live,ambiguous.evidence,config()).reason,/ambiguous/);
  const ok=fixture();ok.evidence.protection={required_status_checks:{checks:[{context:'ci',app_id:9}],contexts:[]}};ok.evidence.check_runs=[{name:'ci',status:'completed',conclusion:'neutral',app:{id:9}}];assert.equal(buildEligibility(ok.state,ok.live,ok.evidence,config()).eligible,true);
});

test('intent is saved before one merge write and duplicate tick only reads back',async()=>{
  const {live,state,evidence}=fixture();let saves=0,writes=0,merged=false;
  const raw=()=>({...evidence.pr,merged,state:merged?'closed':'open',merged_at:merged?'2026-09-22T00:00:00Z':null,merge_commit_sha:merged?sha(4):null,merged_by:merged?evidence.actor:null});
  const io={save:async()=>{saves++;},mergeEvidence:async()=>structuredClone(evidence),merge:async(n,head)=>{assert.equal(head,live.head_sha);assert(saves>0);writes++;merged=true;},live:async()=>raw(),verifyMergeCommit:async s=>assert.equal(s,sha(4))};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED');assert.equal(writes,1);
  await advanceAutoMerge(state,live,io,config());assert.equal(writes,1);
});

test('disabled and rollback mode performs zero writes but reconciles merged/closed intents',async()=>{
  for(const merged of [true,false]) {const {live,state,evidence}=fixture();let writes=0;state.merge={status:'RETRY_IO',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,request_attempted:true}};
    const raw={...evidence.pr,state:merged?'closed':'closed',merged,merged_at:merged?'2026-09-22T00:00:00Z':null,merge_commit_sha:merged?sha(4):null};
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
  const {live,state,evidence}=fixture();state.durability=[{identity:'p3',status:'WAITING'}];state.merge={status:'RETRY_IO',intent:{attempt_id:'a',pr_number:8,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,request_attempted:false}};
  const io={save:async()=>{},live:async()=>({...evidence.pr,state:'closed',merged:true,merged_at:'2026-09-22T00:00:00Z',merge_commit_sha:sha(4)}),verifyMergeCommit:async()=>{}};
  await advanceAutoMerge(state,live,io,config());assert.equal(state.merge.status,'MERGED_EXTERNALLY');assert.equal(state.durability[0].status,'WAITING');
  const bad=fixture();bad.state.merge=structuredClone(state.merge);bad.state.merge.status='RETRY_IO';bad.state.merge.intent.request_attempted=true;bad.state.merge.read_back=null;
  await advanceAutoMerge(bad.state,bad.live,{...io,live:async()=>({...evidence.pr,state:'closed',merged:true,merged_at:null,merge_commit_sha:null})},config());assert.equal(bad.state.merge.status,'WAITING_READ_BACK');
});
