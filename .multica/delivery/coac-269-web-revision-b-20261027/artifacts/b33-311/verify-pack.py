"""Zero model checks of this finite web311 delivery."""
import hashlib,json,ast
from pathlib import Path
HERE=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
c=load(HERE/'contract.json');pin=load(HERE/'runtime.json');assert sha(pin['path'])==pin['sha256'];manifest=load(pin['path'])
for f in manifest['files']:assert sha(f['path'])==f['sha256']
for b in [c['parent'],c['source'],c['parentAudit'],c['parentReviewRaw'],c['context'],c['preparationPlan'],*c['images']]:assert sha(b['path'])==b['sha256']
for p in HERE.glob('*.py'):ast.parse(p.read_text('utf8'))
pre=load(HERE/'preflight.json');assert pre['passed'] and pre['newModelCalls']==0 and len(pre['negativeChecks'])==32
result=load(HERE/'result.json');assert result['makerBudgetConsumed']==1 and len(result['calls'])==1 and result['newIndependentCallsHere']==0 and result['retry']==0
if result['candidate']:
 assert sha(result['candidate']['path'])==result['candidate']['sha256'];v=load(HERE/'verification.json');assert v['passed'] and v['actualMakerMatchesPublished'] and v['reviewBuiltNotSent'];assert sha(v['production']['raw']['path'])==v['production']['raw']['sha256'];assert (HERE/'raw.json').read_bytes()==Path(v['production']['raw']['path']).read_bytes();assert (HERE/'candidate.json').read_bytes()==Path(result['candidate']['path']).read_bytes()
longest=max(len(str(p.resolve())) for p in HERE.iterdir() if p.is_file());assert longest<240,longest
out={'passed':True,'runtimeFilesRehashed':len(manifest['files']),'negativeChecks':32,'newMakerCalls':1,'newIndependentCallsHere':0,'retry':0,'wholeChapterPassed':False,'maxWindowsCheckoutPath':longest,'pathLimit':240}
(HERE/'pack-check.json').write_bytes((json.dumps(out,indent=2)+'\n').encode('utf8'));print(json.dumps(out))
