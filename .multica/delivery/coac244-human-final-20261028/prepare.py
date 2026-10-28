"""Validate this captured final batch and publish data-only fixed application plans."""
from pathlib import Path
import sys,json,hashlib,shutil,collections
O=Path(__file__).resolve().parent;P=Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-human-final-20261028';S=D/'snapshot'
sys.path.insert(0,str(O.parent/'coac244-human-observation-snapshot-20261028'))
from observations import histories,classification,encoded
L=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
dump=lambda p,x:Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
refs={}
def ref(p,expected=None):
 p=Path(p);h=sha(p.read_bytes());assert expected is None or h==expected,str(p);r={'path':str(p),'sha256':h};refs[str(p)]=r;return r
x=L(S/'export.raw.json');events=L(S/'export.raw.json')['events'];saved=[json.loads(b) for b in (S/'events.raw.jsonl').read_bytes().splitlines() if b.strip()];assert saved[:len(events)]==events
capture=L(D/'capture.json');ref(S/'export.raw.json',capture['exportSha256']);ref(S/'events.raw.jsonl',capture['eventsSha256']);ref(S/'queues/queue.json',x['queueSha256'])
queues={}
for f in (S/'queues').glob('*.json'):
 if f.stem=='queue':continue
 ref(f,f.stem);queues[f.stem]=L(f)
assert sha((S/'queues/queue.json').read_bytes())==x['queueSha256'];assert queues[x['queueSha256']]==x['queue']
latest,hist=histories(events,queues);items={i['id']:i for i in x['queue']['items']};assert set(items)<=set(latest)
old_path=P/'integration/coac244-human-observation-snapshot-20261028/snapshot/export.raw.json';old=L(old_path);ref(old_path);assert events[:len(old['events'])]==old['events'];ol={e['id']:e for e in old['events']}
prior=L(O.parent/'coac244-human-observation-snapshot-20261028/human-evidence.json');prior_rows={r['itemId']:r for r in prior['observations']}
inferred={'d5414542d25d86469470efafefd824af','52fb2ea761e90a783497ac556e31e1b5','edbf63076e6f927a3fa8e2626a3ed36a'}
directions={'8a9957c431362468dc539c425d63d3ba','d7b61fb4c3b1a5337e7411d050d12cad'}
position={'1b5f06d972548151f86c1b632681fd92'}
machine_conflicts={'84791e37a95dcfa295e38dbf27855039','3722e774b30167a0ec0c09ade18406b1'}
rows=[]
for id,e in latest.items():
 item=next(i for i in queues[e['queueSha256']]['items'] if i['id']==id)
 for k in ['id','targetId','canonical','imageSha256','originalImages','position']:
  if id in items:assert items[id][k]==e[k]
 images=[ref(P/f['path'],f['sha256']) for f in [{'path':item['imagePath'],'sha256':item['imageSha256']},*item['originalImages']]]
 ev=prior_rows[id]['currentEvidence'] if id in prior_rows else None
 if ev is None:
  a=item['evidence'][0];ev={}
  for key,name in [('candidate','candidatePath'),('source','sourcePath'),('parentAudit','auditPath'),('raw','reviewRawPath')]:
   if a.get(name):ev[key]=ref(P/a[name],a.get('candidateSha256') if key=='candidate' else None)
 for f in ev.values():
  if isinstance(f,dict) and f.get('path') and f.get('sha256'):ref(f['path'],f['sha256'])
 source=L(ev['source']['path']);assert all(a['sha256'] in json.dumps(source) for a in item['originalImages'])
 category=e['result']['status'] if e['result']['status']!='answered' else 'human-inference-not-pixel-evidence' if id in inferred else 'direction-unanswered-code-only' if id in directions else 'position-mapping-needed' if id in position else 'explicit-mapped-human-observation'
 rows.append({'itemId':id,'canonical':e['canonical'],'page':item['page'],'targetId':e['targetId'],'figureId':item['figureId'],'position':e['position'],'imageSha256':e['imageSha256'],'originalImages':e['originalImages'],'imageBindings':images,
  'regionBBox':item['regionBBox'],'bbox':item['bbox'],'result':e['result'],'savedStatus':e['result']['status'],'classification':classification(e),'evidenceClass':category,'historicalMachineConflict':id in machine_conflicts,
  'timestamp':e['timestamp'],'revision':e['revision'],'eventSha256':sha(encoded(e)),'queueSha256AtSave':e['queueSha256'],'inCurrentQueue':id in items,
  'history':[{'revision':a['revision'],'timestamp':a['timestamp'],'status':a['result']['status'],'sha256':sha(encoded(a))} for a in hist[id]],'currentEvidence':ev,
  'humanEvidenceAuthoritativeForSpecifiedTile':category=='explicit-mapped-human-observation','noteExecutable':False,'applicationPermit':False,'wholeChapterPassed':False})
