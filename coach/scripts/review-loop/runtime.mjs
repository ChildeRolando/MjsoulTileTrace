import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, open, unlink, realpath, readdir, copyFile, lstat, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admit, VERSION, REPOSITORY, hash, isSha, parseResult, parseRejectedReviewResult, parseTransportRecoveryResult, externalReviewTerminal, externalReviewAcceptance, decide, reviewRoundLimit } from './protocol.mjs';
import { advance, advanceDurability, captureDurability, ensureDispatch, authorizeSixthReview, recoverRejectedTerminalReview, validateTransportRecovery, acceptTransportRecovery, transportReviewJob, activeStatuses, jobDescription } from './controller.mjs';
const exec=promisify(execFile);
export async function command(file,args,cwd) {
  try { return (await exec(file,args,{cwd,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000})).stdout; }
  catch (cause) {
    const error=new Error(`${path.basename(file)} operation failed (${args[0] ?? ''}); inspect locally`,{cause});
    error.exitCode=Number.isInteger(cause.code) ? cause.code : null;
    error.transport=true;
    throw error;
  }
}
export async function atomicJson(file,data) {
  const tmp=`${file}.${process.pid}.tmp`;
  await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(tmp,file);
}
async function readJson(file,fallback) {
  try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code === 'ENOENT' && fallback !== undefined)return fallback;throw e;}
}
async function candidateChangeSnapshotContents(state,readSnapshot) {
  if(state?.round !== 3)return undefined;
  assert.equal(typeof readSnapshot,'function','external review snapshot reader missing');
  const refs=Array.isArray(state.history) ? state.history
    .filter(event=>event?.event === 'dispatch' || event?.event === 'discard')
    .map(event=>event.snapshot).filter(Boolean) : [];
  const hashes=new Set();
  for(const ref of refs)if(typeof ref.sha256 === 'string' && /^[a-f0-9]{64}$/.test(ref.sha256))hashes.add(ref.sha256);
  const contents=new Map();
  for(const sha256 of hashes)contents.set(sha256,await readSnapshot(sha256));
  return contents;
}
export async function acquireLock(dir) {
  await mkdir(dir,{recursive:true});
  const file=path.join(dir,'controller.lock');
  let handle;
  try{handle=await open(file,'wx',0o600);}catch(e){if(e.code === 'EEXIST')return null;throw e;}
  await handle.writeFile(JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  return async()=>{await handle.close();await unlink(file);};
}
export async function recoverLock(dir) {
  const file=path.join(dir,'controller.lock'), lock=await readJson(file);
  assert(Number.isSafeInteger(lock.pid) && lock.pid > 0,'invalid lock');
  try{process.kill(lock.pid,0);throw new Error('controller PID still exists');}catch(e){if(e.code !== 'ESRCH')throw e;}
  // Operator-only command; stop the Autopilot before running it.
  await unlink(file);
}
export function makeIO(config,stateFile,stateDir,runCommand=command) {
  const gh=async args=>JSON.parse(await runCommand(config.gh_path,['api',...args]));
  const multica=async args=>JSON.parse(await runCommand(config.multica_path,['--profile',config.profile,'--workspace-id',config.workspace_id,...args,'--output','json'],stateDir));
  const git=async args=>runCommand(config.git_path,args,config.repository_path);
  const api=`repos/${REPOSITORY}`;
  const readSnapshot=async sha256=>{
    assert(/^[a-f0-9]{64}$/.test(sha256),'invalid snapshot address');
    const directory=path.join(stateDir,'snapshots');
    assert((await lstat(directory)).isDirectory(),'snapshot directory must be a regular directory');
    const file=path.join(directory,`${sha256}.json`);
    assert((await lstat(file)).isFile(),'snapshot must be a regular file');
    return readFile(file);
  };
  const worktree = job => path.join(stateDir,'worktrees',job.kind === 'durability' ? `durability-${job.identity}` : `pr-${job.pr_number}-${job.kind}-${job.round}-${job.head_sha.slice(0,12)}`);
  async function allIssues() {
    const out=[];
    for(let offset=0;offset<10000;) {
      const page=await multica(['issue','list','--project',config.project_id,'--limit','100','--offset',String(offset)]);
      assert(Array.isArray(page.issues));out.push(...page.issues);
      if(page.has_more === false)return out;
      assert(page.has_more === true && page.issues.length > 0,'issue pagination incomplete');offset+=page.issues.length;
    }
    throw new Error('issue pagination limit');
  }
  return {
    live: n=>gh([`${api}/pulls/${n}`]),
    openPRs: async()=>{
      const pages=await gh([`${api}/pulls?state=open&per_page=100`,'--paginate','--slurp']);
      assert(Array.isArray(pages) && pages.every(Array.isArray));return pages.flat();
    },
    save: s=>atomicJson(stateFile,s),
    snapshot: async pr=>{
      const content=JSON.stringify(pr);const sha256=hash(content);
      const dir=path.join(stateDir,'snapshots');await mkdir(dir,{recursive:true});
      await writeFile(path.join(dir,`${sha256}.json`),content,{mode:0o600});
      return {semantics:'github-rest-json-utf8/v1',sha256,observed_at:new Date().toISOString()};
    },
    readSnapshot,
    issues:allIssues,
    issue:id=>multica(['issue','get',id]),
    runs:id=>multica(['issue','runs',id]),
    comments:id=>multica(['issue','comment','list',id,'--full']),
    prepare:async job=>{
      const dir=worktree(job);await mkdir(path.dirname(dir),{recursive:true});
      await git(['fetch','origin']);
      for(const sha of [job.base_sha,job.head_sha])assert.equal((await git(['rev-parse',`${sha}^{commit}`])).trim(),sha);
      const trees=(await git(['worktree','list','--porcelain'])).replaceAll('\\','/');
      if(!trees.includes(`worktree ${dir.replaceAll('\\','/')}\n`))await git(['worktree','add','--detach',dir,job.head_sha]);
      assert.equal((await runCommand(config.git_path,['rev-parse','HEAD'],dir)).trim(),job.head_sha);
      assert.equal((await runCommand(config.git_path,['status','--porcelain','--untracked-files=no'],dir)).trim(),'');
      return dir;
    },
    checkSpecs:async live=>{
      await git(['fetch','origin']);
      for(const p of live.admission.authoritative_spec_paths) {
        const row=await git(['ls-tree',live.head_sha,'--',p]);
        assert(row.startsWith('100644 blob ') || row.startsWith('100755 blob '),'spec missing or symlink');
      }
    },
    saveReview:async(job,raw)=>{
      assert.equal(hash(raw),job.raw_review_sha256);
      const dir=path.join(stateDir,'reviews');await mkdir(dir,{recursive:true});
      const file=path.join(dir,`${job.raw_review_sha256}.txt`);await writeFile(file,raw,{mode:0o600});return file;
    },
    archiveResult:async(job,result)=>{
      const dir=path.join(stateDir,'results');await mkdir(dir,{recursive:true});
      await atomicJson(path.join(dir,`${job.issue_id}-${result.sha256}.json`),result);
    },
    archiveExternalResult:async(issueId,result)=>{
      const dir=path.join(stateDir,'external-results');await mkdir(dir,{recursive:true});
      await atomicJson(path.join(dir,`${issueId}-${result.sha256}.json`),result);
    },
    create:async job=>{
      const file=path.join(stateDir,'dispatch.md');await writeFile(file,job.description,{mode:0o600});
      const args=['issue','create','--title',job.title,'--project',config.project_id,'--assignee-id',job.agent_id,'--description-file',file,'--status','todo'];
      if(job.kind === 'fix' || job.kind === 'durability')args.push('--attachment',job.review_file);
      return multica(args);
    },
    verifyDurability:async(job,result)=>{
      const r=result.data;
      assert.equal(r.branch,`review-loop/durability/${job.identity}`);
      let advertised;
      try {advertised=(await git(['ls-remote','--exit-code','origin',`refs/heads/${r.branch}`])).trim();}
      catch(e) {
        if(e.exitCode === 2)throw new Error('durability branch missing from reachable origin');
        throw e;
      }
      const [advertisedSha,advertisedRef,...extra]=advertised.split(/\s+/);
      assert(isSha(advertisedSha) && advertisedRef === `refs/heads/${r.branch}` && extra.length === 0,'invalid durability branch advertisement');
      await git(['fetch','--no-tags','origin',`refs/heads/${r.branch}`]);
      const remote=(await git(['rev-parse','FETCH_HEAD'])).trim();assert(isSha(remote));
      assert.equal(remote,advertisedSha,'durability branch changed during verification');
      try {await git(['cat-file','-e',`${r.commit_sha}^{commit}`]);}
      catch(e) {if(e.exitCode === 128)throw new Error('durability receipt commit missing or not a commit');throw e;}
      for(const [from,to] of [[job.head_sha,r.commit_sha],[r.commit_sha,remote]]) {
        try {await git(['merge-base','--is-ancestor',from,to]);}
        catch(e) {if(e.exitCode === 1)throw new Error('durability commit ancestry/reachability mismatch');throw e;}
      }
      assert.notEqual(r.commit_sha,job.head_sha,'durability did not produce new commit');
      for(const artifact of r.artifacts) {
        const row=await git(['ls-tree',r.commit_sha,'--',artifact.path]);
        const match=row.match(/^(100644|100755) blob ([a-f0-9]{40,64})\t/);
        assert(match,'durable artifact missing or not regular file');
        const previous=await git(['ls-tree',job.head_sha,'--',artifact.path]);
        const previousBlob=previous.match(/^[0-9]{6} blob ([a-f0-9]{40,64})\t/)?.[1];
        assert.notEqual(match[2],previousBlob,'durable artifact content unchanged from reviewed head');
        const content=await git(['show',`${r.commit_sha}:${artifact.path}`]);
        assert.equal(hash(content),artifact.sha256,'durable artifact hash mismatch');
      }
      return {commit_sha:r.commit_sha,remote_head_sha:remote,branch:r.branch,artifacts:r.artifacts};
    },
    verifyCheckout:async(job,result,live)=>{
      assert.equal(await realpath(job.worktree),await realpath(worktree(job)));
      const status=(await runCommand(config.git_path,['status','--porcelain','--untracked-files=no'],job.worktree)).trim();
      assert.equal(status,'','agent left tracked modifications');
      const head=(await runCommand(config.git_path,['rev-parse','HEAD'],job.worktree)).trim();
      if(job.kind === 'review')assert.equal(head,job.head_sha,'reviewer modified HEAD');
      else {
        assert(isSha(result.data.head_sha) && result.data.head_sha !== job.head_sha,'fixer did not produce new commit');
        await git(['fetch','origin']);
        const ancestor=async(from,to,message)=>{
          try { await git(['merge-base','--is-ancestor',from,to]); }
          catch(e) {
            if(e.exitCode === 1)throw new Error(message);
            throw e;
          }
        };
        await ancestor(job.head_sha,result.data.head_sha,'fix result is not descended from previous head');
        // A later external push may supersede the fix, but the claimed fix must
        // actually be reachable from the current PR branch.
        await ancestor(result.data.head_sha,live.head_sha,'fix result is not reachable from current PR head');
      }
    },
    verifyRecoveryWorktree:async job=>{
      const expected=worktree(job);
      assert.equal(await realpath(job.worktree),await realpath(expected),'original Fixer worktree path mismatch');
      const status=(await runCommand(config.git_path,['status','--porcelain','--untracked-files=all'],job.worktree)).trim();
      assert.equal(status,'','original Fixer worktree is not clean');
      const head=(await runCommand(config.git_path,['rev-parse','HEAD'],job.worktree)).trim();
      assert.equal(head,job.head_sha,'original Fixer worktree HEAD changed');
    },
    verifyRecoveryAncestry:async(oldHead,newHead,branch)=>{
      assert(isSha(oldHead) && isSha(newHead) && typeof branch === 'string' && branch.trim(),'invalid recovery ancestry identity');
      await git(['fetch','origin']);
      const advertised=(await git(['ls-remote','--exit-code','origin',`refs/heads/${branch}`])).trim();
      const [remoteSha,remoteRef,...extra]=advertised.split(/\s+/);
      assert(isSha(remoteSha) && remoteRef === `refs/heads/${branch}` && extra.length === 0,'invalid current PR branch advertisement');
      assert.equal(remoteSha,newHead,'current PR head is not the pushed branch head');
      for(const sha of [oldHead,newHead])assert.equal((await git(['rev-parse',`${sha}^{commit}`])).trim(),sha,'recovery commit is unavailable');
      try {await git(['merge-base','--is-ancestor',oldHead,newHead]);}
      catch(error) {if(error.exitCode === 1)throw new Error('failed Fixer head is not an ancestor of current PR head');throw error;}
    },
    publish:async state=>{
      const j=state.job;if(!j)return;
      assert(isSha(j.head_sha),'invalid publication SHA');
      // A GitHub commit status belongs to SHA/context, not to a PR. All callers
      // share this aggregate cache under tick's deployment lock. Never trust a
      // per-PR publication cache to represent the state of that shared slot.
      const pages=await gh([`${api}/pulls?state=open&per_page=100`,'--paginate','--slurp']);
      assert(Array.isArray(pages) && pages.every(Array.isArray),'publication pagination incomplete');
      const groups=new Map([[j.head_sha,[]]]),seen=new Set();
      for(const listed of pages.flat()) {
        assert(Number.isSafeInteger(listed.number) && listed.number > 0 && !seen.has(listed.number),'invalid publication PR identity');seen.add(listed.number);
        const current=await gh([`${api}/pulls/${listed.number}`]);
        assert.equal(current.number,listed.number,'publication live PR mismatch');
        if(current.state !== 'open')continue;
        const other=current.number === j.pr_number ? state : await readJson(path.join(stateDir,`pr-${current.number}.json`),null);
        if(!other && (current.draft || !current.body?.includes('```review-loop-admission')))continue;
        assert(isSha(current.head?.sha),'invalid live publication SHA');
        const sha=current.head.sha;
        if(!groups.has(sha))groups.set(sha,[]);
        const member={pr_number:current.number,head_sha:sha,base_sha:current.base?.sha ?? null,admission_hash:null,status:'pending'};
        try {
          const live=admit(current);member.admission_hash=live.admission_hash;
          if(other) {
            assert(other.protocol_version === VERSION && other.pr_number === current.number,'publication ledger identity mismatch');
            assert(!other.admission_hash || other.admission_hash === live.admission_hash,'publication admission changed');
            const snapshots=other?.external_review_acceptance ? await candidateChangeSnapshotContents(other,readSnapshot) : undefined;
            const external=externalReviewAcceptance(other,live,snapshots);
            if(external){member.status='success';member.review_source=external.source;}
            else if(other.status === 'BLOCKED')member.status='failure';
            else if(other.status === 'PASS' && other.job?.pr_number === current.number
              && other.job.head_sha === live.head_sha && other.job.base_sha === live.base_sha
              && other.admission_hash === live.admission_hash)member.status='success';
          }
        } catch {member.status='failure';}
        groups.get(sha).push(member);
      }
      for(const [sha,members] of groups) {
        members.sort((a,b)=>a.pr_number-b.pr_number);
        const status=!members.length || members.some(m=>m.status === 'failure') ? 'failure'
          : members.every(m=>m.status === 'success') ? 'success' : 'pending';
        const identity=JSON.stringify({version:1,sha,status,members});
        const cacheFile=path.join(stateDir,`publication-${sha}.json`),cached=await readJson(cacheFile,null);
        if(cached?.identity === identity)continue;
        // Invalidate confirmation before transmission: GitHub may accept the
        // POST even when its response or the following cache write is lost.
        await atomicJson(cacheFile,{uncertain:true,attempted_at:new Date().toISOString()});
        await gh([`${api}/statuses/${sha}`,'--method','POST','-f',`state=${status}`,'-f','context=Review Loop v2','-f',`description=${status} · ${members.length} live PR candidate(s)`,'-f',`target_url=https://github.com/${REPOSITORY}/commit/${sha}`]);
        await atomicJson(cacheFile,{identity,status,members,published_at:new Date().toISOString()});
      }
    },
  };
}
export async function tick(config,ioFactory=makeIO) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert(config.reviewer_id && config.fixer_id && config.reviewer_id !== config.fixer_id);
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const release=await acquireLock(config.state_dir);
  if(!release)return {status:'ALREADY_RUNNING'};
  try {
    const probe=ioFactory(config,'',config.state_dir),prs=await probe.openPRs(),summary=[];
    // Closed PRs still own outstanding durability work; discovery is from the
    // trusted ledger directory, never from an incoming webhook or issue prose.
    const openNumbers=new Set(prs.map(p=>p.number));
    for(const name of await readdir(config.state_dir)) {
      const match=/^pr-([1-9][0-9]*)\.json$/.exec(name);
      if(!match || openNumbers.has(Number(match[1])))continue;
      const file=path.join(config.state_dir,name),state=await readJson(file);
      if(!state.durability?.length || config.enabled !== true)continue;
      assert.equal(state.protocol_version,VERSION);assert.equal(state.pr_number,Number(match[1]));
      await advanceDurability(state,ioFactory(config,file,config.state_dir),config);
      summary.push({pr:state.pr_number,status:state.status,durability:state.durability.map(j=>({identity:j.identity,status:j.status,issue:j.identifier,error:j.error}))});
    }
    for(const pr of prs) {
      const file=path.join(config.state_dir,`pr-${pr.number}.json`);
      const existing=await readJson(file,null);
      if(!existing && !pr.body?.includes('```review-loop-admission'))continue;
      const io=ioFactory(config,file,config.state_dir);
      if(config.enabled !== true) {
        try {const raw=await io.live(pr.number),live=admit(raw);await io.snapshot(raw);summary.push({pr:pr.number,status:'DISABLED',head:live.head_sha});}
        catch {summary.push({pr:pr.number,status:'DISABLED',admission:'invalid or unavailable'});}
        continue;
      }
      let state=existing ?? {protocol_version:VERSION,pr_number:pr.number,round:0,status:'NEW',history:[]};
      assert.equal(state.protocol_version,VERSION);assert.equal(state.pr_number,pr.number);
      await advanceDurability(state,io,config);
      try {
        const raw=await io.live(pr.number),live=admit(raw);
        live.snapshot=await io.snapshot(raw);state.snapshot=live.snapshot;
        if(state.status === 'BLOCKED' && state.round === 0 && !state.admission_hash && !state.job && !state.pending && state.history.length === 0) {
          state.history.push({event:'recover_initial_admission',reason:state.reason ?? null,admission_hash:live.admission_hash,at:new Date().toISOString()});
          state.status='NEW';state.reason=null;delete state.last_error_at;
          await io.save(state);
        }
        if(state.status === 'PASS' && state.job && (live.head_sha !== state.job.head_sha || live.base_sha !== state.job.base_sha)) {
          state.status='STALE';state.reason='candidate changed; awaiting fresh review';
          await io.save(state);
        }
        if(state.status === 'STALE')await io.publish(state);
        await io.checkSpecs(live);
        await advance(state,live,io,config);
        await advanceDurability(state,io,config);
      } catch(e) {
        if(e.transport) {
          state.last_io_error_at=new Date().toISOString();await io.save(state);
          summary.push({pr:pr.number,status:'RETRY_IO',phase:state.status});continue;
        }
        state.status='BLOCKED';state.reason=String(e.message).slice(0,600);
        state.last_error_at=new Date().toISOString();await io.save(state);
      }
      await io.publish(state);
      summary.push({pr:pr.number,status:state.status,round:state.round,issue:state.job?.identifier,reason:state.reason,durability:(state.durability ?? []).map(j=>({identity:j.identity,status:j.status,issue:j.identifier,error:j.error}))});
    }
    const report={status:'OK',at:new Date().toISOString(),enabled:config.enabled === true,prs:summary};
    await atomicJson(path.join(config.state_dir,'health.json'),report);return report;
  } finally {await release();}
}

