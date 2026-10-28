import json
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent
def load(p):return json.loads(p.read_text(encoding='utf8'))
def save(p,x,indent=2):
 with p.open('w',encoding='utf8',newline='\n') as f:f.write(json.dumps(x,ensure_ascii=False,indent=indent)+'\n')
v=load(H/'verification.json')
entry={'canonical':v['canonical'],'candidateSha256':v['candidateSha256'],'independentCall':v['independentCall']['callId'],'translationVerdict':'faithful','unknownImpact':'independently-allowed-with-five-actual-non-author-limits','tileStillUnknown':'rightNorthRiver-innerColumn-bottom-?m','notAnIdentificationTodo':True,'originalUncertainAndSourceNotePreserved':True,'newCalls':0,'chapterPhaseConsumed':2,'remainingModelBudget':0,'batch182201Consumed':4,'batch182201Remaining':0,'fiveLimitsInstalledInExistingStage':True,'globalReadbackVerifiedBy248':False,'wholeChapterPassed':False,'globalAdmissionClaimedBy248':False,'stagePath':v['stagePath'],'loader':v['loader'],'loaderManifestSha256':v['loaderManifestSha256'],'verificationPath':'integration/coac248-201-limits-20261028/verification.json','requiredDisplayLimitations':v['independentVerification']['requiredDisplayLimitations'],'remainingAction':v['remainingAction'],'existingOwners':v['globalStateAtCheck']}
p=R/'integration/coac244-remaining26-closure-register-20261028.json';owner=load(p);row=next(r for r in owner['rows'] if r['chapterId']==v['canonical']);assert 'zeroCall201EvidenceConsumption' not in row,'Already registered; do not overwrite later owner state.'
row['previousNextActionBeforeIndependent201']=row.get('nextAction');row['nextAction']='不填北家?m，不再收费识字/复审。现有244精确stage已安装5条非原文限制，复用已在途250单写者做持久精确路由及真实MCP/Arena读回；保留作者安全判断条件和追立可能性，覆盖仅在读回后更新。';row['zeroCall201EvidenceConsumption']=entry
row['current182201Authorization'].update({'phase':'independent-evidence-and-existing-stage-five-limits-verified-awaiting-global-readback','independentReviewConsumed':1,'independentReviewReservedFor249':0,'chapterPhaseCallsConsumed':2,'remainingModelBudget':0});save(p,owner);save(H/'owner-row.json',row)
p=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=load(p);row=next(r for r in inv['objects'] if r.get('chapterId')==v['canonical']);assert row['candidateSha256']==v['candidateSha256'];row['currentDisposition']='awaiting-global-exact-limited-display-readback';row['independent201LimitedEvidence']=entry;inv['latest201IndependentEvidenceConsumption']=entry;save(p,inv,1)
save(H/'owner-registration.json',entry);save(R/'integration/coac248-201-limits-20261028/owner-registration.json',entry)
print(json.dumps({'registered':True,'newCalls':0,'existingStageFiveLimitsVerified':True,'globalReadbackOwnedByExisting250':True}))
