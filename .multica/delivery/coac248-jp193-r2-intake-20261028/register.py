import pathlib,json,hashlib,shutil
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;O=R/'integration/coac248-jp193-r2-intake-20261028'
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
v=read(H/'verification.json');entry={k:v[k] for k in ['canonical','candidate','source','parent','parentAudit','parentRaw','receipt','raw','independentCall','originalModelReview','originalVerification','actualArgumentChecks','historicalIssuesExactlyInherited','issueBindings','newIssueCount','originalFalseAndSeverityRetained','originalParentOrderedContextFaithful','originalParentLimitedEvidenceVerified','status','preservation','partialEvidence','minimumRemaining','budget','dedupe','newModelCalls','newProductionCalls','newReviews','newConsumers','wholeChapterPassed','admissionGranted']};entry['verificationPath']='integration/coac248-jp193-r2-intake-20261028/verification.json'
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';before=owner.read_bytes();x=json.loads(before);row=next(r for r in x['rows'] if r['chapterId']==v['canonical']);assert 'jp193R2IndependentIntake' not in row,'Already registered; preserve subsequent work'
row['jp193R2IndependentIntake']=entry;row['current193TextR2Authorization']={'commentId':'01a181e7-d3dc-76f2-adb8-00cbb4f4e332','candidateSha256':v['candidate']['sha256'],'makerCallId':'1f923bbe-3124-4975-be79-4551ea607ab3','independentReviewCallId':v['independentCall']['callId'],'makerConsumed':1,'independentReviewConsumed':1,'phaseCallsConsumed':2,'remainingBudget':0,'priorMixed193PhaseConsumed':2,'priorPhaseNotReset':True,'retry':0,'phase':v['status'],'wholeChapterPassed':False,'admissionGranted':False}
# The owner may already be assembling the same r2. Preserve a newer scoped action.
active=row.get('latestScopedCandidate',{})
if v['candidate']['sha256'] not in json.dumps(active,ensure_ascii=False):
 row['nextActionBefore193R2Intake']=row.get('nextAction');row['nextAction']='193/r2 b0081及完整相关论证获真实纯文字独审faithful，七组argumentChecks全true；四条issues逐对象为父审历史，不能再把旧双条件错误当现稿退回。原textTargetEvidenceVerified=false/target_not_accepted与旧false/severity照留。现有244/250已接同SHA在途：只需零模型精确组合合同、七条非原文限制实际展示、作者内容反向一致性验证及MCP/Arena读回；仍未准入，不追加制作/识图/复审。新本项2/2已耗尽，旧193阶段2/2另保留。'
assert owner.read_bytes()==before,'Owner changed concurrently; stop without overwrite';save(owner,x,1);save(H/'owner-row.json',row)
path=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=read(path)
for row in inv['objects']:
 if row.get('chapterId')==v['canonical']:
  assert row['candidateSha256']==v['candidate']['sha256'];row['currentDisposition']=v['status'];row['jp193R2IndependentIntake']=entry
inv['jp193R2IndependentIntake']=entry;save(path,inv,1);save(H/'owner-registration.json',entry);save(O/'owner-registration.json',entry)
mapping=read(H/'path-map.json');paths={str(pathlib.Path(r['path']).resolve()) for r in mapping}
def add(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve()
 if str(p) in paths:return
 assert p.is_file(),str(p);archivePath='evidence/'+str(len(mapping)).zfill(3)+p.suffix;shutil.copyfile(p,H/archivePath);mapping.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size,'archivePath':archivePath});paths.add(str(p))
seen=set()
def candidate(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve()
 if str(p) in seen:return
 seen.add(str(p));add(p);c=read(p);v=c['provenance']
 for a in v['attempts']:add(R/v['artifactRoot']/a['rawArtifactPath'])
 for k in ['derivedFromCandidate','dictionary','verifiedAssetDictionary','reuseMap']:
  b=v.get(k)
  if isinstance(b,dict) and b.get('path'):add(b['path'])
 for f in c['figures']:
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
 rev=v.get('revision')
 if rev:
  candidate(rev['parentPath']);add(rev['notesPath']);n=read(R/rev['notesPath'])
  for b in n.get('calls',[]):add('audit/calls/'+b['callId']+'.json')
  if n.get('auditor'):add(n['auditor']['path'])
candidate(v['candidate']['path']);s=read(pathlib.Path(v['source']['path']))
for k in ['html','main']:add('web-sources/v1/'+s[k]['path'])
for a in s['assets']:add('web-sources/v1/'+a['path'])
save(H/'path-map.json',mapping)
print(json.dumps({'registered':v['canonical'],'newCalls':0,'originalFalseAndFourHistoricalIssuesKept':True,'newTextStageConsumed':2,'newTextStageRemaining':0,'oldStageConsumedSeparately':2,'evidenceFiles':len(mapping),'newDispatches':0}))
