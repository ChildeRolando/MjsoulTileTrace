"""Conservatively pin preview directories reached by current exact bindings."""
import json,re
from pathlib import Path
base=Path('E:/AgentData/Coach/knowledge/processing/integration')
queue=[base/'specific-web-variant-selection.v43.json',base/'build-accepted-preview.mjs',base/'coac250-formal-v43-20261029/release-inputs.json']
seen=set();refs=set();preview_roots=set();skipped=[]
def add(s,parent):
    if len(s)>800:return
    s=s.replace('\\','/')
    if re.match(r'^[A-Za-z]:/',s):p=Path(s)
    elif s.startswith('./') or s.startswith('../'):p=(parent.parent/s).resolve()
    else:return
    if not p.is_file():return
    refs.add(str(p))
    m=re.search(r'accepted-content-preview-[0-9TZ-]+',str(p))
    if m:preview_roots.add(str(base/m.group()))
    if p.suffix in ['.json','.mjs','.py'] and '/calls/' not in s:queue.append(p)
def strings(x,parent):
    if isinstance(x,str):add(x,parent)
    elif isinstance(x,dict):
        for v in x.values():strings(v,parent)
    elif isinstance(x,list):
        for v in x:strings(v,parent)
while queue:
    p=queue.pop();key=str(p).lower()
    if key in seen:continue
    seen.add(key)
    if p.stat().st_size>10_000_000:skipped.append(str(p));continue
    try:text=p.read_text(encoding='utf-8-sig')
    except UnicodeError:continue
    if p.suffix=='.json':
        try:strings(json.loads(text),p)
        except json.JSONDecodeError:skipped.append(str(p))
    else:
        for s in re.findall(r"['\"]([^'\"\n]+)['\"]",text):add(s,p)
out={'scanned':len(seen),'paths':sorted(refs),'protectedPreviewRoots':sorted(preview_roots),'notParsedButRetained':skipped,'allOtherSourceAuditRuntimeDirectoriesRetained':True}
Path(__file__).with_name('live-reference-closure.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'scanned':len(seen),'references':len(refs),'protectedPreviews':len(preview_roots),'notParsed':len(skipped)}))
