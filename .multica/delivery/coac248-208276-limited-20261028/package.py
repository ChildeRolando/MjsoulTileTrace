"""External mechanical intake; no raw/candidate/admission edits or new dispatch."""
import copy,datetime,hashlib,json,pathlib,shutil
from verify import verify,R,D,PINS,load,bound
L=pathlib.Path(__file__).resolve().parent;S=R/'integration/coac248-208276-limited-20261028';S.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
now=datetime.datetime.now(datetime.timezone.utc).isoformat();proofs={};archives=[]
for k in PINS:
 p=verify(k);proofs[k]=p;write(L/f'proof-{k}.json',p)
 for field,name in [('candidate','candidate.json'),('source','source.json'),('oldAudit','audit.json'),('independentReceipt','receipt.json'),('independentCurrentBinding','binding.json'),('raw','raw.json'),('request','request.json')]:
  ref=p[field];dest=L/'evidence'/k/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ref['path'],dest);assert sha(dest)==ref['sha256']
  archives.append({'originalPath':ref['path'],'deliveryPath':f'evidence/{k}/{name}','sha256':ref['sha256']})
aggregate=R/'integration/coac249-193208276-reviewed-20261028.json';ag=load(aggregate)
assert ag['newModelCalls']==ag['maximumNewCalls']==3 and ag['remaining']==ag['retry']==ag['newProductionCalls']==ag['failedOrVoid']==0
prior193=R/'integration/coac248-193-limited-20261028/proof.json'
assert sha(prior193)=='b1ad29377240e032af4898eee1822e88ac7a1d13ded13aad741ebc1018643f16'
old193=load(prior193);bound(old193['candidate']);bound(old193['independentReceipt'])
current193=D/'current-binding-193.json';c193=load(current193)
assert c193['candidate']==old193['candidate'] and c193['actualCallId']=='d84eb7ca-3897-4421-ae47-03efcdf32bb1' and c193['independentConclusion']=='limited-unknown-acceptable'
assert not c193['admissionGranted'] and not c193['ordinaryWholeChapterPassed']
for x in [c193['candidate'],c193['source'],c193['originalAudit'],c193['independentReceipt'],c193['independentRaw']]:bound(x)
write(L/'path-map.json',{'files':archives})
manifest={'schema':'coac248-exact208276-proof-files/1','recordedAt':now,
 'files':[{'path':n,'sha256':sha(L/n)} for n in ['verify.py','verify_test.py','gates.mjs','gates.json','proof-208.json','proof-276.json','path-map.json']],
 'candidateChanged':False,'modelCalls':0,'oldAuditAndRawChanged':False}
write(L/'manifest.json',manifest)
consumer={'existingBatchWakeup':'01a17f9c-cee8-72e9-b34c-59e201c16160','observedStatus':'running',
 'existing244BatchWakeup':'01a17f9c-cb45-72a8-ae4f-422c083ed942','newConsumersOrWakeupsCreated':0,
 'earlier250208FailurePreserved':'01a17f9a-03ed-7e12-b3f8-bcf074039377 failed; not retriggered by248'}
handoff={'schema':'coac248208276-exact-limited-consumption-handoff/1','recordedAt':now,
 'sourceAuthorizationComment':'01a17f8c-e33c-7399-9a2a-5d6f401a852d',
 'aggregate249':{'path':str(aggregate),'sha256':sha(aggregate)},
 'proofs':[{'canonical':p['canonical'],'path':str(S/f'proof-{k}.json'),'sha256':sha(L/f'proof-{k}.json'),'candidate':p['candidate']} for k,p in proofs.items()],
 'prior193ReusedWithoutNewAudit':{'proof':{'path':str(prior193),'sha256':sha(prior193)},'finalCurrentBinding':{'path':str(current193),'sha256':sha(current193)},
 'uncertainAndSeparatePdfVersionUnchanged':True,'noNewReadingOrProofRegeneration':True},
 'manifest':{'path':str(S/'manifest.json'),'sha256':sha(L/'manifest.json')},
 'commands':[f'python -X utf8 {S.as_posix()}/verify.py',f'python -X utf8 {S.as_posix()}/verify_test.py',f'E:/IDE/NodeJS/node.exe {S.as_posix()}/gates.mjs'],
 'currentCandidatesMeetIndependentFieldConditions':True,'newCandidateEdits':0,'newModelCalls':0,
 'upstreamBatchAccounting':{'independentCalls':3,'maximum':3,'remaining':0,'production':0,'failedVoid':0,'retry':0},
 'unknownsRetained':{'193':1,'208':4,'276':4},'ordinaryWholeChapterPassed':False,'admissionGranted':False,
 'requiredReadbacks':{
 '208':['all four explicit unknowns and both bound source images','all9 ordered source blocks/3figures including sourceSegments/marks/href/tableContext',
 'all four defence methods and every original condition, including no riichi, one-shanten, drawing5p example, may consider, dangerous tile, seven-pairs uncertainty, score judgement and folding',
 'author recommendations retained without certifying absolute safety against all opponents'],
 '276':['four explicit wind unknowns and original JPEG','all42 ordered source blocks/3figures; two non-target figures inherited from the exact original independent parent evidence',
 'riichi condition for11600, red-dragon danger, only6s safe tile, possible pinfu, effective draws/continuous-attack conditions and basic qualifier',
 'disclaimer/translator/source/title/dividers/continuation and sourceSegments/marks/tableContext retained',
 'historic2x sourceNotes distinguished from the new audit crop batch if exposed; sourceNotes unchanged in candidate'],
 '193':['reuse existing193 proof, one explicit unknown, original red circles and author qualifiers','Web fragments remain uncertain; two already-integrated PDF193/b6 excerpts stay a separately labelled source version']},
 'specificRemaining':'Existing244/250 exact scope pin and lawful limited admission, then actualMCP/Arena readback. No more digit reading, whole-article audits, maker calls or new consumers. A failure of the ordinary passed gate is expected; never change original errors/uncertain to manufacture ordinary passed.',
 'sourceNotesAnnotationPolicy':proofs['276']['sourceNotesDisplayContract'],
 'consumerDedupe':consumer,'coverageIncrementClaimed':0,'formalActiveChanged':False,
 'fee':'unknown','remoteWeights':'unknown','upstreamExecutionCount':'unknown'}
