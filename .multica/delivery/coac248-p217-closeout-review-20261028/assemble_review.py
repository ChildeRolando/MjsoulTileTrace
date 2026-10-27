"""Build a reviewable, zero-model scope/unknown inventory; never edit candidates or receipts."""
import copy
import hashlib
import json
import pathlib
import zipfile
from datetime import datetime, timezone
from PIL import Image

R = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
L = pathlib.Path(__file__).resolve().parent
E = L/'evidence'; E.mkdir(parents=True, exist_ok=True)
NOW = datetime.now(timezone.utc).isoformat()
def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x): pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
bindings = []
def bind(label,path,expected=None,copy_file=True):
    p=pathlib.Path(path); h=sha(p)
    if expected: assert h==expected,(label,h,expected)
    name=label+p.suffix
    if copy_file: (E/name).write_bytes(p.read_bytes())
    b={'label':label,'path':str(p),'sha256':h,'copy':('evidence/'+name if copy_file else None)}
    bindings.append(b);return b

cp = R/'production/sol-high-field-repair26-20261027-p217e/candidates/79-cn/page-0217.json'
parent = R/'production/sol-high-field-repair25-20261027-p217d/candidates/79-cn/page-0217.json'
cb = bind('current-rev5',cp,'7766c2217ecb1bc04dfa98ecad9ca9d0e1221a695259a791d1d214e3a8c77777')
pb = bind('parent-rev4',parent,'99f98c0257142c5a02f701b0293263e7fa9d28f34cf6a023ca6dca79bd267101')
c=load(cp);p=load(parent);f=c['figures'][0]
def diff(a,b,path=''):
    if type(a)!=type(b):return [path]
    if isinstance(a,dict):return [q for k in set(a)|set(b) for q in ([path+'/'+k] if k not in a or k not in b else diff(a[k],b[k],path+'/'+k))]
    if isinstance(a,list):return [path] if len(a)!=len(b) else [q for i,(x,y) in enumerate(zip(a,b)) for q in diff(x,y,path+'/'+str(i))]
    return [] if a==b else [path]
