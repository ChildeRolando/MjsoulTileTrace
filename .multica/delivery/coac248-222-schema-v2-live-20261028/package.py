"""Package the completed maker and one reserved independent review; no model call."""
import copy
import hashlib
import json
import pathlib
from datetime import datetime,timezone

R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
e=load(L/'production-evidence.json');call=e['productionCall'];cp=R/e['candidatePath'];c=load(cp);rawp=R/'web-production/v1'/call['rawArtifactPath'];raw=load(rawp)
assert sha(cp)==e['candidateSha256'] and sha(rawp)==call['rawArtifactSha256']
assert raw['success'] and sha(rawp)==sha(L/'evidence'/f'{call["callId"]}.json')
assert hashlib.sha256(raw['requestPrompt'].encode()).hexdigest()==call['promptSha256']
assert call['model']=='gpt-6.1-terra' and call['reasoningEffort']=='max'
for x in raw['requestExecution']['images']:assert sha(x['path'])==x['sha256'] and pathlib.Path(x['path']).stat().st_size==x['bytes']
manifest=R/'audit/runtimes/coac244-vision-production-schema-v2-20261028/runtime-manifest.json'
assert sha(manifest)==e['runtimeManifestSha256']
for f in load(manifest)['files']:assert sha(manifest.parent/f['path'])==f['sha256']
assert len(raw['parsedOutput']['figures'])==1 and raw['parsedOutput']['translations']==[]
assert raw['parsedOutput']['figures'][0]['transcription']==e['fieldScope']['to']
now=datetime.now(timezone.utc).isoformat()
handoff={'schema':'coac248-exact-two-reference-independent-review-handoff/1','recordedAt':now,
 'from':'COAC-248','to':'COAC-249','authorizationCommentId':'01a17ee7-ff76-70b6-b6cf-b9efc84f01d5',
 'chapterId':'79-cn-chapter-222-5','articleId':'cv1775262','sourceId':'79-bilibili-cn',
 'candidate':{'path':e['candidatePath'],'sha256':e['candidateSha256']},'source':c['source'],
 'parent':{'path':e['parentPath'],'sha256':e['parentSha256'],'auditPath':e['parentAudit'],'auditSha256':e['parentAuditSha256']},
 'originalIndependentAuditCallId':'f64f0d4f-8833-475e-96dd-a9c5f80e2ba9',
 'priorPointEvidence':{'path':'integration/coac249-point-222-p217-20261028.json','sha256':'60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9','callId':'55d504fb-96bb-4685-8842-229ff3779df1','bbox':[170,28,196,65],'reading':'1m','scope':'Inherited independent point reading; do not spend a new call re-adjudicating the same original-image point.'},
 'production':{'callId':call['callId'],'rawPath':str(rawp.relative_to(R)),'rawSha256':sha(rawp),'requestExecution':call['requestExecution'],'usage':call['usage'],'durationMs':call['durationMs'],'remoteWeights':'unknown'},
 'runtime':{'path':str(manifest.parent.relative_to(R)),'manifestSha256':sha(manifest),'files':28},
 'fieldScope':e['fieldScope'],'preservation':e['preservation'],'originalValidators':{'gate':e['gate'],'productionProof':e['proof'],'presentation':e['presentation'],'checks':e['checks']},
 'metadataCompletion':e['metadataCompletion'],
 'reviewScope':'One first independent targeted review of this new candidate SHA: verify the exact two-reference repair and all affected teaching references/metadata against the inherited coordinate reading, plus preservation evidence and original full-article audit for unchanged content. Do not repeat original-image point adjudication or an unrelated whole-article review.',
 'independence':'Producer gate/proof is not independent acceptance. Review the actual new candidate and bound source/parent/point evidence; preserve any remaining error or uncertainty.',
 'acceptanceContract':'Use the existing independent target-review plus unchanged-parent evidence contract if supported. Bind the new receipt and sole new candidate to the original full-article review and preservation proof. Do not fabricate a standard full-article passed receipt, alter an old audit, relax a gate, or expand the model scope to work around an unsupported contract. Report an exact zero-call contract blocker to existing244 owner if necessary.',
 'limits':{'productionRemaining':0,'firstTargetedIndependentReview':1,'automaticRetry':0,'failedVoidCount':True,'stageConsumed':2,'stageLifetimeMaximum':3},
 'history':{'oldSchemaFailedCall':'b702fbf7-dbe4-4533-9a55-aa0912a334f3','oldUsage':None,'originalR1FailedThenZeroCallRecovered':'20d7f5e0-2640-4b87-bde1-e6505d839822','allOriginalRawAndLedgerUnchanged':True},
 'dispatchRequirements':'Before review recheck latest preview/register and real terminal/in-flight audit by exact source+candidate SHA; check STOP/admission, acquire existing audit guard. Queue behind existing PDF217 impact work rather than starting an extra consumer; no lock deletion.',
 'unpresentedArtifact':{'path':e['metadataCompletion']['unpresentedPath'],'sha256':e['metadataCompletion']['unpresentedSha256'],'separatelyReviewOrIntegrate':False},
 'resultRouting':'Only a real successful independent conclusion may be handed to250 with exact SHA and full supplementary proof. Otherwise return precise issues to248/244 and stop. Do not wait for the full book or create another maker batch.',
 'independentAcceptance':None,'integrationAllowed':False,'newCallsThisPackaging':0,'scopeExcludes':['PDF217','PDF257','183','236','B-line']}
