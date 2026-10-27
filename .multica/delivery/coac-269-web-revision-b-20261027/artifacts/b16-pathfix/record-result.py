"""Record actual platform recovery and the completed packaging repair, read-only."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ISSUE = '01a17471-0529-7d3d-bd8d-8b54ef38290d'
WAKEUP = '01a17f15-3885-7e86-a02e-793a20dda9dc'
env = dict(os.environ)
env['NO_PROXY'] = '127.0.0.1,localhost,::1,api.multica.ai'
cli = lambda *args: json.loads(subprocess.check_output(['multica',*args,'--output','json'],env=env))
rule = cli('issue','wakeup','get',ISSUE,WAKEUP)
assert rule['fire_count']==1 and not rule['enabled']
history = cli('issue','runs',ISSUE)
task = next(x for x in history if x['id']==rule['last_task_id'])
assert task['id']=='01a17f22-6168-79e8-9a35-a079d7257485'
assert task.get('started_at') and task['status'] in ['running','completed']
old = next(x for x in history if x['id']=='01a17f16-8947-7e89-971e-fdea09027ce6')
assert old['status']=='failed' and old.get('started_at') is None
work = Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-a079d7257485/worktree')
commit = 'a7f5201e90aa8846051c7f06f22e0bdac482968c'
assert subprocess.check_output(['git','-C',str(work),'branch','--show-current']).decode().strip()=='agent/mika/coac-248'
subprocess.check_call(['git','-C',str(work),'merge-base','--is-ancestor',commit,'HEAD'])
recovery = {'observedAt':datetime.now(timezone.utc).isoformat(),'existingWakeupId':WAKEUP,'ruleEnabled':rule['enabled'],'fireCount':rule['fire_count'],'recoveredTask':{k:task.get(k) for k in ['id','status','started_at','completed_at','failure_reason','error']},'recoveredWorktree':str(work),'recoveredWorktreeHEAD':subprocess.check_output(['git','-C',str(work),'rev-parse','HEAD']).decode().strip(),'containsPackagingFix':True,'originalFailedRunPreserved':True,'manualTriggerExecuted':False,'duplicateRecovery':False}
(HERE/'recovery-result.json').write_text(json.dumps(recovery,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
result = {'schema':'coac269-248-checkout-repair/1','authorizationComment':'01a17f1a-05a6-7bd8-8179-837449191d83','outcome':'packaging fix pushed; real 248 recovery started exactly once','packagingBranch':'agent/mika/coac-248','packagingCommit':commit,'repair':json.loads((HERE/'repack-result.json').read_text()),'tests':json.loads((HERE/'package-tests.json').read_text()),'checkout':json.loads((HERE/'checkout-test.json').read_text()),'recovery':recovery,'newTextbookProductionCalls':0,'newTextbookReviewCalls':0,'globalGitOrOSSettingsChanged':False,'processingDataWritten':False,'ownBranch':'agent/ticket/coac-269','wholeTicketComplete':False}
(HERE/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'packagingCommit':commit,'recoveryTask':task['id'],'status':task['status'],'startedAt':task['started_at'],'fireCount':rule['fire_count'],'newModelCalls':0}))
