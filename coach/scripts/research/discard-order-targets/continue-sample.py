import hashlib,json,subprocess,sys,functools,os,traceback
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-discard-order-final-form-20261106/target-sample'); ROOT=Path(__file__).parent; FRAME=P/'final-source-frame.json';SEED='2026110603'; H=lambda b:hashlib.sha256(b).hexdigest(); SHA=lambda s:H(s.encode()); frame=json.loads(FRAME.read_text(encoding='utf-8')); assert frame['seed']==SEED and H(FRAME.read_bytes())=='52ed8fa0bddff479fc19a294e60dd1337d8a730c77b1e9e5fd0213687f66d2e7'
@functools.lru_cache(None)
def parts(counts,m,t,p):
 if not sum(counts):return ((),) if (m,t,p)==(0,0,0) else ()
 i=next(j for j,n in enumerate(counts) if n); result=[]
 def add(kind,inds,mm,tt,pp):
  c=list(counts)
  for j in inds:
   if not c[j]:return
   c[j]-=1
  for tail in parts(tuple(c),mm,tt,pp):result.append(((kind,tuple(inds)),)+tail)
 if m:
  add('triplet',(i,i,i),m-1,t,p)
  if i<27 and i%9<=6:add('sequence',(i,i+1,i+2),m-1,t,p)
 if t and i<27 and 1<=i%9<=6:add('ryanmen',(i,i+1),m,t-1,p)
 if p:add('pair',(i,i),m,t,p-1)
 return tuple(sorted(set(result)))
def tid(v):
 if v[0] in '123456789' and len(v)>1 and v[1] in 'mps':return 'mps'.index(v[1])*9+int(v[0])-1
 return 27+{'E':0,'S':1,'W':2,'N':3,'P':4,'F':5,'C':6}[v]
