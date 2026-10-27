"""CAS-update only idle250, then verify an actual same-branch Windows checkout."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ISSUE='01a17471-25e6-7731-a529-3df99acf3d42'
BRANCH='agent/mika/coac-250'
env=dict(os.environ,NO_PROXY='127.0.0.1,localhost,::1,api.multica.ai')
run=lambda *a:subprocess.check_output(a,env=env)
write=lambda n,d:(HERE/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
result=json.loads((HERE/'commit250.json').read_text())
assert not (HERE/'checkout-test.json').exists(), 'do not apply twice'
current=run('git','rev-parse','HEAD').decode().strip()
index=run('git','write-tree').decode().strip()
assert run('git','branch','--show-current').decode().strip()=='agent/ticket/coac-269'
active=json.loads(run('multica','issue','runs',ISSUE,'--active','--output','json'));assert active==[],active
history=json.loads(run('multica','issue','runs',ISSUE,'--output','json'))
failed=next(x for x in history if x['id']=='01a17f90-dd76-7202-b0b2-d4f39be097e0')
assert failed['status']=='failed' and failed.get('started_at') is None
complete=next(x for x in history if x['status']=='completed' and x.get('branch_name')==BRANCH)
worktrees=run('git','worktree','list','--porcelain').decode()
assert 'branch refs/heads/'+BRANCH+'\n' not in worktrees
assert run('git','rev-parse',BRANCH).decode().strip()==result['parent']
write('owner-exclusion.json',{'active250':active,'failedNeverStartedRun':failed,'lastOwnerCompletion':{k:complete.get(k) for k in ['id','status','started_at','completed_at','branch_name']},'branchNotCheckedOut':True,'parent':result['parent']})
base=Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805').resolve()
target=base/'coac-250-pfix49520001'/'worktree'
assert target.resolve().is_relative_to(base) and not target.parent.exists()
assert len(str(target))==len(str(base/'coac-250-d4f39be097e0'/'worktree'))
checks=[]
for label,ref in [('old',result['parent']),('new',result['commit'])]:
    cp=subprocess.run([sys.executable,str(HERE/'verify-package.py'),'--tree',ref,'--checkout-root',str(target)],env=env,capture_output=True,text=True,encoding='utf-8')
    checks.append({'label':label,'ref':ref,'returncode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr})
assert checks[0]['returncode']!=0 and 'checkout_path_length' in checks[0]['stderr']
assert checks[1]['returncode']==0,checks[1]
write('preflight-tests.json',checks)
# Refuse if ownership changed while the read-only checks ran.
assert json.loads(run('multica','issue','runs',ISSUE,'--active','--output','json'))==[]
assert 'branch refs/heads/'+BRANCH+'\n' not in run('git','worktree','list','--porcelain').decode()
run('git','update-ref','refs/heads/'+BRANCH,result['commit'],result['parent'])
cp=subprocess.run(['git','worktree','add',str(target),BRANCH],env=env,capture_output=True,text=True,encoding='utf-8')
write('checkout-attempt.json',{'path':str(target),'returncode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr})
assert cp.returncode==0,cp.stderr
assert run('git','-C',str(target),'rev-parse','HEAD').decode().strip()==result['commit']
assert not run('git','-C',str(target),'status','--porcelain').strip()
verify=target/'_analysis/path250/verify.py'
cp=subprocess.run([sys.executable,str(verify)],cwd=target,env=env,capture_output=True,text=True,encoding='utf-8');assert cp.returncode==0,cp.stderr
verification=json.loads(cp.stdout)
assert hashlib.sha256((target/'_analysis/path250/manifest.json').read_bytes()).hexdigest()==result['manifestSha256']
negative=[]
for prefix in ['_analysis/path250','.multica/delivery/path250']:
    folder=target/prefix;folder.mkdir(parents=True,exist_ok=True)
    length=245-len(str(folder))-1-4
    probe=folder/('x'*length+'.txt')
    assert probe.resolve().is_relative_to(target.resolve()) and not probe.exists()
    assert len(str(probe))==245
    probe.write_bytes(b'owned-path-guard-probe')
    check=subprocess.run([sys.executable,str(verify)],cwd=target,env=env,capture_output=True,text=True,encoding='utf-8')
    assert check.returncode!=0 and 'checkout_path_length' in check.stderr
    assert probe.read_bytes()==b'owned-path-guard-probe';probe.unlink()
    negative.append({'tree':prefix,'fullPathLength':245,'rejected':True})
assert not run('git','-C',str(target),'status','--porcelain').strip()
assert target.resolve().is_relative_to(base) and target.parent.name=='coac-250-pfix49520001'
run('git','worktree','remove',str(target))
assert run('git','rev-parse','HEAD').decode().strip()==current
assert run('git','write-tree').decode().strip()==index
assert run('git','branch','--show-current').decode().strip()=='agent/ticket/coac-269'
proof={'passed':True,'branch':BRANCH,'commit':result['commit'],'parent':result['parent'],'realCheckoutPath':str(target),
       'samePathDepthAsFailedRun':True,'verification':verification,'newFileGuardTests':negative,
       'ownedCleanTestWorktreeRemoved':True,'HEADUnchanged':current,'ownIndexUnchanged':True,'modelCalls':0}
write('checkout-test.json',proof);print(json.dumps(proof))
