import assert from 'node:assert/strict';
import { GATES, REPOSITORY, admit, hash, isSha } from './protocol.mjs';

const now=()=>new Date().toISOString();
const deny=(reason,details={})=>({admitted:false,policy:'DENY',reason,details});

function exactActor(actual,expected) {
  return actual && expected && actual.login === expected.login && actual.id === expected.id
    && typeof actual.login === 'string' && Number.isSafeInteger(actual.id);
}

export function validateAutoMergeConfig(config) {
  const a=config.auto_merge;
  assert(a && typeof a === 'object' && !Array.isArray(a),'missing auto_merge config');
  assert.deepEqual(Object.keys(a).sort(),['enabled','expected_actor','method','version'],'invalid auto_merge fields');
  assert.equal(a.version,2);assert.equal(typeof a.enabled,'boolean');
  assert.equal(a.method,'merge','unsupported auto_merge method');
  assert.deepEqual(Object.keys(a.expected_actor ?? {}).sort(),['id','login'],'invalid expected_actor fields');
  assert(typeof a.expected_actor.login === 'string' && a.expected_actor.login.length > 0,'invalid expected actor login');
  assert(Number.isSafeInteger(a.expected_actor.id) && a.expected_actor.id > 0,'invalid expected actor id');
  assert(a.enabled !== true || config.enabled === true,'auto_merge requires review loop enabled');
  return a;
}

export function buildAutoMergeAdmission(state,live,evidence,config) {
  try {
    const a=validateAutoMergeConfig(config),job=state.job,proof=state.result;
    if(state.status !== 'PASS' || job?.kind !== 'review')return deny('trusted review PASS missing');
    const blockedDurability=(state.durability ?? []).find(j=>j.status === 'DURABLE_KNOWLEDGE_BLOCKED');
    if(blockedDurability)return deny('durability identity blocked',{identity:blockedDurability.identity ?? null});
    if(live.pr_number !== state.pr_number || live.head_sha !== job.head_sha || live.base_sha !== job.base_sha)return deny('stale base/head');
    if(live.admission_hash !== state.admission_hash || job.admission_hash !== state.admission_hash)return deny('admission mismatch');
    if(!proof || proof.verdict !== 'NO_P1_P2' || proof.head_sha !== job.head_sha || proof.base_sha !== job.base_sha
      || proof.issue_id !== job.issue_id || !proof.run_id || !proof.comment_id || !/^[a-f0-9]{64}$/.test(proof.sha256 ?? ''))return deny('review proof incomplete');
    if(!Array.isArray(proof.gates) || proof.gates.length !== 5
      || proof.gates.some(g=>GATES[g.id] !== g.command || g.status !== 'PASS' || g.exit_code !== 0))return deny('review gates not PASS');
    const p1=proof.findings?.P1?.length,p2=proof.findings?.P2?.length,p3=proof.findings?.P3?.length;
    if(![p1,p2,p3].every(Number.isSafeInteger))return deny('finding counts unavailable');
    if(p1 || p2)return deny('P1/P2 present',{P1:p1,P2:p2});
    if(p3)return {admitted:false,policy:'P3_DECISION_REQUIRED',reason:'P3 findings require user decision',details:{P3:p3}};

    const pr=evidence.pr;
    let current;
    try {current=admit(pr);} catch {return deny('admission invalid');}
    if(pr?.number !== state.pr_number || pr.state !== 'open' || pr.draft !== false || pr.merged === true)return deny('PR not open and ready');
    if(pr.base?.repo?.full_name !== REPOSITORY || pr.head?.repo?.full_name !== REPOSITORY)return deny('repository mismatch');
    if(current.base_sha !== job.base_sha || current.head_sha !== job.head_sha || current.base_branch !== live.base_branch)return deny('candidate changed during admission');
    if(current.admission_hash !== state.admission_hash || current.admission_hash !== live.admission_hash)return deny('admission changed during admission');
    if(evidence.repository?.full_name !== REPOSITORY || evidence.repository.allow_auto_merge !== true)return deny('GitHub auto-merge disabled');
    if(evidence.repository.allow_merge_commit !== true)return deny('configured merge method disabled');
    if(!exactActor(evidence.actor,a.expected_actor))return deny('caller identity mismatch');
    if(evidence.enforcement_complete !== true)return deny('branch enforcement unreadable');
    if(evidence.actor_constrained !== true)return deny('merge actor is not constrained by GitHub rules');
    if(evidence.review_loop_required !== true)return deny('Review Loop v2 is not a required status');
    if(pr.mergeable !== true || !['clean','blocked','behind','unstable'].includes(pr.mergeable_state))return deny('mergeability unavailable or conflicting');
    const evidence_sha256=hash(JSON.stringify({actor:evidence.actor,permission:evidence.permission,protection:evidence.protection,
      rules:evidence.rules,rulesets:evidence.rulesets,review_loop_required:evidence.review_loop_required,
      actor_constrained:evidence.actor_constrained,repository:{allow_auto_merge:true,allow_merge_commit:true},
      candidate:{base_sha:current.base_sha,head_sha:current.head_sha,admission_hash:current.admission_hash}}));
    return {admitted:true,policy:'NATIVE_AUTO_MERGE',evidence_sha256};
  } catch(e) {return deny('auto-merge admission evidence invalid',{message:String(e.message).slice(0,200)});}
}

