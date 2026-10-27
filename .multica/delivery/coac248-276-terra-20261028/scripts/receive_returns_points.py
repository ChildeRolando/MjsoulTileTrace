"""Zero-call intake of immutable COAC-249 receipts; never dispatch a model."""
import copy
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
LOCAL = Path(__file__).resolve().parent.parent
INVENTORY = LOCAL.parent / 'coac-248-native-inline-correction/unified-repair-list-20261027.json'
OWNER = ROOT / 'integration/coac248-repair-handoff-20261027.json'
MANIFEST = '12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6'
NOW = datetime.now(timezone.utc).isoformat()
checks = []
immutable = {}


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def bind(p, expected=None):
    p = Path(p)
    if not p.is_absolute():
        p = ROOT / p
    actual = sha(p)
    if expected is not None:
        assert actual == expected, str(p)
    immutable[str(p)] = actual
    return {'path': str(p), 'sha256': actual}


def write(p, value, indent=2):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=indent) + '\n', encoding='utf-8')


def copy_exact(p, name):
    dest = LOCAL / 'evidence' / name
    assert not dest.exists(), str(dest)
    dest.write_bytes(Path(p).read_bytes())
    assert sha(dest) == sha(p)


def payload_path(img):
    """Run-private input paths expire; recover exact bytes from the bound packet commit."""
    original = Path(img['path'])
    if original.exists():
        return original
    key = original.parent.name
    assert key in ['image-222-sixth-tile', 'image-p217-north-second-row']
    destination = LOCAL / 'evidence' / 'point-inputs' / key / original.name
    if not destination.exists():
        blob = '.multica/delivery/coac244-closure26-zero-20261028/' + key + '/' + original.name
        result = subprocess.run(['git', 'show', '394b830d7cd76ac3c97f480e93a54b14913501f4:' + blob], capture_output=True, check=True)
        assert hashlib.sha256(result.stdout).hexdigest() == img['sha256']
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(result.stdout)
    return destination


def request_proof(raw, expected_images=None):
    req = raw['requestExecution']
    assert req['model'] == 'gpt-6.1-terra' and req['reasoningEffort'] == 'max'
    args = req['args']
    assert args[args.index('--model') + 1] == 'gpt-6.1-terra'
    assert 'model_reasoning_effort="max"' in args
    imgs = req['images']
    assert imgs and args.count('-i') == len(imgs)
    if expected_images:
        assert len(imgs) == expected_images
    verified_inputs = []
    for img in imgs:
        actual_path = payload_path(img)
        bind(actual_path, img['sha256'])
        assert actual_path.stat().st_size == img['bytes']
        verified_inputs.append({'recordedPath': img['path'], 'verifiedPath': str(actual_path),
                                'sha256': img['sha256'], 'bytes': img['bytes'],
                                'fromBoundPacketCommit': actual_path != Path(img['path'])})
    assert raw['exitCode'] == 0 and not raw['timedOut']
    assert any(e['type'] == 'turn.completed' for e in raw['events'])
    return {'model': req['model'], 'reasoningEffort': req['reasoningEffort'],
            'images': imgs, 'verifiedInputs': verified_inputs, 'usage': raw['usage'], 'remoteWeights': 'unknown'}


