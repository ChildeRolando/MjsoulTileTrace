import json,hashlib,pathlib,shutil,zipfile
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;O=R/'integration/coac248-jp213-intake-20261028'
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,v,indent=2):p.write_text(json.dumps(v,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
v=load(H/'verification.json');entry={k:v[k] for k in ['canonical','candidate','source','parent','parentAudit','receipt','raw','independentCall','originalVerification','actualArgumentChecks','handoffSummaryCorrection','status','originalFalseRetained','issueMapping','partialEvidence','minimumRemaining','budget','dedupe','wholeChapterPassed','admissionGranted','newModelCalls','newProductionCalls','newReviews','newConsumers']};entry['verificationPath']='integration/coac248-jp213-intake-20261028/verification.json'
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';x=load(owner);row=next(r for r in x['rows'] if r['chapterId']==v['canonical']);assert 'jp213IndependentIntake' not in row,'Already registered; preserve newer state'
row['nextActionBefore213Intake']=row.get('nextAction');row['jp213IndependentIntake']=entry;row['nextAction']='复用244已完成的精确213合同核验b18127b9：两靶点faithful、四unknown影响获限定允许，真实六组论证全true。保留原limitedEvidenceVerified=false及历史error/uncertain。最小尚缺：本213精确SHA补充loader、b0032后/b0033前八条非原文限制安装、反向去注后作者字节核验、既有250持久路由及真实MCP/Arena读回；当前仍未准入。现有250已接同一交接，不新增消费者或调用，不再挂识字待办。'
row['current193213Authorization'].update({'phase':'independent-evidence-intaken-contract-and-display-pending','independentReviewReservedFor249':0,'independentReviewConsumed':1,'chapterPhaseCallsConsumed':2,'remainingModelBudget':0,'wholeChapterPassed':False,'admissionGranted':False});save(owner,x,1);save(H/'owner-row.json',row)
invPath=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=load(invPath)
for row in inv['objects']:
 if row.get('chapterId')==v['canonical']:
  assert row['candidateSha256']==v['candidate']['sha256'];row['currentDisposition']=v['status'];row['jp213IndependentIntake']=entry
inv['jp213IndependentIntake']=entry;save(invPath,inv,1);save(H/'owner-registration.json',entry);save(O/'owner-registration.json',entry)
mapping=load(H/'path-map.json');paths={r['path'] for r in mapping}
def add(path):
 p=pathlib.Path(path);p=p if p.is_absolute() else R/p
 if str(p) in paths:return
 assert p.is_file(),str(p)
 out='evidence/'+str(len(mapping)).zfill(3)+p.suffix;shutil.copyfile(p,H/out);mapping.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size,'archivePath':out});paths.add(str(p))
receipt=load(R/'integration/coac249-213-target-impact-reviewed-20261028.json');source=load(pathlib.Path(receipt['source']['path']));parent=load(pathlib.Path(receipt['parent']['path']));c=load(pathlib.Path(receipt['candidate']['path']));oldAudit=load(pathlib.Path(receipt['parentAudit']['path']))
for a in oldAudit['calls']:add('audit/calls/'+a['callId']+'.json')
for obj in [c,parent]:
 for a in obj['provenance']['attempts']:add(R/obj['provenance']['artifactRoot']/a['rawArtifactPath'])
 for k in ['derivedFromCandidate','dictionary','verifiedAssetDictionary','reuseMap']:
  b=obj['provenance'].get(k)
  if isinstance(b,dict) and b.get('path'):add(b['path'])
 for f in obj['figures']:
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
for k in ['html','main']:add('web-sources/v1/'+source[k]['path'])
for a in source['assets']:add('web-sources/v1/'+a['path'])
add(oldAudit['auditor']['path']);add('integration/coac244-213-contract-assessment-20261028/assess.mjs');add('integration/coac244-213-contract-assessment-20261028/files.sha256.json')
save(H/'path-map.json',mapping)
print(json.dumps({'registered':v['canonical'],'newCalls':0,'originalFalseRetained':True,'remainingBudget':0,'evidenceFiles':len(mapping),'ownerExistingDeliveryReused':True}))
