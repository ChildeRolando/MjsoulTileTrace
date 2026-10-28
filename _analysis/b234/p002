"""Archive the actual isolated output and byte-preserved receipts."""
from pathlib import Path
import json,hashlib,shutil,zipfile
O=Path(__file__).resolve().parent;D=Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-cn234-text-scope-20261028')
sha=lambda b:hashlib.sha256(b).hexdigest()
dump=lambda p,x:p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
stage=D/'stage';files=[{'path':str(f.relative_to(stage)).replace('\\','/'),'sha256':sha(f.read_bytes())} for f in sorted(stage.rglob('*')) if f.is_file()]
dump(O/'stage-files.sha256.json',files)
with zipfile.ZipFile(O/'stage-snapshot.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in files:z.write(stage/f['path'],f['path'])
for f in O.iterdir():
 if f.is_file() and f.name!='files.sha256.json':shutil.copyfile(f,D/f.name)
shutil.copytree(O/'evidence',D/'evidence',dirs_exist_ok=True)
files=[{'path':str(f.relative_to(O)).replace('\\','/'),'sha256':sha(f.read_bytes())} for f in sorted(O.rglob('*')) if f.is_file() and f.name!='files.sha256.json']
dump(O/'files.sha256.json',files);shutil.copyfile(O/'files.sha256.json',D/'files.sha256.json')
out=O.parent/(O.name+'.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted(O.rglob('*')):
  if f.is_file():z.write(f,str(f.relative_to(O)).replace('\\','/'))
print(json.dumps({'manifestSha256':sha((O/'manifest.json').read_bytes()),'stageFiles':len(json.loads((O/'stage-files.sha256.json').read_text())),'archiveFiles':len(files),'packet':str(out),'packetSha256':sha(out.read_bytes())}))
