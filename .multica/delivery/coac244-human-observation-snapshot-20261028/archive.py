"""Freeze only derived evidence/scripts; never upload the raw queue, book, or images."""
from pathlib import Path
import json,shutil,zipfile
from observations import sha
O=Path(__file__).resolve().parent;D=Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-human-observation-snapshot-20261028')
names=['.gitattributes','capture.json','snapshot-files.json','observations.py','build.py','verify.py','check.py','checks.json','README.md','human-evidence.json','priority-paths.json','input-bindings.json']
manifest={'schema':'coac244-human-observation-packet/1','files':[{'path':n,'sha256':sha((O/n).read_bytes())} for n in names],'newModelCalls':0,'rawBookOrImagesIncluded':False}
(O/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for n in names+['manifest.json','archive.py']:shutil.copyfile(O/n,D/n)
out=O.parent/(O.name+'.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for n in names+['manifest.json','archive.py']:z.write(O/n,n)
print(json.dumps({'packet':str(out),'packetSha256':sha(out.read_bytes()),'manifestSha256':sha((O/'manifest.json').read_bytes()),'newModelCalls':0}))
