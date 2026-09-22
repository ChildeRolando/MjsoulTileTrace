import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GATES, REPOSITORY, VERSION, admit, hash, isSha } from './protocol.mjs';

const CHECK_OK=new Set(['success','neutral','skipped']);
const terminal=new Set(['MERGED','MERGED_EXTERNALLY','CLOSED_NO_MERGE','INVALIDATED']);
const now=()=>new Date().toISOString();

function deny(reason,details={}) { return {eligible:false,reason,details}; }
function exactActor(actual,expected) {
  return actual && expected && actual.login === expected.login && actual.id === expected.id
    && typeof actual.login === 'string' && Number.isSafeInteger(actual.id);
}
function requiredChecks(evidence) {
  const required=[];
  const add=(context,appId,source)=>{
    assert(typeof context === 'string' && context.length,'invalid required check context');
    const item={context,app_id:appId ?? null,source};
    if(!required.some(x=>x.context === item.context && x.app_id === item.app_id))required.push(item);
  };
  const protectedChecks=evidence.protection?.required_status_checks;
  if(Array.isArray(protectedChecks?.checks))for(const c of protectedChecks.checks)add(c.context,c.app_id,'protection');
  else for(const c of protectedChecks?.contexts ?? [])add(c,null,'protection');
  for(const rule of evidence.rules ?? []) {
    if(rule.type !== 'required_status_checks')continue;
    assert(Array.isArray(rule.parameters?.required_status_checks),'unreadable ruleset required checks');
    for(const c of rule.parameters.required_status_checks)add(c.context,c.integration_id ?? null,'ruleset');
  }
  return required;
}
function checkResults(required,evidence) {
  const statuses=evidence.statuses ?? [],runs=evidence.check_runs ?? [];
  for(const req of required) {
    const candidates=[];
    // Commit-status creators are users, not GitHub Apps. They can satisfy an
    // unbound context, but never prove the integration identity of an app-bound
    // required check even when the numeric IDs happen to collide.
    for(const s of statuses)if(s.context === req.context)candidates.push({kind:'status',state:s.state,app_id:null});
    for(const r of runs)if(r.name === req.context)candidates.push({kind:'check',state:r.status === 'completed' ? r.conclusion : r.status,app_id:r.app?.id ?? null});
    const attributed=candidates.filter(c=>req.app_id === null || req.app_id === -1 || c.app_id === req.app_id);
    if(attributed.length !== 1)return deny(attributed.length ? 'required check ambiguous' : 'required check missing',{check:req,count:attributed.length});
    const c=attributed[0];
    if(c.kind === 'status' ? c.state !== 'success' : !CHECK_OK.has(c.state))return deny('required check not successful',{check:req,state:c.state});
  }
  return {eligible:true,required};
}

export function validateAutoMergeConfig(config) {
  const a=config.auto_merge;
  assert(a && typeof a === 'object' && !Array.isArray(a),'missing auto_merge config');
  assert.deepEqual(Object.keys(a).sort(),['enabled','expected_actor','version'],'invalid auto_merge fields');
  assert.equal(a.version,1);assert.equal(typeof a.enabled,'boolean');
  assert.deepEqual(Object.keys(a.expected_actor ?? {}).sort(),['id','login'],'invalid expected_actor fields');
  assert(typeof a.expected_actor.login === 'string' && a.expected_actor.login.length > 0,'invalid expected actor login');
  assert(Number.isSafeInteger(a.expected_actor.id) && a.expected_actor.id > 0,'invalid expected actor id');
  assert(a.enabled !== true || config.enabled === true,'auto_merge requires review loop enabled');
  return a;
}

