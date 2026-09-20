import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, open, unlink, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admit, VERSION, REPOSITORY, hash, isSha } from './protocol.mjs';
import { advance, advanceDurability } from './controller.mjs';
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
    create:async job=>{
      const file=path.join(stateDir,'dispatch.md');await writeFile(file,job.description,{mode:0o600});
      const args=['issue','create','--title',job.title,'--project',config.project_id,'--assignee-id',job.agent_id,'--description-file',file,'--status','todo'];
      if(job.kind === 'fix' || job.kind === 'durability')args.push('--attachment',job.review_file);
      return multica(args);
    },
    verifyDurability:async(job,result)=>{
      const r=result.data;
      assert.equal(r.branch,`review-loop/durability/${job.identity}`);
      await git(['fetch','--no-tags','origin',`refs/heads/${r.branch}`]);
      const remote=(await git(['rev-parse','FETCH_HEAD'])).trim();assert(isSha(remote));
      for(const [from,to] of [[job.head_sha,r.commit_sha],[r.commit_sha,remote]]) {
        try {await git(['merge-base','--is-ancestor',from,to]);}
        catch(e) {if(e.exitCode === 1)throw new Error('durability commit ancestry/reachability mismatch');throw e;}
      }
      assert.notEqual(r.commit_sha,job.head_sha,'durability did not produce new commit');
      const changed=(await git(['diff','--name-only','-z',job.head_sha,r.commit_sha,'--'])).split('\0');
      for(const artifact of r.artifacts) {
        assert(changed.includes(artifact.path),'durable artifact unchanged from reviewed head');
        const row=await git(['ls-tree',r.commit_sha,'--',artifact.path]);
        assert(row.startsWith('100644 blob ') || row.startsWith('100755 blob '),'durable artifact missing or not regular file');
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
            if(other.status === 'BLOCKED')member.status='failure';
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
if(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config=await readJson(path.resolve(process.argv[3] ?? 'review-loop.local.json'));
    if(process.argv[2] === 'recover-lock'){await recoverLock(config.state_dir);console.log('Recovered abandoned lock');}
    else {assert.equal(process.argv[2],'tick','usage: node runtime.mjs tick <config>');console.log(JSON.stringify(await tick(config)));}
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
