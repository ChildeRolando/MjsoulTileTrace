import pathlib,json,hashlib,shutil
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent;I=O/'in';I.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(pathlib.Path(p).read_text('utf-8-sig'))
rows=[]
def take(p,digest=None):
 p=pathlib.Path(p);h=sha(p)
 if digest:assert h==digest,str(p)
 if any(x['originalPath']==str(p) for x in rows):return
 ext=p.suffix if len(p.suffix)<12 else '.bin';target=I/(h+ext)
 if not target.exists():shutil.copyfile(p,target)
 assert sha(target)==h;rows.append(dict(originalPath=str(p),archivePath=target.relative_to(O).as_posix(),sha256=h,bytes=p.stat().st_size))
for name in ['bound100.json','bound-points.json']:
 for f in load(O/name):take(f['path'],f['sha256'])
for key in ['100','159','242']:
 p=O/('receipt'+key+'.json')
 if p.exists():
  r=load(p);take(p);take(r['raw']['path'],r['raw']['sha256'])
  if r['sidecar']:take(r['sidecar']['path'],r['sidecar']['sha256'])
 for name in ['handoff','fidelity-evidence']:
  p=O/(name+key+'.json')
  if p.exists():take(p)
for p in [O/'consumer-manifest.json',O/'processes-first.json',O/'processes-second.json',O/'repair100.json']:
 if p.exists():take(p)
(O/'archive-manifest.json').write_bytes((json.dumps(dict(schema='coac249-bounded-next3-archive/1',files=rows),ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
print(json.dumps(dict(bindings=len(rows),uniqueFiles=len(list(I.iterdir())),bytes=sum(p.stat().st_size for p in I.iterdir()))))
