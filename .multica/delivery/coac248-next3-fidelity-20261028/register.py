"""Consume independent scoped evidence into existing records; no admission/pass rewrite."""
import copy,hashlib,json,pathlib
from datetime import datetime,timezone
import numpy as np
from PIL import Image
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
bindings={}
def bind(key,path,expected=None):
 p=pathlib.Path(path)
 if not p.is_absolute():p=R/p
 h=sha(p)
 if expected:assert h==expected,(key,h,expected)
 dest=L/'evidence'/key;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
 bindings[key]={'originalPath':str(p),'sha256':h,'copy':'evidence/'+key}
 return load(p) if p.suffix=='.json' else None
h=bind('handoff.json','integration/coac249-next3-reviewed-20261028.json','ebe45f7418c0a049acea441bfe361810bbcc7ce5b74f2505cb1bb03bdc5b880b')
assert h['budget']['maximumNewCalls']==h['budget']['used']==3 and h['budget']['remaining']==0
assert h['budget']['failedCalls']==h['budget']['retry']==h['budget']['production']==0
runtime=R/'audit/runtimes/coac244-vision-terra-max-v1-20261027'
rm=bind('vision-runtime.json',runtime/'runtime-manifest.json','12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6')
assert len(rm['files'])==27
for f in rm['files']:assert sha(runtime/f['path'])==f['sha256']
rows=[]
for key,expected in [('159','86bc78028f01c2fd7a277f0c2de1ce5fb2cbf51aff72ba00376fc5e7e0c178ba'),
 ('242','8af5dfab278fb5a6da46c571f68d6a6a034bf025677842e955530ef3cc769436')]:
 item=next(i for i in h['items'] if i['key']==key)
 e=bind(key+'/limited-evidence.json',f'integration/coac249-next3-{key}-limited-fidelity-evidence-20261028.json',expected)
 c=bind(key+'/candidate.json',e['candidate']['path'],e['candidate']['sha256'])
 s=bind(key+'/source.json',e['source']['path'],e['source']['sha256'])
 old=bind(key+'/old-audit.json',e['oldAudit']['path'],e['oldAudit']['sha256'])
 raw=bind(key+'/raw.json',e['raw']['path'],e['raw']['sha256'])
 envelope=bind(key+'/technical-receipt.json',e['originalConsumerReceipt']['path'],e['originalConsumerReceipt']['sha256'])
 packet=bind(key+'/original-packet.json',f'integration/coac244-next3-zero-20261028/{key}-point-packet.json')
 assert e['canonical']==item['canonical']==packet['canonical']
 assert e['status']=='limited-unknown-fidelity-evidence' and not e['chapterAccepted'] and not e['standardWholeArticlePassed']
 assert old['status']=='needs-repair' and old['production']['sha256']==e['candidate']['sha256']
 assert raw['success'] and raw['callId']==e['independentCall']['callId']==item['call']['callId']
 assert raw['binding']['productionSha256']==e['candidate']['sha256'] and raw['binding']['sourceFileSha256']==e['source']['sha256']
 assert raw['output']==envelope['modelReview']==json.loads(raw['rawLastMessage'])
 assert envelope['status']=='needs-repair' and envelope['checks']['limitedOkay'] is False
 for flag in ['transport','configOkay','promptOkay','unchanged','locationOkay','complete','readingConsistent']:assert envelope['checks'][flag] is True
 m=raw['output'];target=e['target']
 def eligible(x):
  return x['location']['status']=='confirmed' and x['location']['originalBBox']==target['bbox'] and x['reading']['status']=='unknown' and x['reading']['tileCode']=='unknown' and x['conclusion']=='limited-unknown-acceptable' and x['completeTargetScopeCompared'] and x['currentUnknownDisplay']['faithful'] and len(x['propositions'])>0 and all(p['faithfulWithUnknown'] and p['dependsOnExactTile'] in ['no','uncertain'] and p['neededLimitation'].strip() for p in x['propositions'])
 assert eligible(m)
 uncertain=[p for p in m['propositions'] if p['dependsOnExactTile']=='uncertain']
 assert uncertain==e['dependenciesStillUncertain'] and uncertain
 assert m['currentUnknownDisplay']['requiredDisplayLimitations']==e['requiredLimitations']
 assert m['minimumRequiredAction']==e['minimumRequiredAction']
 figure=next(f for f in c['figures'] if f['figureId']==target['figureId'])
 assert figure==packet['targetFigure'] and figure['unknowns']==e['existingUnknowns']
 assert target['bbox']==packet['targetBBox']
 request=raw['requestExecution'];assert request==e['independentCall']['requestExecution']
 assert request['model']=='gpt-6.1-terra' and request['reasoningEffort']=='max'
 assert len(request['images'])==request['args'].count('-i')==5
 for n,img in enumerate(request['images']):
  bind(key+f'/input-{n}'+pathlib.Path(img['path']).suffix,img['path'],img['sha256'])
  assert pathlib.Path(img['path']).stat().st_size==img['bytes']
 original=Image.open(request['images'][0]['path']).convert('RGBA')
 for role,a,b in [('target',1,2),('neighbors',3,4)]:
  box=packet['targetBBox'] if role=='target' else packet['neighborBBox']
  crop=original.crop(tuple(box));small=Image.open(request['images'][a]['path']).convert('RGBA')
  big=Image.open(request['images'][b]['path']).convert('RGBA')
  assert crop.size==small.size and crop.tobytes()==small.tobytes()
  assert np.array_equal(np.asarray(big),np.repeat(np.repeat(np.asarray(crop),4,axis=0),4,axis=1))
 tests=[]
 for mutation in ['wrong-position','readable','unfaithful','material-exact-dependency','no-independent-conclusion']:
  q=copy.deepcopy(m)
  if mutation=='wrong-position':q['location']['originalBBox'][0]+=1
  if mutation=='readable':q['reading']['status']='readable'
  if mutation=='unfaithful':q['propositions'][0]['faithfulWithUnknown']=False
  if mutation=='material-exact-dependency':q['propositions'][0]['dependsOnExactTile']='yes'
  if mutation=='no-independent-conclusion':q['conclusion']='must-read-before-acceptance'
  assert not eligible(q);tests.append({'name':mutation,'rejected':True})
 rows.append({'canonical':e['canonical'],'candidate':e['candidate'],'target':target,
  'independentEvidence':{'path':bindings[key+'/limited-evidence.json']['originalPath'],'sha256':expected},
  'call':{'callId':raw['callId'],'model':request['model'],'reasoningEffort':request['reasoningEffort'],
   'images':5,'usage':raw['usage'],'durationMs':raw['durationMs']},
  'fidelityStatus':'independently-allowed-limited-unknown','tileReadingStatus':'unknown-retained-no-recognition-task',
  'recognitionPending':False,'candidateEditsRequiredForThisFidelityScope':False,
  'technicalEnvelopeStatus':envelope['status'],'technicalLimitedOkay':False,
  'scope':e['scope'],'requiredLimitations':e['requiredLimitations'],'minimumRequiredAction':e['minimumRequiredAction'],
  'uncertainTacticalDependenciesRetained':uncertain,'existingUnknowns':e['existingUnknowns'],
  'boundaryChecks':tests,'chapterAccepted':False,'standardWholeArticlePassed':False,
  'remainingScope':'Existing250/244 zero-call exact supplemental admission and complete other chapter scope, then actual MCP/Arena display readback preserving unknown/author conditions. No tactical recalculation requirement for faithful presentation; no new model budget.',
  'budgetRemaining':0,'fee':None,'upstreamActualCount':None,'remoteWeights':None})
