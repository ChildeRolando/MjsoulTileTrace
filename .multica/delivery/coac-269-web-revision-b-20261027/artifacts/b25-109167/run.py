"""One foreground maker per chapter, existing maker-B/canonical claim, no retry."""
import importlib.util,json,subprocess,hashlib,os,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
RT=ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028';STAGE=ROOT/'web-production/v1/runs/coac269-109167-exact-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
key=sys.argv[1];assert key in ['109','167'];c=load(HERE/'contract.json');j=c['jobs'][key];p=load(j['packet']['path']);pre=load(HERE/'preflight.json')
assert pre['passed'] and pre['count']==76 and pre['modelCalls']==0
assert not (STAGE/f'{key}-dispatch.json').exists() and not Path(j['candidatePath']).exists()
assert not (STAGE/'batch-limit-stop.json').exists(),'prior capacity/quota STOP, no new dispatch'
def frozen():
    assert sha(RT/'runtime-manifest.json')==pre['runtime']['sha256']
    for f in load(RT/'runtime-manifest.json')['files']: assert sha(f['path'])==f['sha256']
spec=importlib.util.spec_from_file_location('gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER='COAC-269 109167 limited maker'
job={'chapterId':j['canonical'],'parentPath':j['parent']['path'],'parentFileSha256':j['parent']['sha256']}
frozen();gate.stopped();before=gate.joint(job)
assert sorted(before['priorCallIds'])==sorted(x['callId'] for x in p['productionLedger']),'new call since upstream evidence, inspect before proceeding'
save(HERE/f'{key}-exclusion.json',before)
gate.slot('claim','--chapter',j['canonical'],'--candidate-sha',j['parent']['sha256'],'--lane','B','--owner',gate.OWNER);held=False
try:
    slot=gate.slot('acquire','--lane','B','--owner',gate.OWNER,'--pid',str(os.getpid()));held=True
    frozen();gate.stopped();current=gate.joint(job)
    assert current['priorCallIds']==before['priorCallIds'] and current['existingCandidateNames']==before['existingCandidateNames']
    args=['E:/IDE/NodeJS/node.exe',str(RT/'pair.mjs'),'produce',key,pre['runtime']['sha256']]
    save(STAGE/f'{key}-dispatch.json',{'at':datetime.now(timezone.utc).isoformat(),'authorization':c['authorizationComment'],'maximumMaker':1,'maximumIndependent':1,'retry':0,'slot':slot,'exclusion':current,'args':args})
    with (STAGE/f'{key}-stdout.json').open('w',encoding='utf-8') as out,(STAGE/f'{key}-stderr.txt').open('w',encoding='utf-8') as err:cp=subprocess.run(args,cwd=ROOT,stdout=out,stderr=err)
    calls=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
    calls=[x for x in calls if x.get('method')=='coac269-exact-109167/1' and x['articleId']==j['article']];assert len(calls)<=1
    raws=[]
    for call in calls:
        rp=ROOT/'web-production/v1'/call['rawArtifactPath'];assert sha(rp)==call['rawArtifactSha256'];(HERE/f'{key}-raw.json').write_bytes(rp.read_bytes());raws.append(load(rp))
    err=(STAGE/f'{key}-stderr.txt').read_text(encoding='utf-8')
    limited=any(r.get('usageLimitReached') for r in raws) or any(t in (err+' '.join(str(r.get('stderr','')) for r in raws)).lower() for t in ['capacity','quota','rate_limit','usage limit'])
    if limited:save(STAGE/'batch-limit-stop.json',{'key':key,'capacityOrQuotaObserved':True,'noMoreDispatch':True,'calls':calls})
    path=Path(j['candidatePath']);result={'key':key,'canonical':j['canonical'],'exitCode':cp.returncode,'candidate':{'path':str(path),'sha256':sha(path)} if path.exists() else None,'calls':calls,'makerBudgetConsumed':1,'callsRecorded':len(calls),'independentCallsHere':0,'remainingIndependentMaximum':1 if cp.returncode==0 and path.exists() else 0,'retry':0,'capacityOrQuotaStop':limited,'fee':None,'upstreamExecutionCount':None,'stderrTail':err[-3000:]}
    save(HERE/f'{key}-result.json',result);save(STAGE/f'{key}-result.json',result)
    print(json.dumps({k:v for k,v in result.items() if k!='calls'},ensure_ascii=True))
finally:
    if held:save(HERE/f'{key}-slot-release.json',gate.slot('release','--slot',str(ROOT/'parallel/slots/maker-B.json'),'--owner',gate.OWNER))
    save(HERE/f'{key}-claim-release.json',gate.slot('unclaim','--chapter',j['canonical'],'--owner',gate.OWNER))
