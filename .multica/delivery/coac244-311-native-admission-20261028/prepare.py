"""Freeze an exact311 conditional gate and private copy of the existing stage."""
from pathlib import Path
import hashlib,json,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-311-native-admission-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
origin=P/'integration/coac244-224-seven-limited-20261028/stage-base.mjs'
s=origin.read_text(encoding='utf-8-sig').replace('verified-exact224-seven-limited-display','verified-exact311-native-conditional-display').replace("candidate.schema!=='coach-textbook-web-article-draft/1'","candidate.schema!=='coach-web311-native-presentation-proposal/1'")
(O/'stage-base.mjs').write_text(s,encoding='utf-8')
rref=ref(P/'integration/coac249-311-native-fidelity-reviewed-20261028.json');r=load(rref['path'])
q=ref(P/'integration/coac249-311-native-mandatory-display-20261028.json');inherit=ref(P/'integration/coac249-311-native-fidelity-inheritance-20261028.json')
derivation=ref(P/'integration/coac244-311-native-proposal-20261028/derivation.json')
files=[rref,q,inherit,derivation,ref(origin),ref(P/'integration/coac249-311-native-fidelity-owner-handoff-20261028.md')]
intake=load(P/'integration/coac249-311-native-zero-intake-20261028.json');files.extend(intake['bindings'])
for k in ['proposal','source','parent','inheritedReceipt','inheritedRaw','runtime','requestContract','plan','preparedRequest','raw']:
 files.append(r[k])
for f in load(r['runtime']['path'])['files']:
 f=dict(f)
 if not Path(f['path']).is_absolute():f['path']=str(Path(r['runtime']['path']).parent/f['path'])
 files.append(f)
scripts=Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')
for n in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:
 files.append(ref(scripts/n))
files=list({str(Path(f['path'])).replace('\\','/').lower():f for f in files}.values())
for f in files:assert sha(Path(f['path']).read_bytes())==f['sha256'],f['path']
for n in ['admit.mjs','stage.mjs','stage-base.mjs']:
 files.append({'path':str(D/n),'sha256':sha((O/n).read_bytes())})
m={'schema':'coac244-exact311-native-stage-frozen/1','receipt':rref,'scope':q,'inheritance':inherit,'derivation':derivation,'files':files,'newModelCalls':0,'ordinaryWholeArticlePassed':False,'globalAdmissionGranted':False}
(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
D.mkdir(exist_ok=True)
for f in O.iterdir():
 if f.is_file() and f.suffix in ['.mjs','.py','.json','.md']:shutil.copyfile(f,D/f.name)
print(json.dumps({'package':str(D),'bindings':len(files),'newCalls':0}))
