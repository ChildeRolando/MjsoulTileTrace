"""Prepare exact bounded corrections and source-bound notes; never admit an unsupported draft."""
import copy
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime,timezone

R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
E=L/'evidence';E.mkdir(parents=True,exist_ok=True)
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
hp=R/'integration/coac249-p217-west-impact-20261028.json'
assert sha(hp)=='1fe84448edbf053d6a61ea4bb550518d6a4875df566347b72964ad8f8a65dedd'
h=load(hp);receipt=h['receipt'];d=R/'audit/point-adjudications/coac249-p217-west-impact-20261028'
assert sha(d/'receipt.json')=='5f2e2fd009758c3df6d435073bf1f9dcb80c6f033f06213d931a668ef957e18b'
assert sha(d/'raw.json')=='fa68f2f3be0e6b2eb496007d6d5638c7cc7aabd322975cfa24e048d96e849e81'
raw=load(d/'raw.json');assert raw['output']==receipt['result'] and raw['success']
assert receipt['classification']=='limited-unknown-acceptable'
assert all(x['dependency']=='independent-of-target-number' for x in receipt['result']['premiseChecks'])
assert len(receipt['result']['premiseChecks'])==6 and not receipt['result']['tileRankReadAttempted']
assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max'
assert len(raw['requestExecution']['images'])==6
for name in ['raw.json','receipt.json','verification.json','handoff.json','attempt.json']:(E/('west-impact-'+name)).write_bytes((d/name).read_bytes())
cp=pathlib.Path(receipt['target']['candidate']['path']);cb=cp.read_bytes();parent=load(cp)
assert sha(cp)=='7766c2217ecb1bc04dfa98ecad9ca9d0e1221a695259a791d1d214e3a8c77777'
(E/'parent-rev5.json').write_bytes(cb)
original=R/'production/sol-high-fallback-finite-20261024-schemafix/raw-calls/e12aa4a6-65f4-4a23-9579-09f887f568be.json'
assert sha(original)=='6112c207fc1d5922e88af671f0a02b7e13623af7edee15a18a9b0c76bed59203'
original_raw=load(original);assert original_raw['parsedOutput']['figures'][0]['unknowns']==[]
(E/'original-production-raw.json').write_bytes(original.read_bytes())
prior=R/'integration/coac249-point-222-p217-20261028.json';assert sha(prior)=='60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9'
points=load(prior);first=next(x for x in points['calls'] if x['callId']=='09362d05-d221-427e-b474-a79017ff7619')
assert first['result']['outcome']=='unreadable';(E/'north-first-point-handoff.json').write_bytes(prior.read_bytes())
second=R/'integration/coac249-p217-second-point-20261028.json';assert sha(second)=='b1ee9973976f05f59d32acc9594e78b4d6dc2928a8061bc82a009b709c5cc70d'
assert load(second)['pointReceipt']['result']['tileCode']=='9m';(E/'north-second-point-handoff.json').write_bytes(second.read_bytes())
runtime=R/'audit/runtimes/coac244-vision-terra-max-v1-20261027';manifest=runtime/'runtime-manifest.json'
assert sha(manifest)==receipt['manifestSha256']
for f in load(manifest)['files']:assert sha(runtime/f['path'])==f['sha256']
fig=parent['figures'][0];assert fig['chapterId']=='79-cn-chapter-217-4' and fig['sourceImageBlockIds']==['79-cn-p217-b8']
assert fig['transcription'].count('第二行5m 9m。')==1
new_transcription=fig['transcription'].replace('第二行5m 9m。','第二行万子（数字未辨清） 9m。')
west=fig['unknowns'][0]+' 原嵌图坐标[81,175,112,199)，西家自身第二行第二张；保留未知，不赋点数。'
north='北家舍牌第二行第一张为万子，数字未辨清；原嵌图坐标[150,325,175,357)，不再赋5m或6m。第二张9m另有独立坐标裁决，保持不变。'
changes=[{'target':'figure','figureId':fig['figureId'],'field':'transcription','fromValue':fig['transcription'],'toValue':new_transcription,
          'replacements':[{'from':'第二行5m 9m。','to':'第二行万子（数字未辨清） 9m。','occurrences':1}]},
         {'target':'figure','figureId':fig['figureId'],'field':'unknowns','fromValue':fig['unknowns'],'toValue':[west,north],
          'requiresExistingEntryReplacementAndOneBoundedInsertion':True}]
note='【审校注（非原文）：图中北家舍牌第二行第一张及西家舍牌第二行第二张均为万子，数字未辨清。西家该数字不影响本段亲家染索、南场领先、无役愚形一向听、留两家切过的9饼、拆8万对子扣索及争取亲家未听下庄的六项论证；北家第一张的未知不妨碍总体扣牌说明。两处未知限制精确牌谱复原，不能据此确定相关万子的精确可见张数、余张、进张和安全度。原文“现在亲家应该还没有听牌吧”为推测，扣索是战术意图，不证明对手暗手、实际结局、打法绝对安全或最优。】'
page218=R/'79-cn/pages/218.json';assert sha(page218)=='83d1909e9e92a9622c46c9ba0ea46efca12bef60cb27ec5b35d72fcbd8f92abd'
block=next(b for b in load(page218)['blocks'] if b['id']=='79-cn-p218-b3')
text=''.join(x['text'] for x in block['lines']);needle='施行让亲家未听下庄的战术。'
assert text.count(needle)==1
note_proposal={'kind':'non-author-limitation-note-not-installed','text':note,'chapterId':'79-cn-chapter-217-4',
 'placement':{'sourceBlockId':'79-cn-p218-b3','sourcePageSha256':sha(page218),'afterExactText':needle,
              'afterCharacterOffset':text.index(needle)+len(needle),'beforeNextSection':'后付的字牌'},
 'authorTextUnchanged':True,'placementReason':'Preserve the full continuous217–218 argument before the note; do not insert a disclaimer into the original paragraph or before its continuation.',
 'notCurrentCaptionEdit':True,'installed':False}
