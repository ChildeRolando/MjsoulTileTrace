"""Record the one terminated failed request; no model invocation or retry."""
import copy
import hashlib
import json
import pathlib
from datetime import datetime, timezone

R = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
L = pathlib.Path(__file__).resolve().parent
RUN = R / 'web-production/v1/runs/coac248-web-222-5-r2-20261028'
CID = 'b702fbf7-dbe4-4533-9a55-aa0912a334f3'
CHAPTER = '79-cn-chapter-222-5'
NOW = datetime.now(timezone.utc).isoformat()
def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p, d): pathlib.Path(p).write_text(json.dumps(d, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

pre = load(RUN/'preflight.json')
finish = load(RUN/'dispatch-finished.json')
call = finish['call']
raw_path = R/'web-production/v1/raw-calls'/f'{CID}.json'
raw = load(raw_path)
assert call['callId'] == CID and not call['success'] and raw['output'] is None
assert raw['rawLastMessage'] is None and raw['usage'] is None and not raw['timedOut']
assert call['requestExecution']['model'] == 'gpt-6.1-terra'
assert call['requestExecution']['reasoningEffort'] == 'max'
assert len(call['requestExecution']['images']) == 2
assert any(x.get('code') == 'invalid_json_schema' for x in raw['terminalEvents'])
assert any(x.get('type') == 'turn.failed' for x in raw['terminalEvents'])
assert not any(x.get('type') == 'turn.completed' for x in raw['terminalEvents'])
assert sha(raw_path) == call['rawArtifactSha256']
assert finish['newProductionCalls'] == 1 and finish['automaticRetries'] == 0
ledger = [json.loads(x) for x in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if x]
assert [x for x in ledger if x.get('callId') == CID] == [call]
bindings = []
for b in pre['protectedFiles']:
    assert sha(b['path']) == b['sha256'], b['path']
    bindings.append(b)
for img in call['requestExecution']['images']:
    assert sha(img['path']) == img['sha256'] and pathlib.Path(img['path']).stat().st_size == img['bytes']
names = sorted(p.name for p in (R/'web-production/v1/candidates/79-bilibili-cn').glob('cv1775262.*'))
assert names == sorted(pre['initialJoint']['candidates'])
parent = R/'web-production/v1/candidates/79-bilibili-cn/cv1775262.r1.display.json'
assert sha(parent) == pre['parentSha256']
assert load(parent)['figures'][7]['transcription'] == pre['fieldScope']['from']
assert not (RUN/'production-evidence.json').exists()
release = {k: load(RUN/n) for k,n in [('makerA','slot-released.json'),('chapter','chapter-released.json')]}
assert all(x['ok'] for x in release.values())
for name in ['preflight.json','dispatch-started.json','dispatch-finished.json','slot-released.json','chapter-released.json']:
    (L/'evidence'/name).write_bytes((RUN/name).read_bytes())
(L/'evidence'/f'{CID}.json').write_bytes(raw_path.read_bytes())

pdf_path = R/'production/sol-high-field-repair26-20261027-p217e/candidates/79-cn/page-0217.json'
assert sha(pdf_path) == '7766c2217ecb1bc04dfa98ecad9ca9d0e1221a695259a791d1d214e3a8c77777'
owner_path = R/'integration/coac248-repair-handoff-20261027.json'
owner_bytes = owner_path.read_bytes(); owner = load(owner_path)
old_items = copy.deepcopy(owner['items'])
pdf = next(x for x in owner['items'] if x.get('kind') == 'pdf-page-point-evidence' and x.get('chapterId') == '79-cn-chapter-217-4')
reconciliation = pdf['coordinateReconciliation']
assert reconciliation['figureId'] == '79-cn-p217-r1' and reconciliation['sourceImageBlockId'] == '79-cn-p217-b8'
assert reconciliation['currentBBox'] == [150,325,175,357]
assert reconciliation['originalSecondTileBBox'] is None and not reconciliation['secondTileDisputeResolved']
assert sha(reconciliation['originalRequest']['path']) == reconciliation['originalRequest']['sha256']

receipt = {
    'schema': 'coac248-two-reference-failed-revision/1', 'recordedAt': NOW,
    'chapterId': CHAPTER, 'authorizationCommentId': '01a17ec7-dbf3-77e6-a4f4-4dae65b73038',
    'candidatePath': str(parent.relative_to(R)), 'candidateSha256': sha(parent),
    'candidateChanged': False, 'newCandidate': None, 'auditStatus': 'needs-repair',
    'integrationAllowed': False, 'fieldScope': pre['fieldScope'],
    'remainingOriginalBlockingIssues': 1, 'otherNineFiguresFaithfulInOriginalFullAudit': True,
    'call': call, 'raw': {'path': str(raw_path.relative_to(R)), 'sha256': sha(raw_path)},
    'finalError': {'code': 'invalid_json_schema', 'param': 'text.format.schema',
                   'cause': 'Submitted bounded output schema rejected; the response does not identify the specific unsupported construct.'},
    'output': None, 'usage': None, 'remoteWeights': 'unknown', 'recoveryPossible': False,
    'recoveryReason': 'Terminal turn.failed; no completed turn or final output. No new candidate can be recovered.',
    'newCalls': {'productionAttempts': 1, 'successfulProduction': 0, 'failedProduction': 1, 'audit': 0, 'void': 0, 'automaticRedispatch': 0},
    'transportReconnects': 'Full raw retains built-in transport reconnect events; no second agent dispatch.',
    'remainingBudget': {'production': 0, 'targetedReview': 1, 'retry': 0,
                        'reviewCondition': 'Reserved only for a new eligible candidate; none exists. Not transferable to production retry or another target.'},
    'runtimeManifestSha256': pre['runtimeManifestSha256'], 'protectedBindingsVerifiedAfter': bindings,
    'candidateFilesUnchanged': names, 'locksReleased': release,
    'pdf217': {'canonical': '79-cn-chapter-217-4', 'figureId': '79-cn-p217-r1', 'sourceImageBlockId': '79-cn-p217-b8',
               'currentBBox': [150,325,175,357], 'currentPointReading': 'man suit; number unknown',
               'historicalSecondTileBBox': None, 'secondTileDispute': 'candidate9m versus historical8m; unresolved',
               'teachingImpact': 'Does not defeat the general discard/souzu-flush explanation, but prevents exact tile reconstruction; no acceptance waiver.',
               'ownerRecord': str(owner_path.relative_to(R)), 'ownerCoordinateReconciliationPreserved': True,
               'candidateSha256': sha(pdf_path), 'candidateChanged': False, 'newCalls': 0},
    'disposition': 'Stop without retry or review; no249/250 candidate handoff, no next model batch. Existing owner retains the remaining two-reference repair.'
}
write(L/'receipt-failed-production.json', receipt)
inv_path = L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
inv_bytes = inv_path.read_bytes(); inv = load(inv_path); before = copy.deepcopy(inv)
row = next(x for x in inv['objects'] if x.get('chapterId') == CHAPTER)
assert row['candidateSha256'] == sha(parent) and row['auditStatus'] == 'needs-repair'
assert not any(x.get('callId') == CID for x in inv['productionFailureHistory'])
attempt = {'callId': CID, 'chapterId': CHAPTER, 'originalLedgerStatus': 'failed', 'rawArtifact': receipt['raw'],
           'model': 'gpt-6.1-terra', 'reasoningEffort': 'max', 'usage': None,
           'finalError': receipt['finalError'], 'newCandidate': None, 'newCalls': receipt['newCalls'],
           'remainingBudget': receipt['remainingBudget'], 'recoveryPossible': False, 'automaticRetry': False}
row['latestFailedPointRevision'] = attempt
row['currentDisposition'] = 'point-revision-failed-schema-no-candidate-no-auto-retry'
row['nextAction'] = 'Two1m references still require repair. Production budget exhausted; no eligible candidate for reserved targeted review. Existing owner must resolve further execution authority.'
row['separateQueuedAuthorization'].update(statusAtExecution='terminal-failed-no-candidate', productionConsumed=1, targetedReviewConsumed=0)
inv['productionFailureHistory'].append(attempt)
inv['countsCurrent']['failedSeparateHistoryRecords'] = len(inv['productionFailureHistory'])
inv['failedHistoryCountCorrection222R2'] = {'previousStoredCount': before['countsCurrent']['failedSeparateHistoryRecords'],
    'previousActualHistoryRecords': len(before['productionFailureHistory']), 'newRecords': 1,
    'scope': 'Count actual stored failure-history entries only; not a new whole-book status census.'}
inv['round222PointR2Failed20261028'] = {'receipt': 'coac248-222-point-r2-20261028/receipt-failed-production.json',
    'calls': receipt['newCalls'], 'remainingBudget': receipt['remainingBudget'], 'fullChapterPassed': False}
inv['refreshedAt'] = NOW
changed = [i for i,(a,b) in enumerate(zip(before['objects'], inv['objects'])) if a != b]
assert changed == [33] and len(inv['objects']) == 63
assert inv['productionFailureHistory'][:-1] == before['productionFailureHistory']
assert inv_path.read_bytes() == inv_bytes
inv_path.write_text(json.dumps(inv, ensure_ascii=False, indent=1)+'\n', encoding='utf-8')
item = {'kind': 'web-point-revision-failed-attempt', 'chapterId': CHAPTER, 'parentCandidateSha256': sha(parent),
        'auditStatus': 'needs-repair', 'integrationAllowed': False, 'attempt': attempt,
        'fieldScope': pre['fieldScope'], 'noNewCandidate': True, 'historicalAuditAndRawPreserved': True}
assert not any(x.get('attempt',{}).get('callId') == CID for x in owner['items'])
owner['items'].append(item); owner['feedbackUpdatedAt'] = NOW
assert owner_path.read_bytes() == owner_bytes
write(owner_path, owner)
assert owner['items'][:-1] == old_items
write(L/'owner-update.json', {'path': str(owner_path), 'beforeSha256': hashlib.sha256(owner_bytes).hexdigest(),
    'afterSha256': sha(owner_path), 'existingItemsPreserved': True, 'addedItem': item,
    'pdf217CoordinateReconciliation': reconciliation})
write(L/'verification.json', {'recordedAt': NOW, 'protectedBindingsUnchanged': len(bindings),
    'runtimeFilesVerified': 27, 'changedInventoryRows': changed, 'unrelatedRowsPreserved': 62,
    'priorFailureHistoryPreserved': True, 'newFailureCount': 1, 'candidateUnchanged': True,
    'noNewCandidate': True, 'singleLedgerEntry': True, 'fullRawPreserved': True,
    'locksReleased': release, 'pdf217OwnerReconciliationPreserved': True, 'issueStatus': 'in_progress'})
print(json.dumps({'recordedFailure': CID, 'candidateUnchanged': True, 'changedInventoryRows': changed,
                  'protectedBindings': len(bindings), 'noNewCallsFromRecording': True}))
