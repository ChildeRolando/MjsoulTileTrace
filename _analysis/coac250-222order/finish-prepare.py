from pathlib import Path
import subprocess,json,hashlib
p=Path('_analysis/coac250-222order');pre=json.loads((p/'preconsume.json').read_bytes())
# Only222 evidence and actual code dependencies belong in its persistent route.
# Unrelated chapter state remains protected during this increment, without pinning future updates.
unrelated={'source-structure-holds.json','candidate-exclusions.json','source-block-ownership.json','definition-boundary-stage-selection.json','ready-pdf-gap-chapters.json','coac250-p217-limited-evidence-intake-20261028.json','coac250-pdf217220-assembly-intake-20261028.json','coac250-limited-159242-intake-20261028.json','coac250-283-convergence-intake-20261028.json'}
pre['orderReview']['files']=[f for f in pre['orderReview']['files'] if Path(f['path']).name not in unrelated and f['path'].replace('\\','/')!='E:/AgentData/Coach/knowledge/review/textbook-corpus.json']
(p/'preconsume.json').write_text(json.dumps(pre,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
for name in ['ordered-request222.json','tests222.json']:
    b=subprocess.check_output(['git','show','5f3575a:artifacts/a249-order-pdf/'+name]);(p/name).write_bytes(b)
b=(p/'ordered-request222.json').read_bytes();assert hashlib.sha256(b).hexdigest()=='cdc051963b1f1086856d0a66b7b44f87cf443189fad3a5b738d6ed62c58b8cfa'
print(json.dumps({'recoveredFrom':'5f3575a','requestBytes':len(b),'keys':list(json.loads(b)),'persistentRouteFiles':len(pre['orderReview']['files'])}))
