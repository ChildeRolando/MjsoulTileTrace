import hashlib,json,pathlib,zipfile
D=pathlib.Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def save(p,x):
 with p.open('w',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
p=read(D/'preparation.json')
for r in p['protectedFiles']:assert sha(pathlib.Path(r['path']).read_bytes())==r['sha256'],r['path']
assert not p['writerLockAcquired'] and not p['admissionGranted']
save(D/'consumer-contract.json',p['consumerContract'])
names=['README.md','preparation.json','consumer-contract.json','source-mapping.json','verification.json']
save(D/'inventory.json',{'files':[{'path':n,'sha256':sha((D/n).read_bytes()),'bytes':(D/n).stat().st_size} for n in names],'fullAuthorDataImagesHumanHistoryAndRawIncluded':False})
with zipfile.ZipFile(D/'final-preparation.zip','x',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(D/n,n)
print(json.dumps({'archiveSha256':sha((D/'final-preparation.zip').read_bytes()),'bytes':(D/'final-preparation.zip').stat().st_size,'newModelCalls':0,'lockAcquired':False}))
