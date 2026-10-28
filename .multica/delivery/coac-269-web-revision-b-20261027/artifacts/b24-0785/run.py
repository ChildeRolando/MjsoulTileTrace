"""One foreground maker, canonical claim and existing maker-B; zero retries."""
from pathlib import Path
from datetime import datetime,timezone
import importlib.util,json,subprocess,hashlib,os,traceback
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
HERE=Path(__file__).resolve().parent
STAGE=ROOT/'web-production/v1/runs/coac269-283-0785-v1-20261028'
RT=ROOT/'audit/runtimes/coac269-283-0785-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x,exclusive=False):
    with Path(p).open('x' if exclusive else 'w',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
c=load(HERE/'contract.json');pre=load(HERE/'preflight.json')
assert pre['passed'] and pre['count']==39 and pre['modelCalls']==0
assert not (STAGE/'dispatch-started.json').exists(),'no redispatch or automatic retry'
candidate=ROOT/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.coac269b0785r1.json'
assert not candidate.exists()
def frozen():
    assert sha(RT/'runtime-manifest.json')==pre['runtime']['sha256']
    for f in load(RT/'runtime-manifest.json')['files']:assert sha(f['path'])==f['sha256']
spec=importlib.util.spec_from_file_location('existing_gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER='COAC-269 b0785 single maker'
row=next(x for x in load(ROOT/'integration/coac250-unified-chapter-register-20261027b.json')['rows'] if x['chapterId']==c['canonical'])
job={'chapterId':c['canonical'],'parentPath':c['parent']['path'],'parentFileSha256':c['parent']['sha256'],'registeredParentSha256':row['existingCandidate']['sha256']}
frozen();gate.stopped();before=gate.joint(job);save(HERE/'exclusion-before.json',before)
prior=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
assert not any(x.get('method')=='coac269-exact-0785-seat/1' for x in prior),'same authorized scope already called'
gate.slot('claim','--chapter',c['canonical'],'--candidate-sha',c['parent']['sha256'],'--lane','B','--owner',gate.OWNER)
held=False
try:
    slot=gate.slot('acquire','--lane','B','--owner',gate.OWNER,'--pid',str(os.getpid()));held=True
    frozen();current=gate.joint(job);gate.stopped()
    assert current['priorCallIds']==before['priorCallIds'] and current['existingCandidateNames']==before['existingCandidateNames']
    args=['E:/IDE/NodeJS/node.exe',str(RT/'b0785.mjs'),'produce',pre['runtime']['sha256']]
    save(STAGE/'dispatch-started.json',{'at':datetime.now(timezone.utc).isoformat(),'authorizationComment':c['authorizationComment'],'maximumProductionCalls':1,'maximumIndependentCalls':1,'retry':0,'slot':slot,'exclusion':current,'args':args},True)
    with (STAGE/'stdout.json').open('w',encoding='utf-8') as out,(STAGE/'stderr.txt').open('w',encoding='utf-8') as err:
        cp=subprocess.run(args,cwd=ROOT,stdout=out,stderr=err)
    calls=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
    calls=[x for x in calls if x.get('method')=='coac269-exact-0785-seat/1'];assert len(calls)<=1
    for call in calls:
        raw=ROOT/'web-production/v1'/call['rawArtifactPath'];assert sha(raw)==call['rawArtifactSha256'];(HERE/'maker-raw.json').write_bytes(raw.read_bytes())
    result={'exitCode':cp.returncode,'candidate':{'path':str(candidate),'sha256':sha(candidate)} if candidate.exists() else None,'calls':calls,'productionCallsRecorded':len(calls),'independentCallsHere':0,'remainingIndependentMaximum':1 if cp.returncode==0 and candidate.exists() else 0,'productionBudgetConsumed':1,'retry':0,'fee':None,'upstreamExecutionCount':None,'stderrTail':(STAGE/'stderr.txt').read_text(encoding='utf-8')[-3000:]}
    save(HERE/'result.json',result);save(STAGE/'result.json',result);print(json.dumps(result,ensure_ascii=True))
finally:
    if held:save(HERE/'slot-released.json',gate.slot('release','--slot',str(ROOT/'parallel/slots/maker-B.json'),'--owner',gate.OWNER))
    save(HERE/'claim-released.json',gate.slot('unclaim','--chapter',c['canonical'],'--owner',gate.OWNER))
