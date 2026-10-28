from pathlib import Path
import json,hashlib,shutil,copy
from PIL import Image
from bs4 import BeautifulSoup
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;S=P/'integration/coac244-283-complex-two-zero-20261028'
O.mkdir(exist_ok=True);(O/'evidence').mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest();objsha=lambda x:sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode());load=lambda p:json.loads(Path(p).read_bytes())
def dump(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
refs={}
def bind(path,name=None,expected=None):
 path=Path(path);b=path.read_bytes();h=sha(b)
 if expected:assert h==expected,str(path)
 refs[str(path)]=h
 if name:(O/'evidence'/name).write_bytes(b)
 return {'path':str(path),'sha256':h,'bytes':len(b)}
latestResult=load(P/'web-production/v1/runs/coac269-283-1017-v2-20261028/result.json')
currentRef=bind(latestResult['candidate']['path'],'current-candidate.json',latestResult['candidate']['sha256']);current=load(currentRef['path'])
baseRef=bind(latestResult['parent']['path'],'base-b90-candidate.json',latestResult['parent']['sha256']);base=load(baseRef['path'])
donorRef=bind(P/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json','donor-rev2.json','849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3');donor=load(donorRef['path'])
sourceRef=bind(P/current['source']['sourcePath'],'source-v3.json',current['source']['sourceSha256']);source=load(sourceRef['path']);assert current['source']==donor['source']==base['source']
auditRef=bind(P/f'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.{donorRef["sha256"]}.json','donor-aggregate.json');audit=load(auditRef['path'])
oldIssuePath=P/'integration/coac244-283-10171181-recorded-20261028/effective-issue-register.json';oldIssues=load(oldIssuePath)
figure=lambda c,k:next(f for f in c['figures']if f['sourceBlockIds']==['modern-yabejp-ja:chapter06-exercise003:'+k])
assets={a['assetId']:a for a in source['assets']};questions={};issueMap=[]
for key,q,batch,reviewId,producerId in [('b0785',48,'007','51d6b447-2446-4afa-9c30-5d1d1b4dfcc5','9f557ee3-0c5e-4b7e-9f17-013466f46aa3'),('b0947',60,'009','7896f6fb-3a56-4444-bf7f-761db2958445','fafc75a7-a3fb-4db5-b899-aa4ae346fa0c')]:
 f=figure(current,key);df=figure(donor,key);assert f==figure(base,key),'inflight1017 changed complex figure'
 i=next(i for i,b in enumerate(source['blocks'])if b['id'].endswith(':'+key));start=i
 while start>0 and not(source['blocks'][start]['type']=='text'and'【問題'in source['blocks'][start].get('text','')):start-=1
 end=i+1
 while end<len(source['blocks'])and not(source['blocks'][end]['type']=='text'and'【問題'in source['blocks'][end].get('text','')):end+=1
 ids=[b['id']for b in source['blocks'][start:end]];context=source['blocks'][:9]+source['blocks'][start:end]
 byid=lambda c:{b['sourceBlockIds'][0]:b for b in c['body']['blocks']}
 cc,dc=byid(current),byid(donor)
 assert all(cc[b['id']]==dc[b['id']]for b in context),'author context differs across donor/current'
 paired=[{'position':source['blocks'].index(b),'source':b,'candidate':cc[b['id']],'currentFigure':next((x for x in current['figures']if x['sourceBlockIds']==[b['id']]),None),'donorFigure':next((x for x in donor['figures']if x['sourceBlockIds']==[b['id']]),None)}for b in context]
 record=next(r for r in audit['batchReviews']if r['group']['batchId'].endswith('-'+batch));assert record['calls'][0]['callId']==reviewId
 checkpointRef=bind(record['checkpoint']['path'],key+'-checkpoint.json',record['checkpoint']['sha256']);reviewRef=bind(P/f'audit/calls/{reviewId}.json',key+'-review-raw.json');raw=load(reviewRef['path']);assert json.loads(raw['rawLastMessage'])==record['modelReview']==raw['output'];assert raw['success']and raw['exitCode']==0 and not raw['timedOut'];assert raw['binding']['productionSha256']==donorRef['sha256']
 attempt=next(a for a in donor['provenance']['attempts']if a['callId']==producerId);producerRef=bind(P/donor['provenance']['artifactRoot']/attempt['rawArtifactPath'],key+'-maker-raw.json',attempt['rawArtifactSha256']);pr=load(producerRef['path']);out=json.loads(pr['rawLastMessage']);assert out==pr['parsedOutput'];v=next(v for v in out['figures']if v['sourceBlockId']==df['sourceBlockIds'][0]);assert all(df[k]==v[k]for k in ['kind','transcription','unknowns','caption','sourceNotes']);assert df['provenance']['callId']==producerId
 call=record['calls'][0];assert sha(raw['prompt'].encode())==call['semanticPromptSha256'];assert sha(raw['requestPrompt'].encode())==call['promptSha256'];assert sha(raw['rawLastMessage'].encode())==call['outputSha256']
 projection=json.loads(raw['prompt'][raw['prompt'].index('{'):]);assert all(any(x['id']==b['id']for x in projection['source']['blocks'])for b in context)
 images=[]
 for b in context:
  for im in b.get('images',[]):
   a=assets[im['assetId']];p=P/'web-sources/v1'/a['path'];ref=bind(p,expected=a['sha256']);name=key+'-'+a['sha256'][:12]+p.suffix;shutil.copyfile(p,O/name);images.append({'role':'ordered-original','sourceBlockId':b['id'],'occurrenceId':im['occurrenceId'],'assetId':a['assetId'],'path':str(S/name),'sha256':ref['sha256'],'bytes':ref['bytes'],'originalPath':str(p)})
 original=next(v for v in attempt['visualInputs']if v['role']=='original');zoom=next(v for v in attempt['visualInputs']if v['role']=='nearest-neighbor-enlargement');oref=bind(P/original['path'],expected=original['sha256']);zref=bind(P/zoom['path'],expected=zoom['sha256']);im=Image.open(oref['path']).convert('RGBA');zi=Image.open(zref['path']).convert('RGBA');assert zi.tobytes()==im.resize(zi.size,Image.Resampling.NEAREST).tobytes();zn=key+'-original-x2.png';shutil.copyfile(zref['path'],O/zn);images.append({'role':'whole-original-nearest-x2','path':str(S/zn),'sha256':zref['sha256'],'bytes':zref['bytes'],'originalPath':str(P/zoom['path'])})
 # Coordinates locate existing independently described positions only; no controller tile reading.
 boxes={'b0785':{'seat-panel':[239,232,386,322],'hand-slots10-11':[341,454,394,495],'left-river-4':[185,259,223,284],'left-river-6':[185,300,223,328],'right-river-1':[399,201,439,228]},'b0947':{'upper-first-wind':[236,141,266,177],'right-first-wind':[399,201,440,230],'highlighted-discard-2s':[151,234,188,270]}}[key]
 if key=='b0785':
  box=boxes['seat-panel'];crop=im.crop(box).resize(((box[2]-box[0])*4,(box[3]-box[1])*4),Image.Resampling.NEAREST);cn=key+'-seat-panel-x4.png';crop.save(O/cn);images.append({'role':'seat-panel-nearest-x4','bbox':box,'path':str(S/cn),'sha256':sha((O/cn).read_bytes()),'bytes':(O/cn).stat().st_size,'sourceSha256':oref['sha256'],'resampling':'nearest'})
 # Raw alt must be present in the actual captured HTML, not invented as a caption.
 htmlPath=P/'web-sources/v1'/source['html']['path'];bind(htmlPath,expected=source['html']['sha256'])
 try:html=htmlPath.read_bytes().decode(source['html']['encoding'])
 except UnicodeDecodeError:
  assert source['html']['encoding'].lower().replace('-','_')=='shift_jis';html=htmlPath.read_bytes().decode('cp932')
 soup=BeautifulSoup(html,'html.parser');alt=source['blocks'][i]['images'][0]['alt'];assert any(x.get('alt')==alt for x in soup.find_all('img'))
 targetCheck=next(c for c in record['modelReview']['figureChecks']if c['id']==f['figureId']);assert targetCheck['preservedUnknowns']['acknowledged']and record['modelReview']['contextContinuity']['faithful']
 prior=[r for r in oldIssues['issues']if r['originalIssue']['targetId']==f['figureId']and r['originalIssue']['severity']!='source-note'];assert len(prior)==(3 if key=='b0785' else 2)
 for n,r in enumerate(prior):
  disposition=('donor-produced-and-independently-confirmed-hand'if n==0 else 'donor-produced-and-independently-confirmed-hidden-hand-distinction'if n==1 else 'honest-public-unknown-retained-with-positive-context-but-seat-error-still-open')if key=='b0785'else('donor-produced-and-independent-faithful-question'if n==0 else 'independent-figure-faithful-with-explicit-two-public-wind-unknowns')
  issueMap.append({'originalIssueSha256':r['originalIssueSha256'],'originalIssue':r['originalIssue'],'currentCandidateStillHasOldFigure':True,'donorDisposition':disposition,'donor':donorRef,'maker':producerRef,'independentCheckpoint':checkpointRef,'independentRaw':reviewRef,'appliesToCurrentOnlyAfterExactScopedAssembly':True,'originalSeverityUnchanged':True})
 expected=copy.deepcopy(df)
 if key=='b0785':
  before='四角方位字样按画面位置为：左上东、右上北、左下南、右下西。';after='四角方位字样按画面位置为：左上西、右上北、左下南、右下东。';assert df['transcription'].count(before)==1;expected['transcription']=df['transcription'].replace(before,after)
  route={'maker':1,'independentTargetReview':1,'totalNewCalls':2,'retry':0,'failedVoidCount':True,'authorizedThisStage':False,'purpose':'Only two seat-character replacements on real donor figure; inherit its already independently confirmed hand/hidden distinction and explicit unknowns. No all-board OCR.'}
 else:route={'maker':0,'independentTargetReview':0,'totalNewCalls':0,'retry':0,'authorizedThisStage':False,'purpose':'Reuse ONLY complete b0947 real producer output and exact independent figure check plus Q60 context. Needs lawful exact donor-figure assembly, not whole rev2 replacement or a new model call.'}
 packet={'schema':'coac244-283-complex-target-zero-packet/1','canonical':'nemata-jp-chapter-283-1','target':key,'question':q,'current':currentRef,'stableParent':baseRef,'donor':donorRef,'source':sourceRef,'questionSourceBlockIds':ids,'commonDefinitionsIds':[b['id']for b in source['blocks'][:9]],'orderedSourceCandidatePairs':paired,'currentFigure':f,'donorFigure':df,'donorFigureIndependentCheck':targetCheck,'donorContextCheck':record['modelReview']['contextContinuity'],'donorIndependentIssues':record['modelReview']['issues'],'oldIssues':prior,'nativeSourceSize':list(im.size),'coordinatesHalfOpen':boxes,'coordinateMeaning':'mechanical localization of independently named positions; not new semantic reading','originalImagesAndDerivedViews':images,'maker':{'callId':producerId,'raw':producerRef,'record':attempt},'independent':{'callId':reviewId,'checkpoint':checkpointRef,'raw':reviewRef,'model':call['model'],'reasoningEffort':call['reasoningEffort'],'usage':raw['usage'],'durationMs':raw['durationMs'],'evidenceBoundary':'Historical raw has frozen prompt/image asset bindings and completed semantic result; no structured requestExecution/argv captured. Do not invent old transport or remote-weight proof.'},'expectedFigureNotProduced':expected,'budgetProposal':route,'scopeExclusions':['b1017 old same-group passed is NOT inherited','six tables','Q8','b0168','b0396','b0962','b1181','all other1193 blocks and522 figures'],'actualCallsThisStage':0,'candidateWritten':False,'chapterPassed':False}
 dump(O/(key+'-packet.json'),packet);questions[key]=packet
initial=load(P/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.display.json');rev1=load(P/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json');f0=copy.deepcopy(figure(initial,'b0785'));f1=copy.deepcopy(figure(rev1,'b0785'));p0=f0.pop('provenance');p1=f1.pop('provenance');presentation=f0.pop('presentationAsset');assert 'presentationAsset'not in f1 and f0==f1
pref=bind(P/presentation['path'],expected=presentation['sha256']);assert Image.open(pref['path']).convert('RGBA').tobytes()==Image.open(P/f1['sourceAssetBindings'][0]['path']).convert('RGBA').tobytes()
attempt=next(a for a in rev1['provenance']['attempts']if a['callId']==p1['callId']);rr=bind(P/rev1['provenance']['artifactRoot']/attempt['rawArtifactPath'],'b0785-original-correct-call-raw.json',attempt['rawArtifactSha256']);r=load(rr['path']);v=next(v for v in r['parsedOutput']['figures']if v['sourceBlockId']==figure(rev1,'b0785')['sourceBlockIds'][0]);assert all(f1[k]==v[k]for k in ['kind','transcription','unknowns','caption','sourceNotes'])
dump(O/'b0785-call-binding-correction.json',{'initialDisplayFigureCallId':p0['callId'],'rev1FigureCallId':p1['callId'],'actualAttemptCallId':attempt['callId'],'raw':rr,'allSemanticAndSourceFieldsEqual':True,'initialPresentationOmittedInRev1':presentation,'initialPresentationExactOriginalPixels':True,'actualOriginalOutputMatches':True,'meaning':'Bookkeeping-only callId correction and omission of exact PNG presentation already completed; neither fixed hand/hidden-hand errors or produced new semantics. Keep all original files unchanged.'})
dump(O/'five-issue-map.json',issueMap);dump(O/'protected-inputs.json',[{'path':p,'sha256':h}for p,h in refs.items()]);dump(O/'branch-graph.json',{'current':currentRef,'stableParent':baseRef,'donor':donorRef,'sameSource':sourceRef,'current1017OnlyIndependentLine':True,'targetFigureUnchangedFromB90':True,'currentQ48Q60BodyExactDonor':True,'onlyTargetReuseAllowed':True,'noWholeDonorCheckoutOrReplacement':True});(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
print(json.dumps({'packets':2,'mappedIssues':len(issueMap),'newModelCalls':0,'currentCandidate':currentRef['sha256']}))
