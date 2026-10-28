"""Archive exact evidence under short local names and make three portable previews."""
import hashlib,json,shutil,zipfile
from pathlib import Path
d=Path('_analysis/b351'); root=Path('E:/AgentData/Coach/knowledge/processing/integration')
load=lambda p:json.loads(Path(p).read_text(encoding='utf8'))
sha=lambda b:hashlib.sha256(b).hexdigest()
final=load(d/'final.json'); output=Path(final['preview']['output']); refs=[]
def copy(src,name):
 p=d/name
 assert len(str(p.resolve()).encode('utf-16-le'))//2<240
 shutil.copyfile(src,p); refs.append({'source':str(src),'local':name,'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size})
for src,name in [
 (output/'mcp-validation.json','mcp.json'),(output/'arena-validation.json','arena.json'),
 (output/'source-deduplication-validation.json','dedup.json'),(output/'accepted-preview-receipt.json','preview.json'),
 (root/'accepted-preview-current.json','pointer.json'),(root/'coac250-unified-chapter-register-20261027b.json','register.json'),
 (root/'coac244-remaining26-closure-register-20261028.json','owner.json'),
 (root/'coac250-uncovered-chapter-continuation-register-20261027b.json','continuation.json')]:copy(src,name)
for s in final['preview']['stages']:
 p=Path(s['destination']);key=s['key']
 for n,alias in [('display-limits.json','display'),('web-stage-receipt.json','receipt')]:copy(p/n,key+'-'+alias+'.json')
 z=d/(key+'-preview.zip')
 files=[f for f in p.rglob('*') if f.is_file() and f.name not in ['mcp-validation.json','arena-validation.json']]
 with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
  for f in files:archive.write(f,f.relative_to(p).as_posix())
  archive.writestr('READ-ME.txt','Bounded author-fidelity presentation; editorial source limits are not author text. Original uncertain/false retained. Not formal active. Open knowledge.html after extracting all files.\n')
 with zipfile.ZipFile(z) as archive:
  assert archive.testzip() is None
  assert 'knowledge.html' in archive.namelist()
 refs.append({'source':str(p),'local':z.name,'sha256':sha(z.read_bytes()),'bytes':z.stat().st_size,'portableFiles':len(files)})
copy(Path(final['preview']['stages'][0]['destination'])/'source-assets/q8-original.jpg','q8-original.jpg')
copy(Path(final['preview']['stages'][0]['destination'])/'assets/q8-original.png','q8-display.png')
(d/'package.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps([r for r in refs if 'portableFiles' in r]))
