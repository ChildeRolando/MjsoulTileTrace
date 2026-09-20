import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, open, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admit, VERSION, REPOSITORY, hash, isSha } from './protocol.mjs';
import { advance } from './controller.mjs';
const exec=promisify(execFile);
export async function command(file,args,cwd) {
  try { return (await exec(file,args,{cwd,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000})).stdout; }
  catch { const error=new Error(`${path.basename(file)} operation failed (${args[0] ?? ''}); inspect locally`);error.transport=true;throw error; }
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
export function makeIO(config,stateFile,stateDir) {
  const gh=async args=>JSON.parse(await command(config.gh_path,['api',...args]));
  const multica=async args=>JSON.parse(await command(config.multica_path,['--profile',config.profile,'--workspace-id',config.workspace_id,...args,'--output','json'],stateDir));
  const git=async args=>command(config.git_path,args,config.repository_path);
  const api=`repos/${REPOSITORY}`;
  const worktree = job => path.join(stateDir,'worktrees',`pr-${job.pr_number}-${job.kind}-${job.round}-${job.head_sha.slice(0,12)}`);
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
      assert.equal((await command(config.git_path,['rev-parse','HEAD'],dir)).trim(),job.head_sha);
      assert.equal((await command(config.git_path,['status','--porcelain','--untracked-files=no'],dir)).trim(),'');
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
      await atomicJson(path.join(dir,`${job.issue_id}.json`),result);
    },
    create:async job=>{
      const file=path.join(stateDir,'dispatch.md');await writeFile(file,job.description,{mode:0o600});
      const args=['issue','create','--title',job.title,'--project',config.project_id,'--assignee-id',job.agent_id,'--description-file',file,'--status','todo'];
      if(job.kind === 'fix')args.push('--attachment',job.review_file);
      return multica(args);
    },
    verifyCheckout:async(job,result)=>{
      assert.equal(await realpath(job.worktree),await realpath(worktree(job)));
      const status=(await command(config.git_path,['status','--porcelain','--untracked-files=no'],job.worktree)).trim();
      assert.equal(status,'','agent left tracked modifications');
      const head=(await command(config.git_path,['rev-parse','HEAD'],job.worktree)).trim();
      if(job.kind === 'review')assert.equal(head,job.head_sha,'reviewer modified HEAD');
      else {
        assert(isSha(result.data.head_sha) && result.data.head_sha !== job.head_sha,'fixer did not produce new commit');
        await git(['fetch','origin']);
        await git(['merge-base','--is-ancestor',job.head_sha,result.data.head_sha]);
        const live=admit(await gh([`${api}/pulls/${job.pr_number}`]));
        // A later external push may supersede the fix, but the claimed fix must
        // actually be reachable from the current PR branch.
        await git(['merge-base','--is-ancestor',result.data.head_sha,live.head_sha]);
      }
    },
    publish:async state=>{
      const j=state.job;if(!j)return;
      const status=state.status === 'PASS' ? 'success' : state.status === 'BLOCKED' ? 'failure' : 'pending';
      const identity=JSON.stringify([status,j.head_sha,j.base_sha,state.round,state.reason ?? null]);
      if(state.published === identity)return;
      await gh([`${api}/statuses/${j.head_sha}`,'--method','POST','-f',`state=${status}`,'-f','context=Review Loop v2','-f',`description=${state.status} · round ${state.round}/3`,'-f',`target_url=https://github.com/${REPOSITORY}/pull/${j.pr_number}`]);
      state.published=identity;await atomicJson(stateFile,state);
    },
  };
}
export async function tick(config) {
  assert.equal(config.protocol_version,VERSION);assert.equal(config.repository,REPOSITORY);
  assert(config.reviewer_id && config.fixer_id && config.reviewer_id !== config.fixer_id);
  assert(path.isAbsolute(config.state_dir) && path.isAbsolute(config.repository_path));
  const release=await acquireLock(config.state_dir);
  if(!release)return {status:'ALREADY_RUNNING'};
  try {
    const probe=makeIO(config,'',config.state_dir),prs=await probe.openPRs(),summary=[];
    for(const pr of prs) {
      if(!pr.body?.includes('```review-loop-admission'))continue;
      const file=path.join(config.state_dir,`pr-${pr.number}.json`);
      const io=makeIO(config,file,config.state_dir);
      if(config.enabled !== true) {
        try {const live=admit(await io.live(pr.number));summary.push({pr:pr.number,status:'DISABLED',head:live.head_sha});}
        catch {summary.push({pr:pr.number,status:'DISABLED',admission:'invalid or unavailable'});}
        continue;
      }
      let state=await readJson(file,{protocol_version:VERSION,pr_number:pr.number,round:0,status:'NEW',history:[]});
      assert.equal(state.protocol_version,VERSION);assert.equal(state.pr_number,pr.number);
      try {
        const live=admit(await io.live(pr.number));
        state.snapshot=await io.snapshot(pr);
        await io.checkSpecs(live);
        await advance(state,live,io,config);
      } catch(e) {
        if(e.transport) {
          state.last_io_error_at=new Date().toISOString();await io.save(state);
          summary.push({pr:pr.number,status:'RETRY_IO',phase:state.status});continue;
        }
        state.status='BLOCKED';state.reason=String(e.message).slice(0,600);
        state.last_error_at=new Date().toISOString();await io.save(state);
      }
      await io.publish(state);
      summary.push({pr:pr.number,status:state.status,round:state.round,issue:state.job?.identifier,reason:state.reason});
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
