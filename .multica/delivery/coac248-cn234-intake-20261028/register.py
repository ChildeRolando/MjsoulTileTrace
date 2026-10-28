import pathlib,json,hashlib,shutil
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;O=R/'integration/coac248-cn234-intake-20261028'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
v=read(H/'verification.json');entry={k:v[k] for k in ['canonical','candidate','source','parent','parentAudit','parentRaw','receipt','raw','independentCall','originalModelReview','originalVerification','scopeSidecar','actualArgumentChecks','status','preservation','auditRequirementsMapped','oldTimeout','minimumRemaining','budget','dedupe','wholeChapterPassed','admissionGranted','newModelCalls','newProductionCalls','newReviews','newConsumers']};entry['verificationPath']='integration/coac248-cn234-intake-20261028/verification.json'
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';before=owner.read_bytes();x=json.loads(before);row=next(r for r in x['rows'] if r['chapterId']==v['canonical']);assert 'cn234IndependentIntake' not in row,'Already registered; preserve subsequent state';row['cn234IndependentIntake']=entry;row['current234TextR1Authorization']={'commentId':'01a181e7-d3dc-76f2-adb8-00cbb4f4e332','candidateSha256':v['candidate']['sha256'],'makerCallId':'997c8aa4-7101-4c1e-9a9f-9af76deb1e70','independentReviewCallId':v['independentCall']['callId'],'makerConsumed':1,'independentReviewConsumed':1,'consumed':2,'remaining':0,'retry':0,'noOldUnusedReviewDoubleCounted':True,'phase':v['status'],'wholeChapterPassed':False,'admissionGranted':False}
if v['candidate']['sha256'] not in json.dumps(row.get('latestScopedCandidate',{})):
 row['nextActionBefore234IndependentIntake']=row.get('nextAction');row['nextAction']='234/b0003三处术语释义获真实纯文字独审faithful，textTargetEvidenceVerified=true、errors=[]、11组论证均faithful；旧jp193 schema标签仅元数据误留，精确234 sidecar绑定actual canonical/target/raw/plan，不是新审。现有244/250已接同SHA：只核合法精确234补充scope、三条审计/来源层要求映射、实际三释义及支付条件/原图/unknown呈现与真实MCP/Arena读回。不得将SHA/调用账插入作者正文或称全章重新审图。新本项2/2余0、0retry；旧900秒超时/2重连/usage=null及其它失败不改，不重复识图或收费审校。'
assert owner.read_bytes()==before,'Owner changed concurrently; stop without overwrite';save(owner,x,1);save(H/'owner-row.json',row)
path=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(path)
for row in inv['objects']:
 if row.get('chapterId')==v['canonical']:
  assert row['candidateSha256']==v['candidate']['sha256'];row['currentDisposition']=v['status'];row['cn234IndependentIntake']=entry
inv['cn234IndependentIntake']=entry;save(path,inv,1);save(H/'owner-registration.json',entry);save(O/'owner-registration.json',entry)
mapping=read(H/'path-map.json');paths={str(pathlib.Path(r['path']).resolve()) for r in mapping}
def add(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve()
 if str(p) in paths:return
 assert p.is_file(),str(p);archivePath='evidence/'+str(len(mapping)).zfill(3)+p.suffix;shutil.copyfile(p,H/archivePath);mapping.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size,'archivePath':archivePath});paths.add(str(p))
seen=set()
def candidate(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve()
 if str(p) in seen:return
 seen.add(str(p));add(p);c=read(p);prov=c['provenance']
 for a in prov['attempts']:add(R/prov['artifactRoot']/a['rawArtifactPath'])
 for k in ['derivedFromCandidate','dictionary','verifiedAssetDictionary','reuseMap']:
  b=prov.get(k)
  if isinstance(b,dict) and b.get('path'):add(b['path'])
 for f in c['figures']:
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
 rev=prov.get('revision')
 if rev:
  candidate(rev['parentPath']);add(rev['notesPath']);n=read(R/rev['notesPath'])
  for b in n.get('calls',[]):add('audit/calls/'+b['callId']+'.json')
  if n.get('auditor'):add(n['auditor']['path'])
  if rev.get('inlineJapanese'):add(rev['inlineJapanese']['path'])
candidate(v['candidate']['path']);s=read(pathlib.Path(v['source']['path']))
for k in ['html','main']:add('web-sources/v1/'+s[k]['path'])
for a in s['assets']:add('web-sources/v1/'+a['path'])
calls=[json.loads(line) for line in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if line and json.loads(line).get('articleId')=='cv1780400'];save(H/'production-call-history.json',calls)
for a in calls:add('web-production/v1/'+a['rawArtifactPath'])
save(H/'path-map.json',mapping)
print(json.dumps({'registered':v['canonical'],'textTargetEvidenceVerified':True,'newCalls':0,'currentStageConsumed':2,'remaining':0,'oldTimeoutPreserved':True,'scopeMetadataBoundTo234':True,'evidenceFiles':len(mapping),'newDispatches':0}))
