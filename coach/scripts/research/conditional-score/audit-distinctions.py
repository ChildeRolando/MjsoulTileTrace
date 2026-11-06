import json,gzip,collections,hashlib,itertools
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-full-preflight-20261106');D=Path('E:/AgentData/Coach/llm-two-draw-full-preflight-20261106/engineering/compact-packets.json');H=lambda b:hashlib.sha256(b).hexdigest();db=D.read_bytes();assert H(db)=='6949cc1d13b121bd633c6b56c88206e9d8a3047e46df90ffd24c6d4a3c0f7fcb';packets=json.loads(db)['packets'];sample=json.loads((P/'sample/sample-freeze.json').read_text(encoding='utf8'));summary=collections.Counter();cases=[]
for c in sample['cases']:
 f=P/'run'/f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz"
 if not f.exists():continue
 with gzip.open(f,'rt',encoding='utf8') as q:e=json.load(q)
 if e['summary']['status']!='complete':summary['incompleteScenesExcluded']+=1;continue
 packet=packets[c['caseIndex']];assert packet['caseId']==c['caseId'];tp=packet['packet'];summary['completeScenes']+=1;summary['completeCandidates']+=len(c['candidates'])
 if tp['status']!='available':summary['oldTwoDrawUnavailableScenes']+=1;continue
 assert [z['actionRef'] for z in tp['candidates']]==[z['actionRef'] for z in c['candidates']]==[z['actionRef'] for z in e['roots']];here=collections.Counter()
 for i,j in itertools.combinations(range(len(c['candidates'])),2):
  a,b=c['candidates'][i],c['candidates'][j];x,y=e['roots'][i],e['roots'][j];assert x['status']==y['status']=='available'
  ba={k:v for k,v in a['basic'].items() if k!='actionRef'};bb={k:v for k,v in b['basic'].items() if k!='actionRef'}
  if ba!=bb:continue
  here['sameFullBasicPairs']+=1
  ta,tb=tp['candidates'][i],tp['candidates'][j];assert ta['status']==tb['status']=='available'
  if ta['targets']!=tb['targets']:continue
  here['sameFullBasicAndTwoDrawPairs']+=1
  if x['numerator']*y['denominator']!=y['numerator']*x['denominator']:here['sameBasicTwoDrawDifferentConditionalPointPairs']+=1
  if x['winMassNumerator']*y['denominator']!=y['winMassNumerator']*x['denominator']:here['sameBasicTwoDrawDifferentSamePolicyWinmassPairs']+=1
 summary.update(here);cases.append({'caseIndex':c['caseIndex'],**here})
for k in ('sameFullBasicPairs','sameFullBasicAndTwoDrawPairs','sameBasicTwoDrawDifferentConditionalPointPairs','sameBasicTwoDrawDifferentSamePolicyWinmassPairs'):summary.setdefault(k,0)
out={'version':'conditional-score-public-distinction-audit/v1','status':'pass','sampleSha256':H((P/'sample/sample-freeze.json').read_bytes()),'runReceiptSha256':H((P/'run/receipt.json').read_bytes()),'priorTwoDrawPacketsSha256':H(db),'summary':dict(summary),'perScene':cases,'interpretation':'pairwise vector distinction only on fully complete scenes; not accuracy, preference, effect, EV or independence; multiple candidate pairs in a game are correlated','extraScoreCalls':0,'extraShapeCalls':0,'modelCalls':0,'mortalCalls':0};f=P/'public-distinction-audit-v2.json';f.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'summary':dict(summary),'sha256':H(f.read_bytes())}))
