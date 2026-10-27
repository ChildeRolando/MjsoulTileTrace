"""Read-only verification of two exact independent limited-fidelity supplements."""
import hashlib,json,pathlib
from PIL import Image
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
D=R/'audit/supplements/coac249-193208276-20261028'
PINS={
 '208':{'canonical':'79-cn-chapter-208-4','candidate':'0fc086828eb0fb2784e45d60e4a0585af477877c71b2b82630747a87755f6e97',
  'receipt':'d4ee73bd11dbc900ad6ec4dc327f6f106b377616dfc2a5e0c3d94b0ef41b9be9','binding':'d48e56626a3f7d1542da066bdb3f23629bc800555050db2c0fcb72a926de0016',
  'source':'0d6849d5bb4cb250ce9070a883fa072f9025c8411563b9f74fe9fd9d616fa17c','old':'c3ed21f44410017abe1d203a87a0a7a470ec11f0b83e035c43f76016b91236fd',
  'raw':'47418ce17a461c551e1d6147868e1e82348cb577ac76bda8204c6d54401f50cf','call':'53850eb0-aa1a-4623-ad61-cc55340fc271',
  'points':[('upper-row1-leftmost','b0004',[154,101,178,132]),('left-central-2','b0006',[111,177,139,201]),('left-central-5','b0006',[111,246,139,270]),('right-outer-bottom','b0006',[326,258,354,281])],
  'article':'cv1770245','images':9,'contributions':10,'limits':5,'blocks':9},
 '276':{'canonical':'79-cn-chapter-276-4','candidate':'94b2d56a65a3c253fcefd88c59c1f8363c71afeda8b957fd35c20b2ad6040abd',
  'receipt':'fe8559ac99144b333842e9af66c7b01456883954e003c59196c50386e3e1f0ca','binding':'36bca9cc89860830d5b4128759eeb3c73c00ba10340cd4887dd29762d7149a42',
  'source':'db1218e9226ef5ccaf978ec6b6801bd07498017b821973647d0e551ed518439f','old':'df0393cf90c3d9b7010ef7a0678cd2a90aa4e5818ce129ee47c2fb335a08b4fc',
  'raw':'85f3d7f7a9b8029a458c58edbe97620f601a0d6dc02bf1b75e2a741ad8292f9c','call':'9ad5542e-3c87-4e33-81b7-19bd48aeec79',
  'points':[('left-4','b0005',[145,244,175,267]),('left-5','b0005',[145,268,175,291]),('right-2','b0005',[315,201,345,225]),('right-5','b0005',[315,273,345,297])],
  'article':'cv1793434','images':7,'contributions':25,'limits':7,'blocks':42}}
