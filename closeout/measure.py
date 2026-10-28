import sys, json
from pathlib import Path
exec((Path(__file__).parent/'inventory.py').read_text(encoding='utf-8').split('rows=[]')[0])

rows=json.loads((Path(__file__).parent/'runtime-inventory.json').read_text(encoding='utf-8'))['rows']
parts=[]
for i,r in enumerate(rows):
    p=Path(r['path'])/'codex-home'
    if not p.exists(): continue
    parts.append({'path':str(p),'parts':{c.name:size(c) for c in p.iterdir() if c.is_dir()}})
(Path(__file__).parent/'runtime-parts.json').write_text(json.dumps(parts,ensure_ascii=False,indent=2),encoding='utf-8')
print({n:sum(r['parts'].get(n,{}).get('bytes',0) for r in parts) for n in sorted({n for r in parts for n in r['parts']})})
previews=[]
for p in Path('E:/AgentData/Coach/knowledge/processing/integration').glob('accepted-content-preview-*'):
    if p.is_dir(): previews.append({'path':str(p),**size(p)})
(Path(__file__).parent/'preview-inventory.json').write_text(json.dumps(previews,ensure_ascii=False,indent=2),encoding='utf-8')
print('previews',len(previews),'bytes',sum(r['bytes'] for r in previews))
