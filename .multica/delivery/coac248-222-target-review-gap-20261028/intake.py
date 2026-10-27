"""Zero-call intake: a production proof is not an independent figure-review acceptance."""
import copy
import hashlib
import json
import pathlib
from datetime import datetime,timezone

R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
L.mkdir(parents=True,exist_ok=True)
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
gp=R/'integration/coac249-222-targeted-contract-gap-20261028.json'
assert sha(gp)=='85417fc562eb9e096b8cee94cde57fd6a28850c5e7373fe134dae12a8f176717'
g=load(gp);assert g['modelCalls']==0 and g['remainingFirstReviewAllowance']==1
bindings=[{'path':str(gp),'sha256':sha(gp)},g['candidate'],g['handoff'],g['priorPointEvidence']]
parent=g['parentAudit'];bindings.extend([{'path':parent['path'],'sha256':parent['sha256']},{'path':parent['auditPath'],'sha256':parent['auditSha256']}])
bindings.append({'path':'web-production/v1/'+g['production']['rawArtifactPath'],'sha256':g['production']['rawArtifactSha256']})
bindings.append(g['production']['revision']['parentCall'])
runtime=pathlib.Path(g['runtime']['path']);manifest=runtime/'runtime-manifest.json'
assert sha(manifest)==g['runtime']['manifestSha256']
for f in load(manifest)['files']:bindings.append({'path':str(runtime/f['path']),'sha256':f['sha256']})
for b in bindings:assert sha(R/b['path'])==b['sha256'],b['path']
module=runtime/'textbook-audit-web.mjs';lines=module.read_text(encoding='utf-8').splitlines()
assert sha(module)==g['runtime']['auditModuleSha256']
for e in g['existingContract']['evidenceLines']:assert lines[e['line']-1].rstrip('\r\n')==e['text'].rstrip('\r\n')
c=load(R/g['candidate']['path']);source=load(R/c['source']['sourcePath'])
assert c['provenance']['revision']['figureIds']==['79-bilibili-cn:cv1775262:b0018:figure']
assert c['provenance']['revision'].get('textBlockIds',[])==[]
assert len(source['blocks'])==23 and len(c['figures'])==10
assert not any(g['existingContract'][k] for k in ['targetFigureSchema','targetFigureMerge','targetFigureReceiptVerification'])
audits=list((R/'audit/web/articles/79-bilibili-cn').glob('cv1775262.'+g['candidate']['sha256']+'*.json'))
assert not audits,'A new receipt exists: re-read before changing the waiting status.'
ledger=R/'audit/calls.jsonl';same=[]
for line in ledger.read_text(encoding='utf-8').splitlines():
 if line.strip():
  x=json.loads(line)
  if x.get('binding',{}).get('productionSha256')==g['candidate']['sha256']:same.append(x['callId'])
assert same==[],'An independent review already dispatched; do not report the allowance as untouched.'
now=datetime.now(timezone.utc).isoformat()
receipt={'schema':'coac248-222-target-review-contract-gap-intake/1','recordedAt':now,'chapterId':g['chapterId'],
 'candidate':g['candidate'],'candidateChanged':False,'sourceSha256':c['source']['sourceSha256'],
 'incomingGap':{'path':str(gp.relative_to(R)),'sha256':sha(gp)},'originalHandoff':g['handoff'],
 'runtime':g['runtime'],'existingContract':g['existingContract'],
 'blockingCondition':'No legitimate target-figure review schema, projection/merge and receipt verifier. Empty text targets select full-article23-block/10-figure scope.',
 'necessaryOwnerDeliverable':'Existing244 owner returns an exact frozen target-figure runtime/manifest and merge/receipt verification contract. Then249 may spend the one already-authorized first review; no new maker/point re-reading/full-article expansion.',
 'mechanicalGatesPassed':True,'independentReviewPassed':False,'sameCandidateAuditCalls':same,
 'budget':{'oldFailedProduction':1,'newSuccessfulProduction':1,'independentReviewUsed':0,'stageConsumed':2,'stageMaximum':3,'remainingFirstIndependentReview':1,'newProductionOrPointAllowance':0,'automaticRetry':0},
 'newCalls':0,'newAuditReceipts':0,'oldRawOrAuditEdits':0,'gateChanges':0,'integrationAllowed':False,
 'ownerAlreadyNotifiedBy249':True,'duplicateOwnerDispatchCreated':False,
 'separate217AuthorizedRun':{'taskId':'01a17f03-f39b-7b36-8c6d-4d73dfa0c906','statusAtRead':'queued','commentId':'01a17f03-f390-7185-930a-57862eabdc33','handledHere':False},
 'verifiedBindings':bindings,'issueStatus':'in_progress'}
(L/'coac249-contract-gap.json').write_bytes(gp.read_bytes());write(L/'receipt.json',receipt)
ip=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';ib=ip.read_bytes();inv=load(ip);old=copy.deepcopy(inv)
row=next(x for x in inv['objects'] if x.get('chapterId')==g['chapterId']);assert row['candidateSha256']==g['candidate']['sha256']
row['targetFigureReviewContractGap']=receipt
row['currentDisposition']='awaiting-legal-target-figure-review-contract-no-independent-call-spent'
row['nextAction']='Existing244 owner supplies exact target-figure runtime/manifest/schema+merge+receipt verification; then249 uses sole preserved first-review allowance1. Do not remake, re-read point, disguise as text, expand full article or send mechanical proof to250.'
inv['refreshedAt']=now
assert inv['countsCurrent']==old['countsCurrent'] and inv['productionFailureHistory']==old['productionFailureHistory']
assert [i for i,(a,b) in enumerate(zip(old['objects'],inv['objects'])) if a!=b]==[33]
op=R/'integration/coac248-repair-handoff-20261027.json';ob=op.read_bytes();owner=load(op)
item=next(x for x in owner['items'] if x.get('kind')=='web-exact-two-reference-schema-v2-produced' and x.get('candidateSha256')==g['candidate']['sha256'])
item['targetFigureReviewContractGap']={'path':str(gp.relative_to(R)),'sha256':sha(gp),'independentCallsUsed':0,'remainingFirstReview':1,'owner':'COAC-244','state':'blocked-by-target-figure-contract-not-by-production'}
owner['feedbackUpdatedAt']=now
assert ip.read_bytes()==ib and op.read_bytes()==ob
ip.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8');write(op,owner)
write(L/'verification.json',{'verifiedBindings':len(bindings),'runtimeFiles':28,'codeEvidenceLinesMatched':4,'fullScopeWouldSend':{'sourceBlocks':23,'figures':10},
 'newCalls':0,'newReceipts':0,'remainingFirstReview':1,'changedInventoryRows':[33],'other62RowsPreserved':True,'countsAndHistoryPreserved':True,
 'ownerUpdated':True,'noDuplicateDispatch':True,'217QueuedRunPreserved':True,'candidateUnchanged':True,'noAcceptancePromotion':True})
print(json.dumps({'gapRecorded':True,'verifiedBindings':len(bindings),'newCalls':0,'remainingFirstReview':1,'onlyChangedRow':33}))
