"""Independent replay of recorded witnesses and physical availability, no scorer."""
import pathlib,json,collections
D=pathlib.Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/conditional-value');read=lambda p:json.loads(p.read_text(encoding='utf8'));src=read(D/'inventory-inputs.json')['cases'];data=read(D/'witnesses.json');by={x['caseIndex']:x for x in src}
def tile(q):return (q-34)*9+4 if q>=34 else q
def complete(c):
 if sum(c)!=14:return False
 if sum(x==2 for x in c)==7:return True
 def melds(x):
  i=next((j for j,n in enumerate(x) if n),None)
  if i is None:return True
  if x[i]>=3:
   x[i]-=3
   if melds(x):x[i]+=3;return True
   x[i]+=3
  if i<27 and i%9<=6 and x[i+1] and x[i+2]:
   x[i]-=1;x[i+1]-=1;x[i+2]-=1
   if melds(x):x[i]+=1;x[i+1]+=1;x[i+2]+=1;return True
   x[i]+=1;x[i+1]+=1;x[i+2]+=1
  return False
 for i,n in enumerate(c):
  if n>=2:
   c[i]-=2
   if melds(c):c[i]+=2;return True
   c[i]+=2
 return False
n=0
for r in data['rows']:
 if r['scoreStatus']!='supported_helper_point':continue
 c=by[r['caseIndex']];candidate=next(z for z in c['candidates'] if z['actionRef']==r['actionRef']);hand=c['hand37'][:];u=c['unseen37'][:];root=candidate['variant'];assert hand[root]>0;hand[root]-=1
 for i,d in enumerate(r['drawVariants']):
  assert u[d]>0;u[d]-=1;hand[d]+=1
  if i==0 and len(r['drawVariants'])==2:
   q=r['intermediateDiscardVariant'];assert hand[q]>0;hand[q]-=1
 assert hand==r['completedHand37'] and sum(hand)==14 and r['winTile34']==tile(r['drawVariants'][-1]);z=[0]*34
 for i,q in enumerate(hand):z[tile(i)]+=q
 assert max(z)<=4 and complete(z[:]) and hand[34:]==r['retainedRedFives'] and r['point']>0 and r['point']%100==0;n+=1
assert n==data['scoringEvaluations']==22 and data['parityMismatch']==0
print('independent witness replay and structure PASS',n)
