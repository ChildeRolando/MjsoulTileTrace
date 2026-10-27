"""Validate the two packets and register next steps; never dispatch a consumer."""
import copy,hashlib,json,pathlib
from datetime import datetime,timezone
import numpy as np
from PIL import Image
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
D=R/'integration/coac244-next3-zero-20261028';L=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
bindings={}
def bind(key,p,expected=None):
 p=pathlib.Path(p)
 if not p.is_absolute():p=R/p
 h=sha(p)
 if expected:assert h==expected,(key,h,expected)
 dest=L/'evidence'/key;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
 bindings[key]={'originalPath':str(p),'sha256':h,'copy':'evidence/'+key}
 return load(p) if p.suffix=='.json' else None
handoff=bind('handoff.json',D/'handoff.json');manifest=load(D/'delivery-manifest.json')
search=load(L/'captured-search.json');assert search['capturedAssetFiles']==7541 and not search['errors']
ownership=load(R/'integration/source-block-ownership.json')
results=[]
for key,pdfpage,pdfblock,pdfsha in [
 ('159',161,'79-cn-p161-b10','c66cab7e77b66ac9a8955ef8ebe0955fc34d096729700c975062e629032c702e'),
 ('242',242,'79-cn-p242-b11','ccb19a3ffc0409921b0058f11860a34560d8c970d79f4b07033059012ea19452')]:
 expected=next(x['sha256'] for x in manifest['files'] if x['relativePath']==key+'-point-packet.json')
 packet=bind(key+'/packet.json',D/f'{key}-point-packet.json',expected)
 canonical=packet['canonical'];target=packet['targetFigure'];ids=target['sourceBlockIds']
 c=bind(key+'/candidate.json',packet['candidate']['path'],packet['candidate']['sha256'])
 s=bind(key+'/source.json',packet['source']['path'],packet['source']['sha256'])
 audit=bind(key+'/audit.json',packet['oldAudit']['path'],packet['oldAudit']['sha256'])
 assert c['source']['sourceSha256']==packet['source']['sha256'] and audit['production']['sha256']==packet['candidate']['sha256']
 assert audit['status']=='needs-repair' and audit['modelReview']==packet['oldModelReview']
 assert next(f for f in c['figures'] if f['figureId']==target['figureId'])==target
 assert packet['completeCandidateProse']==[b for b in c['body']['blocks'] if b['type']=='text']
 assert all(b in s['blocks'] for b in packet['sourceContext']) and all(b in c['body']['blocks'] for b in packet['candidateContext'])
 issues=[i for i in audit['modelReview']['issues'] if i['severity']!='source-note']
 assert issues==[packet['oldBlockingIssue']] and issues[0]['severity']=='uncertain' and issues[0]['targetId']==target['figureId']
 assert all(b['verdict']=='faithful' for b in packet['reusable']['otherBodyChecks']+packet['reusable']['otherFigureChecks'])
 for old in packet['oldCalls']:
  raw=bind(key+'/raw.json',old['raw']['path'],old['raw']['sha256'])
  assert raw['success'] and raw['output']==audit['modelReview'] and raw['callId']==old['call']['callId']
  assert raw['binding']['productionSha256']==packet['candidate']['sha256']
  assert raw['binding']['sourceFileSha256']==packet['source']['sha256']
  assert target['sourceAssetBindings'][0]['assetId'] in raw['binding']['originalImageAssetIds']
 for i,old in enumerate(packet['sameShaAuditFiles']):
  h=old['binding'];bind(key+f'/history-{i}.json',h['path'],h['sha256'])
 binding=target['sourceAssetBindings'][0]
 bind(key+'/original'+pathlib.Path(packet['originalImage']['path']).suffix,packet['originalImage']['path'],packet['originalImage']['sha256'])
 assert binding['sha256']==packet['originalImage']['sha256']
 original=Image.open(packet['originalImage']['path']).convert('RGBA');assert list(original.size)==packet['nativeSize']
 verified_crops=[]
 for asset in packet['assets']:
  for field in ['originalPixels','nearest4']:
   h=asset[field];p=D/pathlib.Path(h['path']).name
   bind(key+'/'+p.name,p,h['sha256'])
  crop=original.crop(tuple(asset['bbox']))
  recorded=Image.open(D/pathlib.Path(asset['originalPixels']['path']).name).convert('RGBA')
  enlarged=Image.open(D/pathlib.Path(asset['nearest4']['path']).name).convert('RGBA')
  assert crop.size==recorded.size and crop.tobytes()==recorded.tobytes()
  assert hashlib.sha256(crop.tobytes()).hexdigest()==asset['pixelSha256']
  assert np.array_equal(np.asarray(enlarged),np.repeat(np.repeat(np.asarray(crop),4,axis=0),4,axis=1))
  verified_crops.append({'role':asset['role'],'bbox':asset['bbox'],'cropExact':True,'nearest4EveryPixelExact':True})
 page=bind(key+'/pdf-page.json',R/f'79-cn/pages/{pdfpage}.json')
 image=next(b for b in page['blocks'] if b['id']==pdfblock)
 assert image['imageSha256']==pdfsha
 assert any(o['sourceBlockId']==pdfblock and o['chapterId']==canonical for o in ownership['blocks'])
 pdfpath=R/image['asset'];bind(key+'/pdf-native.png',pdfpath,pdfsha)
 pdf=Image.open(pdfpath).convert('RGBA');assert pdf.size==original.size
 exact=pdf.tobytes()==original.tobytes()
 diff=np.abs(np.asarray(pdf).astype('float32')[:,:,:3]-np.asarray(original).astype('float32')[:,:,:3])
 x0,y0,x1,y1=packet['targetBBox']
 alternate={'path':str(pdfpath),'sha256':pdfsha,'sourcePage':pdfpage,'sourceBlockId':pdfblock,
  'chapterId':canonical,'nativeSize':list(pdf.size),'sameRGBA':exact,
  'originalRGBMeanAbsoluteDifference':float(diff.mean()),'targetRGBMeanAbsoluteDifference':float(diff[y0:y1,x0:x1].mean()),
  'higherNativeResolution':False,'improvedReadabilityConfirmed':False,
  'handling':'Exact same pixels; no extra source detail.' if exact else 'Same-page, same-native-size PDF alternative. Preserve as an alternate input inventory; different pixels/PNG format do not prove better clarity or a tile reading. Do not replace the bound web original.'}
 if key=='242':
  other=next(x for x in search['nearMatches'][key] if x['sha256'].startswith('2e1922c1'))
  othersource=load(R/'web-sources/v1/79-bilibili-cn/articles/cv1793434/source.json')
  asset=next(a for a in othersource['assets'] if a.get('sha256')==other['sha256'])
  other['rejectedAsSameSource']={'sourceArticle':'cv1793434','sourceBlockId':'79-bilibili-cn:cv1793434:b0014',
   'url':asset['url'],'reason':'Different captured source asset and example. Shared board layout/similarity alone is not source identity. Never borrow its tile code as the answer here.'}
 next_action={'authorizedNewModelCalls':0,'newConsumers':0,'candidateEdits':0,
  'proposedOnly':{'calls':1,'model':'gpt-6.1-terra','reasoningEffort':'max','type':'independent-point-and-teaching-impact',
   'scope':packet['proposedNext']['scope'],'failedVoidCount':True,'retry':0,'requiresNewAuthorization':True},
  'conditionalIfReadableAndCandidateMustChange':'Separately authorize legal maker1+independent audit1; retain original raw. Not authorized by this packet.',
  'conditionalIfUnreadable':'Independent bound teaching-impact decision required before any limited-unknown acceptance; controller cannot label the public tile non-core.'}
 results.append({'canonical':canonical,'candidate':packet['candidate'],'source':packet['source'],'audit':packet['oldAudit'],
  'targetFigureId':target['figureId'],'location':packet['location'],'bbox':packet['targetBBox'],'neighborBBox':packet['neighborBBox'],
  'nativeSize':packet['nativeSize'],'oldCalls':[x['call']['callId'] for x in packet['oldCalls']],
  'sameShaHistory':packet['sameShaAuditFiles'],'originalImageInOldAudit':True,'onlyBlockingIssue':issues[0],
  'currentUnknowns':target['unknowns'],'currentTranscription':target['transcription'],'currentCaption':target['caption'],
  'reusableFaithfulBodyChecks':len(packet['reusable']['otherBodyChecks']),
  'reusableFaithfulFigureChecks':len(packet['reusable']['otherFigureChecks']),
  'pixelChecks':verified_crops,'alternateCapturedPDF':alternate,'provenClearerSourceFound':False,
  'nextAction':next_action,'status':'needs-repair','integrationAllowed':False,'tileRankReadAttempted':False})