def name(i):return str(i%9+1)+'mps'[i//9] if i<27 else str(i-26)+'z'
def shapes(hand):
 if len(hand)!=14:return []
 c=[0]*34
 for v in hand:c[tid(v)]+=1
 out=[]
 for suit in range(3):
  for low in (0,7):
   a=suit*9+low;b=a+1
   if c[a] and c[b]:
    d=c.copy();d[a]-=1;d[b]-=1;w=parts(tuple(d),2,2,1)
    if w:out.append(([name(a),name(b)],[[[kind,[name(j) for j in ids]] for kind,ids in z] for z in w]))
 return out
def send(p,x):
 p.stdin.write(json.dumps(x,ensure_ascii=False)+'\n');p.stdin.flush();s=p.stdout.readline()
 if not s:raise RuntimeError('child_exited:'+str(p.poll()))
 v=json.loads(s)
 if v.get('ok') is False:raise RuntimeError('validator_failed:'+v['error'])
 return v
oldpath=P/'scan-receipt.json'; old=json.loads(oldpath.read_text(encoding='utf8')); assert H(oldpath.read_bytes())=='ebcc9ca5a3e6a6ffbc729072b075413d1fc454acf150231264939e6b84e403c0' and old['eligibleIndependentGames']==12 and old['publicWindows']==20000
assert H((P.parent/'research-extension-02.json').read_bytes())=='bc0c40ee70b235ffaf0894cc6b77498c519defd81f5e0f19c65e1db39f813896'
assert H((P/'final-shortfall-receipt.json').read_bytes())=='3eb83fa6ce12a690eaf0c55e02fbbd7ef8c2238f6044a377070d955cccd5f0ee'
plan={'version':'target-sampling-continuation-plan/v1','frameSha256':H(FRAME.read_bytes()),'seed':SEED,'gameOrder':'frame sha256 seed|game|gameId:sourceHash','windowOrder':'sha256(seed|window|gameId|actor|ordinal|edge), ascending over all eligible actor/window/pairs in completed game','windowCount':'every tsumo event in candidate game before any shape filter, including later riichi/called hands; stop before processing distinct window 200001; do not accept partially scanned game','gameLimit':2000,'windowLimit':200000,'previousDistinctWindows':20000,'previousCompleteWindows':19495,'previousCompletedGames':40,'extensionSha256':'bc0c40ee70b235ffaf0894cc6b77498c519defd81f5e0f19c65e1db39f813896','repeatAccounting':'first 505 windows of game 41 reprocessed, calls separately counted','sourceContentAllowed':'per-window own hand and public prefix only; source bytes may be read to decompress/hash; no future action or outcome contributes to any earlier eligibility','modelCalls':0,'mortalScoreCallsBeforeFreeze':0,'code':{f.name:H(f.read_bytes()) for f in [Path(__file__),ROOT/'validate-window.mjs',ROOT/'read-one.mjs']}}
(P/'continuation-plan.json').open('x',encoding='utf-8').write(json.dumps(plan,ensure_ascii=False,indent=2));reader=subprocess.Popen(['node',str(ROOT/'read-one.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf-8',bufsize=1);validator=subprocess.Popen(['node',str(ROOT/'validate-window.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf-8',bufsize=1);screen=(P/'continuation-screening.jsonl').open('x',encoding='utf8',buffering=1);qual=P/'qualifying';assert qual.is_dir();nwin=19495;ngames=40;nshape=0;accepted=list(old['eligible']);repeated={'publicWindows':0,'shapePairs':0,'ruleCalls':0,'helperCalls':0};error=None;stop='frame_exhausted';counts=None
try:
 for item in frame['candidates'][40:2000]:
  ngames+=1;source=send(reader,item)['raw']; hands=[[],[],[],[]];meld=[0]*4;rivers=[0]*4;riichi=[False]*4;roundord=-1;eligible=[];truncated=False
  for ordinal,line in enumerate(source.splitlines()):
   e=json.loads(line);typ=e.get('type'); actor=e.get('actor')
   if typ=='start_kyoku':roundord+=1;hands=[list(z) for z in e['tehais']];meld=[0]*4;rivers=[0]*4;riichi=[False]*4
   elif typ=='tsumo':
    if nwin>=200000:truncated=True;stop='public_window_limit';break
    nwin+=1;hands[actor].append(e['pai']);isrepeat=nwin<=20000
    if isrepeat:repeated['publicWindows']+=1
    if meld[actor] or rivers[actor]>11 or any(riichi):continue
    for edge,w in shapes(hands[actor]):
     nshape+=1
     if isrepeat:repeated['shapePairs']+=1
     req={**item,'ordinal':ordinal,'roundOrdinal':roundord,'actor':actor,'edge':edge};v=send(validator,req);r=v['result']
     if isrepeat:
      repeated['ruleCalls']+=v['calls']['rule']-v['before']['rule'];repeated['helperCalls']+=v['calls']['helper']-v['before']['helper']
     if r['eligible']:
      rank=SHA(SEED+'|window|'+item['gameId']+'|'+str(actor)+'|'+str(ordinal)+'|'+'-'.join(edge));eligible.append({'rank':rank,'request':req,'witness':w,'result':r})
   elif typ=='dahai':hands[actor].remove(e['pai']);rivers[actor]+=1
   elif typ=='reach':riichi[actor]=True
   elif typ in ('chi','pon','daiminkan','ankan'):
    for v in e['consumed']:hands[actor].remove(v)
    meld[actor]+=1
   elif typ=='kakan':hands[actor].remove(e['pai'])
  if truncated:
   screen.write(json.dumps({'gameId':item['gameId'],'status':'incomplete_at_window_cap','provisionalEligiblePairsDiscarded':len(eligible),'windows':nwin})+'\n');break
  if eligible:
   chosen=min(eligible,key=lambda x:(x['rank'],x['request']['actor'],x['request']['ordinal'],x['request']['edge']));caseId=SHA(SEED+'|case|'+item['gameId']+'|'+str(chosen['request']['actor'])+'|'+str(chosen['request']['ordinal'])+'|'+'-'.join(chosen['request']['edge']))[:24];row={'caseId':caseId,'rank':chosen['rank'],'eligiblePairsInGame':len(eligible),**chosen['request'],'witness':chosen['witness'],'result':chosen['result']};path=qual/(caseId+'.json');path.open('x',encoding='utf8').write(json.dumps(row,ensure_ascii=False,separators=(',',':')));accepted.append({'caseId':caseId,'gameId':item['gameId'],'sourceHash':item['sourceHash'],'candidateSha256':H(path.read_bytes())});status='eligible'
  else:status='no_eligible_window'
  screen.write(json.dumps({'gameId':item['gameId'],'sourceHash':item['sourceHash'],'status':status,'eligiblePairs':len(eligible),'windows':nwin,'selectedCount':len(accepted)})+'\n')
  if len(accepted)==60:stop='target_60';break
 else:
  if ngames>=2000:stop='game_limit'
 counts=send(validator,{'op':'counts'})
except Exception as e:
 stop='error';error=traceback.format_exc()
 try:counts=send(validator,{'op':'counts'})
 except Exception:pass
finally:
 screen.close()
 for proc in (reader,validator):
  try:proc.stdin.close();proc.wait(timeout=30)
  except Exception:proc.terminate();proc.wait(timeout=10)
receipt={'version':'target-continuation-receipt/v1','status':'complete_60' if stop=='target_60' else ('shortfall' if stop!='error' else 'error'),'stop':stop,'error':error,'gamesStarted':ngames,'publicWindows':nwin,'shapePairsTestedThisProcess':nshape,'repeatedWork':repeated,'eligibleIndependentGames':len(accepted),'eligible':accepted,'counts':counts,'screeningSha256':H((P/'continuation-screening.jsonl').read_bytes()),'planSha256':H((P/'continuation-plan.json').read_bytes()),'mortalScoreCalls':0,'modelCalls':0}
(P/'continuation-receipt.json').open('x',encoding='utf8').write(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k!='eligible'},ensure_ascii=False));sys.exit(1 if error else 0)