const failedFixRecoveryFields=['protocol_version','pr_number','round','failed_fix_issue_id','comment_id','run_id','raw_fix_sha256',
  'original_base_sha','original_head_sha','current_base_sha','current_head_sha','admission_hash','approval_ref'];
function failedFixRecoveryRequestHash(request) {
  return hash(JSON.stringify(Object.fromEntries(failedFixRecoveryFields.map(key=>[key,request[key]]))));
}
function validateFailedFixRecoveryRequest(config,request) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert.equal(config.enabled,false,'failed-fix recovery requires enabled=false');
  assert(config.reviewer_id && config.fixer_id && config.reviewer_id !== config.fixer_id,'invalid Reviewer/Fixer configuration');
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  assert(request && typeof request === 'object' && !Array.isArray(request),'invalid failed-fix recovery request');
  assert.deepEqual(Object.keys(request).sort(),[...failedFixRecoveryFields].sort(),'unexpected/missing failed-fix recovery fields');
  assert.equal(request.protocol_version,VERSION);
  assert(Number.isSafeInteger(request.pr_number) && request.pr_number > 0 && Number.isSafeInteger(request.round) && request.round > 0,
    'invalid failed-fix recovery identity');
  for(const key of ['raw_fix_sha256','admission_hash'])assert(/^[a-f0-9]{64}$/.test(request[key]),'invalid failed-fix recovery hash');
  for(const key of ['original_base_sha','original_head_sha','current_base_sha','current_head_sha'])
    assert(isSha(request[key]),'invalid failed-fix recovery candidate SHA');
  for(const key of ['failed_fix_issue_id','comment_id','run_id','approval_ref'])
    assert(typeof request[key] === 'string' && request[key].trim() && request[key].length <= 1000,'missing failed-fix recovery provenance');
  assert.equal(request.current_base_sha,request.original_base_sha,'failed-fix recovery base changed');
  assert.notEqual(request.current_head_sha,request.original_head_sha,'failed-fix recovery requires a new candidate');
  return failedFixRecoveryRequestHash(request);
}
function assertFailedFixRecoveryLive(request,state,live) {
  assert.equal(live.pr_number,request.pr_number,'failed-fix recovery PR mismatch');
  assert.equal(live.base_sha,request.current_base_sha,'failed-fix recovery current base changed');
  assert.equal(live.head_sha,request.current_head_sha,'failed-fix recovery current head changed');
  assert.equal(live.admission_hash,request.admission_hash,'failed-fix recovery admission changed');
  assert.equal(state.admission_hash,request.admission_hash,'failed-fix recovery ledger admission changed');
}
function validateFailedFixRecoveryEvent(state,request,requestSha) {
  const events=(state.history ?? []).filter(event=>event.event === 'recover_failed_fix' && event.failed_fix_issue_id === request.failed_fix_issue_id);
  assert(events.length <= 1,'duplicate failed-fix recovery event');
  if(!events.length)return null;
  const event=events[0];
  assert(event.request_sha256 === requestSha,'failed-fix recovery request conflicts with prior authorization');
  for(const key of ['pr_number','round','failed_fix_issue_id','comment_id','run_id','raw_fix_sha256','original_base_sha','original_head_sha',
    'current_base_sha','current_head_sha','admission_hash','approval_ref'])
    assert.equal(event[key],request[key],'failed-fix recovery audit event mismatch');
  assert.equal(event.dispatch_round,request.round+1,'failed-fix recovery dispatch round mismatch');
  return event;
}
function completedFailedFixRecoveryDispatch(state,event,request) {
  const eventIndex=state.history.indexOf(event);
  const matches=state.history.slice(eventIndex+1).filter(row=>row.event === 'dispatch' && row.kind === 'review'
    && row.round === event.dispatch_round && row.base_sha === request.current_base_sha && row.head_sha === request.current_head_sha);
  assert(matches.length <= 1,'duplicate recovery review dispatch');
  return matches[0] ?? null;
}
function assertLiveSourceIssue(issue,job,config,title,description) {
  assert(issue && issue.id === job.issue_id,'source issue identity mismatch');
  assert.equal(issue.project_id,config.project_id,'source issue project mismatch');
  assert.equal(issue.assignee_type,'agent');assert.equal(issue.assignee_id,job.agent_id,'source issue assignment mismatch');
  assert.equal(issue.title,title,'source issue title/contract mismatch');
  assert.equal(issue.description,description,'source issue description/admission contract mismatch');
}
async function assertNoActiveRecoveryRuns(io,state,request,requestSha,projectId,reviewerId,live) {
  const issues=await io.issues();assert(Array.isArray(issues),'failed-fix recovery issue listing incomplete');
  const byId=new Map();
  for(const issue of issues) {
    assert(issue && typeof issue.id === 'string' && issue.id && !byId.has(issue.id),'invalid/duplicate project issue identity');
    byId.set(issue.id,issue);
  }
  const related=new Set();
  const add=id=>{if(typeof id === 'string' && id)related.add(id);};
  add(state.job?.issue_id);add(state.job?.source_review_issue_id);
  add(state.pending?.issue_id);add(state.pending?.source_review_issue_id);
  for(const event of state.history ?? []) {add(event.issue_id);add(event.source_review_issue_id);}
  for(const job of state.durability ?? []) {add(job.issue_id);add(job.source_review_issue_id);}
  add(state.external_review_acceptance?.review_issue_id);
  const repository=REPOSITORY.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const prIdentity=new RegExp(`^\\[review-loop/v2\\.1\\]\\[(?:审查|修复)\\]\\[第[1-9][0-9]*轮\\]\\[[a-f0-9]{12}\\] ${repository}#${request.pr_number}$`);
  const durabilityIdentity=new RegExp(`^\\[review-loop/v2\\.1\\]\\[知识持久化\\]\\[[a-f0-9]{64}\\] ${repository}#${request.pr_number}$`);
  for(const issue of issues)if(issue.project_id === projectId && (prIdentity.test(issue.title) || durabilityIdentity.test(issue.title)))add(issue.id);

  let resumableTargetId=null;
  const pending=state.pending;
  if(pending?.kind === 'review' && pending.pr_number === request.pr_number && pending.round === request.round+1
    && pending.agent_id === reviewerId && pending.base_sha === request.current_base_sha && pending.head_sha === request.current_head_sha
    && pending.admission_hash === request.admission_hash
    && pending.recovery_binding?.request_sha256 === requestSha && pending.recovery_binding.base_sha === request.current_base_sha
    && pending.recovery_binding.head_sha === request.current_head_sha && pending.recovery_binding.admission_hash === request.admission_hash
    && pending.prepared_at && pending.attempted_at && typeof pending.title === 'string'
    && pending.title === '[review-loop/v2.1][审查][第'+(request.round+1)+'轮]['+request.current_head_sha.slice(0,12)+'] '+REPOSITORY+'#'+request.pr_number
    && typeof pending.description === 'string' && pending.description === jobDescription(pending,live)
    && hash(pending.description) === pending.description_hash) {
    const matches=issues.filter(issue=>issue.title === pending.title);
    assert(matches.length <= 1,'duplicate failed-fix recovery review identity');
    if(matches.length) {
      const issue=matches[0];
      assert(issue.project_id === projectId && issue.assignee_type === 'agent' && issue.assignee_id === pending.agent_id
        && hash(issue.description) === pending.description_hash,'failed-fix recovery pending issue identity conflict');
      resumableTargetId=issue.id;
      add(issue.id);
    }
  }

  for(const id of related) {
    const issue=byId.get(id);
    if(!issue)continue;
    const runs=await io.runs(issue.id);assert(Array.isArray(runs),'failed-fix recovery run listing incomplete');
    const active=runs.filter(run=>activeStatuses.has(run.status));
    if(issue.id === resumableTargetId) {
      assert(active.length <= 1,'duplicate active failed-fix recovery Reviewer run');
      if(active.length)assert(active[0].issue_id === issue.id && active[0].agent_id === reviewerId,'active failed-fix recovery Reviewer run identity mismatch');
    }
    else assert(active.length === 0,'active related run prevents failed-fix recovery');
  }
  return issues;
}
async function loadFailedFixRecoverySources(config,state,request,live,io) {
  const job=state.job;
  assert(job && job.kind === 'fix' && job.pr_number === request.pr_number && job.round === request.round
    && state.round === request.round && job.issue_id === request.failed_fix_issue_id,'failed-fix recovery job mismatch');
  assert(job.base_sha === request.original_base_sha && job.head_sha === request.original_head_sha,'failed-fix recovery original candidate mismatch');
  assert(job.admission_hash === request.admission_hash && state.admission_hash === request.admission_hash,'failed-fix recovery frozen admission mismatch');
  assert(job.source_review_issue_id && job.source_comment_id && job.raw_review_sha256,'failed-fix source review binding missing');
  assert(/^[a-f0-9]{64}$/.test(job.raw_review_sha256),'invalid source review hash');
  assert.equal(hash(job.description),job.description_hash,'original Fixer contract hash mismatch');
  const historicalLive={...live,base_sha:job.base_sha,head_sha:job.head_sha};
  const expectedFixTitle='[review-loop/v2.1][修复][第'+job.round+'轮]['+job.head_sha.slice(0,12)+'] '+REPOSITORY+'#'+job.pr_number;
  assert.equal(job.title,expectedFixTitle,'original Fixer title mismatch');
  assert.equal(job.description,jobDescription(job,historicalLive),'original Fixer contract/admission mismatch');
  const expectedReviewFile=path.join(config.state_dir,'reviews',job.raw_review_sha256+'.txt');
  assert.equal(path.resolve(job.review_file ?? ''),path.resolve(expectedReviewFile),'original Fixer review attachment path mismatch');
  const reviewBytes=await readFile(expectedReviewFile);assert.equal(hash(reviewBytes),job.raw_review_sha256,'original Fixer review attachment hash mismatch');

  const sourceReviewDispatches=(state.history ?? []).filter(event=>event.event === 'dispatch' && event.kind === 'review'
    && event.round === job.round && event.issue_id === job.source_review_issue_id);
  assert.equal(sourceReviewDispatches.length,1,'source review dispatch history mismatch');
  const sourceReviewDispatch=sourceReviewDispatches[0];
  assert.equal(sourceReviewDispatch.base_sha,job.base_sha);assert.equal(sourceReviewDispatch.head_sha,job.head_sha);
  const routeEvents=(state.history ?? []).filter(event=>event.event === 'result' && event.transition === 'ROUTE_TO_FIXER'
    && event.round === job.round && event.issue_id === job.source_review_issue_id);
  assert.equal(routeEvents.length,1,'source review route history mismatch');
  const route=routeEvents[0];
  const routeHistory=state.history ?? [];
  assert(routeHistory.indexOf(sourceReviewDispatch)<routeHistory.indexOf(route),'source review route is out of history order');
  assert(route.comment_id === job.source_comment_id && route.sha256 === job.raw_review_sha256
    && route.run_id && route.base_sha === job.base_sha && route.head_sha === job.head_sha,'source review history binding mismatch');
  const archivedReview=await archivedResult(config.state_dir,job.source_review_issue_id,job.raw_review_sha256);
  assert(archivedReview,'source review archive missing');
  await assertNoConflictingArchives(config.state_dir,job.source_review_issue_id,archivedReview);
  const reviewIssue=await io.issue(job.source_review_issue_id);
  const reviewWorktree=path.join(config.state_dir,'worktrees','pr-'+job.pr_number+'-review-'+job.round+'-'+job.head_sha.slice(0,12));
  const reviewJob={kind:'review',pr_number:job.pr_number,round:job.round,issue_id:job.source_review_issue_id,agent_id:config.reviewer_id,
    base_sha:job.base_sha,head_sha:job.head_sha,admission_hash:job.admission_hash,worktree:reviewWorktree};
  const expectedReviewTitle='[review-loop/v2.1][审查][第'+job.round+'轮]['+job.head_sha.slice(0,12)+'] '+REPOSITORY+'#'+job.pr_number;
  assertLiveSourceIssue(reviewIssue,reviewJob,config,expectedReviewTitle,jobDescription(reviewJob,historicalLive));
  const reviewComments=await io.comments(job.source_review_issue_id),reviewRuns=await io.runs(job.source_review_issue_id);
  const reviewResult=parseResult(reviewJob,reviewIssue,reviewComments,reviewRuns);
  assert.deepEqual(archivedReview,reviewResult,'source review archive/raw mismatch');
  assert.equal(reviewResult.comment_id,job.source_comment_id);assert.equal(reviewResult.run_id,route.run_id);
  assert.equal(reviewResult.sha256,job.raw_review_sha256);
  assert.equal(reviewResult.data.verdict,'CHANGES_REQUIRED','source review did not require changes');
  assert(reviewResult.data.findings.P1.length+reviewResult.data.findings.P2.length > 0,'source review has no actionable P1/P2');
  assert(reviewResult.data.gates.every(gate=>gate.status === 'PASS' && gate.exit_code === 0)
    && reviewResult.data.environment_failures.length === 0,'source review did not have a fully green gated route');
  assert.equal(decide(reviewJob,reviewResult,{base_sha:job.base_sha,head_sha:job.head_sha},reviewRoundLimit(state)).transition,
    'ROUTE_TO_FIXER','source review is not a valid fixer route');

  const fixDispatches=(state.history ?? []).filter(event=>event.event === 'dispatch' && event.kind === 'fix'
    && event.round === job.round && event.issue_id === job.issue_id);
  assert.equal(fixDispatches.length,1,'failed Fixer dispatch history mismatch');
  assert(routeHistory.indexOf(route)<routeHistory.indexOf(fixDispatches[0]),'failed Fixer dispatch precedes its source review route');
  assert.equal(fixDispatches[0].base_sha,job.base_sha);assert.equal(fixDispatches[0].head_sha,job.head_sha);
  const fixIssue=await io.issue(job.issue_id);
  assert(fixIssue && fixIssue.id === job.issue_id,'failed Fixer issue missing');
  assert.equal(fixIssue.project_id,config.project_id,'failed Fixer project mismatch');
  assert.equal(fixIssue.assignee_type,'agent');assert.equal(fixIssue.assignee_id,config.fixer_id,'failed Fixer assignment mismatch');
  assert.equal(fixIssue.title,job.title,'failed Fixer issue title mismatch');
  assert(typeof fixIssue.description === 'string' && (fixIssue.description === job.description || fixIssue.description.startsWith(job.description+'\n')),
    'failed Fixer issue contract prefix mismatch');
  const fixComments=await io.comments(job.issue_id),fixRuns=await io.runs(job.issue_id);
  const fixResult=parseResult(job,fixIssue,fixComments,fixRuns);
  assert.equal(fixResult.comment_id,request.comment_id,'failed Fixer comment mismatch');
  assert.equal(fixResult.run_id,request.run_id,'failed Fixer run mismatch');
  assert.equal(fixResult.sha256,request.raw_fix_sha256,'failed Fixer raw hash mismatch');
  assert.equal(fixResult.data.head_sha,job.head_sha,'failed Fixer did not return the original same-head result');
  assert.equal(fixResult.data.previous_head_sha,job.head_sha,'failed Fixer previous head mismatch');
  assert.equal(fixResult.data.raw_review_sha256,job.raw_review_sha256,'failed Fixer source Review hash mismatch');
  return {job,reviewJob,reviewResult,fixIssue,fixResult};
}
async function validateFailedFixRecovery(config,state,request,io) {
  const raw=await io.live(request.pr_number),live=admit(raw);
  assertFailedFixRecoveryLive(request,state,live);
  const sources=await loadFailedFixRecoverySources(config,state,request,live,io);
  await assertNoActiveRecoveryRuns(io,state,request,failedFixRecoveryRequestHash(request),config.project_id,config.reviewer_id,live);
  assert.equal(typeof io.verifyRecoveryWorktree,'function','read-only Fixer worktree verifier missing');
  assert.equal(typeof io.verifyRecoveryAncestry,'function','remote Fixer ancestry verifier missing');
  await io.verifyRecoveryWorktree(sources.job);
  await io.verifyRecoveryAncestry(request.original_head_sha,request.current_head_sha,live.branch);
  await io.checkSpecs(live);
  const secondRaw=await io.live(request.pr_number),secondLive=admit(secondRaw);
  assertFailedFixRecoveryLive(request,state,secondLive);
  await io.verifyRecoveryAncestry(request.original_head_sha,request.current_head_sha,secondLive.branch);
  const secondSources=await loadFailedFixRecoverySources(config,state,request,secondLive,io);
  await assertNoActiveRecoveryRuns(io,state,request,failedFixRecoveryRequestHash(request),config.project_id,config.reviewer_id,secondLive);
  return {live:secondLive,...secondSources};
}
export async function recoverFailedFixRun(config,request,ioFactory=makeIO) {
  const requestSha=validateFailedFixRecoveryRequest(config,request);
  const release=await acquireLock(config.state_dir);assert(release,'controller already running');
  try {
    const file=path.join(config.state_dir,'pr-'+request.pr_number+'.json'),initial=await readFile(file);
    const state=JSON.parse(initial.toString('utf8'));
    assert.equal(state.protocol_version,VERSION);assert.equal(state.pr_number,request.pr_number);
    const io=ioFactory(config,file,config.state_dir);
    const priorEvent=validateFailedFixRecoveryEvent(state,request,requestSha);
    const done=priorEvent && completedFailedFixRecoveryDispatch(state,priorEvent,request);
    if(done)return {status:'ALREADY_RECOVERED',pr:state.pr_number,round:done.round,issue_id:done.issue_id,
      base_sha:done.base_sha,head_sha:done.head_sha,request_sha256:requestSha};
    const job=state.job;
    assert(job?.kind === 'fix' && job.issue_id === request.failed_fix_issue_id && job.round === request.round,
      'failed-fix recovery job mismatch');
    const pending=state.pending;
    if(priorEvent) {
      assert(pending?.kind === 'review' || !pending && state.job?.kind === 'fix','failed-fix recovery resume state mismatch');
      assert(!pending || pending.round === request.round+1 && pending.recovery_binding?.request_sha256 === requestSha,
        'failed-fix recovery pending request mismatch');
      assert(['BLOCKED','REVIEWING'].includes(state.status),'failed-fix recovery resume status mismatch');
    } else {
      assert(state.status === 'BLOCKED' && state.reason === 'fixer did not produce new commit','failed-fix recovery requires the exact blocked terminal');
      assert(!pending,'failed-fix recovery cannot replace an existing pending job');
    }
    assert.equal(state.round,request.round,'failed-fix recovery round mismatch');
    assert(reviewRoundLimit(state)>state.round,'failed-fix recovery has no remaining review budget');
    const existingFixArchive=await archivedResult(config.state_dir,job.issue_id,request.raw_fix_sha256);
    const validated=await validateFailedFixRecovery(config,state,request,io);
    if(priorEvent) {
      assert.equal(priorEvent.source_review_issue_id,validated.job.source_review_issue_id,'failed-fix recovery source issue audit mismatch');
      assert.equal(priorEvent.source_comment_id,validated.reviewResult.comment_id,'failed-fix recovery source comment audit mismatch');
      assert.equal(priorEvent.source_run_id,validated.reviewResult.run_id,'failed-fix recovery source run audit mismatch');
      assert.equal(priorEvent.source_review_sha256,validated.reviewResult.sha256,'failed-fix recovery source hash audit mismatch');
    }
    assert.equal(hash(await readFile(file)),hash(initial),'failed-fix recovery ledger changed during verification');
    await assertNoConflictingArchives(config.state_dir,job.issue_id,validated.fixResult);
    if(existingFixArchive)assert.deepEqual(existingFixArchive,validated.fixResult,'conflicting failed Fixer archive');
    await io.verifyRecoveryAncestry(request.original_head_sha,request.current_head_sha,validated.live.branch);
    await assertNoActiveRecoveryRuns(io,state,request,requestSha,config.project_id,config.reviewer_id,validated.live);
    const finalRaw=await io.live(request.pr_number),finalLive=admit(finalRaw);
    assertFailedFixRecoveryLive(request,state,finalLive);
    assert.equal(finalLive.branch,validated.live.branch,'failed-fix recovery PR source branch changed');
    assert.equal(hash(await readFile(file)),hash(initial),'failed-fix recovery ledger changed before write');
    if(priorEvent) {
      assert(existingFixArchive,'failed-fix recovery archive missing while resuming');
      assert.deepEqual(existingFixArchive,validated.fixResult,'failed-fix recovery archive changed');
    } else {
      await backupRecoveryState(config.state_dir,file);
      if(!existingFixArchive)await io.archiveResult(job,validated.fixResult);
      const event={event:'recover_failed_fix',protocol_version:VERSION,pr_number:request.pr_number,round:request.round,
        failed_fix_issue_id:request.failed_fix_issue_id,comment_id:request.comment_id,run_id:request.run_id,raw_fix_sha256:request.raw_fix_sha256,
        original_base_sha:request.original_base_sha,original_head_sha:request.original_head_sha,current_base_sha:request.current_base_sha,
        current_head_sha:request.current_head_sha,admission_hash:request.admission_hash,approval_ref:request.approval_ref,
        request_sha256:requestSha,source_review_issue_id:validated.job.source_review_issue_id,source_comment_id:validated.reviewResult.comment_id,
        source_run_id:validated.reviewResult.run_id,source_review_sha256:validated.reviewResult.sha256,dispatch_round:request.round+1,
        at:new Date().toISOString()};
      state.history.push(event);
    }
    state.status='REVIEWING';state.reason=null;delete state.last_error_at;
    const binding={request_sha256:requestSha,base_sha:request.current_base_sha,head_sha:request.current_head_sha,admission_hash:request.admission_hash};
    await ensureDispatch(state,finalLive,'review',io,config,undefined,binding);
    assert(state.status === 'REVIEWING' && state.round === request.round+1 && state.job?.kind === 'review',
      'failed-fix recovery did not dispatch one fresh review');
    assert(state.job.base_sha === request.current_base_sha && state.job.head_sha === request.current_head_sha,
      'failed-fix recovery dispatched another candidate');
    await io.publish(state);
    return {status:state.status,pr:state.pr_number,round:state.round,issue:state.job.identifier,issue_id:state.job.issue_id,
      base_sha:state.job.base_sha,head_sha:state.job.head_sha,request_sha256:requestSha};
  } finally {await release();}
}

