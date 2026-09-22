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
      title:`[review-loop/v2.1][知识持久化][${identity}] ${REPOSITORY}#${job.pr_number}`,status:'PENDING'});
  }
  await io.save(state);
}
function durabilityDescription(job) {
  const receipt={protocol_version:VERSION,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,
    identity:job.identity,raw_review_sha256:job.raw_review_sha256,finding_id:job.finding.id,commit_sha:'<完整的已推送提交 SHA>',
    branch:`review-loop/durability/${job.identity}`,artifacts:[{path:job.finding.durable_owner,sha256:'<已提交文件内容的 SHA-256>'}],
    checks:job.finding.regression ? [{command:job.finding.regression.command,status:'PASS',exit_code:0}] : []};
  return `将这项非阻断 finding 持久化到仓库拥有的权威 artifact；本工单不改变原始评审结论。读取仓库治理规则和固定 spec，使用现有权威 owner，不创建第二套知识政策。仅在 ${job.worktree} 工作，初始 HEAD 为 ${job.head_sha}。校验附件评审的 SHA-256：${job.raw_review_sha256}（本地文件 ${job.review_file}）。来源评审工单 ${job.source_review_issue_id}，评论 ${job.source_comment_id}，运行 ${job.source_run_id}。保留原始证据。\n\n${JSON.stringify({repository:REPOSITORY,identity:job.identity,pr_number:job.pr_number,head_sha:job.head_sha,finding:job.finding,admission:job.admission},null,2)}\n\n更新 finding 指定的 durable owner；若提供 regression，在指定路径加入可机械执行的回归或检查，并从 coach 目录运行其命令。规范性或历史性知识写入现有权威文档。提交相关 artifact，并且仅无强推地推送到 refs/heads/review-loop/durability/${job.identity}。保持原 PR 分支、合并状态、部署、Agent 配置和来源评审不变。依据固定来源重新确认 finding 仍适用；更新的候选不能替换这个来源。关闭工单或文字承诺不代表完成。若受阻，报告 DURABLE_KNOWLEDGE_BLOCKED，并说明缺少的 owner 或内容。运行仓库五门：${JSON.stringify(GATES)}。\n\n发表一条最终评论，末尾放置严格匹配 ${JSON.stringify(receipt)} 的 review-loop-durability JSON fence。artifacts 必须同时包含 owner 和 regression（若有），并提供已提交 UTF-8 内容的哈希。将工单设为 in_review，不要 mention 其他 Agent。Controller 会独立验证已推送提交和 artifact，验证通过后才记录完成。`;
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
export function authorizeExtraReview(state,approvalRef,at=new Date().toISOString(),source=state.result) {
  const limit=reviewRoundLimit(state);
  assert(limit < 5 && state.protocol_version === VERSION && state.status === 'BLOCKED' && state.round === limit && !state.pending,'extension requires exhausted blocked review');
  const j=state.job;
  assert(j?.kind === 'review' && j.round === limit && j.pr_number === state.pr_number && source?.issue_id === j.issue_id,'extension source mismatch');
  const a={pr_number:state.pr_number,max_rounds:limit+1,approved_after_round:limit,review_issue_id:j.issue_id,result_sha256:source.sha256,head_sha:j.head_sha,base_sha:j.base_sha,approval_ref:approvalRef,approved_at:at};
  reviewRoundLimit({...state,extra_review_authorization:a});
  state.extra_review_authorization=a;
  state.history.push({event:'authorize_extra_review',...a});
  state.status='REVIEWING';state.reason=null;
}
export function recoverRejectedTerminalReview(state,result,request,at=new Date().toISOString()) {
  assert(state.protocol_version === VERSION && state.status === 'BLOCKED' && state.reason === 'contradictory verdict','recovery requires contradictory terminal review');
  assert(state.round === 4 && !state.pending && reviewRoundLimit(state) === 4,'recovery requires exhausted authorized fourth review');
  const job=state.job;
  assert(job?.kind === 'review' && job.round === 4 && job.pr_number === state.pr_number,'recovery job mismatch');
  assert(request.pr_number === state.pr_number && request.round === job.round && request.review_issue_id === job.issue_id,'recovery request identity mismatch');
  assert(request.review_base_sha === job.base_sha && request.review_head_sha === job.head_sha,'recovery review candidate mismatch');
  assert(result.comment_id === request.comment_id && result.run_id === request.run_id && result.sha256 === request.raw_review_sha256,'recovery result identity/hash mismatch');
  assert(result.rejection_reason === state.reason,'recovery rejection mismatch');
  assert(!state.history.some(e=>e.event === 'reject_invalid_review_result' && e.issue_id === job.issue_id),'review result already recovered');
  state.history.push({event:'reject_invalid_review_result',reason:result.rejection_reason,issue_id:job.issue_id,comment_id:result.comment_id,run_id:result.run_id,sha256:result.sha256,head_sha:job.head_sha,base_sha:job.base_sha,round:job.round,at});
  authorizeExtraReview(state,request.approval_ref,at,{issue_id:job.issue_id,sha256:result.sha256});
}
async function observeLive(io,prNumber) {
  const raw=await io.live(prNumber),live=admit(raw);
  live.snapshot=await io.snapshot(raw);
  return live;
}
export function jobDescription(job, live) {
  const common = {protocol_version:VERSION,repository:REPOSITORY,pr_number:job.pr_number,base_sha:job.base_sha,head_sha:job.head_sha,round:job.round,worktree:job.worktree,authoritative_spec_paths:live.admission.authoritative_spec_paths,rubric:live.admission.rubric};
  if(job.kind === 'review') return `${reviewerInstructions}\n\n# 本轮固定任务参数\n\n${JSON.stringify(common,null,2)}\n\n从 worktree/coach 运行以下五门；需要时可先 npm ci。记录真实 exit code：\n${JSON.stringify(GATES,null,2)}\n\n最终评论末尾必须有且仅有一个 review-loop-result JSON fence。严格字段：protocol_version、pr_number、base_sha、head_sha、round（复制固定输入）；verdict（NO_P1_P2、CHANGES_REQUIRED 或 ENVIRONMENT_BLOCKED）；findings {P1:[],P2:[],P3:[]}，每项包含 id、path、line、scenario、consequence、minimal_fix、durability、durable_owner、regression、basis；gates [{id,command,status:PASS|FAIL|NOT_RUN,exit_code:integer|null}]，命令必须与上述五门完全一致；environment_failures 为字符串数组，只放结论形成时仍未恢复的当前环境失败；历史上已恢复的失败保留在正文验证记录，不放入该数组。NO_P1_P2 要求 P1/P2 为空、五门全部 PASS/0 且无环境失败；CHANGES_REQUIRED 要求存在 P1/P2、五门均实际运行且无未恢复环境失败；ENVIRONMENT_BLOCKED 必须解释当前阻塞原因。正文和 JSON 都要包含全部 actionable findings。`;
  return `修复附件中针对该 PR 的完整独立评审。仅在提供的 detached worktree 中工作；编辑前确认本地 HEAD 和远端 PR head 都等于上一候选。\n\n${JSON.stringify(common,null,2)}\n\n评审来源：工单 ${job.source_review_issue_id}，评论 ${job.source_comment_id}，SHA-256 ${job.raw_review_sha256}。完整 UTF-8 评审已作为附件提供，本地路径为 ${job.review_file}。读取 findings 前先校验 SHA-256。完整保留所有 findings；修复全部 P1/P2，并为可机械验证的问题加入持久回归。遵循每项 finding 的 durability metadata，更新指定的权威 owner。保留附件原始评审中的 metadata；工单关闭不能作为知识已进入仓库的证明。读取仓库治理规则和列出的 spec。从 coach 目录运行五门：${JSON.stringify(GATES)}。只提交本工单要求的修复；重新检查远端 PR head 后，将 HEAD 无强推地推送到 origin 的 refs/heads/${live.branch}。若他人已经推送，停止并报告并发冲突。不要合并 PR 或关闭工单。\n\n发表一条最终 Multica 评论，末尾放置 review-loop-fix JSON fence：${JSON.stringify({protocol_version:VERSION,pr_number:job.pr_number,base_sha:job.base_sha,previous_head_sha:job.head_sha,head_sha:'<完整的已推送 SHA>',round:job.round,raw_review_sha256:job.raw_review_sha256})}。将本工单设为 in_review，不要 mention 其他 Agent。如实报告阻碍，不得伪造结果。`;
}

// All effects are recorded before transmission. A lost response is reconciled by
// exact issue title AND exact description/assignment; it is never blindly retried.
export async function ensureDispatch(state, live, kind, io, config, result) {
  let job=state.pending;
  if(!job) {
    const round=kind === 'review' ? state.round+1 : state.round;
    assert(round >= 1 && round <= reviewRoundLimit(state), 'round limit');
    job={kind,round,pr_number:live.pr_number,base_sha:live.base_sha,head_sha:live.head_sha,admission_hash:live.admission_hash,candidate_snapshot:live.snapshot,agent_id:kind === 'review' ? config.reviewer_id : config.fixer_id};
    const kindLabel=kind === 'review' ? '审查' : '修复';
    job.title=`[review-loop/v2.1][${kindLabel}][第${round}轮][${live.head_sha.slice(0,12)}] ${REPOSITORY}#${live.pr_number}`;
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