item=next(i for i in h['items'] if i['key']=='100')
repair=bind('100/minimal-repair.json',item['repairRequirement']['path'],item['repairRequirement']['sha256'])
raw=bind('100/raw.json',item['raw']['path'],item['raw']['sha256'])
envelope=bind('100/technical-receipt.json',item['receipt']['path'],item['receipt']['sha256'])
c=bind('100/candidate.json',repair['candidate']['path'],repair['candidate']['sha256'])
s=bind('100/source.json',repair['source']['path'],repair['source']['sha256'])
bind('100/old-audit.json',repair['originalAudit']['path'],repair['originalAudit']['sha256'])
assert raw['success'] and raw['output']==envelope['modelReview']
assert raw['requestExecution']['model']=='gpt-6.1-sol' and raw['requestExecution']['reasoningEffort']=='high' and raw['requestExecution']['images']==[]
assert raw['callId']==repair['newIndependentCall']
assert repair['issue'] in raw['output']['issues']
assert sum(b['verdict']=='faithful' for b in raw['output']['blockChecks'])==67
assert len(raw['output']['blockChecks'])==68 and item['inheritedPassedBlocks']==243
block=next(b for b in c['body']['blocks'] if repair['targetSourceBlockId'] in b['sourceBlockIds'])
assert block['text']==repair['currentFullText'] and block['text'].count(repair['proposedPhraseChange']['from'])==1
assert repair['sourceDefinition'] in s['blocks'] and repair['targetSource'] in s['blocks']
repair100={'canonical':repair['canonical'],'candidate':repair['candidate'],'status':'needs-repair',
 'requirement':item['repairRequirement'],'issue':repair['issue'],'field':repair['field'],
 'phraseChangeProposedOnly':repair['proposedPhraseChange'],'inheritedPassedBlocks':243,'newTargetFaithfulBlocks':67,
 'call':{'callId':raw['callId'],'model':'gpt-6.1-sol','reasoningEffort':'high','images':0,
  'usage':raw['usage'],'durationMs':raw['durationMs']},
 'nextAction':'Existing244 owner: exact b0041 condition repair only if separately authorized. No new maker/review allowance, no passed sidecar.',
 'budgetRemaining':0,'candidateChanged':False,'sidecarWritten':False}
