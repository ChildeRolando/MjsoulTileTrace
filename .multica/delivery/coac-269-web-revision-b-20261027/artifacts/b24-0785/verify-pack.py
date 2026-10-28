import ast,hashlib,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=read(HERE/'result.json');pre=read(HERE/'preflight.json');selfcheck=read(HERE/'selfcheck.json')
assert r['productionCallsRecorded']==1 and r['independentCallsHere']==0 and r['retry']==0
assert selfcheck['passed'] and selfcheck['wholeChapterAccepted'] is False
assert sha(r['candidate']['path'])==r['candidate']['sha256']
candidate_copy=HERE/'candidate.json'
if not candidate_copy.exists(): candidate_copy.write_bytes(Path(r['candidate']['path']).read_bytes())
assert sha(candidate_copy)==r['candidate']['sha256']
manifest=read(pre['runtime']['path']);assert sha(pre['runtime']['path'])==pre['runtime']['sha256']
for x in manifest['files']: assert sha(x['path'])==x['sha256'],x['path']
assert len(manifest['files'])==34
assert sha(HERE/'b0785.mjs')==sha(ROOT/'audit/runtimes/coac269-283-0785-v1-20261028/b0785.mjs')
assert sha(HERE/'contract.json')==sha(ROOT/'audit/runtimes/coac269-283-0785-v1-20261028/0785-contract.json')
for n in ['slot-released.json','claim-released.json']: assert read(HERE/n)['ok']
files=[p for p in HERE.rglob('*') if p.is_file() and p.name!='pack-check.json']
for p in files:
    if p.suffix=='.json': read(p)
    elif p.suffix=='.py': ast.parse(p.read_text(encoding='utf-8-sig'),filename=str(p))
    elif p.suffix=='.mjs': subprocess.run(['E:/IDE/NodeJS/node.exe','--check',str(p)],check=True,capture_output=True)
lengths=[{'path':str(p.relative_to(REPO)).replace('\\','/'),'windowsFullLength':len(str(p))} for p in files]
assert all(x['windowsFullLength']<240 for x in lengths),lengths
out={'passed':True,'filesChecked':len(files),'jsonPythonNodeSyntaxChecked':True,'snapshotFilesRehashed':34,'candidate':r['candidate'],'realCallsHere':1,'independentCallsHere':0,'retry':0,'windowsRoot':str(REPO),'windowsRootLength':len(str(REPO)),'maximumNewWindowsPath':max(x['windowsFullLength'] for x in lengths),'strictPathLimit':240,'paths':lengths}
(HERE/'pack-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k!='paths'}))
