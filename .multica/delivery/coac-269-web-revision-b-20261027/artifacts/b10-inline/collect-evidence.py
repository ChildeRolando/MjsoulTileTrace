"""Read-only evidence collection for the authorized COAC-269 162/234 batch.

No model dispatch, normalization, shared integration writes, or raw edits.
"""
import copy
import difflib
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
STAGE = ROOT / 'web-production/v1/runs/coac244-inline-japanese-20261027'
OUT = Path(__file__).resolve().parent
key = sys.argv[1]
assert key in ('162', '234')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reference(path):
    return {'path': str(path), 'sha256': sha(path)}


job = next(j for j in read(STAGE / 'ticket-intake.json')['jobs']
           if j['chapterId'].split('-')[-2] == key)
run = STAGE / ('chapter-' + key)
dispatch = read(run / 'dispatch-started.json')
source = read(ROOT / job['source']['path'])
parent = read(ROOT / job['parentPath'])
article = source['articleId']
candidate_path = ROOT / 'web-production/v1/candidates' / source['sourceId'] / (
    article + '.coac244inline20261027.display.json')
result = {'at': datetime.now(timezone.utc).isoformat(), 'chapterId': job['chapterId'],
          'monetaryCost': None, 'executorRedispatches': 0,
          'upstreamAttemptCount': None, 'dispatch': dispatch,
          'intake': reference(STAGE / 'ticket-intake.json'),
          'source': reference(ROOT / job['source']['path']),
          'parent': reference(ROOT / job['parentPath']),
          'parentAudit': reference(ROOT / job['auditPath']),
          'plan': reference(ROOT / job['planPath'])}
assert result['source']['sha256'] == job['source']['sha256']
assert result['parent']['sha256'] == job['parentFileSha256']
assert result['parentAudit']['sha256'] == job['auditFileSha256']
assert result['plan']['sha256'] == job['planSha256']
calls = [json.loads(line) for line in (ROOT / 'web-production/v1/calls.jsonl')
         .read_text(encoding='utf-8').splitlines() if line.strip()]
calls = [c for c in calls if c.get('sourceId') == source['sourceId']
         and c.get('articleId') == article
         and c['callId'] not in dispatch['jointExclusion']['priorCallIds']]
assert len(calls) == 1, 'exactly one new production call must be accounted for'
for call in calls:
    raw = ROOT / 'web-production/v1' / call['rawArtifactPath']
    assert sha(raw) == call['rawArtifactSha256']
result['productionCalls'] = calls
result['productionRawObservations'] = [
    {k: raw.get(k) for k in ('callId', 'exitCode', 'timedOut', 'usage', 'stderr',
                             'terminalEvents', 'rawLastMessage')}
    for raw in (read(ROOT / 'web-production/v1' / c['rawArtifactPath']) for c in calls)]
result['candidateProduced'] = candidate_path.exists()
if candidate_path.exists():
    candidate = read(candidate_path)
    target_ids = {e['sourceBlockId'] for e in read(ROOT / job['planPath'])['edits']}
    expected = copy.deepcopy(parent['body'])
    changes = []
    for before, after, probe in zip(parent['body']['blocks'], candidate['body']['blocks'],
                                    expected['blocks'], strict=True):
        if before != after:
            assert before['sourceBlockIds'][0] in target_ids
            probe['text'] = after['text']
            assert probe == after, 'only target text may change'
            changes.append({'id': before['sourceBlockIds'][0], 'before': before['text'],
                            'after': after['text']})
    assert candidate['body'] == expected
    clean = lambda f: {k: v for k, v in f.items() if k != 'presentationAsset'}
    assert list(map(clean, candidate['figures'])) == list(map(clean, parent['figures']))
    result.update(candidate=reference(candidate_path), changes=changes,
                  nonTargetBodyUnchanged=True, figureSemanticsUnchanged=True)
    diff = ''.join(difflib.unified_diff(
        json.dumps(parent['body'], ensure_ascii=False, indent=2).splitlines(True),
        json.dumps(candidate['body'], ensure_ascii=False, indent=2).splitlines(True),
        fromfile=job['parentPath'], tofile=str(candidate_path)))
    (OUT / ('diff-' + key + '.patch')).write_text(diff, encoding='utf-8')
for name in ('dispatch-started.json', 'dispatch-finished.json', 'display-result.json',
             'slot-released.json', 'chapter-released.json', 'before-independent-review.json',
             'audit-dispatched.json', 'audit-result.json', 'verified-pass.json',
             'production.stdout.json', 'production.stderr.txt'):
    path = run / name
    if path.exists():
        shutil.copyfile(path, OUT / (key + '-' + name))
if (run / 'audit-result.json').exists():
    review = read(run / 'audit-result.json')
    assert len(review['calls']) == 1
    assert review['newCallsThisInvocation'] == 1
    result['auditStatus'] = review['status']
    result['auditCalls'] = review['calls']
    result['auditRawCalls'] = [reference(ROOT / 'audit/calls' / (c['callId'] + '.json'))
                              for c in review['calls']]
    result['auditCallObservations'] = [
        {k: raw.get(k) for k in ('callId', 'startedAt', 'durationMs', 'usage',
                                 'success', 'exitCode', 'timedOut',
                                 'usageLimitReached', 'unexpectedTool', 'terminalEvents')}
        for raw in (read(Path(ref['path'])) for ref in result['auditRawCalls'])]
if (run / 'verified-pass.json').exists():
    passed = read(run / 'verified-pass.json')
    assert passed['candidateSha256'] == sha(candidate_path)
    audit_path = Path(passed['auditPath'])
    if not audit_path.is_absolute():
        audit_path = ROOT / audit_path
    assert passed['auditSha256'] == sha(audit_path)
    result['independentPass'] = passed
(OUT / ('evidence-' + key + '.json')).write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'chapter': job['chapterId'], 'productionCalls': len(calls),
                  'independentPass': 'independentPass' in result}))
