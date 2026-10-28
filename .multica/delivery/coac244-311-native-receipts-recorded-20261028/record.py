"""Record immutable intake and later authorized evidence, without invoking models."""
from pathlib import Path
import copy, hashlib, json, os, shutil

P=Path('E:/AgentData/Coach/knowledge/processing')
R=P/'integration/coac244-311-native-receipts-recorded-20261028'
O=Path(__file__).resolve().parent
R.mkdir(exist_ok=True)
H='ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97'
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(name,data):
 (R/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 shutil.copyfile(R/name,O/name)
pins={
 'zeroIntake':('integration/coac249-311-native-zero-intake-20261028.json','e9fb7b3780b69c6ec0125dd5e243a63f8042de34f42e9a019cc4674acfcbd0b3'),
 'purePreparedSummary':('integration/coac249-311-native-prepared-boundary-20261028.json','34116ca04f4ad65e00e91719eb3df86bbdb19fb24710ba59fec0d2a0be5e82d5'),
 'oldBudgetProposal':('integration/coac249-311-native-scope-budget-proposal-20261028.json','e2d21e31faa310a1b48652d7c4be6f34596a1306da339933487d4308a7784df1'),
 'purePreparedBoundary':('audit/supplements/coac249-311-native-intake-20261028/prepared-boundary.json','bb28eaf3673becc6498b9f86c9f96ee1fab771272d5c6ed5299f6eb2014c3b28'),
 'latestReceipt':('integration/coac249-311-native-fidelity-reviewed-20261028.json','9245894ecccf7e94f3fac8f3b5e177d5014d29a8f99baca40bb31e892afc22c6'),
 'latestRaw':('audit/calls/47c48143-2aaf-433f-829d-91aa9b07461d.json','f68c9936f06e16b29110f3789756cc17f7f54332dc7fb5ec37fefb70df3b1268'),
 'latestDisplayScope':('integration/coac249-311-native-mandatory-display-20261028.json','5502384c26e5e939284b07b9a2ee073a4a75043926acfb1ac4ecaaf72c2c3b12'),
 'latestInheritance':('integration/coac249-311-native-fidelity-inheritance-20261028.json','a9684639e2bc0a49888ba114a25e57305623e6db0fe4d026f38bff207738c765'),
}
data={};refs={}
for k,(rel,h) in pins.items():
 p=P/rel;assert sha(p.read_bytes())==h,k
 data[k]=load(p);refs[k]={'path':str(p),'sha256':h}
intake=data['zeroIntake'];pure=data['purePreparedBoundary'];r=data['latestReceipt'];raw=data['latestRaw'];scope=data['latestDisplayScope']
assert intake['proposal']['sha256']==r['proposal']['sha256']==H
assert len(intake['bindings'])==109 and len(intake['negativeChecks'])==13
assert intake['newModelCalls']==0 and intake['newSemanticVerdict'] is False
assert pure['invokeAuthorized'] is False and pure['modelInvoked'] is False
assert len(pure['plan']['images'])==8 and data['oldBudgetProposal']['additionalCallsAuthorized']==0
assert raw['output']==json.loads(raw['rawLastMessage'])==r['modelReview']
assert raw['success'] and raw['exitCode']==0 and not raw['timedOut']
assert raw['binding']['proposalSha256']==H
auth='01a1828a-5da5-7c3c-914f-e22fe0311e8a'
assert raw['binding']['authorizationComment']==r['authorizationComment']==auth
assert raw['model']=='gpt-6.1-terra' and raw['reasoningEffort']=='max'
assert raw['requestExecution']['args'].count('-i')==9
assert len(raw['requestExecution']['images'])==len(r['images'])==9
for im in raw['requestExecution']['images']:
 b=Path(im['path']).read_bytes();assert sha(b)==im['sha256'] and len(b)==im['bytes']
plan=r['plan'];assert sha(Path(plan['path']).read_bytes())==plan['sha256']
actual_plan=load(plan['path']);assert actual_plan['prompt']==raw['semanticPrompt'] and actual_plan['schema']==raw['schema']
assert [str(Path(p)) for p in actual_plan['images']]==[str(Path(x['path'])) for x in raw['requestExecution']['images']]
model=r['modelReview'];verification=r['verification']
assert len(model['figureChecks'])==8 and all(x['verdict']=='faithful' for x in model['figureChecks'])
assert model['actualFidelityGaps']==[] and model['nativeDisplayVerdict']=='faithful-with-mandatory-limits'
assert model['editorialLimitsSufficient'] is False and verification['limitedFidelityAccepted'] is False
assert model['handAImpact']['disposition']=='inherited-source-limit-with-mandatory-note'
assert len(model['mandatoryDisplayConditions'])==10
assert scope['mandatoryDisplayConditions']==model['mandatoryDisplayConditions']
assert scope['implementationVerified'] is False and scope['admissionGranted'] is False
assert r['budget']['maximum']==r['budget']['used']==1 and r['budget']['remaining']==0
assert r['newReviewCalls']==1 and r['newProductionCalls']==0
ledger_bytes=(P/'audit/calls.jsonl').read_bytes()
ledger=[json.loads(l) for l in ledger_bytes.decode('utf-8-sig').splitlines() if l.strip()]
current=[x for x in ledger if x.get('binding',{}).get('proposalSha256')==H]
old=[x for x in ledger if x.get('callId')=='7777908d-0298-450a-a5f8-a3ff98af7329']
assert len(current)==len(old)==1
assert current[0]['callId']==raw['callId']=='47c48143-2aaf-433f-829d-91aa9b07461d'

pending=[]
for i,c in enumerate(model['mandatoryDisplayConditions'],1):
 pending.append({'conditionIndex':i,**c,'conditionTextSha256':sha(c['conditionText'].encode()),
  'implementationVerifiedByRoot':False,'actualMcpArenaReadbackCompleted':False})
save('mandatory-display-register.json',{'canonical':'79-cn-chapter-311-18','proposalSha256':H,
 'receipt':refs['latestReceipt'],'raw':refs['latestRaw'],'conditions':pending,
 'preserveExistingEightNotes':True,'hideOrCorrectAttachmentPairsInDisplayOnly':True,
 'oldSourceNotesAndAuditUnchanged':True,'wholeChapterPassed':False,'admissionGranted':False})
record={'schema':'coac244-311-native-current-evidence-register/1','canonical':'79-cn-chapter-311-18',
 'proposalSha256':H,'references':refs,
 'zeroPreparation':{'newCallsAtThatTime':0,'bindingsVerifiedBy249':109,'negativeChecksVerifiedBy249':13,
  'purePreparedImages':8,'modelInvoked':False,'semanticVerdict':False,'oldProposalAuthorizedCalls':0},
 'laterExplicitAuthorization':{'commentId':auth,'readFromCurrent249MemberThread':True,
  'notAnAuthorizationFromThisWakeup':True,'maximum':1,'used':1,'remaining':0,'retry':0},
 'currentAuthorizedReview':{'callId':raw['callId'],'model':raw['model'],'effort':raw['reasoningEffort'],
  'actualImages':9,'ninthImage':'hand A source context, expressly included in later authorization',
  'usage':raw['usage'],'durationMs':raw['durationMs'],'ledgerMatches':1,
  'semanticVerdict':model['nativeDisplayVerdict'],'eightFiguresFaithful':True,'actualFidelityGaps':[],
  'originalEditorialLimitsSufficient':False,'originalLimitedFidelityAccepted':False,
  'handADisposition':model['handAImpact']['disposition'],'mandatoryDisplayConditions':10},
 'originalPhase':{'maker':1,'review':1,'maximum':2,'remaining':0,'originalLedgerMatches':1},
 'currentEffectivePendingWork':['Install the ten exact mandatory non-author conditions while retaining the eight existing notes.',
  'At b0154 explain source has twelve visible tiles; do not invent the thirteenth or certify author waits/probability/graph14 input.',
  'Hide/correct wrong attachment pairing in outward display and show source-image-binding explanation; preserve historical sourceNotes.',
  'Existing250 must perform legal exact admission and actual MCP/Arena readback of225 source positions,204 author texts,21 figures and all limits.'],
 'existing250RunObserved':'01a18295-0172-786c-816b-fd96ed45fce0','newConsumersCreated':0,
 'newModelCallsThisRootRun':0,'newMakerCallsThisRootRun':0,'newVisionCallsThisRootRun':0,
 'supersededAsCurrentState':'Waiting for authorization of first review; no proposal call yet. These were true only at zero-intake time.',
 'oldRawSeverityAndStrictFalseUnchanged':True,'authorCalculationsVerified':False,
 'wholeChapterPassed':False,'admissionGranted':False,'actualGlobalReadbackCompleted':False,
 'ledgerSnapshotSha256':sha(ledger_bytes),'fee':'unknown','upstreamExecutionCount':'unknown'}
save('record.json',record)
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a)
row=next(x for x in b['rows'] if x['chapterId']=='79-cn-chapter-311-18')
row['nativeIntakeAndLaterReviewRecorded']={'path':str(R/'record.json'),'sha256':sha((R/'record.json').read_bytes()),
 'mechanicalIntakeReceipt':refs['zeroIntake'],'latestActualReview':refs['latestReceipt'],
 'currentPending':'ten mandatory display conditions and exact admission/readback; no further model call',
 'originalFalsePreserved':True,'covered':False,'newRootModelCalls':0}
