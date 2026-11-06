import json,gzip,hashlib,collections
from pathlib import Path
N=Path('E:/AgentData/Coach/llm-conditional-score-full-preflight-20261106');O=Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106');H=lambda b:hashlib.sha256(b).hexdigest();new=json.loads((N/'sample/sample-freeze.json').read_text(encoding='utf8'));old=json.loads((O/'sample/sample-freeze.json').read_text(encoding='utf8'));cor=json.loads((O/'no-yaku-dora-correction.json').read_text(encoding='utf8'));fixed={(z['caseIndex'],z['rootIndex'],z['firstDraw'],z['intermediateDiscard'],z['secondDraw']):z for z in cor['records']};oldby={x['caseId']:x for x in old['cases']};matched=0;roots=0;oldDora=0;calls=collections.Counter();prev={};pathChecks=0
for c in new['cases']:
 f=N/'run'/f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz"
 with gzip.open(f,'rt',encoding='utf8') as q:z=json.load(q)
 now=z['summary']['counters'];delta={k:now[k]-prev.get(k,0) for k in now};prev=now
 if c['caseId'] not in oldby:continue
 matched+=1;calls.update(delta);prior=oldby[c['caseId']];p=O/'run'/f"{prior['selectionIndex']:03}-{prior['caseId']}-evidence.json.gz"
 with gzip.open(p,'rt',encoding='utf8') as q:a=json.load(q)
 assert [v['actionRef'] for v in z['roots']]==[v['actionRef'] for v in a['roots']]
 for ri,(x,y) in enumerate(zip(z['roots'],a['roots'])):
  for k in ('status','reason','numerator','denominator','winMassNumerator'):assert x.get(k)==y.get(k),(c['caseId'],k)
  roots+=1
  if x['status']!='available':continue
  assert len(x['branches'])==len(y['branches'])
  for xb,yb in zip(x['branches'],y['branches']):
   for k in ('variant','weight','status','bestDiscard','ties','pointMass','winMass'):assert xb.get(k)==yb.get(k),(c['caseId'],k)
   xv,yv=xb['variant'],yb['variant']
   if yb.get('trace'):
    nt=z['traces'][xb['trace']];ot=a['traces'][yb['trace']];assert nt['status']==ot['status'] and nt['point']==ot['point']
    if ot['status']=='no_yaku':
     v=fixed[(prior['selectionIndex'],ri,yv,None,None)];assert nt['doraCount']==v['actualDoraCount'];oldDora+=1
   xd,yd=xb.get('discards',[]),yb.get('discards',[]);assert len(xd)==len(yd)
   for xD,yD in zip(xd,yd):
    for k in ('variant','pointMass','winMass'):assert xD[k]==yD[k]
    assert len(xD['outcomes'])==len(yD['outcomes'])
    for xo,yo in zip(xD['outcomes'],yD['outcomes']):
     for k in ('variant','weight','status'):assert xo[k]==yo[k]
     pathChecks+=1
     if yo.get('trace'):
      nt=z['traces'][xo['trace']];ot=a['traces'][yo['trace']];assert nt['status']==ot['status'] and nt['point']==ot['point']
      if ot['status']=='no_yaku':
       v=fixed[(prior['selectionIndex'],ri,yv,yD['variant'],yo['variant'])];assert nt['doraCount']==v['actualDoraCount'];oldDora+=1
      else:
       for k in ('han','fu','yakumanTimes','yakuIds','division','winTile','isParent','doraCount','childPayment','parentPayment'):assert nt[k]==ot[k],(c['caseId'],k)
assert matched==20 and oldDora==len(fixed)==203
out={'version':'conditional-score-prior20-recompute-audit/v1','status':'pass','newSampleSha256':H((N/'sample/sample-freeze.json').read_bytes()),'oldSampleSha256':H((O/'sample/sample-freeze.json').read_bytes()),'oldDoraCorrectionSha256':H((O/'no-yaku-dora-correction.json').read_bytes()),'cases':matched,'rootCandidates':roots,'secondDrawOutcomesCompared':pathChecks,'correctedNoYakuPaths':oldDora,'countsRecomputedForPrior20':dict(calls),'checks':['root status and exact fractions match original20','first-draw policy, tie and full second-draw statuses/weights/points match','corrected no-yaku dora field matches independent original correction for all203 paths'],'extraScoreCalls':0,'extraShapeCalls':0,'modelCalls':0,'mortalCalls':0};f=N/'prior20-recompute-audit.json';f.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'status':'pass','cases':matched,'roots':roots,'noYakuCorrectedPaths':oldDora,'prior20Calls':dict(calls),'sha256':H(f.read_bytes())}))
