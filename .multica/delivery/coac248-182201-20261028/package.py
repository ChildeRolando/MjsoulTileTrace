import json,hashlib,shutil,zipfile,datetime
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent;PKG=ROOT/'integration/coac248-182201-20261028'
assert not (HERE/'result.json').exists(), 'Already packaged: preserve the original parent/history registration; do not run again.'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
release=read(PKG/'release.json');jobs=release['jobs'];proofs=[read(PKG/(j['articleId']+'-production.json')) for j in jobs]
result={'schema':'coac248-182201-bounded-maker-batch/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorizationCommentId':'01a181a7-0e17-79cd-9f13-c8fe5cf060b2','branch':'agent/mika/coac-248','startingCommit':'5c2733e1ba7f50fa6bef241932b96e9010a762a7','newCallsThisTicket':{'maker':2,'independentAudit':0,'failed':0,'void':0,'retry':0},'batchMaximumCalls':4,'reviewBudgetDelegatedTo249':{'182-5':1,'201-6':1},'runtimeManifestSha256':release['runtimeManifestSha256'],'runtimeFiles':19,'chapters':[],'wholeBookComplete':False,'activeSwitched':False,'chapterAccepted':False,'upstreamExecutionCount':'unknown','remoteWeights':'unknown','fees':'unknown'}
for j,e in zip(jobs,proofs):
 a=j['articleId'];run=ROOT/('web-production/v1/runs/coac248-182201-'+a+'-20261028')
 for f in ['slot-released.json','chapter-released.json']:assert read(run/f)['ok']
 result['chapters'].append({'canonical':j['chapterId'],'articleId':a,'candidatePath':e['candidatePath'],'candidateSha256':e['candidateSha256'],'parentSha256':j['parentSha256'],'sourceSha256':j['sourceSha256'],'parentAuditSha256':j['notesSha256'],'makerCallId':e['productionCall']['callId'],'model':e['productionCall']['model'],'reasoningEffort':e['productionCall']['reasoningEffort'],'imageCount':len(e['productionCall']['requestExecution']['images']),'durationMs':e['productionCall']['durationMs'],'usage':e['productionCall']['usage'],'diff':e['diff'],'whitelist':e['whitelist'],'preservation':e['preservation'],'remainingSpecificScope':e['carryIssue'],'handoffPath':'integration/coac248-182201-20261028/'+a+'-handoff249.json','handoffSha256':sha(PKG/(a+'-handoff249.json')),'historicalCallsUnchanged':j['history'],'slotReleased':True,'chapterClaimReleased':True,'status':'awaiting-independent-target-context-review'})
write(PKG/'result.json',result);write(HERE/'result.json',result)
# Update only these two existing repair entries. Old receipts and historical
# counts are retained; this batch is not a whole-book accepted-count update.
inventory=HERE.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(inventory)
for row in inv['objects']:
 item=next((c for c in result['chapters'] if c['canonical']==row.get('chapterId')),None)
 if not item:continue
 row['parentCandidatePathBefore182201']=row['candidatePath'];row['parentCandidateSha256Before182201']=row['candidateSha256']
 row['candidatePath']=str(ROOT/item['candidatePath']).replace('\\','/');row['candidateSha256']=item['candidateSha256'];row['currentDisposition']='awaiting-independent-target-context-review'
 row['latestExactTranslation20261028']=item;row['oldAuditRetainedUnchanged']=True;row['currentOrderedSourceBlocks']=13 if row['articleId']=='cv1760573' else 7
inv['latest182201MakerBatch']=result;inv['latestRound']='coac248-182201-bounded-maker-20261028'
with inventory.open('w',encoding='utf8',newline='\n') as f:f.write(json.dumps(inv,ensure_ascii=False,indent=1)+'\n')
owner=read(ROOT/'integration/coac244-remaining26-closure-register-20261028.json')
write(HERE/'owner-rows.json',{'rows':[r for r in owner['rows'] if r['chapterId'] in [j['chapterId'] for j in jobs]],'fullOwnerPath':'integration/coac244-remaining26-closure-register-20261028.json'})
paths=set()
def add(p):
 p=Path(p);p=p if p.is_absolute() else ROOT/p
 assert p.is_file(),str(p);paths.add(p)
for f in PKG.iterdir():
 if f.is_file():add(f)
rt=Path(release['runtimePath'])
for f in rt.iterdir():
 if f.is_file():add(f)
for j,e in zip(jobs,proofs):
 for p in [j['parentPath'],j['notesPath'],j['sourcePath'],e['candidatePath']]:add(p)
 parent=read(ROOT/j['parentPath']);notes=read(ROOT/j['notesPath']);source=read(ROOT/j['sourcePath']);candidate=read(ROOT/e['candidatePath'])
 for c in [parent,candidate]:
  for attempt in c['provenance']['attempts']:add(ROOT/c['provenance']['artifactRoot']/attempt['rawArtifactPath'])
  for key in ['reuseMap','derivedFromCandidate']:
   if key in c['provenance']:add(c['provenance'][key]['path'])
 for c in notes['calls']:add('audit/calls/'+c['callId']+'.json')
 add(notes['auditor']['path'])
 for field in ['html','main']:add('web-sources/v1/'+source[field]['path'])
 for a in source['assets']:add('web-sources/v1/'+a['path'])
 for f in parent['figures']:add(f['presentationAsset']['path'])
 for a in parent['provenance']['attempts']:
  raw=read(ROOT/parent['provenance']['artifactRoot']/a['rawArtifactPath'])
  for v in raw.get('visualInputs',[]):add(v['path'])
 for f in (ROOT/('web-production/v1/runs/coac248-182201-'+j['articleId']+'-20261028')).iterdir():
  if f.is_file():add(f)
 # Retain real historical failures as distinct evidence, not zero usage.
 calls=[json.loads(l) for l in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if l and json.loads(l).get('articleId')==j['articleId']]
 write(HERE/(j['articleId']+'-ledger.json'),calls)
 for c in calls:
  old=ROOT/'web-production/v1'/c['rawArtifactPath']
  if old.is_file():add(old)
evidence=HERE/'evidence';evidence.mkdir(exist_ok=True);mapping=[]
for i,p in enumerate(sorted(paths,key=str)):
 dst=evidence/(f'{i:03d}'+p.suffix)
 shutil.copyfile(p,dst);assert sha(dst)==sha(p)
 mapping.append({'archivePath':str(dst.relative_to(HERE)).replace('\\','/'),'originalPath':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
write(HERE/'path-map.json',mapping)
(HERE/'.gitattributes').write_text('*.json -text whitespace=cr-at-eol\n*.py text eol=lf\n*.mjs text eol=lf\n*.md text eol=lf\nevidence/** -text -whitespace\n',encoding='utf8')
zip_path=HERE.with_suffix('.zip')
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
 for f in HERE.rglob('*'):
  if f.is_file() and '__pycache__' not in str(f):z.write(f,str(f.relative_to(HERE)))
print(json.dumps({'evidenceFiles':len(mapping),'archiveBytes':zip_path.stat().st_size,'chapters':[{k:c[k] for k in ['canonical','candidateSha256','makerCallId']} for c in result['chapters']]}))
