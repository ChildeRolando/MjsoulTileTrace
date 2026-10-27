"""Exact193 condition/binding proof only; no candidate edits or acceptance bypass."""
import copy, hashlib, json, pathlib
from PIL import Image
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
P=R/'audit/supplements/coac249-193208276-20261028/receipt-193.json'
PIN={'canonical':'79-cn-chapter-193-4','candidate':'e08cf7cfef4777643809971a71347c587ffe14534873d7cac2be65be42885e5e',
 'source':'75b3eae5938bd5e635089891d6ee721575cf9d8fddce050dadcb90a5f47f48c5',
 'oldAudit':'ecddf372db56b1fbce0133a7ab824deb673f9d56868b5e02ef028c4fccf8c6e9',
 'receipt':'1303cb2c932a2450d1fcd8d7c02ff5b9e135c21c9ade3e1b1f27383f9adc04a6',
 'raw':'a07918ba59b42178e5019e02cd9a506a6df75378eac5667516575bb584a6d339',
 'figure':'79-bilibili-cn:cv1765377:b0042:figure','point':'right-row2-col2','bbox':[298,153,325,175],
 'call':'d84eb7ca-3897-4421-ae47-03efcdf32bb1',
 'manifest':'a5cff9c38466a76030b5269ac4367f07695fa3ddb43fb4cbf374069fa852125c'}