changes=sorted(diff(p,c))
assert changes==['/candidateSha256','/figures/0/transcription','/figures/0/unknowns']
assert c['body']==p['body'] and len(f['unknowns'])==1
auditp=R/'audit/pages/79-cn'/f'page-0217.{pb["sha256"]}.6baa4a7e1404.json'
ab=bind('parent-independent-page-audit',auditp,'44e101c7fbf8813d9db7a18af177a42b27b51ebaf92945761787b8b25764b3ec')
a=load(auditp); ar=a['modelReview']
assert a['production']['sha256']==pb['sha256'] and ar['completePageCompared']
assert all(x['verdict']=='faithful' for x in ar['bodyChecks'])
rawp=R/'audit/calls/4f760999-1648-410e-8452-1c1b4794503f.json'
bind('parent-independent-page-raw',rawp);raw=load(rawp)
assert raw['structuredOutput']==ar and raw['productionSha256']==pb['sha256']
firsthp=R/'integration/coac249-point-222-p217-20261028.json'
bind('first-point-handoff',firsthp,'60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9')
first=load(firsthp)['calls'];first=next(x for x in first if x['callId']=='09362d05-d221-427e-b474-a79017ff7619')
first_raw=bind('first-point-raw',first['raw']['path'],first['raw']['sha256'])
first_receipt_path=pathlib.Path(first['raw']['path'].replace('.raw.json','.receipt.json'))
assert load(first_receipt_path)==first
first_receipt=bind('first-point-receipt',first_receipt_path)
assert first['result']['outcome']=='unreadable'
secondhp=R/'integration/coac249-p217-second-point-20261028.json'
bind('second-point-handoff',secondhp,'b1ee9973976f05f59d32acc9594e78b4d6dc2928a8061bc82a009b709c5cc70d')
second=load(secondhp); sr=second['pointReceipt']
bind('second-point-raw',sr['raw']['path'],sr['raw']['sha256'])
assert sr['result']['tileCode']=='9m' and second['comparison']['newReadingMatchesCandidate']
original=R/'assets/64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978.png'
ib=bind('original-p217-b8',original,f['sourceImageSha256s'][0]);assert Image.open(original).size==(430,463)
bind('pdf-page-image',R/c['provenance']['renderedPage']['path'],c['provenance']['renderedPage']['sha256'])
bind('pdf-region-image',R/f['croppedImagePath'],f['croppedImageSha256'])
chain=L.parent/'coac-248-native-inline-correction/receipt-p217-revision-chain-20261027.json'
bind('historical-revision-chain',chain)
webp=R/'web-production/v1/candidates/79-bilibili-cn/cv1775174.display.json'
wb=bind('alternative-web-candidate',webp,'4e9e896794fce70fbcbfed0b223c6cfd2e7c643c7713556e5d096ab7a7df8de0');web=load(webp)
waudit=R/'audit/web/articles/79-bilibili-cn'/f'cv1775174.{wb["sha256"]}.json'
wab=bind('alternative-web-audit',waudit);wa=load(waudit)
bind('alternative-web-source',R/web['source']['sourcePath'],web['source']['sourceSha256'])
teaching=next(b for b in web['body']['blocks'] if b.get('sourceBlockIds')==['79-bilibili-cn:cv1775174:b0005'])
teaching_check=next(x for x in wa['modelReview']['blockChecks'] if x['id']=='79-bilibili-cn:cv1775174:b0005')
assert teaching_check['verdict']=='faithful'
regp=R/'integration/coac250-unified-chapter-register-20261027b.json';bind('register',regp,copy_file=False)
regrow=next(x for x in load(regp)['rows'] if x['chapterId']=='79-cn-chapter-217-4');write(E/'register-row.json',regrow)
mapfile=R/'integration/chapter-map.json';bind('chapter-map',mapfile,copy_file=False)
chapters=[x for x in load(mapfile)['chapters'] if x['id'] in ['79-cn-chapter-217-4','79-cn-chapter-215-4']];write(E/'canonical-scopes.json',chapters)
pointerp=R/'integration/accepted-preview-current.json';bind('preview-pointer',pointerp)
pointer=load(pointerp);idxp=pathlib.Path(pointer['output'])/'knowledge-index.json';bind('preview-index',idxp,copy_file=False)
idx=load(idxp);assert any(x['id']=='79-cn-chapter-215-4' for x in idx['chapters'])
assert not any(x['id']=='79-cn-chapter-217-4' for x in idx['chapters'])
owner_code=pathlib.Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/scene-study/textbook-audit.mjs')
bind('current-audit-contract',owner_code,copy_file=False)
rules=owner_code.read_text(encoding='utf-8').splitlines()
contract=[{'line':i+1,'text':s} for i,s in enumerate(rules) if '图中本来不可知的内容可明确标作未知' in s or 'unreadable' in s and i<18]
write(E/'contract-excerpts.json',contract)

first_item={'id':'north-row2-col1','position':'北家舍牌第二行第一张','bbox':[150,325,175,357],
 'kind':'visible-man-number-unreadable','sourcePixels':[430,463],'currentCandidate':'5m，且unknowns中尚无北家这一条',
 'independentReading':'万子，数字unknown','independentCallId':first['callId'],
 'independentTeachingImpact':first['result']['teachingImpact'],
 'effectConfirmedScope':'仅确认不妨碍关于下家染索子一色手及扣牌的总体说明；不能扩张为对完整策略推导逐项验收。',
 'sourceTeachingReferences':{'textBlock':'79-bilibili-cn:cv1775174:b0005','textCheck':teaching_check,
    'explicitNamedTiles':['9饼两家切过，作为立直时的安全牌保留','拆掉8万对子、扣索子'],
    'locatorObservation':'该段没有按位置点名北家第二行第一张；这是文本定位事实，不代替独立影响判断。'},
 'remainingAction':'先形成两字段一致的unknown展示/校注提案，不猜5m/6m；当前rev5的5m断言不能凭附加证明直接放行。',
 'proposalEligibleForGeneralExplanation':True,'currentCandidateAcceptableAsIs':False}
