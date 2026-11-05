import pathlib,subprocess,threading,json,io,time
s=pathlib.Path('scripts/research/discard-order-targets/recover-sample.py').read_text(encoding='utf8');f=s[s.index('def send(p,x):'):s.index("oldpath=P/'continuation-receipt.json'")].replace('threading.Timer(120,expire)','threading.Timer(0.2,expire)');env={'threading':threading,'json':json,'ledger':io.StringIO()};exec(f,env);p=subprocess.Popen(['python','-c','import sys,time;sys.stdin.readline();time.sleep(60)'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8');start=time.monotonic()
try:env['send'](p,{'op':'counts'});raise AssertionError('missing timeout')
except RuntimeError as e:assert 'timeout=True' in str(e) and time.monotonic()-start<5
finally:p.wait(timeout=5)
p=subprocess.Popen(['python','-c','import sys;sys.stdin.readline();print("{\\"ok\\":false,\\"error\\":\\"expected\\",\\"calls\\":{}}",flush=True)'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8')
try:env['send'](p,{'gameId':'fixture','op':'validate'});raise AssertionError('missing error')
except RuntimeError as e:assert 'validator_failed:expected' in str(e)
finally:p.stdin.close();p.wait(timeout=5)
assert json.loads(env['ledger'].getvalue())['error']=='expected';P=pathlib.Path('E:/AgentData/Coach/llm-discard-order-final-form-20261106/target-sample');out={'status':'pass','checks':['bounded validator wait terminates timed out child','validator error surfaced and logged without querying it again'],'localModelCalls':0,'localMortalCalls':0};(P/'bounded-wait-test.json').open('x',encoding='utf8').write(json.dumps(out));print(json.dumps(out))