write(L/'captured-search.json',search)
receipt={'schema':'coac248-159-242-zero-call-source-intake/1','recordedAt':datetime.now(timezone.utc).isoformat(),
 'handoff':bindings['handoff.json'],'items':results,'bindings':bindings,
 'captureSearch':{'path':'captured-search.json','sha256':sha(L/'captured-search.json'),'assets':7541,'networkRequests':0},
 'newModelCalls':0,'modelBudgetAuthorized':0,'newConsumers':0,'candidatesChanged':False,'oldAuditsChanged':False,
 'nextIndependentCallsProposedNotAuthorized':2,'newPasses':0,
 'excludedExistingWork':handoff['excludedExistingWork'],
 'chapter100':'Pure-text evidence belongs to existing249 work; no dispatch or budget consumed here.',
 'wholeBookScope':'Source register has256 chapters/303 units/21212 source blocks at244 preparation. Metadata/foreword/appendix remain included;232 covered is a snapshot, not an endpoint.'}
write(L/'receipt.json',receipt)
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d)
for result in results:
 row=next(x for x in d['objects'] if x.get('chapterId')==result['canonical'])
 assert row['candidateSha256']==result['candidate']['sha256']
 row['pointPacketIntake20261028']=result
 row['currentDisposition']='single-public-tile-source-packet-verified-no-model-budget'
 row['nextAction']='Existing244 owner: proposed1 independent terra/max point+teaching-impact call, zero makers; not authorized now. Keep unknown and needs-repair. No blind full review or controller exemption.'
