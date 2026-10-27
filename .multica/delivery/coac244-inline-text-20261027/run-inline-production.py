"""One foreground production dispatch for a specified authorized chapter; no retry."""
import hashlib,importlib.util,json,os,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('E:/AgentData/Coach/knowledge/processing');STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027'
RUNTIME=Path(json.loads((STAGE/'runtime-manifest.json').read_text(encoding='utf-8'))['runtime'])
key=sys.argv[1];assert key in ['155','162','234']
jobs=json.loads((STAGE/'jobs.json').read_text(encoding='utf-8'));j=next(j for j in jobs if j['chapterId'].split('-')[-2]==key)
OUT=STAGE/('chapter-'+key);OUT.mkdir(exist_ok=True)
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,x,exclusive=False):
    with Path(p).open('x' if exclusive else 'w',encoding='utf-8') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
old=STAGE/'canonical-exclusion-helper.py'
spec=importlib.util.spec_from_file_location('existing_exclusion',old);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.OWNER='COAC-244 Mika inline155' if key=='155' else 'COAC-269 Ticket inline162234'
for f in read(STAGE/'runtime-manifest.json')['files']: assert sha(RUNTIME/f['name'])==f['sha256']
proof=next(p for p in read(STAGE/'zero-call-parent-proofs.json')['results'] if p['chapterId']==j['chapterId']);assert proof['passed']
assert sha(ROOT/j['parentPath'])==j['parentFileSha256'] and sha(ROOT/j['auditPath'])==j['auditFileSha256'] and sha(ROOT/j['source']['path'])==j['source']['sha256']
assert sha(ROOT/j['planPath'])==j['planSha256']
assert not (OUT/'dispatch-started.json').exists(), 'already dispatched: preserve state; no retries'
assert j['adaptedEntry']['exitCode']==0
source=read(ROOT/j['source']['path']);candidate=ROOT/'web-production/v1/candidates'/source['sourceId']/(source['articleId']+'.coac244inline20261027.json')
assert not candidate.exists(), 'candidate already exists; do not reproduce'
m.stopped();before=m.joint(j)
m.slot('claim','--chapter',j['chapterId'],'--candidate-sha',j['parentFileSha256'],'--lane','A' if key=='155' else 'B','--owner',m.OWNER)
held=False
try:
    slot=m.slot('acquire','--lane','A' if key=='155' else 'B','--owner',m.OWNER,'--pid',str(os.getpid()));held=True
    now=m.joint(j);assert now['priorCallIds']==before['priorCallIds'];m.stopped()
    write(OUT/'dispatch-started.json',{'at':datetime.now(timezone.utc).isoformat(),'maxProductionCalls':1,'automaticRetry':False,'jointExclusion':now,'slot':slot,'args':j['args']},True)
    with (OUT/'production.stdout.json').open('w',encoding='utf-8') as out,(OUT/'production.stderr.txt').open('w',encoding='utf-8') as err:
        cp=subprocess.run(j['args'],stdout=out,stderr=err)
    write(OUT/'dispatch-finished.json',{'at':datetime.now(timezone.utc).isoformat(),'exitCode':cp.returncode,'candidateExists':candidate.exists()})
    if cp.returncode: raise RuntimeError((OUT/'production.stderr.txt').read_text(encoding='utf-8'))
    cp=subprocess.run(['python',str(RUNTIME/'textbook-production-web-present.py'),str(candidate)],capture_output=True,encoding='utf-8')
    write(OUT/'display-result.json',{'exitCode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr,'modelCalls':0})
    assert cp.returncode==0,cp.stderr
    print(json.dumps({'chapter':j['chapterId'],'candidate':str(candidate.with_name(candidate.stem+'.display.json')),'productionCalls':1,'automaticRetries':0}))
finally:
    if held:write(OUT/'slot-released.json',m.slot('release','--slot',str(ROOT/('parallel/slots/maker-A.json' if key=='155' else 'parallel/slots/maker-B.json')),'--owner',m.OWNER))
    write(OUT/'chapter-released.json',m.slot('unclaim','--chapter',j['chapterId'],'--owner',m.OWNER))