def sha(b):return hashlib.sha256(b).hexdigest()
def js(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'))
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def bound(ref):
 b=pathlib.Path(ref['path']).read_bytes();assert sha(b)==ref['sha256'],ref['path']
 if 'bytes' in ref:assert len(b)==ref['bytes']
 return b
def pointer(x,p):
 for part in p.strip('/').split('/'):x=x[int(part)] if isinstance(x,list) else x[part]
 return x
def validate_binding(k,b):
 p=PINS[k];assert b['canonical']==p['canonical'] and b['productionSha256']==p['candidate'] and b['sourceFileSha256']==p['source'] and b['originalAuditSha256']==p['old']
 assert b['points']==[{'id':id,'figureId':f"79-bilibili-cn:{p['article']}:{block}:figure",'bbox':box} for id,block,box in p['points']]
def conditions(k,c,s,m,b):
 p=PINS[k];assert b['canonical']==m['canonical']==p['canonical'] and m['candidateSha256']==p['candidate']
 projection=json.loads(load(D/f'request-{k}.json')['prompt'].partition('\n')[2])
 assert c['body']==projection['candidateBody'] and c['figures']==projection['candidateFigures']
 assert m['conclusion']==b['independentConclusion']=='limited-unknown-acceptable'
 assert len(m['pointChecks'])==len(b['pointBindings'])==4
 assert len(m['contributionChecks'])==len(b['propositions'])==p['contributions']
 assert all(x['faithfulWithCurrentExplicitUnknown']=='yes' and x['requiresExactPointForAuthorArgument']=='no' for x in m['contributionChecks'])
 assert b['mandatoryDisplayLimits']==m['requiredDisplayLimitations'] and len(b['mandatoryDisplayLimits'])==p['limits']
 assert sha(js(b['mandatoryDisplayLimits']).encode())==b['mandatoryDisplayLimitsSha256']
 assert b['scopeLimits']==m['scopeLimits']
 for q,expected,(id,block,box) in zip(b['pointBindings'],m['pointChecks'],p['points']):
  assert q['independentPoint']==expected
  assert (expected['pointId'],expected['figureId'],expected['reading'],expected['tileCodeOrUnknown'])==(id,f"79-bilibili-cn:{p['article']}:{block}:figure",'unknown','unknown')
  f=pointer(c,q['figurePointer']);assert sha(js(f).encode())==q['fullFigureJsonSha256']
  for field in ['transcription','unknowns','caption','sourceNotes','sourceAssetBindings']:assert f[field]==q[field]
 assert len(c['body']['blocks'])==len(s['blocks'])==p['blocks'] and len(c['figures'])==3
 for cb,sb in zip(c['body']['blocks'],s['blocks']):
  assert cb['sourceBlockIds']==[sb['id']]
  if sb['type']=='text':assert cb['text']==sb['text']
 mappings=[]
 for i,(q,mq) in enumerate(zip(b['propositions'],m['contributionChecks'])):
  assert q['independentContributionIndex']==i and q['independentStatement']==mq
  assert [x['sourceBlockId'] for x in q['sourceBindings']]==mq['sourceBlockIds']
  fields=[]
  for z in q['sourceBindings']:
   sb,cb=pointer(s,z['sourcePointer']),pointer(c,z['candidatePointer'])
   assert sb['id']==z['sourceBlockId'] and z['sourceBlockId'] in cb['sourceBlockIds']
   assert sha(js(sb).encode())==z['sourceBlockJsonSha256'] and sha(js(cb).encode())==z['candidateBlockJsonSha256']
   if cb['type']=='text':
    assert cb['text']==z['candidateText'];fields.append({'field':z['candidatePointer']+'/text','utf8ByteRange':[0,len(cb['text'].encode())],'sha256':sha(cb['text'].encode())})
   else:fields.append({'field':z['candidatePointer'],'sha256':z['candidateBlockJsonSha256']})
  mappings.append({'independentContributionIndex':i,'fields':fields})
 return mappings
def verify(k):
 p=PINS[k];rp=D/f'receipt-{k}.json';bp=D/f'current-binding-{k}.json'
 assert sha(rp.read_bytes())==p['receipt'] and sha(bp.read_bytes())==p['binding']
 a=load(rp);b=load(bp);c=json.loads(bound(a['candidate']));s=json.loads(bound(a['source']));old=json.loads(bound(a['oldAudit']))
 assert a['candidate']['sha256']==p['candidate'] and a['source']['sha256']==p['source'] and a['oldAudit']['sha256']==p['old']
 for field,ref in [('candidate',a['candidate']),('source',a['source']),('originalAudit',a['oldAudit'])]:assert b[field]==ref
 assert b['independentReceipt']=={'path':str(rp).replace('/','\\'),'sha256':p['receipt']} or json.loads(bound(b['independentReceipt']))==a
 assert a['raw']['sha256']==p['raw'];raw=json.loads(bound(a['raw']));req=json.loads(bound(a['request']))
 assert raw['callId']==a['call']['callId']==b['actualCallId']==p['call']
 assert b['independentRaw']==a['raw'] and raw['output']==json.loads(raw['rawLastMessage'])==a['modelReview']
 assert raw['success'] and raw['exitCode']==0 and raw['events'][-1]['type']=='turn.completed' and not raw['timedOut'] and not raw['outputOverflow']
 assert raw['binding']==a['call']['binding'];validate_binding(k,raw['binding'])
 assert raw['prompt']==req['prompt'] and raw['schema']==req['schema']
 assert sha(raw['prompt'].encode())==raw['semanticPromptSha256']==a['call']['semanticPromptSha256']
 assert sha(raw['requestPrompt'].encode())==raw['requestPromptSha256']==raw['promptSha256']==a['call']['promptSha256']
 assert sha(js(raw['schema']).encode())==raw['schemaSha256']==a['call']['schemaSha256']
 ex=raw['requestExecution'];assert ex==a['call']['requestExecution']
 assert ex['model']=='gpt-6.1-terra' and ex['reasoningEffort']=='max'
 assert ex['args'][ex['args'].index('--model')+1]=='gpt-6.1-terra' and 'model_reasoning_effort="max"' in ex['args']
 assert ex['args'].count('-i')==len(ex['images'])==p['images']
 assert req['images']==[x['path'] for x in ex['images']]==[ex['args'][i+1] for i,x in enumerate(ex['args']) if x=='-i']
 for image in ex['images']:bound(image)
 manifest=json.loads(bound(a['runtime']));assert len(manifest['files'])==28 and a['runtime']['sha256']=='a5cff9c38466a76030b5269ac4367f07695fa3ddb43fb4cbf374069fa852125c'
 for f in manifest['files']:assert sha((pathlib.Path(a['runtime']['path']).parent/f['path']).read_bytes())==f['sha256']
 projection=json.loads(raw['prompt'].partition('\n')[2]);assert projection['sourceBlocks']==s['blocks'] and projection['candidateBody']==c['body'] and projection['candidateFigures']==c['figures']
 original={x['figureId']:x for x in projection['assets']}
 for image in ex['images']:
  asset=next((x for x in projection['assets'] if x['copy']==pathlib.Path(image['path']).name),None)
  if asset:
   assert sha(bound(asset['original']))==image['sha256']
   with Image.open(image['path']) as original_image:assert original_image.size==tuple(asset['nativeSize'])
   continue
  pairs=[(point,d) for point in projection['points'] for d in point['derivations'] if d['nearest4']==pathlib.Path(image['path']).name]
  assert len(pairs)==1
  point,d=pairs[0];im=Image.open(original[point['figureId']]['original']['path']).convert('RGBA');crop=im.crop(d['bbox']);zoom=Image.open(image['path']).convert('RGBA')
  expected=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST)
  assert zoom.size==expected.size and zoom.tobytes()==expected.tobytes()
 assert a['status']=='limited-unknown-acceptable' and a['checks']['passed'] and not a['admissionGranted'] and not a['standardWholeChapterPassed']
 assert old['status']=='needs-repair' and old['production']['sha256']==p['candidate'] and old['source']['sourceSha256']==p['source']
 oc=old['calls'][0];oraw=load(R/'audit/calls'/f"{oc['callId']}.json");assert json.loads(oraw['rawLastMessage'])==old['modelReview'] and sha(oraw['rawLastMessage'].encode())==oc['outputSha256']
 assert b['candidateModified'] is False and b['rawOrOldAuditModified'] is False and not b['ordinaryWholeChapterPassed'] and not b['admissionGranted']
 mappings=conditions(k,c,s,raw['output'],b)
 inheritance=None
 if k=='276':
  e=b['parent276NonTargetEvidence'];assert e==a['inheritedNonTarget276']==projection['exactParentEvidence']
  parent=json.loads(bound(e['parent']));pa=json.loads(bound(e['parentAudit']));pr=json.loads(bound(e['parentRaw']))
  assert parent['body']==c['body'] and parent['source']==c['source'] and pa['modelReview']==json.loads(pr['rawLastMessage'])
  assert e['parentCallId']=='4ad05d19-eb5a-48d6-ba09-c673553ec204'
  for item in e['figures']:
   id=item['figureId'];cf=next(f for f in c['figures'] if f['figureId']==id);pf=next(f for f in parent['figures'] if f['figureId']==id)
   assert cf==pf and sha(js(cf).encode())==item['fullObjectSha256']
   assert item['parentCheck'] in pa['modelReview']['figureChecks'] and item['parentCheck']['verdict']=='faithful'
  inheritance=e
 return {'schema':'coac248-exact208276-current-display-proof/1','canonical':p['canonical'],'candidate':a['candidate'],'source':a['source'],'oldAudit':a['oldAudit'],
  'independentReceipt':{'path':str(rp),'sha256':p['receipt']},'independentCurrentBinding':{'path':str(bp),'sha256':p['binding']},'raw':a['raw'],'request':a['request'],
  'independentCall':a['call'],'currentBindingUnchanged':b,'fieldUtf8Ranges':mappings,'originalParentIssuesPreserved':old['modelReview']['issues'],
  'originalParentImageChecksPreserved':old['modelReview']['imageChecks'],'nonTarget276ParentInheritance':inheritance,
  'currentCandidateFieldConditionsSatisfied':True,'candidateChanged':False,'rawOrOldAuditChanged':False,
  'derivedCandidateNeeded':False,'newCandidateAnnotationNeeded':False,
  'sourceNotesDisplayContract':'Historical sourceNotes retain original maker attachment numbering/2x views. New audit orderedImages/crops are a distinct evidence batch and must not be relabelled as those historical attachments. If sourceNotes are exposed beside current audit attachments, add an explicitly non-author batch distinction in the consumer view; do not edit candidate or raw.',
  'mandatoryDisplayLimits':b['mandatoryDisplayLimits'],'standardWholeChapterPassed':False,'admissionGranted':False,'newModelCalls':0,'readingTodo':False,
  'next':'Existing244/250 exact limited-fidelity scope and realMCP/Arena readback; no more digit reading or models.'}
if __name__=='__main__':
 for k in PINS:
  x=verify(k);print(json.dumps({'canonical':x['canonical'],'conditions':len(x['fieldUtf8Ranges']),'points':4,'newModelCalls':0,'candidateChanged':False}))