handoff_path = ROOT / 'integration/coac249-point-222-p217-20261028.json'
point_binding = bind(handoff_path, '60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9')
points = load(handoff_path)
assert points['newCalls'] == 2 and points['retry'] == 0 and points['additionalBudget'] == 0
assert not points['pageOrChapterPassed']
point_proofs = []
for item in points['calls']:
    raw_binding = bind(item['raw']['path'], item['raw']['sha256'])
    raw = load(item['raw']['path'])
    assert raw['callId'] == item['callId']
    assert raw['binding']['runtimeManifestSha256'] == MANIFEST
    assert raw['binding']['bbox'] == item['bbox']
    assert raw['binding']['chapterId'] == item['chapterId']
    assert raw['output'] == item['result']
    proof = request_proof(raw)
    images = raw['requestExecution']['images']
    original = next(x for x in images if Path(x['path']).name == 'original.png')
    target = next(x for x in images if Path(x['path']).name == 'target.png')
    with Image.open(payload_path(original)) as im, Image.open(payload_path(target)) as tile:
        assert ImageChops.difference(im.convert('RGB').crop(tuple(item['bbox'])), tile.convert('RGB')).getbbox() is None
    receipt_path = Path(item['raw']['path']).with_name(item['key'] + '.receipt.json')
    receipt_binding = bind(receipt_path)
    assert load(receipt_path) == item
    copy_exact(item['raw']['path'], item['key'] + '.raw.json')
    copy_exact(receipt_path, item['key'] + '.receipt.json')
    point_proofs.append({'callId': item['callId'], 'raw': raw_binding,
                         'receipt': receipt_binding, 'request': proof, 'cropPixelsExact': True})
copy_exact(handoff_path, handoff_path.name)

runtime = ROOT / 'audit/runtimes/coac244-vision-terra-max-v1-20261027'
bind(runtime / 'runtime-manifest.json', MANIFEST)
manifest = load(runtime / 'runtime-manifest.json')
assert len(manifest['files']) == 27
for f in manifest['files']:
    bind(runtime / f['path'], f['sha256'])

return_path = ROOT / 'integration/coac249-reviewed-276-4-terra-20261028.json'
return_binding = bind(return_path, '76db693c99e1790b0018a1e58dd152d9a7df2b97c897ebcd03804e1f87f655e7')
returned = load(return_path)
review = returned['chapters'][0]
assert returned['passed'] == [] and returned['returned'] == ['79-cn-chapter-276-4']
assert review['auditStatus'] == 'needs-repair'
bind(review['candidatePath'], review['candidateSha256'])
candidate = load(review['candidatePath'])
bind(candidate['source']['sourcePath'], review['sourceSha256'])
audit_binding = bind(review['auditPath'], review['auditSha256'])
audit = load(ROOT / review['auditPath'])
assert audit['status'] == 'needs-repair'
assert audit['production']['sha256'] == review['candidateSha256']
assert audit['modelReview'] == review['modelReview']
raw_binding = bind(review['raw']['path'], review['raw']['sha256'])
audit_request = request_proof(load(ROOT / review['raw']['path']), 2)
context_path = ROOT / 'integration/coac249-return-context-276-4-terra-20261028.json'
context_binding = bind(context_path, '8b3e2b1369dcf72240545541890d7ca9c3766aebf5329ce92003b2b06d76707c')
context = load(context_path)
bind(context['parentAudit']['path'], context['parentAudit']['sha256'])
bind(context['parentRaw']['path'], context['parentRaw']['sha256'])
for attempt in candidate['provenance']['attempts']:
    bind(ROOT / candidate['provenance']['artifactRoot'] / attempt['rawArtifactPath'], attempt['rawArtifactSha256'])
old_raw_path = ROOT / 'web-production/v1/raw-calls/2375640c-3a8d-45e7-9601-4b810fe87e80.json'
bind(old_raw_path, '4060ca8c826094fda356bb4f3c50a3f59625e6660110f20feba1f8c0afa91ba9')
assert load(old_raw_path)['usage'] is None
copy_exact(return_path, return_path.name)
copy_exact(context_path, context_path.name)
copy_exact(ROOT / review['auditPath'], '276-independent-audit.json')
copy_exact(ROOT / review['raw']['path'], '276-independent-audit.raw.json')

inventory_bytes, owner_bytes = INVENTORY.read_bytes(), OWNER.read_bytes()
inventory, owner = load(INVENTORY), load(OWNER)
before_inventory, before_owner = copy.deepcopy(inventory), copy.deepcopy(owner)
row276 = next(x for x in inventory['objects'] if x.get('chapterId') == '79-cn-chapter-276-4')
row222 = next(x for x in inventory['objects'] if x.get('chapterId') == '79-cn-chapter-222-5')
row217 = next(x for x in inventory['objects'] if x.get('objectId') == '79-cn:page:217')
assert row276['candidateSha256'] == review['candidateSha256']
assert row276['auditStatus'] == 'awaiting-independent-review'

