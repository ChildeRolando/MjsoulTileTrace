"""Exact external display proposal, not a candidate edit or chapter-pass verifier."""
import copy,hashlib,json,pathlib
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
D=R/'audit/supplements/coac249-256-impact-20261028'
CANONICAL='79-cn-chapter-256-18'
CANDIDATE='0877ccd8c34fed1b2728eec6c8dd912559e852d653b5fedda8f5b6e4469aa0bd'
RECEIPT='f2de18998185283ea785048f65e5b406ae100549a569eefa82c4214dc8cf43e2'
RAW='56995b3c9bb536ab34bee7ea40165fdfc01e47f62e12e1c76ac46300b868df4c'
VERIFY='e2b152df4cfac7fd2f49e4a3a7c37c7cef9c2e033ebd12e026a5e627380ea365'
MANIFEST='7068edaa377784a0823c4c6b942d41f5e4533dfbd2f3331962bede454b01bf15'
def sha(b):return hashlib.sha256(b).hexdigest()
def js(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def bound(ref):
 b=pathlib.Path(ref['path']).read_bytes();assert sha(b)==ref['sha256'],ref['path'];return b
def inputs():
 assert sha((D/'receipt.json').read_bytes())==RECEIPT and sha((D/'verification.json').read_bytes())==VERIFY
 a=load(D/'receipt.json');v=load(D/'verification.json')
 c=json.loads(bound(a['candidate']));parent=json.loads(bound(a['parent']));source=json.loads(bound(a['source']));raw=json.loads(bound(a['raw']));plan=json.loads(bound(a['plan']))
 assert a['canonical']==CANONICAL and a['candidate']['sha256']==CANDIDATE and a['raw']['sha256']==RAW
 assert a['status']=='limited-unknown-acceptable' and raw['output']==json.loads(raw['rawLastMessage'])==a['modelReview']
 assert a['phaseCalls']=={'maker':1,'review':1,'maximum':2,'remaining':0,'retry':0}
 assert not a['ordinaryWholeChapterPassed'] and not a['admissionGranted']
 assert raw['success'] and raw['exitCode']==0 and not raw['timedOut'] and raw['events'][-1]['type']=='turn.completed'
 assert raw['callId']=='68f60ecb-24d4-4d88-972a-4996c456506a' and raw['requestExecution']==a['call']['requestExecution']
 assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max'
 assert raw['requestExecution']['args'].count('-i')==len(raw['requestExecution']['images'])==2
 for image in raw['requestExecution']['images']:assert len(bound(image))==image['bytes']
 assert raw['prompt']==plan['prompt'] and raw['schema']==plan['schema']
 assert sha(raw['requestPrompt'].encode())==raw['requestPromptSha256']==a['call']['promptSha256']
 assert sha(raw['prompt'].encode())==a['call']['semanticPromptSha256'] and sha(js(raw['schema']).encode())==a['call']['schemaSha256']
 assert sha(js(plan['projection']).encode())==a['call']['binding']['orderedProjectionSha256']
 manifest=json.loads(bound(a['runtime']));assert a['runtime']['sha256']==MANIFEST and len(manifest['files'])==30
 for f in manifest['files']:assert sha((pathlib.Path(a['runtime']['path']).parent/f['path']).read_bytes())==f['sha256']
 for key in ['parentAudit','parentRaw','makerRaw','productionEvidence']:bound(a[key])
 old=load(a['parentAudit']['path']);assert json.loads(load(a['parentRaw']['path'])['rawLastMessage'])==old['modelReview']
 assert c['body']==parent['body'] and len(c['body']['blocks'])==len(source['blocks'])==42
 assert plan['projection']['orderedSourceCandidateContext']==[{'position':i,'source':s,'candidate':b,'figure':next((f for f in c['figures'] if b.get('type')=='figure' and f['figureId']==b['figureId']),None)} for i,(s,b) in enumerate(zip(source['blocks'],c['body']['blocks']))]
 target='79-bilibili-cn:cv1785770:b0016:figure';f=c['figures'][1];pf=parent['figures'][1]
 assert f['figureId']==target and f['transcription']==pf['transcription'].replace('7s [索子，数字不明] 9s','7s 8s 9s') and f['unknowns']==pf['unknowns'][1:]
 for cf,pf in zip(c['figures'],parent['figures']):
  if cf['figureId']!=target:assert cf==pf
  else:
   for key in pf:
    if key not in ['transcription','unknowns','provenance']:assert cf[key]==pf[key]
 assert a['modelReview']['tileRepair']['verdict']=='faithful' and a['modelReview']['completeTargetScopeCompared'] and a['modelReview']['orderedContextFaithful']
 assert [i['severity'] for i in a['modelReview']['issues']]==['uncertain','uncertain']
 assert v['frozenVerification']['passed'] and not v['admissionGranted'] and v['actualRuntimeFiles']==30
 assert v['allBodyBlocksUnchanged'] and v['otherFiguresUnchanged']==3
 for i,u in enumerate(a['modelReview']['unknownImpact']):
  assert u['unknownText']==f['unknowns'][i] and u['displayFaithful'] and u['argumentFaithfulWithUnknown'] and u['requiresExactTileForAuthorArgument'] is False
  assert v['unknownBindings'][i]['unknownPointer']==f'/figures/1/unknowns/{i}' and v['unknownBindings'][i]['completeFigureJsonSha256']==sha(js(f).encode())
 return a,v,c,source,parent,raw,plan
def build_overlay(a,c):
 after=c['body']['blocks'][20];before=c['body']['blocks'][21]
 assert after['sourceBlockIds']==['79-bilibili-cn:cv1785770:b0021'] and before['sourceBlockIds']==['79-bilibili-cn:cv1785770:b0022']
 notes=[]
 for i,unknown in enumerate(a['modelReview']['unknownImpact']):
  for j,text in enumerate(unknown['requiredDisplayLimitations']):
   n=len(notes)+1;notes.append({'id':f'limited256-{n}','type':'p','authorText':False,'text':f'【审校范围（非原文）{n}】'+text,
    'independentReceiptPointer':f'/modelReview/unknownImpact/{i}/requiredDisplayLimitations/{j}',
    'unknownCandidatePointer':f'/figures/1/unknowns/{i}'})
 return {'schema':'coac248-exact256-display-overlay-proposal/1','canonical':CANONICAL,
  'candidate':copy.deepcopy(a['candidate']),'source':copy.deepcopy(a['source']),
  'independentReceipt':{'path':str(D/'receipt.json'),'sha256':RECEIPT},'independentRaw':copy.deepcopy(a['raw']),
  'targetFigureId':'79-bilibili-cn:cv1785770:b0016:figure',
  'placement':{'afterCandidatePointer':'/body/blocks/20','afterSourceBlockId':after['sourceBlockIds'][0],'afterFullBlockSha256':sha(js(after).encode()),
   'beforeSourceBlockId':before['sourceBlockIds'][0],'beforeFullBlockSha256':sha(js(before).encode()),
   'stageMapping':'after the LAST staged block mapped to b0021, before separator b0022; never split author paragraph or insert within figure transcription'},
  'notes':notes,'candidateChanged':False,'oldRawOrAuditChanged':False,'admissionGranted':False,'ordinaryWholeChapterPassed':False,
  'status':'prepared-exact-overlay-awaiting-existing-owner-admission','newModelCalls':0}
def validate_overlay(o,a,c):
 assert a==load(D/'receipt.json') and c==json.loads(bound(a['candidate']))
 assert o==build_overlay(a,c),'overlay outside exact authorized proposal'
 assert len(o['notes'])==6 and len({n['id'] for n in o['notes']})==6
 assert all(n['authorText'] is False and '（非原文）' in n['text'] for n in o['notes'])
def assemble_preview(o,a,c):
 validate_overlay(o,a,c);original=copy.deepcopy(c['body']['blocks']);blocks=original[:21]+copy.deepcopy(o['notes'])+original[21:]
 assert [b for b in blocks if not b.get('id','').startswith('limited256-')]==c['body']['blocks']
 return blocks
def verify():
 a,v,c,s,parent,raw,plan=inputs();o=build_overlay(a,c);blocks=assemble_preview(o,a,c)
 mapping=[]
 for n in o['notes']:
  i=int(n['unknownCandidatePointer'].split('/')[-1]);entry={'noteId':n['id'],'independentReceiptPointer':n['independentReceiptPointer'],
   'unknownPointer':n['unknownCandidatePointer'],'unknownLiteral':c['figures'][1]['unknowns'][i],
   'unknownMarkerAlreadyInCandidate':True,'fullLimitationAlreadyDisplayedInLibrary':False,'preparedOverlayNote':n['text'],
   'authorContextFields':[f'/body/blocks/{j}/text' for j in range(16,21)],'requiresOverlayConsumption':True}
  mapping.append(entry)
 return {'schema':'coac248256-six-limit-mapping-proof/1','canonical':CANONICAL,'candidate':a['candidate'],
  'source':a['source'],'independentReceipt':o['independentReceipt'],'independentRaw':a['raw'],
  'independentModelReviewUnchanged':a['modelReview'],'oldParentIssuesUnchanged':load(a['parentAudit']['path'])['modelReview']['issues'],
  'historicalDiffMechanicallyVerified':True,'historicalDiffModelUncertainPreserved':True,
  'all42AuthorBlocksAndOther3FiguresUnchanged':True,'unknowns':c['figures'][1]['unknowns'],'limitations':mapping,
  'proposal':o,'previewBlocks':len(blocks),'libraryOverlayInstalledClaimed':False,
  'admissionGranted':False,'ordinaryWholeChapterPassed':False,'newModelCalls':0,'budgetRemaining':0,
  'remaining':'Install exact256 overlay via existing legal supplemental admission and then actualMCP/Arena readback; no semantic/model/maker gap identified. Do not borrow159/242 exact pins.'}
if __name__=='__main__':
 p=verify();print(json.dumps({'limits':len(p['limitations']),'originalBlocks':42,'previewBlocks':p['previewBlocks'],'candidateChanged':False,'newModelCalls':0}))
