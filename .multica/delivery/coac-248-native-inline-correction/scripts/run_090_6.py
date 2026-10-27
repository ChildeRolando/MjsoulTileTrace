"""One bounded COAC-248 revision, using the existing frozen runner unchanged."""
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
LOCAL = Path(__file__).resolve().parent.parent
RUN = ROOT / 'web-production/v1/runs/coac248-web-090-6-r1-20261027'
NODE = 'E:/IDE/NodeJS/node.exe'
SLOTS = ROOT / 'parallel/slots.mjs'
OWNER = 'COAC-248 Mika'
CHAPTER = '79-cn-chapter-090-6'
PARENT = 'web-production/v1/candidates/79-bilibili-cn/cv1721510.display.json'
NOTES = 'audit/web/articles/79-bilibili-cn/cv1721510.4cb573da8c93c6764aaccb68db5b5dad2fcec66ab3486b39e93696f23745149f.retry-1792942848957-13e1430c.json'
SOURCE = 'web-sources/v1/79-bilibili-cn/articles/cv1721510/source.json'
REUSE = 'web-production/v1/reuse-maps/feba91e5e2cc3c289812d93d9a9e557201e0f1bf30edded28d5704384bad6f58.json'
CANDIDATE = 'web-production/v1/candidates/79-bilibili-cn/cv1721510.r1.json'

def now():
    return datetime.now(timezone.utc).isoformat()

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))

