"""Freeze final saved facts and fixed inputs; no producer, image reader or UI write."""
import hashlib,json,shutil
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent
D=R/'integration/coac269-p257-human20-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
canon=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def save(p,x):
    with Path(p).open('xb') as f:f.write((json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode())
def bind(p):return {'path':str(p),'sha256':sha(p)}
assert not D.exists(),'existing application packet: inspect, never duplicate'
D.mkdir();(D/'snapshot').mkdir()
raw=Path.cwd()/'human-export-raw.json';x=load(raw)
shutil.copyfile(raw,D/'snapshot/export.json')
events=R.parent/'human-annotations/events.jsonl'
shutil.copyfile(events,D/'snapshot/events.jsonl')
live=[json.loads(s) for s in events.read_text(encoding='utf8').splitlines() if s]
assert live==x['events'],'export and on-disk save history differ'
targets=load(H.parent/'b36-p257-checklist/targets.json')['targets']
q=[i for i in x['queue']['items'] if i.get('batchId')=='p257-old-transcription-v2']
assert len(q)==20
latest={e['id']:e for e in x['events']};facts=[]
for t,i in zip(targets,q):
    assert i['packetTargetId']==t['id']
    assert i['targetId']==f"nemata-jp-p257-b4:old-transcription:{t['scope']}:{t['ordinal']}"
    assert i['imageSha256']==t['sourceImage']['sha256'] and i['bbox']==t['targetBox']
    e=latest[i['id']];assert e['targetId']==i['targetId'] and e['imageSha256']==i['imageSha256']
    assert e['result']['status']=='answered' and len(e['result']['tiles'])==1
    assert e['result']['note']=='' and e['result']['orientation']==''
    assert sha(R/i['imagePath'])==i['imageSha256'] and sha(R/i['cropImagePath'])==i['cropImageSha256']
    history=[v for v in x['events'] if v['id']==i['id']]
    facts.append({'packetTargetId':t['id'],'itemId':i['id'],'targetId':i['targetId'],
      'scope':t['scope'],'ordinal':t['ordinal'],'oldTile':t['oldTile'],'tile':e['result']['tiles'][0],
      'imageSha256':i['imageSha256'],'bbox':i['bbox'],'cropBox':i['cropBox'],
      'position':e['position'],'latestEvent':e,'eventSha256':hashlib.sha256(canon(e)).hexdigest(),
      'history':history,'historyEventSha256':[hashlib.sha256(canon(v)).hexdigest() for v in history]})
assert len({f['itemId'] for f in facts})==20
old=R/'integration/coac244-human-final-20261028';plans=load(old/'plans.json')
parent=old/'candidates/257.human-final.json'
assert sha(parent)=='5403cb35614b1edab17488458dbaf0571e1a48e1972d2d04c9ebc30a03da67dc'
reuse=load(H.parent/'b29-311250-prep/reuse-pages.json')
pins=[bind(parent),plans['257']['source'],plans['257']['parentAudit'],plans['257']['parent'],
 bind(R/'integration/coac244-p257-twenty-root-check-20261028/ordered-review-context.json'),
 bind(R/'integration/coac244-p257-twenty-root-check-20261028/manifest.json'),
 bind(R/'integration/coac269-human257261-consumed-20261028.json'),
 bind(D/'snapshot/export.json'),bind(D/'snapshot/events.jsonl')]
for p in reuse:
    pins.extend([p['source'],p['candidate'],p['audit'],*p['raws']])
for p in pins:assert sha(p['path'])==p['sha256']
plan={'schema':'coac269-p257-final20-fixed-human-application/1','ownerIssueId':'01a17cae-06e4-7b30-a93f-3a030d1ae63f',
 'authorization':'01a182cc-2503-7d2e-a234-b3d032ee426b','canonical':'nemata-jp-chapter-250-1',
 'parent':bind(parent),'source':plans['257']['source'],'originalParentAudit':plans['257']['parentAudit'],
 'candidatePath':str(D/'257.human20.json'),'export':bind(D/'snapshot/export.json'),
 'events':bind(D/'snapshot/events.jsonl'),'exportedAt':x['exportedAt'],'queueSha256':x['queueSha256'],
 'historyEvents':len(x['events']),'batchHistoryEvents':sum(len(f['history']) for f in facts),
 'facts':facts,'counts':{'determinate':20,'unclear':0,'missing':0,'withdrawn':0,'changed':sum(f['tile']!=f['oldTile'] for f in facts)},
 'orderedContext':bind(R/'integration/coac244-p257-twenty-root-check-20261028/ordered-review-context.json'),
 'rootManifest':bind(R/'integration/coac244-p257-twenty-root-check-20261028/manifest.json'),
 'reuse':reuse,'inputBindings':pins,'newModelCalls':0,'independentReviewBudget':{'owner':'COAC-249','maximumCalls':1,'model':'gpt-6.1-sol','reasoningEffort':'high','images':[],'retry':0},
 'wholeChapterPassed':False,'admissionGranted':False}
save(D/'plan.json',plan)
save(H/'summary.json',{'packet':str(D),'plan':bind(D/'plan.json'),'counts':plan['counts'],
 'batchHistoryEvents':plan['batchHistoryEvents'],'exportedAt':x['exportedAt'],'newModelCalls':0})
print(json.dumps({'packet':str(D),'counts':plan['counts'],'batchHistoryEvents':plan['batchHistoryEvents']}))
