"""Receive completed COAC-249 evidence only; never dispatch or alter candidates."""
import collections
import copy
import datetime
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).parent
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
CHAPTER = '79-cn-chapter-222-5'
HANDOFF = ROOT / 'integration/coac249-reviewed-a222-246-20261027.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    indent = 1 if path.name == 'unified-repair-list-20261027.json' else 2
    path.write_text(json.dumps(value, ensure_ascii=False, indent=indent) + '\n', encoding='utf-8')


assert sha(HANDOFF) == 'ec16dd22ae1ce0975f8a1326fde586a850f50434161ad6ee9823a51e22e225c2'
handoff = read(HANDOFF)
returned = next(x for x in handoff['chapters'] if x['chapterId'] == CHAPTER)
assert returned['auditStatus'] == 'needs-repair'
protected = {}
audits = {}
for item in handoff['chapters']:
    for key, digest in [('candidatePath', 'candidateSha256'), ('auditPath', 'auditSha256'),
                        ('sourcePath', 'sourceSha256')]:
        p = Path(item[key])
        if not p.is_absolute():
            p = ROOT / p
        assert sha(p) == item[digest], (item['chapterId'], key)
        protected[str(p)] = sha(p)
    audit = read(ROOT / item['auditPath'])
    assert audit['status'] == item['auditStatus']
    assert audit['production']['sha256'] == item['candidateSha256']
    assert audit['source']['sourceSha256'] == item['sourceSha256']
    assert len(audit['calls']) == 1
    assert audit['calls'][0]['callId'] == item['auditCallId']
    raw = ROOT / item['auditRaw']['path']
    assert sha(raw) == item['auditRaw']['sha256']
    protected[str(raw)] = sha(raw)
    audits[item['chapterId']] = audit

conflict = copy.deepcopy(returned['reviewConflict'])
asset = ROOT / conflict['sourcePath']
assert sha(asset) == conflict['sourceSha256']
protected[str(asset)] = sha(asset)
audit = audits[CHAPTER]
assert len(audit['modelReview']['blockChecks']) == 23
assert len(audit['modelReview']['figureChecks']) == 10
assert len(audit['modelReview']['imageChecks']) == 10

unified_path = BASE / 'unified-repair-list-20261027.json'
unified = read(unified_path)
old = copy.deepcopy(unified)
row = next(x for x in unified['objects'] if x.get('chapterId') == CHAPTER)
assert row['candidateSha256'] == returned['candidateSha256']
for bound in row['revision']['transportRecovery'].values():
    if isinstance(bound, dict) and 'path' in bound and 'sha256' in bound:
        p = ROOT / bound['path']
        assert sha(p) == bound['sha256']
        protected[str(p)] = sha(p)

receipt = {
    'schema': 'coach-repair-independent-feedback-intake/1',
    'recordedAt': NOW,
    'issue': 'COAC-248',
    'wakeupId': '01a17dfd-6271-7d0e-902a-79d2b578b7d6',
    'chapterId': CHAPTER,
    'candidatePath': returned['candidatePath'],
    'candidateSha256': returned['candidateSha256'],
    'auditPath': returned['auditPath'],
    'auditSha256': returned['auditSha256'],
    'auditStatus': 'needs-repair',
    'auditCallId': returned['auditCallId'],
    'priorAuditUsage': returned['auditUsage'],
    'priorIndependentAuditCalls': 1,
    'reviewCoverage': {'blocks': 23, 'figures': 10, 'imageOccurrences': 10},
    'reviewConflict': conflict,
    'originalIndependentIssues': audit['modelReview']['issues'],
    'owner': 'COAC-244 existing stage adjudication',
    'disposition': 'terminal-needs-repair-source-reading-conflict-awaiting-owner',
    'integrationAllowed': False,
    'automaticRepairAllowed': False,
    'independentAuditBudgetRemaining': 0,
    'retryBudget': 0,
    'newModelCalls': {'production': 0, 'audit': 0, 'failed': 0, 'void': 0},
    'historicalProductionFailure': copy.deepcopy(row['revision']['transportRecovery']),
    'historicalFailureCount': 1,
    'historicalZeroCallRecoveries': 1,
    'handoff': {'path': str(HANDOFF.relative_to(ROOT)), 'sha256': sha(HANDOFF)},
    'preservedBatch': {
        '256-18': 'already handed to249; untouched by this intake',
        '276-4': 'already failed without candidate; no retry',
        '246-3': 'same handoff passed, already handed to250; no new review',
    },
    'newProductionBatch': False,
}
row.update(auditPath=str(ROOT / returned['auditPath']),
           auditSha256=returned['auditSha256'], auditStatus='needs-repair',
           auditRecordedAt=audit['recordedAt'], issueCount=len(audit['modelReview']['issues']),
           currentDisposition=receipt['disposition'], reviewConflict=conflict,
           integrationAllowed=False, ownerDecision='COAC-244 existing stage adjudication',
           latestFeedback='receipt-222-5-review-conflict-20261027.json')
