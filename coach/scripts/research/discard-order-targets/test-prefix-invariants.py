import json,subprocess,sys,re,hashlib
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-discard-order-final-form-20261106/target-sample');s=json.loads(Path('E:/AgentData/Coach/llm-defense-ablation-20261104/sample-preparation-v2/sample-freeze.json').read_text(encoding='utf8'));x={**s['cases'][154],'edge':['8p','9p'],'testHistorical':True};p=subprocess.Popen(['node','scripts/research/discard-order-targets/validate-window.mjs'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8');rs=[]
try:
 for mut in (None,'malformed_suffix','hidden'):
  q={**x};
  if mut:q['testMutation']=mut
  p.stdin.write(json.dumps(q)+'\n');p.stdin.flush();r=json.loads(p.stdout.readline());rs.append(r)
  if not r.get('ok'):raise ValueError(r.get('error'))
 p.stdin.write('{"op":"counts"}\n');p.stdin.flush();counts=json.loads(p.stdout.readline())
 def normalized(r):
  z=r['result'];s=json.dumps({'eligible':z['eligible'],'publicPrefixHash':z['publicPrefixHash'],'messages':z['blind']['messages'],'candidates':z['binding']['candidates'],'basicPairs':z['basicPairs']},sort_keys=True,ensure_ascii=False);table={}
  def sub(m):
   v=m.group();table.setdefault(v,str(len(table)));return table[v]
  return re.sub(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',sub,s)
 vals=[normalized(r) for r in rs];assert vals[0]==vals[1]==vals[2], 'suffix or hidden mutation affected public eligibility/blind/basic';status='pass';error=None
except Exception as e:status='error';error=str(e);counts=rs[-1].get('calls') if rs else None
finally:p.stdin.close();p.wait()
out={'version':'target-prefix-invariant-test/v1','status':status,'error':error,'checks':['same qualifying public prefix hash','same basic pairs including effective sets','same complete candidates','same blind messages after deterministic alias renaming','malformed suffix','opponent hidden hand mutation'],'case':'historical-public-preflight-154','counts':counts,'modelCalls':0,'scoreCalls':0};(P/'prefix-invariant-test.json').open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False));sys.exit(0 if status=='pass' else 1)