west_item={'id':'west-row2-col2','position':'西家舍牌自身第二行第二张；画面左侧外列自上第二张、旋转万子',
 'bbox':None,'bboxNote':'既有独审仅给上述位置，未绑定像素bbox；不把北家bbox借给西家。',
 'kind':'visible-man-number-unreadable','sourcePixels':[430,463],
 'currentCandidate':'transcription已写万子（数字未辨清）；unknowns有且仅有西家该条。',
 'independentEvidence':ar['issues'][1], 'independentCallId':'4f760999-1648-410e-8452-1c1b4794503f',
 'independentTeachingImpact':None,'effectAssessment':'影响未确认。旧审只要求不要赋8m、明确unknown；并未认定该未知对原文推导无影响。',
 'sourceTeachingReferences':'b0005的已审论证点名9饼、8万对子及索子扣牌，未按位置点名西家该张；不能据此由主控自判非核心。',
 'remainingAction':'仅补核此unknown及第一张unknown的展示一致性、对b0005完整扣牌论证的影响，复用原完整图/父审/正文，不要求猜出数字或整页重审。',
 'minimalConditionalReviewScope':['定位西家该旋转万子并确认原分辨率下不可辨的限制','检查rev5西家unknown展示是否忠实执行父审要求',
   '结合完整b0005（含PDF218续文）判明两个unknown会否改变染索、9饼安全牌、拆8万对子扣索子的各项结论'],
 'newCallAuthorized':False,'currentCandidateAcceptanceProven':False}
resolved={'id':'north-row2-col2','bbox':[174,325,196,357],'candidate':'9m','independent':'9m','callId':sr['callId'],
 'status':'resolved-no-code-change-required','notRemainingUnknown':True,'historical8mReceiptsPreserved':True}
proposal={'schema':'coac248-p217-bounded-unknowns-review-proposal/1','recordedAt':NOW,
 'authorizationCommentId':'01a17ee3-7daf-783e-8b49-7a5551ca2111','chapterId':'79-cn-chapter-217-4',
 'figureId':'79-cn-p217-r1','sourceImageBlockId':'79-cn-p217-b8','candidate':cb,'parent':pb,'parentAudit':ab,
 'parentToCurrentChangedFields':changes,'parentBodyAndOtherFieldsUnchanged':True,
 'visibleUnresolvedItems':[first_item,west_item],'resolvedItem':resolved,
 'naturalUnknowns':[{'position':'南/西/东家背面暗手13/13/10张','kind':'source-hidden-not-transcription-gap',
   'basis':'审校契约明确未知暗手不可推断；父审其余可辨信息、牌背对应未列新错。'},
   {'position':'中央ドラ栏的西3z究竟为宝牌或指示牌','kind':'source-unlabelled-role',
    'basis':ar['figureChecks'][0]['explanation'],'handling':'保持原图未注明角色的限定措辞，不补造宝牌性质。'}],
 'boundedAcceptanceProposal':{'state':'proposal-only-not-approved','useExistingFields':['figure.transcription','figure.unknowns','原文之后明确标非原文的限制校注'],
   'suggestedNorthText':'仅把北家第二行第一张的确定5m标为万子（数字未辨清），第二张9m保持；同时列北家坐标unknown。',
   'suggestedReaderNote':'校注（非原文）：北家第二行第一张及西家第二行第二张万子点数未辨清。前者已有独立证据确认不妨碍总体扣牌说明；精确牌谱复原和依赖这些数字的推演受限。西家该未知对完整教学推导的影响仍待限定核验。',
   'noGuessing':True,'noCandidateEditsThisStage':True,
   'contractBoundary':'现行审校契约对可见但看不清内容仍要求uncertain/needs-repair。已有unknown字段是展示机制，并非自动通过豁免；提案提交现有owner，不改全局门禁。',
   'minimumEvidenceGap':'西家unknown及完整b0005教学影响/展示执行确认；第一张不再重复识字，第二张9m不再复审。',
   'noWholePageRepeatNeededByProposal':True,'callsDispatched':0},
 'scopeDecision':{'p217OwnedBy2174':[b.get('sourceBlockIds') or [b.get('figureId')] for b in c['body']['blocks'] if b.get('chapterId')=='79-cn-chapter-217-4' or b.get('figureId')=='79-cn-p217-r1'],
   'alreadyReviewedTextIds':[x['id'] for x in ar['bodyChecks'] if x['verdict']=='faithful'],
   'chapter2174Range':'p217-b4 through p220-b3, one unit,22 owned source blocks',
   'newIndependentlyClosableCompleteChapterOrUnit':False,
   'reason':'215-4已在当前预览，无需重复。217-4只有一个跨217–220页的单元；p217已审正文块不是完整独立章。PDF路线缺218–220通过稿，网页替代路线仍有b0004/b0010两图六张未知。',
   'accepted2154AlreadyInPreview':True,'2174InPreview':False,'newChapterCount':0,'partialBlocksNotPromotedToChapter':True},
 'alternativeWebRoute':{'candidate':wb,'audit':wab,'currentSourceSha256':web['source']['sourceSha256'],
   'remainingUnknowns':[{'figureId':x['figureId'],'items':x['unknowns'],'sourcePixels':list(Image.open(R/x['sourceAssetBindings'][0]['path']).size),
     'sourceImageSha256':x['sourceAssetBindings'][0]['sha256']} for x in web['figures'] if x['unknowns']],
   'independentCompletenessJudgment':wa['modelReview']['semanticCompleteness'],
   'notAddedToPdfUnknownCount':True,'noPointEvidenceTransferredAcrossUnverifiedDifferentAssets':True,'workDispatched':False},
 'teachingContext':{'completeParagraph':teaching['text'],'independentParagraphCheck':teaching_check,'pdf218ContextFromParentAudit':a['neighboringContext']['next']},
 'bindings':bindings,'originalStatusesPreserved':True,'integrationAllowed':False,'modelCalls':0,'candidateEdits':0,
 'oldReceiptEdits':0,'nextModelBatchCreated':False,'toExistingOwner':'COAC-244','reviewPartner':'COAC-249 only after further explicit scope/budget authorization'}
