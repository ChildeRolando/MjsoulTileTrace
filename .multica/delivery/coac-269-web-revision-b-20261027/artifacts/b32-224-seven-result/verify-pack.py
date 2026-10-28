import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=load(HERE/'verification.json')
assert r['repairPassed'] is True and r['limitedUnknownOkay'] is True
assert r['wholeChapterPassed'] is False and r['admissionGranted'] is False and r['display']['implementationVerified'] is False
assert r['budget']['consumed']==2 and r['budget']['remaining']==0 and r['budget']['newCallsThisRun']==0
assert r['inheritance']['unknownCells']==17 and r['inheritance']['otherUnknownsReread'] is False and r['inheritance']['newOcrTodoCreated'] is False
assert len(r['display']['limitationMap'])==10 and len(r['negativeChecks'])==14 and all(c['rejected'] for c in r['negativeChecks'])
for k in ['handoff','receipt','raw','inheritance','proposal']:assert sha(HERE/(k+('.md' if k=='handoff' else '.json')))==r['refs'][k]['sha256']
rt=load(r['refs']['runtime']['path']);assert len(rt['files'])==35
for f in rt['files']:assert sha(f['path'])==f['sha256']
paths=[]
for p in HERE.iterdir():
    if not p.is_file() or p.name=='pack-check.json':continue
    if p.suffix=='.json':load(p)
    elif p.suffix=='.py':ast.parse(p.read_text(encoding='utf-8-sig'))
    elif p.suffix=='.mjs':subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(p)],check=True,capture_output=True)
    assert len(str(p))<240
    paths.append({'path':p.relative_to(REPO).as_posix(),'sha256':sha(p),'windowsLength':len(str(p))})
out={'passed':True,'runtimeFilesRehashed':35,'negativeChecks':14,'newModelCalls':0,'longestWindowsPath':max(p['windowsLength'] for p in paths),'strictPathLimit':240,'files':paths}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps({k:v for k,v in out.items() if k!='files'}))
