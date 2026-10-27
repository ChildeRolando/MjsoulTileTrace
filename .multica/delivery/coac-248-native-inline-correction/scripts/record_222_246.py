"""Record only the two authorized chapters and their actual foreground receipts."""
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

local=Path(__file__).resolve().parent.parent
root=Path('E:/AgentData/Coach/knowledge/processing')
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,v): p.write_text(json.dumps(v,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

d=load(local/'unified-repair-list-20261027.json')
at=datetime.now(timezone.utc).isoformat()
out=[]
for key in ['222-5','246-3']:
    ep=local/f'receipt-web{key}.rev1-awaiting-review.json'
    if not ep.exists(): continue
    e=load(ep)
    row=next(x for x in d['objects'] if x['objectId']=='web-chapter:'+e['chapterId'])
    assert row['candidateSha256']==e['parentSha256'], 'already recorded or parent changed'
    row['parentVersion']={k:row.get(k) for k in ['candidatePath','candidateSha256','auditPath','auditStatus','issueCount','auditRecordedAt']}
    row.update(candidatePath=str(root/e['candidatePath']).replace('\\','/'),candidateSha256=e['candidateSha256'],
               auditPath=None,auditSha256=None,auditStatus='awaiting-independent-review',auditRecordedAt=None,issueCount=None,
               currentDisposition='revision-produced-awaiting-COAC-249-first-full-article-review',diskShaVerified=True)
    wp=local/f'wakeup-249-{key}-receipt.json'
    wake=load(wp) if wp.exists() else None
    row['revision']={
        'parentPath':e['parentPath'],'parentSha256':e['parentSha256'],'parentAuditPath':e['parentAuditPath'],'parentAuditSha256':e['parentAuditSha256'],
        'sourceSha256':e['sourceSha256'],'targets':e['targets'],'productionCallId':e['productionAttempt']['callId'],
        'productionUsage':e['productionAttempt']['usage'],'evidence':ep.name,'handoff249':f'integration/coac249-incremental-{key}-20261027.json',
        'wakeup249':wake['id'] if wake else None,'modelCalls':e['modelCalls'],'independentAuditBudget':1,'retryBudget':0,'semanticAcceptance':None,
        'transportRecovery':e['productionAttempt'].get('transportRecovery'),
        'nonTargetBytesPreserved':e['preservation']['allNonTargetBytesPreserved'],
        'intermediateUnpresentedCandidate':e['rawCandidate']['path'],'intermediatePolicy':'same production call; do not separately review/integrate'}
    assert sha(root/e['candidatePath'])==e['candidateSha256']
    out.append({'chapterId':e['chapterId'],'articleId':e['articleId'],'parentSha256':e['parentSha256'],
                'candidateSha256':e['candidateSha256'],'sourceSha256':e['sourceSha256'],'targets':e['targets'],
                'status':e['status'],'calls':e['modelCalls'],'usage':e['productionAttempt']['usage'],
                'callId':e['productionAttempt']['callId'],'slot':{'acquired':e['dispatch']['slot']['record']['claimedAt'],'released':e['release']['at']},
                'bodyTextBlocks':e['preservation']['textBlocks'],'unchangedCompleteFigures':len(e['preservation']['completeNonTargetFigures']),
                'changedTargetFields':[{ 'figureId':x['figureId'],'fields':[f['field'] for f in x['fields']]} for x in e['changes']],
                'handoff':row['revision']['handoff249'],'wakeup249':row['revision']['wakeup249'],'evidence':ep.name})
assert out, 'no successful candidate; record actual failure separately'
d['countsPriorSnapshot20261027T1427']=d['countsCurrent']
passed=[x for x in d['objects'] if x.get('auditStatus','').startswith('passed')]
holds=[x for x in d['objects'] if x.get('currentDisposition','').startswith('decision-hold')]
pending=[x for x in d['objects'] if x.get('auditStatus')=='awaiting-independent-review']
repair=[x for x in d['objects'] if x.get('auditStatus')=='needs-repair' and x not in holds]
assert len(passed)+len(holds)+len(pending)+len(repair)==len(d['objects'])
d['countsCurrent']={'needsRepair':len(repair),'awaitingIndependentReview':len(pending),'decisionHold':len(holds),
                    'resolvedTotal':len(passed),'totalTracked':len(d['objects']),'failedSeparateHistoryRecords':len(d['failedSeparate']),
                    'scope':'Stored objects only, not a fresh whole-book remainder. Unrelated rows are inherited without refreshing their current external audit state; no new passed status inferred.'}
d['breakdown']['statusDetail']={'needsRepairOpen':[x['objectId'] for x in repair],'decisionHold':[x['objectId'] for x in holds],
                               'resolved':[x['objectId'] for x in passed],'awaitingIndependentReview':[x['objectId'] for x in pending]}
round_record={'schema':'coac-248-round-record/1','recordedAt':at,
              'triggerComment':'01a17dd3-6468-7817-bf65-ee5a868503da','scope':['79-cn-chapter-222-5','79-cn-chapter-246-3'],
              'objects':out,'modelCalls':{'production':len(out),'audit':0,'void':0,
                  'failed':sum(x['calls']['failed'] for x in out),
                  'recoveredWithoutNewCall':sum(x['calls']['recoveredWithoutNewCall'] for x in out)},
              'policy':{'model':'gpt-6.1-sol','reasoningEffort':'high','productionPerChapterLimit':1,'automaticRetry':False,
                        'independentReviewBy':'COAC-249','independentReviewPerCandidateLimit':1,
                        'BLine15711And2055Untouched':True,'p217p257Calls':0,'newFrameworkOrIssueOrWorkTask':False},
              'preservation':'Original source, parents, old audits, raw and unpresented producer output retained. New display candidates use verified existing presentation derivation; complete non-target objects, body and order are byte-identical under JSON serialization. All target-field changes are listed in per-chapter evidence.',
              'semanticAcceptance':None,'productCodeChanged':False,'pullRequestRequired':False,
              'next':'Finish at this finite two-chapter boundary after handing available candidates to249; no whole-book wait, no new A production wakeup.'}
d['refreshedAt']=at
for e in out:
    if not e['calls']['failed']: continue
    proof=load(local/e['evidence'])['productionAttempt']['transportRecovery']
    history=d.setdefault('productionFailureHistory',[])
    assert not any(x['callId']==e['callId'] for x in history)
    history.append({'callId':e['callId'],'chapterId':e['chapterId'],'originalLedgerStatus':'failed',
                    'rawArtifact':proof['rawArtifact'],'originalLedgerRecord':proof['originalLedgerRecord'],
                    'recovery':proof,'newModelCallsForRecovery':0,'candidateSha256':e['candidateSha256'],
                    'semanticAcceptance':None,'note':'Historical failed classification retained; exact known transport diagnostic recovered from completed output, never a retry.'})
d['latestRound']={'at':at,'objects':['web-chapter:'+x['chapterId'] for x in out],
                  'productionModelCalls':len(out),'auditModelCalls':0,'voidModelCalls':0,
                  'failedModelCalls':round_record['modelCalls']['failed'],
                  'recoveredWithoutNewCall':round_record['modelCalls']['recoveredWithoutNewCall'],
                  'note':'Authorized 222-5/246-3 finite figure revisions; ready candidates handed to249, no self audit or passed claim.',
                  'record':'round-20261027T1450.json'}
d['round20261027T1450']=d['latestRound'].copy()
write(local/'unified-repair-list-20261027.json',d)
write(local/'round-20261027T1450.json',round_record)
print(json.dumps({'objects':len(out),'modelCalls':round_record['modelCalls']}))
