import json,gzip,hashlib,collections
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-preflight-20261106');H=lambda b:hashlib.sha256(b).hexdigest();sample=json.loads((P/'sample/sample-freeze.json').read_text(encoding='utf8'));corr=json.loads((P/'no-yaku-dora-correction.json').read_text(encoding='utf8'));assert corr['sampleSha256']==H((P/'sample/sample-freeze.json').read_bytes());cases={c['selectionIndex']:c for c in sample['cases']};cache={};seen=set();bad=0
for z in corr['records']:
 c=cases[z['caseIndex']];name=f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz";p=P/'run'/name;assert H(p.read_bytes())==corr['sourceEvidenceSha256'][name]
 if name not in cache:
  with gzip.open(p,'rt',encoding='utf8') as f:cache[name]=json.load(f)
 e=cache[name];root=e['roots'][z['rootIndex']];candidate=c['candidates'][z['rootIndex']];x=z['firstDraw'];b=next(b for b in root['branches'] if b['variant']==x);h=c['hand37'].copy();h[candidate['variant']]-=1;h[x]+=1;d=z['intermediateDiscard'];y=z['secondDraw']
 if d is None:assert y is None and b['trace']==z['traceSha256']
 else:
  disc=next(q for q in b['discards'] if q['variant']==d);o=next(q for q in disc['outcomes'] if q['variant']==y);assert o['trace']==z['traceSha256'];h[d]-=1;h[y]+=1
 tr=e['traces'][z['traceSha256']];assert tr['status']=='no_yaku' and tr['point']==0 and z['originalDoraCountInvalid'];k=(z['caseIndex'],z['rootIndex'],x,d,y);assert k not in seen;seen.add(k)
 meld=[]
 for m in c['ownMelds']:meld.extend(m['tiles'] if m['kind']=='ankan' else [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else []))
 def idx(t):return 'mpsz'.index(t['id'][1])*9+int(t['id'][0])-1
 def dor(i):return i+1 if i<27 and i%9<8 else i-8 if i<27 else i+1 if i<30 else 27 if i==30 else i+1 if i<33 else 31
 counts=h[:34]
 for i in range(3):counts[4+i*9]+=h[34+i]
 visible=sum(counts[dor(v)] for v in c['doraIndicators'])+sum(sum(idx(t)==dor(v) for t in meld) for v in c['doraIndicators']);red=sum(h[34:])+sum(t['red'] for t in meld);assert z['visibleDora']==visible and z['redDora']==red and z['actualDoraCount']==visible+red
 if tr['doraCount']!=visible+red:bad+=1
assert len(seen)==203 and bad==181
out={'version':'conditional-score-dora-correction-audit/v1','status':'pass','correctedPaths':len(seen),'originalFieldIncorrect':bad,'correctionSha256':H((P/'no-yaku-dora-correction.json').read_bytes()),'sourceAuditSha256':H((P/'arithmetic-audit-v2.json').read_bytes()),'checks':['each unique no-yaku path and trace bound to frozen sample/evidence','reconstructed indicator and retained-red dora from physical paths','original no-yaku trace doraCount explicitly invalid','no point or policy result changed'],'extraScoreCalls':0,'extraShapeCalls':0,'modelCalls':0,'mortalCalls':0};f=P/'dora-correction-audit.json';f.open('x',encoding='utf8').write(json.dumps(out,indent=2));print(json.dumps({'status':'pass','paths':len(seen),'mismatches':bad,'sha256':H(f.read_bytes())}))
