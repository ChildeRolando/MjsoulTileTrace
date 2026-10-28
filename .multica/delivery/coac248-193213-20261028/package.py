import json,hashlib,shutil,datetime,zipfile
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent;P=R/'integration/coac248-193213-20261028'
assert not (H/'result.json').exists(),'Already packaged; preserve history.'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x,indent=2):
 with p.open('w',encoding='utf8',newline='\n') as f:f.write(json.dumps(x,ensure_ascii=False,indent=indent)+'\n')
rel=read(P/'release.json');jobs=rel['jobs'];entries=[];paths=set()
def add(p):
 p=Path(p);p=p if p.is_absolute() else R/p;assert p.is_file(),str(p);paths.add(p)
for j in jobs:
 e=read(P/(j['key']+'-production.json'));c=read(R/e['candidatePath']);p=read(R/j['parentPath']);n=read(R/j['notesPath']);s=read(R/j['sourcePath']);run=R/('web-production/v1/runs/coac248-mixed-'+j['key']+'-20261028')
 for f in ['slot-released.json','chapter-released.json']:assert read(run/f)['ok']
 entries.append({'canonical':j['chapterId'],'articleId':j['articleId'],'candidatePath':e['candidatePath'],'candidateSha256':e['candidateSha256'],'parentSha256':j['parentSha256'],'sourceSha256':j['sourceSha256'],'parentAuditSha256':j['notesSha256'],'makerCallId':e['call']['callId'],'model':e['call']['model'],'reasoningEffort':e['call']['reasoningEffort'],'actualImages':len(e['call']['requestExecution']['images']),'usage':e['call']['usage'],'durationMs':e['call']['durationMs'],'textDiff':e['textDiff'],'figureDiff':e['figureDiff'],'preservation':e['preservation'],'retainedUnknowns':j['expectedUnknowns'],'historicalCalls':j['history'],'handoff249Path':'integration/coac248-193213-20261028/'+j['key']+'-handoff249.json','handoff249Sha256':sha(P/(j['key']+'-handoff249.json')),'independentReviewReserved':1,'semanticAcceptance':'not claimed; independent review pending','slotReleased':True,'chapterClaimReleased':True})
 for path in [j['parentPath'],j['notesPath'],j['sourcePath'],j['reviewRawPath'],e['candidatePath'],n['auditor']['path']]:add(path)
 for candidate in [p,c]:
  for call in candidate['provenance']['attempts']:add(R/candidate['provenance']['artifactRoot']/call['rawArtifactPath'])
  for field in ['reuseMap','derivedFromCandidate','dictionary','verifiedAssetDictionary']:
   b=candidate['provenance'].get(field)
   if isinstance(b,dict) and b.get('path'):add(b['path'])
 for field in ['html','main']:add('web-sources/v1/'+s[field]['path'])
 for asset in s['assets']:add('web-sources/v1/'+asset['path'])
 for f in p['figures']:
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
 for v in j['visualInputs']:add(v['path'])
 for f in run.iterdir():
  if f.is_file():add(f)
 calls=[json.loads(l) for l in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if l and json.loads(l).get('articleId')==j['articleId']];save(H/(j['key']+'-ledger.json'),calls)
result={'schema':'coac248-193213-bounded-mixed-maker-stage/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorizationCommentId':jobs[0]['authorizationCommentId'],'branch':'agent/mika/coac-248','startingCommit':'545d8ac20b3d217e4b1052a89f1e59243c93e059','newCallsThisTicket':{'maker':2,'independentReview':0,'failed':0,'void':0,'retry':0},'batchMaximumNewCalls':4,'independentFirstReviewsReservedFor249':2,'runtimeManifestSha256':rel['runtimeManifestSha256'],'frozenDependencies':32,'negativeChecksPerChapter':21,'chapters':entries,'wholeBookComplete':False,'wholeChapterPassed':False,'admissionGranted':False,'activeChanged':False,'fee':'unknown','remoteWeights':'unknown','upstreamExecutionCount':'unknown'}
save(P/'result.json',result);save(H/'result.json',result)
inventory=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(inventory)
for row in inv['objects']:
 e=next((e for e in entries if e['canonical']==row.get('chapterId')),None)
 if not e:continue
 row['parentCandidateBeforeMixed193213']={'path':row['candidatePath'],'sha256':row['candidateSha256']};row['candidatePath']=str(R/e['candidatePath']).replace('\\','/');row['candidateSha256']=e['candidateSha256'];row['currentDisposition']='awaiting-independent-combined-target-impact-review';row['mixed193213MakerStage']=e;row['originalAuditAndSeverityPreserved']=True
inv['latestMixed193213MakerStage']=result;save(inventory,inv,1)
owner=read(R/'integration/coac244-remaining26-closure-register-20261028.json');save(H/'owner-rows.json',{'ownerPath':'integration/coac244-remaining26-closure-register-20261028.json','rows':[r for r in owner['rows'] if r['chapterId'] in [j['chapterId'] for j in jobs]]})
for f in P.iterdir():
 if f.is_file():add(f)
for f in Path(rel['runtimePath']).iterdir():
 if f.is_file():add(f)
dest=H/'evidence';dest.mkdir(exist_ok=True);mapping=[]
for i,p in enumerate(sorted(paths,key=str)):
 out=dest/(str(i).zfill(3)+p.suffix);shutil.copyfile(p,out);assert sha(out)==sha(p);mapping.append({'archivePath':str(out.relative_to(H)).replace('\\','/'),'originalPath':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
save(H/'path-map.json',mapping)
with zipfile.ZipFile(H.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for f in H.rglob('*'):
  if f.is_file() and '__pycache__' not in str(f):z.write(f,str(f.relative_to(H)))
print(json.dumps({'evidenceFiles':len(mapping),'zipBytes':H.with_suffix('.zip').stat().st_size,'chapters':[{k:e[k] for k in ['canonical','candidateSha256','makerCallId']} for e in entries]}))
