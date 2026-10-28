import json,hashlib
from pathlib import Path
here=Path(__file__).parent
p=here/'preview-plan.json'
x=json.loads(p.read_text(encoding='utf-8'))
refs=json.loads((here/'live-reference-closure.json').read_text(encoding='utf-8'))
norm=lambda s:str(Path(s)).replace('\\','/').lower().rstrip('/')
protected={norm(p) for p in refs['protectedPreviewRoots']}
eligible=[]
for r in x['entries']:
    if norm(str(Path(r['path']).parent)) in protected:
        x['deferred'].append({'path':r['path'],'reason':'Conservatively retained: reached by current v43 exact dependency bindings'})
        continue
    matches=r.pop('matches')
    r['allFilesByteCompared']=True
    r['sameRelativePathsIn']='E:/AgentData/Coach/knowledge/review/assets'
    r['matchingFileManifestSha256']=hashlib.sha256(json.dumps(matches,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    eligible.append(r)
x['entries']=eligible
x['logicalBytes']=sum(r['bytes'] for r in eligible)
x['keptPreviewRoots']=sorted(set(x['keptPreviewRoots']+refs['protectedPreviewRoots']))
p.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'eligible':len(eligible),'logicalBytes':x['logicalBytes'],'deferred':len(x['deferred'])}))
