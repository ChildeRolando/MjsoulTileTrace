import json,hashlib,shutil,zipfile
from pathlib import Path
d=Path('_analysis/b224');load=lambda p:json.loads(Path(p).read_text(encoding='utf8'));sha=lambda b:hashlib.sha256(b).hexdigest();f=load(d/'final.json');out=Path(f['preview']['output']);stage=Path(f['preview']['destination']);refs=[]
def copy(src,name):
 dest=d/name;assert len(str(dest.resolve()).encode('utf-16-le'))//2<240;shutil.copyfile(src,dest);refs.append({'source':str(src),'local':name,'sha256':sha(dest.read_bytes()),'bytes':dest.stat().st_size})
for src,name in [(out/'mcp-validation.json','mcp.json'),(out/'arena-validation.json','arena.json'),(out/'source-deduplication-validation.json','dedup.json'),(out/'accepted-preview-receipt.json','preview.json'),(stage/'web-stage-receipt.json','stage-receipt.json'),(stage/'display-limits.json','display-limits.json'),(stage/'source-notes.json','source-notes.json')]:copy(src,name)
z=d/'224-preview.zip'
with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for p in stage.rglob('*'):
  if p.is_file():archive.write(p,p.relative_to(stage).as_posix())
 archive.writestr('READ-ME.txt','Extract all and open knowledge.html. Exact Japanese224 seven-cell independent evidence plus unchanged complete parent. 88 approximate chart readings and17unknown retained. Ten visible non-author limitations precede the graph; three original source notes follow it. Original raw/old false and whole-page-false flags unchanged. No new model review or formal active.\n')
with zipfile.ZipFile(z) as archive:assert archive.testzip() is None;assert 'knowledge.html' in archive.namelist();assert 'display-limits.json' in archive.namelist();assert 'source-notes.json' in archive.namelist()
refs.append({'source':str(stage),'local':z.name,'sha256':sha(z.read_bytes()),'bytes':z.stat().st_size});(d/'package.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('224 portable preview bytes:',z.stat().st_size)
