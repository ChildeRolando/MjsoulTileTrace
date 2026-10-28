"""Locate existing material only; never freeze an unfinished upstream package or call a model."""
import hashlib,importlib.util,json
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
HERE=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
reg=load(ROOT/'integration/coac250-unified-chapter-register-20261027b.json')
spec=importlib.util.spec_from_file_location('gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER='COAC-269 109167 limited maker'
found=[]
for canonical in ['79-cn-chapter-109-4','79-cn-chapter-167-4']:
    row=next(x for x in reg['rows'] if x['chapterId']==canonical);e=row['existingCandidate']
    parent=ROOT/e['path'];audit=ROOT/e['auditPath'];p=load(parent);a=load(audit);source=ROOT/p['source']['sourcePath']
    assert sha(parent)==e['sha256'] and sha(source)==p['source']['sourceSha256']
    assert a['production']['sha256']==sha(parent)
    exclusion=gate.joint({'chapterId':canonical,'parentPath':str(parent),'parentFileSha256':sha(parent)})
    found.append({'canonical':canonical,'parent':{'path':str(parent),'sha256':sha(parent)},'source':{'path':str(source),'sha256':sha(source)},'audit':{'path':str(audit),'sha256':sha(audit)},'independentCalls':[x['callId'] for x in a['calls']],'issues':a['modelReview']['issues'],'jointExclusion':exclusion})
out={'modelCalls':0,'slotAcquired':False,'claimAcquired':False,'source':'existing register, original parent/source/independent audit only','chapters':found}
(HERE/'locations.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'modelCalls':0,'located':[x['canonical'] for x in found],'jointExclusionPassed':True}))
