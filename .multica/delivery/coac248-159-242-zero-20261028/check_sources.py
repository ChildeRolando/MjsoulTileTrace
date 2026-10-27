"""Check captured assets only; no network, OCR, model calls, or candidate edits."""
import hashlib,json,pathlib
import numpy as np
from PIL import Image
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
D=R/'integration/coac244-next3-zero-20261028'
L=pathlib.Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
packets={n:load(D/f'{n}-point-packet.json') for n in ['159','242']}
targets={n:Image.open(p['originalImage']['path']).convert('RGB') for n,p in packets.items()}
samples={n:np.asarray(im.resize((64,64),Image.Resampling.NEAREST)).astype('float32') for n,im in targets.items()}
roots=[R/'assets',*sorted((R/'web-sources/v1').glob('*/assets'))]
paths=sorted({p for root in roots for p in root.iterdir() if p.is_file()})
near={n:[] for n in packets};header_counts={};errors=[];eligible={n:0 for n in packets}
for root in roots:header_counts[str(root)]=sum(p.parent==root for p in paths)
for path in paths:
 try:
  with Image.open(path) as im:
   for n,t in targets.items():
    w,h=im.size;tw,th=t.size
    if w<tw or h<th or abs(w/h-tw/th)>0.025:continue
    eligible[n]+=1
    rgb=im.convert('RGB')
    score=float(np.abs(np.asarray(rgb.resize((64,64),Image.Resampling.NEAREST)).astype('float32')-samples[n]).mean())
    if score<10:
     near[n].append({'path':str(path),'sha256':sha(path),'nativeSize':[w,h],
      'comparisonSampleMAE':score,'exactRGBA':im.convert('RGBA').tobytes()==t.convert('RGBA').tobytes() if im.size==t.size else False})
 except Exception as e:errors.append({'path':str(path),'error':str(e)})
out={'schema':'coac248-captured-source-image-search/1','scope':header_counts,
 'method':'Read captured PDF/web original asset headers; for same-aspect assets at least original dimensions, compare nearest-neighbor64x64 RGB samples. Similarity is only a discovery filter, not proof of source identity, clarity, or tile rank. No search thumbnail is saved or supplied as new evidence.',
 'capturedAssetFiles':len(paths),'eligible':eligible,'errors':errors,
 'nearMatches':{n:sorted(items,key=lambda x:x['comparisonSampleMAE']) for n,items in near.items()},
 'noNetwork':True,'noModel':True,'noOCR':True,'candidateModified':False}
write(L/'captured-search.json',out)
print(json.dumps({'files':len(paths),'eligible':eligible,'near':out['nearMatches'],'errors':len(errors)},ensure_ascii=False))
