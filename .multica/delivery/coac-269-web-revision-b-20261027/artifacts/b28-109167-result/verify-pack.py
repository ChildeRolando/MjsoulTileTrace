import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent; REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=load(HERE/'verification.json')
assert r['budget']['consumed']==4 and r['budget']['remaining']==0 and r['budget']['newCallsThisRun']==0
assert r['newConsumers']==0 and r['globalStateWritten'] is False
for row in r['rows']:
    assert row['repairPassed'] is True and row['limitedUnknownOkay'] is False
    assert row['retainedIssues'][0]['severity']=='uncertain'
    assert row['wholeChapterPassed'] is False and row['admissionGranted'] is False
    assert row['display']['installationVerified'] is False and row['display']['actualMcpArenaReadback'] is None
    assert len(row['negativeChecks'])==13 and all(x['rejected'] for x in row['negativeChecks'])
    runtime=load(row['refs']['runtime']['path'])
    assert sha(row['refs']['runtime']['path'])==row['refs']['runtime']['sha256']
    for f in runtime['files']: assert sha(f['path'])==f['sha256']
for c in r['copies']: assert sha(HERE/c['name'])==c['sha256']==sha(c['path'])
paths=[]
for p in HERE.rglob('*'):
    if not p.is_file() or p.name=='pack-check.json': continue
    if p.suffix=='.json': load(p)
    elif p.suffix=='.py': ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
    elif p.suffix=='.mjs': subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(p)],check=True,capture_output=True)
    assert len(str(p))<240
    paths.append({'path':p.relative_to(REPO).as_posix(),'windowsLength':len(str(p)),'sha256':sha(p)})
out={'passed':True,'filesChecked':len(paths),'runtimeFilesRehashed':30,'negativeChecks':26,'newModelCalls':0,'windowsRootLength':len(str(REPO)),'longestWindowsPath':max(x['windowsLength'] for x in paths),'strictPathLimit':240,'paths':paths}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({k:v for k,v in out.items() if k!='paths'}))
