"""Final zero-call receipt verification, without accepting or integrating candidates."""
import json
import hashlib
from pathlib import Path
local=Path(__file__).resolve().parent.parent
root=Path('E:/AgentData/Coach/knowledge/processing')
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
out=[]
for key in ['256-18','276-4']:
    ep=local/f'receipt-web{key}.rev1-awaiting-review.json'
    if not ep.exists(): continue
    e=load(ep)
    pre=load(local/f'source-check-web{key}-20261027.json')
    cp=root/e['candidatePath']; c=load(cp); parent=load(root/e['parentPath'])
    assert sha(cp)==e['candidateSha256']==sha(local/'candidates'/cp.name)
    for path,digest in [(e['parentPath'],e['parentSha256']),(e['sourcePath'],e['sourceSha256']),(e['parentAuditPath'],e['parentAuditSha256'])]:
        assert sha(root/path)==digest
    assert all(sha(Path(x['path']))==x['sha256'] for x in pre['parentRaw'])
    assert c['body']==parent['body']
    assert [x['figureId'] for x in c['figures']]==[x['figureId'] for x in parent['figures']]
    rows=[json.loads(x) for x in (root/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    a=[x for x in rows if x['callId']==e['productionAttempt']['callId']]
    assert len(a)==1 and a[0]['success']
    assert len([x for x in rows if x.get('articleId')==e['articleId']])==3
    raw=root/'web-production/v1'/a[0]['rawArtifactPath']
    assert sha(raw)==a[0]['rawArtifactSha256']==sha(local/f'evidence-web{key}-20261027'/(a[0]['callId']+'.raw.json'))
    out.append({'chapterId':e['chapterId'],'candidateSha256':sha(cp),'rawSha256':sha(raw),
                'originalParentSourceAuditRawUnchanged':True,'localCandidateExactBytes':True})
f=load(local/'receipt-web276-4.rev1-failed.json')
pre=f['preflight']; call=f['call']
assert call['success'] is False and call['usage'] is None
assert sha(root/pre['parentPath'])==pre['parentSha256']
assert sha(root/pre['sourcePath'])==pre['sourceSha256']
assert sha(root/pre['parentAuditPath'])==pre['parentAuditSha256']
assert all(sha(Path(x['path']))==x['sha256'] for x in pre['parentRaw'])
raw=root/'web-production/v1'/call['rawArtifactPath']
assert sha(raw)==call['rawArtifactSha256']==sha(local/'evidence-web276-4-20261027'/(call['callId']+'.raw.json'))
assert not (root/'web-production/v1/candidates/79-bilibili-cn/cv1793434.r1.json').exists()
out.append({'chapterId':f['chapterId'],'candidateSha256':None,'callId':call['callId'],'usage':None,
            'originalParentSourceAuditRawUnchanged':True,'noNewCandidate':True,'retry':False})
stops={x:(root/x).exists() for x in ['STOP','web-production/v1/STOP','model-admission-stop.json']}
result={'chapters':out,'stopFiles':stops,'newModelCalls':0}
(local/'final-verification-256-276-20261027.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
