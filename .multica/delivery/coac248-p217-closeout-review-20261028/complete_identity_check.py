"""Add exact source-pixel reuse and mechanically located cross-candidate differences."""
import hashlib
import json
import pathlib
import zipfile
from PIL import Image

L=pathlib.Path(__file__).resolve().parent
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
hp=R/'integration/coac248-p217-unknowns-closeout-proposal-20261028.json'
h=load(hp); web=load(h['alternativeWebRoute']['candidate']['path'])
asset=web['figures'][0]['sourceAssetBindings'][0];wp=R/asset['path']
orig=R/'assets/64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978.png'
a=Image.open(orig).convert('RGBA');b=Image.open(wp).convert('RGBA')
assert a.size==b.size==(430,463) and a.tobytes()==b.tobytes()
assert sha(wp)==asset['sha256']
(L/'evidence/web-b0004-original.png').write_bytes(wp.read_bytes())
binding={'label':'web-b0004-original','path':str(wp),'sha256':sha(wp),'copy':'evidence/web-b0004-original.png'}
h['bindings'].append(binding)
h['alternativeWebRoute']['exactPixelIdentityWithPdfB8']={
 'pdfOriginalFileSha256':sha(orig),'webOriginalFileSha256':sha(wp),'size':[430,463],
 'mode':'RGBA','decodedPixelSha256':hashlib.sha256(a.tobytes()).hexdigest(),
 'allPixelsEqual':True,'geometricTransform':'none','method':'Exact byte comparison of fully decoded RGBA; no OCR, similarity threshold or generated detail.',
 'reuseBoundary':'Coordinate-bound original-image evidence can be rebound by this exact identity proof. It does not turn a different candidate or a needs-repair parent into a passed candidate.'}
h['alternativeWebRoute']['reusablePdfOrdinalEvidence']=[
 {'webUnknown':'A','webPosition':'左家左列自上第2张','pdfPosition':'西家第二行第二张','pdfEvidence':'万子数字unknown','status':'same unresolved West position; do not guess'},
 {'webUnknown':'B','webPosition':'左家左列自上第3张','pdfPosition':'西家第二行第三张','pdfAuditedTranscription':'2m'},
 {'webUnknown':'C','webPosition':'右家左列自上第2张','pdfPosition':'东家第一行自身顺序第5张','pdfAuditedTranscription':'7m'},
 {'webUnknown':'D','webPosition':'右家左列自上第5张','pdfPosition':'东家第一行自身顺序第2张','pdfAuditedTranscription':'2m'},
 {'webUnknown':'E','webPosition':'右家右列自上第3张','pdfPosition':'东家第二行自身顺序第2张','pdfAuditedTranscription':'9m'}]
h['alternativeWebRoute']['ordinalMappingQualification']='Mechanical alignment of the candidates\' explicitly stated reading orders on identical original pixels. Four existing audited PDF tokens are evidence for a future legally scoped revision, not new visual judgments or edits. Retain both independent parent reviews and require the existing change-review contract before acceptance.'
h['alternativeWebRoute']['samePixelCandidateDifferences']=[
 {'position':'北家第二行第一张','web':'9m','pdfRev5':'5m','newIndependent':'万子数字unknown','minimumHandling':'Both current assertions require truthful unknown display; no number rereading.'},
 {'position':'北家第二行第二张','web':'8m','pdfRev5':'9m','newIndependent':'9m','minimumHandling':'PDF point closed; web8m is not cleared by an audit of PDF9m. Exact pixels support a future scoped web correction to9m without re-adjudicating the same point.'},
 {'position':'西家第二行末张（左家外列第4张）','web':'7m','pdfParentAndRev5':'6m','minimumHandling':'Existing independent source-review conflict. Keep both bound receipts, no coordinator visual verdict.'},
 {'position':'右上白碰横置位置','web':'第一/三张横置，中张竖置','pdfParentAndRev5':'中张横置','minimumHandling':'Existing independent representation conflict, requiring only this orientation/direction field to be checked if the web route is pursued.'},
 {'position':'中央ドラ栏角色','web':'直接称宝牌3z','pdfParentAndRev5':'显示西3z，源未注明宝牌还是指示牌','minimumHandling':'Parent PDF review explicitly endorsed not inferring the role; web role assertion cannot silently inherit that check.'}]
h['alternativeWebRoute']['otherFigureStillOpen']='b0010 unknownA，右家右列首张，与左列第4张对齐，原图433×462；现有独审认定可见弃牌不完整并保持阻断，未给非核心影响豁免。'
h['alternativeWebRoute']['actualRemainingMeaning']='Six stored web unknown entries are not six new unique PDF problems: b0004 A is the same West unknown and B–E have exact-pixel PDF parent transcription evidence; b0010A is a different scene. Two North assertions and three further known-field/role differences also prevent as-is web acceptance.'
h['scopeDecision']['reason']='215-4已在当前预览，无需重复。217-4只有一个跨217–220页的单元，p217已审正文块不是完整独立章。PDF路线缺218–220通过稿；网页替代稿仍有六条unknown、北家两张的已知断言不符新单点，以及同像素跨稿牌码/横置/角色差异。本轮只形成最小目标交接，不扩为批量重制。'
write(L/'review-handoff.json',h);write(hp,h)
invp=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=load(invp)
row=next(x for x in inv['objects'] if x.get('objectId')=='79-cn:page:217');row['zeroModelCloseoutReview']['sha256']=sha(hp)
row['zeroModelCloseoutReview']['exactWebB0004PixelsMatchPdf']=True
row['zeroModelCloseoutReview']['webRouteKnownFieldDifferencesRecorded']=5
invp.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
op=R/'integration/coac248-repair-handoff-20261027.json';o=load(op)
item=next(x for x in o['items'] if x.get('kind')=='pdf-page-point-evidence' and x.get('chapterId')=='79-cn-chapter-217-4')
item['zeroModelCloseoutReview']=row['zeroModelCloseoutReview'];write(op,o)
v=load(L/'verification.json');v.update(boundFilesUnchanged=len(h['bindings']),reviewHandoffSha256=sha(hp),ownerSha256=sha(op),
    exactDecodedPixelIdentity=True,webDifferencesAreExistingEvidenceComparisonsNotNewVisualVerdicts=True)
for x in h['bindings']:assert sha(x['path'])==x['sha256'],x['label']
write(L/'verification.json',v)
with zipfile.ZipFile(L/'review-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in (L/'evidence').iterdir():z.write(f,'evidence/'+f.name)
 for n in ['review-handoff.json','verification.json']:z.write(L/n,n)
print(json.dumps({'newCalls':0,'sameDecodedPixels':True,'storedWebUnknowns':6,'crossCandidateDifferences':5,'handoffSha256':sha(hp)}))
