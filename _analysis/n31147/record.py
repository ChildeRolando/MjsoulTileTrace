"""Record only the new exact311 evidence and interface request, under the existing writer lock."""
import copy, datetime, hashlib, json, os, pathlib, subprocess
ROOT=pathlib.Path('E:/AgentData/Coach/knowledge/processing'); INT=ROOT/'integration'
OUT=pathlib.Path(__file__).resolve().parent; CAN='79-cn-chapter-311-18'
def sha(b):return hashlib.sha256(b).hexdigest()
def enc(x):return (json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
def j(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def ref(p):return {'path':str(p),'sha256':sha(pathlib.Path(p).read_bytes())}
def save(p,x):
 with pathlib.Path(p).open('xb') as f:f.write(enc(x))
env=os.environ.copy()
for k in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY']:env.pop(k,None)
runs=json.loads(subprocess.run(['multica','issue','runs','01a17471-25e6-7731-a529-3df99acf3d42','--output','json'],capture_output=True,encoding='utf-8',check=True,env=env).stdout)
active=[x for x in runs if x['status'] in ['running','queued','starting']]
assert [x['id'] for x in active]==['01a18295-0172-786c-816b-fd96ed45fce0'],[(x['id'],x['status']) for x in active]
assert not (INT/'ACCEPTED-CONSUMER-STOP').exists()
assert not (INT/'selection-maintainer.lock.json').exists()
lock=INT/'accepted-consumer.lock'; token={'taskId':'01a18295-0172-786c-816b-fd96ed45fce0','pid':os.getpid(),'scope':'311-native-evidence-and-existing-owner-interface-request-only','modelCalls':0}
with lock.open('x',encoding='utf-8') as f:json.dump(token,f)
try:
 names=['coac250-unified-chapter-register-20261027b.json','coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']
 before={n:(INT/n).read_bytes() for n in names}; docs={n:json.loads(b) for n,b in before.items()}
 protectedPaths=[INT/n for n in ['accepted-preview-current.json','specific-web-variant-selection.v41.json','current-web-candidate-selection.json','current-candidate-selection.json','build-accepted-preview.mjs','source-structure-holds.json','candidate-exclusions.json']]
 protectedPaths += [pathlib.Path('E:/AgentData/Coach/knowledge/review/textbook-corpus.json')]
 receipt=j(INT/'coac249-311-native-fidelity-reviewed-20261028.json')
 scope=j(INT/'coac249-311-native-mandatory-display-20261028.json')
 protectedPaths += [pathlib.Path(receipt[k]['path']) for k in ['proposal','source','parent','raw','inheritedReceipt','inheritedRaw']]
 protectedPaths += [INT/'coac249-311-native-fidelity-reviewed-20261028.json',INT/'coac249-311-native-mandatory-display-20261028.json',INT/'coac249-311-native-fidelity-inheritance-20261028.json']
 protected={str(p):sha(p.read_bytes()) for p in protectedPaths}
 pointer=j(INT/'accepted-preview-current.json'); prop=receipt['proposal']['sha256']
 assert pointer['corpusId']=='86a5fc6fb2a18dbfdf4eef60251759e1f7ea567f3c447cecc2fc5e90d5200ed5'
 assert (pointer['chapters'],pointer['units'],pointer['blocks'],pointer['figures'])==(256,264,7687,5964)
 for n in ['specific-web-variant-selection.v41.json','current-web-candidate-selection.json']:
  assert prop not in (INT/n).read_text(encoding='utf-8')
 assert prop not in json.dumps(pointer.get('selectedWeb',[]))
 assert all(not next(x for x in d['rows'] if x['chapterId']==CAN).get('covered',False) for d in docs.values())
 evidence=ref(INT/'coac249-311-native-fidelity-reviewed-20261028.json')
 scopeRef=ref(INT/'coac249-311-native-mandatory-display-20261028.json')
 package=INT/'coac250-311-native-display-interface-request-20261028.json'
 assert not package.exists(),'Already recorded: inspect and deduplicate, do not overwrite.'
 mapping=j(OUT/'display-map.json')
 for c in mapping['mandatoryConditions']:
  fid=c['figureId']; c['proposedDisplayAnchor']={'afterSourceBlockId':fid.removesuffix(':figure'),'beforeNextSourceBlock':True} if fid.endswith(':figure') else {'chapterEditorialNotice':True,'visibleBeforeHistoricalAttachmentReferences':True}
  c['installed']=False
 request={
  'schema':'coac250-311-native-exact-interface-request/1','canonical':CAN,'existingOwner':'COAC-244','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'taskId':token['taskId'],'proposal':receipt['proposal'],'source':receipt['source'],'parent':receipt['parent'],
  'independentReceipt':evidence,'raw':receipt['raw'],'mandatoryDisplayScope':scopeRef,
  'state':'exact-native-proposal-admission-and-display-interface-missing','newSemanticVerdict':False,
  'actualFidelityGapCount':0,'conditionalAcceptanceExplicitInModel':True,
  'originalEditorialLimitsSufficient':False,'originalLimitedFidelityAccepted':False,
  'displayMapping':mapping,
  'minimumOwnerWork':[
   'Provide a read-only verifier pinned to this proposal/source/parent/new receipt/raw and original production/audit chain. It must recognize only conditional native-image display, retain every original false/issue, and reject other candidates or semantic changes.',
   'Provide an exact stager and staged verifier installing all 8 original editorial notes plus the 10 actual mandatory conditions outside author text, with source anchors preserved. Hand A note follows b0154; incorrect adjacent attachment pairing is suppressed only in display and the exact historical-pairing notice is visible. Preserve original sourceNotes as immutable evidence.',
   'Keep all 225 ordered source positions, 204 verbatim author text blocks, 21 complete figures/original image bytes, 13 unchanged non-target objects, historical-array labels, unknown bindings, links/marks/tableContext. Removing notes must recover author content exactly.',
   'Seal module/manifest/stage output hashes and negative checks for missing or moved notes, guessed tiles/values/bindings, changed source/body/images, hidden historical labels, or forged ordinary passed/full-chapter/model booleans. Return an exact existing-stage-compatible route for250 to bind persistently.',
   '250 then completes real global MCP/Arena full readback and durable rebuild verification before changing chapter coverage. No new model, OCR, maker, reviewer or consumer is authorized.'
  ],
  'notRequired':['Recover 144 artificial data slots','Verify author calculations as an original-text display prerequisite','Guess hand A thirteenth tile','Repeat semantic or image review'],
  'currentRouteInspected':ref(INT/'build-accepted-preview.mjs'),
  'currentRouteHas311NativeCallback':False,'displayImplementationVerified':False,
  'admissionGranted':False,'wholeChapterPassed':False,'actualMcpArenaReadbackCompleted':False,
  'newModelCalls':0,'newProductionCalls':0,'newConsumerStarted':False,
  'dedupe':{'proposalNotSelected':True,'currentRunOnly':True,'currentRunId':token['taskId'],'preview':ref(INT/'accepted-preview-current.json'),'corpusId':pointer['corpusId']},
  'baseline':{'displayChapters':256,'displayUnits':264,'blocks':7687,'figures':5964,'originalCoveredChapters':254,'originalTotalChapters':256,'originalCoveredUnits':286,'originalTotalUnits':303},
  'originalEvidenceMustRemainImmutable':True,'activeLibraryChanged':False
 }
 save(package,request); save(OUT/'owner-request.json',request)
 packet=ref(package)
 action='COAC-244: zero-model exact311 native-proposal verifier/stager/staged-verifier compatibility for proposal ca5792a8 and actual47c48143 receipt9245894e. Install 8 original notes plus10 mandatory conditions (including b0154 hand-A source limit and visible historical attachment-pairing notice); retain original false/history. Then250 realMCP/Arena225 positions/204texts/21images and persistent rebuild before coverage. No new maker/OCR/review, no144-point recovery, no guessed thirteenth tile.'
 intake={'evidence':evidence,'mandatoryDisplayScope':scopeRef,'interfaceRequest':packet,'proposalSha256':prop,'nativeDisplayVerdict':'faithful-with-mandatory-limits','actualFidelityGapCount':0,'conditionalAcceptanceExplicitInModel':True,'originalEditorialLimitsSufficient':False,'originalLimitedFidelityAccepted':False,'historical8Uncertain40Impacts10IssuesPreserved':True,'newModelCalls':0,'newProductionCalls':0,'displayImplementationVerified':False,'actualMcpArenaReadbackCompleted':False,'admissionGranted':False,'covered':False,'minimumRemainingGap':'Exact311 conditional native-proposal display interface and real250 readback, not a new semantic/reading gap.'}
 journals=[]
 for n,d in docs.items():
  row=next(x for x in d['rows'] if x['chapterId']==CAN)
  oldrow=copy.deepcopy(row)
  row['nativeFidelityIntake']=intake; row['nextAction']=action
  if 'nativeImagePresentationProposal' in row:
   row['nativeImagePresentationProposal'].update({'independentFidelityScopeDecisionPending':False,'mandatoryDisplayInstallationPending':True,'latestIndependentEvidence':evidence,'exactInterfaceRequest':packet})
  if n.startswith('coac244-'):
   row['historicalBlockingIssuesBeforeNativeDisplayScope']=copy.deepcopy(row['blockingIssues'])
   row['blockingIssues']=[{'kind':'exact-display-interface','status':'open','targetId':CAN,'description':'Existing owner exact native-proposal admission/staging contract absent; mandatory display conditions and actual global readback remain unimplemented. Actual independent fidelity gaps=0.','evidence':packet}]
   row['category']='native-image-conditional-display-interface';row['owner']='COAC-244'
  if 'closurePlan' in row:row['closurePlan'].update({'category':'native-image-conditional-display-interface','owner':'COAC-244','nextAction':action})
  assert not row.get('covered',False)
  assert all(x==y for x,y in zip(json.loads(before[n])['rows'],d['rows']) if x['chapterId']!=CAN)
  for k,v in json.loads(before[n]).items():
   if k!='rows':assert d[k]==v
  journals.append({'path':str(INT/n),'beforeSha256':sha(before[n]),'afterSha256':sha(enc(d)),'changedChapterIds':[CAN],'priorRowSha256':sha(enc(oldrow)),'newRowSha256':sha(enc(row))})
 for n in names:assert (INT/n).read_bytes()==before[n], 'concurrent register update: '+n
 for n,d in docs.items():
  tmp=INT/(n+'.n31147.tmp');save(tmp,d);os.replace(tmp,INT/n)
 for p,h in protected.items():assert sha(pathlib.Path(p).read_bytes())==h,p
 assert not (INT/'selection-maintainer.lock.json').exists()
 save(OUT/'registration.json',{'schema':'coac250-311-native-owner-registration/1','interfaceRequest':packet,'changes':journals,'protectedInputsUnchanged':protected,'onlyCanonicalUpdated':CAN,'otherChapterRowsUnchanged':True,'coverageCountsUnchanged':True,'newModelCalls':0,'newProductionCalls':0,'actualMcpArenaReadbackCompleted':False,'admissionGranted':False,'activeLibraryChanged':False})
 print(json.dumps({'recorded':True,'canonical':CAN,'registers':3,'proposalSelected':False,'coverageChanged':False,'actualReadbackCompleted':False,'requestSha256':packet['sha256']}))
finally:
 assert json.loads(lock.read_text(encoding='utf-8'))==token
 lock.unlink()
