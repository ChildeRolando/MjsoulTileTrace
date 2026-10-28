"""Freeze a private, exact CN234 display entry. No model or global pointer writes."""
from pathlib import Path
import json,hashlib,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-cn234-text-scope-20261028'
L=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
assert not D.exists(),'inspect existing namespace before reuse'
origin=P/'integration/coac244-109167-limited-display-20261028'
base=(origin/'stage-base.mjs').read_text(encoding='utf-8-sig').replace('admitted-exact109167-editorial-display','verified-exact-cn234-text-evidence')
base=base.replace('function displayExactSegments(block){return block.sourceSegments;}',"import {displayExactSegments} from './admit.mjs';")
(O/'stage-base.mjs').write_text(base.rstrip()+'\n',encoding='utf-8')
rref=ref(P/'integration/coac249-cn234-text-r1-target-reviewed-20261028.json');assert rref['sha256']=='d0a8e533bfcd1fc5b48fab3a064e8d674b8cd92111e0b242a2ed2c6fde0b4ba6'
r=L(rref['path']);side=ref(P/'integration/coac249-cn234-text-r1-scope-binding-20261028.json');assert side['sha256']=='be0f28bef7cc945e004ab27cfdf4f27845060647be060cf3dfa1726f7a7cee77'
q=ref(P/'integration/coac249-cn234-text-r1-exact-scope-20261028.json');assert q['sha256']=='084ca5f54f8912ba72901fa8ea62c2694496d7970d98e044acfd0ccb5cc0a503'
inherit=ref(P/'integration/coac249-cn234-text-r1-inheritance-20261028.json');assert inherit['sha256']=='c309f62a2e098d3fea47769ee51668ae3491e384bc82c828ece401cef8b48d7d'
helper=ref(P/'integration/coac248-193234-text-20261028/review.mjs')
files=[rref,side,q,inherit,helper,ref(origin/'stage-base.mjs'),ref(P/'integration/coac248-193234-text-20261028/release.json'),L(q['path'])['oldTimeout']['raw']]
for k in ['raw','plan','candidate','source','parent','parentAudit','parentRaw','makerRaw','runtime','handoff']:files.append(r[k])
rt=L(r['runtime']['path'])
for f in rt['files']:files.append(ref(Path(r['runtime']['path']).parent/f['name']))
files.extend(rt.get('externalDependencies',[]))
for path in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/path))
for name in ['admit.mjs','stage-base.mjs','stage.mjs']:files.append({'path':str(D/name),'sha256':sha((O/name).read_bytes())})
files=list({f['path'].replace('\\','/').lower():f for f in files}.values())
m={'schema':'coac244-cn234-exact-text-frozen/1','receipt':rref,'sidecar':side,'proposal':q,'inheritance':inherit,'textModule':helper,'files':files,'newCalls':0,'globalPointerMayChange':False}
(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');D.mkdir()
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'boundFiles':len(files),'newCalls':0,'package':str(D)}))
