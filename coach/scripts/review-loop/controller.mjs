import assert from 'node:assert/strict';
import { VERSION, REPOSITORY, GATES, admit, parseResult, decide, hash } from './protocol.mjs';

export const activeStatuses = new Set(['queued','dispatched','running','waiting_local_directory']);
async function observeLive(io,prNumber) {
  const raw=await io.live(prNumber),live=admit(raw);
  live.snapshot=await io.snapshot(raw);
  return live;
}
export function jobDescription(job, live) {
  const common = {protocol_version:VERSION,repository:REPOSITORY,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,worktree:job.worktree,authoritative_spec_paths:live.admission.authoritative_spec_paths,rubric:live.admission.rubric};
  if(job.kind === 'review') return `Fresh independent review. Use only this task's input, listed repository specs and repository governance. Read the exact base..head diff in the supplied detached worktree. Prior reviews, parent/sibling issues and prior agent sessions are outside the review input. Keep tracked files/index/HEAD unchanged; ignored dependency/build outputs are allowed. Do not delegate, fix, merge or submit GitHub approval.\n\n${JSON.stringify(common,null,2)}\n\nRun all five commands from worktree/coach; install dependencies with npm ci if needed. Record their actual exit codes.\n${JSON.stringify(GATES,null,2)}\n\nPost one final Multica comment on THIS issue, ending with one fenced review-loop-result JSON block. Fields: protocol_version, pr_number, base_sha, head_sha, round (copy pinned input); verdict (NO_P1_P2, CHANGES_REQUIRED or ENVIRONMENT_BLOCKED); findings {P1:[],P2:[],P3:[]} where every finding has id,path,line,scenario,consequence,minimal_fix; gates [{id,command,status:PASS|FAIL|NOT_RUN,exit_code:integer|null}] with all five exact commands; environment_failures (array of strings). NO_P1_P2 requires empty P1/P2, all five PASS/0 and no environment failure. CHANGES_REQUIRED needs P1/P2 and every gate actually run. ENVIRONMENT_BLOCKED needs an explanation. Include all actionable findings in the prose and JSON. Set issue in_review after posting. Do not mention another agent. A final chat response alone is insufficient; the controller reads issue comments.`;
  return `Fix the attached complete independent review for this exact PR. Work only in the supplied detached worktree; verify HEAD and live PR head equal the previous candidate before editing.\n\n${JSON.stringify(common,null,2)}\n\nReview source: issue ${job.source_review_issue_id}, comment ${job.source_comment_id}, SHA-256 ${job.raw_review_sha256}. The exact UTF-8 review is attached and available locally at ${job.review_file}. Verify its SHA-256 before reading findings. Preserve all findings; fix every P1/P2 and add durable regression coverage where mechanically testable. Read repository governance and listed specs. Run the five commands from coach: ${JSON.stringify(GATES)}. Commit only requested fixes, then push HEAD:refs/heads/${live.branch} to origin without force, after rechecking live PR head. If someone else pushed, stop and report the race. No merge or ticket closure.\n\nPost one final Multica comment ending with a fenced review-loop-fix JSON block: ${JSON.stringify({protocol_version:VERSION,pr_number:job.pr_number,base_sha:job.base_sha,previous_head_sha:job.head_sha,head_sha:'<full pushed SHA>',round:job.round,raw_review_sha256:job.raw_review_sha256})}. Set this issue in_review. Do not mention other agents. Report obstacles honestly instead of fabricating a result.`;
}

