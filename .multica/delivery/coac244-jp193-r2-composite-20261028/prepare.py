"""Freeze one exact composite scope. No raw/source/candidate rewrite or global route write."""
from pathlib import Path
import json,hashlib,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-jp193-r2-composite-20261028'
L=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
assert not D.exists(),'inspect existing namespace before reuse'
rref=ref(P/'integration/coac249-jp193-text-r2-target-reviewed-20261028.json');assert rref['sha256']=='0d908f3ae536e17b12380e7394f26eef64bf75afe2e910aa000797eb24b8f219'
r=L(rref['path']);old=L(r['parentAudit']['path'])
h=ref(P/'integration/coac249-jp193-text-r2-historical-issues-20261028.json');assert h['sha256']=='0d35d4f711baf996ba60a8d9a12aa87733697614a3b1062f215a34ec8c67a42f'
q=ref(P/'integration/coac249-jp193-text-r2-display-20261028.json');assert q['sha256']=='a0f9b3f8101d19dea47761c93e007b3a21d5e67a1af381e7df4b8a6f4964c375'
inherit=ref(P/'integration/coac249-jp193-text-r2-inheritance-20261028.json');assert inherit['sha256']=='a91828879876d0be1a4e2dc3467375fc929fa836910b65f59d911c75209a4a68'
origin=P/'integration/coac244-109167-limited-display-20261028'
base=(origin/'stage-base.mjs').read_text(encoding='utf-8-sig').replace('admitted-exact109167-editorial-display','verified-exact-jp193-r2-composite-evidence')
(O/'stage-base.mjs').write_text(base.rstrip()+'\n',encoding='utf-8')
stage=(origin/'stage.mjs').read_text(encoding='utf-8-sig').replace('// Exact109/167 display overlays only.','// Exact Japanese193 r2 composite display overlay only.')
(O/'stage.mjs').write_text(stage.rstrip()+'\n',encoding='utf-8')
textModule=ref(P/'integration/coac248-193234-text-20261028/review.mjs');visionModule=ref(P/'integration/coac248-193213-20261028/review.mjs')
files=[rref,h,q,inherit,textModule,visionModule,ref(origin/'stage-base.mjs'),ref(origin/'stage.mjs')]
for record in [r,old]:
 for k in ['raw','plan','candidate','source','parent','parentAudit','parentRaw','makerRaw','runtime','handoff']:
  if k in record:files.append(record[k])
 rt=L(record['runtime']['path'])
 for f in rt['files']:files.append(ref(Path(record['runtime']['path']).parent/f['name']))
 files.extend(rt.get('externalDependencies',[]))
for path in ['integration/coac248-193234-text-20261028/release.json','integration/coac248-193213-20261028/release.json']:files.append(ref(P/path))
for path in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/path))
for name in ['admit.mjs','stage-base.mjs','stage.mjs']:files.append({'path':str(D/name),'sha256':sha((O/name).read_bytes())})
files=list({f['path'].replace('\\','/').lower():f for f in files}.values())
m={'schema':'coac244-jp193-r2-composite-frozen/1','receipt':rref,'history':h,'proposal':q,'inheritance':inherit,'textModule':textModule,'visionModule':visionModule,'files':files,
 'scope':'exact new text evidence + inherited figure6p/unknown impact + seven mandatory non-author limits','newCalls':0,'originalFalseMustRemain':True,'globalPointerMayChange':False}
(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');D.mkdir()
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'boundFiles':len(files),'newCalls':0,'package':str(D)}))
