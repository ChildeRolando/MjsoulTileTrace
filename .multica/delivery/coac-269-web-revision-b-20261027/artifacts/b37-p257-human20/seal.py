"""Seal the fixed local packet; repository receives metadata only, no book or human-history export."""
import hashlib,json,shutil
from pathlib import Path
H=Path(__file__).resolve().parent;D=Path('E:/AgentData/Coach/knowledge/processing/integration/coac269-p257-human20-20261028')
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p),'bytes':Path(p).stat().st_size}
def save(p,x):
    b=(json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode()
    if Path(p).exists():assert Path(p).read_bytes()==b
    else:Path(p).write_bytes(b)
for name in ['prepare.py','entry.mjs','check.mjs','checks.json','seal.py']:shutil.copyfile(H/name,D/name)
p=load(D/'plan.json');r=load(D/'receipt.json');checks=load(H/'checks.json')
assert r['candidate']==checks['candidate']
meta={k:v for k,v in r.items() if k!='reuse'}
meta['reuse']=[{'page':v['page'],'sourceBlocks':v['sourceBlocks'],'candidate':v['candidate'],'status':v['status']} for v in r['reuse']]
save(H/'application.json',meta)
save(D/'manifest.json',{'schema':'coac269-p257-human20-frozen-packet/1','authorization':p['authorization'],
 'candidate':r['candidate'],'files':[bind(f) for f in sorted(D.rglob('*')) if f.is_file() and f.name!='manifest.json'],
 'inputBindings':p['inputBindings'],'modelProduced':False,'newModelCalls':0,'newProductionCalls':0,
 'reviewBudget':p['independentReviewBudget'],'wholeChapterPassed':False,'admissionGranted':False})
save(H/'packet.json',{'path':str(D),'manifest':bind(D/'manifest.json'),'candidate':r['candidate'],
 'request':checks['request'],'newModelCalls':0,'newProductionCalls':0,'independentReviewPerformedByThisOwner':False})
print(json.dumps(load(H/'packet.json')))
