import json,gzip,hashlib,collections
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106');H=lambda b:hashlib.sha256(b).hexdigest();sb=(P/'sample/sample-freeze.json').read_bytes();sample=json.loads(sb);cb=(P/'no-yaku-dora-correction.json').read_bytes();correction=json.loads(cb);assert correction['sampleSha256']==H(sb);fix={}
for z in correction['records']:
 key=(z['caseIndex'],z['rootIndex'],z['firstDraw'],z['intermediateDiscard'],z['secondDraw']);assert key not in fix;fix[key]=z
used=set();stats=collections.Counter()
for c in sample['cases']:
 p=P/'run'/f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz"
 if not p.exists():continue
 assert H(p.read_bytes())==correction['sourceEvidenceSha256'][p.name]
 with gzip.open(p,'rt',encoding='utf8') as f:e=json.load(f)
 for ri,r in enumerate(e['roots']):
  if r['status']!='available':assert r['numerator'] is None and r['winMassNumerator'] is None;continue
  N=sum(c['unseen37']);num=win=0
  for b in r['branches']:
   x=b['variant'];nx=b['weight'];assert nx==c['unseen37'][x]
   if b['status']=='supported':
    t=e['traces'][b['trace']];assert t['status']=='supported' and t['point']>0;pm=(N-1)*t['point'];wm=N-1
   else:
    assert b['status']=='continued'
    if b.get('trace') and e['traces'][b['trace']]['status']=='no_yaku':
     k=(c['selectionIndex'],ri,x,None,None);z=fix[k];assert z['traceSha256']==b['trace'] and z['originalDoraCountInvalid'];used.add(k)
    opts=[]
    for d in b['discards']:
     pm0=wm0=0
     for o in d['outcomes']:
      if o['status']=='supported':
       t=e['traces'][o['trace']];assert t['status']=='supported' and t['point']>0;pm0+=o['weight']*t['point'];wm0+=o['weight']
      elif o['status']=='no_yaku':
       k=(c['selectionIndex'],ri,x,d['variant'],o['variant']);z=fix[k];assert z['traceSha256']==o['trace'] and z['originalDoraCountInvalid'] and e['traces'][o['trace']]['point']==0;used.add(k)
      else:assert o['status']=='not_complete'
     assert pm0==d['pointMass'] and wm0==d['winMass'];opts.append((d['variant'],pm0,wm0))
    mx=max(v[1] for v in opts);ties=[v[0] for v in opts if v[1]==mx];assert b['ties']==ties and b['bestDiscard']==ties[0];selected=next(v for v in opts if v[0]==ties[0]);pm,wm=selected[1:]
   assert b['pointMass']==pm and b['winMass']==wm;num+=nx*pm;win+=nx*wm
  assert r['numerator']==num and r['winMassNumerator']==win and r['denominator']==N*(N-1);stats['rootsMatched']+=1
assert used==set(fix) and len(used)==203
out={'version':'conditional-score-point-equivalence-audit/v1','status':'pass','sampleSha256':H(sb),'correctionSha256':H(cb),'correctedNoYakuPaths':len(used),'availableRootFractionsMatched':stats['rootsMatched'],'checks':['all corrected no-yaku paths retain known no-yaku point zero','all unchanged supported point values bound to original frozen trace','each intermediate-discard point and same-policy winmass reconstructed','same precommitted ties and first-draw mass reconstruct exact original numerator and winmass','incomplete roots remain null and are not compared'],'scoreCalls':0,'shapeCalls':0,'modelCalls':0,'mortalCalls':0,'limits':'arithmetic equivalence only; not independent yaku or upstream scoring truth'};f=P/'point-equivalence-audit.json';f.open('x',encoding='utf8').write(json.dumps(out,indent=2));print(json.dumps({'status':'pass','correctedPaths':len(used),'rootFractions':stats['rootsMatched'],'sha256':H(f.read_bytes())}))
