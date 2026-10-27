"""Register the completed review and immutable order evidence. No model dispatch."""
import copy,hashlib,json,pathlib,subprocess
from datetime import datetime,timezone
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
L=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='agent/mika/coac-248'
subprocess.run(['git','merge-base','--is-ancestor','a7f5201e90aa8846051c7f06f22e0bdac482968c','HEAD'],check=True)
pm=L.parent/'coac248-p217-admitted-20261028/path-map.json'
mapping=load(pm);path_checks=[]
assert len(mapping['inputs'])==29
for key,item in mapping['inputs'].items():
 p=pm.parent/item['packagePath'];assert sha(p)==item['sha256']
 path_checks.append({'id':key,'packagePath':item['packagePath'],'sha256':item['sha256']})
bindings={}
def bind(id,path,expected=None):
 p=pathlib.Path(path)
 if not p.is_absolute():p=R/p
 h=sha(p)
 if expected:assert h==expected,(id,h)
 suffix='.png' if p.suffix=='.png' else '.json'
 target=L/'evidence'/(id+suffix);target.parent.mkdir(parents=True,exist_ok=True)
 target.write_bytes(p.read_bytes())
 bindings[id]={'path':str(p),'sha256':h,'copy':'evidence/'+target.name}
 return load(p) if suffix=='.json' else None
h=bind('handoff','integration/coac249-reviewed222-target-figure-v3-20261028.json','5573da4d2d8933823c9ad747f0bf332be397a303301baf6d35b68139e052788e')
a=bind('audit',h['audit']['path'],'06658a3d465820d3523fb1a28ff0a0ffd9c6a6484a92be4f68984dd0dc1a4e24')
raw=bind('raw',h['raw']['path'],'88d71694aaa3485b0f30f03477d0389e82615147162b3970c9833aa8e5c01ea2')
order=bind('ordered-context','integration/coac249-222-order-context-evidence-20261028.json')
c=bind('candidate',h['candidate']['path'],h['candidate']['sha256'])
p=bind('parent',h['parent']['path'],h['parent']['sha256'])
pa=bind('parent-audit',h['parentAudit']['path'],h['parentAudit']['sha256'])
source=bind('source',c['source']['sourcePath'],h['sourceSha256'])
runtime=bind('runtime-manifest',h['runtime']['manifest']['path'],h['runtime']['manifest']['sha256'])
runtime_checks=[]
for item in runtime['files']:
 path=pathlib.Path(h['runtime']['path'])/item['path'];assert sha(path)==item['sha256']
 runtime_checks.append({'path':item['path'],'sha256':item['sha256']})
assert len(runtime_checks)==31
assert h['status']==a['status']=='needs-repair'
assert h['phaseUsed']==h['phaseMaximum']==3 and h['remaining']==0 and h['retry']==0
assert raw['success'] and raw['callId']=='5b131a9b-8592-4789-922a-1ab7306b9581'
assert raw['output']==h['modelReview']==a['modelReview']
assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max'
assert raw['usage']=={'inputTokens':17543,'cachedInputTokens':0,'outputTokens':12953}
for i,image in enumerate(raw['requestExecution']['images']):bind(f'image-{i}',image['path'],image['sha256'])
assert len(raw['requestExecution']['images'])==2
assert all(x['verdict']=='faithful' for x in raw['output']['blockChecks']+raw['output']['figureChecks'])
assert raw['output']['imageChecks'][0]['disposition']=='represented'
assert not raw['output']['domOrder']['faithful'] and not raw['output']['contextContinuity']['faithful']
assert not raw['output']['semanticCompleteness']['complete'] and not a['effectiveModelChecks']['passed']
canonical=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
assert canonical(c['body'])==canonical(p['body']) and order['actualCandidateBodyEqualsFullParent']
for item in order['actualOrderedCandidateSequence']:assert c['body']['blocks'][item['index']]==item['block']
for item in order['actualOrderedSourceSequence']:assert source['blocks'][item['index']]==item['block']
assert order['parentIndependentDomOrder']==pa['modelReview']['domOrder'] and order['parentIndependentDomOrder']['faithful']
target='79-bilibili-cn:cv1775262:b0018:figure'
cf=next(f for f in c['figures'] if f['figureId']==target)
pf=next(f for f in p['figures'] if f['figureId']==target)
assert cf['unknowns']==pf['unknowns']==[] and order['unknownsUnchanged']
assert len(raw['output']['issues'])==1 and raw['output']['issues'][0]['severity']=='uncertain'
now=datetime.now(timezone.utc).isoformat()
receipt={'schema':'coac248-222-review-return-intake/1','recordedAt':now,'chapterId':h['chapterId'],
 'candidate':h['candidate'],'status':'needs-repair','integrationAllowed':False,
 'call':{'callId':raw['callId'],'model':'gpt-6.1-terra','reasoningEffort':'max','images':2,
  'durationMs':h['durationMs'],'usage':raw['usage'],'fee':None,'upstreamExecutionCount':None,'remoteWeights':None},
 'budget':{'phaseUsed':3,'phaseMaximum':3,'remaining':0,'retry':0,'newCallsThisIntake':0},
 'findings':{'targetBlock':'faithful','targetFigure':'faithful','image':'represented',
  'both1mReferencesConfirmed':True,'unresolved':raw['output']['issues'],
  'domOrder':raw['output']['domOrder'],'contextContinuity':raw['output']['contextContinuity'],
  'semanticCompleteness':raw['output']['semanticCompleteness']},
 'orderEvidence':{'path':bindings['ordered-context']['path'],'sha256':bindings['ordered-context']['sha256'],
  'bodyCanonicalBytesEqual':True,'parentIndependentDomOrder':order['parentIndependentDomOrder'],
  'actualSequence':[{'index':x['index'],'sourceBlockIds':x['block']['sourceBlockIds']} for x in order['actualOrderedCandidateSequence']],
  'requestSuppliedCombinedCandidateOrder':False,'establishedWrongOrder':False,
  'unknownsBefore':pf['unknowns'],'unknownsAfter':cf['unknowns'],
  'historyCorrection':'Reviewer wording that unknowns were cleared is not adopted; both parent and new candidate already had []. Raw unchanged.'},
 'nextAction':'Existing COAC244 owner assesses lawful reuse of independently audited unchanged order, zero models. Preserve new uncertain and semantic gates. No248 production/review dispatch or new consumers.',
 'bindings':bindings,'runtimeVerifiedFiles':runtime_checks,
 'worktreeRecovery':{'ancestor':'a7f5201e90aa8846051c7f06f22e0bdac482968c','pathMapSha256':sha(pm),
  'deliveryCopiesVerified':29,'originalFailedRunPreserved':'01a17f16-8947-7e89-971e-fdea09027ce6',
  'oldRunNeverStarted':True,'recoveryIsNotProductionRetry':True},
 'originalInputsChanged':False,'buildOrFinalizeExecuted':False,'newWakeups':0,'to250':False}
