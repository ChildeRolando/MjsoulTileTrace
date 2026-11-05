"""Public-only structural proxies; never evaluates a discard or reads grading data."""
from pathlib import Path
import json,hashlib,itertools,urllib.parse,functools,collections
b=Path('E:/AgentData/Coach/llm-defense-ablation-20261104/sample-preparation-v2');p=Path('E:/AgentData/Coach/llm-defense-module-20261104/new200/basic');out=Path('E:/AgentData/Coach/llm-discard-order-final-form-20261106/public-preflight');h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sample=b/'sample-freeze.json';assert h(sample)=='47bbe56e72e9afec2ce3819c1fd9531d6d8f697c1609a113bc51ed24f7fdb59d';cases=json.loads(sample.read_text(encoding='utf8'))['cases']
def ti(tile):
 s=tile['id'];return 'mpsz'.index(s[1])*9+int(s[0])-1
def tid(i):return str(i%9+1)+'mps'[i//9] if i<27 else str(i-26)+'z'
@functools.lru_cache(None)
def partitions(counts,m,t,pair):
 if sum(counts)==0:return ((),) if (m,t,pair)==(0,0,0) else ()
 i=next(i for i,x in enumerate(counts) if x); a=list(counts); variants=[]
 def add(kind,indices,mm,tt,pp):
  v=a.copy()
  for j in indices:
   if v[j]==0:return
   v[j]-=1
  for tail in partitions(tuple(v),mm,tt,pp):variants.append(((kind,tuple(indices)),)+tail)
 if m>0:
  add('刻子',(i,i,i),m-1,t,pair)
  if i<27 and i%9<=6:add('顺子',(i,i+1,i+2),m-1,t,pair)
 if t>0 and i<27 and 1<=i%9<=6:add('两面',(i,i+1),m,t-1,pair)
 if pair>0:add('对子',(i,i),m,t,pair-1)
 return tuple(sorted(set(variants)))
rows=[]
for i,c in enumerate(cases):
 name=f"{i:03}-{c['caseId']}.json";bl=b/'blind'/name;bp=p/name;blind=json.loads(bl.read_text(encoding='utf8'));basic=json.loads(bp.read_text(encoding='utf8'));r=json.loads(blind['messages'][1]['content'])['raw'];assert basic['caseRef']==blind['caseRef'];actor=r['selfActor'];own=[m for m in r['melds'] if m['actor']==actor];rivers=r['rivers'];riichi=r['riichiStates'];assert len(rivers)==len(riichi)==4 and riichi[actor]['actor']==actor
 cand=basic['candidates']; matches=[]
 for x,y in itertools.combinations(cand,2):
  if x['status']=='available' and y['status']=='available' and x['shanten']==y['shanten'] and x['unseenTotal'] is not None and x['unseenTotal']==y['unseenTotal']:matches.append([x['actionRef'],y['actionRef']])
 early=len(rivers[actor])<=11 and all(z['status']=='none' for z in riichi if z['actor']!=actor);witness=[]
 if not own and r['windowKind']=='self_turn' and r['self']['currentDraw'] is not None:
  hand=r['self']['concealedTiles']+[r['self']['currentDraw']['tile']];counts=[0]*34
  for tile in hand:counts[ti(tile)]+=1
  assert len(hand)==14
  for suit in range(3):
   for low in (0,7):
    a=9*suit+low;d=a+1
    if counts[a]==0 or counts[d]==0:continue
    offered={}
    for row in cand:
     action=json.loads(urllib.parse.unquote(row['actionRef'][len('action:v1:'):]))
     offered.setdefault(ti({'id':action[1][0],'red':action[1][1]}),[]).append(row)
    if a not in offered or d not in offered:continue
    remain=counts.copy();remain[a]-=1;remain[d]-=1;parts=partitions(tuple(remain),2,2,1)
    if parts:
     decomps=[[[kind,[tid(j) for j in ids]] for kind,ids in part] for part in parts]
     witness.append({'edge':[tid(a),tid(d)],'refsA':[x['actionRef'] for x in offered[a]],'refsB':[x['actionRef'] for x in offered[d]],'basicPairs':[{'a':x['actionRef'],'b':y['actionRef'],'equalShantenUkeire':x['status']=='available' and y['status']=='available' and x['shanten']==y['shanten'] and x['unseenTotal']==y['unseenTotal'],'aShanten':x.get('shanten'),'bShanten':y.get('shanten'),'aUnseen':x.get('unseenTotal'),'bUnseen':y.get('unseenTotal'),'aDora':x.get('doraCount'),'bDora':y.get('doraCount')} for x in offered[a] for y in offered[d]],'decompositions':decomps})
 rows.append({'index':i,'caseId':c['caseId'],'caseRef':blind['caseRef'],'blindSha256':h(bl),'basicSha256':h(bp),'candidateCount':len(cand),'sameShantenUkeirePairs':len(matches),'earlyMiddleProxy':early,'selfRiverDiscards':len(rivers[actor]),'opponentRiichiStatuses':[z['status'] for z in riichi if z['actor']!=actor],'doraIndicators':r['doraIndicators'],'closedSelfTurn14':not own and r['windowKind']=='self_turn' and r['self']['currentDraw'] is not None,'sixBlockWitnesses':witness})
summary={'schema':'discard-order-public-preflight/v1','cases':len(rows),'candidates':sum(x['candidateCount'] for x in rows),'casesSameShantenUnseen':sum(x['sameShantenUkeirePairs']>0 for x in rows),'earlyMiddleProxyCases':sum(x['earlyMiddleProxy'] for x in rows),'closedSelfTurn14Cases':sum(x['closedSelfTurn14'] for x in rows),'sixBlockWitnessCases':sum(bool(x['sixBlockWitnesses']) for x in rows),'sixBlockWitnessEarlyMiddleCases':sum(bool(x['sixBlockWitnesses']) and x['earlyMiddleProxy'] for x in rows),'sixBlockWitnessEqualBasicCases':sum(any(z['equalShantenUkeire'] for w in x['sixBlockWitnesses'] for z in w['basicPairs']) for x in rows),'interpretation':'narrow structural resemblance only; not evidence both tiles should be discarded; no case excluded or tags sent to model','rows':rows};out.mkdir(exist_ok=True,parents=True);f=out/'public-preflight.json';f.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({k:v for k,v in summary.items() if k!='rows'},ensure_ascii=False));print('sha256',h(f))
