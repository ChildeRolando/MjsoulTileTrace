"""CAS-update the idle 248 branch, then check it out at the real Windows path depth."""
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ISSUE = '01a17471-0529-7d3d-bd8d-8b54ef38290d'
BRANCH = 'agent/mika/coac-248'
env = dict(os.environ)
env['NO_PROXY'] = '127.0.0.1,localhost,::1,api.multica.ai'
run = lambda *args: subprocess.check_output(args, env=env)
write = lambda name, data: (HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
result = json.loads((HERE/'commit248.json').read_text())
assert not (HERE/'checkout-test.json').exists(), 'already applied; do not repeat'
active = json.loads(run('multica','issue','runs',ISSUE,'--active','--output','json'))
assert active == [], '248 has an active writer; stop'
history = json.loads(run('multica','issue','runs',ISSUE,'--output','json'))
failed = next(x for x in history if x['id']=='01a17f16-8947-7e89-971e-fdea09027ce6')
assert failed['status']=='failed' and failed.get('started_at') is None
completed = next(x for x in history if x['id']=='01a17f03-f39b-7b36-8c6d-4d73dfa0c906')
assert completed['status']=='completed' and completed['branch_name']==BRANCH
worktrees = run('git','worktree','list','--porcelain').decode()
assert 'branch refs/heads/'+BRANCH+'\n' not in worktrees
assert run('git','rev-parse',BRANCH).decode().strip()==result['parent']
assert run('git','branch','--show-current').decode().strip()=='agent/ticket/coac-269'
write('owner-exclusion.json',{'active248':active,'lastOwnerCompletion':{k:completed.get(k) for k in ['id','agent_id','status','started_at','completed_at','branch_name','result']},'failedRun':failed,'branchWasNotCheckedOut':True,'expectedParent':result['parent']})
base = Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805').resolve()
target = base/'coac-248-pfixb87a0001'/'worktree'
assert target.resolve().is_relative_to(base) and not target.parent.exists()
failed_root = str(base/'coac-248-fdea09027ce6'/'worktree')
assert len(str(target))==len(failed_root)
paths = run('git','ls-tree','-r','--name-only',result['commit']).decode().splitlines()
lengths = sorted([(len((str(target)+'/'+p).encode('utf-16-le'))//2,p) for p in paths],reverse=True)
assert lengths[0][0] <= 259, lengths[:4]
run('git','update-ref','refs/heads/'+BRANCH,result['commit'],result['parent'])
checkout = subprocess.run(['git','worktree','add',str(target),BRANCH],env=env,capture_output=True,text=True)
write('checkout-attempt.json',{'path':str(target),'returncode':checkout.returncode,'stdout':checkout.stdout,'stderr':checkout.stderr})
assert checkout.returncode==0, checkout.stderr
assert run('git','-C',str(target),'rev-parse','HEAD').decode().strip()==result['commit']
assert run('git','-C',str(target),'status','--porcelain').strip()==b''
package = target/'.multica/delivery/coac248-p217-admitted-20261028'
verification = json.loads(run(sys.executable,'-X','utf8',str(package/'verify-package.py')))
assert verification['passed']
proof = {'passed':True,'branch':BRANCH,'commit':result['commit'],'realCheckoutPath':str(target),'samePathDepthAsFailedRun':True,'maximumFullPathUtf16Characters':lengths[0][0],'longestPaths':lengths[:5],'trackedFiles':len(paths),'packageVerification':verification,'cleanCheckout':True,'modelCalls':0}
# Remove only the clean test worktree created above; no force, recursive shell delete or unknown paths.
assert target.resolve().is_relative_to(base) and target.parent.name=='coac-248-pfixb87a0001'
assert run('git','-C',str(target),'status','--porcelain').strip()==b''
run('git','worktree','remove',str(target))
proof['ownedCleanTestWorktreeRemoved']=True
assert run('git','branch','--show-current').decode().strip()=='agent/ticket/coac-269'
write('checkout-test.json',proof)
print(json.dumps(proof))
