"""Parse one completed production output through the bound, zero-call repair."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027';OUT=STAGE/'chapter-155'
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,x): Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
j=next(j for j in read(STAGE/'jobs.json') if j['chapterId']=='79-cn-chapter-155-4');runtime=Path(read(STAGE/'runtime-manifest.json')['runtime'])
ledger=ROOT/'web-production/v1/calls.jsonl';before=ledger.read_bytes();raw=ROOT/'web-production/v1/raw-calls/676d346d-772e-4662-8fa9-02b236073167.json'
assert sha(raw)=='58e786828e31e3acc28fdef753733861a14e1b5331241f515a552d760c557519'
assert sha(ROOT/j['parentPath'])==j['parentFileSha256'] and sha(ROOT/j['auditPath'])==j['auditFileSha256'] and sha(ROOT/j['source']['path'])==j['source']['sha256']
for f in read(STAGE/'runtime-manifest.json')['files']:assert sha(runtime/f['name'])==f['sha256']
with (OUT/'recovery-started.json').open('x',encoding='utf-8') as f:json.dump({'realCallId':'676d346d-772e-4662-8fa9-02b236073167','newModelCalls':0,'retry':False},f)
cp=subprocess.run(j['args']+['--recover-completed-call','676d346d-772e-4662-8fa9-02b236073167'],capture_output=True,encoding='utf-8')
write(OUT/'recovery-result.json',{'exitCode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr,'newModelCalls':0,'ledgerUnchanged':ledger.read_bytes()==before,'rawSha256':sha(raw)})
assert ledger.read_bytes()==before and sha(raw)=='58e786828e31e3acc28fdef753733861a14e1b5331241f515a552d760c557519'
assert cp.returncode==0,cp.stderr
candidate=Path(json.loads(cp.stdout)['candidatePath']);cp=subprocess.run(['python',str(runtime/'textbook-production-web-present.py'),str(candidate)],capture_output=True,encoding='utf-8')
write(OUT/'display-result.json',{'exitCode':cp.returncode,'stdout':cp.stdout,'stderr':cp.stderr,'modelCalls':0});assert cp.returncode==0,cp.stderr
print(json.dumps({'recovered':True,'modelCalls':0,'ledgerUnchanged':True,'candidate':str(candidate.with_name(candidate.stem+'.display.json'))}))