requirements = copy.deepcopy(points['limitedRevisionRequirements'])
for req in requirements:
    bind(req['candidatePath'], req['candidateSha256'])
parent222 = load(ROOT / requirements[0]['candidatePath'])
text222 = parent222['figures'][7]['transcription']
assert text222.count('2m') == 2
assert '2z 3z 6z 8m 5m 2m 4z 3p 2p' in text222 and '第6张2m' in text222
old_audit222_path = Path(row222['auditPath'])
bind(old_audit222_path, row222['auditSha256'])
old_audit222 = load(old_audit222_path)
assert len(old_audit222['modelReview']['issues']) == 1
assert old_audit222['modelReview']['issues'][0]['targetId'] == requirements[0]['targetId']
assert old_audit222['modelReview']['completeArticleCompared']
assert all(x['verdict'] == 'faithful' for x in old_audit222['modelReview']['figureChecks'] if x['id'] != requirements[0]['targetId'])
parent217 = load(ROOT / requirements[1]['candidatePath'])
assert parent217['figures'][0]['chapterId'] == '79-cn-chapter-217-4'
assert parent217['figures'][0]['sourceImageBlockIds'] == ['79-cn-p217-b8']
assert '第二行5m 9m' in parent217['figures'][0]['transcription']
old_request_path = ROOT / 'integration/coac249-p217-single-tile-read-20261027.json'
old_request_binding = bind(old_request_path)
assert load(old_request_path)['tile']['position'] == '北家舍牌第二行第二张'

feedback276 = {
    'schema': 'coac248-independent-return-intake/1', 'recordedAt': NOW,
    'chapterId': review['chapterId'], 'candidateSha256': review['candidateSha256'],
    'auditStatus': 'needs-repair', 'integrationAllowed': False,
    'audit': audit_binding, 'raw': raw_binding, 'handoff': return_binding, 'context': context_binding,
    'request': audit_request, 'originalIndependentIssues': audit['modelReview']['issues'],
    'blockingPositions': ['b0005 left discard4', 'b0005 left discard5', 'b0005 right discard2', 'b0005 right discard5'],
    'reliableNewWindReadings': None,
    'disposition': 'Four visible wind discards lack concrete codes; no guessed restoration of parent3z/2z/3z/4z.',
    'reuseEvidenceDisposition': 'b0014/b0025 uncertain preserved. Parent faithful checks and bound images are evidence visibility context, not proof of current tile errors or an override of this receipt.',
    'captionAndNotes': context['captionAndNotes'],
    'consumedAuthorizedCalls': {'production': 1, 'firstIndependentReview': 1, 'retry': 0},
    'remainingBudget': {'production': 0, 'review': 0, 'retry': 0},
    'newCallsThisIntake': 0, 'historicalFailureUsage': None,
    'semanticAcceptance': False, 'fullChapterPassed': False,
}
point_feedback = {
    'schema': 'coac248-point-evidence-intake/1', 'recordedAt': NOW,
    'handoff': point_binding, 'pointProofs': point_proofs,
    'limitedRevisionRequirements': requirements,
    '222Comparison': {'currentCandidateMatchesReading': False, 'candidateReading': '2m in both references',
                      'independentReading': '1m', 'remainingOriginalBlockingIssues': 1,
                      'otherNineFiguresFaithful': True, 'candidateChanged': False, 'fullChapterPassed': False},
    '217CoordinateReconciliation': {
        'chapterId': '79-cn-chapter-217-4', 'figureId': '79-cn-p217-r1', 'sourceImageBlockId': '79-cn-p217-b8',
        'originalRequest': old_request_binding,
        'originalPosition': '北家舍牌第二行第二张', 'originalCandidateCode': '9m', 'historicalReviewerReading': '8m',
        'originalSecondTileBBox': None,
        'originalSecondTileBBoxNote': 'Old request is a named location, without an explicit crop bbox. Do not assign the first-tile bbox to it.',
        'currentAdjudicatedPosition': '北家舍牌第二行第一张', 'currentBBox': [150, 325, 175, 357],
        'currentCandidateCode': '5m', 'independentReading': '万子（数字未辨清）',
        'secondTileDisputeResolved': False, 'candidateChanged': False,
        'otherOpenLocations': ['北家第二行第二张8m/9m', '西家第二行第二张万子unknown'],
        'notCovered': ['web b0004', 'web b0010', 'other unknowns', 'chapter215-4'],
        'owner': 'COAC-244 existing source/parent adjudication',
        'teachingImpact': points['calls'][1]['result']['teachingImpact'],
        'acceptanceWaiver': False,
    },
    'priorPointCalls': {'calls': 2, 'production': 0, 'retry': 0, 'remainingBudget': 0},
    'newCallsThisIntake': 0,
    'separateQueued222Authorization': {
        'commentId': '01a17ec7-dbf3-77e6-a4f4-4dae65b73038',
        'taskId': '01a17ec7-dbfe-7110-abb1-cdf2973548cf',
        'statusAtRead': 'queued', 'maxProduction': 1, 'maxTargetedIndependentReview': 1,
        'failedVoidCount': True, 'retry': 0, 'consumedByThisIntake': 0,
        'disposition': 'Separate latest explicit authorization; queued issue run owns execution. This evidence-only wakeup does not dispatch duplicate work.',
    },
    'remoteWeights': 'unknown', 'candidateEdits': 0, 'acceptancePromotion': False,
}

