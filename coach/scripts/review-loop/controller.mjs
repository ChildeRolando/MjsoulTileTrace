import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, REPOSITORY, GATES, admit, parseResult, decide, hash, reviewRoundLimit } from './protocol.mjs';

export const activeStatuses = new Set(['queued','dispatched','running','waiting_local_directory']);
export const reviewerInstructions = readFileSync(new URL('./reviewer-instructions.md',import.meta.url),'utf8').trim();

// The queue is independent of PR acceptance and never rebinds a captured source.
export async function captureDurability(state,job,result,live,io,config) {
  state.durability ??=[];
  for(const finding of result.data.findings.P3.filter(f=>f.durability === 'repository_required')) {
    const identity=hash(JSON.stringify([REPOSITORY,job.pr_number,job.head_sha,job.issue_id,result.comment_id,result.sha256,finding.id]));
    if(state.durability.some(j=>j.identity === identity))continue;
    state.durability.push({kind:'durability',identity,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,
      source_review_issue_id:job.issue_id,source_comment_id:result.comment_id,source_run_id:result.run_id,raw_review_sha256:result.sha256,
      raw_review:result.raw,finding:structuredClone(finding),admission:structuredClone(live.admission),agent_id:config.fixer_id,
      title:`[review-loop/v2.1][durability][${identity}] ${REPOSITORY}#${job.pr_number}`,status:'PENDING'});
  }
  await io.save(state);
}
function durabilityDescription(job) {
  const receipt={protocol_version:VERSION,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,
    identity:job.identity,raw_review_sha256:job.raw_review_sha256,finding_id:job.finding.id,commit_sha:'<full pushed commit SHA>',
    branch:`review-loop/durability/${job.identity}`,artifacts:[{path:job.finding.durable_owner,sha256:'<SHA-256 of committed blob bytes>'}],
    checks:job.finding.regression ? [{command:job.finding.regression.command,status:'PASS',exit_code:0}] : []};
  return `Persist this non-blocking finding in its repository-owned artifact. This task does not change the original review verdict. Read repository governance and the pinned specs; use existing authoritative owners, never a second knowledge policy. Work only in ${job.worktree}, initially at ${job.head_sha}. Verify the attached review SHA-256 ${job.raw_review_sha256} (local ${job.review_file}). Source review issue ${job.source_review_issue_id}, comment ${job.source_comment_id}, run ${job.source_run_id}. Preserve the original evidence.\n\n${JSON.stringify({repository:REPOSITORY,identity:job.identity,pr_number:job.pr_number,head_sha:job.head_sha,finding:job.finding,admission:job.admission},null,2)}\n\nUpdate the named durable owner; when regression is supplied, add the mechanically executable regression/check at that path and run its command from coach. For normative/historical knowledge update the existing authoritative document. Commit the artifacts and push without force ONLY to refs/heads/review-loop/durability/${job.identity}. Never push the original PR branch, merge, deploy, change agent configuration or edit the source review. Reassess applicability using the pinned source; newer candidates do not replace this source. Issue closure or a prose promise is not completion. If blocked, report DURABLE_KNOWLEDGE_BLOCKED and missing owner/content. Run the five repository gates: ${JSON.stringify(GATES)}.\n\nPost one final comment ending with a strict review-loop-durability JSON fence matching ${JSON.stringify(receipt)}. artifacts must include both owner and regression (if present), with committed UTF-8 content hashes. Set in_review; no agent mentions. Controller independently verifies the pushed commit/artifacts before recording completion.`;
}
export async function advanceDurability(state,io,config) {
  for(const job of state.durability ?? []) {
    if(job.status === 'COMPLETE')continue;
    try {
      if(!job.prepared_at) {
        job.worktree=await io.prepare(job);
        job.review_file=await io.saveReview(job,job.raw_review);
        job.description=durabilityDescription(job);job.description_hash=hash(job.description);
        job.prepared_at=new Date().toISOString();await io.save(state);
      }
      if(!job.issue_id) {
        const matches=(await io.issues()).filter(i=>i.title === job.title);
        assert(matches.length <= 1,'duplicate durability identity');
        let issue=matches[0];
        if(issue) assert(issue.project_id === config.project_id && issue.assignee_type === 'agent' && issue.assignee_id === job.agent_id && hash(issue.description) === job.description_hash,'durability dispatch conflict');
        else {
          assert(!job.attempted_at,'durability dispatch response unknown; reconcile before retry');
          job.attempted_at=new Date().toISOString();await io.save(state);
          issue=await io.create(job);assert(issue.id,'missing durability issue');
        }
        job.issue_id=issue.id;job.identifier=issue.identifier;job.status='WAITING';job.error=null;
        await io.save(state);continue;
      }
      const runs=await io.runs(job.issue_id);assert(Array.isArray(runs));
      if(runs.some(r=>activeStatuses.has(r.status)))continue;
      const result=parseResult(job,await io.issue(job.issue_id),await io.comments(job.issue_id),runs);
      const verified=await io.verifyDurability(job,result);
      await io.archiveResult(job,result);
      job.completion={...verified,comment_id:result.comment_id,run_id:result.run_id,sha256:result.sha256,receipt:result.data,verified_at:new Date().toISOString()};
      job.status='COMPLETE';job.error=null;
      state.history.push({event:'durability_complete',identity:job.identity,issue_id:job.issue_id,...job.completion});
    } catch(e) {
      job.status=e.transport ? 'RETRY_IO' : 'DURABLE_KNOWLEDGE_BLOCKED';job.error=String(e.message).slice(0,600);
    }
    await io.save(state);
  }
}
// Operator-only operation: the caller must hold the deployment lock and have
// explicit human approval. It resumes this exact terminal review once, without
// resetting rounds or erasing any prior result. tick never calls this function.
export function authorizeExtraReview(state,approvalRef,at=new Date().toISOString()) {
  const limit=reviewRoundLimit(state);
  assert(limit < 5 && state.protocol_version === VERSION && state.status === 'BLOCKED' && state.round === limit && !state.pending,'extension requires exhausted blocked review');
  const j=state.job;
  assert(j?.kind === 'review' && j.round === limit && j.pr_number === state.pr_number && state.result?.issue_id === j.issue_id,'extension source mismatch');
  const a={pr_number:state.pr_number,max_rounds:limit+1,approved_after_round:limit,review_issue_id:j.issue_id,result_sha256:state.result.sha256,head_sha:j.head_sha,base_sha:j.base_sha,approval_ref:approvalRef,approved_at:at};
  reviewRoundLimit({...state,extra_review_authorization:a});
  state.extra_review_authorization=a;
  state.history.push({event:'authorize_extra_review',...a});
  state.status='REVIEWING';state.reason=null;
}
async function observeLive(io,prNumber) {
  const raw=await io.live(prNumber),live=admit(raw);
  live.snapshot=await io.snapshot(raw);
  return live;
}
export function jobDescription(job, live) {
  const common = {protocol_version:VERSION,repository:REPOSITORY,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,worktree:job.worktree,authoritative_spec_paths:live.admission.authoritative_spec_paths,rubric:live.admission.rubric};
  if(job.kind === 'review') return `${reviewerInstructions}\n\n# 本轮固定任务参数\n\n${JSON.stringify(common,null,2)}\n\n从 worktree/coach 运行以下五门；需要时可先 npm ci。记录真实 exit code：\n${JSON.stringify(GATES,null,2)}\n\n最终评论末尾必须有且仅有一个 review-loop-result JSON fence。严格字段：protocol_version、pr_number、base_sha、head_sha、round（复制固定输入）；verdict（NO_P1_P2、CHANGES_REQUIRED 或 ENVIRONMENT_BLOCKED）；findings {P1:[],P2:[],P3:[]}，每项包含 id、path、line、scenario、consequence、minimal_fix、durability、durable_owner、regression、basis；gates [{id,command,status:PASS|FAIL|NOT_RUN,exit_code:integer|null}]，命令必须与上述五门完全一致；environment_failures 为字符串数组。NO_P1_P2 要求 P1/P2 为空、五门全部 PASS/0 且无环境失败；CHANGES_REQUIRED 要求存在 P1/P2 且五门均实际运行；ENVIRONMENT_BLOCKED 必须解释原因。正文和 JSON 都要包含全部 actionable findings。`;
  return `Fix the attached complete independent review for this exact PR. Work only in the supplied detached worktree; verify HEAD and live PR head equal the previous candidate before editing.\n\n${JSON.stringify(common,null,2)}\n\nReview source: issue ${job.source_review_issue_id}, comment ${job.source_comment_id}, SHA-256 ${job.raw_review_sha256}. The exact UTF-8 review is attached and available locally at ${job.review_file}. Verify its SHA-256 before reading findings. Preserve all findings; fix every P1/P2 and add durable regression coverage where mechanically testable, honoring each finding durability metadata and updating the named authoritative owner. Preserve metadata in the attached raw review; do not claim repository durability from issue closure. Read repository governance and listed specs. Run the five commands from coach: ${JSON.stringify(GATES)}. Commit only requested fixes, then push HEAD:refs/heads/${live.branch} to origin without force, after rechecking live PR head. If someone else pushed, stop and report the race. No merge or ticket closure.\n\nPost one final Multica comment ending with a fenced review-loop-fix JSON block: ${JSON.stringify({protocol_version:VERSION,pr_number:job.pr_number,base_sha:job.base_sha,previous_head_sha:job.head_sha,head_sha:'<full pushed SHA>',round:job.round,raw_review_sha256:job.raw_review_sha256})}. Set this issue in_review. Do not mention other agents. Report obstacles honestly instead of fabricating a result.`;
}