write(L/'review-handoff.json',proposal)
hp=R/'integration/coac248-p217-unknowns-closeout-proposal-20261028.json'
assert not hp.exists();write(hp,proposal)
invp=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
ibefore=invp.read_bytes();inv=load(invp);previous=copy.deepcopy(inv)
row=next(x for x in inv['objects'] if x.get('objectId')=='79-cn:page:217')
row['zeroModelCloseoutReview']={'path':str(hp.relative_to(R)),'sha256':sha(hp),
 'remainingVisibleUnknowns':2,'northFirst':'independently-general-noncritical-but5m-assertion-still-needs-unknown-display',
 'west':'unknown-display-present-but-teaching-impact-not-independently-confirmed',
 'northSecond':'resolved9m-no-further-repair','proposalOnly':True,'newCalls':0,'newCandidates':0,
 'newCompleteChaptersClosable':0}
row['nextAction']='Existing244 owner review of the bound two-unknown proposal: north first requires truthful unknown display; west requires only scoped impact/display confirmation. North second9m resolved. No new model call or candidate edit authorized.'
inv['refreshedAt']=NOW
assert inv['countsCurrent']==previous['countsCurrent'] and inv['productionFailureHistory']==previous['productionFailureHistory']
changed=[i for i,(x,y) in enumerate(zip(previous['objects'],inv['objects'])) if x!=y];assert changed==[1]
op=R/'integration/coac248-repair-handoff-20261027.json';ob=op.read_bytes();o=load(op)
item=next(x for x in o['items'] if x.get('kind')=='pdf-page-point-evidence' and x.get('chapterId')=='79-cn-chapter-217-4')
item['zeroModelCloseoutReview']=row['zeroModelCloseoutReview'];o['feedbackUpdatedAt']=NOW
for b in bindings:assert sha(b['path'])==b['sha256'],b['label']
assert op.read_bytes()==ob and invp.read_bytes()==ibefore
write(op,o);invp.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
write(L/'verification.json',{'newCalls':0,'candidateEdits':0,'oldReceiptEdits':0,'boundFilesUnchanged':len(bindings),
 'changedInventoryRows':changed,'remainingPdfVisibleUnknowns':2,'northSecondResolved':True,'newCompleteChapters':0,
 'independentImpactNotInvented':True,'globalGatesChanged':False,'countsAndFailureHistoryPreserved':True,
 'ownerFile':str(op),'ownerSha256':sha(op),'reviewHandoffPath':str(hp),'reviewHandoffSha256':sha(hp)})
with zipfile.ZipFile(L/'review-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in E.iterdir():z.write(f,'evidence/'+f.name)
    for n in ['review-handoff.json','verification.json']:z.write(L/n,n)
print(json.dumps({'remainingPdfVisibleUnknowns':2,'northSecondResolved':True,'newCalls':0,'boundFiles':len(bindings),'changedRows':changed,'handoffSha256':sha(hp)}))
