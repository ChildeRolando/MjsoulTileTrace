import hashlib,json,shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027';OUT=Path('.multica/delivery/coac244-inline-text-20261027')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
passed=read(STAGE/'chapter-155/verified-pass.json');assert passed['status']=='passed'
for k in ['candidate','audit']:assert sha(passed[k+'Path'])==passed[k+'Sha256']
prod=next(json.loads(l) for l in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if l and json.loads(l)['callId']=='676d346d-772e-4662-8fa9-02b236073167')
candidate=read(passed['candidatePath']);assert candidate['provenance']['modelCalls']==1
review=passed['calls'][0]
copies={'155-candidate.display.json':Path(passed['candidatePath']),'155-audit.json':Path(passed['auditPath']),
 '155-production-raw.json':ROOT/'web-production/v1/raw-calls/676d346d-772e-4662-8fa9-02b236073167.json',
 '155-independent-raw.json':ROOT/'audit/calls'/ (review['callId']+'.json')}
for n,p in copies.items():shutil.copyfile(p,OUT/n)
for p in (STAGE/'chapter-155').iterdir():
    if p.is_file():shutil.copyfile(p,OUT/('155-'+p.name))
shutil.copyfile('ticket-dispatch-result.json',OUT/'ticket-dispatch-created.json')
manifest=read(STAGE/'runtime-manifest.json');display=read(STAGE/'display-stage-manifest.json')
result={'schema':'coach-coac244-inline-text-stage-result/1','authorizationCommentId':'01a17e4c-8ec2-73f3-8c59-92bb3f8910db',
 'pass155':passed,'production':prod,'outputNormalization':candidate['provenance']['outputNormalization'],
 'budget155':{'maximumProductionCalls':1,'actualProductionCalls':1,'maximumFirstReviewCalls':1,'actualFirstReviewCalls':1,
   'actualTotalNewCalls':2,'automaticModelRetries':0,'zeroModelRecoveryCalls':0,'initialOutputGateRejected':True,'laterRecoveredFromSameRaw':True,
   'inputTokens':prod['usage']['inputTokens']+review['usage']['inputTokens'],'outputTokens':prod['usage']['outputTokens']+review['usage']['outputTokens'],
   'cachedInputTokens':prod['usage']['cachedInputTokens']+review['usage']['cachedInputTokens'],'currencyCharge':None,
   'combinedPrior347And155ActualCalls':4,'combinedPrior347And155Limit':4},
 'ticketBatch':{'intakePath':str(STAGE/'ticket-intake.json'),'intakeSha256':sha(STAGE/'ticket-intake.json'),
   'chapterIds':['79-cn-chapter-162-3','79-cn-chapter-234-12'],'maxNewCalls':4,'perChapterProduction':1,'perChapterFirstReview':1,'automaticRetries':0,
   'agentId':'ba77da89-8574-4dea-8fc2-24e841fc2754','model':'gpt-6.1-sol','runtimeId':'731c52da-6d5e-4c5b-80c9-e9f39803735b',
   'wakeupId':'01a17e5c-acab-70c6-bceb-f91ed968f733'},
 'held182':{'chapterId':'79-cn-chapter-182-5','targetTranslation':'79-bilibili-cn:cv1760573:b0003','unresolved':'79-bilibili-cn:cv1760573:b0013',
   'severity':'uncertain','newModelCalls':0,'sourceSentence':'这样的立直话，对手只能对日','nextStep':'Obtain an explicit collation for the source phrase 对日 from the bound upstream original context before treating this as a finite text repair. Preserve uncertainty; do not guess the response action. No current dispatch.'},
 'parent157':read(OUT/'157-parent-clarification.json'),
 'regressions':{'passed':24,'newModelCalls':0,'proofPath':str(STAGE/'zero-call-parent-proofs.json'),'proofSha256':sha(STAGE/'zero-call-parent-proofs.json')},
 'runtime':manifest,'displayStage':display,'activeChanged':False,
 'copiedArtifacts':[{'name':n,'sha256':sha(OUT/n),'sourcePath':str(p)} for n,p in copies.items()]}
p=OUT/'stage-result.json'
with p.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
handoff=ROOT/'integration/coac244-reviewed-inline155-20261027.json'
with handoff.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
shutil.copyfile(handoff,OUT/'handoff-250-inline155.json')
print(json.dumps({'candidateSha256':passed['candidateSha256'],'auditSha256':passed['auditSha256'],'handoff':str(handoff),'handoffSha256':sha(handoff),'budget155':result['budget155']},ensure_ascii=False))