if 'nativeImagePresentationProposal' in row:
 row['nativeImagePresentationProposal']['independentFidelityScopeDecisionPending']=False
 row['nativeImagePresentationProposal']['mandatoryDisplayInstallationPending']=True
 row['nativeImagePresentationProposal']['latestIndependentEvidence']=refs['latestReceipt']
row['effectiveBlockingIssues']=[{'kind':'mandatory-non-author-display-and-readback-pending','conditionIndex':x['conditionIndex'],
 'targetId':x['figureId'],'sourceBlockIds':x['sourceBlockIds'],'conditionTextSha256':x['conditionTextSha256'],
 'rawAndTechnicalFalsePreserved':True,'newSemanticVerdictByRoot':False} for x in pending]
row['nextAction']='Use actual47c48143 evidence authorized by249 member01a1828a:8 figures faithful,actual fidelity gaps empty,strict limitedFidelityAccepted/editorialLimitsSufficient false retained. Existing250 run01a18295-0172 consumes10 mandatory display conditions (8 graph limits,hand A source-limit note,wrong outward attachment pairing correction/hiding) and8 original notes,then realMCP/Arena read225/204texts/21images. No further maker/OCR/model review;old2/2 and new1/1 exhausted separately. Do not request144values or invent hand A thirteenth tile. Remain unadmitted until installation/readback.'
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!='79-cn-chapter-311-18':assert x==y
assert reg.read_bytes()==before
if not (R/'before244-register.json').exists():(R/'before244-register.json').write_bytes(before)
tmp=R/'register.tmp';tmp.write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.replace(tmp,reg)
save('register-update.json',{'path':str(reg),'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),
 'onlyChangedChapter':'79-cn-chapter-311-18','oldHistoryIssuesAndOtherRowsUnchanged':True,
 'global250CoverageWritten':False,'newModelCallsThisRootRun':0})
for name in ['record.py','README.md']:
 if (O/name).exists():shutil.copyfile(O/name,R/name)
print(json.dumps({'recordedZeroIntake':True,'laterAuthorizedCallRecorded':raw['callId'],
 'pendingDisplayConditions':10,'oldAndNewFalsePreserved':True,'newRootCalls':0,'newConsumers':0}))
