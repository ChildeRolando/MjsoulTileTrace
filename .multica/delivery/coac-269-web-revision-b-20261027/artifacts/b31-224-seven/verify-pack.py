import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent; REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=load(HERE/'result.json');v=load(HERE/'verification.json');p=v['production'];rt=load(HERE/'runtime.json')
assert r['exitCode']==0 and len(r['calls'])==1 and r['makerBudgetConsumed']==1 and r['newIndependentCallsHere']==0
assert p['unchangedBodyBlocks']==15 and p['unchangedExistingReadings']==81 and p['retainedOtherUnknownCells']==17 and len(p['changedCells'])==7
assert sha(rt['path'])==rt['sha256']
for f in load(rt['path'])['files']:assert sha(f['path'])==f['sha256']
assert sha(HERE/'candidate.json')==r['candidate']['sha256']==sha(r['candidate']['path'])
assert sha(HERE/'raw.json')==p['raw']['sha256']==sha(p['raw']['path'])
raw=load(HERE/'raw.json');assert raw['output']==json.loads(raw['rawLastMessage'])
assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max' and len(raw['requestExecution']['images'])==2
assert len(load(HERE/'preflight.json')['negativeChecks'])==24
paths=[]
for f in HERE.iterdir():
    if not f.is_file() or f.name=='pack-check.json':continue
    if f.suffix=='.json':load(f)
    elif f.suffix=='.py':ast.parse(f.read_text(encoding='utf-8-sig'))
    elif f.suffix=='.mjs':subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(f)],check=True,capture_output=True)
    assert len(str(f))<240
    paths.append({'path':f.relative_to(REPO).as_posix(),'sha256':sha(f),'windowsLength':len(str(f))})
out={'passed':True,'files':paths,'runtimeFilesRehashed':35,'negativeChecks':24,'newMakerCalls':1,'newIndependentCallsHere':0,'longestWindowsPath':max(f['windowsLength'] for f in paths),'strictPathLimit':240}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:v for k,v in out.items() if k!='files'}))
