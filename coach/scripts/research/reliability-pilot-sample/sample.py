import hashlib,json,subprocess,sys,os,traceback,threading,importlib.util
from pathlib import Path
import numpy as np
P=Path('E:/AgentData/Coach/llm-provider-reliability-pilot-20261106/sample-preparation'); ROOT=Path(__file__).parent; FRAME=P/'source-frame.json';seed='2026110609';H=lambda b:hashlib.sha256(b).hexdigest();sha=lambda s:H(s.encode()); frame=json.loads(FRAME.read_text(encoding='utf8'));assert H(FRAME.read_bytes())=='076fa10559e49e2d77ab5c8f6b3849b533f50db6fbaf632d9b660c86cb541b4d'; assert H((P.parent/'research-design.json').read_bytes())=='32d620c420b27c9f780c092b344926bee0585197cbe67c94a2aef26ccab0a8a3'
sys.path.insert(0,r'E:\AgentData\Coach\encoder-parity-preflight-20261104');import extract
oldpath=Path('E:/AgentData/Coach/student-ranker-50k-learning-curve-20261104/extract-sample.py');spec=importlib.util.spec_from_file_location('old_sampling',oldpath);old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old);native=Path(os.environ['LOCALAPPDATA'])/'RiichiCoach/local-mortal-spike/rule-native-builds/5293dc419b30-1792098896138/libriichi.pyd';extract.setup(str(native),str(old.WRAPPER));from libriichi.state import PlayerState
counters={'nativeStateUpdates':0,'nativeMaskEncodes':0,'nativeActionableWindows':0,'nativeFailures':0}
def norm(line,actor):
 e=json.loads(line);typ=e.get('type')
 if typ in ('hora','ryukyoku','end_game'):return None
 if typ not in extract.FIELDS or not extract.FIELDS[typ].issubset(e):raise ValueError('unsupported_or_missing_event:'+str(typ))
 e={k:e[k] for k in extract.FIELDS[typ]}
 if typ=='start_game':e['names']=['p0','p1','p2','p3']
 if typ=='start_kyoku':
  if e['bakaze'] not in ('E','S','W') or len(e['scores'])!=4 or any(type(x)!=int for x in e['scores']):raise ValueError('invalid_round')
  if len(e['tehais'])!=4 or any(len(x)!=13 for x in e['tehais']):raise ValueError('hand_shape')
  e['tehais']=[v if i==actor else ['?']*13 for i,v in enumerate(e['tehais'])]
 if typ=='tsumo' and e['actor']!=actor:e['pai']='?'
 return e
def send(p,x):
 timed=[False]
 def expire():
  timed[0]=True
  try:p.terminate()
  except Exception:pass
 t=threading.Timer(120,expire);t.daemon=True;t.start()
 try:
  p.stdin.write(json.dumps(x,ensure_ascii=False)+'\n');p.stdin.flush();line=p.stdout.readline()
  if not line:raise RuntimeError('worker_exit_or_timeout:'+str(p.poll())+':'+str(timed[0]))
  r=json.loads(line)
  if 'ok' in r:ledger.write(json.dumps({'op':x.get('op','prepare'),'gameId':x.get('gameId'),'ordinal':x.get('ordinal'),'ok':r['ok'],'calls':r.get('calls'),'before':r.get('before'),'error':r.get('error')},ensure_ascii=False)+'\n')
  if r.get('ok') is False:raise RuntimeError('worker_failure:'+r['error'])
  return r
 finally:t.cancel()
