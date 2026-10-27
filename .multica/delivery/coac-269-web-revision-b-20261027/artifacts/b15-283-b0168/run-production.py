"""One foreground b0168 production under the original slot/claim gate. Never retries."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
STAGE = ROOT / 'web-production/v1/runs/coac269-283-b0168-20261028'
RUNTIME = ROOT / 'audit/runtimes/coac269-283-b0168-exact-v1-20261028'
OWNER = 'COAC-269 Ticket executor'
load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
now = lambda: datetime.now(timezone.utc).isoformat()


def write(p, value, exclusive=False):
    with Path(p).open('x' if exclusive else 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')


def frozen():
    manifest = RUNTIME / 'b0168-runtime-manifest.json'
    assert sha(manifest) == 'b1adb8d85258c8518f1f4df731debe48c20b180241fce8e9f56d7592433d55f4'
    for f in load(manifest)['files']:
        assert sha(f['path']) == f['sha256'], f
    for ref in [contract['parent'], contract['source'], contract['notes']]:
        assert sha(ref['path']) == ref['sha256']


contract = load(RUNTIME / 'b0168-contract.json')
preflight = load(STAGE / 'preflight.json')
assert preflight['passed'] and preflight['regressionCases'] == 14
assert not (STAGE / 'dispatch-started.json').exists(), 'prior dispatch: preserve state, do not retry'
candidate = ROOT / 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.coac269b0168r1.json'
assert not candidate.exists(), 'candidate already exists; do not reproduce'
spec = importlib.util.spec_from_file_location('existing_exclusion', ROOT / 'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
gate.OWNER = OWNER
job = {'chapterId': contract['chapterId'], 'parentPath': contract['parent']['path'], 'parentFileSha256': contract['parent']['sha256']}
frozen()
gate.stopped()
before = gate.joint(job)
write(OUT / 'before-dispatch-exclusion.json', before)
gate.slot('claim', '--chapter', job['chapterId'], '--candidate-sha', job['parentFileSha256'], '--lane', 'B', '--owner', OWNER)
held = False
try:
    slot = gate.slot('acquire', '--lane', 'B', '--owner', OWNER, '--pid', str(os.getpid()))
    held = True
    frozen()
    current = gate.joint(job)
    assert current['priorCallIds'] == before['priorCallIds'] and current['existingCandidateNames'] == before['existingCandidateNames']
    gate.stopped()
    write(STAGE / 'dispatch-started.json', {'at': now(), 'authorizationComment': contract['authorizationComment'], 'slot': slot,
          'jointExclusion': current, 'args': preflight['args'], 'maxProductionCalls': 1, 'automaticRetry': 0}, True)
    with (STAGE / 'production.stdout.json').open('w', encoding='utf-8') as out, (STAGE / 'production.stderr.txt').open('w', encoding='utf-8') as err:
        cp = subprocess.run(preflight['args'], cwd=ROOT, stdout=out, stderr=err)
    write(STAGE / 'dispatch-finished.json', {'at': now(), 'exitCode': cp.returncode, 'candidateExists': candidate.exists()})
    calls = [json.loads(x) for x in (ROOT / 'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
    calls = [c for c in calls if c.get('sourceId') == 'modern-yabejp-ja' and c.get('articleId') == 'chapter06-exercise003' and c['callId'] not in before['priorCallIds']]
    assert len(calls) <= 1, 'single-production budget exceeded'
    for c in calls:
        raw = ROOT / 'web-production/v1' / c['rawArtifactPath']
        assert sha(raw) == c['rawArtifactSha256']
        (OUT / 'production-raw.json').write_bytes(raw.read_bytes())
    result = {'chapterId': job['chapterId'], 'targetId': contract['targetId'], 'calls': calls, 'newProductionCalls': len(calls),
              'newAuditCalls': 0, 'automaticRetry': 0, 'monetaryCost': None, 'upstreamRequestCount': None,
              'candidatePath': str(candidate) if candidate.exists() else None, 'candidateSha256': sha(candidate) if candidate.exists() else None,
              'exitCode': cp.returncode, 'notIndependentPass': True}
    write(STAGE / 'production-result.json', result)
    write(OUT / 'production-result.json', result)
    print(json.dumps(result))
finally:
    if held:
        write(STAGE / 'slot-released.json', gate.slot('release', '--slot', str(ROOT / 'parallel/slots/maker-B.json'), '--owner', OWNER))
    write(STAGE / 'chapter-released.json', gate.slot('unclaim', '--chapter', job['chapterId'], '--owner', OWNER))
