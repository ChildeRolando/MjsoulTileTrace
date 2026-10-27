"""Archive the real single maker and exact field diff; reserve one independent review."""
import copy,datetime,hashlib,json,pathlib,shutil
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
S=R/'integration/coac248-256-exact-live-20261028';S.mkdir(exist_ok=True)
RUN=R/'web-production/v1/runs/coac248-web-256-18-r2-20261028'
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def write(p,x,indent=2):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
e=load(RUN/'production-evidence.json');call=e['productionCall'];candidate=R/e['candidatePath'];parent=R/e['parentPath'];raw=R/'web-production/v1'/call['rawArtifactPath']
assert e['candidateSha256']=='0877ccd8c34fed1b2728eec6c8dd912559e852d653b5fedda8f5b6e4469aa0bd'==sha(candidate)
assert call['callId']=='7fc82e75-42e5-4891-90ec-52eaa8d1be5d' and call['success']
assert sha(raw)==call['rawArtifactSha256'];actual=load(raw);assert actual['parsedOutput']==json.loads(actual['rawLastMessage'])
assert actual['requestExecution']==call['requestExecution'];assert call['model']=='gpt-6.1-terra' and call['reasoningEffort']=='max'
assert len(actual['requestExecution']['images'])==actual['requestExecution']['args'].count('-i')==2
assert actual['success'] and actual['exitCode']==0 and not actual['timedOut'] and actual['events'][-1]['type']=='turn.completed'
assert hashlib.sha256(actual['requestPrompt'].encode()).hexdigest()==call['promptSha256']
c,p=load(candidate),load(parent);target='79-bilibili-cn:cv1785770:b0016:figure'
cf=next(f for f in c['figures'] if f['figureId']==target);pf=next(f for f in p['figures'] if f['figureId']==target)
assert cf['transcription']==pf['transcription'].replace('7s [索子，数字不明] 9s','7s 8s 9s') and cf['unknowns']==pf['unknowns'][1:]
assert c['body']==p['body'] and len(c['body']['blocks'])==42
assert [f['figureId'] for f in c['figures']]==[f['figureId'] for f in p['figures']]
for f in c['figures']:
 old=next(x for x in p['figures'] if x['figureId']==f['figureId'])
 if f['figureId']!=target:assert f==old
 else:
  for key in old:
   if key not in ['transcription','unknowns','provenance']:assert f[key]==old[key],key
for entry in load(RUN/'preflight.json')['protectedFiles']:assert sha(entry['path'])==entry['sha256'],entry['path']
assert load(RUN/'slot-released.json')['released']=='maker-A' and load(RUN/'chapter-released.json')['ok']
archives=[]
refs=[(candidate,'candidate.json'),(parent,'parent.json'),(raw,'maker-raw.json'),(R/e['parentAuditPath'],'audit.json'),
 (R/c['source']['sourcePath'],'source.json'),(R/c['provenance']['derivedFromCandidate']['path'],'unpresented.json'),
 (R/'audit/runtimes/coac244-256-exact-8s-v1-20261028/runtime-manifest.json','runtime-manifest.json'),
 (R/'integration/coac244-256-exact-gate-20261028/run256.mjs','published-run256.mjs')]
refs += [(RUN/name,name) for name in ['preflight.json','dispatch-started.json','dispatch-finished.json','slot-released.json','chapter-released.json','production-evidence.json']]
for src,name in refs:
 dest=L/'evidence'/name;dest.parent.mkdir(exist_ok=True);shutil.copyfile(src,dest)
 assert src.read_bytes()==dest.read_bytes();archives.append({'originalPath':str(src),'deliveryPath':'evidence/'+name,'sha256':sha(src)})
