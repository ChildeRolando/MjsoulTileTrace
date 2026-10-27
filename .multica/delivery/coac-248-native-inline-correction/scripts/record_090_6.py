"""Record this finite stage; do not schedule another COAC-248 production stage."""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

local = Path(__file__).resolve().parent.parent
root = Path('E:/AgentData/Coach/knowledge/processing')
def load(p):
    return json.loads(p.read_text(encoding='utf-8'))
def write(p, v):
    p.write_text(json.dumps(v, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

at = datetime.now(timezone.utc).isoformat()
e = load(local / 'receipt-web090-6.rev1-awaiting-review.json')
p = local / 'unified-repair-list-20261027.json'
d = load(p)
obj = next(x for x in d['objects'] if x['objectId'] == 'web-chapter:79-cn-chapter-090-6')
obj['parentVersion'] = {k: obj.get(k) for k in ['candidatePath', 'candidateSha256', 'auditPath', 'auditStatus', 'issueCount', 'auditRecordedAt']}
obj.update(candidatePath=str(root / e['candidatePath']).replace('\\', '/'),
           candidateSha256=e['candidateSha256'], auditPath=None, auditSha256=None,
           auditStatus='awaiting-independent-review', auditRecordedAt=None, currentDisposition='revision-produced-awaiting-COAC-249-first-full-article-review',
           diskShaVerified=True, issueCount=None)
obj['revision'] = {'parentPath': e['parentPath'], 'parentSha256': e['parentSha256'],
                   'parentAuditPath': e['parentAuditPath'], 'parentAuditSha256': e['parentAuditSha256'],
                   'sourceSha256': e['sourceSha256'], 'targets': e['targets'],
                   'productionCallId': e['productionAttempt']['callId'], 'productionUsage': e['productionAttempt']['usage'],
                   'evidence': 'receipt-web090-6.rev1-awaiting-review.json',
                   'handoff249': 'integration/coac249-incremental-090-6-20261027.json',
                   'wakeup249': '01a17dc0-8bbe-7249-88cf-6ff847bf7000',
                   'modelCalls': e['modelCalls'], 'independentAuditBudgetRemaining': 1, 'retryBudget': 0,
                   'changed': '例1两处6s→4s；例3末四张3s 6s 7s 9s→3s 4s 5s 6s；例5两处6s→4s、摸入7s→5s。目标caption/sourceNotes变化完整保留；正文与其余三图教学内容不变。',
                   'semanticAcceptance': None}
for oid in ['79-cn:page:217', 'nemata-jp:page:257']:
    row = next(x for x in d['objects'] if x['objectId'] == oid)
    row['stage20261027T1419'] = 'owner本阶段暂分流；保留已有证据与unknown，不追加研究、制作、整页审校，不阻塞090-6。'
    row['nextAction'] = '等待owner下一有限阶段安排；本阶段不派调用。'
detail = d['breakdown']['statusDetail']
target_id = obj['objectId']
detail['needsRepairOpen'] = [x for x in detail['needsRepairOpen'] if x != target_id]
detail.setdefault('awaitingIndependentReview', []).append(target_id)
# Rebuild counts from the stored objects only, with explicit grain. This is not a fresh whole-book audit.
d['countsPriorSnapshot20261027T1340'] = d['countsCurrent']
passed = [x for x in d['objects'] if x.get('auditStatus', '').startswith('passed')]
holds = [x for x in d['objects'] if x.get('currentDisposition', '').startswith('decision-hold')]
pending = [x for x in d['objects'] if x.get('auditStatus') == 'awaiting-independent-review']
repair = [x for x in d['objects'] if x.get('auditStatus') == 'needs-repair' and x not in holds]
assert len(passed) + len(holds) + len(pending) + len(repair) == len(d['objects'])
d['breakdown']['statusDetail'] = {
    'needsRepairOpen': [x['objectId'] for x in repair],
    'decisionHold': [x['objectId'] for x in holds],
    'resolved': [x['objectId'] for x in passed],
    'awaitingIndependentReview': [x['objectId'] for x in pending],
}
d['countsCurrent'] = {'needsRepair': len(repair), 'awaitingIndependentReview': len(pending),
                      'decisionHold': len(holds), 'resolvedTotal': len(passed), 'totalTracked': len(d['objects']),
                      'failedSeparateHistoryRecords': len(d['failedSeparate']),
                      'scope': 'Stored objects inventory only, not remaining original-chapter count. Historical failedSeparate records are retained outside this total; none represents a new failed call this round. No global selection or passed audit was refreshed.'}
d['refreshedAt'] = at
d['latestRound'] = {'at': at, 'objects': [target_id], 'productionModelCalls': 1, 'auditModelCalls': 0,
                    'voidModelCalls': 0, 'failedModelCalls': 0, 'deterministicRejections': 0,
                    'note': '090-6新稿已产，确定性校验通过，交249首次全章独审；本线未自审，未判passed。',
                    'nextBatch': '按14:19最新owner边界退出，不另建248相同目标或兜底触发；先报本批真实结果再决定下一有限批。'}
round_record = {'schema': 'coac-248-round-record/1', 'recordedAt': at,
                'trigger': 'Assigned recovery run 01a17dba-a795-7ba2-8e30-dbb4424d823e; owner current description 2026-10-27T14:19Z overrides joined old 090/p257 triggers.',
                'scope': ['79-cn-chapter-090-6'], 'result': 'produced-and-handed-to-independent-COAC-249-review; not passed',
                'object': obj['revision'], 'candidate': {'path': e['candidatePath'], 'sha256': e['candidateSha256']},
                'zeroCallChecks': {'sourcePrecheck': 'source-check-web090-6-20261027.json',
                                   'sourceCandidateParentBindings': True, 'revisionScope': True, 'productionRawBinding': True,
                                   'bodyUnchanged': True, 'nonTargetSemanticFiguresUnchanged': 3,
                                   'derivedPresentationReferencesRemovedByExistingRunner': 6,
                                   'explicitTargetSelection': {'selected': 1, 'terminalSkips': 0, 'pendingBefore': 1, 'modelCalls': 0}},
                'modelCalls': e['modelCalls'], 'usage': e['productionAttempt']['usage'],
                'slot': {'acquiredAt': e['slotAcquired']['slot']['record']['claimedAt'], 'releasedAt': e['slotReleased']['at'],
                         'releaseConfirmed': e['slotReleased']['release']['ok']},
                'policy': {'reviewer': 'COAC-249', 'firstIndependentAuditBudget': 1, 'retry': 0,
                           'p217p257': 'deferred, evidence/unknown retained, no calls', 'BLineUntouched': True,
                           'old0818': 'already passed; no reproduction', 'qualityOrAdmissionGateChanged': False,
                           'next248WakeupCreated': False, 'reason': 'Latest owner explicitly asks to exit this finite chapter boundary before deciding next batch.'},
                'delivery': {'handoff': 'integration/coac249-incremental-090-6-20261027.json',
                             'wakeup249': '01a17dc0-8bbe-7249-88cf-6ff847bf7000',
                             'productCodeChanged': False, 'pullRequestRequired': False},
                'bookCounts': 'Unified list counts are recomputed only from stored objects; denominator and old failures are historical, not a fresh full-book remainder claim.'}
d['round20261027T1425'] = {'record': 'round-20261027T1425.json', 'result': round_record['result'], 'modelCalls': e['modelCalls']}
write(p, d)
write(local / 'round-20261027T1425.json', round_record)
(local / 'candidates').mkdir(exist_ok=True)
shutil.copyfile(root / e['candidatePath'], local / 'candidates/cv1721510.r1.json')
assert sha(local / 'candidates/cv1721510.r1.json') == e['candidateSha256']
print(json.dumps({'candidateSha256': e['candidateSha256'], 'inventoryCounts': d['countsCurrent'], 'record': 'round-20261027T1425.json'}))