row276.update(auditStatus='needs-repair', auditPath=review['auditPath'], auditSha256=review['auditSha256'],
              auditRecordedAt=review['recordedAt'], issueCount=len(audit['modelReview']['issues']),
              currentDisposition='terminal-needs-repair-four-wind-codes-missing-budget-exhausted',
              integrationAllowed=False, latestFeedback='coac248-276-terra-20261028/receipt-276-return-intake.json')
row276['originalIndependentIssues'] = audit['modelReview']['issues']
row276['revision']['independentAuditBudget'] = 0
row276['revision']['independentReview'] = feedback276
row276['revision']['semanticAcceptance'] = False
row276['revision']['wakeup249']['remainingAuditCalls'] = 0
row222.update(currentDisposition='point-adjudicated-1m-two-reference-revision-required',
              latestPointEvidence=point_binding, limitedRevisionRequirement=requirements[0],
              nextAction='Latest 19:13 explicit two-call revision authorization queued; not consumed by evidence intake.')
row222['pointCandidateComparison'] = point_feedback['222Comparison']
row222['separateQueuedAuthorization'] = point_feedback['separateQueued222Authorization']
row217.update(chapterId='79-cn-chapter-217-4', latestPointEvidence=point_binding,
              limitedRevisionRequirement=requirements[1],
              coordinateReconciliation=point_feedback['217CoordinateReconciliation'],
              currentDisposition='quarantined-rev5-first-tile-unreadable-second-tile-dispute-unresolved',
              integrationAllowed=False,
              nextAction='Existing owner to address the first-tile requirement and separate old second-tile locator; no production/page review authorized by this point handoff.')
inventory['countsPriorReturn27620261028'] = copy.deepcopy(inventory['countsCurrent'])
inventory['countsCurrent']['needsRepair'] += 1
inventory['countsCurrent']['awaitingIndependentReview'] -= 1
inventory['feedback276Terra20261028'] = feedback276
inventory['point222p21720261028'] = point_feedback
inventory['refreshedAt'] = NOW

