import json,pathlib,hashlib,shutil
from PIL import Image
O=pathlib.Path(__file__).resolve().parent;P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');S=P/'integration/coac244-next3-zero-20261028'
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(n,x):
 t=json.dumps(x,ensure_ascii=False,indent=2)+'\n';(O/n).write_text(t,encoding='utf-8');(S/n).write_text(t,encoding='utf-8')
for key,box,context,cells,word in [
 ('159',[298,126,324,161],[218,120,330,168],[[222,126,248,161],[248,126,274,161],[274,126,298,161],[298,126,324,161]],'上方牌河按画面从左到右第4张；原朝向保持，不旋转，不读出点数'),
 ('242',[177,144,202,177],[172,108,319,181],[[177,144,202,177],[202,144,225,177],[225,144,249,177]],'上方牌河靠中央一行屏幕最左侧；原朝向保持，不读出点数')]:
 d=load(O/(key+'-input.json'));f=d['targetFigure'];src=pathlib.Path(d['originalImage']['path']);before=bind(src)
 assert before==d['originalImage'];im=Image.open(src);assert getattr(im,'n_frames',1)==1
 # Decode only; crops are byte-for-byte subsets of source RGBA pixels, not repainted detail.
 image=im.convert('RGBA');assets=[]
 for name,bbox in [('target',box),('neighbors',context)]:
  assert 0<=bbox[0]<bbox[2]<=image.width and 0<=bbox[1]<bbox[3]<=image.height
  crop=image.crop(tuple(bbox));path=O/(key+'-'+name+'.png');crop.save(path)
  decoded=Image.open(path).convert('RGBA');assert decoded.size==crop.size and decoded.tobytes()==crop.tobytes()
  enlarged=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST);xp=O/(key+'-'+name+'-x4.png');enlarged.save(xp)
  # Verify every enlarged pixel maps to its original pixel. No interpolation or sharpening.
  xd=Image.open(xp).convert('RGBA');assert all(xd.getpixel((x,y))==crop.getpixel((x//4,y//4)) for y in range(xd.height) for x in range(xd.width))
  assets.append(dict(role=name,bbox=bbox,bboxConvention='native top-left pixels, half-open [x0,y0,x1,y1)',originalPixels=bind(path),pixelSha256=hashlib.sha256(crop.tobytes()).hexdigest(),nearest4=bind(xp),scale=4,resampling='nearest',pixelsVerified=True))
  shutil.copy2(path,S/path.name);shutil.copy2(xp,S/xp.name)
 imagecopy=next(O.glob(key+'-original.*'));shutil.copy2(imagecopy,S/imagecopy.name)
 body=d['candidateData']['body']['blocks'];targetIds=set(f['sourceBlockIds']);at=next(i for i,b in enumerate(body) if set(b['sourceBlockIds'])&targetIds)
 bchecks=d['modelReview']['blockChecks'];fchecks=d['modelReview']['figureChecks'];ichecks=d['modelReview']['imageChecks']
 blockers=[i for i in d['modelReview']['issues'] if i['severity']!='source-note'];assert len(blockers)==1 and blockers[0]['targetId']==f['figureId']
 sourceBlocks=d['sourceData']['blocks'];idx=next(i for i,b in enumerate(sourceBlocks) if b['id'] in targetIds)
 packet=dict(schema='coac244-source-point-context-preparation/1',canonical=d['canonical'],candidate=d['candidate'],source=d['source'],oldAudit=d['audit'],oldCalls=d['calls'],oldModelReview=d['modelReview'],sameShaAuditFiles=d['sameShaAuditFiles'],targetFigure=f,originalImage=before,nativeSize=list(image.size),targetBBox=box,neighborBBox=context,visibleCellBBoxes=cells,location=word,classification='source image present in old independent audit; exact public discard point remains unreadable/uncertain, not an input omission or proved wrong translation; no new tile reading',oldBlockingIssue=blockers[0],oldTargetBlockCheck=[b for b in bchecks if b['id'] in targetIds],oldTargetFigureCheck=[b for b in fchecks if b['id']==f['figureId']],oldTargetImageCheck=[b for b in ichecks if b['id'] in f['sourceOccurrenceIds']],reusable=dict(otherBodyChecks=[b for b in bchecks if b['id'] not in targetIds],otherFigureChecks=[b for b in fchecks if b['id']!=f['figureId']],targetUnknownsRetained=f['unknowns'],note='Faithful non-target independent checks are evidence to inherit, not separate accepted complete chapters.'),sourceContext=sourceBlocks[max(0,idx-2):min(len(sourceBlocks),idx+3)],candidateContext=body[max(0,at-2):min(len(body),at+3)],completeCandidateProse=[b for b in body if b['type']=='text'],assets=assets,newImageDetailGenerated=False,rotationApplied=0,newModelCalls=0,proposedNext=dict(firstBatchIndependentCalls=1,newProducerCalls=0,scope='Only this coordinate plus complete original target-example prose: read if possible and independently assess whether retaining its explicit unknown prevents faithful teaching/argument. Do not label non-core merely because it is unknown or out-of-hand.',outcomes='Readable: retain new independent proof, propose a separately bounded legal producer1+audit1 before changing candidate. Unreadable but independently non-core: only an exact independently bound supplemental review may clear the semantic scope while retaining unknown. Unreadable and material: state exact source detail required, no auto retry.',conditionalLaterProducerCalls=1,conditionalLaterAuditCalls=1,retry=0,notAuthorizedThisStage=True),newReviewNotRun=True)
 assert bind(src)==before;save(key+'-point-packet.json',packet)
 print(key,'native',image.size,'bbox',box,'source pixels exact, nearest4 exact, unknown preserved')
