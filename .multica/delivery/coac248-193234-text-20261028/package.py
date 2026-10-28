import json,pathlib,hashlib,shutil,datetime,zipfile
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;P=R/'integration/coac248-193234-text-20261028'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
assert not (H/'result.json').exists(),'Do not rewrite stage receipt'
release=read(P/'release.json');entries=[];paths=set()
def add(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else R/p;assert p.is_file(),str(p);paths.add(p)
def collect_candidate(path,seen=None):
 seen=seen or set();p=pathlib.Path(path);p=p if p.is_absolute() else R/p
 if p in seen:return
 seen.add(p);add(p);c=read(p);v=c.get('provenance',{})
 for a in v.get('attempts',[]):add(R/v['artifactRoot']/a['rawArtifactPath'])
 for k in ['derivedFromCandidate','dictionary','verifiedAssetDictionary','reuseMap']:
  q=v.get(k)
  if isinstance(q,dict) and q.get('path'):add(q['path'])
 rev=v.get('revision')
 if rev:
  add(rev['notesPath']);collect_candidate(rev['parentPath'],seen)
  if rev.get('inlineJapanese'):add(rev['inlineJapanese']['path'])
 for f in c.get('figures',[]):
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
for j in release['jobs']:
 e=read(P/(j['articleId']+'-production.json'));c=read(R/e['candidatePath']);p=read(R/j['parentPath']);n=read(R/j['notesPath']);s=read(R/j['sourcePath']);run=R/('web-production/v1/runs/coac248-193234-text-'+j['articleId']+'-20261028')
 for f in ['slot-released.json','chapter-released.json']:assert read(run/f)['ok']
 wake=read(H/(j['key']+'-wakeup.json'));call=e['productionCall']
 entries.append({'canonical':j['chapterId'],'candidatePath':e['candidatePath'],'candidateSha256':e['candidateSha256'],'parentPath':j['parentPath'],'parentSha256':j['parentSha256'],'sourceSha256':j['sourceSha256'],'parentReviewSha256':j['notesSha256'],'callId':call['callId'],'actualModel':call['model'],'actualEffort':call['reasoningEffort'],'images':call['requestExecution']['images'],'usage':call['usage'],'durationMs':call['durationMs'],'diff':e['diff'],'preservation':e['preservation'],'allCompleteFiguresInherited':len(p['figures']),'nonTargetBlocksInherited':len(p['body']['blocks'])-1,'history':j['history'],'oldTimeout':j.get('oldTimeout'),'old193PriorBudgetConsumed':2 if j['key']=='193' else None,'thisItemNewBudgetMaximum':2,'makerConsumed':1,'independentTextReviewHandedTo249':1,'retry':0,'failedVoidCount':True,'handoff249Path':'integration/coac248-193234-text-20261028/'+j['key']+'-handoff249.json','handoff249Sha256':sha(P/(j['key']+'-handoff249.json')),'wakeup249':wake['id'],'slotReleased':True,'chapterClaimReleased':True,'wholeChapterPassed':False,'admissionGranted':False})
 collect_candidate(e['candidatePath']);add(j['sourcePath']);add(j['notesPath'])
 if n.get('auditor'):add(n['auditor']['path'])
 for k in ['html','main']:add('web-sources/v1/'+s[k]['path'])
 for a in s['assets']:add('web-sources/v1/'+a['path'])
 if j['key']=='193':
  add(j['reviewRawPath']);add(j['priorReviewPlanPath'])
  for q in ['integration/coac249-jp193-scope-inheritance-20261028.json','integration/coac249-jp193-display-and-residual-20261028.json']:add(q)
 else:
  add(j['oldTimeout']['rawPath']);add('integration/coac244-ready109167-zero-20261028/234-current-timeout-boundary.json')
  for a in n['calls']:add('audit/calls/'+a['callId']+'.json')
 for f in run.iterdir():
  if f.is_file():add(f)
 calls=[json.loads(l) for l in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if l and json.loads(l).get('articleId')==j['articleId']];write(H/(j['key']+'-production-ledger.json'),calls)
 for a in calls:add('web-production/v1/'+a['rawArtifactPath'])
result={'schema':'coac248-193234-bounded-text-recovery-stage/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorizationCommentId':release['authorizationCommentId'],'branch':'agent/mika/coac-248','startingCommit':'0c7a9a3a44e0f33d7175b633a1633070616d0eb3','newCallsThisTicket':{'maker':2,'independentReview':0,'failed':0,'void':0,'retry':0},'combinedBudgetMaximum':4,'perItemBudgetMaximum':2,'independentReviewsHandedToExisting249':2,'budgetNotBorrowed':True,'runtimeManifestSha256':release['runtimeManifestSha256'],'frozenLocalFiles':21,'frozenParentRuntimeDependencies':33,'preDispatchNegativeChecks':31,'additionalInheritanceNegativeChecks':15,'chapters':entries,'wholeChapterPassed':False,'admissionGranted':False,'wholeBookComplete':False,'activeChanged':False,'fee':'unknown','remoteWeights':'unknown','upstreamExecutionCount':'unknown'}
write(H/'result.json',result);write(P/'result.json',result)
inventory=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(inventory)
for row in inv['objects']:
 e=next((e for e in entries if e['canonical']==row.get('chapterId')),None)
 if not e:continue
 row['parentCandidateBefore193234TextRecovery']={'path':row.get('candidatePath'),'sha256':row.get('candidateSha256')};row['candidatePath']=str(R/e['candidatePath']).replace('\\','/');row['candidateSha256']=e['candidateSha256'];row['currentDisposition']='awaiting-independent-text-target-review';row['textRecovery193234Stage']=e;row['originalAuditAndSeverityPreserved']=True
inv['latest193234TextRecoveryStage']=result;write(inventory,inv,1)
owner=read(R/'integration/coac244-remaining26-closure-register-20261028.json');write(H/'owner-rows.json',{'ownerPath':'integration/coac244-remaining26-closure-register-20261028.json','rows':[r for r in owner['rows'] if r['chapterId'] in [j['chapterId'] for j in release['jobs']]]})
for f in P.iterdir():
 if f.is_file() and f.name!='release-unfrozen.json':add(f)
for f in pathlib.Path(release['runtimePath']).iterdir():
 if f.is_file():add(f)
for f in release['externalDependencies']:add(f['path'])
dest=H/'evidence';dest.mkdir(exist_ok=True);mapping=[]
for i,p in enumerate(sorted(paths,key=str)):
 out=dest/(str(i).zfill(3)+p.suffix);shutil.copyfile(p,out);assert sha(out)==sha(p);mapping.append({'archivePath':str(out.relative_to(H)).replace('\\','/'),'originalPath':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
write(H/'path-map.json',mapping)
with zipfile.ZipFile(H.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for f in H.rglob('*'):
  if f.is_file() and '__pycache__' not in str(f):z.write(f,str(f.relative_to(H)))
print(json.dumps({'evidenceFiles':len(mapping),'zipBytes':H.with_suffix('.zip').stat().st_size,'calls':result['newCallsThisTicket'],'candidates':[(e['canonical'],e['candidateSha256']) for e in entries]}))
