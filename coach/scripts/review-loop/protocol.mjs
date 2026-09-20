import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const VERSION = 'review-loop/v2.1';
export const REPOSITORY = 'ChildeRolando/MjsoulTileTrace';
export const GATES = Object.freeze({typecheck:'npm run typecheck',build:'npm run build',vitest:'npx vitest run',architecture:'npm run check:architecture','package-import':'npm run test:package-import'});
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
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
    || (a.pr_number === 8 && a.max_rounds === 5 && a.approved_after_round === 4),'invalid authorization round budget');
  if(a.max_rounds === 5) {
    const prior=state.history.filter(e=>e.event === 'authorize_extra_review' && e.max_rounds === 4);
    assert.equal(prior.length,1,'fifth review requires prior fourth-round authorization');
    const {event,...previous}=prior[0];
    assert.equal(reviewRoundLimit({...state,extra_review_authorization:previous}),4);
  }
  assert(text(a.approval_ref) && Number.isFinite(Date.parse(a.approved_at)),'missing authorization provenance');
  assert(isSha(a.head_sha) && isSha(a.base_sha) && /^[a-f0-9]{64}$/.test(a.result_sha256),'invalid authorization identity');
  assert(state.history.some(e=>e.event === 'result' && e.transition === 'BLOCKED' && e.round === a.approved_after_round
    && e.issue_id === a.review_issue_id && e.sha256 === a.result_sha256 && e.head_sha === a.head_sha && e.base_sha === a.base_sha),'authorization source missing');
  return a.max_rounds;
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
    assert((r.verdict === 'NO_P1_P2' && !findings && green && !r.environment_failures.length)
      || (r.verdict === 'CHANGES_REQUIRED' && findings > 0 && !r.environment_failures.length && r.gates.every(g=>g.status !== 'NOT_RUN'))
      || (r.verdict === 'ENVIRONMENT_BLOCKED' && r.environment_failures.length > 0), 'contradictory verdict');
  }
  return {data:r,raw:c.content,sha256:hash(c.content),comment_id:c.id,run_id:c.source_task_id};
}
export function decide(job, result, live, limit=3) {
  assert(limit === 3 || limit === 4 || limit === 5,'invalid round limit');
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
