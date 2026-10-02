import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const VERSION = 'review-loop/v2.1';
export const REPOSITORY = 'ChildeRolando/MjsoulTileTrace';
export const GATES = Object.freeze({typecheck:'npm run typecheck',build:'npm run build',vitest:'npx vitest run',architecture:'npm run check:architecture','package-import':'npm run test:package-import'});
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const terminalRunStatuses=new Set(['completed','failed','cancelled']);
export const isTerminalRunStatus = status => terminalRunStatuses.has(status);
const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const externalAcceptanceFields=['source','pr_number','review_issue_id','comment_id','run_id','raw_review_sha256','issue_contract_sha256','external_sequence','base_sha','head_sha','admission_hash','approval_ref','accepted_at'];
export const repositoryPath = p => typeof p === 'string' && /^coach\/[a-zA-Z0-9_./-]+$/.test(p) && !p.split('/').some(s=>!s || s === '..' || s === '.');
function keys(v, required) {
  assert(object(v), 'expected object');
  assert.deepEqual(Object.keys(v).sort(), [...required].sort(), 'unexpected/missing fields');
}
// The ledger is operator-owned. Webhooks, admission and agent results cannot
// supply this one-time authorization or alter the default three-round budget.
export function reviewRoundLimit(state) {
  const a=state.extra_review_authorization;
  if(!a)return 3;
  keys(a,['pr_number','max_rounds','approved_after_round','review_issue_id','result_sha256','head_sha','base_sha','approval_ref','approved_at']);
  assert(a.pr_number === state.pr_number && Number.isSafeInteger(a.pr_number) && a.pr_number > 0,'authorization PR mismatch');
  assert((a.max_rounds === 4 && a.approved_after_round === 3)
    || (a.max_rounds === 5 && a.approved_after_round === 4)
    || (a.max_rounds === 6 && a.approved_after_round === 5),'invalid authorization round budget');
  if(a.max_rounds === 5) {
    const prior=state.history.filter(e=>e.event === 'authorize_extra_review' && e.max_rounds === 4);
    assert.equal(prior.length,1,'fifth review requires prior fourth-round authorization');
    const {event,...previous}=prior[0];
    assert.equal(reviewRoundLimit({...state,extra_review_authorization:previous}),4);
  }
  if(a.max_rounds === 6) {
    const prior=state.history.filter(e=>e.event === 'authorize_extra_review' && e.max_rounds === 5);
    assert.equal(prior.length,1,'sixth review requires prior fifth-round authorization');
    const {event,...previous}=prior[0];
    assert.equal(reviewRoundLimit({...state,extra_review_authorization:previous}),5);
  }
  assert(text(a.approval_ref) && Number.isFinite(Date.parse(a.approved_at)),'missing authorization provenance');
  assert(isSha(a.head_sha) && isSha(a.base_sha) && /^[a-f0-9]{64}$/.test(a.result_sha256),'invalid authorization identity');
  assert(state.history.some(e=>(e.event === 'result' && e.transition === 'BLOCKED' || e.event === 'reject_invalid_review_result' && e.reason === 'contradictory verdict') && e.round === a.approved_after_round
    && e.issue_id === a.review_issue_id && e.sha256 === a.result_sha256 && e.head_sha === a.head_sha && e.base_sha === a.base_sha),'authorization source missing');
  return a.max_rounds;
}
export function automaticRoundSixTerminal(state) {
  assert(state.protocol_version === VERSION && state.status === 'BLOCKED' && state.round === 6
    && reviewRoundLimit(state) === 6 && !state.pending,'external review requires exhausted automatic round-6 terminal result');
  const job=state.job,result=state.result;
  assert(job?.kind === 'review' && job.round === 6 && job.pr_number === state.pr_number
    && text(job.issue_id) && text(job.agent_id) && isSha(job.base_sha) && isSha(job.head_sha)
    && /^[a-f0-9]{64}$/.test(state.admission_hash) && job.admission_hash === state.admission_hash,
    'external review automatic round-6 job mismatch');
  assert(result?.issue_id === job.issue_id && text(result.comment_id) && /^[a-f0-9]{64}$/.test(result.sha256),
    'external review automatic round-6 accepted result mismatch');
  const sources=state.history.filter(e=>e.event === 'result' && e.transition === 'BLOCKED' && e.round === 6
    && e.issue_id === job.issue_id && e.comment_id === result.comment_id && text(e.run_id) && e.sha256 === result.sha256
    && e.head_sha === job.head_sha && e.base_sha === job.base_sha);
  assert.equal(sources.length,1,'external review automatic round-6 terminal result missing');
  return sources[0];
}
function snapshotCandidate(snapshot,contents,state) {
  keys(snapshot,['semantics','sha256','observed_at']);
  assert.equal(snapshot.semantics,'github-rest-json-utf8/v1','external review snapshot semantics mismatch');
  assert(/^[a-f0-9]{64}$/.test(snapshot.sha256) && text(snapshot.observed_at)
    && Number.isFinite(Date.parse(snapshot.observed_at)),'external review snapshot reference invalid');
  assert(contents instanceof Map,'external review snapshot bytes missing');
  const bytes=contents.get(snapshot.sha256);
  assert(Buffer.isBuffer(bytes) || typeof bytes === 'string','external review snapshot bytes missing');
  assert.equal(hash(bytes),snapshot.sha256,'external review snapshot content hash mismatch');
  const source=typeof bytes === 'string' ? bytes : new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const candidate=admit(JSON.parse(source));
  assert.equal(candidate.pr_number,state.pr_number,'external review snapshot PR mismatch');
  assert.equal(candidate.admission_hash,state.admission_hash,'external review snapshot admission mismatch');
  return candidate;
}
function candidateChangeExhaustionTerminal(state,live,snapshotContents) {
  assert(state.protocol_version === VERSION && state.status === 'BLOCKED' && state.round === 3
    && state.reason === 'round limit after candidate changed' && state.pending == null,
  'external review requires default round-three candidate-change terminal');
  assert(state.result == null,'external review candidate-change terminal has an accepted result');
  assert(state.extra_review_authorization == null && state.recovery_candidate == null
    && state.sixth_review_candidate == null && state.recovered_review_job == null,
  'external review candidate-change terminal has extra authorization');
  assert.equal(reviewRoundLimit(state),3,'external review candidate-change terminal must use the default round limit');
  const job=state.job;
  assert(job?.kind === 'review' && job.round === 3 && job.pr_number === state.pr_number
    && text(job.issue_id) && text(job.agent_id) && isSha(job.base_sha) && isSha(job.head_sha)
    && /^[a-f0-9]{64}$/.test(state.admission_hash) && job.admission_hash === state.admission_hash,
  'external review candidate-change job mismatch');
  assert(Array.isArray(state.history),'external review candidate-change history missing');
  const acceptance=state.external_review_acceptance;
  assert.equal(state.history.length,6+(acceptance == null ? 0 : 1),'external review candidate-change history length mismatch');
  const issues=new Set();
  for(let round=1;round<=3;round++) {
    const dispatch=state.history[(round-1)*2],discard=state.history[(round-1)*2+1];
    keys(dispatch,['event','kind','round','head_sha','base_sha','issue_id','snapshot','at']);
    keys(discard,['event','reason','issue_id','head_sha','base_sha','round','snapshot','at']);
    assert(dispatch.event === 'dispatch' && dispatch.kind === 'review' && dispatch.round === round
      && discard.event === 'discard' && discard.reason === 'candidate changed before result consumption'
      && discard.round === round,'external review candidate-change history transition mismatch');
    assert(text(dispatch.issue_id) && !issues.has(dispatch.issue_id),'external review candidate-change issue missing or duplicated');
    issues.add(dispatch.issue_id);
    assert(isSha(dispatch.base_sha) && isSha(dispatch.head_sha)
      && discard.issue_id === dispatch.issue_id && discard.base_sha === dispatch.base_sha && discard.head_sha === dispatch.head_sha,
    'external review candidate-change dispatch/discard mismatch');
    assert(object(dispatch.snapshot) && object(discard.snapshot)
      && text(dispatch.at) && text(discard.at) && Number.isFinite(Date.parse(dispatch.at)) && Number.isFinite(Date.parse(discard.at)),
    'external review candidate-change history evidence invalid');
    const dispatched=snapshotCandidate(dispatch.snapshot,snapshotContents,state),discarded=snapshotCandidate(discard.snapshot,snapshotContents,state);
    assert(dispatched.base_sha === dispatch.base_sha && dispatched.head_sha === dispatch.head_sha,
      'external review dispatch snapshot candidate mismatch');
    assert(discarded.base_sha !== dispatch.base_sha || discarded.head_sha !== dispatch.head_sha,
      'external review discard snapshot candidate did not change');
  }
  const lastDispatch=state.history[4],lastDiscard=state.history[5];
  assert(lastDispatch.issue_id === job.issue_id && lastDispatch.base_sha === job.base_sha && lastDispatch.head_sha === job.head_sha
    && lastDiscard.issue_id === job.issue_id && lastDiscard.base_sha === job.base_sha && lastDiscard.head_sha === job.head_sha,
  'external review candidate-change terminal job/history mismatch');
  if(acceptance != null) {
    keys(acceptance,externalAcceptanceFields);
    const event=state.history[6];
    keys(event,['event',...externalAcceptanceFields]);
    assert(event.event === 'accept_external_review','external review candidate-change acceptance event missing');
    for(const field of externalAcceptanceFields)assert.equal(event[field],acceptance[field],`external review candidate-change ${field} history mismatch`);
    assert(acceptance.base_sha !== job.base_sha || acceptance.head_sha !== job.head_sha,
      'external review candidate matches the discarded automatic candidate');
  }
  if(live) {
    assert(live.pr_number === state.pr_number && live.admission_hash === state.admission_hash,
      'external review candidate-change live admission mismatch');
    assert(live.base_sha !== job.base_sha || live.head_sha !== job.head_sha,
      'external review candidate matches the discarded automatic candidate');
  }
  return {kind:'candidate-change-exhaustion',job,last_dispatch:lastDispatch,last_discard:lastDiscard};
}
function resultBearingExhaustionTerminal(state,live,snapshotContents,context) {
  assert(state.protocol_version === VERSION && state.status === 'BLOCKED' && state.round === 3
    && state.reason === 'review gates, environment or round limit' && state.pending == null,
  'external review requires exhausted default round-three result terminal');
  assert(state.extra_review_authorization == null && state.recovery_candidate == null
    && state.sixth_review_candidate == null && state.recovered_review_job == null,
  'external review result terminal has extra authorization');
  assert.equal(reviewRoundLimit(state),3,'external review result terminal must use the default round limit');
  const job=state.job,result=state.result;
  assert(job?.kind === 'review' && job.round === 3 && job.pr_number === state.pr_number
    && text(job.issue_id) && text(job.agent_id) && isSha(job.base_sha) && isSha(job.head_sha)
    && /^[a-f0-9]{64}$/.test(state.admission_hash) && job.admission_hash === state.admission_hash,
  'external review result terminal job mismatch');
  assert(result?.issue_id === job.issue_id && text(result.comment_id) && /^[a-f0-9]{64}$/.test(result.sha256),
    'external review result terminal accepted result mismatch');
  assert(Array.isArray(state.history),'external review result terminal history missing');
  const acceptance=state.external_review_acceptance;
  assert.equal(state.history.length,10+(acceptance == null ? 0 : 1),'external review result terminal history length mismatch');
  const expected=[['review','ROUTE_TO_FIXER'],['fix','DISCARD_AND_REVIEW'],['review','ROUTE_TO_FIXER'],['fix','DISCARD_AND_REVIEW'],['review','BLOCKED']];
  const seenIssues=new Set(),sources=context?.sources,resultArchives=context?.resultArchives;
  assert(sources instanceof Map && resultArchives instanceof Map,'external review historical source evidence missing');
  assert(text(context.reviewerId) && text(context.fixerId) && context.reviewerId !== context.fixerId,
    'external review historical source agents missing');
  assert.equal(job.agent_id,context.reviewerId,'external review terminal job reviewer mismatch');
  const sourceResults=[];
  let previousFixCandidate=null,priorReviewCandidate=null;
  for(let index=0;index<5;index++) {
    const round=Math.floor(index/2)+1,kind=index%2 === 0 ? 'review' : 'fix',at=index*2;
    const dispatch=state.history[at],terminal=state.history[at+1],transition=expected[index][1];
    keys(dispatch,['event','kind','round','head_sha','base_sha','issue_id','snapshot','at']);
    keys(terminal,['event','transition','issue_id','comment_id','run_id','sha256','head_sha','base_sha','round','snapshot','at']);
    assert(dispatch.event === 'dispatch' && dispatch.kind === kind && dispatch.round === round
      && terminal.event === 'result' && terminal.transition === transition && terminal.round === round,
    'external review result terminal history transition mismatch');
    assert(text(dispatch.issue_id) && !seenIssues.has(dispatch.issue_id),'external review result terminal issue missing or duplicated');
    seenIssues.add(dispatch.issue_id);
    assert(isSha(dispatch.base_sha) && isSha(dispatch.head_sha) && terminal.issue_id === dispatch.issue_id
      && terminal.base_sha === dispatch.base_sha && terminal.head_sha === dispatch.head_sha,
    'external review result terminal dispatch/result identity mismatch');
    for(const event of [dispatch,terminal]) {
      assert(object(event.snapshot) && text(event.at) && Number.isFinite(Date.parse(event.at)),
        'external review result terminal event evidence invalid');
    }
    assert(Date.parse(terminal.at) >= Date.parse(dispatch.at),'external review result terminal event order mismatch');
    const dispatched=snapshotCandidate(dispatch.snapshot,snapshotContents,state);
    const observed=snapshotCandidate(terminal.snapshot,snapshotContents,state);
    assert(dispatched.base_sha === dispatch.base_sha && dispatched.head_sha === dispatch.head_sha,
      'external review result terminal dispatch snapshot mismatch');
    if(previousFixCandidate)assert(dispatched.base_sha === previousFixCandidate.base_sha
      && dispatched.head_sha === previousFixCandidate.head_sha,'external review result terminal candidate chain mismatch');
    if(kind === 'fix')assert(priorReviewCandidate && dispatched.base_sha === priorReviewCandidate.base_sha
      && dispatched.head_sha === priorReviewCandidate.head_sha,'external review result terminal fixer candidate mismatch');
    const agentId=kind === 'review' ? context.reviewerId : context.fixerId;
    const sourceKey=`${dispatch.issue_id}:${terminal.sha256}`,source=sources.get(sourceKey),archiveBytes=resultArchives.get(sourceKey);
    assert(source && (Buffer.isBuffer(archiveBytes) || typeof archiveBytes === 'string'),
      'external review historical result archive/source missing');
    assert.equal(source.issue?.id,dispatch.issue_id,'external review historical issue mismatch');
    assert(Array.isArray(source.comments) && Array.isArray(source.runs),'external review historical comments/runs missing');
    const active=new Set(['queued','running','pending','in_progress','starting']);
    assert(source.runs.every(run=>run.issue_id === dispatch.issue_id && run.agent_id === agentId
      && isTerminalRunStatus(run.status) && !active.has(run.status)),'external review historical source has active, unknown or foreign run');
    assert.equal(source.runs.filter(run=>run.status === 'completed').length,1,
      'external review historical source has ambiguous completed runs');
    const sourceJob={kind,pr_number:state.pr_number,round,issue_id:dispatch.issue_id,agent_id:agentId,
      base_sha:dispatch.base_sha,head_sha:dispatch.head_sha,admission_hash:state.admission_hash};
    if(kind === 'fix') {
      const reviewResult=sourceResults.at(-1);
      assert(reviewResult && reviewResult.kind === 'review' && reviewResult.round === round,
        'external review historical fixer lacks its source review');
      sourceJob.raw_review_sha256=reviewResult.parsed.sha256;
    }
    const parsed=parseResult(sourceJob,source.issue,source.comments,source.runs);
    assert.equal(parsed.comment_id,terminal.comment_id,'external review historical comment mismatch');
    assert.equal(parsed.run_id,terminal.run_id,'external review historical run mismatch');
    assert.equal(parsed.sha256,terminal.sha256,'external review historical raw hash mismatch');
    let archived;
    try {
      const bytes=typeof archiveBytes === 'string' ? archiveBytes : new TextDecoder('utf-8',{fatal:true}).decode(archiveBytes);
      archived=JSON.parse(bytes);
    } catch {assert.fail('external review historical archive is corrupt');}
    keys(archived,['data','raw','sha256','comment_id','run_id']);
    assert.deepEqual(archived,parsed,'external review historical archive/source mismatch');
    assert.equal(hash(archived.raw),terminal.sha256,'external review historical archive raw hash mismatch');
    const decision=decide(sourceJob,parsed,observed,3);
    assert.equal(decision.transition,terminal.transition,'external review historical result transition mismatch');
    if(kind === 'review') {
      assert.equal(parsed.data.verdict,'CHANGES_REQUIRED','external review historical reviewer did not require changes');
      priorReviewCandidate=dispatched;
      if(round === 3)assert(parsed.data.gates.every(g=>g.status === 'PASS' && g.exit_code === 0)
        && parsed.data.environment_failures.length === 0,
      'external review terminal Reviewer result is not fully green');
    } else {
      assert.equal(parsed.data.head_sha,observed.head_sha,'external review historical Fixer candidate mismatch');
      previousFixCandidate=observed;
    }
    sourceResults.push({kind,round,job:sourceJob,parsed,dispatch,terminal,dispatched,observed});
  }
  const lastDispatch=state.history[8],lastResult=state.history[9];
  assert(lastDispatch.issue_id === job.issue_id && lastDispatch.base_sha === job.base_sha && lastDispatch.head_sha === job.head_sha
    && lastResult.issue_id === job.issue_id && lastResult.comment_id === result.comment_id && lastResult.sha256 === result.sha256,
  'external review result terminal job/history mismatch');
  assert.equal(sources.size,5,'external review historical source set is ambiguous');
  if(acceptance != null) {
    keys(acceptance,externalAcceptanceFields);
    const event=state.history[10];
    keys(event,['event',...externalAcceptanceFields]);
    assert(event.event === 'accept_external_review','external review result acceptance event missing');
    for(const field of externalAcceptanceFields)assert.equal(event[field],acceptance[field],`external review result acceptance ${field} history mismatch`);
  }
  if(live) {
    assert(live.pr_number === state.pr_number && live.admission_hash === state.admission_hash,
      'external review result terminal live admission mismatch');
    assert(live.base_sha === job.base_sha || context.isAncestorBase === true,
      'external review result terminal live base is not a descendant');
    assert(live.head_sha !== job.head_sha && context.isAncestorHead === true && context.containsLiveBase === true,
      'external review result terminal live head ancestry mismatch');
  }
  return {kind:'result-bearing-exhaustion',job,last_dispatch:lastDispatch,last_result:lastResult,source_results:sourceResults};
}
export function externalReviewTerminal(state,live,snapshotContents,context) {
  if(state.round === 6)
    return {kind:'automatic-round-6',source:automaticRoundSixTerminal(state)};
  if(state.round === 3 && state.result != null)
    return resultBearingExhaustionTerminal(state,live,snapshotContents,context);
  return candidateChangeExhaustionTerminal(state,live,snapshotContents);
}
export function externalReviewAcceptance(state, live,snapshotContents,context) {
  const a=state.external_review_acceptance;
  if(!a)return null;
  keys(a,externalAcceptanceFields);
  assert.equal(a.source,'external_independent_review');
  externalReviewTerminal(state,live,snapshotContents,context);
  assert(a.pr_number === state.pr_number && Number.isSafeInteger(a.external_sequence) && a.external_sequence > state.round,'invalid external review identity');
  assert(isSha(a.base_sha) && isSha(a.head_sha) && /^[a-f0-9]{64}$/.test(a.raw_review_sha256) && /^[a-f0-9]{64}$/.test(a.issue_contract_sha256) && /^[a-f0-9]{64}$/.test(a.admission_hash),'invalid external review hashes');
  for(const k of ['review_issue_id','comment_id','run_id','approval_ref'])assert(text(a[k]),'missing external review provenance');
  assert(Number.isFinite(Date.parse(a.accepted_at)),'missing external review acceptance time');
  if(live)assert(a.pr_number === live.pr_number && a.base_sha === live.base_sha && a.head_sha === live.head_sha && a.admission_hash === live.admission_hash,'external review candidate/admission changed');
  const events=state.history.filter(e=>e.event === 'accept_external_review' && e.source === a.source && e.pr_number === a.pr_number
    && e.review_issue_id === a.review_issue_id && e.comment_id === a.comment_id && e.run_id === a.run_id
    && e.raw_review_sha256 === a.raw_review_sha256 && e.issue_contract_sha256 === a.issue_contract_sha256
    && e.external_sequence === a.external_sequence && e.base_sha === a.base_sha && e.head_sha === a.head_sha
    && e.admission_hash === a.admission_hash && e.approval_ref === a.approval_ref && e.accepted_at === a.accepted_at);
  assert.equal(events.length,1,'external review acceptance history mismatch');
  return a;
}
export function block(content, name) {
  assert(text(content), 'missing content');
  const matches = [...content.matchAll(new RegExp('^```'+name+'\\r?\\n([\\s\\S]*?)^```[ \\t]*$', 'gm'))];
  assert.equal(matches.length, 1, `expected one ${name} block`);
  return {data:JSON.parse(matches[0][1]),end:matches[0].index+matches[0][0].length};
}
export function admit(pr) {
  assert(pr.state === 'open' && pr.draft === false, 'PR must be open and ready');
  assert(Number.isSafeInteger(pr.number) && pr.number > 0);
  assert(pr.base?.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY, 'repository mismatch/fork');
  assert(isSha(pr.base.sha) && isSha(pr.head.sha), 'invalid SHA');
  assert(text(pr.head.ref) && !pr.head.ref.startsWith('-'), 'invalid branch');
  const {data} = block(pr.body, 'review-loop-admission');
  keys(data, ['protocol_version','authoritative_spec_paths','rubric']);
  assert.equal(data.protocol_version, VERSION);
  assert(text(data.rubric) && data.rubric.length <= 16000);
  assert(Array.isArray(data.authoritative_spec_paths) && data.authoritative_spec_paths.length > 0 && data.authoritative_spec_paths.length <= 20);
  for (const p of data.authoritative_spec_paths) assert(typeof p === 'string' && /^coach\/docs\/(specs|development)\/[a-zA-Z0-9_./-]+\.md$/.test(p) && !p.split('/').some(s=>s === '..' || s === '.' || !s), 'unsafe spec path');
  assert.equal(new Set(data.authoritative_spec_paths).size,data.authoritative_spec_paths.length);
  return {pr_number:pr.number,base_sha:pr.base.sha,head_sha:pr.head.sha,branch:pr.head.ref,admission:data,admission_hash:hash(JSON.stringify(data))};
}
export function parseResult(job, issue, comments, runs) {
  assert(issue.id === job.issue_id && issue.assignee_type === 'agent' && issue.assignee_id === job.agent_id, 'assignment mismatch');
  assert(Array.isArray(comments) && Array.isArray(runs));
  assert(['review','fix','durability'].includes(job.kind),'unknown job kind');
  const name = job.kind === 'review' ? 'review-loop-result' : job.kind === 'fix' ? 'review-loop-fix' : 'review-loop-durability';
  const candidates = comments.filter(c => c.content?.includes('```'+name));
  assert.equal(candidates.length,1,'missing/conflicting results');
  const c=candidates[0];
  assert(c.author_type === 'agent' && c.author_id === job.agent_id && c.issue_id === job.issue_id, 'untrusted result author/owner');
  const source=runs.filter(r=>r.id === c.source_task_id && r.issue_id === job.issue_id && r.agent_id === job.agent_id);
  assert.equal(source.length,1,'unknown result run');
  assert.equal(source[0].status,'completed','result run not completed');
  const {data:r,end}=block(c.content,name);
  assert.equal(c.content.slice(end).trim(),'','result block must be final');
  const common=['protocol_version','pr_number','base_sha','head_sha','round'];
  keys(r,job.kind === 'review' ? [...common,'verdict','findings','gates','environment_failures'] : job.kind === 'fix' ? [...common,'previous_head_sha','raw_review_sha256'] : [...common,'identity','raw_review_sha256','finding_id','commit_sha','branch','artifacts','checks']);
  assert.equal(r.protocol_version,VERSION);
  for (const k of ['pr_number','base_sha','round']) assert.equal(r[k],job[k],`result ${k} mismatch`);
  assert(isSha(r.head_sha));
  if(job.kind === 'durability') {
    assert.equal(r.head_sha,job.head_sha);
    assert.equal(r.identity,job.identity);
    assert.equal(r.raw_review_sha256,job.raw_review_sha256);
    assert.equal(r.finding_id,job.finding.id);
    assert(isSha(r.commit_sha) && r.commit_sha !== job.head_sha,'missing durable commit');
    assert.equal(r.branch,`review-loop/durability/${job.identity}`);
    assert(Array.isArray(r.artifacts) && r.artifacts.length > 0);
    const paths=new Set();
    for(const a of r.artifacts) {
      keys(a,['path','sha256']);assert(repositoryPath(a.path) && !paths.has(a.path));paths.add(a.path);
      assert(typeof a.sha256 === 'string' && /^[a-f0-9]{64}$/.test(a.sha256));
    }
    assert(paths.has(job.finding.durable_owner),'missing durable owner artifact');
    assert(Array.isArray(r.checks));
    const regression=job.finding.regression;
    assert.equal(r.checks.length,regression ? 1 : 0);
    if(regression) {
      assert(paths.has(regression.path),'missing regression artifact');
      keys(r.checks[0],['command','status','exit_code']);
      assert.equal(r.checks[0].command,regression.command);
      assert.equal(r.checks[0].status,'PASS');assert.equal(r.checks[0].exit_code,0);
    }
  } else if(job.kind === 'fix') {
    assert.equal(r.previous_head_sha,job.head_sha);
    assert.equal(r.raw_review_sha256,job.raw_review_sha256);
  } else {
    assert.equal(r.head_sha,job.head_sha);
    keys(r.findings,['P1','P2','P3']);
    const ids=new Set();
    for(const [severity,findings] of Object.entries(r.findings)) {
      assert(Array.isArray(findings));
      for(const f of findings) {
        keys(f,['id','path','line','scenario','consequence','minimal_fix','durability','durable_owner','regression','basis']);
        for(const k of ['id','path','scenario','consequence','minimal_fix']) assert(text(f[k]));
        assert(Number.isInteger(f.line) && f.line > 0 && !ids.has(f.id));ids.add(f.id);
        assert(['ephemeral','repository_required'].includes(f.durability),'invalid durability');
        assert(['local_observation','future_limitation','explicit_contract_violation'].includes(f.basis),'invalid finding basis');
        if(f.durability === 'ephemeral') {
          assert(f.durable_owner === null && f.regression === null && f.basis === 'local_observation','ephemeral metadata conflict');
        } else {
          assert(repositoryPath(f.durable_owner),'missing/unsafe durable owner');
          if(f.regression !== null) {
            keys(f.regression,['path','command']);assert(repositoryPath(f.regression.path) && text(f.regression.command),'invalid regression');
          }
        }
        if(f.basis === 'explicit_contract_violation') assert(severity !== 'P3' && f.durability === 'repository_required','explicit contract violation requires P1/P2 and repository durability');
      }
    }
    assert(Array.isArray(r.environment_failures) && r.environment_failures.every(text));
    assert(Array.isArray(r.gates) && r.gates.length === 5);
    const gates=new Set();
    for(const g of r.gates) {
      keys(g,['id','command','status','exit_code']);
      assert(Object.hasOwn(GATES,g.id) && !gates.has(g.id));gates.add(g.id);
      assert.equal(g.command,GATES[g.id]);
      assert((g.status === 'PASS' && g.exit_code === 0) || (g.status === 'FAIL' && Number.isInteger(g.exit_code) && g.exit_code !== 0) || (g.status === 'NOT_RUN' && g.exit_code === null));
    }
    const findings=r.findings.P1.length+r.findings.P2.length;
    const green=r.gates.every(g=>g.status === 'PASS');
    assert(typeof r.verdict === 'string' && ['NO_P1_P2','CHANGES_REQUIRED','ENVIRONMENT_BLOCKED'].includes(r.verdict),'invalid verdict');
    assert((r.verdict === 'NO_P1_P2' && !findings && green && !r.environment_failures.length)
      || (r.verdict === 'CHANGES_REQUIRED' && findings > 0 && !r.environment_failures.length && r.gates.every(g=>g.status !== 'NOT_RUN'))
      || (r.verdict === 'ENVIRONMENT_BLOCKED' && r.environment_failures.length > 0), 'contradictory verdict');
  }
  return {data:r,raw:c.content,sha256:hash(c.content),comment_id:c.id,run_id:c.source_task_id};
}
export function parseRejectedReviewResult(job, issue, comments, runs) {
  assert.equal(job.kind,'review','recovery only supports review results');
  let rejection;
  try { parseResult(job,issue,comments,runs); }
  catch(e) { rejection=e; }
  assert(rejection,'review result is already protocol-valid');
  assert.equal(rejection.message,'contradictory verdict','unsupported review-result rejection');
  const candidates=comments.filter(c=>c.content?.includes('```review-loop-result'));
  assert.equal(candidates.length,1,'missing/conflicting results');
  const c=candidates[0],{data}=block(c.content,'review-loop-result');
  return {data,raw:c.content,sha256:hash(c.content),comment_id:c.id,run_id:c.source_task_id,rejection_reason:rejection.message};
}
export function parseTransportRecoveryResult(job,issue,comments,runs,request) {
  assert.equal(job.kind,'review','transport recovery only supports review');
  assert(Array.isArray(runs) && runs.length >= 2,'transport failure history missing');
  assert(runs.every(run=>run.issue_id === job.issue_id && run.agent_id === job.agent_id),'foreign review run');
  assert(runs.some(run=>run.status === 'failed' && ['runtime_offline','runtime_reconnect_timeout'].includes(run.failure_reason)),'transport failure history missing');
  assert(runs.every(run=>run.status === 'completed' || run.status === 'failed' && ['runtime_offline','runtime_reconnect_timeout'].includes(run.failure_reason)),'unresolved/non-transport review run');
  assert.equal(runs.filter(run=>run.status === 'completed').length,1,'ambiguous completed review runs');
  const result=parseResult(job,issue,comments,runs);
  assert.equal(result.comment_id,request.comment_id,'recovery comment mismatch');
  assert.equal(result.run_id,request.run_id,'recovery run mismatch');
  assert.equal(result.sha256,request.raw_review_sha256,'recovery raw hash mismatch');
  assert.equal(result.data.base_sha,request.review_base_sha,'recovery base mismatch');
  assert.equal(result.data.head_sha,request.review_head_sha,'recovery head mismatch');
  assert.equal(result.data.round,request.round,'recovery round mismatch');
  return result;
}
export function decide(job, result, live, limit=3) {
  assert(limit === 3 || limit === 4 || limit === 5 || limit === 6,'invalid round limit');
  assert(Number.isInteger(job.round) && job.round >= 1 && job.round <= limit,'round limit');
  const next = () => ({transition:job.round < limit ? 'DISCARD_AND_REVIEW' : 'BLOCKED'});
  if(live.base_sha !== job.base_sha || live.head_sha !== job.head_sha) {
    if(job.kind === 'fix' && result.data.head_sha === job.head_sha) return {transition:'BLOCKED'};
    return next();
  }
  if(job.kind === 'fix') return {transition:'BLOCKED'};
  const r=result.data;
  if(r.environment_failures.length || r.gates.some(g=>g.status !== 'PASS')) return {transition:'BLOCKED'};
  if(r.verdict === 'NO_P1_P2') return {transition:'PASS'};
  return {transition:job.round < limit ? 'ROUTE_TO_FIXER' : 'BLOCKED'};
}