export async function recoverInvalidReview(config,request,ioFactory=makeIO) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert.equal(config.enabled,false,'operator recovery requires enabled=false');
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const required=['protocol_version','pr_number','review_issue_id','comment_id','run_id','raw_review_sha256','review_base_sha','review_head_sha','round','current_base_sha','current_head_sha','approval_ref'];
  assert(request && typeof request === 'object' && !Array.isArray(request),'invalid recovery request');
  assert.deepEqual(Object.keys(request).sort(),required.sort(),'unexpected/missing recovery fields');
  assert.equal(request.protocol_version,VERSION);assert(Number.isSafeInteger(request.pr_number) && request.pr_number > 0);
  assert.equal(request.round,4);assert(isSha(request.review_base_sha) && isSha(request.review_head_sha));
  assert(isSha(request.current_base_sha) && isSha(request.current_head_sha));
  assert(/^[a-f0-9]{64}$/.test(request.raw_review_sha256));
  for(const key of ['review_issue_id','comment_id','run_id','approval_ref'])assert(typeof request[key] === 'string' && request[key].trim(),'missing recovery provenance');
  const release=await acquireLock(config.state_dir);
  assert(release,'controller already running');
  try {
    const file=path.join(config.state_dir,`pr-${request.pr_number}.json`),state=await readJson(file);
    const baseIO=ioFactory(config,file,config.state_dir);
    const io={...baseIO,live:async prNumber=>{
      const raw=await baseIO.live(prNumber),observed=admit(raw);
      assert.equal(observed.base_sha,request.current_base_sha,'recovery current base changed');
      assert.equal(observed.head_sha,request.current_head_sha,'recovery current head changed');
      return raw;
    }};
    const raw=await io.live(request.pr_number),live=admit(raw);
    assert.notEqual(live.head_sha,request.review_head_sha,'recovery requires a new candidate');
    live.snapshot=await io.snapshot(raw);state.snapshot=live.snapshot;
    const result=parseRejectedReviewResult(state.job,await io.issue(request.review_issue_id),await io.comments(request.review_issue_id),await io.runs(request.review_issue_id));
    recoverRejectedTerminalReview(state,result,request);
    await io.archiveResult(state.job,result);
    await advance(state,live,io,config);
    assert(state.status === 'REVIEWING' && state.round === 5 && state.job?.kind === 'review','recovery did not dispatch one fresh review');
    assert(state.job.head_sha === live.head_sha && state.job.base_sha === live.base_sha,'recovery dispatched a stale candidate');
    await io.publish(state);
    return {status:state.status,pr:state.pr_number,round:state.round,issue:state.job.identifier,issue_id:state.job.issue_id,base_sha:state.job.base_sha,head_sha:state.job.head_sha,recovered_comment_id:result.comment_id,recovered_sha256:result.sha256};
  } finally {await release();}
}
async function archivedResult(stateDir,issueId,sha256) {
  const file=path.join(stateDir,'results',`${issueId}-${sha256}.json`);
  try {
    assert((await lstat(file)).isFile(),'archive must be a regular file');
    return await readJson(file);
  } catch(error) {if(error.code === 'ENOENT')return null;throw error;}
}
async function assertNoConflictingArchives(stateDir,issueId,result) {
  const directory=path.join(stateDir,'results');
  let names;
  try {names=await readdir(directory);} catch(error) {if(error.code === 'ENOENT')return;throw error;}
  for(const name of names.filter(value=>value.startsWith(`${issueId}-`))) {
    assert.equal(name,`${issueId}-${result.sha256}.json`,'conflicting review result archive');
    assertArchivedSource(await archivedResult(stateDir,issueId,result.sha256),result);
  }
}
function assertArchivedSource(archive,source) {
  assert(archive && archive.comment_id === source.comment_id && archive.run_id === source.run_id && archive.sha256 === source.sha256
    && hash(archive.raw) === source.sha256,'archived result source mismatch');
  if(source.raw !== undefined)assert.deepEqual(archive,source,'archived result content mismatch');
}
async function backupRecoveryState(stateDir,stateFile) {
  const backupRoot=path.join(stateDir,'backups');await mkdir(backupRoot,{recursive:true});
  assert((await lstat(backupRoot)).isDirectory(),'backup root must be a directory');
  const backup=await mkdtemp(path.join(backupRoot,'transport-result-'));
  const files=[stateFile],resultDir=path.join(stateDir,'results');
  try {
    assert((await lstat(resultDir)).isDirectory(),'result archive directory must be a directory');
    for(const name of await readdir(resultDir)) {
      const addressed=/^[a-zA-Z0-9-]+-[a-f0-9]{64}\.json$/.test(name);
      const legacy=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/.test(name);
      assert(addressed || legacy,'unexpected archive name');
      files.push(path.join(resultDir,name));
    }
  } catch(error) {if(error.code !== 'ENOENT')throw error;}
  for(const source of files) {
    assert((await lstat(source)).isFile(),'recovery backup source must be regular file');
    const relative=path.relative(stateDir,source);
    const destination=path.join(backup,relative);await mkdir(path.dirname(destination),{recursive:true});
    await copyFile(source,destination);
    assert.equal(hash(await readFile(destination)),hash(await readFile(source)),'recovery backup verification failed');
  }
  return backup;
}
export async function recoverTransportResult(config,request,ioFactory=makeIO) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert.equal(config.enabled,false,'operator recovery requires enabled=false');
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const required=['protocol_version','pr_number','review_issue_id','comment_id','run_id','raw_review_sha256','round','review_base_sha','review_head_sha','admission_hash'];
  assert(request && typeof request === 'object' && !Array.isArray(request),'invalid transport recovery request');
  assert.deepEqual(Object.keys(request).sort(),required.sort(),'unexpected/missing transport recovery fields');
  assert.equal(request.protocol_version,VERSION);
  assert(Number.isSafeInteger(request.pr_number) && request.pr_number > 0 && Number.isSafeInteger(request.round),'invalid recovery identity');
  assert(isSha(request.review_base_sha) && isSha(request.review_head_sha) && /^[a-f0-9]{64}$/.test(request.admission_hash)
    && /^[a-f0-9]{64}$/.test(request.raw_review_sha256),'invalid recovery hash');
  for(const key of ['review_issue_id','comment_id','run_id'])assert(typeof request[key] === 'string' && /^[a-zA-Z0-9-]+$/.test(request[key]),'invalid recovery provenance');
  const release=await acquireLock(config.state_dir);assert(release,'controller already running');
  try {
    const file=path.join(config.state_dir,`pr-${request.pr_number}.json`),initial=await readFile(file);
    const state=JSON.parse(initial.toString('utf8'));
    const phase=validateTransportRecovery(state,request),io=ioFactory(config,file,config.state_dir);
    const old=state.result;
    if(phase === 'READY' && old) {
      const priorRound=state.round-1;
      const reviewDispatches=state.history.filter(event=>event.event === 'dispatch' && event.kind === 'review' && event.round === priorRound);
      assert.equal(reviewDispatches.length,1,'previous review dispatch mismatch');
      const dispatch=reviewDispatches[0];
      const fixIssues=new Set(state.history.filter(event=>event.event === 'dispatch' && event.kind === 'fix' && event.round === priorRound).map(event=>event.issue_id));
      assert(!fixIssues.has(dispatch.issue_id),'previous review/fix dispatch conflict');
      const previous=state.history.filter(event=>event.event === 'result' && event.round === priorRound && !fixIssues.has(event.issue_id));
      assert.equal(previous.length,1,'previous result history mismatch');
      assert(previous[0].issue_id === old.issue_id && previous[0].comment_id === old.comment_id
        && previous[0].sha256 === old.sha256,'previous result history mismatch');
      assert(dispatch.issue_id === previous[0].issue_id && dispatch.base_sha === previous[0].base_sha
        && dispatch.head_sha === previous[0].head_sha,'previous review dispatch mismatch');
      await assertNoConflictingArchives(config.state_dir,old.issue_id,{...old,run_id:previous[0].run_id});
      const priorArchive=await archivedResult(config.state_dir,old.issue_id,old.sha256);
      assertArchivedSource(priorArchive,{...old,run_id:previous[0].run_id});
      const previousJob={kind:'review',pr_number:state.pr_number,round:previous[0].round,issue_id:old.issue_id,
        agent_id:'archived-reviewer',base_sha:previous[0].base_sha,head_sha:previous[0].head_sha};
      const parsed=parseResult(previousJob,{id:old.issue_id,assignee_type:'agent',assignee_id:previousJob.agent_id},
        [{id:old.comment_id,issue_id:old.issue_id,author_type:'agent',author_id:previousJob.agent_id,
          source_task_id:previous[0].run_id,content:priorArchive.raw}],
        [{id:previous[0].run_id,issue_id:old.issue_id,agent_id:previousJob.agent_id,status:'completed'}]);
      assert.deepEqual(priorArchive,parsed,'previous result archive/raw mismatch');
      assert(priorArchive.data?.round === previous[0].round && priorArchive.data?.base_sha === previous[0].base_sha
        && priorArchive.data?.head_sha === previous[0].head_sha && priorArchive.data?.pr_number === state.pr_number,
      'previous result archive/history mismatch');
    }
    if(phase === 'READY')await backupRecoveryState(config.state_dir,file);
    const first=admit(await io.live(request.pr_number));
    const sameCandidate=live=>assert(live.pr_number === request.pr_number && live.base_sha === request.review_base_sha
      && live.head_sha === request.review_head_sha && live.admission_hash === request.admission_hash,'recovery live candidate changed');
    sameCandidate(first);
    const issue=await io.issue(request.review_issue_id),comments=await io.comments(request.review_issue_id),runs=await io.runs(request.review_issue_id);
    const reviewJob=transportReviewJob(state);
    const result=parseTransportRecoveryResult(reviewJob,issue,comments,runs,request);
    await assertNoConflictingArchives(config.state_dir,reviewJob.issue_id,result);
    const existing=await archivedResult(config.state_dir,reviewJob.issue_id,result.sha256);
    if(existing)assertArchivedSource(existing,result);
    await io.checkSpecs(first);
    const final=admit(await io.live(request.pr_number));sameCandidate(final);
    assert.equal(hash(await readFile(file)),hash(initial),'recovery ledger changed during verification');
    if(phase === 'ALREADY_ACCEPTED') {
      assertArchivedSource(existing,result);
      return {status:'ALREADY_ACCEPTED',pr:state.pr_number,round:state.round,comment_id:result.comment_id,sha256:result.sha256};
    }
    await io.verifyCheckout(reviewJob,result,final);
    final.snapshot=state.snapshot;
    if(phase === 'READY') {
      acceptTransportRecovery(state,result,final,request);
      await captureDurability(state,reviewJob,result,final,io,config,false);
      if(!existing)await io.archiveResult(reviewJob,result);
      await io.save(state);
    } else assertArchivedSource(existing,result);
    if(state.status === 'ROUTE_TO_FIXER') await ensureDispatch(state,final,'fix',io,config,result);
    await io.publish(state);
    return {status:state.status,pr:state.pr_number,round:state.round,comment_id:result.comment_id,sha256:result.sha256};
  } finally {await release();}
}
export async function authorizeSixthReviewRun(config,request,ioFactory=makeIO) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert.equal(config.enabled,false,'sixth-review authorization requires enabled=false');
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const required=['protocol_version','pr_number','review_issue_id','comment_id','run_id','raw_review_sha256','review_base_sha','review_head_sha','round','current_base_sha','current_head_sha','approval_ref'];
  assert(request && typeof request === 'object' && !Array.isArray(request),'invalid sixth-review request');
  assert.deepEqual(Object.keys(request).sort(),required.sort(),'unexpected/missing sixth-review fields');
  assert.equal(request.protocol_version,VERSION);assert(Number.isSafeInteger(request.pr_number) && request.pr_number > 0);
  assert.equal(request.round,5);assert(isSha(request.review_base_sha) && isSha(request.review_head_sha));
  assert(isSha(request.current_base_sha) && isSha(request.current_head_sha));
  assert(/^[a-f0-9]{64}$/.test(request.raw_review_sha256));
  for(const key of ['review_issue_id','comment_id','run_id','approval_ref'])assert(typeof request[key] === 'string' && request[key].trim(),'missing sixth-review provenance');
  const release=await acquireLock(config.state_dir);
  assert(release,'controller already running');
  try {
    const file=path.join(config.state_dir,`pr-${request.pr_number}.json`),state=await readJson(file);
    const baseIO=ioFactory(config,file,config.state_dir);
    const io={...baseIO,live:async prNumber=>{
      const raw=await baseIO.live(prNumber),observed=admit(raw);
      assert.equal(observed.base_sha,request.current_base_sha,'sixth-review current base changed');
      assert.equal(observed.head_sha,request.current_head_sha,'sixth-review current head changed');
      return raw;
    }};
    const raw=await io.live(request.pr_number),live=admit(raw);
    assert(live.base_sha !== request.review_base_sha || live.head_sha !== request.review_head_sha,'sixth review requires a new candidate');
    live.snapshot=await io.snapshot(raw);state.snapshot=live.snapshot;
    const result=parseResult(state.job,await io.issue(request.review_issue_id),await io.comments(request.review_issue_id),await io.runs(request.review_issue_id));
    const archived=await readJson(path.join(config.state_dir,'results',`${request.review_issue_id}-${request.raw_review_sha256}.json`));
    assert.deepEqual(archived,result,'archived fifth-round result mismatch');
    authorizeSixthReview(state,result,request);
    await advance(state,live,io,config);
    assert(state.status === 'REVIEWING' && state.round === 6 && state.job?.kind === 'review','sixth-review authorization did not dispatch one fresh review');
    assert(state.job.head_sha === live.head_sha && state.job.base_sha === live.base_sha,'sixth-review authorization dispatched a stale candidate');
    await io.publish(state);
    return {status:state.status,pr:state.pr_number,round:state.round,issue:state.job.identifier,issue_id:state.job.issue_id,base_sha:state.job.base_sha,head_sha:state.job.head_sha,source_comment_id:result.comment_id,source_sha256:result.sha256};
  } finally {await release();}
}
export async function acceptExternalReviewRun(config,request,ioFactory=makeIO) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert.equal(config.enabled,false,'external-review acceptance requires enabled=false');
  assert(config.reviewer_id && config.fixer_id && config.reviewer_id !== config.fixer_id,'invalid reviewer identity');
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const required=['protocol_version','pr_number','review_issue_id','comment_id','run_id','raw_review_sha256','issue_contract_sha256','external_sequence','base_sha','head_sha','admission_hash','approval_ref'];
  assert(request && typeof request === 'object' && !Array.isArray(request),'invalid external-review request');
  assert.deepEqual(Object.keys(request).sort(),required.sort(),'unexpected/missing external-review fields');
  assert.equal(request.protocol_version,VERSION);assert(Number.isSafeInteger(request.pr_number) && request.pr_number > 0);
  assert(Number.isSafeInteger(request.external_sequence) && request.external_sequence > 0);
  assert(isSha(request.base_sha) && isSha(request.head_sha));
  for(const key of ['raw_review_sha256','issue_contract_sha256','admission_hash'])assert(typeof request[key] === 'string' && /^[a-f0-9]{64}$/.test(request[key]),'invalid external-review hash');
  for(const key of ['review_issue_id','comment_id','run_id','approval_ref'])assert(typeof request[key] === 'string' && request[key].trim(),'missing external-review provenance');
  const release=await acquireLock(config.state_dir);assert(release,'controller already running');
  try {
    const file=path.join(config.state_dir,`pr-${request.pr_number}.json`),state=await readJson(file);
    assert(!state.external_review_acceptance && !state.history.some(e=>e.event === 'accept_external_review'),'external review already accepted');
    const io=ioFactory(config,file,config.state_dir),snapshotContents=await candidateChangeSnapshotContents(state,io.readSnapshot);
    const terminal=externalReviewTerminal(state,undefined,snapshotContents);
    assert(request.external_sequence > state.round,'external review sequence must exceed automatic round');
    if(terminal.kind === 'candidate-change-exhaustion')
      assert.equal(state.job.agent_id,config.reviewer_id,'external review automatic job reviewer mismatch');
    const raw=await io.live(request.pr_number),live=admit(raw);
    assert.equal(live.base_sha,request.base_sha,'external-review current base changed');
    assert.equal(live.head_sha,request.head_sha,'external-review current head changed');
    assert.equal(live.admission_hash,request.admission_hash,'external-review admission changed');
    assert.equal(state.admission_hash,request.admission_hash,'external-review ledger admission mismatch');
    externalReviewTerminal(state,live,snapshotContents);
    const issue=await io.issue(request.review_issue_id);
    assert(issue.creator_type === 'member' && issue.project_id === config.project_id,'external review was not independently human-dispatched in this project');
    assert(typeof issue.description === 'string' && hash(issue.description) === request.issue_contract_sha256,'external review issue contract changed');
    assert(issue.description.includes(live.admission.rubric),'external review contract missing original rubric');
    for(const spec of live.admission.authoritative_spec_paths)assert(issue.description.includes(spec),'external review contract missing authoritative spec');
    const job={kind:'review',pr_number:request.pr_number,base_sha:request.base_sha,head_sha:request.head_sha,round:request.external_sequence,issue_id:request.review_issue_id,agent_id:config.reviewer_id,admission_hash:request.admission_hash};
    const result=parseResult(job,issue,await io.comments(request.review_issue_id),await io.runs(request.review_issue_id));
    assert.equal(result.comment_id,request.comment_id,'external-review comment mismatch');
    assert.equal(result.run_id,request.run_id,'external-review run mismatch');
    assert.equal(result.sha256,request.raw_review_sha256,'external-review raw hash mismatch');
    assert.equal(result.data.verdict,'NO_P1_P2','external review did not pass');
    assert(Object.values(result.data.findings).every(findings=>findings.length === 0),'external review has findings');
    assert(result.data.gates.every(g=>g.status === 'PASS' && g.exit_code === 0) && result.data.environment_failures.length === 0,'external review gates not green');
    const current=admit(await io.live(request.pr_number));
    assert.equal(current.base_sha,request.base_sha,'external-review current base changed');
    assert.equal(current.head_sha,request.head_sha,'external-review current head changed');
    assert.equal(current.admission_hash,request.admission_hash,'external-review admission changed');
    externalReviewTerminal(state,current,snapshotContents);
    const accepted_at=new Date().toISOString(),acceptance={source:'external_independent_review',pr_number:request.pr_number,review_issue_id:request.review_issue_id,comment_id:result.comment_id,run_id:result.run_id,raw_review_sha256:result.sha256,issue_contract_sha256:request.issue_contract_sha256,external_sequence:request.external_sequence,base_sha:request.base_sha,head_sha:request.head_sha,admission_hash:request.admission_hash,approval_ref:request.approval_ref,accepted_at};
    state.external_review_acceptance=acceptance;state.history.push({event:'accept_external_review',...acceptance});
    externalReviewAcceptance(state,current,snapshotContents);
    await io.archiveExternalResult(request.review_issue_id,result);await io.save(state);await io.publish(state);
    return {status:'EXTERNAL_REVIEW_ACCEPTED',ledger_status:state.status,pr:state.pr_number,base_sha:acceptance.base_sha,head_sha:acceptance.head_sha,review_issue_id:acceptance.review_issue_id,comment_id:acceptance.comment_id,run_id:acceptance.run_id,raw_review_sha256:acceptance.raw_review_sha256,external_sequence:acceptance.external_sequence};
  } finally {await release();}
}
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config=await readJson(path.resolve(process.argv[3] ?? 'review-loop.local.json'));
    if(process.argv[2] === 'recover-lock'){await recoverLock(config.state_dir);console.log('Recovered abandoned lock');}
    else if(process.argv[2] === 'recover-invalid-review') {
      const request=await readJson(path.resolve(process.argv[4] ?? 'review-recovery.json'));
      console.log(JSON.stringify(await recoverInvalidReview(config,request)));
    } else if(process.argv[2] === 'recover-transport-result') {
      const request=await readJson(path.resolve(process.argv[4] ?? 'transport-recovery.json'));
      console.log(JSON.stringify(await recoverTransportResult(config,request)));
    } else if(process.argv[2] === 'recover-failed-fix') {
      const request=await readJson(path.resolve(process.argv[4] ?? 'failed-fix-recovery.json'));
      console.log(JSON.stringify(await recoverFailedFixRun(config,request)));
    } else if(process.argv[2] === 'authorize-sixth-review') {
      const request=await readJson(path.resolve(process.argv[4] ?? 'sixth-review-authorization.json'));
      console.log(JSON.stringify(await authorizeSixthReviewRun(config,request)));
    } else if(process.argv[2] === 'accept-external-review') {
      const request=await readJson(path.resolve(process.argv[4] ?? 'external-review-acceptance.json'));
      console.log(JSON.stringify(await acceptExternalReviewRun(config,request)));
    } else {assert.equal(process.argv[2],'tick','usage: node runtime.mjs tick <config> | recover-transport-result <config> <request> | recover-failed-fix <config> <request> | recover-invalid-review <config> <request> | authorize-sixth-review <config> <request> | accept-external-review <config> <request>');console.log(JSON.stringify(await tick(config)));}
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