write(L/'receipt.json',receipt);write(L/'path-checks.json',path_checks)
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d)
row=next(x for x in d['objects'] if x['objectId']=='web-chapter:79-cn-chapter-222-5')
assert row['candidateSha256']==h['candidate']['sha256']
old_status=row['auditStatus']
row.update(auditPath=h['audit']['path'],auditSha256=h['audit']['sha256'],auditStatus='needs-repair',
 issueCount=1,auditRecordedAt=a['recordedAt'],integrationAllowed=False,
 currentDisposition='target-faithful-order-context-uncertain-awaiting244-zero-call-reuse-decision',
 latestFeedback='coac248-222-return-20261028/receipt.json',nextAction=receipt['nextAction'],
 targetFigureReviewReturn=receipt)
if old_status=='awaiting-independent-review':
 d['countsCurrent']['awaitingIndependentReview']-=1;d['countsCurrent']['needsRepair']+=1
d['feedback222TargetFigure20261028']={'recordedAt':now,'callId':raw['callId'],'budget':receipt['budget'],'status':'needs-repair','receipt':str(L/'receipt.json')}
assert all(x==y for x,y in zip(d['objects'],before['objects']) if x['objectId']!='web-chapter:79-cn-chapter-222-5')
assert d['productionFailureHistory']==before['productionFailureHistory']
write(inventory,d,indent=1)
owner=R/'integration/coac248-repair-handoff-20261027.json';ob=owner.read_bytes();o=load(owner);previous=copy.deepcopy(o)
row=next(x for x in o['items'] if x.get('kind')=='web-exact-two-reference-schema-v2-produced' and x['chapterId']==h['chapterId'])
row['auditStatus']='needs-repair';row['targetFigureReviewReturn']=receipt
row['remainingBudget']={'production':0,'targetedIndependentReview':0,'retry':0}
row['integrationAllowed']=False;row['nextAction']=receipt['nextAction']
assert all(x==y for x,y in zip(o['items'],previous['items']) if x.get('kind')!='web-exact-two-reference-schema-v2-produced')
assert owner.read_bytes()==ob
write(owner,o);write(L/'owner-updated-item.json',row)
for item in bindings.values():assert sha(item['path'])==item['sha256']
for key,item in mapping['inputs'].items():assert sha(pm.parent/item['packagePath'])==item['sha256']
S=R/'integration/coac248-222-return-20261028';S.mkdir(parents=True,exist_ok=True)
for name in ['receipt.json','owner-updated-item.json','path-checks.json']:(S/name).write_bytes((L/name).read_bytes())
print(json.dumps({'status':receipt['status'],'newCalls':0,'remaining':0,'verifiedDeliveryCopies':29,
 'runtimeFiles':31,'protectedBindings':len(bindings),'receiptSha256':sha(L/'receipt.json'),
 'countsCurrent':d['countsCurrent']},ensure_ascii=False))
