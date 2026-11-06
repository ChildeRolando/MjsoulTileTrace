import json,gzip,hashlib,collections,sys
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106');sample=json.loads((P/'sample/sample-freeze.json').read_text(encoding='utf8'));receipt=json.loads((P/'run/receipt.json').read_text(encoding='utf8'));H=lambda b:hashlib.sha256(b).hexdigest();assert len(sample['cases'])==receipt['cases']==20;stats=collections.Counter();witnessChecks=0

def collapse(h):
 a=h[:34]
 for i in range(3):a[4+9*i]+=h[34+i]
 return a
def idx(t):return 'mpsz'.index(t['id'][1])*9+int(t['id'][0])-1
def dora(i):return i+1 if i<27 and i%9<8 else i-8 if i<27 else i+1 if i<30 else 27 if i==30 else i+1 if i<33 else 31
def meldtiles(m):return m['tiles'] if m['kind']=='ankan' else [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else [])
def checktrace(id,traces,h,win,c):
 global witnessChecks
 t=traces[id];raw=json.dumps(t,ensure_ascii=False,separators=(',',':')).encode();assert H(raw)==id
 assert t['winTile']==(4+9*(win-34) if win>=34 else win) and t['isParent']==c['dealer']
 if t['status']=='no_yaku':assert t['point']==0 and t['reason']=='all_supported_divisions_no_yaku';return 0
 assert t['status']=='supported' and t['point'] and t['point']>0
 assert t['point']==(3*t['childPayment'] if t['isParent'] else 2*t['childPayment']+t['parentPayment'])
 if t['yakumanTimes']>0:assert t['han'] is None and t['fu'] is None
 else:assert isinstance(t['han'],int) and t['han']>0 and isinstance(t['fu'],int) and t['fu']>0
 assert t['yakuIds']==sorted(t['yakuIds']) and len(t['yakuIds'])>0
 a=collapse(h);extra=[]
 for m in c['ownMelds']:extra.extend(meldtiles(m))
 doracount=sum(a[dora(v)] for v in c['doraIndicators'])+sum(sum(idx(z)==dora(v) for z in extra) for v in c['doraIndicators'])+sum(h[34:])+sum(z['red'] for z in extra)
 assert t['doraCount']==doracount
 div=t['division']
 if div['IsChiitoi']:assert not c['ownMelds'] and sum(z==2 for z in a)==7 and sum(a)==14
 else:
  part=[0]*34;part[div['PairTile']]+=2
  for k in (div['KotsuTiles'] or []):part[k]+=3
  for k in (div['ShuntsuFirstTiles'] or []):part[k]+=1;part[k+1]+=1;part[k+2]+=1
  assert part==a
 witnessChecks+=1;return t['point']
for case in sample['cases']:
 f=P/'run'/f"{case['selectionIndex']:03}-{case['caseId']}-evidence.json.gz"
 if not f.exists():assert receipt['halted'];continue
 with gzip.open(f,'rt',encoding='utf8') as stream:e=json.load(stream)
 roots=e['roots'];traces=e['traces'];u=case['unseen37'];N=sum(u);assert e['summary']['caseId']==case['caseId'] and [r['actionRef'] for r in roots]==[r['actionRef'] for r in case['candidates']]
 for c,r in zip(case['candidates'],roots):
  stats[r['status']]+=1
  if r['status']!='available':assert r['numerator'] is None and r['denominator'] is None and r['winMassNumerator'] is None;continue
  assert r['denominator']==N*(N-1) and len(r['branches'])==sum(n>0 for n in u);hand=case['hand37'].copy();hand[c['variant']]-=1;num=wm=0
  for b in r['branches']:
   x=b['variant'];nx=u[x];assert nx>0 and b['weight']==nx;hx=hand.copy();hx[x]+=1
   if b['status']=='supported':
    point=checktrace(b['trace'],traces,hx,x,case);assert b['bestDiscard'] is None and not b.get('discards') and b['pointMass']==(N-1)*point and b['winMass']==N-1
   else:
    assert b['status']=='continued';
    if b.get('trace'):assert checktrace(b['trace'],traces,hx,x,case)==0
    discards=b['discards'];assert [z['variant'] for z in discards]==[i for i,n in enumerate(hx) if n>0]
    for d in discards:
     hd=hx.copy();hd[d['variant']]-=1;points=wins=0;expected=[(y,n-(y==x)) for y,n in enumerate(u) if n-(y==x)>0];assert [(q['variant'],q['weight']) for q in d['outcomes']]==expected
     for o in d['outcomes']:
      y=o['variant'];hy=hd.copy();hy[y]+=1;z=o['status']
      if z=='supported':point=checktrace(o['trace'],traces,hy,y,case);points+=o['weight']*point;wins+=o['weight']
      elif z=='no_yaku':assert checktrace(o['trace'],traces,hy,y,case)==0
      else:assert z=='not_complete' and 'trace' not in o
     assert points==d['pointMass'] and wins==d['winMass']
    mx=max(z['pointMass'] for z in discards);ties=[z['variant'] for z in discards if z['pointMass']==mx];assert b['ties']==ties and b['bestDiscard']==ties[0] and b['pointMass']==mx;chosen=next(z for z in discards if z['variant']==ties[0]);assert b['winMass']==chosen['winMass']
   num+=nx*b['pointMass'];wm+=nx*b['winMass']
  assert r['numerator']==num and r['winMassNumerator']==wm and 0<=wm<=r['denominator']
out={'version':'conditional-score-arithmetic-audit/v1','status':'pass','sampleSha256':H((P/'sample/sample-freeze.json').read_bytes()),'runReceiptSha256':H((P/'run/receipt.json').read_bytes()),'cases':len(sample['cases']),'candidateStatuses':dict(stats),'completionTraceChecks':witnessChecks,'checks':['full outcome enumeration and 37-class no-replacement weights','same-policy winmass and max outside second-draw sum with canonical ties','sample/native candidate order and denominator','trace digest, physical hand division, red/dora and individual payment sum','unknown or incomplete candidates do not have numerical fractions'],'limitations':['does not independently recompute helper yaku or shanten','does not independently establish scores as full rules truth'],'extraScoreCalls':0,'extraShapeCalls':0,'modelCalls':0,'mortalCalls':0};path=P/'arithmetic-audit.json';path.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'status':'pass','candidateStatuses':dict(stats),'completionTraceChecks':witnessChecks,'sha256':H(path.read_bytes())},ensure_ascii=False))