plan={'version':'provider-pilot-sampling-plan/v1','designSha256':'32d620c420b27c9f780c092b344926bee0585197cbe67c94a2aef26ccab0a8a3','frameSha256':H(FRAME.read_bytes()),'seed':seed,'gameOrder':frame['algorithm'],'actor':'int(first8 sha256(seed|seat|gameId),16) mod4','window':'minimum sha256(seed|window|gameId|actor|ordinal|kind) among all native pure discard windows in the game','selection':'prepare one fixed window per seeded game; retain iff its final provider request falls in a not-yet-full stratum and CLI boundary <=65536; stop at 8 each; no model/outcome/teacher','eligibleWindowLimit':100000,'uniqueGameLimit':512,'lengthBins':[[0,20480],[20480,30720],[30720,40960],[40960,65536]],'binBoundaries':'lower inclusive upper exclusive except final 65536 inclusive','twoDrawBinarySha256':'db66addc0a48895c18287eee2035a1e14e7b0234546b0cbf27c08ec785c28b26','semanticsSha256':'6e025ecb4490d705ce76a80897f8c29402ad7c194c756e83e80bb10cf28f9081','modelCalls':0,'mortalScoreCalls':0,'code':{p.name:H(p.read_bytes()) for p in [Path(__file__),ROOT/'prepare-window.mjs',ROOT/'read-one.mjs']}}
(P/'sampling-plan.json').open('x',encoding='utf8').write(json.dumps(plan,ensure_ascii=False,indent=2));(P/'screen-cases').mkdir();log=(P/'screening.jsonl').open('x',encoding='utf8',buffering=1);ledger=(P/'worker-calls.jsonl').open('x',encoding='utf8',buffering=1);reader=subprocess.Popen(['node',str(ROOT/'read-one.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8',bufsize=1);worker=subprocess.Popen(['node',str(ROOT/'prepare-window.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8',bufsize=1);bins=[[],[],[],[]];games=windows=0;stop='frame_exhausted';error=None;workerCounts=None
try:
 for item in frame['candidates'][:512]:
  games+=1;raw=send(reader,item)['raw'];actor=int(sha(seed+'|seat|'+item['gameId'])[:8],16)%4;states=[PlayerState(actor),PlayerState(actor)];[s.configure_rules(True,flag) for s,flag in zip(states,(False,True))];roundord=-1;eligible=[];partial=False
  for ordinal,line in enumerate(raw.splitlines()):
   e=norm(line,actor)
   if e is None:continue
   if e['type']=='start_kyoku':roundord+=1
   try:
    for state in states:state.update(extract.canonical(e));counters['nativeStateUpdates']+=1
   except Exception:counters['nativeFailures']+=1;raise
   kind='self_turn' if e['type']=='tsumo' and e.get('actor')==actor else 'post_call_discard' if e['type'] in ('chi','pon') and e.get('actor')==actor else None
   if kind is None or not all(s.last_cans.can_act for s in states):continue
   counters['nativeActionableWindows']+=1
   try:
    _,a=states[0].encode_obs(4,False);_,b=states[1].encode_obs(4,False);counters['nativeMaskEncodes']+=2
   except Exception:counters['nativeFailures']+=1;raise
   if not np.array_equal(a,b):raise RuntimeError('native_rule_profile_mismatch')
   indices=np.flatnonzero(a).tolist()
   if len(indices)<2 or any(i>=37 for i in indices):continue
   if windows>=100000:partial=True;stop='eligible_window_limit';break
   windows+=1;rank=sha(seed+'|window|'+item['gameId']+'|'+str(actor)+'|'+str(ordinal)+'|'+kind);eligible.append({'rank':rank,'ordinal':ordinal,'kind':kind,'roundOrdinal':roundord,'nativeLegalIndices':indices})
  if partial:log.write(json.dumps({'gameId':item['gameId'],'status':'partial_game_at_limit','eligibleWindows':windows})+'\n');break
  if not eligible:log.write(json.dumps({'gameId':item['gameId'],'sourceHash':item['sourceHash'],'status':'no_native_pure_window','eligibleWindows':windows})+'\n');continue
  w=min(eligible,key=lambda z:(z['rank'],z['ordinal'],z['kind']));req={**item,**w,'actor':actor,'eligibleUnion':len(eligible)};response=send(worker,req);result=response['result'];bin=result['bin'];selected=bin is not None and not result['overLimit'] and len(bins[bin])<8
  if selected:bins[bin].append(result)
  log.write(json.dumps({'gameId':item['gameId'],'sourceHash':item['sourceHash'],'status':'selected' if selected else 'bin_full_or_oversize','result':result,'binCounts':[len(v) for v in bins],'eligibleWindows':windows},ensure_ascii=False)+'\n')
  if all(len(v)==8 for v in bins):stop='all_bins_complete';break
 else:
  if games>=512:stop='game_limit'
 workerCounts=send(worker,{'op':'counts'})
except Exception:
 stop='error';error=traceback.format_exc();workerCounts=None
finally:
 log.close();ledger.close()
 for proc in (reader,worker):
  try:proc.stdin.close();proc.wait(timeout=30)
  except Exception:proc.terminate();proc.wait(timeout=10)
receipt={'version':'provider-pilot-scan-receipt/v1','status':'complete_32' if stop=='all_bins_complete' else ('error' if stop=='error' else 'shortfall'),'stop':stop,'error':error,'gamesStarted':games,'eligibleWindows':windows,'binCounts':[len(v) for v in bins],'selectedByBin':bins,'nativeCounters':counters,'workerCounts':workerCounts,'workerCountsIfError':'unknown beyond durable ledger' if workerCounts is None else None,'screeningSha256':H((P/'screening.jsonl').read_bytes()),'workerLedgerSha256':H((P/'worker-calls.jsonl').read_bytes()),'planSha256':H((P/'sampling-plan.json').read_bytes()),'modelCalls':0,'mortalScoreCalls':0};(P/'scan-receipt.json').open('x',encoding='utf8').write(json.dumps(receipt,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in receipt.items() if k!='selectedByBin'},ensure_ascii=False));sys.exit(1 if error else 0)