function audit(state,status,live,extra={}) {
  state.auto_merge={status,reviewed_head:live.head_sha,reviewed_base:live.base_sha,checked_at:now(),...extra};
}

function nativeRequestMatches(pr,head) {
  return pr?.auto_merge && pr.head?.sha === head;
}

export async function advanceAutoMerge(state,live,io,config) {
  const a=validateAutoMergeConfig(config);
  let evidence;
  try {evidence=await io.autoMergeEvidence(state.pr_number,live.base_branch);}
  catch(e) {
    if(a.enabled) {audit(state,'PLATFORM_READ_FAILED',live,{reason:String(e.message).slice(0,200)});await io.save(state);}
    return;
  }
  const pr=evidence.pr;
  if(pr?.merged === true) {
    const complete=pr.head?.sha === live.head_sha && typeof pr.merged_at === 'string' && isSha(pr.merge_commit_sha);
    audit(state,complete ? 'MERGED' : 'MERGE_READ_BACK_INCOMPLETE',live,complete ? {merged_at:pr.merged_at,merge_commit_sha:pr.merge_commit_sha} : {});
    await io.save(state);return;
  }
  if(pr?.state === 'closed') {audit(state,'CLOSED_NO_MERGE',live);await io.save(state);return;}
  if(!a.enabled)return;

  const admission=buildAutoMergeAdmission(state,live,evidence,config);
  if(!admission.admitted) {
    audit(state,admission.policy === 'P3_DECISION_REQUIRED' ? 'P3_DECISION_REQUIRED' : 'ADMISSION_BLOCKED',live,
      {reason:admission.reason,details:admission.details});
    await io.save(state);return;
  }
  if(nativeRequestMatches(pr,live.head_sha)) {
    audit(state,'REQUESTED',live,{requested_at:pr.auto_merge.enabled_at ?? null,evidence_sha256:admission.evidence_sha256});
    await io.save(state);return;
  }

  audit(state,'REQUESTING',live,{evidence_sha256:admission.evidence_sha256});await io.save(state);
  try {await io.requestAutoMerge(state.pr_number,live.head_sha,a.method);}
  catch(e) {audit(state,'REQUEST_FAILED',live,{reason:String(e.message).slice(0,200),evidence_sha256:admission.evidence_sha256});await io.save(state);return;}

  try {evidence=await io.autoMergeEvidence(state.pr_number,live.base_branch);}
  catch(e) {audit(state,'REQUEST_READ_BACK_FAILED',live,{reason:String(e.message).slice(0,200),evidence_sha256:admission.evidence_sha256});await io.save(state);return;}
  if(evidence.pr?.merged === true) {
    const complete=evidence.pr.head?.sha === live.head_sha && typeof evidence.pr.merged_at === 'string' && isSha(evidence.pr.merge_commit_sha);
    audit(state,complete ? 'MERGED' : 'MERGE_READ_BACK_INCOMPLETE',live,complete ? {merged_at:evidence.pr.merged_at,merge_commit_sha:evidence.pr.merge_commit_sha} : {});
  } else if(nativeRequestMatches(evidence.pr,live.head_sha)) {
    audit(state,'REQUESTED',live,{requested_at:evidence.pr.auto_merge.enabled_at ?? null,evidence_sha256:admission.evidence_sha256});
  } else audit(state,'REQUEST_NOT_CONFIRMED',live,{evidence_sha256:admission.evidence_sha256});
  await io.save(state);
}
