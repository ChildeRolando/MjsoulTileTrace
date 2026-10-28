import json,datetime
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text(encoding='utf8'))
def write(p,x,indent=2):
 with p.open('w',encoding='utf8',newline='\n') as f:f.write(json.dumps(x,ensure_ascii=False,indent=indent)+'\n')
proof=read(HERE/'verification.json')
entry={'canonical':'79-cn-chapter-182-5','candidateSha256':proof['candidateSha256'],'newCalls':0,'originalMakerAndFirstReviewConsumed':2,'remainingModelBudget':0,'translationTarget':'79-bilibili-cn:cv1760573:b0003','translationVerdict':'faithful','carriedSourceTarget':'79-bilibili-cn:cv1760573:b0013','carriedSourceVerdict':'limited-display-allowed-by-independent-review','specificMeaningStillUnknown':True,'notAnIdentificationTodo':True,'originalUncertainPreserved':True,'annotationInstalled':False,'admissionGranted':False,'wholeChapterPassed':False,'requiredDisplayLimitations':proof['allIndependentLimitations'],'verificationPath':'integration/coac248-182-limits-20261028/verification.json','exactNoteBindingPath':'integration/coac248-182-limits-20261028/note-binding.json','existingOwnerRuns':proof['dedupe'],'remainingAction':proof['exactRemainingAction']}
owner_path=ROOT/'integration/coac244-remaining26-closure-register-20261028.json';owner=read(owner_path);row=next(x for x in owner['rows'] if x['chapterId']=='79-cn-chapter-182-5')
assert 'zeroCall182EvidenceConsumption' not in row,'Already registered: do not duplicate or overwrite later owner state.'
row['previousNextActionBeforeIndependent182']=row.get('nextAction');row['nextAction']='仅零模型落实b0013邻近的独立非原文审校注和四条限制；原句/作者body不变。复用已在途244精确scope适配、250单写者及MCP/Arena读回；不猜“对日”、不再派制作或独审。'
row['zeroCall182EvidenceConsumption']=entry
if 'current182201Authorization' in row:row['current182201Authorization'].update({'phase':'independent-evidence-verified-awaiting-exact-adjacent-editorial-display','independentReviewReservedFor249':0,'independentReviewConsumed':1,'chapterPhaseCallsConsumed':2,'remainingModelBudget':0})
write(owner_path,owner);write(HERE/'owner-row.json',row)
inventory=HERE.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(inventory);item=next(x for x in inv['objects'] if x.get('chapterId')=='79-cn-chapter-182-5');assert item['candidateSha256']==proof['candidateSha256'];item['currentDisposition']='awaiting-exact-editorial-display-and-readback';item['independent182LimitedEvidence']=entry
inv['latest182IndependentEvidenceConsumption']=entry;write(inventory,inv,indent=1)
write(ROOT/'integration/coac248-182-limits-20261028/owner-registration.json',entry);write(HERE/'owner-registration.json',entry)
print(json.dumps({'registered':True,'newCalls':0,'candidateUnchanged':True,'annotationInstalled':False,'ownerRunsReused':True}))
