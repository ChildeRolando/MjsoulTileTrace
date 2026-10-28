import json
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text(encoding='utf8'))
def save(p,x,indent=2):
 with p.open('w',encoding='utf8',newline='\n') as f:f.write(json.dumps(x,ensure_ascii=False,indent=indent)+'\n')
v=read(H/'verification.json');entry={'canonical':v['canonical'],'candidateSha256':v['candidate']['sha256'],'independentCallId':v['independentCall']['callId'],'status':v['status'],'textRepair':v['exactOriginalModelOutput']['textRepair'],'figureRepair':v['exactOriginalModelOutput']['figureRepair'],'unknownImpact':v['exactOriginalModelOutput']['unknownImpact'],'argumentChecks':v['exactOriginalModelOutput']['argumentChecks'],'issues':v['exactOriginalModelOutput']['issues'],'verification':v['verification'],'orderedContextFaithful':v['rawOrderedContextFaithful'],'originalFalseRetained':True,'minimumResidual':v['minimumResidual'],'remainingModelBudget':0,'phaseCallsConsumed':2,'noAdditionalIdentificationTasks':True,'displayLimitationsInstalled':False,'wholeChapterPassed':False,'admissionGranted':False,'verificationPath':'integration/coac248-jp193-return-20261028/verification.json','existingOwnerDelivery':v['dedupe'],'newModelCalls':0}
p=R/'integration/coac244-remaining26-closure-register-20261028.json';owner=read(p);row=next(r for r in owner['rows'] if r['chapterId']==v['canonical']);assert 'jp193FirstIndependentReturn' not in row,'Already registered; preserve later state.'
row['nextActionBeforeJp193Return']=row.get('nextAction');row['nextAction']='当前SHA不准入：唯一实际修订残留为b0081入り目例外被扩成两个未经原文确立的联立条件，影响b0081–0097的听牌/概率论证。保留已独审faithful的6p图修及4unknown；7条非原文限制只存证、尚未安装。本章2/2额度耗尽，停止制作/重审/识字，后续仅在另有明确授权及精确合法入口时处理该文字子句。';row['jp193FirstIndependentReturn']=entry
row['current193213Authorization'].update({'phase':'returned-repair-needed-exact-b0081-residual','independentReviewReservedFor249':0,'independentReviewConsumed':1,'chapterPhaseCallsConsumed':2,'remainingModelBudget':0,'wholeChapterPassed':False});save(p,owner);save(H/'owner-row.json',row)
p=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(p);items=[r for r in inv['objects'] if r.get('chapterId')==v['canonical']]
for row in items:
 assert row['candidateSha256']==v['candidate']['sha256'];row['currentDisposition']='returned-repair-needed-exact-b0081-residual';row['jp193FirstIndependentReturn']=entry
inv['jp193FirstIndependentReturn']=entry;save(p,inv,1)
save(H/'owner-registration.json',entry);save(R/'integration/coac248-jp193-return-20261028/owner-registration.json',entry)
print(json.dumps({'registered':True,'canonical':v['canonical'],'remainingModelBudget':0,'figureFaithfulKept':True,'minimumResidual':'b0081','newCalls':0,'wholeChapterPassed':False}))