owner276 = next(x for x in owner['items'] if x.get('chapterId') == '79-cn-chapter-276-4' and x.get('candidateSha256') == review['candidateSha256'])
owner276['returnIntake'] = feedback276
owner276['auditStatus'] = 'needs-repair'
owner276['limits'] = feedback276['remainingBudget']
owner276['integrationAllowed'] = False
owner222 = next(x for x in owner['items'] if x.get('chapterId') == '79-cn-chapter-222-5' and x.get('candidateSha256') == requirements[0]['candidateSha256'])
owner222['latestPointEvidence'] = point_binding
owner222['limitedRevisionRequirement'] = requirements[0]
owner222['pointCandidateComparison'] = point_feedback['222Comparison']
owner222['separateQueuedAuthorization'] = point_feedback['separateQueued222Authorization']
owner222['disposition'] = row222['currentDisposition']
pdf_owner = next((x for x in owner['items'] if x.get('objectId') == '79-cn:page:217'), None)
if pdf_owner is None:
    pdf_owner = {'kind': 'pdf-page-point-evidence', 'objectId': '79-cn:page:217',
                 'chapterId': '79-cn-chapter-217-4', 'candidateSha256': row217['candidateSha256']}
    owner['items'].append(pdf_owner)
pdf_owner.update(latestPointEvidence=point_binding, limitedRevisionRequirement=requirements[1],
                 coordinateReconciliation=point_feedback['217CoordinateReconciliation'],
                 candidateChanged=False, integrationAllowed=False, disposition=row217['currentDisposition'])
owner['feedbackUpdatedAt'] = NOW

assert inventory['productionFailureHistory'] == before_inventory['productionFailureHistory']
changed_rows = [i for i, (a, b) in enumerate(zip(before_inventory['objects'], inventory['objects'])) if a != b]
assert changed_rows == [1, 33, 38], changed_rows
changed_owner = [i for i, (a, b) in enumerate(zip(before_owner['items'], owner['items'])) if a != b]
assert all(before_owner['items'][i].get('chapterId') in ['79-cn-chapter-222-5', '79-cn-chapter-276-4'] for i in changed_owner)
assert INVENTORY.read_bytes() == inventory_bytes and OWNER.read_bytes() == owner_bytes, 'concurrent modification'
for path, expected in immutable.items():
    assert sha(path) == expected, path
write(INVENTORY, inventory, indent=1)
write(OWNER, owner)
write(LOCAL / 'receipt-276-return-intake.json', feedback276)
write(LOCAL / 'receipt-222-p217-point-intake.json', point_feedback)
write(LOCAL / 'owner-return-and-point-update.json', {
    'path': str(OWNER), 'beforeSha256': hashlib.sha256(owner_bytes).hexdigest(), 'afterSha256': sha(OWNER),
    'changedExistingItemIndexes': changed_owner, 'itemsAppended': len(owner['items']) - len(before_owner['items']),
    'unrelatedExistingItemsPreserved': True, 'changedItems': [owner['items'][i] for i in changed_owner],
    'appendedItems': owner['items'][len(before_owner['items']):],
})
write(LOCAL / 'verification-return-point-intake.json', {
    'recordedAt': NOW, 'newModelCalls': 0, 'candidateEdits': 0, 'rawOrAuditEdits': 0,
    'runtimeManifestSha256': MANIFEST, 'runtimeFilesVerified': 27,
    'immutableFileBindings': [{'path': p, 'sha256': h} for p, h in immutable.items()],
    'inventoryChangedRowIndexes': changed_rows, 'unrelatedInventoryRowsPreserved': 60,
    'historicalProductionFailuresPreserved': True, 'old276FailureUsage': None,
    '276BudgetRemaining': 0, 'pointAdjudicationBudgetRemaining': 0,
    'separate222QueuedAuthorizationUnconsumed': True,
    'countsCurrent': inventory['countsCurrent'], 'issueStatus': 'in_progress',
    'newBatchCreated': False, 'acceptancePromoted': False,
})
print(json.dumps({'newModelCalls': 0, 'changedRows': changed_rows, 'immutableFilesVerified': len(immutable),
                  'ownerChanged': changed_owner, 'ownerAppended': len(owner['items']) - len(before_owner['items'])}))