export function buildEligibility(state,live,evidence,config) {
  try {
    const a=validateAutoMergeConfig(config),job=state.job,proof=state.result;
    if(state.status !== 'PASS' || job?.kind !== 'review')return deny('trusted review PASS missing');
    if(live.pr_number !== state.pr_number || live.head_sha !== job.head_sha || live.base_sha !== job.base_sha)return deny('stale base/head');
    if(live.admission_hash !== state.admission_hash || job.admission_hash !== state.admission_hash)return deny('admission mismatch');
    if(!proof || proof.verdict !== 'NO_P1_P2' || proof.head_sha !== job.head_sha || proof.base_sha !== job.base_sha
      || proof.issue_id !== job.issue_id || !proof.run_id || !proof.comment_id || !/^[a-f0-9]{64}$/.test(proof.sha256 ?? ''))return deny('review proof incomplete');
    if(!Array.isArray(proof.gates) || proof.gates.length !== 5 || proof.gates.some(g=>GATES[g.id] !== g.command || g.status !== 'PASS' || g.exit_code !== 0))return deny('review gates not PASS');
    if((proof.findings?.P1?.length ?? -1) !== 0 || (proof.findings?.P2?.length ?? -1) !== 0)return deny('P1/P2 present');
    const pr=evidence.pr,current=admit(pr);
    if(pr?.number !== state.pr_number || pr.state !== 'open' || pr.draft !== false || pr.merged === true)return deny('PR not open and ready');
    if(pr.base?.repo?.full_name !== REPOSITORY || pr.head?.repo?.full_name !== REPOSITORY)return deny('repository mismatch');
    if(current.base_sha !== job.base_sha || current.head_sha !== job.head_sha || current.base_branch !== live.base_branch)return deny('candidate changed during eligibility');
    if(current.admission_hash !== state.admission_hash || current.admission_hash !== live.admission_hash)return deny('admission changed during eligibility');
    if(evidence.repository?.full_name !== REPOSITORY || evidence.repository.allow_merge_commit !== true)return deny('merge commits disabled');
    if(!exactActor(evidence.actor,a.expected_actor))return deny('caller identity mismatch');
    if(evidence.permission?.permission !== 'write' || evidence.permission?.role_name !== 'write')return deny('caller is not ordinary write');
    if(evidence.rules_complete !== true || evidence.protection_complete !== true)return deny('protection/rules incomplete');
    if(evidence.actor_can_bypass !== false)return deny('bypass absent not proven');
    if(pr.mergeable !== true || pr.mergeable_state !== 'clean')return deny('mergeability not clean');
    const required=requiredChecks(evidence),checks=checkResults(required,evidence);
    if(!checks.eligible)return checks;
    const digest=hash(JSON.stringify({actor:evidence.actor,permission:evidence.permission,protection:evidence.protection,rules:evidence.rules,required,results:{statuses:evidence.statuses,check_runs:evidence.check_runs},mergeable:[pr.mergeable,pr.mergeable_state]}));
    return {eligible:true,required_checks:required,evidence_sha256:digest};
  } catch(e) { return deny('eligibility evidence invalid',{message:String(e.message).slice(0,200)}); }
}

async function reconcile(state,io) {
  const intent=state.merge?.intent;if(!intent || terminal.has(state.merge.status))return false;
  const raw=await io.live(state.pr_number);
  if(raw.merged === true) {
    if(!raw.merged_at || !isSha(raw.merge_commit_sha) || raw.head?.sha !== intent.head_sha)throw new Error('merge read-back incomplete');
    await io.verifyMergeCommit(raw.merge_commit_sha);
    const actor=raw.merged_by ? {login:raw.merged_by.login,id:raw.merged_by.id} : null;
    if(!actor || typeof actor.login !== 'string' || !Number.isSafeInteger(actor.id))throw new Error('merge actor read-back incomplete');
    if(!intent.actor || typeof intent.actor.login !== 'string' || !Number.isSafeInteger(intent.actor.id))throw new Error('merge intent actor incomplete');
    const ours=exactActor(actor,intent.actor);
    if(ours && intent.response?.sha && intent.response.sha !== raw.merge_commit_sha)throw new Error('merge response/read-back mismatch');
    state.merge.status=ours ? 'MERGED' : 'MERGED_EXTERNALLY';
    state.merge.read_back={at:now(),merged_at:raw.merged_at,merge_commit_sha:raw.merge_commit_sha,head_sha:raw.head.sha,actor};
    state.history.push({event:'merge_read_back',status:state.merge.status,attempt_id:intent.attempt_id,...state.merge.read_back});await io.save(state);return true;
  }
  if(raw.state === 'closed') {state.merge.status='CLOSED_NO_MERGE';state.merge.read_back={at:now(),merged:false};await io.save(state);return true;}
  let current;
  try {current=admit(raw);}
  catch {state.merge.status='INVALIDATED';state.merge.read_back={at:now(),reason:'candidate or admission invalid'};await io.save(state);return true;}
  if(current.head_sha !== intent.head_sha || current.base_sha !== intent.base_sha || current.admission_hash !== intent.admission_hash) {
    state.merge.status='INVALIDATED';state.merge.read_back={at:now(),reason:'candidate or admission changed'};await io.save(state);return true;
  }
  return false;
}

