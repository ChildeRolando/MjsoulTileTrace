"""Package one completed chapter immediately; no integration or model operation."""
import json
import hashlib
import shutil
import sys
from pathlib import Path

local=Path(__file__).resolve().parent.parent
root=Path('E:/AgentData/Coach/knowledge/processing')
key=sys.argv[1]
assert key in ['256-18','276-4']
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,v): p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
e=load(local/f'receipt-web{key}.rev1-awaiting-review.json')
assert e['checks']['passed'] and e['preservation']['allNonTargetBytesPreserved']
run=root/f'web-production/v1/runs/coac248-web-{key}-r1-20261027'
dest=local/f'evidence-web{key}-20261027'
dest.mkdir(exist_ok=False)
for name in ['preflight.json','entry-preflight.json','dispatch-started.json','dispatch-finished.json','slot-released.json','production.stdout.json','production.stderr.txt','production-evidence.json']:
    shutil.copyfile(run/name,dest/name)
call=e['productionAttempt']
raw=root/'web-production/v1'/call['rawArtifactPath']
assert sha(raw)==call['rawArtifactSha256']
shutil.copyfile(raw,dest/(call['callId']+'.raw.json'))
handoff=root/f'integration/coac249-incremental-{key}-20261027.json'
h=load(handoff)
h['verifiedExistingRuntimeManifest']=load(local/'runtime-manifest-256-276-20261027.json')
h['originalLedgerFailedCount']=e['modelCalls']['failed']
write(handoff,h)
shutil.copyfile(handoff,local/handoff.name)
out=[]
for k in ['256-18','276-4']:
    receipt=local/f'receipt-web{k}.rev1-awaiting-review.json'
    if not receipt.exists(): continue
    x=load(receipt)
    out.append({'chapterId':x['chapterId'],'articleId':x['articleId'],'candidateSha256':x['candidateSha256'],
        'targetChanges':x['changes'],'modelCalls':x['modelCalls']})
write(local/'target-diff-256-276-20261027.json',{'schema':'coac248-finite-two-chapter-target-diff/1','chapters':out,'semanticAcceptance':None})
print(json.dumps({'chapterId':e['chapterId'],'handoffSha256':sha(handoff)}))
