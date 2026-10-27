import copy, datetime, hashlib, json, pathlib, shutil

root=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
local=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def write(p,x): pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
pre=read(local/'preflight.json')
assert pre['revisionScopeError']['code']=='web_revision_notes_scope'
assert len(pre['negativeChecks'])==9 and all(x['rejected'] for x in pre['negativeChecks'])
assert pre['modelCalls']==0
assert not (root/'web-production/v1/runs/coac248-web-256-18-r2-20261028').exists()
for x in pre['protectedFiles']: assert sha(pathlib.Path(x['path']).read_bytes())==x['sha256'],x['path']
parent_path='web-production/v1/candidates/79-bilibili-cn/cv1785770.r1.display.json'
parent=read(root/parent_path); source=read(root/parent['source']['sourcePath'])
audit_path=f"audit/web/articles/79-bilibili-cn/cv1785770.{pre['parentSha256']}.json"
audit=read(root/audit_path); raw=read(root/pre['reviewRawPath'])
assert json.loads(raw['rawLastMessage'])==audit['modelReview']
assert audit['production']['sha256']==pre['parentSha256']
assert raw['binding']['productionSha256']==pre['parentSha256']
assert raw['binding']['sourceFileSha256']==pre['sourceSha256']
assert raw['success'] and not raw['timedOut']
target=next(f for f in parent['figures'] if f['figureId']==pre['fieldScope']['figureId'])
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
evidence=[]
for p,name in [(parent_path,'parent.json'),(parent['source']['sourcePath'],'source.json'),(audit_path,'audit.json'),(pre['reviewRawPath'],'review-raw.json')]:
 src=root/p; dest=local/'evidence'/name;dest.parent.mkdir(exist_ok=True);shutil.copyfile(src,dest)
 evidence.append({'originalPath':p,'deliveryPath':'evidence/'+name,'sha256':sha(src.read_bytes())})
ordered={'schema':'coac248-complete-teaching-context/1','sourceSha256':pre['sourceSha256'],'candidateSha256':pre['parentSha256'],
 'sourceOrderedBlocks':source['blocks'],'candidateOrderedBlocks':parent['body']['blocks'],
 'fullParentFigures':parent['figures'],'reviewScope':{'targetFigure':target['figureId'],
 'repairOnly':{'bbox':[368,459,391,489],'token':'8s','removeOnlyUnknownIndex':0},
 'impactOnlyUnknowns':pre['fieldScope']['unknownsTo'],
 'outOfScope':'No re-transcription of all visible tiles, no new reading of remaining river digits, no p257 pixel hypotheses, no full-chapter image review.'}}