write(L/'path-map.json',{'files':archives})
write(L/'production-evidence.json',e)
construction=load(L/'review-construction.json');assert construction['modelCalls']==0 and construction['orderedPairs']==42
plan=load(L/'review-plan.json');assert plan['proof']['candidateSha256']==sha(candidate) and plan['eligibleForSingleAuthorizedReview']
verification={'schema':'coac248-exact256-real-maker-verification/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'candidatePath':str(candidate),'candidateSha256':sha(candidate),'sourceSha256':c['source']['sourceSha256'],
 'productionCall':call,'raw':{'path':str(raw),'sha256':sha(raw)},
 'originalFrozenRuntime':'audit/runtimes/coac244-256-exact-8s-v1-20261028',
 'runtimeManifestSha256':e['runtimeManifestSha256'],'actualVerifiedRuntimeFiles':30,
 'publishedPreflightRuntimeFilesLabel':load(RUN/'preflight.json')['runtimeFiles'],
 'metadataNote':'Published preflight labels runtimeFiles28; its actual assertion and per-file loop verified30. Original preflight/raw are preserved; current proof records actual30.',
 'bodyAndOrderUnchanged':True,'completeNonTargetFiguresUnchanged':3,'captionAndSourceNotesUnchanged':True,
 'exactTranscriptionChange':'7s [索子，数字不明] 9s -> 7s 8s 9s','unknownRemoval':'Only original unknowns[0]; other two entries byte-identical',
 'noOtherTargetFieldChanges':True,'originalParentAuditAndRawUnchanged':True,'makerSlotReleased':True,'chapterClaimReleased':True,
 'currentPhaseCalls':{'production':1,'independentReview':0,'failed':0,'void':0,'retry':0},
 'remainingBudget':{'production':0,'independentTargetAndTwoUnknownImpactReview':1,'retry':0},
 'standardWholeChapterPassed':False,'independentAcceptance':None,'formalActiveChanged':False,
 'remoteWeights':'unknown','upstreamExecutionCount':'unknown','fee':'unknown'}
write(L/'verification.json',verification)
handoff={'schema':'coac248256-real-maker-to-existing249-impact-review/1','recordedAt':verification['recordedAt'],
 'authorizationCommentId':'01a17f8d-38c9-7cf9-ad2c-01bddd851470','from':'COAC-248','to':'existing COAC-249',
 'canonical':'79-cn-chapter-256-18','sourceId':'79-bilibili-cn','articleId':'cv1785770',
 'candidate':{'path':str(candidate),'sha256':sha(candidate)},'parent':{'path':str(parent),'sha256':sha(parent)},
 'source':{'path':str(R/c['source']['sourcePath']),'sha256':c['source']['sourceSha256']},
 'parentAudit':{'path':str(R/e['parentAuditPath']),'sha256':e['parentAuditSha256']},
 'productionCall':call,'productionEvidence':{'path':str(S/'production-evidence.json'),'sha256':sha(L/'production-evidence.json')},
 'verification':{'path':str(S/'verification.json'),'sha256':sha(L/'verification.json')},
 'reviewPlan':{'path':str(S/'review-plan.json'),'sha256':sha(L/'review-plan.json')},
 'zeroCallRequestConstruction':{'path':str(S/'review-construction.json'),'sha256':sha(L/'review-construction.json')},
 'reviewRuntime':{'path':'audit/runtimes/coac244-256-exact-8s-v1-20261028','manifestSha256':e['runtimeManifestSha256'],'files':30},
 'reviewEntry':{'module':'textbook-256-impact.mjs','prepare':'prepare256ImpactReview(root, realR2CandidatePath)',
 'verify':'verify256ReviewExecution(realResult, plan)','invoke':'invokeTextbookCodex({...plan, stopFiles: currentOriginalStopPaths}) from same frozen runtime, exactly once under existing249 guard'},
 'requiredScope':'Only exact bottom-hand tile12 repair at native[368,459,391,489) and the individual effect of two retained river unknowns on author argument. Full42 ordered source/candidate pairs and4 figure objects are context; do not full-board identify or full-chapter audit.',
 'retainedUnknowns':cf['unknowns'],'captionChanged':False,'sourceNotesChanged':False,
 'inheritance':'Original complete parent audit, all body/order, other3 full figures and original source-note retained; original uncertain not rewritten.',
 'budget':{'phaseMaximum':2,'phaseUsed':1,'makerRemaining':0,'soleIndependentTargetImpactReviewRemaining':1,'failedVoidCount':True,'retry':0},
 'dedupeRequirements':'Immediately before dispatch recheck latest preview/register/actualpassed, existing raw/ledger/receipt/dispatch for this SHA and exact scope, source/runtime hashes, quality/admission STOP, shared chapter claim and existing249 single audit guard. No duplicate dispatch or new consumer framework.',
 'outputContract':'Save full genuine raw and actual argv/stdin/images/thread/events/usage, standard unique audit ledger and a separate bounded target/impact receipt. Run frozen verify256ReviewExecution. Keep uncertain verbatim; limited unknown evidence requires later exact display-limit mapping. If material unknown, identify its exact author-argument impact and smallest remaining gap. No ordinary whole-article passed fabrication, no new maker/retry/fee probe.',
 'returnThread':{'issueId':'01a17471-0529-7d3d-bd8d-8b54ef38290d','parent':'01a17f8d-38c9-7cf9-ad2c-01bddd851470'},
 'independentAcceptance':None,'wholeChapterPassed':False,'modelCallsInThisHandoffConstruction':0}
