import json,hashlib,shutil
from pathlib import Path
from PIL import Image
O=Path(__file__).parent;R=Path('E:/AgentData/Coach/knowledge/processing');D=O/'p217-second-tile-packet';D.mkdir(exist_ok=True)
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
old=R/'integration/coac249-p217-single-tile-read-20261027.json';new=R/'integration/coac249-point-222-p217-20261028.json'
request=load(old);handoff=load(new);point=next(c for c in handoff['calls'] if c['chapterId']=='79-cn-chapter-217-4')
asset=R/request['tile']['sourceAsset'];assert hashlib.sha256(asset.read_bytes()).hexdigest()=='64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978'
im=Image.open(asset);assert im.size==(430,463)
shutil.copy2(asset,D/'original.png')
boxes={'original-point-first-row2-col1':[150,325,175,357],'old-dispute-second-row2-col2':[174,325,196,357],'context':[143,292,215,362]}
for k,b in boxes.items():
 crop=im.crop(b);crop.save(D/(k+'.png'));crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST).save(D/(k+'-nearest4x.png'))
assert point['bbox']==boxes['original-point-first-row2-col1'];assert point['result']['tileCode']=='unknown';assert point['result']['outcome']=='unreadable'
row=next(r for r in load('.multica/delivery/coac244-closure26-zero-20261028/remaining26-register.json')['rows'] if r['chapterId']=='79-cn-chapter-215-4')
reviews=[]
for e in row['pdfEvidence']:
 for i in e.get('issues',[]):
  if i.get('targetId')=='79-cn-p217-r1':reviews.append(dict(candidate=e['candidate'],audit=e['audit'],callIds=e['callIds'],issue=i))
packet=dict(schema='coac244-p217-coordinate-corrigendum/1',chapterId='79-cn-chapter-217-4',targetId='79-cn-p217-r1',sourceImage=bind(asset),imagePixels=[430,463],oldRequest=bind(old),newPointHandoff=bind(new),oldRequestedPosition=request['tile']['position'],oldCandidate=request['candidate'],actualPoint=dict(callId=point['callId'],bbox=point['bbox'],raw=point['raw'],model=point['model'],effort=point['reasoningEffort'],conclusion=point['result'],position='north river, row2 col1; immediately below east wind in row1 col1'),notCoveredPosition='north river, row2 col2; immediately right of col1 and below row1 col2',correctedSecondTileBBox=boxes['old-dispute-second-row2-col2'],contextBBox=boxes['context'],rootCause='244 previous packet explicitly selected row2 col1 (historical 5m/6m issue) while old 11:58 request explicitly targets row2 col2 (9m/8m issue); 249 respected input bbox and did not adjudicate neighboring tile. This is a packet selection mismatch, not tool coordinate drift.',existingIndependentEvidence=reviews,claims=dict(firstTile='latest coordinate-bound result unknown, not proof of second tile',secondTile='historical same-image candidate audits exist but conflict remains unadjudicated by this new point call; no majority vote, no pixel similarity verdict',wholePagePassed=False,chapter215Unaffected=True,rev5QuarantinePreserved=True),proposedNextMinimumRequest=dict(targetBBox=boxes['old-dispute-second-row2-col2'],inputs=['original.png','context.png','old-dispute-second-row2-col2.png','old-dispute-second-row2-col2-nearest4x.png'],instruction='Read only north river row2 col2 at supplied bbox in original image coordinates, directly right of the separately reviewed col1. Confirm position against row1 neighbors. Return readable tile or unknown; do not read col1, inherit a candidate label, infer from hand legality, or pass the full figure/page.',excludedFromModelPayload=['historical candidate tile codes','old review suggested answers','vote counts','pixel similarity'],extraCallsRequired=1,automaticRetry=0,notDispatched=True,model='gpt-6.1-terra',effort='max'),modelCalls=0,pixelProcessing='exact crops plus nearest-neighbor zoom only; no semantic verdict or generated detail')
save(D/'packet.json',packet);save(O/'p217-location-corrigendum.json',packet)
print(json.dumps(dict(actualCall=point['callId'],actualSlot='row2-col1',oldRequestSlot='row2-col2',newPacketSecondBBox=packet['correctedSecondTileBBox'],modelCalls=0)))
