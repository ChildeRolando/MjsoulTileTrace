"""Read-only restart verification for COAC-244; invokes no model or worker."""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path('.multica/delivery/coac244-restart-20261027')
OUT.mkdir(parents=True,exist_ok=True)
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name,obj): (OUT/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
old=next(x for x in read('restart-b-runs.json') if x['id']=='01a17d8f-972b-74fb-a899-249bd7a2862c')
maker=next(x for x in read('restart-mika-tasks.json') if x['id']=='01a17e29-723d-711b-ad69-08707ea09a97')
assert old['status']=='completed' and maker['status']=='completed'
def run_summary(x):
    return {**{k:x.get(k) for k in ['id','status','runtime_id','started_at','completed_at','error']},
            'sessionId':x.get('result',{}).get('session_id'),'output':x.get('result',{}).get('output')}
write('prior-runs.json',{'b':run_summary(old),'mika1620':run_summary(maker)})
slots=json.loads(subprocess.check_output(['node',str(ROOT/'parallel/slots.mjs'),'status'],encoding='utf-8'))
assert slots['liveMakers']==0 and not slots['slots']
write('maker-slots.json',slots)
batch=read('.multica/delivery/coac244-text-347-155-20261027/batch-result.json')
passed=batch['passed'][0]
verified=[]
for prefix in ['candidate','audit']:
    p=Path(passed[prefix+'Path'])
    assert sha(p)==passed[prefix+'Sha256']
    verified.append({'path':str(p),'sha256':sha(p)})
for a in batch['artifacts']:
    p=Path(a['sourcePath'])
    assert sha(p)==a['sha256']
    verified.append({'path':str(p),'sha256':sha(p)})
expected=[batch['production']['callId'],batch['review']['callId']]
ledger=[]
for name in ['web-production/v1/calls.jsonl','audit/calls.jsonl']:
    for line in (ROOT/name).read_text(encoding='utf-8-sig').splitlines():
        if line.strip():
            c=json.loads(line)
            if c.get('callId') in expected:
                ledger.append({'ledger':name,'record':c})
assert sorted(x['record']['callId'] for x in ledger)==sorted(expected)
write('two-real-calls.json',ledger)
preview=read(ROOT/'integration/accepted-preview-current.json')
register=read(ROOT/'integration/coac250-unified-chapter-register-20261027b.json')
selection=ROOT/'integration/specific-web-variant-selection.v16.json'
snapshot={'preview':{k:preview.get(k) for k in ['chapters','units','blocks','figures','activeLibraryChanged','corpusId']},
          'registerCounts':register['counts'],'v16SelectionSha256':sha(selection)}
assembly=preview['incrementalAssembly']
old_corpus=read(Path(assembly['from'])/'textbook-corpus.json')
new_corpus=read(Path(preview['output'])/'textbook-corpus.json')
assert all(u in new_corpus['units'] for u in old_corpus['units'])
snapshot['priorUnitsPreservedExactly']=len(old_corpus['units'])
snapshot['incrementalAssembly']=assembly
write('coverage-snapshot.json',snapshot)
result={'at':datetime.now(timezone.utc).isoformat(),'newModelCallsThisRun':0,
        'historicalStageNewCalls':2,'historicalStageBudget':4,'automaticRetries':0,
        'priorRuns':{'b':run_summary(old),'mika1620':run_summary(maker)},
        'realCallIds':expected,'verifiedFileCount':len(verified),'verifiedFiles':verified,
        'makers':0,'auditDriverLockPresent':(ROOT/'audit/finite-current-driver.lock.json').exists(),
        'providerPidEvidence':{'currentMika':60208,'integration250':42532,
          'oldBObservedCandidate':2356,'oldBObservedCandidateExited':True,
          'qualification':'2356 was the Claude CLI launched three seconds after old B start; temporal association, not an exposed per-run PID binding. It disappeared naturally during inspection.'},
        'platformLeaseEvidence':'CLI exposes run lifecycle/runtime and daemon active/pending-terminal counts, not lease token/expiry. Both old runs completed normally; no cancel or lease write performed.',
        'desktopRestartEvidence':'Desktop --updated process started 2026-10-27T16:19:51Z. Daemon PID16076 predates this restart; desktop restart is not evidence of daemon restart.',
        'daemonReadback':{'pid':16076,'runningTaskCountAfterBFinished':2,'resourceWaitTaskCount':0,
          'pendingTerminalReportCount':0,'failedTerminalReportCount':0},
        'coverage':snapshot,
        'laterActiveFamily':read('restart-active-family.json'),
        'laterBRunQualification':'New B run 01a17e3f-d9b2-786c-bd31-3888850a9be1 is a separate run on agent e860cd42-646c-47e5-9076-5ef82fc3efe1. This verification did not create or modify it. Its scope/runtime could not be freshly read during intermittent network failures; no claim that it is the historical B process.',
        'mutations':{'cancelledRuns':[],'killedProcesses':[],'deletedLocks':[],
          'configurationChanges':[],'restartedOld157205':False}}
write('restart-result.json',result)
print(json.dumps({'newCalls':0,'realLedgerCalls':len(ledger),'verifiedFiles':len(verified),
                  'oldB':old['status'],'oldMika':maker['status'],'coverage':snapshot},ensure_ascii=False))