write(L/'handoff249.json',handoff)
stage={'recordedAt':verification['recordedAt'],'status':'real-exact8s-r2-maker-complete-awaiting-one-independent-target-impact-review',
 'candidate':handoff['candidate'],'parent':handoff['parent'],'source':handoff['source'],'parentAudit':handoff['parentAudit'],
 'productionCallId':call['callId'],'actualModel':call['model'],'actualReasoningEffort':call['reasoningEffort'],'usage':call['usage'],
 'productionCallsUsed':1,'independentReviewCallsUsed':0,'independentReviewCallsRemaining':1,'makerRemaining':0,'retry':0,
 'handoff':{'path':str(S/'handoff249.json'),'sha256':sha(L/'handoff249.json')},'targetFigure':target,'unknownsRetained':cf['unknowns'],
 'independentAcceptance':None,'integrationAllowed':False,'rawAndOldAuditUnchanged':True,
 'nextAction':'Existing249 sole target/two-unknown impact review via frozen textbook-256-impact.mjs. Then map actual limits to legal exact supplemental admission; no full-article audit.'}
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';data=load(inventory);previous=copy.deepcopy(data)
row=next(x for x in data['objects'] if x.get('chapterId')=='79-cn-chapter-256-18')
row['exact8sLiveRecovery20261028']=stage;row['currentDisposition']=stage['status'];row['nextAction']=stage['nextAction']
row['currentValidUnauditedCandidate']=handoff['candidate']
assert all(x==y for x,y in zip(previous['objects'],data['objects']) if x.get('chapterId')!='79-cn-chapter-256-18')
assert data['productionFailureHistory']==previous['productionFailureHistory'] and data['countsCurrent']==previous['countsCurrent']
write(inventory,data,indent=1)
owner=R/'integration/coac248-repair-handoff-20261027.json';ob=owner.read_bytes();o=load(owner)
items=[x for x in o['items'] if x.get('chapterId')=='79-cn-chapter-256-18'];assert len(items)==1;items[0]['exact8sLiveRecovery20261028']=stage
assert owner.read_bytes()==ob;write(owner,o)
closure=R/'integration/coac244-remaining26-closure-register-20261028.json';cb=closure.read_bytes();cl=load(closure)
cr=next(x for x in cl['rows'] if x['chapterId']=='79-cn-chapter-256-18');cr['exact8sLiveRecovery20261028']=stage;cr['nextAction']=stage['nextAction']
assert closure.read_bytes()==cb;write(closure,cl);write(L/'owner-update.json',stage)
for f in L.iterdir():
 if f.is_file() and f.suffix in ['.json','.py','.mjs','.md','.log']:(S/f.name).write_bytes(f.read_bytes())
shutil.copytree(L/'evidence',S/'evidence',dirs_exist_ok=True)
print(json.dumps({'candidateSha256':sha(candidate),'handoffSha256':sha(L/'handoff249.json'),'productionCalls':1,'reviewCalls':0,'remainingReview':1}))
