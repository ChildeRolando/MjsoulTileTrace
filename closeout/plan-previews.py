"""Identify byte-identical redundant image copies, retaining old receipts/stages."""
import json,hashlib,os,stat
from pathlib import Path
here=Path(__file__).parent
base=Path('E:/AgentData/Coach/knowledge/processing/integration')
formal=Path('E:/AgentData/Coach/knowledge/review')
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
keep={Path(load(base/'accepted-preview-current.json')['output'])}
rollback=load(base/'coac250-p250-final-20261029/rollback-v42/pointer.json')
keep.add(Path(rollback['output']))
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
donors={}
for p in (formal/'assets').rglob('*'):
    if p.is_file(): donors[str(p.relative_to(formal/'assets'))]={'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)}
entries=[];deferred=[]
for i,preview in enumerate(sorted(base.glob('accepted-content-preview-*'))):
    if preview in keep or not (preview/'assets').is_dir():continue
    directory=preview/'assets'; files=[];bad=[]
    for root,dirs,names in os.walk(directory,followlinks=False):
        for n in list(dirs):
            p=Path(root)/n
            if p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:bad.append(str(p));dirs.remove(n)
        for n in names:
            p=Path(root)/n;rel=str(p.relative_to(directory));d=donors.get(rel)
            if not d or p.stat().st_size!=d['bytes'] or sha(p)!=d['sha256']: bad.append(rel)
            else: files.append({'relative':rel,**d})
    if bad:deferred.append({'path':str(directory),'reason':'Not a fully byte-identical duplicate of formal assets','unmatched':bad})
    elif files: entries.append({'path':str(directory),'ownerIssue':'COAC-250','bytes':sum(f['bytes'] for f in files),'files':len(files),'reason':'Obsolete preview top-level image copies; every relative path and SHA matches formal library. Old receipt/corpus/stages kept; original source images retained. This preview is retired, not a user entrance.','matches':files})
    if i%10==0:print('checked preview',i,'eligible',len(entries),flush=True)
out={'requiresFormalReleaseAcceptance':True,'keptPreviewRoots':[str(p) for p in keep],'entries':entries,'deferred':deferred,'logicalBytes':sum(x['bytes'] for x in entries)}
(here/'preview-plan.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'directories':len(entries),'logicalBytes':out['logicalBytes'],'deferred':len(deferred)}))
