"""Write external mechanical proofs only; leave candidate/raw/audit files intact."""
import copy,json,pathlib,hashlib
from datetime import datetime,timezone
from verify import verify,R,PINS
L=pathlib.Path(__file__).resolve().parent
S=R/'integration/coac248-159242-compliance-20261028';S.mkdir(parents=True,exist_ok=True)
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
proofs={}
for key in PINS:
 p=verify(key);write(L/f'proof-{key}.json',p);proofs[key]=p
manifest={'schema':'coac248-exact-condition-proof-files/1','authorizationComment':'01a17f4b-c677-7a56-8dd0-ca8dde28b55e',
 'files':[{'path':n,'sha256':sha(L/n)} for n in ['verify.py','verify_test.py','proof-159.json','proof-242.json']],
 'modelCalls':0,'candidateEdits':0,'productionConfigChanged':False}
write(L/'manifest.json',manifest)
handoff={'schema':'coac248-unchanged159242-conditions-handoff/1','recordedAt':datetime.now(timezone.utc).isoformat(),
 'authorizationComment':'01a17f4b-c677-7a56-8dd0-ca8dde28b55e','from':'COAC-248','to':'COAC-249',
 'scope':'Independent existing conditions mapped exactly to current candidate fields/author quotes; no new production or semantic model review',
 'manifest':{'path':str(S/'manifest.json'),'sha256':sha(L/'manifest.json')},
 'proofs':[{'path':str(S/f'proof-{key}.json'),'sha256':sha(L/f'proof-{key}.json'),
  'canonical':p['canonical'],'candidate':p['candidate']} for key,p in proofs.items()],
 'commands':[f'python -X utf8 {S.as_posix()}/verify.py',f'python -X utf8 {S.as_posix()}/verify_test.py'],
 'currentCandidatesSatisfyIndependentConditions':True,'newDerivedCandidates':0,'newNotesRequired':0,'modelCalls':0,
 'tacticalUncertainPreserved':[len(p['tacticalUncertainRetained']) for p in proofs.values()],
 'existing250Wakeup':'01a17f47-fc4a-7821-ae40-f8c2c7b83439','existing250ObservedStatus':'running',
 'nextAction':'249 zero-call binding consistency of these exact proofs. If consistent, supply a separate exact supplemental attestation to the already-running250 consumer; actual lawful admission and MCP/Arena readback remain250 scope. Do not rerun the evidence generator or rewrite raw/false receipts. If an adapter is missing, use existing244 owner only, no new model allowance.',
 'wholeArticlePassedClaimed':False,'newSemanticGapsDetected':[],
 'unchanged':'Full exact candidate file SHA pins protect every target/non-target byte, order, caption and sourceNote. No production artifact is fabricated.'}
write(L/'handoff.json',handoff)
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d)
owner=R/'integration/coac248-repair-handoff-20261027.json';ob=owner.read_bytes();o=load(owner);old=copy.deepcopy(o)
for key,p in proofs.items():
 stage={'proof':{'path':str(S/f'proof-{key}.json'),'sha256':sha(L/f'proof-{key}.json')},
  'candidate':p['candidate'],'existingIndependentConditionsMapped':True,'newNotesRequired':False,
  'derivedCandidateNeeded':False,'modelCalls':0,'status':'exact-unchanged-candidate-proof-awaiting249-zero-call-binding',
  'handoff':{'path':str(S/'handoff.json'),'sha256':sha(L/'handoff.json')}}
 row=next(x for x in d['objects'] if x.get('chapterId')==p['canonical']);row['exactDisplayCompliance20261028']=stage
 row['nextAction']=handoff['nextAction'];row['currentDisposition']=stage['status']
 item=next(x for x in o['items'] if x.get('kind')=='single-public-tile-source-intake' and x['chapterId']==p['canonical'])
 item['exactDisplayCompliance20261028']=stage;item['nextAction']=handoff['nextAction']
selected={p['canonical'] for p in proofs.values()}
assert all(x==y for x,y in zip(d['objects'],before['objects']) if x.get('chapterId') not in selected)
assert d['countsCurrent']==before['countsCurrent'] and d['productionFailureHistory']==before['productionFailureHistory']
assert all(x==y for x,y in zip(o['items'],old['items']) if x.get('chapterId') not in selected)
assert owner.read_bytes()==ob
write(inventory,d,indent=1);write(owner,o)
for p in L.glob('*'):
 if p.is_file() and p.suffix in ['.py','.json','.md']:(S/p.name).write_bytes(p.read_bytes())
print(json.dumps({'handoffSha256':sha(L/'handoff.json'),'manifestSha256':sha(L/'manifest.json'),
 'candidatesUnchanged':[p['candidate']['sha256'] for p in proofs.values()],
 'propositionsMapped':[len(p['mapping']['propositionAnchors']) for p in proofs.values()]},ensure_ascii=False))
