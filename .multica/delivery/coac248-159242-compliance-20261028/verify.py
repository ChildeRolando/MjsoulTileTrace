"""Read-only exact-candidate condition verification, not an article passed verifier."""
import copy,hashlib,json,pathlib
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
PINS={
 '159':{'canonical':'79-cn-chapter-159-9','candidatePath':'web-production/v1/candidates/79-bilibili-cn/cv1751292.display.json',
  'candidateSha256':'5f2555f1ad90b99581f054974c7bc29b6536896926cc7c33a3f9574cf51c3373',
  'evidenceSha256':'86bc78028f01c2fd7a277f0c2de1ce5fb2cbf51aff72ba00376fc5e7e0c178ba',
  'figureId':'79-bilibili-cn:cv1751292:b0013:figure','bbox':[298,126,324,161],
  'unknownLiteral':'［万子牌，数字无法确认］'},
 '242':{'canonical':'79-cn-chapter-242-3','candidatePath':'web-production/v1/candidates/79-bilibili-cn/cv1780438.display.json',
  'candidateSha256':'62987619296c7f7ef775b41967e69f84802a17c08146df9ffd436f51f84b19aa',
  'evidenceSha256':'8af5dfab278fb5a6da46c571f68d6a6a034bf025677842e955530ef3cc769436',
  'figureId':'79-bilibili-cn:cv1780438:b0014:figure','bbox':[177,144,202,177],
  'unknownLiteral':'?m'}}
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def exact_bytes(path,expected):
 b=pathlib.Path(path).read_bytes();assert sha(b)==expected,str(path);return b
def anchors(key,c,s,m,e):
 p=PINS[key]
 assert e['canonical']==p['canonical'] and e['target']=={'figureId':p['figureId'],'bbox':p['bbox']}
 assert m['conclusion']==e['independentModelConclusion']=='limited-unknown-acceptable'
 assert m['location']['status']=='confirmed' and m['location']['originalBBox']==p['bbox']
 assert m['reading']['status']==m['reading']['tileCode']=='unknown'
 assert m['currentUnknownDisplay']['faithful'] and m['completeTargetScopeCompared']
 assert all(x['faithfulWithUnknown'] and x['dependsOnExactTile'] in ['no','uncertain'] for x in m['propositions'])
 assert [x for x in m['propositions'] if x['dependsOnExactTile']=='uncertain']==e['dependenciesStillUncertain']
 assert m['minimumRequiredAction']==e['minimumRequiredAction']
 assert m['currentUnknownDisplay']['requiredDisplayLimitations']==e['requiredLimitations']
 fi=next(i for i,f in enumerate(c['figures']) if f['figureId']==p['figureId']);f=c['figures'][fi]
 assert f['unknowns']==e['existingUnknowns'] and len(f['unknowns'])==1
 assert p['unknownLiteral'] in f['transcription']
 assert f['sourceAssetBindings'][0]['sha256']==e['independentCall']['requestExecution']['images'][0]['sha256']
 result=[]
 for i,prop in enumerate(m['propositions']):
  ids=prop['sourceBlockIds'];parts=prop['sourceQuote'].split('／')
  # Four original quotes use an explicit slash delimiter between separately
  # identified source blocks. No whitespace or semantic normalization is used.
  assert len(parts)==len(ids)
  entries=[]
  for id,quote in zip(ids,parts):
   sb=next(b for b in s['blocks'] if b['id']==id)
   bi,b=next((bi,b) for bi,b in enumerate(c['body']['blocks']) if id in b.get('sourceBlockIds',[]))
   assert b['type']=='text' and b['text']==sb['text']
   assert sb['text'].count(quote)==1 and b['text'].count(quote)==1
   start=b['text'].index(quote)
   entries.append({'sourceBlockId':id,'fieldPath':f'/body/blocks/{bi}/text','exactQuote':quote,
    'utf8ByteRange':[len(b['text'][:start].encode()),len(b['text'][:start+len(quote)].encode())],
    'fullFieldSha256':sha(b['text'].encode())})
  result.append({'originalPropositionIndex':i,'originalSourceQuote':prop['sourceQuote'],
   'faithfulWithUnknown':prop['faithfulWithUnknown'],'dependsOnExactTileUnchanged':prop['dependsOnExactTile'],
   'neededLimitation':prop['neededLimitation'],'anchors':entries})
 return {'figureIndex':fi,'unknownFieldPath':f'/figures/{fi}/unknowns','unknowns':f['unknowns'],
  'transcriptionPath':f'/figures/{fi}/transcription','transcriptionSha256':sha(f['transcription'].encode()),
  'captionPath':f'/figures/{fi}/caption','captionSha256':sha(f['caption'].encode()),
  'sourceAssetBindings':f['sourceAssetBindings'],'propositionAnchors':result}
