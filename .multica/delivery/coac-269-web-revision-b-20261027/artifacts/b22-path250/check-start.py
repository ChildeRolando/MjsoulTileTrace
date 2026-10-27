"""Foreground readback of the single restored platform run; never triggers or retries it."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import time

HERE=Path(__file__).resolve().parent
ISSUE='01a17471-25e6-7731-a529-3df99acf3d42'
WAKEUP='01a17f8f-d0c4-7d0f-a846-70af665c93e9'
FAILED='01a17f90-dd76-7202-b0b2-d4f39be097e0'
env=dict(os.environ,NO_PROXY='127.0.0.1,localhost,::1,api.multica.ai')
cli=lambda *a:json.loads(subprocess.check_output(['multica',*a,'--output','json'],env=env))
write=lambda n,d:(HERE/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
fixed=json.loads((HERE/'commit250.json').read_text())['commit']
observations=[]
for n in range(60):
    rule=cli('issue','wakeup','get',ISSUE,WAKEUP)
    observation={k:rule.get(k) for k in ['enabled','fire_count','last_task_id','last_task_status','last_error']}
    observation['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();observations.append(observation)
    task_id=rule.get('last_task_id')
    if task_id and task_id!=FAILED:
        history=cli('issue','runs',ISSUE)
        task=next(x for x in history if x['id']==task_id)
        observation.update(status=task['status'],started_at=task.get('started_at'))
        if task.get('started_at'):
            assert task['agent_id']=='b144c077-cadd-4749-a53d-4b9cb98191b8'
            paths=subprocess.check_output(['git','worktree','list','--porcelain'],env=env).decode().split('\n\n')
            block=next(b for b in paths if 'branch refs/heads/agent/mika/coac-250\n' in b+'\n')
            path=next(l[9:] for l in block.splitlines() if l.startswith('worktree '))
            head=subprocess.check_output(['git','-C',path,'rev-parse','HEAD'],env=env).decode().strip()
            subprocess.run(['git','-C',path,'merge-base','--is-ancestor',fixed,'HEAD'],env=env,check=True)
            proof={'passed':True,'recoveryRequests':1,'task':task,'wakeup':rule,'actualWorktree':path,'head':head,'containsPackagingFix':fixed,'modelCallsFromRepair':0,'observations':observations}
            write('started250.json',proof);print(json.dumps({'passed':True,'run':task_id,'status':task['status'],'started_at':task['started_at'],'head':head,'worktree':path,'requests':1}));break
        if task['status'] in ['failed','cancelled']:
            write('startup-failed.json',{'task':task,'rule':rule,'observations':observations});raise RuntimeError('single recovered run did not start; no retry')
    write('start-observations.json',observations)
    time.sleep(10)
else:
    raise RuntimeError('single restored rule still has no started run; no duplicate recovery requested')
