"""Portable exact167 preview and immutable evidence snapshots, short paths only."""
import json,hashlib,shutil,zipfile
from pathlib import Path
d=Path('_analysis/b167');base=Path('E:/AgentData/Coach/knowledge/processing/integration');load=lambda p:json.loads(Path(p).read_text(encoding='utf8'));sha=lambda b:hashlib.sha256(b).hexdigest();final=load(d/'final.json');output=Path(final['preview']['output']);stage=Path(final['preview']['destination']);refs=[]
def copy(src,name):
 dest=d/name;assert len(str(dest.resolve()).encode('utf-16-le'))//2<240;shutil.copyfile(src,dest);refs.append({'source':str(src),'local':name,'sha256':sha(dest.read_bytes()),'bytes':dest.stat().st_size})
for src,name in [(output/'mcp-validation.json','mcp.json'),(output/'arena-validation.json','arena.json'),(output/'source-deduplication-validation.json','dedup.json'),(output/'accepted-preview-receipt.json','preview.json'),(stage/'display-limits.json','display.json'),(stage/'web-stage-receipt.json','receipt.json'),(base/'accepted-preview-current.json','pointer.json'),(base/'coac250-unified-chapter-register-20261027b.json','register.json'),(base/'coac244-remaining26-closure-register-20261028.json','owner.json'),(base/'coac250-uncovered-chapter-continuation-register-20261027b.json','continuation.json')]:copy(src,name)
z=d/'167-preview.zip'
with zipfile.ZipFile(z,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for p in stage.rglob('*'):
  if p.is_file():archive.write(p,p.relative_to(stage).as_posix())
 archive.writestr('READ-ME.txt','Extract all files and open knowledge.html. Exact bounded author-fidelity display with explicit non-author review limitations. Original limitedUnknownOkay=false and uncertain preserved. Not formal active.\n')
with zipfile.ZipFile(z) as archive:assert archive.testzip() is None;assert 'knowledge.html' in archive.namelist()
refs.append({'source':str(stage),'local':z.name,'sha256':sha(z.read_bytes()),'bytes':z.stat().st_size})
(d/'package.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('Portable preview bytes:',z.stat().st_size)
