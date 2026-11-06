import json,hashlib,collections
from pathlib import Path
D=Path('E:/AgentData/Coach/llm-conditional-score-full-preflight-20261106');P=D/'sample';old=Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/conditional-value/inventory-inputs.json');pub=Path('E:/AgentData/Coach/llm-two-draw-full-preflight-20261106/engineering/blind-inputs.json');root=Path('E:/AgentData/Coach/llm-defense-ablation-20261104/sample-preparation-v2');basic=Path('E:/AgentData/Coach/llm-defense-module-20261104/new200');H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sha=lambda s:hashlib.sha256(s.encode()).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf8'))
assert H(D/'preflight-design.json')=='79e20bbfc3262f1412b7b354a22c4deba0b76569a8635e4fcf509e08954cfe29' and H(pub)=='0a6552c294380539b57c7d12d5d959ce61362759991513c1b06368d0375e93f8' and H(old)=='e0455ada262db4069cbc4908461dba89f28d5e8d93a3d1f529a9aef6256c294d';inventory=read(old)['cases'];source=read(pub)['cases'];sample=read(root/'sample-freeze.json');proj=read(root/'projection-receipt.json');prec=read(basic/'preflight.json');assert len(inventory)==len(source)==len(sample['cases'])==200
by=[[],[]]
for x,z in zip(inventory,source):
 assert x['caseIndex']==z['index'] and x['caseId']==z['caseId'] and [v['actionRef'] for v in x['candidates']]==[v['actionRef'] for v in z['candidates']]
 vals=[c['basic']['shanten'] for c in x['candidates'] if c['basic']['status']=='available'];
 if vals and min(vals)<=1:by[0 if x['ownMeldCount']==0 else 1].append(x)
assert list(map(len,by))==[44,35]
chosen=sorted([(group,x) for group,rows in enumerate(by) for x in rows],key=lambda z:z[1]['caseIndex'])
assert len(chosen)==79
old20=read(Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106/sample/sample-freeze.json'));oldIds={z['caseId'] for z in old20['cases']};assert len(oldIds)==20 and oldIds.issubset({x['caseId'] for _,x in chosen})
out=[];seen=set()
for i,(group,x) in enumerate(chosen):
 ix=x['caseIndex'];c=sample['cases'][ix];name=f"{ix:03}-{x['caseId']}.json";bp=root/'blind'/name;ap=basic/'basic'/name;assert H(bp)==x['blindSha256']==proj['results'][ix]['blindSha256'] and H(ap)==x['basicSha256']==prec['results'][ix]['basicSha256'];blind=read(bp);pk=read(ap);raw=json.loads(blind['messages'][1]['content'])['raw'];actor=raw['selfActor'];meld=[m for m in raw['melds'] if m['actor']==actor];assert len(meld)==x['ownMeldCount'] and raw['roundWind']==x['roundWind'] and raw['seatWinds'][actor]==x['selfWind'] and (raw['dealer']==actor)==x['dealer'];assert [p['actionRef'] for p in pk['candidates']]==[z['actionRef'] for z in x['candidates']];assert set(c['nativeLegalIndices'])=={z['variant'] for z in x['candidates']};assert c['gameId'] not in seen;seen.add(c['gameId']);red=raw['ruleSet']['redFives'];vis=[];hand=raw['self']['concealedTiles']+([raw['self']['currentDraw']['tile']] if raw['self']['currentDraw'] else []);vis.extend(hand);vis.extend(raw['doraIndicators']);called={m['calledDiscardEventRef']:m['meldRef'] for m in raw['melds'] if m['kind']!='ankan'}
 def mt(m):return m['tiles'] if m['kind']=='ankan' else [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else [])
 for m in raw['melds']:vis.extend(mt(m))
 for river in raw['rivers']:
  for z in river:
   if z['calledByRef'] is None:vis.append(z['tile'])
   else:assert called[z['sourceRef']]==z['calledByRef']
 def typ(t):
  z='mpsz'.index(t['id'][1])*9+int(t['id'][0])-1;return 34+z//9 if t['red'] else z
 u=[4]*34+[red['man'],red['pin'],red['sou']]
 for k in range(3):u[4+9*k]-=u[34+k]
 for t in vis:u[typ(t)]-=1
 h=[0]*37
 for t in hand:h[typ(t)]+=1
 assert u==x['unseen37'] and h==x['hand37'] and min(u)>=0
 chosenRow={k:v for k,v in x.items() if k!='selected'};chosenRow.update({'selectionIndex':i,'stratum':'no_self_meld' if group==0 else 'self_meld','prior20':x['caseId'] in oldIds,'gameId':c['gameId'],'sourceHash':c['sourceHash'],'nativeLegalIndices':c['nativeLegalIndices'],'ruleSet':raw['ruleSet'],'ownMelds':meld,'visibleIndicators':raw['doraIndicators'],'blindRaw':raw});out.append(chosenRow)
result={'version':'conditional-score-full-public-sample-freeze/v1','sourceSha256':H(pub),'inventorySha256':H(old),'selection':'all original fixed200 scenes with public min basic <=1, original case order'
,'prior20SampleSha256':H(Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106/sample/sample-freeze.json')),'cases':out,'scoreCallsBeforeFreeze':0,'modelCalls':0,'mortalCalls':0};path=P/'sample-freeze.json';path.open('x',encoding='utf8').write(json.dumps(result,ensure_ascii=False,separators=(',',':')));mask=[]
selected={z['caseIndex']:z for z in out}
for i,x in enumerate(inventory):
 y=selected.get(i);mask.append({'caseIndex':i,'caseId':x['caseId'],'status':'eligible_numeric' if y else 'outside_public_prefilter','selectionIndex':y['selectionIndex'] if y else None,'candidateCount':len(x['candidates'])})
maskPath=D/'applicability-mask.json';maskPath.open('x',encoding='utf8').write(json.dumps({'version':'conditional-score-applicability-mask/v1','sampleSha256':H(path),'cases':mask,'eligible':79,'outside':121},ensure_ascii=False,separators=(',',':')))
print(json.dumps({'cases':len(out),'candidates':sum(len(x['candidates']) for x in out),'sampleSha256':H(path),'maskSha256':H(maskPath),'prior20':len(oldIds)}))
