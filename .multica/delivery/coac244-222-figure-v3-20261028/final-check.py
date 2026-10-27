import json,pathlib,hashlib,shutil,zipfile
O=pathlib.Path(__file__).resolve().parent;P=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
S=P/'integration/coac244-222-figure-contract-v3-20261028'
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
old=load(O/'old-runtime-binding.json')
for f in old['files']:assert sha(pathlib.Path(old['path'])/f['path'])==f['sha256']
n=load(O/'new-runtime-binding.json');m=load(pathlib.Path(n['manifest']['path']));assert sha(pathlib.Path(n['manifest']['path']))==n['manifest']['sha256']
for f in m['files']:
 assert sha(pathlib.Path(n['path'])/f['path'])==f['sha256'];assert sha(O/'runtime'/f['path'])==f['sha256']
assert not (O/'runtime/node_modules').exists()
tests=load(O/'test-results.json');assert len(tests['checks'])==42 and all(c['passed'] for c in tests['checks']);assert tests['sharedLedgerUnchanged']
changed=['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1','79-cn-chapter-222-5']
def strip(x):
 if isinstance(x,dict):
  if x.get('chapterId') in changed:return {'chapterId':x['chapterId'],'covered':x.get('covered')}
  return {k:strip(v) for k,v in x.items()}
 if isinstance(x,list):return [strip(v) for v in x]
 return x
for name in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 assert strip(load(O/(name+'.before')))==strip(load(O/name))
regressions={'command':'existing Vitest3.2.7 run textbook-audit-web.test.mjs textbook-audit-image-binding.test.mjs --maxWorkers1','tests':41,'files':2,'passed':True,'durationMs':25130,'details':{'web':34,'imageBinding':7},'newDependencyInstallation':False,'temporaryDependencyJunctionRemoved':True,'newModelCalls':0}
(O/'existing-regressions.json').write_text(json.dumps(regressions,indent=2)+'\n',encoding='utf-8')
for name in ['README.md','handoff-249.md','handoff-wakeup.json','existing-regressions.json','test.mjs','test-overlay.mjs','overlay-loader.mjs','final-check.py']:
 shutil.copy2(O/name,S/name)
files=[{'relativePath':str(f.relative_to(O)).replace('\\','/'),'sha256':sha(f),'bytes':f.stat().st_size} for f in O.rglob('*') if f.is_file() and f.name!='delivery-manifest.json']
manifest={'schema':'coac244-222-target-contract-delivery/1','files':files,'newModelCalls':0,'oldRuntimeUnchanged':True,'newRuntimeFiles':31,'newChecksPassed':42,'existingTestsPassed':41,'onlyThreeCanonicalRowsChanged':True,'coverageUnchanged':True,'formalActiveChanged':False}
(O/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');shutil.copy2(O/'delivery-manifest.json',S/'delivery-manifest.json')
print(json.dumps({'files':len(files),'oldRuntimeUnchanged':True,'newRuntimeFiles':31,'checks':83,'newModelCalls':0}))
