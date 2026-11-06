import json,gzip,hashlib
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106');H=lambda b:hashlib.sha256(b).hexdigest();sample=json.loads((P/'sample/sample-freeze.json').read_text(encoding='utf8'));records=[];fileHashes={}
def idx(t):return 'mpsz'.index(t['id'][1])*9+int(t['id'][0])-1
def dora(i):return i+1 if i<27 and i%9<8 else i-8 if i<27 else i+1 if i<30 else 27 if i==30 else i+1 if i<33 else 31
def meldtiles(m):return m['tiles'] if m['kind']=='ankan' else [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else [])
def calc(h,c):
 a=h[:34]
 for i in range(3):a[4+9*i]+=h[34+i]
 meld=[]
 for m in c['ownMelds']:meld.extend(meldtiles(m))
 ordinary=sum(a[dora(v)] for v in c['doraIndicators'])+sum(sum(idx(z)==dora(v) for z in meld) for v in c['doraIndicators']);red=sum(h[34:])+sum(z['red'] for z in meld);return ordinary,red
for c in sample['cases']:
 path=P/'run'/f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz"
 if not path.exists():continue
 fileHashes[path.name]=H(path.read_bytes())
 with gzip.open(path,'rt',encoding='utf8') as f:e=json.load(f)
 traces=e['traces']
 for ci,(root,candidate) in enumerate(zip(e['roots'],c['candidates'])):
  if root['status']!='available':continue
  h=c['hand37'].copy();h[candidate['variant']]-=1
  for b in root['branches']:
   x=b['variant'];hx=h.copy();hx[x]+=1
   if b.get('trace') and traces[b['trace']]['status']=='no_yaku':
    a,r=calc(hx,c);records.append({'caseIndex':c['selectionIndex'],'rootIndex':ci,'firstDraw':x,'intermediateDiscard':None,'secondDraw':None,'traceSha256':b['trace'],'visibleDora':a,'redDora':r,'actualDoraCount':a+r,'originalDoraCountInvalid':True})
   for d in b.get('discards',[]):
    hd=hx.copy();hd[d['variant']]-=1
    for o in d['outcomes']:
     if o['status']!='no_yaku':continue
     y=o['variant'];hy=hd.copy();hy[y]+=1;a,r=calc(hy,c);records.append({'caseIndex':c['selectionIndex'],'rootIndex':ci,'firstDraw':x,'intermediateDiscard':d['variant'],'secondDraw':y,'traceSha256':o['trace'],'visibleDora':a,'redDora':r,'actualDoraCount':a+r,'originalDoraCountInvalid':True})
assert len(records)==203 and sum(z['actualDoraCount']!=0 for z in records)==181
out={'version':'conditional-score-no-yaku-dora-correction/v1','status':'corrected_by_public_path_reconstruction','sampleSha256':H((P/'sample/sample-freeze.json').read_bytes()),'sourceEvidenceSha256':fileHashes,'reason':'original no-yaku trace returned before populating DoraCount; all no-yaku original doraCount values invalid','records':records,'scoreCalls':0,'shapeCalls':0,'modelCalls':0,'mortalCalls':0,'limitation':'correction derives dora from frozen public hand, meld and enumerated hypothetical draws/discards; it does not establish yaku or change conditional points'};f=P/'no-yaku-dora-correction.json';f.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,separators=(',',':')));print(json.dumps({'records':len(records),'originalZeroIncorrect':sum(z['actualDoraCount']!=0 for z in records),'sha256':H(f.read_bytes())}))