draft=copy.deepcopy(parent);draft['figures'][0]['transcription']=new_transcription;draft['figures'][0]['unknowns']=[west,north]
draft['productionStatus']='quarantined-pending-exact-field-contract-admission'
draft['provenance']['pendingBoundedCorrection']={'method':'deterministic-user-authorized-field-proposal-not-new-model-output',
 'parentSha256':sha(cp),'newProductionModelCalls':0,'changes':changes,'impactReceiptSha256':sha(d/'receipt.json'),
 'admitted':False,'limitationNote':'limitation-note-proposal.json'}
draft.pop('candidateSha256',None);draft['candidateSha256']=hashlib.sha256(json.dumps(draft,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
write(L/'draft-page-0217.rev6.json',draft);write(L/'limitation-note-proposal.json',note_proposal)
assert draft['body']==parent['body'] and draft['figures'][0]['caption']==fig['caption']
assert draft['figures'][0]['transcription'].count(' 9m。')==1
assert cp.read_bytes()==cb
now=datetime.now(timezone.utc).isoformat()
plan={'schema':'coac248-p217-bounded-field-implementation-plan/1','recordedAt':now,'chapterId':'79-cn-chapter-217-4',
 'figureId':'79-cn-p217-r1','sourceImageBlockId':'79-cn-p217-b8','sourcePixels':[430,463],
 'impactState':'closed-with-mandatory-limitations-no-further-tile-reading',
 'westImpact':{'handoffPath':str(hp),'handoffSha256':sha(hp),'receiptSha256':sha(d/'receipt.json'),'rawSha256':sha(d/'raw.json'),
 'callId':receipt['callId'],'classification':receipt['classification'],'sixPremiseChecks':receipt['result']['premiseChecks'],
 'acceptanceConditions':receipt['result']['acceptanceConditions'],'newCallsBy249':1,'newCallsThisImplementation':0,'reviewBudgetRemaining':0},
 'parent':{'path':str(cp),'sha256':sha(cp),'changed':False},'draft':{'path':'draft-page-0217.rev6.json','sha256':sha(L/'draft-page-0217.rev6.json'),
 'kind':'non-admitted-explicit-field-proposal','notModelOutput':True,'eligibleForSelection':False},
 'changes':changes,'note':note_proposal,'originalRaw':{'path':str(original),'sha256':sha(original),'originalUnknowns':[]},
 'specificContractGaps':[{'id':'page-registration','actual':'knownNativeInlineCorrections has no79-cn:217 approval/job pin; actual loader check recorded separately.',
   'needed':'One exact217 approval/job binding real original raw, audited parent chain, new draft SHA, independent point/impact receipts and only these fields.'},
  {'id':'unknown-array-cardinality','actual':'Existing approved array operation replaces entries only. Original model raw has0 entries; rev5 has1; requested explicit coordinates require2. Inserting is rejected by the existing contract.',
   'needed':'A page-specific exact0→2 corrected-raw overlay/approved chain for217, retaining original raw and strict from/to SHA. No general unknown acceptance relaxation.'},
  {'id':'limitation-note-placement','actual':'The original example continues inPDF218-b3. No accepted PDF218 candidate exists in the current chapter register, and current217 legacy verbatim mode has no approved after-argument annotation slot.',
   'needed':'Use the existing assembly/editorial-note contract at the exact218-b3 after-argument anchor, preserving author words; no new model transcription or premature caption note.'}],
 'semanticProblemsNotReopened':['North second9m point resolved','West number need not be read; six teaching dependencies independently accepted with limitations'],
 'newCalls':0,'rawEdits':0,'oldAuditEdits':0,'globalGateChanges':0,'selectedCandidateChanged':False,
 'noAdditionalModelBudget':True,'wholePagePassed':False,'wholeChapterPassed':False,'integrationAllowed':False,
 'otherAcceptanceGaps':['PDF218–220 and full217-4 unit coverage remain outside this impact result','Existing web variant source/field differences remain separate'],
 'disposition':'Semantic impact closed; exact display/note content staged, but not legally installed. Existing244 owner receives technical admission gaps, not another recognition request.'}
write(L/'implementation-plan.json',plan)
shared=R/'integration/coac248-p217-west-implementation-20261028';assert not shared.exists();shared.mkdir()
for name in ['draft-page-0217.rev6.json','limitation-note-proposal.json','implementation-plan.json']:(shared/name).write_bytes((L/name).read_bytes())
print(json.dumps({'westImpactClosed':True,'proposedChanges':2,'newCalls':0,'draftSha256':plan['draft']['sha256'],'contractAdmissionPending':True}))
