"""One explicitly authorized new production per chapter, using the unchanged 244 v2 entry."""
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
STAGE = ROOT / 'web-production/v1/runs/coac269-exact-183236-v2-20261028'
AUTH = '01a17ed7-c04d-71e7-82eb-57aed9c7b3e1'
NODE = 'E:/IDE/NodeJS/node.exe'
OWNER = 'COAC-269 Ticket executor'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def write(p, data, exclusive=False):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    with Path(p).open('x' if exclusive else 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def frozen(job):
    checks = []
    manifest = Path(summary['runtime']['path'])
    assert sha(manifest) == summary['runtime']['sha256']
    for ref in [{'path': str(manifest), 'sha256': summary['runtime']['sha256']}, *read(manifest)['files'], job['source'], job['parent'], job['parentAudit']]:
        assert sha(ref['path']) == ref['sha256'], ref
        checks.append(ref)
    assert read(manifest)['parent']['sha256'] == sha(read(manifest)['parent']['path'])
    old = read(ROOT / 'web-production/v1/runs/coac269-text-183236-20261028/batch-result.json')
    assert old['newLocalProductionCalls'] == 2 and old['newIndependentReviewCalls'] == 0
    for c in old['calls']:
        assert sha(ROOT / 'web-production/v1' / c['rawArtifactPath']) == c['rawArtifactSha256']
    p = read(job['parent']['path'])
    assert not p['figures']
    assert all(b['type'] == 'text' for b in read(job['source']['path'])['blocks'])
    assert read(job['parentAudit']['path'])['modelReview']['issues'][0]['severity'] == 'uncertain'
    for c in p['provenance']['attempts']:
        path = ROOT / 'web-production/v1' / c['rawArtifactPath']
        assert sha(path) == c['rawArtifactSha256']
        checks.append({'path': str(path), 'sha256': sha(path)})
    dictionary = p['provenance']['dictionary']
    assert sha(ROOT / dictionary['path']) == dictionary['sha256']
    checks.append(dictionary)
    return checks


def adapted(job):
    return {'chapterId': job['chapterId'], 'parentPath': job['parent']['path'], 'parentFileSha256': job['parent']['sha256']}


def prepare():
    checks = frozen(job)
    gate.stopped()
    joint = gate.joint(adapted(job))
    assert not (run / 'dispatch-started.json').exists(), 'dispatch already exists; never retry'
    assert not candidate.exists() and not display.exists(), 'candidate already exists; never reproduce'
    preflight = subprocess.run(args + ['--preflight-only'], cwd=ROOT, capture_output=True, encoding='utf-8')
    assert preflight.returncode == 0, preflight.stderr
    preview = subprocess.run(args + ['--request-only', 'true'], cwd=ROOT, capture_output=True, encoding='utf-8')
    assert preview.returncode == 0, preview.stderr
    request = json.loads(preview.stdout)
    assert request['request']['model'] == 'gpt-6.1-sol' and request['request']['reasoningEffort'] == 'high'
    assert request['request']['images'] == []
    schema = request['request']['schema']
    assert schema['properties']['translations']['items']['properties']['text']['enum'] == [contract['expectedText']]
    assert schema['properties']['translations']['items']['properties']['sourceBlockId']['enum'] == [contract['targetId']]
    assert contract['editorialNote'] in request['closedPrompt']
    assert 'Translate this complete Japanese textbook article' not in request['closedPrompt']
    assert request['request']['schema']['properties']['figures']['maxItems'] == 0
    evidence = {'at': now(), 'authorizationCommentId': AUTH, 'modelCalls': 0, 'frozenChecks': checks,
                'jointExclusion': joint, 'args': args, 'preflight': {'exitCode': preflight.returncode, 'stdout': preflight.stdout, 'stderr': preflight.stderr},
                'request': request, 'requestSha256': hashlib.sha256(request['closedPrompt'].encode()).hexdigest()}
    write(run / 'preflight.json', evidence)
    write(OUT / (key + '-preflight.json'), evidence)
    return evidence


def collect(evidence):
    source = read(job['source']['path'])
    ledger = [json.loads(x) for x in (ROOT / 'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    calls = [c for c in ledger if c.get('sourceId') == source['sourceId'] and c.get('articleId') == source['articleId'] and c['callId'] not in evidence['jointExclusion']['priorCallIds']]
    assert len(calls) <= 1, 'at most one newly authorized production call'
    result = {'chapterId': job['chapterId'], 'authorizationCommentId': AUTH, 'at': now(), 'calls': calls,
              'newLocalProductionCalls': len(calls), 'newLocalAuditCalls': 0, 'executorRetries': 0,
              'priorFailedProductionCallsBatch': 2, 'lifetimeBatchMaximum': 6, 'upstreamRequestCount': None,
              'monetaryCost': None, 'auditReady': False, 'runtime': summary['runtime']}
    for c in calls:
        rawpath = ROOT / 'web-production/v1' / c['rawArtifactPath']
        assert sha(rawpath) == c['rawArtifactSha256']
        raw = read(rawpath)
        assert raw['visualInputs'] == []
        assert raw['requestPrompt'] == evidence['request']['closedPrompt']
        assert c['promptSha256'] == evidence['requestSha256']
        assert c['targets'] == {'textIds': job['targetIds'], 'figureIds': []}
        (OUT / (key + '-production-raw.json')).write_bytes(rawpath.read_bytes())
        result.update(raw={'path': str(rawpath), 'sha256': sha(rawpath)},
                      terminalEvents=raw['terminalEvents'], stderr=raw['stderr'],
                      threadIds=[e['thread_id'] for e in raw['events'] if e.get('type') == 'thread.started'])
    if candidate.exists():
        child, parent = read(candidate), read(job['parent']['path'])
        expected = copy.deepcopy(parent['body'])
        block = next(b for b in expected['blocks'] if b['sourceBlockIds'] == [contract['targetId']])
        old = block['text']
        block['text'] = contract['expectedText']
        assert child['body'] == expected and child['figures'] == parent['figures']
        assert child['source'] == parent['source']
        assert raw['parsedOutput'] == {'translations': [{'sourceBlockId': contract['targetId'], 'text': contract['expectedText']}], 'figures': []}
        diff = ''.join(difflib.unified_diff([s + '\n' for s in old.splitlines()], [s + '\n' for s in contract['expectedText'].splitlines()], fromfile='parent-target', tofile='real-produced-target'))
        (OUT / (key + '-target.diff')).write_text(diff, encoding='utf-8')
        (OUT / (key + '-candidate.json')).write_bytes(candidate.read_bytes())
        rendered = subprocess.run(['python', str(runtime / 'textbook-production-web-present.py'), str(candidate)], cwd=ROOT, capture_output=True, encoding='utf-8')
        write(run / 'display-result.json', {'exitCode': rendered.returncode, 'stdout': rendered.stdout, 'stderr': rendered.stderr, 'modelCalls': 0})
        assert rendered.returncode == 0, rendered.stderr
        assert read(display)['body'] == child['body']
        (OUT / (key + '-display.json')).write_bytes(display.read_bytes())
        result.update(candidatePath=str(candidate), candidateSha256=sha(candidate), displayPath=str(display),
                      displaySha256=sha(display), exactWhitelistPassed=True, auditReady=True, outcome='candidate-ready-for-first-independent-audit')
    else:
        result['outcome'] = 'production-failed-raw-preserved-no-retry-no-audit'
    write(run / 'production-result.json', result)
    write(OUT / (key + '-result.json'), result)
    print(json.dumps(result, ensure_ascii=False))


action, key = sys.argv[1:]
assert key in ['183', '236'] and action in ['preflight', 'produce', 'collect']
summary = read(OUT / 'stage-summary.json')
job = next(j for j in summary['jobs'] if j['chapterId'] == 'nemata-jp-chapter-' + key + '-1')
runtime = Path(summary['runtime']['path']).parent
contract = next(j for j in read(runtime / 'exact-text-contracts.json')['jobs'] if j['chapterId'] == job['chapterId'])
run = STAGE / ('chapter-' + key)
run.mkdir(parents=True, exist_ok=True)
args = job['futureProductionCommandRequiresAdditionalAllowance'].copy()
args[0] = NODE
source = read(job['source']['path'])
candidate = ROOT / 'web-production/v1/candidates' / source['sourceId'] / (source['articleId'] + '.coac244exactv2.json')
display = candidate.with_name(candidate.stem + '.display.json')
helper_path = ROOT / 'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py'
spec = importlib.util.spec_from_file_location('existing_exclusion', helper_path)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
gate.OWNER = OWNER
if action == 'preflight':
    prepare()
    print(json.dumps({'chapterId': job['chapterId'], 'preflightPassed': True, 'modelCalls': 0}))
elif action == 'collect':
    assert (run / 'dispatch-finished.json').exists()
    collect(read(run / 'preflight.json'))
else:
    evidence = prepare()
    gate.slot('claim', '--chapter', job['chapterId'], '--candidate-sha', job['parent']['sha256'], '--lane', 'B', '--owner', OWNER)
    held = False
    try:
        slot = gate.slot('acquire', '--lane', 'B', '--owner', OWNER, '--pid', str(os.getpid()))
        held = True
        frozen(job)
        current = gate.joint(adapted(job))
        assert current['priorCallIds'] == evidence['jointExclusion']['priorCallIds']
        assert current['existingCandidateNames'] == evidence['jointExclusion']['existingCandidateNames']
        gate.stopped()
        write(run / 'dispatch-started.json', {'at': now(), 'authorizationCommentId': AUTH, 'args': args,
              'maxNewProductionCalls': 1, 'automaticRetry': 0, 'slot': slot, 'jointExclusion': current}, True)
        with (run / 'production.stdout.json').open('w', encoding='utf-8') as out, (run / 'production.stderr.txt').open('w', encoding='utf-8') as err:
            cp = subprocess.run(args, cwd=ROOT, stdout=out, stderr=err)
        write(run / 'dispatch-finished.json', {'at': now(), 'exitCode': cp.returncode})
        collect(evidence)
    finally:
        if held:
            write(run / 'slot-released.json', gate.slot('release', '--slot', str(ROOT / 'parallel/slots/maker-B.json'), '--owner', OWNER))
        write(run / 'chapter-released.json', gate.slot('unclaim', '--chapter', job['chapterId'], '--owner', OWNER))