// All effects are recorded before transmission. A lost response is reconciled by
// exact issue title AND exact description/assignment; it is never blindly retried.
export async function ensureDispatch(state, live, kind, io, config, result) {
  let job=state.pending;
  if(!job) {
    const round=kind === 'review' ? state.round+1 : state.round;
    assert(round >= 1 && round <= 3, 'round limit');
    job={kind,round,pr_number:live.pr_number,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,candidate_snapshot:live.snapshot,agent_id:kind === 'review' ? config.reviewer_id : config.fixer_id};
    job.title=`[review-loop/v2][${kind}][r${round}][${live.head_sha.slice(0,12)}] ${REPOSITORY}#${live.pr_number}`;
    job.worktree=await io.prepare(job);
    if(kind === 'fix') {
      job.source_review_issue_id=state.job.issue_id;job.source_comment_id=result.comment_id;
      job.raw_review_sha256=result.sha256;
      job.review_file=await io.saveReview(job,result.raw);
    }
    job.description=jobDescription(job,live);
    job.description_hash=hash(job.description);
    job.prepared_at=new Date().toISOString();
    state.pending=job;await io.save(state);
  }
  const matches=(await io.issues()).filter(i=>i.title === job.title);
  assert(matches.length <= 1, 'duplicate dispatch identity');
  let issue=matches[0];
  if(issue) {
    assert(issue.project_id === config.project_id && issue.assignee_type === 'agent' && issue.assignee_id === job.agent_id && hash(issue.description) === job.description_hash,'dispatch identity conflict');
  } else {
    assert(!job.attempted_at,'dispatch response unknown; reconcile before retry');
    const current=await observeLive(io,live.pr_number);
    assert(current.head_sha === job.head_sha && current.base_sha === job.base_sha && current.admission_hash === job.admission_hash,'candidate changed before dispatch');
    job.dispatch_snapshot=current.snapshot;state.snapshot=current.snapshot;
    job.attempted_at=new Date().toISOString();await io.save(state);
    issue=await io.create(job);
    assert(issue.id,'missing created issue identity');
  }
  job.issue_id=issue.id;job.identifier=issue.identifier;
  state.job=job;state.pending=null;state.round=job.round;state.status=kind === 'review' ? 'REVIEWING' : 'FIXING';
  state.history.push({event:'dispatch',kind,round:job.round,head_sha:job.head_sha,base_sha:job.base_sha,issue_id:issue.id,snapshot:job.dispatch_snapshot ?? job.candidate_snapshot,at:new Date().toISOString()});
  await io.save(state);
}

export async function advance(state, live, io, config) {
  if(state.admission_hash && live.admission_hash !== state.admission_hash) throw new Error('admission changed during loop');
  state.admission_hash ??=live.admission_hash;
  if(state.pending) return ensureDispatch(state,live,state.pending.kind,io,config);
  if(!state.job) return ensureDispatch(state,live,'review',io,config);
  if(state.status === 'BLOCKED') return;
  if(state.status === 'PASS') {
    if(live.head_sha === state.job.head_sha && live.base_sha === state.job.base_sha) return;
    assert(state.round < 3,'round limit after new push');
    return ensureDispatch(state,live,'review',io,config);
  }
  const job=state.job;
  const runs=await io.runs(job.issue_id);
  assert(Array.isArray(runs));
  if(runs.some(r=>activeStatuses.has(r.status))) return;
  assert(runs.length > 0,'assigned issue has no run');
  let current=await observeLive(io,live.pr_number);
  assert.equal(current.admission_hash,state.admission_hash,'admission changed during result read');
  state.snapshot=current.snapshot;
  if(current.head_sha !== job.head_sha || current.base_sha !== job.base_sha) {
    state.history.push({event:'discard',reason:'candidate changed before result consumption',issue_id:job.issue_id,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:current.snapshot,at:new Date().toISOString()});
    if(state.round >= 3) {
      state.status='BLOCKED';state.reason='round limit after candidate changed';await io.save(state);return;
    }
    return ensureDispatch(state,current,'review',io,config);
  }
  const issue=await io.issue(job.issue_id), comments=await io.comments(job.issue_id);
  const result=parseResult(job,issue,comments,runs);
  // Re-read immediately before a decision; polling input may be stale after IO.
  live=await observeLive(io,live.pr_number);state.snapshot=live.snapshot;
  assert.equal(live.admission_hash,state.admission_hash,'admission changed during result read');
  await io.verifyCheckout(job,result,live);
  const {transition}=decide(job,result,live);
  state.history.push({event:'result',transition,issue_id:job.issue_id,comment_id:result.comment_id,run_id:result.run_id,sha256:result.sha256,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:live.snapshot,at:new Date().toISOString()});
  await io.archiveResult(job,result);
  if(transition === 'ROUTE_TO_FIXER') return ensureDispatch(state,live,'fix',io,config,result);
  if(transition === 'DISCARD_AND_REVIEW') return ensureDispatch(state,live,'review',io,config);
  state.status=transition;state.reason=transition === 'BLOCKED' ? 'review gates, environment or round limit' : null;
  state.result={comment_id:result.comment_id,sha256:result.sha256,issue_id:job.issue_id};
  await io.save(state);
}