row['revision']['independentReview'] = {
    'callId': returned['auditCallId'], 'status': 'needs-repair',
    'candidateSha256': returned['candidateSha256'],
    'auditPath': returned['auditPath'], 'auditSha256': returned['auditSha256'],
    'callsUsed': 1, 'callsRemaining': 0, 'retries': 0,
}

# Receive the already completed sibling result without altering its passed candidate.
sibling = next(x for x in handoff['chapters'] if x['chapterId'] == '79-cn-chapter-246-3')
srow = next(x for x in unified['objects'] if x.get('chapterId') == sibling['chapterId'])
assert srow['candidateSha256'] == sibling['candidateSha256']
assert sibling['auditStatus'] == 'passed'
srow.update(auditPath=str(ROOT / sibling['auditPath']), auditSha256=sibling['auditSha256'],
            auditStatus='passed', auditRecordedAt=audits[sibling['chapterId']]['recordedAt'],
            issueCount=len(audits[sibling['chapterId']]['modelReview']['issues']),
            currentDisposition='independent-passed-already-handed-to-COAC-250')
unified['countsPriorFeedback222'] = copy.deepcopy(unified['countsCurrent'])
unified['countsCurrent']['needsRepair'] += 1
unified['countsCurrent']['awaitingIndependentReview'] -= 2
unified['countsCurrent']['resolvedTotal'] += 1
unified['feedback22220261027'] = receipt
unified['refreshedAt'] = NOW
assert old['productionFailureHistory'] == unified['productionFailureHistory']
assert next(x for x in old['objects'] if x.get('chapterId') == '79-cn-chapter-256-18') == next(
    x for x in unified['objects'] if x.get('chapterId') == '79-cn-chapter-256-18')

remaining_path = BASE / 'remaining-source-parent-256-276-20261027.json'
remaining = read(remaining_path)
remain_row = next(x for x in remaining['rows'] if x['chapterId'] == CHAPTER)
remain_row.update(category='A-terminal-review-source-reading-conflict-owner-adjudication',
                  latestIndependentFeedback=receipt)
remaining['counts'] = dict(collections.Counter(x['category'] for x in remaining['rows']))
remaining['feedbackUpdatedAt'] = NOW
remaining['feedbackScope'] = 'Only222-5 feedback updated; original225/256 coverage snapshot retained, not recomputed.'

owner_path = ROOT / 'integration/coac248-repair-handoff-20261027.json'
owner_before = owner_path.read_bytes()
owner = read(owner_path)
assert not any(x.get('candidateSha256') == returned['candidateSha256'] for x in owner['items'])
owner['items'].append(receipt)
owner['feedbackUpdatedAt'] = NOW
assert owner_path.read_bytes() == owner_before, 'Owner handoff changed concurrently'
for p, digest in protected.items():
    assert sha(Path(p)) == digest

write(BASE / 'receipt-222-5-review-conflict-20261027.json', receipt)
(BASE / 'evidence-222-5-independent-receipt-20261027.json').write_bytes((ROOT / returned['auditPath']).read_bytes())
(BASE / 'coac249-reviewed-a222-246-20261027.json').write_bytes(HANDOFF.read_bytes())
write(unified_path, unified)
write(remaining_path, remaining)
write(owner_path, owner)
write(BASE / 'owner-handoff-222-5-feedback-20261027.json', {
    'path': str(owner_path.relative_to(ROOT)), 'sha256': sha(owner_path),
    'previousSha256': hashlib.sha256(owner_before).hexdigest(),
    'addedItem': receipt,
    'otherItemsPreserved': owner['items'][:-1] == json.loads(owner_before.decode('utf-8-sig'))['items'],
})
for p, digest in protected.items():
    assert sha(Path(p)) == digest
write(BASE / 'verification-222-5-feedback-20261027.json', {
    'recordedAt': NOW, 'passed': True, 'protectedArtifacts': protected,
    'newModelCalls': 0, 'remainingRows': len(remaining['rows']),
    'counts': remaining['counts'], 'countsStoredInventory': unified['countsCurrent'],
    'productionFailureHistoryPreserved': True, 'batch256RowUnchanged': True,
})
print(json.dumps({'ok': True, 'protectedFiles': len(protected), 'newModelCalls': 0,
                  'disposition': receipt['disposition'], 'ownerHandoff': str(owner_path)}))
