"""Read-only health and preservation checks. Never writes annotation data."""
import json,hashlib,urllib.request,sys
from pathlib import Path
from datetime import datetime,timezone
here=Path(__file__).parent
phase=sys.argv[1]
base=Path('E:/AgentData/Coach/knowledge')
sha=lambda b:hashlib.sha256(b).hexdigest()
files={}
for root in [base/'human-annotations',base/'review',base/'processing/integration/accepted-content-preview-2026-10-28T16-50-25-203Z']:
    if root.name=='human-annotations': paths=[p for p in root.rglob('*') if p.is_file() and p.name!='server.lock']
    else: paths=[root/n for n in ['textbook-corpus.json','textbook-bodies.json','knowledge.html','mcp-config.json']]
    for p in paths: files[str(p)]={'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size}
http=[]
for url in ['http://127.0.0.1:8765/','http://127.0.0.1:8765/api/export','http://127.0.0.1:8766/knowledge.html','http://127.0.0.1:8767/knowledge.html']:
    with urllib.request.urlopen(url,timeout=15) as r:
        b=r.read();http.append({'url':url,'status':r.status,'bytes':len(b),'sha256':sha(b)})
for r in http:
    if r['url'].endswith('knowledge.html'):
        root=base/'review' if ':8767' in r['url'] else base/'processing/integration/accepted-content-preview-2026-10-28T16-50-25-203Z'
        assert r['sha256']==files[str(root/'knowledge.html')]['sha256']
out={'at':datetime.now(timezone.utc).isoformat(),'phase':phase,'files':files,'http':http,'newModelCalls':0}
if phase=='after':
    before=json.loads((here/'health-before.json').read_text(encoding='utf-8'))
    assert before['files']==files,'Protected library or human data changed during cleanup'
    out['allProtectedBytesUnchanged']=True
(here/('health-'+phase+'.json')).write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'phase':phase,'protectedFiles':len(files),'http':[{k:r[k] for k in ['url','status','bytes']} for r in http]}))