write(L/'handoff.json',handoff)
stagecommon={'recordedAt':now,'handoff':{'path':str(S/'handoff.json'),'sha256':sha(L/'handoff.json')},'newModelCalls':0,'candidateEdits':0,
 'readingTodo':False,'remainingModelBudget':0,'admissionGranted':False,'standardWholeChapterPassed':False,
 'existingConsumer':consumer,'remaining':handoff['specificRemaining']}
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';data=load(inventory);before=copy.deepcopy(data)
owner=R/'integration/coac248-repair-handoff-20261027.json';ob=owner.read_bytes();o=load(owner)
closure=R/'integration/coac244-remaining26-closure-register-20261028.json';cb=closure.read_bytes();cl=load(closure);oldcl=copy.deepcopy(cl)
updates=[]
for k,p in proofs.items():
 stage={**stagecommon,'canonical':p['canonical'],'candidate':p['candidate'],
 'proof':{'path':str(S/f'proof-{k}.json'),'sha256':sha(L/f'proof-{k}.json')},
 'independentCurrentBinding':p['independentCurrentBinding'],'status':'independent-limited-unknown-field-proof-ready-for-existing-consumer',
 'propositionsMapped':len(p['fieldUtf8Ranges']),'unknownsRetained':4}
 row=next(x for x in data['objects'] if x.get('chapterId')==p['canonical']);row['limitedFieldEvidence20261028']=stage
 row['currentDisposition']=stage['status'];row['nextAction']=stage['remaining']
 items=[x for x in o['items'] if x.get('chapterId')==p['canonical']]
 if not items:o['items'].append({'kind':'limited-unknown-field-evidence-intake','chapterId':p['canonical'],'candidateSha256':p['candidate']['sha256'],'limitedFieldEvidence20261028':stage})
 else:
  for x in items:x['limitedFieldEvidence20261028']=stage
 cr=next(x for x in cl['rows'] if x['chapterId']==p['canonical']);cr['limitedFieldEvidence20261028']=stage;cr['nextAction']=stage['remaining']
 updates.append(stage)
summary={**stagecommon,'prior193Proof':handoff['prior193ReusedWithoutNewAudit'],'unknownsRetained':9,'currentBatchCallsRemaining':0}
for rows in [data['objects'],o['items'],cl['rows']]:
 for row in rows:
  if row.get('chapterId')=='79-cn-chapter-193-4':row['final193208276Batch20261028']=summary;row['nextAction']=stagecommon['remaining']
selected={'79-cn-chapter-193-4',*(p['canonical'] for p in proofs.values())}
assert all(x==y for x,y in zip(before['objects'],data['objects']) if x.get('chapterId') not in selected)
assert data['countsCurrent']==before['countsCurrent'] and data['productionFailureHistory']==before['productionFailureHistory']
assert all(x==y for x,y in zip(oldcl['rows'],cl['rows']) if x['chapterId'] not in selected)
assert owner.read_bytes()==ob and closure.read_bytes()==cb
write(inventory,data,indent=1);write(owner,o);write(closure,cl);write(L/'owner-update.json',{'updates':updates,'prior193Reconciled':summary})
for f in L.iterdir():
 if f.is_file() and f.suffix in ['.json','.py','.mjs','.md']:(S/f.name).write_bytes(f.read_bytes())
shutil.copytree(L/'evidence',S/'evidence',dirs_exist_ok=True)
print(json.dumps({'handoffSha256':sha(L/'handoff.json'),'proof208':sha(L/'proof-208.json'),'proof276':sha(L/'proof-276.json'),'mappedContributions':35,'newModelCalls':0,'unknownsAcrossBatch':9}))