def write(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def slot(*args):
    r = subprocess.run([NODE, str(SLOTS), *args], capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        raise RuntimeError(r.stdout + r.stderr)
    return json.loads(r.stdout)

def stops():
    result = {p: (ROOT / p).exists() for p in ['STOP', 'web-production/v1/STOP', 'model-admission-stop.json']}
    assert not any(result.values()), result
    return result

def args():
    return [NODE, str(RUN / 'frozen-runner/textbook-production-web.mjs'),
            '--source', SOURCE, '--revision-from', PARENT, '--revision-notes', NOTES,
            '--reuse', REUSE, '--variant', 'r1', '--stop-file', 'STOP', '--timeout-ms', '900000']

def prepare():
    assert sha(ROOT / PARENT) == '4cb573da8c93c6764aaccb68db5b5dad2fcec66ab3486b39e93696f23745149f'
    parent = load(ROOT / PARENT)
    assert sha(ROOT / SOURCE) == parent['source']['sourceSha256']
    assert not (ROOT / CANDIDATE).exists(), 'candidate already exists; do not reproduce'
    # Joint canonical exclusion: active preview, chapter register, any bound passed web receipt.
    pointer = load(ROOT / 'integration/accepted-preview-current.json')
    selected = [x for x in pointer.get('selectedWeb', []) if 'cv1721510.' in x.get('candidatePath', '')]
    pdf = [s for s in pointer.get('selectedPdf', {}).get('stages', []) if CHAPTER in s.get('receipt', {}).get('chapterIds', [])]
    register_path = ROOT / 'integration/coac250-unified-chapter-register-20261027b.json'
    registered = [x for x in load(register_path).get('rows', []) if x.get('chapterId') == CHAPTER]
    passed = []
    for p in (ROOT / 'audit/web/articles/79-bilibili-cn').glob('cv1721510.*.json'):
        a = load(p)
        if a.get('status', '').startswith('passed') and a.get('source', {}).get('sourceSha256') == parent['source']['sourceSha256']:
            cp = Path(a['production']['path'])
            if not cp.is_absolute():
                cp = ROOT / cp
            if cp.exists() and sha(cp) == a['production']['sha256']:
                passed.append({'path': str(p), 'sha256': sha(p)})
    assert not selected and not pdf and not passed and not any(x.get('verdict') == 'covered-effective' for x in registered), 'already covered'
    calls = [json.loads(s) for s in (ROOT / 'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
    prior = [x for x in calls if x.get('articleId') == 'cv1721510']
    assert len(prior) == 1 and prior[0]['callId'] == '60d5152a-b2c7-4deb-a3ee-d57f8797d77d', 'unexpected call; inspect before dispatch'
    check = slot('check-chapter', '--chapter', CHAPTER, '--owner', OWNER)
    stop_check = stops()
    template = ROOT / 'web-production/v1/runs/coac248-web-227-246-20261027/frozen-runner'
    assert not RUN.exists(), 'run already exists; inspect instead of overwriting'
    shutil.copytree(template, RUN / 'frozen-runner')
    assert (RUN / 'frozen-runner/textbook-production-web-visual.py').is_file()
    files = [{'name': p.name, 'sha256': sha(p)} for p in sorted((RUN / 'frozen-runner').iterdir()) if p.is_file()]
    r = subprocess.run(args() + ['--preflight-only'], capture_output=True, encoding='utf-8', text=True)
    (RUN / 'preflight.stdout.json').write_text(r.stdout, encoding='utf-8')
    (RUN / 'preflight.stderr.txt').write_text(r.stderr, encoding='utf-8')
    assert r.returncode == 0, r.stderr
    result = json.loads(r.stdout)
    assert result['modelCalls'] == 0 and result['pendingFigureRuns'] == 3
    readings = [
        ('b0004', '例1末张与摸入均为两列、每列两根绿竹的4s；与六根绿竹6s不同。宝牌仍为3p。'),
        ('b0008', '例3末四张为三根3s、四根4s、四绿加中央红竹普通5s、两列各三根6s；摸入6m。'),
        ('b0012', '例5在3s之后两张均为四根4s，末两张为交叉M形8s；摸入四绿加中央红竹的普通5s，非赤牌。'),
    ]
    evidence = []
    for bid, reading in readings:
        f = next(f for f in parent['figures'] if f['figureId'] == f'79-bilibili-cn:cv1721510:{bid}:figure')
        bindings = []
        for b in f['sourceAssetBindings']:
            assert sha(ROOT / b['path']) == b['sha256']
            zoom = f"web-production/v1/reading-views/28fabbcb7d66073c5c66f9829ffeb960108c8ae39abdc7638c500cc2c9e64528/{b['sha256']}.x4.png"
            bindings.append({**b, 'inspectedZoom': zoom, 'zoomSha256': sha(ROOT / zoom)})
        evidence.append({'figureId': f['figureId'], 'sourceAssetBindings': bindings, 'visualRead': reading, 'agreesWithParentReview': True})
    record = {'schema': 'coac248-090-6-zero-call-preflight/1', 'recordedAt': now(),
              'chapterId': CHAPTER, 'parentPath': PARENT, 'parentSha256': sha(ROOT / PARENT),
              'parentAuditPath': NOTES, 'parentAuditSha256': sha(ROOT / NOTES),
              'sourcePath': SOURCE, 'sourceSha256': sha(ROOT / SOURCE),
              'jointExclusion': {'activePreviewPath': pointer['output'], 'activePreviewSha256': sha(ROOT / 'integration/accepted-preview-current.json'),
                                 'selectedWeb': selected, 'selectedPdf': pdf, 'registerRows': registered, 'passedReceipts': passed, 'priorCalls': [x['callId'] for x in prior]},
              'chapterCheck': check, 'stopFiles': stop_check, 'frozenRunnerFiles': files,
              'entryPreflight': result, 'sourceReadings': evidence, 'modelCalls': 0,
              'budget': {'production': 1, 'independentReviewByCOAC249': 1, 'retry': 0},
              'reviewBoundary': '本线只做制作及确定性验证；新候选交COAC-249首次独立全章审校，不自审。'}
    write(RUN / 'preflight.json', record)
    write(LOCAL / 'source-check-web090-6-20261027.json', record)
    print(json.dumps(result))

def produce():
    assert (RUN / 'preflight.json').exists()
    assert not (RUN / 'dispatch-started.json').exists(), 'already attempted; no retry'
    stops()
    slot('claim', '--chapter', CHAPTER, '--candidate-sha', sha(ROOT / PARENT), '--lane', 'A', '--owner', OWNER)
    acquired = False
    try:
        acquisition = slot('acquire', '--lane', 'A', '--owner', OWNER)
        acquired = True
        check = slot('check-chapter', '--chapter', CHAPTER, '--owner', OWNER)
        stop_check = stops()
        write(RUN / 'dispatch-started.json', {'at': now(), 'slot': acquisition, 'chapter': check, 'stopFiles': stop_check, 'argv': args()})
        # Exactly one foreground invocation. Caller collects completion before ending the turn.
        with (RUN / 'production.stdout.json').open('w', encoding='utf-8') as out, (RUN / 'production.stderr.txt').open('w', encoding='utf-8') as err:
            r = subprocess.run(args(), stdout=out, stderr=err)
        write(RUN / 'dispatch-finished.json', {'at': now(), 'exitCode': r.returncode})
        print((RUN / 'production.stdout.json').read_text(encoding='utf-8'))
        if r.returncode:
            print((RUN / 'production.stderr.txt').read_text(encoding='utf-8'), file=sys.stderr)
        return r.returncode
    finally:
        if acquired:
            release = slot('release', '--slot', str(ROOT / 'parallel/slots/maker-A.json'), '--owner', OWNER)
            write(RUN / 'slot-released.json', {'at': now(), 'release': release})

if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare()
    elif sys.argv[1] == 'produce':
        sys.exit(produce())
    else:
        raise ValueError('prepare or produce required')