def verify(key,root=R):
 p=PINS[key];ep=root/f'integration/coac249-next3-{key}-limited-fidelity-evidence-20261028.json'
 e=json.loads(exact_bytes(ep,p['evidenceSha256']))
 assert pathlib.Path(e['candidate']['path']).resolve()==(root/p['candidatePath']).resolve()
 assert e['candidate']['sha256']==p['candidateSha256']
 cb=exact_bytes(root/p['candidatePath'],p['candidateSha256']);c=json.loads(cb)
 sb=exact_bytes(e['source']['path'],e['source']['sha256']);s=json.loads(sb)
 old=json.loads(exact_bytes(e['oldAudit']['path'],e['oldAudit']['sha256']))
 raw=json.loads(exact_bytes(e['raw']['path'],e['raw']['sha256']))
 envelope=json.loads(exact_bytes(e['originalConsumerReceipt']['path'],e['originalConsumerReceipt']['sha256']))
 assert c['source']['sourceSha256']==e['source']['sha256']
 assert old['production']['sha256']==p['candidateSha256'] and old['status']=='needs-repair'
 assert len([x for x in old['modelReview']['issues'] if x['severity']!='source-note'])==1
 target_ids={p['figureId'].removesuffix(':figure')}
 inherited_body=[b for b in old['modelReview']['blockChecks'] if b['id'] not in target_ids]
 inherited_figures=[f for f in old['modelReview']['figureChecks'] if f['id']!=p['figureId']]
 assert all(b['verdict']=='faithful' for b in inherited_body+inherited_figures)
 assert old['modelReview']['domOrder']['faithful']
 assert raw['success'] and raw['callId']==e['independentCall']['callId']
 assert raw['output']==json.loads(raw['rawLastMessage'])==envelope['modelReview']
 assert envelope['status']=='needs-repair' and envelope['checks']['limitedOkay'] is False
 assert raw['requestExecution']==e['independentCall']['requestExecution']
 assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max'
 for image in raw['requestExecution']['images']:exact_bytes(image['path'],image['sha256'])
 mapping=anchors(key,c,s,raw['output'],e)
 assert exact_bytes(root/p['candidatePath'],p['candidateSha256'])==cb
 return {'schema':'coac248-exact-unchanged-candidate-conditions-proof/1','canonical':p['canonical'],
  'candidate':e['candidate'],'source':e['source'],'oldAudit':e['oldAudit'],'target':e['target'],
  'independentEvidence':{'path':str(ep),'sha256':p['evidenceSha256']},'raw':e['raw'],
  'originalConsumerReceipt':e['originalConsumerReceipt'],'mapping':mapping,
  'inheritedNonTargetEvidence':{'faithfulBodyChecks':inherited_body,'faithfulFigureChecks':inherited_figures,
   'domOrder':old['modelReview']['domOrder'],'sourceNotesPreserved':[i for i in old['modelReview']['issues'] if i['severity']=='source-note']},
  'independentConditionsAlreadySatisfied':True,'candidateChanged':False,'derivedCandidateNeeded':False,
  'newNonAuthorNoteNeeded':False,'noteDecisionBasis':e['minimumRequiredAction'],
  'requiredConditionsRetained':e['requiredLimitations'],
  'tacticalUncertainRetained':e['dependenciesStillUncertain'],
  'currentDisplayFidelityOnly':True,'wholeChapterPassedClaimed':False,'newModelCalls':0,
  'next':'249 zero-call independent binding consistency, then existing250 legal supplemental admission and actual display readbacks. Original false receipts remain immutable.'}
if __name__=='__main__':
 import sys
 keys=sys.argv[1:] or ['159','242']
 for key in keys:
  p=verify(key);print(json.dumps({'key':key,'candidateSha256':p['candidate']['sha256'],
   'conditions':len(p['mapping']['propositionAnchors']),'candidateChanged':False,'newNoteNeeded':False,'modelCalls':0}))
