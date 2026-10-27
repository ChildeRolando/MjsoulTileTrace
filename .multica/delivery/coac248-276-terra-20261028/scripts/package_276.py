"""Package one completed, explicitly authorized attempt. Never dispatch a model."""
import copy
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
LOCAL = Path(__file__).resolve().parent.parent
RUN = ROOT / 'web-production/v1/runs/coac248-web-276-4-r2-20261028'


def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


e = read(RUN / 'production-evidence.json')
call = e['productionAttempt']
assert call['success'] and call['model'] == 'gpt-6.1-terra' and call['reasoningEffort'] == 'max'
raw_path = ROOT / 'web-production/v1' / call['rawArtifactPath']
assert sha(raw_path) == call['rawArtifactSha256']
raw = read(raw_path)
request = raw['requestExecution']
assert request['model'] == 'gpt-6.1-terra' and request['reasoningEffort'] == 'max'
args = request['args']
assert args[args.index('--model') + 1] == 'gpt-6.1-terra'
assert 'model_reasoning_effort="max"' in args
assert len(request['images']) > 0 and args.count('-i') == len(request['images'])
for image in request['images']:
    p = Path(image['path'])
    assert sha(p) == image['sha256'] and p.stat().st_size == image['bytes']
assert raw['parsedOutput'] is not None and any(x['type'] == 'turn.completed' for x in raw['events'])
assert not any(x['type'] == 'turn.failed' for x in raw['events'])
manifest_path = ROOT / 'audit/runtimes/coac244-vision-terra-max-v1-20261027/runtime-manifest.json'
assert sha(manifest_path) == '12a058d48014dbe52b3bdd8257282e159754047861be5e8fc1489d06a4e3d7c6'
manifest = read(manifest_path)
for file in manifest['files']:
    assert sha(manifest_path.parent / file['path']) == file['sha256']
assert sha(ROOT / e['candidatePath']) == e['candidateSha256']
assert sha(ROOT / e['parentPath']) == e['parentSha256']
assert sha(ROOT / e['parentAuditPath']) == e['parentAuditSha256']
assert sha(ROOT / e['sourcePath']) == e['sourceSha256']
old_raw = ROOT / 'web-production/v1/raw-calls/2375640c-3a8d-45e7-9601-4b810fe87e80.json'
assert sha(old_raw) == '4060ca8c826094fda356bb4f3c50a3f59625e6660110f20feba1f8c0afa91ba9'
assert read(old_raw)['usage'] is None

for name in ['entry-preflight.json', 'preflight.json', 'dispatch-started.json',
             'dispatch-finished.json', 'production.stdout.json', 'production.stderr.txt',
             'slot-released.json', 'chapter-released.json']:
    shutil.copyfile(RUN / name, LOCAL / 'evidence' / name)
shutil.copyfile(raw_path, LOCAL / 'evidence' / raw_path.name)
write(LOCAL / 'target-diff-276.json', e['changes'])

hp = ROOT / 'integration/coac249-incremental-276-4-20261028.json'
h = read(hp)
h['runtime'] = {'path': str(manifest_path.parent.relative_to(ROOT)),
                'manifestPath': str(manifest_path.relative_to(ROOT)),
                'manifestSha256': sha(manifest_path), 'manifest': manifest}
h['requiredIndependentReviewModel'] = {'model': 'gpt-6.1-terra', 'reasoningEffort': 'max',
                                      'fallback': False, 'snapshotOwner': 'COAC-244'}
h['historicalFailedRevision'] = {'callId': '2375640c-3a8d-45e7-9601-4b810fe87e80',
                                'rawPath': str(old_raw.relative_to(ROOT)),
                                'rawSha256': sha(old_raw), 'usage': None,
                                'preserved': True, 'recoverable': False}
h['productionRequestExecution'] = request
h['additionalReviewFocus'] = {'fullChangedFigure': e['targets'],
                             'allChangedFields': e['changes'],
                             'instruction': 'Review original images and full new article; parent only locates the issue. All target caption/sourceNotes/transcription changes are explicit. No producer-granted passed.'}
h['instructions'] = ('Only276-4 new display SHA, one first independent full-article review; failed/void consumes budget, no retry. '
                     'Use owner Terra/max runtime12a058d4, check actual args/images/requestExecution, all prior STOP and guard gates. '
                     'Passed goes to250; exact return goes to248. Do not review intermediate r2.json,157 or other chapters.')
write(hp, h)
shutil.copyfile(hp, LOCAL / hp.name)
receipt = {'schema': 'coac248-resumed276-finite-stage/1',
           'recordedAt': datetime.now(timezone.utc).isoformat(),
           'triggerCommentId': '01a17e99-7226-70fa-bd52-6aff4ef4e4ce',
           'chapterId': e['chapterId'], 'candidatePath': e['candidatePath'],
           'candidateSha256': e['candidateSha256'], 'sourceSha256': e['sourceSha256'],
           'parentSha256': e['parentSha256'], 'parentAuditSha256': e['parentAuditSha256'],
           'newModelCalls': {'production': 1, 'audit': 0, 'failed': 0, 'void': 0, 'automaticRetries': 0},
           'remainingBudget': {'production': 0, 'firstIndependentReview': 1, 'retry': 0},
           'productionAttempt': call, 'requestExecution': request,
           'remoteBackendWeights': None, 'responseEvidence': 'Original complete raw/events retained; no inference about invisible gateway weights.',
           'historicalFailedRevision': h['historicalFailedRevision'],
           'oldPlusNewTotalUsage': None, 'knownNewUsage': call['usage'],
           'mechanicalChecks': e['checks'], 'preservation': e['preservation'],
           'changes': e['changes'], 'semanticAcceptance': None,
           'handoff249': {'path': str(hp.relative_to(ROOT)), 'sha256': sha(hp)},
           'runtimeManifestSha256': sha(manifest_path),
           'released': {'makerA': read(RUN / 'slot-released.json'),
                        'chapter': read(RUN / 'chapter-released.json')},
           '157': 'Already passed and handed250; no additional production or audit.'}
write(LOCAL / 'round-276-terra.json', receipt)
print(json.dumps({'candidateSha256': e['candidateSha256'], 'callId': call['callId'],
                  'model': call['model'], 'reasoningEffort': call['reasoningEffort'],
                  'imageInputs': len(request['images']), 'usage': call['usage'],
                  'handoffSha256': sha(hp)}))
