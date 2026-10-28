import json,hashlib,shutil,zipfile
from pathlib import Path
d=Path('_analysis/b234');load=lambda p:json.loads(Path(p).read_text(encoding='utf8'));sha=lambda b:hashlib.sha256(b).hexdigest();f=load(d/'final.json');out=Path(f['preview']['output']);stage=Path(f['preview']['destination']);refs=[]
def copy(src,name):
 dest=d/name;assert len(str(dest.resolve()).encode('utf-16-le'))//2<240;shutil.copyfile(src,dest);refs.append({'source':str(src),'local':name,'sha256':sha(dest.read_bytes()),'bytes':dest.stat().st_size})
for src,name in [(out/'mcp-validation.json','mcp.json'),(out/'arena-validation.json','arena.json'),(out/'source-deduplication-validation.json','dedup.json'),(out/'accepted-preview-receipt.json','preview.json'),(stage/'web-stage-receipt.json','stage-receipt.json'),(stage/'scope-provenance.json','scope-provenance.json')]:copy(src,name)
z=d/'234-preview.zip'
with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for p in stage.rglob('*'):
  if p.is_file():archive.write(p,p.relative_to(stage).as_posix())
 archive.writestr('READ-ME.txt','Extract all and open knowledge.html. Exact Chinese234 independently reviewed three-gloss text scope with unchanged parent. Audit/source/timeout requirements are separately in scope-provenance.json, never author text. Not a new full visual review or formal active.\n')
with zipfile.ZipFile(z) as archive:assert archive.testzip() is None;assert 'knowledge.html' in archive.namelist();assert 'scope-provenance.json' in archive.namelist()
refs.append({'source':str(stage),'local':z.name,'sha256':sha(z.read_bytes()),'bytes':z.stat().st_size});(d/'package.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('234 portable preview bytes:',z.stat().st_size)
