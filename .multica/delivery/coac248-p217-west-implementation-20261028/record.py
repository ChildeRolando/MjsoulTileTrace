"""Record semantic closure separately from the concrete legal admission gap."""
import copy
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime,timezone
from PIL import Image

R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
plan=load(L/'implementation-plan.json');check=load(L/'contract-check.json');raw=load(L/'evidence/west-impact-raw.json')
assert check['actualLoaderError']=='Error: audit_native_inline_correction_unapproved_page'
prefix='.multica/delivery/coac249-p217-west-impact-20261028/'
commit=subprocess.check_output(['git','log','--all','-1','--format=%H','--',prefix],text=True).strip();assert commit
inputs=[];folder=L/'evidence/actual-inputs';folder.mkdir(exist_ok=True)
for i,x in enumerate(raw['requestExecution']['images']):
 relative=x['path'].replace('\\','/').split(prefix,1)[1]
 b=subprocess.check_output(['git','cat-file','blob',commit+':'+prefix+relative])
 assert hashlib.sha256(b).hexdigest()==x['sha256'] and len(b)==x['bytes']
 p=folder/(str(i+1)+'-'+pathlib.Path(relative).name);p.write_bytes(b)
 inputs.append({'recordedPath':x['path'],'commit':commit,'gitPath':prefix+relative,'sha256':x['sha256'],'copy':str(p.relative_to(L))})
images=[Image.open(L/x['copy']).convert('RGBA') for x in inputs]
assert images[0].size==(430,463)
assert images[0].crop((81,175,112,199)).tobytes()==images[4].tobytes()
assert images[4].resize((images[4].width*4,images[4].height*4),Image.Resampling.NEAREST).tobytes()==images[5].tobytes()
now=datetime.now(timezone.utc).isoformat()
hp=R/'integration/coac248-p217-west-implementation-20261028/implementation-plan.json'
ip=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';before=ip.read_bytes();inv=load(ip);old=copy.deepcopy(inv)
row=next(x for x in inv['objects'] if x['objectId']=='79-cn:page:217')
assert row['candidateSha256']==plan['parent']['sha256']
update={'recordedAt':now,'handoffPath':str(hp.relative_to(R)),'handoffSha256':sha(hp),
 'westImpact':'limited-unknown-acceptable-closed-with-conditions','westImpactCallId':'6dd8a1d9-44a7-4a8b-958e-cf6a64c18636',
 'westRequiresFurtherTileReading':False,'westRequiresFurtherImpactReview':False,
 'northSecond':'resolved9m-no-change','northFirst':'unreadable-manzu-no-number-inference',
 'draftSha256':plan['draft']['sha256'],'draftAdmitted':False,'displayActuallyInstalled':False,
 'actualGateError':check['actualLoaderError'],'remainingTechnicalItems':plan['specificContractGaps'],
 'remainingModelBudget':0,'newCalls':0,'newAcceptedPages':0,'newAcceptedChapters':0}
row['westImpactImplementation20261028']=update
row['currentDisposition']='west-impact-semantically-closed-exact-display-draft-pending-217-contract-admission'
row['nextAction']='Existing244 owner: register exact217 native-inline/raw-overlay job, support only its bound unknown-array insertion, and place limitation note after complete218-b3 argument. No recognition or impact-model re-review is needed; current rev5 remains selected unchanged until legal admission.'
if 'zeroModelCloseoutReview' in row:row['zeroModelCloseoutReview']['supersededWestImpactState']=update['westImpact']
inv['refreshedAt']=now
assert inv['countsCurrent']==old['countsCurrent'] and inv['productionFailureHistory']==old['productionFailureHistory']
assert [i for i,(a,b) in enumerate(zip(old['objects'],inv['objects'])) if a!=b]==[1]
op=R/'integration/coac248-repair-handoff-20261027.json';ob=op.read_bytes();owner=load(op)
item=next(x for x in owner['items'] if x.get('kind')=='pdf-page-point-evidence' and x.get('chapterId')=='79-cn-chapter-217-4')
item['westImpactImplementation20261028']=update;item['disposition']=row['currentDisposition'];owner['feedbackUpdatedAt']=now
assert sha(pathlib.Path(plan['parent']['path']))==plan['parent']['sha256']
assert sha(pathlib.Path(plan['originalRaw']['path']))==plan['originalRaw']['sha256']
assert ip.read_bytes()==before and op.read_bytes()==ob
ip.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8');write(op,owner)
write(L/'owner-update.json',{'path':str(op),'beforeSha256':hashlib.sha256(ob).hexdigest(),'afterSha256':sha(op),'updatedExistingItem':item})
write(L/'verification.json',{'newCalls':0,'allSixRealImagePayloadFilesReverified':inputs,'actualTargetCropAndNearest4x':True,
 'independentSixPremiseResultPreserved':True,'westImpactClosed':True,'draftHasTwoCoordinateUnknowns':True,
 'northSecond9mPreserved':True,'authorBodyAndOriginalCaptionPreserved':True,'originalRawAndOldReceiptsUnchanged':True,
 'currentCandidateUnchanged':True,'legallyAdmittedCandidateWritten':False,'notesInstalled':False,'changedInventoryRows':[1],
 'other62RowsCountsAndFailureHistoryPreserved':True,'noNewModelBudgetOrGlobalGateChange':True,'contractCheck':check,
 'limitationNotePlacement':'after218-b3 relevant argument, before next section; proposal-only',
 'wholePagePassed':False,'wholeChapterPassed':False,'issueStatus':'in_progress'})
(hp.parent/'contract-check.json').write_bytes((L/'contract-check.json').read_bytes())
print(json.dumps({'westSemanticImpact':'closed','actualEntryBlocker':check['actualLoaderError'],'newCalls':0,'oldCandidateChanged':False,'ownerUpdated':True}))