def sha(b):return hashlib.sha256(b).hexdigest()
def js(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def bound(ref):
 b=pathlib.Path(ref['path']).read_bytes();assert sha(b)==ref['sha256'],ref['path']
 if 'bytes' in ref:assert len(b)==ref['bytes']
 return b
def validate_binding(b):
 assert b['canonical']==PIN['canonical'] and b['productionSha256']==PIN['candidate'] and b['sourceFileSha256']==PIN['source'] and b['originalAuditSha256']==PIN['oldAudit']
 assert b['targetFigureIds']==[PIN['figure']] and b['points']==[{'id':PIN['point'],'figureId':PIN['figure'],'bbox':PIN['bbox']}]
def validate_conditions(c,s,m,sup,stage):
 assert m['canonical']==PIN['canonical'] and m['candidateSha256']==PIN['candidate']
 assert m['conclusion']=='limited-unknown-acceptable'
 assert len(m['pointChecks'])==1
 point=m['pointChecks'][0]
 assert (point['pointId'],point['figureId'],point['reading'],point['tileCodeOrUnknown'])==(PIN['point'],PIN['figure'],'unknown','unknown')
 fi,f=next((i,f) for i,f in enumerate(c['figures']) if f['figureId']==PIN['figure'])
 assert f['unknowns']==['右侧牌河第2行右列的万子牌：黑色点数字形无法可靠辨认。']
 assert '第2行：2z 万子牌（点数未能可靠辨认）。' in f['transcription']
 assert '上排第2张7p有红圈。' in f['transcription'] and '右列最上方的5m有红圈。' in f['transcription']
 assert '红圈' in f['caption']
 assert len(c['body']['blocks'])==len(s['blocks'])==43
 for b,sb in zip(c['body']['blocks'],s['blocks']):
  assert b['sourceBlockIds']==[sb['id']]
  if sb['type']=='text':assert b['type']=='text' and b['text']==sb['text']
 checks=m['contributionChecks'];assert len(checks)==8
 assert [x['faithfulWithCurrentExplicitUnknown'] for x in checks]==['yes','uncertain','yes','yes','yes','yes','yes','yes']
 assert all(x['requiresExactPointForAuthorArgument']=='no' for x in checks)
 result=[]
 for i,check in enumerate(checks):
  entries=[]
  for id in check['sourceBlockIds']:
   bi,b=next((bi,b) for bi,b in enumerate(c['body']['blocks']) if b['sourceBlockIds']==[id])
   sb=next(x for x in s['blocks'] if x['id']==id)
   entries.append({'sourceBlockId':id,'candidateField':f'/body/blocks/{bi}',
    'originalBlockSha256':sha(js(sb).encode()),'candidateBlockSha256':sha(js(b).encode()),
    **({'exactText':b['text'],'textField':f'/body/blocks/{bi}/text','utf8ByteRange':[0,len(b['text'].encode())]} if b['type']=='text' else {'figureId':b['figureId']})})
  result.append({'originalIndependentContribution':check,'anchors':entries})
 assert len(m['requiredDisplayLimitations'])==5 and len(m['issues'])==5
 assert [i['severity'] for i in m['issues']]==['uncertain','uncertain','uncertain','source-note','source-note']
 assert sup['chapterId']==PIN['canonical'] and sup['supplementChapterId']=='79-cn-chapter-193-4-pdf193-supplement'
 parent=json.loads(bound(sup['parent']));pa=json.loads(bound(sup['originalAudit']))
 assert pa['status']=='passed' and pa['production']['sha256']==sup['parent']['sha256']
 for ref in [sup['sourcePage'],sup['ownership'],sup['webSource']]:bound(ref)
 assert sup['webSource']['sha256']==PIN['source']
 block=next(b for b in parent['body']['blocks'] if b['sourceBlockIds']==['79-cn-p193-b6'])
 assert block['text']==sup['originalCompleteBlock']['text']
 ch=stage['chapters'][0]
 assert ch['chapterId']==sup['supplementChapterId']
 assert '来源版本补文' in ch['translatorNote'] and '不改网页残句' in ch['translatorNote']
 for diff,sl,b in zip(sup['versionDifferences'],sup['slices'],ch['blocks']):
  assert ''.join(next(x for x in s['blocks'] if x['id']==id)['text'] for id in diff['webSourceBlockIds'])==diff['webText']
  assert sl['text']==block['text'][sl['fromCodepoint']:sl['toCodepoint']]==b['text']
  assert b['sourceBlockIds']==['79-cn-p193-b6']
  assert b['sourceTextSlice']['parentCandidateSha256']==sup['parent']['sha256']
  assert diff['operation']=='separate-PDF-version-excerpt; never rewrite web source or raw'
 return {'figureIndex':fi,'unknownField':f'/figures/{fi}/unknowns','transcriptionField':f'/figures/{fi}/transcription',
  'unknowns':f['unknowns'],'transcriptionSha256':sha(f['transcription'].encode()),
  'captionSha256':sha(f['caption'].encode()),'sourceNotes':f['sourceNotes'],
  'contributionAnchors':result,'sourceVersionDifferences':sup['versionDifferences'],
  'separatePdfTranslatorNote':ch['translatorNote']}
def verify():
 assert sha(P.read_bytes())==PIN['receipt'];a=load(P)
 assert a['canonical']==PIN['canonical'] and a['status']=='limited-unknown-acceptable'
 assert a['candidate']['sha256']==PIN['candidate'] and a['source']['sha256']==PIN['source'] and a['oldAudit']['sha256']==PIN['oldAudit']
 assert a['raw']['sha256']==PIN['raw']
 c=json.loads(bound(a['candidate']));s=json.loads(bound(a['source']));old=json.loads(bound(a['oldAudit']))
 raw=json.loads(bound(a['raw']));req=json.loads(bound(a['request']));manifest=json.loads(bound(a['runtime']))
 assert a['runtime']['sha256']==PIN['manifest'] and len(manifest['files'])==28
 for x in manifest['files']:assert sha((pathlib.Path(a['runtime']['path']).parent/x['path']).read_bytes())==x['sha256']
 assert raw['callId']==a['call']['callId']==PIN['call'] and raw['success'] and raw['exitCode']==0
 assert not raw['timedOut'] and not raw['outputOverflow'] and raw['events'][-1]['type']=='turn.completed'
 assert raw['output']==json.loads(raw['rawLastMessage'])==a['modelReview']
 assert raw['binding']==a['call']['binding']
 b=raw['binding'];validate_binding(b)
 assert b['runtimeManifestSha256']==PIN['manifest'] and b['requestSha256']==a['request']['sha256']
 assert raw['prompt']==req['prompt'] and raw['schema']==req['schema']
 assert sha(raw['prompt'].encode())==raw['semanticPromptSha256']==a['call']['semanticPromptSha256']
 assert sha(raw['requestPrompt'].encode())==raw['requestPromptSha256']==raw['promptSha256']==a['call']['promptSha256']
 assert sha(js(raw['schema']).encode())==raw['schemaSha256']==a['call']['schemaSha256']
 ex=raw['requestExecution'];assert ex==a['call']['requestExecution']
 assert ex['model']=='gpt-6.1-terra' and ex['reasoningEffort']=='max'
 assert ex['args'][ex['args'].index('--model')+1]=='gpt-6.1-terra' and 'model_reasoning_effort="max"' in ex['args']
 assert ex['args'].count('-i')==len(ex['images'])==3
 assert [ex['args'][i+1] for i,x in enumerate(ex['args']) if x=='-i']==req['images']==[x['path'] for x in ex['images']]
 for x in ex['images']:bound(x)
 projection=json.loads(raw['prompt'].partition('\n')[2])
 assert projection['sourceBlocks']==s['blocks'] and projection['candidateBody']==c['body'] and projection['candidateFigures']==c['figures']
 assert projection['points'][0]['bbox']==PIN['bbox']
 im=Image.open(ex['images'][0]['path']).convert('RGBA');assert im.size==(394,415)
 assert sha(pathlib.Path(ex['images'][0]['path']).read_bytes())==projection['assets'][0]['asset']['sha256']
 for d,image in zip(projection['points'][0]['derivations'],ex['images'][1:]):
  actual=Image.open(image['path']).convert('RGBA');crop=im.crop(d['bbox']);expected=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST)
  assert actual.size==expected.size and actual.tobytes()==expected.tobytes()
 assert old['status']=='needs-repair' and old['production']['sha256']==PIN['candidate'] and old['source']['sourceSha256']==PIN['source']
 oc=old['calls'][0];oraw=load(R/'audit/calls'/f"{oc['callId']}.json")
 assert old['modelReview']==json.loads(oraw['rawLastMessage'])
 assert sha(oraw['rawLastMessage'].encode())==oc['outputSha256'] and oraw['binding']==oc['binding']
 assert oc['binding']['productionSha256']==PIN['candidate'] and oc['binding']['sourceFileSha256']==PIN['source']
 assert old['modelReview']['domOrder']['faithful'] and old['modelReview']['completeArticleCompared']
 unknownblocks={'79-bilibili-cn:cv1765377:'+x for x in ['b0008','b0009','b0015','b0016','b0042']}
 assert all(x['verdict']==('uncertain' if x['id'] in unknownblocks else 'faithful') for x in old['modelReview']['blockChecks'])
 assert all(x['verdict']==('uncertain' if x['id']==PIN['figure'] else 'faithful') for x in old['modelReview']['figureChecks'])
 assert [(x['id'],x['disposition']) for x in old['modelReview']['imageChecks']]==[
  ('79-bilibili-cn:cv1765377:i00001','represented'),('79-bilibili-cn:cv1765377:i00002','represented'),
  ('79-bilibili-cn:cv1765377:i00003','uncertain')]
 assert [x['targetId'] for x in old['modelReview']['issues'] if x['severity']!='source-note']==['79-bilibili-cn:cv1765377:b0008','79-bilibili-cn:cv1765377:b0015',PIN['figure']]
 sup=a['sourceVersionSupplement193'];assert sup==projection['sourceVersionSupplement']
 stagepath=pathlib.Path(sup['stage'])/'textbook-bodies.json';stage=load(stagepath)
 mapping=validate_conditions(c,s,raw['output'],sup,stage)
 return {'schema':'coac248-exact193-current-display-conditions-proof/1','canonical':PIN['canonical'],
 'candidate':a['candidate'],'source':a['source'],'oldAudit':a['oldAudit'],'target':{'figureId':PIN['figure'],'pointId':PIN['point'],'bbox':PIN['bbox'],'originalSize':[394,415]},
 'independentReceipt':{'path':str(P),'sha256':PIN['receipt']},'raw':a['raw'],'request':a['request'],'runtime':a['runtime'],
 'independentCall':a['call'],'originalIndependentModelReview':raw['output'],'mapping':mapping,
 'separatePdfSupplement':{'path':str(stagepath),'sha256':sha(stagepath.read_bytes()),'originalEvidence':sup},
 'originalUnknownIssuesPreserved':old['modelReview']['issues'],'originalImageChecksPreserved':old['modelReview']['imageChecks'],
 'remainingUncertain':[x for x in raw['output']['contributionChecks'] if x['faithfulWithCurrentExplicitUnknown']=='uncertain'],
 'currentCandidateMeetsIndependentDisplayConditions':True,'derivedCandidateNeeded':False,'newNonAuthorNoteNeededForCandidate':False,
 'noteDecisionBasis':'Independent review explicitly accepts current explicit unknown and retained conditions; no instruction to add a new candidate annotation. Supplemental admission/readback must retain all five exact independent limitations and label separate PDF source version.',
 'standardWholeArticlePassed':False,'admissionGranted':False,'originalAuditOrRawChanged':False,'candidateChanged':False,
 'newModelCalls':0,'newProductionCalls':0,'remainingPointReadingBudget':0,
 'next':'Existing244 exact193 source-version-plus-limited-unknown scope pins/callback, then existing250 lawful stage and actualMCP/Arena readback. Never claim complete board transcription or erase Web source-fragment uncertainty.'}
if __name__=='__main__':
 proof=verify();print(json.dumps({'canonical':proof['canonical'],'conditionsMapped':len(proof['mapping']['contributionAnchors']),'currentCandidateMeetsConditions':True,'modelCalls':0},ensure_ascii=False))
