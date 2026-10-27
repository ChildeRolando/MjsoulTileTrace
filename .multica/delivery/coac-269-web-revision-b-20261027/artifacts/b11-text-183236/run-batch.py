"""Execute only the authorized 183/236 text batch through the unchanged 244 runtime."""
import copy
import difflib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
PACKET = OUT / 'text-batch-183-236.json'
STAGE = ROOT / 'web-production/v1/runs/coac269-text-183236-20261028'
NODE = 'E:/IDE/NodeJS/node.exe'
OWNER = 'COAC-269 Ticket executor'
AUTHORIZATION = '01a17eba-f0e3-71c8-9f5f-5fc8853ec674'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def write(p, value, exclusive=False):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    with Path(p).open('x' if exclusive else 'w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def now():
    return datetime.now(timezone.utc).isoformat()


def validate_frozen(job):
    checks = []
    manifest = Path(job['runtime']['manifestPath'])
    assert sha(manifest) == job['runtime']['sha256']
    checks.append({'path': str(manifest), 'sha256': sha(manifest)})
    for item in read(manifest)['files']:
        p = Path(job['runtime']['path']) / item['name']
        assert sha(p) == item['sha256'], str(p)
        checks.append({'path': str(p), 'sha256': sha(p)})
    for binding in [job['source'], job['parent'], job['parentAudit']]:
        assert sha(binding['path']) == binding['sha256'], binding
        checks.append(binding)
    parent = read(job['parent']['path'])
    dictionary = parent['provenance']['dictionary']
    assert sha(ROOT / dictionary['path']) == dictionary['sha256']
    checks.append(dictionary)
    for call in parent['provenance']['attempts']:
        p = ROOT / 'web-production/v1' / call['rawArtifactPath']
        assert sha(p) == call['rawArtifactSha256']
        checks.append({'path': str(p), 'sha256': sha(p)})
    for call in job['parentCalls']:
        p = ROOT / 'audit/calls' / (call['callId'] + '.json')
        assert p.is_file()
        checks.append({'path': str(p), 'sha256': sha(p)})
    assert len(parent['figures']) == 0
    assert all(b['type'] == 'text' for b in read(job['source']['path'])['blocks'])
    assert len(job['targetIds']) == 1
    notes = read(job['parentAudit']['path'])
    assert [i for i in notes['modelReview']['issues'] if i['severity'] != 'source-note'] == job['originalIssues']
    assert notes['modelReview']['issues'][0]['severity'] == 'uncertain'
    return checks


def helper():
    p = ROOT / 'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py'
    spec = importlib.util.spec_from_file_location('existing_exclusion', p)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.OWNER = OWNER
    return module


def adapted(job):
    return {'chapterId': job['chapterId'], 'parentPath': job['parent']['path'],
            'parentFileSha256': job['parent']['sha256']}


def prepare(job, run, gate):
    checks = validate_frozen(job)
    assert read(OUT / 'text-parent-chain-proofs.json')['regressionCases'] == 18
    before = gate.joint(adapted(job))
    gate.stopped()
    args = job['productionCommandAfterApproval'].copy()
    args[0] = NODE
    source = read(job['source']['path'])
    candidate = ROOT / 'web-production/v1/candidates' / source['sourceId'] / (source['articleId'] + '.' + args[args.index('--variant') + 1] + '.json')
    assert not candidate.exists(), 'Existing candidate: no reproduction'
    assert not (run / 'dispatch-started.json').exists(), 'Existing dispatch: no retry'
    # A prior new revision of either chapter must be inspected rather than replayed.
    assert not any('coac244closure' in n or 'coac269text' in n for n in before['existingCandidateNames']), before['existingCandidateNames']
    result = subprocess.run(args + ['--preflight-only'], cwd=ROOT, capture_output=True, encoding='utf-8')
    evidence = {'at': now(), 'authorizationCommentId': AUTHORIZATION, 'frozenChecks': checks,
                'jointExclusion': before, 'args': args, 'modelCalls': 0,
                'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    write(run / 'preflight.json', evidence)
    write(OUT / (key + '-preflight.json'), evidence)
    assert result.returncode == 0, result.stderr
    return args, candidate, before


def collect(job, run, candidate, before):
    source = read(job['source']['path'])
    calls = [json.loads(line) for line in (ROOT / 'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    calls = [c for c in calls if c.get('sourceId') == source['sourceId'] and c.get('articleId') == source['articleId'] and c['callId'] not in before['priorCallIds']]
    assert len(calls) <= 1, 'One production call maximum'
    result = {'chapterId': job['chapterId'], 'authorizationCommentId': AUTHORIZATION,
              'at': now(), 'calls': calls, 'localProductionCalls': len(calls), 'localAuditCalls': 0,
              'executorRetries': 0, 'upstreamRequestCount': None, 'monetaryCost': None,
              'candidatePath': None, 'whitelistPassed': False, 'auditReady': False}
    for call in calls:
        raw = ROOT / 'web-production/v1' / call['rawArtifactPath']
        assert sha(raw) == call['rawArtifactSha256']
        raw_obj = read(raw)
        assert raw_obj['visualInputs'] == []
        assert call['model'] == 'gpt-6.1-sol' and call['reasoningEffort'] == 'high'
        assert call['targets'] == {'textIds': job['targetIds'], 'figureIds': []}
        (OUT / (key + '-production-raw.json')).write_bytes(raw.read_bytes())
        result['raw'] = {'path': str(raw), 'sha256': sha(raw)}
        result['transportEvents'] = raw_obj.get('terminalEvents', [])
        result['threadIds'] = [e['thread_id'] for e in raw_obj.get('events', []) if e.get('type') == 'thread.started']
    if candidate.exists():
        child, parent = read(candidate), read(job['parent']['path'])
        assert child['source'] == parent['source']
        assert child['figures'] == parent['figures']
        expected = copy.deepcopy(parent['body'])
        target = job['targetIds'][0]
        old_block = next(b for b in expected['blocks'] if b['sourceBlockIds'] == [target])
        new_block = next(b for b in child['body']['blocks'] if b['sourceBlockIds'] == [target])
        old, new = old_block['text'], new_block['text']
        old_block['text'] = new
        assert expected == child['body'], 'Only the target text may change'
        base = old if key == '183' else old.replace('即使剩余巡数很少，也应当立直', '即使巡数很少，也应当立直')
        suffix = new[len(base):] if new.startswith(base) else ''
        passed = new.startswith(base) and bool(suffix.strip()) and '校注' in suffix
        if key == '183':
            passed = passed and all(term in suffix for term in ['4%', '2%', '3%', '役牌', '客风'])
        else:
            passed = passed and any(term in suffix for term in ['未明确', '未说明', '未明', '不明确'])
        diff = ''.join(difflib.unified_diff([line + '\n' for line in old.splitlines()], [line + '\n' for line in new.splitlines()], fromfile='parent-target', tofile='produced-target'))
        (OUT / (key + '-target.diff')).write_text(diff, encoding='utf-8')
        result.update(candidatePath=str(candidate), candidateSha256=sha(candidate),
                      targetBefore=old, targetAfter=new, whitelistPassed=bool(passed))
        (OUT / (key + '-candidate.json')).write_bytes(candidate.read_bytes())
        if passed:
            display = subprocess.run(['python', str(Path(job['runtime']['path']) / 'textbook-production-web-present.py'), str(candidate)], cwd=ROOT, capture_output=True, encoding='utf-8')
            write(run / 'display-result.json', {'exitCode': display.returncode, 'stdout': display.stdout, 'stderr': display.stderr, 'modelCalls': 0})
            assert display.returncode == 0, display.stderr
            path = candidate.with_name(candidate.stem + '.display.json')
            result.update(displayPath=str(path), displaySha256=sha(path), auditReady=True)
            (OUT / (key + '-display.json')).write_bytes(path.read_bytes())
        else:
            result['outcome'] = 'failed-whitelist-no-retry-no-audit'
    else:
        result['outcome'] = 'failed-production-no-retry-no-audit'
    write(run / 'production-result.json', result)
    write(OUT / (key + '-result.json'), result)
    return result


key = sys.argv[2]
assert key in ['183', '236']
packet = read(PACKET)
job = next(j for j in packet['jobs'] if j['chapterId'] == 'nemata-jp-chapter-' + key + '-1')
run = STAGE / ('chapter-' + key)
run.mkdir(parents=True, exist_ok=True)
gate = helper()
if sys.argv[1] == 'preflight':
    prepare(job, run, gate)
    print(json.dumps({'chapter': job['chapterId'], 'preflight': True, 'newCalls': 0}))
elif sys.argv[1] == 'produce':
    args, candidate, before = prepare(job, run, gate)
    existing_claim = before['claim']
    if existing_claim.get('held'):
        assert existing_claim.get('bySelf') and existing_claim['record']['candidateSha256'] == job['parent']['sha256']
        write(run / 'resumed-own-claim.json', existing_claim)
    else:
        gate.slot('claim', '--chapter', job['chapterId'], '--candidate-sha', job['parent']['sha256'], '--lane', 'B', '--owner', OWNER)
    held = False
    try:
        slot = gate.slot('acquire', '--lane', 'B', '--owner', OWNER, '--pid', str(os.getpid()))
        held = True
        validate_frozen(job)
        current = gate.joint(adapted(job))
        assert current['priorCallIds'] == before['priorCallIds']
        assert current['existingCandidateNames'] == before['existingCandidateNames']
        gate.stopped()
        write(run / 'dispatch-started.json', {'at': now(), 'authorizationCommentId': AUTHORIZATION,
              'args': args, 'maxProductionCalls': 1, 'executorRetries': 0, 'slot': slot,
              'jointExclusion': current}, True)
        with (run / 'production.stdout.json').open('w', encoding='utf-8') as out, (run / 'production.stderr.txt').open('w', encoding='utf-8') as err:
            completed = subprocess.run(args, cwd=ROOT, stdout=out, stderr=err)
        write(run / 'dispatch-finished.json', {'at': now(), 'exitCode': completed.returncode})
        result = collect(job, run, candidate, before)
        print(json.dumps(result, ensure_ascii=False))
    finally:
        if held:
            write(run / 'slot-released.json', gate.slot('release', '--slot', str(ROOT / 'parallel/slots/maker-B.json'), '--owner', OWNER))
        write(run / 'chapter-released.json', gate.slot('unclaim', '--chapter', job['chapterId'], '--owner', OWNER))
elif sys.argv[1] == 'collect':
    # Read-only recovery of evidence collection; never call the producer again.
    assert (run / 'dispatch-finished.json').is_file()
    before = read(run / 'dispatch-started.json')['jointExclusion']
    source = read(job['source']['path'])
    args = read(run / 'dispatch-started.json')['args']
    candidate = ROOT / 'web-production/v1/candidates' / source['sourceId'] / (source['articleId'] + '.' + args[args.index('--variant') + 1] + '.json')
    print(json.dumps(collect(job, run, candidate, before), ensure_ascii=False))
else:
    raise ValueError('Only preflight, produce or read-only collect')
