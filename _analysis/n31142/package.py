"""Package code, hash bindings and review summaries, never source bodies/images/raw."""
import hashlib,json,pathlib,zipfile
OUT=pathlib.Path(__file__).resolve().parent;PKG=pathlib.Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-311-native-admission-20261028')
def sha(b):return hashlib.sha256(b).hexdigest()
def save(p,x):
 with p.open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
copies=[]
for name in ['README.md','handoff.json','manifest.json','stage-files.sha256.json','verification.json','admit.mjs','stage.mjs','stage-base.mjs']:
 p=PKG/name;b=p.read_bytes();alias='e'+str(len(copies)).zfill(3);(OUT/alias).write_bytes(b);copies.append({'path':str(p),'copy':alias,'sha256':sha(b),'bytes':len(b)})
save(OUT/'archive.json',{'scope':'Exact311 owner code/manifests and independent display-verification conclusions only','copies':copies,'sourceBodiesImagesRequestsAndRawIncluded':False})
names=['README.md','final.json','readback.json','rebuild.json','coverage-verification.json','tests.json','owner-check.json','original-scope.json','sealed-stage-verification.json','copied-stage-verification.json','publication.json','stage-seal.json','archive.json']+[x['copy'] for x in copies]
save(OUT/'inventory.json',{'files':[{'path':n,'sha256':sha((OUT/n).read_bytes()),'bytes':(OUT/n).stat().st_size} for n in names],'fullAuthorBodiesImagesOrRawIncluded':False})
with zipfile.ZipFile(OUT/'311-evidence.zip','x',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(OUT/n,n)
print(json.dumps({'archive':'311-evidence.zip','bytes':(OUT/'311-evidence.zip').stat().st_size,'sha256':sha((OUT/'311-evidence.zip').read_bytes()),'codeAndMetadataOnly':True}))
