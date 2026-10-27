"""One foreground two-group production, each target once, zero retries."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path(__file__).resolve().parent
STAGE=ROOT/'web-production/v1/runs/coac269-283-396962-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-396962-v1-20261028'
OWNER='COAC-269 Ticket executor'
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
now=lambda:datetime.now(timezone.utc).isoformat()
def write(p,data,exclusive=False):
    with Path(p).open('x' if exclusive else 'w',encoding='utf-8',newline='\n') as f:
        json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')
preflight=load(OUT/'preflight.json');contract=load(RUN/'exact-contract.json')
assert preflight['passed'] and preflight['tests']==32 and preflight['modelCalls']==0
def frozen():
    assert sha(RUN/'runtime-manifest.json')==preflight['manifestSha256']
    for f in load(RUN/'runtime-manifest.json')['files']:assert sha(f['path'])==f['sha256']
    for f in [contract['parent'],contract['notes'],contract['source']]:assert sha(f['path'])==f['sha256']
assert not (STAGE/'dispatch-started.json').exists(), 'prior dispatch; do not retry'
candidate=ROOT/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.coac269t396962r1.json'
assert not candidate.exists()
spec=importlib.util.spec_from_file_location('existing_gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER=OWNER
row=next(r for r in load(ROOT/'integration/coac250-unified-chapter-register-20261027b.json')['rows'] if r['chapterId']=='nemata-jp-chapter-283-1')
assert row['existingCandidate']['sha256'] in [contract['parent']['sha256'],'dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899']
job={'chapterId':'nemata-jp-chapter-283-1','parentPath':contract['parent']['path'],'parentFileSha256':contract['parent']['sha256'],'registeredParentSha256':row['existingCandidate']['sha256']}
frozen();gate.stopped();before=gate.joint(job);write(OUT/'exclusion-before.json',before)
gate.slot('claim','--chapter',job['chapterId'],'--candidate-sha',job['parentFileSha256'],'--lane','B','--owner',OWNER)
held=False
try:
    slot=gate.slot('acquire','--lane','B','--owner',OWNER,'--pid',str(os.getpid()));held=True
    frozen();current=gate.joint(job);gate.stopped()
    assert current['priorCallIds']==before['priorCallIds'] and current['existingCandidateNames']==before['existingCandidateNames']
    write(STAGE/'dispatch-started.json',{'at':now(),'authorizationComment':contract['authorizationComment'],'slot':slot,'exclusion':current,'args':preflight['args'],'maxProductionCalls':2,'retry':0},True)
    with (STAGE/'production.stdout.json').open('w',encoding='utf-8') as out,(STAGE/'production.stderr.txt').open('w',encoding='utf-8') as err:
        cp=subprocess.run(preflight['args'],cwd=ROOT,stdout=out,stderr=err)
    calls=[json.loads(s) for s in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
    calls=[c for c in calls if c.get('sourceId')=='modern-yabejp-ja' and c.get('articleId')=='chapter06-exercise003' and c['callId'] not in before['priorCallIds']]
    assert len(calls)<=2 and len(set(c['batchId'] for c in calls))==len(calls)
    for c in calls:
        raw=ROOT/'web-production/v1'/c['rawArtifactPath'];assert sha(raw)==c['rawArtifactSha256'];(OUT/(c['batchId']+'-raw.json')).write_bytes(raw.read_bytes())
    result={'chapterId':job['chapterId'],'parent':contract['parent'],'candidate':{'path':str(candidate),'sha256':sha(candidate)} if candidate.exists() else None,'calls':calls,'productionCalls':len(calls),'auditCallsHere':0,'totalMaximum':4,'remainingFirstAuditMaximum':2 if candidate.exists() else 0,'retry':0,'exitCode':cp.returncode,'monetaryCost':None,'upstreamExecutionCount':None,'at':now()}
    write(STAGE/'result.json',result);write(OUT/'result.json',result)
    print(json.dumps({'exitCode':cp.returncode,'productionCalls':len(calls),'candidate':result['candidate'],'retry':0}))
finally:
    if held:write(OUT/'slot-released.json',gate.slot('release','--slot',str(ROOT/'parallel/slots/maker-B.json'),'--owner',OWNER))
    write(OUT/'claim-released.json',gate.slot('unclaim','--chapter',job['chapterId'],'--owner',OWNER))
