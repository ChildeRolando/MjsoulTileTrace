"""One foreground web311 maker. Atomic maker-B/claim; never retry."""
import importlib.util,json,hashlib,os,subprocess
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
RT=ROOT/'audit/runtimes/coac269-311-curves-v1-20261028';STAGE=ROOT/'web-production/v1/runs/coac269-311-curves-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,x):
 with Path(p).open('x',encoding='utf8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
c=load(RT/'contract.json');pre=load(HERE/'preflight.json');assert pre['passed'] and pre['newModelCalls']==0
for p in ['dispatch.json','call-reserved.json','call.json']:assert not (STAGE/p).exists(),'existing dispatch/call, never retry'
assert not Path(c['candidatePath']).exists()
def frozen():
 assert sha(RT/'runtime-manifest.json')==pre['runtime']['sha256']
 for f in load(RT/'runtime-manifest.json')['files']:assert sha(f['path'])==f['sha256']
spec=importlib.util.spec_from_file_location('gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER='COAC-269 Ticket executor'
job={'chapterId':c['canonical'],'parentPath':c['parent']['path'],'parentFileSha256':c['parent']['sha256']}
frozen();gate.stopped();before=gate.joint(job);save(HERE/'exclusion-before.json',before)
calls=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if s.strip()];assert not any(x.get('method')=='coac269-web311-fixed-eight-curves/1' for x in calls)
gate.slot('claim','--chapter',c['canonical'],'--candidate-sha',c['parent']['sha256'],'--lane','B','--owner',gate.OWNER);held=False
try:
 slot=gate.slot('acquire','--lane','B','--owner',gate.OWNER,'--pid',str(os.getpid()));held=True
 frozen();gate.stopped();current=gate.joint(job);assert current['priorCallIds']==before['priorCallIds'] and current['existingCandidateNames']==before['existingCandidateNames']
 args=['E:/IDE/NodeJS/node.exe',str(RT/'curves.mjs'),'produce',pre['runtime']['sha256']]
 save(STAGE/'dispatch.json',{'at':datetime.now(timezone.utc).isoformat(),'authorization':c['authorizationComment'],'maximumMaker':1,'maximumIndependent':1,'retry':0,'slot':slot,'exclusion':current,'args':args})
 with (STAGE/'stdout.json').open('w',encoding='utf8') as out,(STAGE/'stderr.txt').open('w',encoding='utf8') as err:cp=subprocess.run(args,cwd=ROOT,stdout=out,stderr=err)
 calls=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if s.strip()];calls=[x for x in calls if x.get('method')=='coac269-web311-fixed-eight-curves/1'];assert len(calls)<=1
 for x in calls:
  p=ROOT/'web-production/v1'/x['rawArtifactPath'];assert sha(p)==x['rawArtifactSha256'];(HERE/'raw.json').write_bytes(p.read_bytes())
 path=Path(c['candidatePath']);reserved=load(STAGE/'call-reserved.json') if (STAGE/'call-reserved.json').exists() else None
 result={'canonical':c['canonical'],'exitCode':cp.returncode,'candidate':{'path':str(path),'sha256':sha(path)} if path.exists() else None,'calls':calls,'reserved':reserved,'newIndependentCallsHere':0,'makerBudgetConsumed':1 if reserved else 0,'maximumNewCalls':2,'retry':0,'fee':None,'upstreamExecutionCount':None,'stderrTail':(STAGE/'stderr.txt').read_text(encoding='utf8')[-3500:]}
 save(HERE/'result.json',result);save(STAGE/'result.json',result);print(json.dumps({k:v for k,v in result.items() if k!='calls'},ensure_ascii=True))
finally:
 if held:save(HERE/'slot-release.json',gate.slot('release','--slot',str(ROOT/'parallel/slots/maker-B.json'),'--owner',gate.OWNER))
 save(HERE/'claim-release.json',gate.slot('unclaim','--chapter',c['canonical'],'--owner',gate.OWNER))
