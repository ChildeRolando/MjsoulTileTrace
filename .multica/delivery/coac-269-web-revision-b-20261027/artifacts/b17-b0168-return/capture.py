"""Copy the exact reviewed-target return; never write processing data or dispatch."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
source = ROOT/'integration/coac249-b0168-reviewed-target-20261028.json'
sha = lambda b: hashlib.sha256(b).hexdigest()
assert sha(source.read_bytes()) == '3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c'
h = json.loads(source.read_text(encoding='utf-8'))
bindings = []
for name, bound in [('handoff.json',{'path':str(source),'sha256':sha(source.read_bytes())}),
                    *[(key+'.json',h[key]) for key in ['audit','checkpoint','raw','runtime']]]:
    raw = Path(bound['path']).read_bytes()
    assert sha(raw) == bound['sha256']
    (HERE/name).write_bytes(raw)
    bindings.append({'name':name,**bound})
commit = 'a10215f2d03056d1e210f4a917f998f6ede2bcb0'
for name in ['b168-process.json','b168-guard-released.json','b168-verifier-boundary.json','b168-dispatch244.json','b168-dispatch250.json']:
    ref = commit+':artifacts/a249-217-168/'+name
    raw = subprocess.check_output(['git','show',ref])
    (HERE/name).write_bytes(raw)
    bindings.append({'name':name,'gitRef':ref,'sha256':sha(raw)})
(HERE/'captured.json').write_text(json.dumps({'modelCalls':0,'bindings':bindings},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'exactCopies':len(bindings),'modelCalls':0}))