dispatch=load(pathlib.Path.cwd()/'wakeup250-current.json')
existing=next(w for w in dispatch if w['id']=='01a17f47-fc4a-7821-ae40-f8c2c7b83439')
assert existing['last_task_status']=='running'
now=datetime.now(timezone.utc).isoformat()
receipt={'schema':'coac248-next3-independent-fidelity-intake/1','recordedAt':now,'handoff':bindings['handoff.json'],
 'imageItems':rows,'textItem':repair100,'bindings':bindings,'visionRuntimeFilesVerified':27,
 'newModelCalls':0,'newProducerCalls':0,'newConsumers':0,'budget':h['budget'],
 'existing250Consumer':{'wakeupId':existing['id'],'observedStatus':'running','duplicateNotDispatched':True},
 'originalCandidatesRawReceiptsUnchanged':True,'newStandardWholeArticlePassed':False,
 'notRecognitionBacklog':['79-cn-chapter-159-9','79-cn-chapter-242-3'],
 'otherScopeUntouched':['Q8','236','222','217','283','183']}
write(L/'receipt.json',receipt)
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d)
for result in rows:
 row=next(x for x in d['objects'] if x.get('chapterId')==result['canonical'])
 assert row['candidateSha256']==result['candidate']['sha256']
 row['limitedFidelity20261028']=result;row['recognitionPending']=False
 row['currentDisposition']='independent-limited-unknown-fidelity-allowed-pending-exact-admission'
 row['nextAction']=result['remainingScope']
row=next(x for x in d['objects'] if x.get('chapterId')==repair100['canonical'])
assert row['candidateSha256']==repair100['candidate']['sha256']
row['exactConditionRepair20261028']=repair100
row['currentDisposition']='b0041-condition-omission-confirmed-no-model-budget'
row['nextAction']=repair100['nextAction']
selected={x['canonical'] for x in rows}|{repair100['canonical']}
assert all(x==y for x,y in zip(d['objects'],before['objects']) if x.get('chapterId') not in selected)
assert d['countsCurrent']==before['countsCurrent'] and d['productionFailureHistory']==before['productionFailureHistory']
write(inventory,d,indent=1)
owner=R/'integration/coac248-repair-handoff-20261027.json';ob=owner.read_bytes();o=load(owner);previous=copy.deepcopy(o)
for result in rows:
 row=next(x for x in o['items'] if x.get('kind')=='single-public-tile-source-intake' and x['chapterId']==result['canonical'])
 row['limitedFidelity20261028']=result;row['recognitionPending']=False
 row['status']='limited-unknown-fidelity-evidence-pending-exact-admission';row['nextAction']=result['remainingScope']
assert all(x==y for x,y in zip(o['items'],previous['items']) if x.get('chapterId') not in selected)
assert not any(x.get('kind')=='specific-b0041-condition-repair' for x in o['items'])
o['items'].append({'kind':'specific-b0041-condition-repair','chapterId':repair100['canonical'],'status':'needs-repair','requirement':repair100})
assert owner.read_bytes()==ob
write(owner,o);write(L/'owner-updated-items.json',[x for x in o['items'] if x.get('chapterId') in selected])
S=R/'integration/coac248-next3-fidelity-20261028';S.mkdir(parents=True,exist_ok=True)
for name in ['receipt.json','owner-updated-items.json']:(S/name).write_bytes((L/name).read_bytes())
for entry in bindings.values():assert sha(entry['originalPath'])==entry['sha256']
print(json.dumps({'receiptSha256':sha(L/'receipt.json'),'protectedInputs':len(bindings),
 'fidelityAllowed':[x['canonical'] for x in rows],'uncertainTacticalCounts':[len(x['uncertainTacticalDependenciesRetained']) for x in rows],
 'textRepair':repair100['issue']['targetId'],'boundaryRejectChecks':10,'newCalls':0,'newConsumers':0},ensure_ascii=False))