hp=R/'integration/coac249-incremental-222-5-schema-v2-20261028.json';assert not hp.exists();write(hp,handoff);write(L/'handoff249.json',handoff)
invp=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';ib=invp.read_bytes();inv=load(invp);old=copy.deepcopy(inv)
row=next(x for x in inv['objects'] if x.get('chapterId')=='79-cn-chapter-222-5');assert row['candidateSha256']==e['parentSha256']
row['historicalR1BeforeSchemaV2']={k:copy.deepcopy(row[k]) for k in ['candidatePath','candidateSha256','auditPath','auditStatus','auditSha256','issueCount']}
row.update(candidatePath=str(cp),candidateSha256=e['candidateSha256'],auditPath=None,auditSha256=None,auditStatus='awaiting-independent-review',issueCount=None,
 currentDisposition='exact-two-reference-revision-produced-awaiting-one-first-targeted-independent-review',nextAction='COAC-249 one reserved independent target review; no point re-adjudication or automatic retry.')
row['schemaV2LiveRecovery']={'callId':call['callId'],'usage':call['usage'],'model':call['model'],'reasoningEffort':call['reasoningEffort'],'runtimeManifestSha256':sha(manifest),
 'handoff249':{'path':str(hp.relative_to(R)),'sha256':sha(hp)},'metadataCompletion':e['metadataCompletion'],'stageCallsConsumed':2,'remainingBudget':e['remainingBudget']}
inv['countsPrior222SchemaV2']=copy.deepcopy(inv['countsCurrent']);inv['countsCurrent']['needsRepair']-=1;inv['countsCurrent']['awaitingIndependentReview']+=1
inv['round222SchemaV2Live20261028']=row['schemaV2LiveRecovery'];inv['refreshedAt']=now
assert inv['productionFailureHistory']==old['productionFailureHistory']
assert [i for i,(a,b) in enumerate(zip(old['objects'],inv['objects'])) if a!=b]==[33]
op=R/'integration/coac248-repair-handoff-20261027.json';ob=op.read_bytes();o=load(op);prior=copy.deepcopy(o['items'])
owneritem={'kind':'web-exact-two-reference-schema-v2-produced','chapterId':'79-cn-chapter-222-5','candidatePath':e['candidatePath'],'candidateSha256':e['candidateSha256'],
 'auditStatus':'awaiting-independent-target-review','integrationAllowed':False,'handoff249':row['schemaV2LiveRecovery']['handoff249'],'metadataCompletion':e['metadataCompletion'],'remainingBudget':e['remainingBudget']}
o['items'].append(owneritem);o['feedbackUpdatedAt']=now
assert invp.read_bytes()==ib and op.read_bytes()==ob
invp.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8');write(op,o)
write(L/'owner-update.json',{'path':str(op),'beforeSha256':hashlib.sha256(ob).hexdigest(),'afterSha256':sha(op),'oldItemsPreserved':o['items'][:-1]==prior,'addedItem':owneritem})
write(L/'verification.json',{'requestArgvAndStdinShaVerified':True,'realImageInputs':2,'runtimeFilesUnchanged':28,'newMakerCalls':1,'newAuditCalls':0,
 'metadataCompletionNewCalls':0,'runnerAssemblyFailuresPreserved':True,'priorFailureHistoryUnchanged':True,'changedInventoryRows':[33],
 'nonTargetRowsPreserved':62,'candidateSha256':sha(cp),'firstIndependentAcceptance':None,'makerSlotReleased':load(L/'evidence/slot-released.json')['ok'],
 'chapterClaimReleased':load(L/'evidence/chapter-released.json')['ok'],'handoffSha256':sha(hp),'remoteWeights':'unknown'})
for name in ['run222-fixed.mjs','README.md','verification.json','handoff-248.json']:
 p=R/'integration/coac244-maker-schema-fix-20261028'/name;(L/'evidence'/('owner-'+name)).write_bytes(p.read_bytes())
print(json.dumps({'candidateSha256':sha(cp),'handoffSha256':sha(hp),'handoff':str(hp),'stageCallsConsumed':2,'remainingIndependentReview':1}))
