import subprocess,hashlib,json
from pathlib import Path
prefix='.multica/delivery/coac244-repair100-20261028/'
files=subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0')
rows=[]
for name in files:
 if not name.startswith(prefix):continue
 staged=subprocess.check_output(['git','show',':'+name]);actual=Path(name).read_bytes()
 assert staged==actual,name
 rows.append(dict(path=name,sha256=hashlib.sha256(actual).hexdigest()))
p=Path(prefix)/'git-byte-verification.json';p.write_text(json.dumps(dict(status='passed',files=rows,checked=len(rows)),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(status='passed',checked=len(rows))))