// All effects are recorded before transmission. A lost response is reconciled by
// exact issue title AND exact description/assignment; it is never blindly retried.
export async function ensureDispatch(state, live, kind, io, config, result) {
  let job=state.pending;
  if(!job) {
    const round=kind === 'review' ? state.round+1 : state.round;
    assert(round >= 1 && round <= reviewRoundLimit(state), 'round limit');
    job={kind,round,pr_number:live.pr_number,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,candidate_snapshot:live.snapshot,agent_id:kind === 'review' ? config.reviewer_id : config.fixer_id};
    job.title=`[review-loop/v2.1][${kind}][r${round}][${live.head_sha.slice(0,12)}] ${REPOSITORY}#${live.pr_number}`;
    // A review replacement must survive worktree preparation transport failures.
    // Fix preparation remains recoverable by replaying its authenticated result.
    if(kind === 'review') {state.pending=job;await io.save(state);}
  }
  assert(job.round >= 1 && job.round <= reviewRoundLimit(state),'round limit');
  if(!job.prepared_at) {
    job.worktree=await io.prepare(job);
    if(job.kind === 'fix') {
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
    let current=await observeLive(io,live.pr_number);
    assert.equal(current.admission_hash,job.admission_hash,'admission changed before dispatch');
    if(current.head_sha !== job.head_sha || current.base_sha !== job.base_sha) {
      state.history.push({event:'discard',reason:'candidate changed before dispatch',kind:job.kind,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:current.snapshot,at:new Date().toISOString()});
      state.pending=null;state.snapshot=current.snapshot;
      return ensureDispatch(state,current,'review',io,config);
    }
    await io.checkSpecs(current);
    current=await observeLive(io,live.pr_number);
    assert.equal(current.admission_hash,job.admission_hash,'admission changed before dispatch');
    if(current.head_sha !== job.head_sha || current.base_sha !== job.base_sha) {
      state.history.push({event:'discard',reason:'candidate changed before dispatch',kind:job.kind,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:current.snapshot,at:new Date().toISOString()});
      state.pending=null;state.snapshot=current.snapshot;
      return ensureDispatch(state,current,'review',io,config);
    }
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
  const limit=reviewRoundLimit(state);
  assert(Number.isInteger(state.round) && state.round >= 0 && state.round <= limit,'round limit');
  if(state.admission_hash && live.admission_hash !== state.admission_hash) throw new Error('admission changed during loop');
  state.admission_hash ??=live.admission_hash;
  if(state.pending) return ensureDispatch(state,live,state.pending.kind,io,config);
  if(!state.job) return ensureDispatch(state,live,'review',io,config);
  if(state.status === 'BLOCKED') return;
  if(state.status === 'PASS') {
    if(live.head_sha === state.job.head_sha && live.base_sha === state.job.base_sha) return;
    assert(state.round < limit,'round limit after new push');
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
  if(job.kind === 'review' && (current.head_sha !== job.head_sha || current.base_sha !== job.base_sha)) {
    state.history.push({event:'discard',reason:'candidate changed before result consumption',issue_id:job.issue_id,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:current.snapshot,at:new Date().toISOString()});
    if(state.round >= limit) {
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
  const {transition}=decide(job,result,live,limit);
  state.history.push({event:'result',transition,issue_id:job.issue_id,comment_id:result.comment_id,run_id:result.run_id,sha256:result.sha256,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,snapshot:live.snapshot,at:new Date().toISOString()});
  await io.archiveResult(job,result);
  if(job.kind === 'review' && job.head_sha === live.head_sha && job.base_sha === live.base_sha) await captureDurability(state,job,result,live,io,config);
  if(transition === 'ROUTE_TO_FIXER') return ensureDispatch(state,live,'fix',io,config,result);
  if(transition === 'DISCARD_AND_REVIEW') return ensureDispatch(state,live,'review',io,config);
  state.status=transition;state.reason=transition === 'BLOCKED' ? 'review gates, environment or round limit' : null;
  state.result={comment_id:result.comment_id,sha256:result.sha256,issue_id:job.issue_id};
  await io.save(state);
}
