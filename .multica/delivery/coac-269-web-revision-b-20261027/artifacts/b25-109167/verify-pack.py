import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
pins=load(HERE/'pins.json');manifest=load(pins['runtime']['path']);assert sha(pins['runtime']['path'])==pins['runtime']['sha256']
for x in manifest['files']:assert sha(x['path'])==x['sha256']
assert len(manifest['files'])==30
assert sha(HERE/'pair.mjs')==sha(Path(pins['runtime']['path']).parent/'pair.mjs')
assert sha(HERE/'contract.json')==sha(Path(pins['runtime']['path']).parent/'pair-contract.json')
assert load(HERE/'preflight.json')['count']==76 and load(HERE/'preflight.json')['passed']
calls=[]
for key in ['109','167']:
    r=load(HERE/f'{key}-result.json');s=load(HERE/f'{key}-selfcheck.json');assert r['exitCode']==0 and r['callsRecorded']==1 and r['retry']==0 and s['passed']
    assert sha(HERE/f'{key}-candidate.json')==sha(r['candidate']['path'])==r['candidate']['sha256']
    assert sha(HERE/f'{key}-raw.json')==r['calls'][0]['rawArtifactSha256']
    assert load(HERE/f'{key}-slot-release.json')['ok'] and load(HERE/f'{key}-claim-release.json')['ok']
    calls.extend(r['calls'])
assert len(calls)==2 and len({x['callId'] for x in calls})==2
paths=[]
for p in HERE.rglob('*'):
    if not p.is_file() or p.name=='pack-check.json':continue
    if p.suffix=='.json':load(p)
    elif p.suffix=='.py':ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
    elif p.suffix=='.mjs':subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(p)],check=True,capture_output=True)
    assert len(str(p))<240,str(p)
    paths.append({'path':str(p.relative_to(REPO)).replace('\\','/'),'fullWindowsLength':len(str(p)),'sha256':sha(p)})
out={'passed':True,'files':len(paths),'runtimeFilesRehashed':30,'runtime':pins['runtime'],'preflightChecks':76,'makerCallsHere':len(calls),'independentCallsHere':0,'automaticRetries':0,'maximumPair':4,'remainingIndependentMaximum':2,'windowsRootLength':len(str(REPO)),'longestWindowsPath':max(x['fullWindowsLength'] for x in paths),'strictPathLimit':240,'calls':calls,'paths':paths,'wholeChapterAccepted':False}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k not in ['paths','calls']}))
