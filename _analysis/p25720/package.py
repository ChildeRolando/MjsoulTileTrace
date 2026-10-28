import hashlib,json,pathlib,zipfile
OUT=pathlib.Path(__file__).resolve().parent;ROOT=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def save(p,x):
 with p.open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
f=load(OUT/'final.json')
for x in f['protectedBefore']:assert sha(pathlib.Path(x['path']).read_bytes())==x['sha256'],x['path']
for n in ['accepted-consumer.lock','selection-maintainer.lock.json']:assert not (ROOT/'integration'/n).exists()
assert load(OUT/'checks.json')['negativeCount']==19
assert len(load(OUT/'verification.json')['negativeChecks'])==8
assert not f['admissionGranted'] and not f['actualMcpArenaReadbackCompleted']
for ref in f['registers']:
 doc=load(ref['path']);row=next(x for x in doc['rows'] if x['chapterId']=='nemata-jp-chapter-250-1');assert not row.get('covered',False);assert row['human20P257Intake']['candidate']==f['pending']['candidate']
sources=[ROOT/'integration/coac269-p257-human20-20261028'/n for n in ['manifest.json','entry.mjs','check.mjs']]
copies=[]
for p in sources:
 b=p.read_bytes();alias='e'+str(len(copies)).zfill(3);(OUT/alias).write_bytes(b);copies.append({'path':str(p),'copy':alias,'sha256':sha(b),'bytes':len(b)})
save(OUT/'archive.json',{'sourceExportsBodiesImagesRawNotIncluded':True,'codeAndHashCopies':copies})
names=['README.md','final.json','application-summary.json','review-summary.json','binding.json','checks.json','verification.json','owner-request.json','archive.json']+[x['copy'] for x in copies]
save(OUT/'inventory.json',{'files':[{'path':n,'sha256':sha((OUT/n).read_bytes()),'bytes':(OUT/n).stat().st_size} for n in names],'sourceExportsBodiesImagesRawIncluded':False})
with zipfile.ZipFile(OUT/'257-intake.zip','x',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(OUT/n,n)
print(json.dumps({'verified':True,'archiveSha256':sha((OUT/'257-intake.zip').read_bytes()),'archiveBytes':(OUT/'257-intake.zip').stat().st_size,'admitted':False,'newModelCalls':0}))
