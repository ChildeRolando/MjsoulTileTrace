"""Freeze an exact232 callback; reuse rendering mechanics, never another chapter's admission."""
import pathlib,json,hashlib,re,shutil
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-232-human-conditional-20261028';O=pathlib.Path(__file__).resolve().parent;D.mkdir(exist_ok=True)
read=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
pins={'receipt':('coac249-232-human-reviewed-20261028.json','2280884a55df3ba010ceac36c5c4832deb2b4dc15b15f2e07d8db554a8f3a94c'),'scope':('coac249-232-human-display-scope-20261028.json','fdb1e1196023764a5ac571f9ff0175102416848b39332862ca2fb6748b018d84'),'inheritance':('coac249-232-human-inheritance-20261028.json','8b85184a17332b8f0edca95acdecd8f4b96b864c7d68613861a721b8102ac949')}
m={'schema':'coac244-exact232-conditional-display-manifest/1','files':[]};seen={}
def pin(path,expected=None):
 path=pathlib.Path(path);h=sha(path.read_bytes());assert expected is None or expected==h,str(path);ref={'path':str(path),'sha256':h}
 if str(path) in seen:assert seen[str(path)]==h
 else:m['files'].append(ref);seen[str(path)]=h
 return ref
for k,(n,h)in pins.items():m[k]=pin(P/'integration'/n,h)
r=read(m['receipt']['path']);m['candidate']=r['candidate'];pr=read(m['inheritance']['path']);missing=[]
for f in pr['refs']:
 if pathlib.Path(f['path']).exists():pin(f['path'],f['sha256'])
 else:
  assert re.search(r'admission-[01]-(preview|register)\.json$',f['path']),f['path'];missing.append(f)
# These absent files were historical exclusion snapshots, not the source/candidate/runtime/request/raw dependencies.
m['absentHistoricalAdmissionSnapshots']=missing
for k in ['candidate','source','parent','parentAudit','inheritedReceipt','inheritedRaw','runtime','handoff','raw','plan']:pin(r[k]['path'],r[k]['sha256'])
template=P/'integration/coac244-jp193-r2-composite-20261028/stage-base.mjs';base=template.read_text(encoding='utf-8');templatePin=pin(template)
old='verified-exact-jp193-r2-composite-evidence';assert base.count(old)==2;base=base.replace(old,'admitted-exact232-human-four-limit-display');assert base.count('strict.verifyLimited(processingRoot,path)')==1;base=base.replace('strict.verifyLimited(processingRoot,path)','strict.verify232Conditional(processingRoot,path)')
(O/'stage-base.mjs').write_bytes(base.encode('utf-8'));m['renderMechanicsTemplate']=templatePin;m['fixedCallbackPatchOnly']=True
for f in re.findall(r"file:///([^']+)",base):
 if pathlib.Path(f).exists():pin(f)
for f in O.iterdir():
 if f.is_file() and f.name!='manifest.json':shutil.copyfile(f,D/f.name)
for n in ['admit.mjs','stage.mjs','stage-base.mjs','prepare.py','check.mjs','baseline-pin.json']:
 if (D/n).exists():pin(D/n)
m['stageFiles']=[]
if (D/'stage').exists():
 for f in sorted((D/'stage').rglob('*')):
  if f.is_file() and f.name!='web-stage-receipt.json':
   ref=pin(f);m['stageFiles'].append({'path':f.relative_to(D/'stage').as_posix(),'sha256':ref['sha256']})
(O/'manifest.json').write_bytes(json.dumps(m,indent=2).encode('utf-8')+b'\n');shutil.copyfile(O/'manifest.json',D/'manifest.json')
print(json.dumps({'bindings':len(m['files']),'absentHistoricalSnapshots':len(missing),'modelCalls':0}))
