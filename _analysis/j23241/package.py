from pathlib import Path
import json, hashlib, zipfile
p=Path(__file__).resolve().parent
f=json.loads((p/'final.json').read_text(encoding='utf-8'))
stage=Path(f['preview']['destination'])
with zipfile.ZipFile(p/'232-preview.zip','w',zipfile.ZIP_DEFLATED) as z:
    for file in stage.rglob('*'):
        if file.is_file(): z.write(file,file.relative_to(stage).as_posix())
    for name in ['README.md','readback.json','rebuild.json','verification.json']:
        z.write(p/name,'evidence/'+name)
b=(p/'232-preview.zip').read_bytes()
(p/'package.json').write_text(json.dumps({'file':'232-preview.zip','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'newModelCalls':0},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}))
