import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=load(HERE/'verification.json')
assert r['conclusions']['strictTargetPassed'] is False and r['conclusions']['limitedUnknownOkay'] is True
assert r['conclusions']['retainedUncertain']['severity']=='uncertain'
assert r['budget']['newCallsThisRun']==0 and r['budget']['remaining']==0
assert r['display']['actualMcpArenaReadback'] is None and r['display']['currentPreviewSelected'] is False
assert len(r['negativeChecks'])==11 and all(x['rejected'] for x in r['negativeChecks'])
for name,key in [('receipt.json','receipt'),('raw.json','raw'),('inheritance.json','inheritance'),('display-contract.json','overlay')]:assert sha(HERE/name)==r['refs'][key]['sha256']
runtime=load(r['refs']['runtime']['path']);assert sha(r['refs']['runtime']['path'])==r['refs']['runtime']['sha256']
for f in runtime['files']:assert sha(f['path'])==f['sha256']
paths=[]
for p in HERE.rglob('*'):
    if not p.is_file() or p.name=='pack-check.json':continue
    if p.suffix=='.json':load(p)
    elif p.suffix=='.py':ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
    elif p.suffix=='.mjs':subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(p)],check=True,capture_output=True)
    assert len(str(p))<240
    paths.append({'path':str(p.relative_to(REPO)).replace('\\','/'),'windowsLength':len(str(p)),'sha256':sha(p)})
out={'passed':True,'filesChecked':len(paths),'runtimeFilesRehashed':len(runtime['files']),'newModelCalls':0,'negativeChecks':11,'strictTargetPassed':False,'limitedUnknownOkay':True,'displayVerified':False,'windowsRootLength':len(str(REPO)),'longestWindowsPath':max(x['windowsLength'] for x in paths),'strictPathLimit':240,'paths':paths}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps({k:v for k,v in out.items() if k!='paths'}))
