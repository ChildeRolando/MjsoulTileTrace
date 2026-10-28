"""Freeze an exact224 display consumer, without invoking produce or the model CLI."""
from pathlib import Path
import json,hashlib,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-224-seven-limited-20261028'
L=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
assert not D.exists(),'inspect the existing scope before reuse'
origin=P/'integration/coac244-109167-limited-display-20261028/stage-base.mjs'
(O/'stage-base.mjs').write_text(origin.read_text(encoding='utf-8-sig').replace('admitted-exact109167-editorial-display','verified-exact224-seven-limited-display').rstrip()+'\n',encoding='utf-8')
rref=ref(P/'integration/coac249-224-seven-reviewed-20261028.json');assert rref['sha256']=='3b9bab561f2ea1c0450156ef1135e879471c503cc8ff1a3e709d981188c79e2e';r=L(rref['path'])
q=ref(P/'integration/coac249-224-seven-limited-scope-20261028.json');assert q['sha256']=='e64d2e9ca2a6996adfb4ef676edbf2f4f4f27e6ab469812ca3e14a751e3e2257'
inherit=ref(P/'integration/coac249-224-seven-inheritance-20261028.json');assert inherit['sha256']=='d0ba60967234b230a08c98067d2d623e87cf06b6db5d6e925b29f78e9db52729'
owner=ref(P/'integration/coac249-224-seven-owner-handoff-20261028.md');assert owner['sha256']=='81b79cb4383a882f56685e75694a37403a08057391912d075372276d25901107'
seven=ref(P/'audit/runtimes/coac269-224-seven-v1-20261028/seven.mjs')
files=[rref,q,inherit,owner,seven,ref(origin)]
for record in [r,L(r['parentAudit']['path'])]:
 for k in ['candidate','source','parent','parentAudit','parentRaw','makerRaw','raw','runtime','handoff','plan']:
  if k in record:files.append(record[k])
rt=L(r['runtime']['path']);files.extend(rt['files'])
for f in rt['files']:
 if Path(f['path']).parent.name=='coac269-224-seven-v1-20261028' and Path(f['path']).name=='contract.json':
  c=L(f['path']);files.extend([c[k] for k in ['parent','receipt','reviewRaw','makerRaw','source']]);files.extend(c['images'])
for path in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/path))
for name in ['admit.mjs','stage-base.mjs','stage.mjs']:files.append({'path':str(D/name),'sha256':sha((O/name).read_bytes())})
files=list({f['path'].replace('\\','/').lower():f for f in files}.values())
m={'schema':'coac244-224-seven-limited-frozen/1','receipt':rref,'proposal':q,'inheritance':inherit,'ownerHandoff':owner,'sevenModule':seven,'files':files,'newCalls':0,'globalPointerMayChange':False}
(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');D.mkdir()
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'boundFiles':len(files),'newCalls':0,'package':str(D)}))