counts={'historicalEvents':len(events),'latestSavedItems':len(rows),'answered':sum(r['savedStatus']=='answered' for r in rows),'missing':sum(r['savedStatus']=='missing' for r in rows),
 'unclear':sum(r['savedStatus']=='unclear' for r in rows),'skipped':sum(r['savedStatus']=='skipped' for r in rows),'withdrawn':sum(r['savedStatus']=='withdrawn' for r in rows),
 'currentQueueItems':len(items),'currentAnswered':sum(latest[i]['result']['status']=='answered' for i in items),'currentMissing':sum(latest[i]['result']['status']=='missing' for i in items),'unfilled':len(set(items)-set(latest)),
 'retiredSavedItems':len(set(latest)-set(items)),'evidenceClasses':dict(collections.Counter(r['evidenceClass'] for r in rows)),'historicalMachineConflictItems':len(machine_conflicts)}
delta={'priorExportedAt':old['exportedAt'],'finalExportedAt':x['exportedAt'],'oldEventsPreservedAsExactPrefix':True,'newEvents':len(events)-len(old['events']),'newLatestItems':len(set(latest)-set(ol)),'changedPriorLatestItems':sum(e!=ol[i] for i,e in latest.items() if i in ol),'priorQueueSha256':old['queueSha256'],'finalQueueSha256':x['queueSha256']}
out={'schema':'coac244-final-human-evidence/1','authorizationComment':'01a18217-36bb-7c2e-9dd7-46600908ab9a','exportedAt':x['exportedAt'],'queueSha256':x['queueSha256'],'snapshot':str(S),'counts':counts,'delta':delta,'observations':rows,'newModelCalls':0,'wholeChapterPassed':False,'originalRawOrAuditChanged':False}
dump(O/'final-evidence.json',out);shutil.copyfile(D/'capture.json',O/'capture.json')
prep=L(P/'integration/coac269-311250-zero-preparation-20261028/plan.json');ref(P/'integration/coac269-311250-zero-preparation-20261028/plan.json')
r232=L(P/'integration/coac249-232-target-impact-reviewed-20261028.json');ref(P/'integration/coac249-232-target-impact-reviewed-20261028.json')
plans={}
for key,a,owner in [('232',r232,'01a17471-0529-7d3d-bd8d-8b54ef38290d'),('257',prep['pdf257'],'01a17cae-06e4-7b30-a93f-3a030d1ae63f'),('261',prep['pdf261'],'01a17cae-06e4-7b30-a93f-3a030d1ae63f')]:
 par=a['candidate'] if key=='232' else a['parent'];src=a['source'];audit=a['parentAudit'];ref(par['path'],par['sha256']);ref(src['path'],src['sha256']);ref(audit['path'],audit['sha256'])
 plans[key]={'key':key,'canonical':'nemata-jp-chapter-232-1' if key=='232' else 'nemata-jp-chapter-250-1','ownerIssueId':owner,'parent':par,'source':src,'parentAudit':audit,'newModelCalls':0,'wholeChapterPassed':False}
 if key=='232':plans[key]['newTargetReceipt']=ref(P/'integration/coac249-232-target-impact-reviewed-20261028.json');plans[key]['newTargetRaw']=ref(r232['raw']['path'],r232['raw']['sha256'])
 else:plans[key]['orderedContext']=ref(P/f'integration/coac269-311250-zero-preparation-20261028/{key}-context.json')
ad=prep['pdf261']['historicalAdjudication'];ref(ad['path'],ad['sha256']);historical=ref(P/'audit/calls/91507699-61d3-496d-9481-de5f38e8418c.json','4803be122fb4d59f1bfe52f4eb8607dc5c0c897b02cb9def2604ca9e04fd3255')
plans['261']['oldAdjudication']=ad;plans['261']['independentRaw']=historical
adj=L(ad['path']);dep=P/adj['manifest']['path'];ref(dep,adj['manifest']['sha256']);dependencies=L(dep)
for f in dependencies['files']:ref(dep.parent/f['name'],f['sha256'])
for f in adj['evidence']:ref(P/f['path'],f['sha256'])
dump(O/'plans.json',plans);dump(O/'input-bindings.json',{'files':list(refs.values()),'liveHistoryPath':'E:/AgentData/Coach/knowledge/human-annotations/events.jsonl','newModelCalls':0})
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'counts':counts,'delta':delta},ensure_ascii=False))
