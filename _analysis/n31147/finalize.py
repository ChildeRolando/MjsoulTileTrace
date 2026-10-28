import hashlib,json,pathlib,zipfile
OUT=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path('E:/AgentData/Coach/knowledge/processing');INT=ROOT/'integration'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def save(p,x):
 with pathlib.Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
reg=read(OUT/'registration.json'); request=reg['interfaceRequest']
assert sha(pathlib.Path(request['path']).read_bytes())==request['sha256']
for p,h in reg['protectedInputsUnchanged'].items():assert sha(pathlib.Path(p).read_bytes())==h,p
for change in reg['changes']:
 d=read(change['path']);row=next(x for x in d['rows'] if x['chapterId']=='79-cn-chapter-311-18')
 assert row['nativeFidelityIntake']['interfaceRequest']==request
 assert not row.get('covered',False)
 assert '144-point recovery' in row['nextAction']
for n in ['accepted-consumer.lock','selection-maintainer.lock.json','ACCEPTED-CONSUMER-STOP']:assert not (INT/n).exists()
available=[x.name for x in INT.glob('*311*') if x.is_dir()]
entryCandidates=[]
for n in available:
 for p in (INT/n).glob('*.mjs'):
  if any(s in p.read_text(encoding='utf-8') for s in ['verify311','stage311','verifyNative','stageNative']):entryCandidates.append(str(p))
assert not entryCandidates,entryCandidates
final={'schema':'coac250-311-native-final-state/1','status':'blocked-on-existing-owner-exact-display-interface','canonical':'79-cn-chapter-311-18','proposalSha256':'ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97','receiptSha256':'9245894ecccf7e94f3fac8f3b5e177d5014d29a8f99baca40bb31e892afc22c6','interfaceRequest':request,'actualFidelityGapCount':0,'originalEditorialLimitsSufficient':False,'originalLimitedFidelityAccepted':False,'newModelCalls':0,'newProductionCalls':0,'displayImplementationVerified':False,'actualGlobalMcpArenaReadbackCompleted':False,'admissionGranted':False,'covered':False,'activeLibraryChanged':False,'baseline':{'displayChapters':256,'displayUnits':264,'blocks':7687,'figures':5964,'originalCoveredChapters':254,'originalTotalChapters':256,'originalCoveredUnits':286,'originalTotalUnits':303,'remainingChapters':['79-cn-chapter-311-18','nemata-jp-chapter-250-1'],'remainingUnits':17},'recheck':{'protectedInputsUnchanged':True,'writerLocksReleased':True,'available311Packages':available,'exactNative311EntryFound':False},'safeToResumeAfter':'Existing244 supplies exact SHA-bound verifier/stager/staged verifier and sealed mandatory display proof. Recheck current pointer/selection/run/STOP/locks, bind route persistently, then actual225-position/204-text/21-image MCP/Arena full readback and rebuild. No repeat semantic review.'}
save(OUT/'final.json',final)
names=['README.md','bindings.json','verification.json','execution.json','proposal-check.json','display-map.json','owner-request.json','registration.json','final.json']
inventory=[{'path':n,'sha256':sha((OUT/n).read_bytes()),'bytes':(OUT/n).stat().st_size} for n in names]
save(OUT/'inventory.json',{'fullAuthorDataImagesAndRawIncluded':False,'files':inventory})
z=OUT/'311-interface.zip'
with zipfile.ZipFile(z,'x',zipfile.ZIP_DEFLATED) as f:
 for n in names+['inventory.json']:f.write(OUT/n,n)
print(json.dumps({'finalVerified':True,'archiveSha256':sha(z.read_bytes()),'archiveBytes':z.stat().st_size,'covered':False,'newCalls':0}))