assert d['countsCurrent']==before['countsCurrent'] and d['productionFailureHistory']==before['productionFailureHistory']
selected={x['canonical'] for x in results}
assert all(x==y for x,y in zip(d['objects'],before['objects']) if x.get('chapterId') not in selected)
write(inventory,d,indent=1)
owner=R/'integration/coac248-repair-handoff-20261027.json';ownerbytes=owner.read_bytes();o=load(owner);olditems=copy.deepcopy(o['items'])
for result in results:
 assert not any(x.get('kind')=='single-public-tile-source-intake' and x.get('chapterId')==result['canonical'] for x in o['items'])
 o['items'].append({'kind':'single-public-tile-source-intake','chapterId':result['canonical'],
  'candidate':result['candidate'],'status':'needs-repair','intake':result,
  'receiptPath':'integration/coac248-159-242-zero-20261028/receipt.json','receiptSha256':sha(L/'receipt.json')})
assert o['items'][:len(olditems)]==olditems and owner.read_bytes()==ownerbytes
write(owner,o)
write(L/'owner-added-items.json',o['items'][len(olditems):])
S=R/'integration/coac248-159-242-zero-20261028';S.mkdir(parents=True,exist_ok=True)
for name in ['receipt.json','captured-search.json','owner-added-items.json']:(S/name).write_bytes((L/name).read_bytes())
for entry in bindings.values():assert sha(entry['originalPath'])==entry['sha256']
print(json.dumps({'receiptSha256':sha(L/'receipt.json'),'protectedInputs':len(bindings),
 'canonical':[x['canonical'] for x in results],'cropChecks':4,'nearestChecks':4,
 'newCalls':0,'clearerSourceProven':False,'ownerItemsAdded':2},ensure_ascii=False))