export async function advanceAutoMerge(state,live,io,config) {
  const a=validateAutoMergeConfig(config);
  state.merge ??={status:'NONE'};
  try {if(await reconcile(state,io))return;}
  catch(e) {state.merge.status=e.transport ? 'RETRY_IO' : 'WAITING_READ_BACK';state.merge.reason=String(e.message).slice(0,200);await io.save(state);return;}
  if(!a.enabled)return;
  if(terminal.has(state.merge.status))return;
  let evidence;
  try {evidence=await io.mergeEvidence(state.pr_number,live.base_branch);}
  catch(e) {state.merge.status=e.permission ? 'BLOCKED_PERMISSION' : 'RETRY_IO';state.merge.reason=String(e.message).slice(0,200);await io.save(state);return;}
  const eligibility=buildEligibility(state,live,evidence,config);
  state.merge.eligibility={...eligibility,checked_at:now(),head_sha:live.head_sha,base_sha:live.base_sha};
  if(!eligibility.eligible) {
    state.merge.status=state.merge.intent && /candidate|admission/.test(eligibility.reason) ? 'INVALIDATED' : 'WAITING_ELIGIBILITY';
    await io.save(state);return;
  }
  if(!state.merge.intent) {
    state.merge.intent={attempt_id:randomUUID(),repository:REPOSITORY,pr_number:state.pr_number,base_sha:live.base_sha,head_sha:live.head_sha,method:'merge',admission_hash:live.admission_hash,
      actor:{...evidence.actor},review:{issue_id:state.result.issue_id,run_id:state.result.run_id,comment_id:state.result.comment_id,sha256:state.result.sha256},evidence_sha256:eligibility.evidence_sha256,created_at:now(),request_attempted:false};
    state.merge.status='INTENT_SAVED';state.history.push({event:'merge_intent',...state.merge.intent});await io.save(state);
  }
  // Re-read the complete proof immediately before the only write.
  let current;
  try {current=await io.mergeEvidence(state.pr_number,live.base_branch);}
  catch(e) {state.merge.status=e.permission ? 'BLOCKED_PERMISSION' : 'RETRY_IO';state.merge.reason=String(e.message).slice(0,200);await io.save(state);return;}
  const proof=buildEligibility(state,live,current,config);
  if(!proof.eligible || proof.evidence_sha256 !== state.merge.intent.evidence_sha256) {state.merge.status='INVALIDATED';state.merge.reason=proof.reason ?? 'eligibility evidence changed';await io.save(state);return;}
  state.merge.intent.request_attempted=true;state.merge.intent.requested_at=now();state.merge.status='REQUESTING';await io.save(state);
  try {
    const response=await io.merge(state.pr_number,state.merge.intent.head_sha);
    if(response?.merged !== true || !isSha(response.sha))throw new Error('merge response incomplete');
    state.merge.intent.response={received_at:now(),merged:true,sha:response.sha};state.merge.status='READ_BACK';await io.save(state);
  }
  catch(e) {
    state.merge.status=e.permission ? 'BLOCKED_PERMISSION' : e.waiting ? 'WAITING_GITHUB' : 'RETRY_IO';state.merge.reason=String(e.message).slice(0,200);await io.save(state);return;
  }
  try {if(!await reconcile(state,io)) {state.merge.status='RETRY_IO';state.merge.reason='merge response not confirmed by read-back';await io.save(state);}}
  catch(e) {state.merge.status=e.transport ? 'RETRY_IO' : 'WAITING_READ_BACK';state.merge.reason=String(e.message).slice(0,200);await io.save(state);}
}