write(local/'teaching-context.json',ordered)
handoff={'schema':'coac248-256-exact-repair-admission-gap/1','recordedAt':now,
 'authorization':{'issueId':'01a17471-0529-7d3d-bd8d-8b54ef38290d','commentId':'01a17f8d-38c9-7cf9-ad2c-01bddd851470',
 'newCallMaximum':2,'productionMaximum':1,'targetAndImpactReviewMaximum':1,'callsUsed':0,'callsRemaining':2,'retry':0,'failedVoidCount':True},
 'chapterId':'79-cn-chapter-256-18','sourceId':'79-bilibili-cn','articleId':'cv1785770',
 'parent':{'path':parent_path,'sha256':pre['parentSha256']},
 'source':{'path':parent['source']['sourcePath'],'sha256':pre['sourceSha256']},
 'independentReview':{'path':audit_path,'sha256':pre['parentAuditSha256'],'callId':raw['callId'],
 'rawPath':pre['reviewRawPath'],'rawSha256':pre['reviewRawSha256'],'rawParsedReviewEqual':True,
 'statusUnchanged':audit['status'],'issuesUnchanged':audit['modelReview']['issues']},
 'target':{'figureId':target['figureId'],'sourceBlockIds':target['sourceBlockIds'],
 'sourceOccurrenceIds':target['sourceOccurrenceIds'],'sourceAssetBindings':target['sourceAssetBindings'],
 'sourceResolution':[500,500],'bbox':[368,459,391,489],
 'coordinateConvention':'native top-left half-open; hand12, immediately between7s and9s',
 'fieldScope':pre['fieldScope'],'captionChanged':False,'sourceNotesChanged':False,
 'nonTargetBodyAndFiguresMustRemainByteEqual':True},
 'runtime':{'path':'audit/runtimes/coac244-vision-production-schema-v2-20261028',
 'manifestSha256':pre['runtimeManifestSha256'],'files':28,'model':'gpt-6.1-terra','reasoningEffort':'max',
 'actualNewRequestDispatched':False,'actualNewRequestExecution':None,'remoteWeights':'unknown'},
 'preflight':{'protectedFilesVerified':len(pre['protectedFiles']),'sharedClaimCheck':pre['claimCheck'],
 'jointExclusion':pre['initialJoint'],'negativeChecks':pre['negativeChecks'],
 'failure':pre['revisionScopeError'],'claimAcquired':False,'makerSlotAcquired':False},
 'specificGap':{
 'path':'textbook-audit-web.mjs','function':'verifyWebRevisionContent','line':186,
 'condition':"review.issues.some(i=>i.severity!=='source-note'&&(!targets.includes(i.targetId)||i.severity!=='error'))",
 'reason':'The real parent has the authorized error plus an uncertain issue about two river digits in the SAME target figure. The current gate forbids that uncertain issue even when both unknown entries remain exactly unchanged. No model call has started.',
 'minimumExistingOwnerWork':'Add and freeze only an exact source/parent/audit/figure/field-bound admission for this repair, retaining the two river unknowns and original uncertain as pending independent impact review. Do not classify the parent passed, alter severity, filter old raw, or relax any other chapter.',
 'reviewContractNeeded':'One independent target/impact call, after a real legal candidate exists: check exact8s repair and first-unknown deletion; evaluate BOTH remaining river unknowns against complete ordered teaching prose. Preserve all non-target parent findings including the source-note. Do not reread the whole board or guess digits. A limited-fidelity result must state precise limitations and any genuinely missing teaching-impact evidence; it is not a synthetic ordinary whole-article pass.',
 'deterministicAlternative':'Only if the owner verifies a genuine existing exact derived-field path bound to the real old independent8s error. Record parent/diff/external evidence honestly; never fake maker raw. This can save the maker, not create another audit budget.'},
 'nextAction':{'owner':'COAC-244 existing owner','modelCallsAuthorizedForOwnerContractFix':0,
 'returnTo248':'Return exact verified runtime/manifest/admission and executable invocation to the original delivery thread. 248 resumes original maximum1maker+1independent249review, not a new batch.',
 'to250AllowedNow':False},
 'teachingContext':{'path':'teaching-context.json','sha256':sha((local/'teaching-context.json').read_bytes()),
 'completeSourceBlocks':len(source['blocks']),'completeCandidateBlocks':len(parent['body']['blocks']),
 'figures':len(parent['figures']),'remainingUnknownImpactConclusion':None},
 'deliveryEvidence':evidence,'newCandidateCreated':False,'rawOrAuditEdited':False}
write(local/'handoff244.json',handoff)
shared=root/'integration/coac248-256-exact-repair-preflight-20261028';shared.mkdir(exist_ok=True)
for name in ['handoff244.json','preflight.json','teaching-context.json','run.mjs','prepare.py','hand-context.png']:
 shutil.copyfile(local/name,shared/name)
shutil.copytree(local/'evidence',shared/'evidence',dirs_exist_ok=True)
record={'recordedAt':now,'disposition':'authorized-exact8s-preflight-blocked-by-parent-uncertain-admission',
 'handoff':'integration/coac248-256-exact-repair-preflight-20261028/handoff244.json',
 'handoffSha256':sha((local/'handoff244.json').read_bytes()),'newCalls':0,'remainingBudget':{'production':1,'independentTargetImpactAudit':1,'retry':0},
 'candidateUnchanged':pre['parentSha256'],'targetFigure':target['figureId'],'remainingRiverUnknowns':pre['fieldScope']['unknownsTo'],
 'impactAssessment':'Not yet independently assessed; do not infer non-core from controller viewing.',
 'sourceNotes':'Original attachment-number source-note remains; no change authorized.',
 'nextOwner':'COAC-244 exact admission / verified runtime; then COAC-248 production and COAC-249 independent target-impact audit.'}
inventory=pathlib.Path('.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json')
data=read(inventory);item=next(x for x in data['objects'] if x['objectId']=='web-chapter:79-cn-chapter-256-18')
item['authorizedExact8sRecovery20261028']=record;data['latestExact256Preflight']=record
inventory.write_text(json.dumps(data,ensure_ascii=False,indent=1)+'\n',encoding='utf-8',newline='\n')
owner_path=root/'integration/coac248-repair-handoff-20261027.json';owner=read(owner_path)
items=[x for x in owner['items'] if x.get('chapterId')=='79-cn-chapter-256-18' and x.get('candidateSha256')==pre['parentSha256']]
assert len(items)==1
items[0]['authorizedExact8sRecovery20261028']=record;write(owner_path,owner)
write(local/'owner-update.json',record)
write(local/'path-map.json',{'files':evidence})
print(json.dumps({'handoffSha256':record['handoffSha256'],'newCalls':0,'newCandidate':None,'protectedFiles':len(pre['protectedFiles']),'negativeChecks':9}))
