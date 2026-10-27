"""Zero-model receipt registration. No producer, reviewer, or acceptance writes."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
SHARED = ROOT / 'integration/coac244-recorded222283-20261028'
CHECKS = []
PROTECTED = {}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def check(name, ok):
    CHECKS.append({'name': name, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(name)


def load(path):
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    return json.loads(p.read_text(encoding='utf-8-sig'))


def bind(ref):
    p = Path(ref['path'])
    if not p.is_absolute():
        p = ROOT / p
    b = p.read_bytes()
    check('sha:' + str(p), sha(b) == ref['sha256'])
    PROTECTED[str(p)] = sha(b)
    return json.loads(b)


def write(name, data):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'path': str(SHARED / name), 'sha256': sha(p.read_bytes())}


def handoff(name, expected):
    p = ROOT / 'integration' / name
    d = bind({'path': str(p), 'sha256': expected})
    shutil.copyfile(p, OUT / name)
    return d


def runtime(directory, expected):
    directory = Path(directory)
    m = bind({'path': str(directory / 'runtime-manifest.json'), 'sha256': expected})
    for f in m['files']:
        p = directory / f['path']
        check('runtime:' + str(p), sha(p.read_bytes()) == f['sha256'])
        PROTECTED[str(p)] = f['sha256']
    return len(m['files'])


H222 = handoff('coac249-reviewed222-target-figure-v3-20261028.json',
               '5573da4d2d8933823c9ad747f0bf332be397a303301baf6d35b68139e052788e')
H283 = handoff('coac249-283-six-table-supplement-20261028.json',
               '984eb65c84e40842bc0b0db324e715df309915b3907860a255a149415b3ff946')
ORDER_PATH = ROOT / 'integration/coac249-222-order-context-evidence-20261028.json'
ORDER = bind({'path': str(ORDER_PATH), 'sha256': sha(ORDER_PATH.read_bytes())})
shutil.copyfile(ORDER_PATH, OUT / ORDER_PATH.name)

C222, P222, A222, PA222, R222 = [bind(H222[k]) for k in
                               ['candidate', 'parent', 'audit', 'parentAudit', 'raw']]
S222 = bind({'path': C222['source']['path'], 'sha256': H222['call']['binding']['sourceFileSha256']}) if isinstance(C222.get('source'), dict) and 'path' in C222['source'] else load('web-sources/v1/79-bilibili-cn/articles/cv1775262/source.json')
source_path = ROOT / 'web-sources/v1/79-bilibili-cn/articles/cv1775262/source.json'
check('222 source exact hash', sha(source_path.read_bytes()) == H222['call']['binding']['sourceFileSha256'])
PROTECTED[str(source_path)] = sha(source_path.read_bytes())
check('222 audit raw review equal', A222['modelReview'] == H222['modelReview'] == R222['output'])
check('222 raw terminal successful', R222['success'] and R222['exitCode'] == 0 and not R222['timedOut'])
check('222 retained needs-repair', A222['status'] == 'needs-repair' and not A222['modelChecks']['passed'] and not A222['effectiveModelChecks']['passed'])
check('222 body unchanged including all order', canonical(C222['body']) == canonical(P222['body']))
check('222 ordered body parent audited faithful', PA222['modelReview']['domOrder']['faithful'] is True)
check('222 23 body blocks', len(C222['body']['blocks']) == 23)
check('222 figure identity order unchanged', [x['figureId'] for x in C222['figures']] == [x['figureId'] for x in P222['figures']])
check('222 unknowns never cleared', all(x['unknowns'] == y['unknowns'] for x, y in zip(C222['figures'], P222['figures'])))
check('222 limited positive review', all(x['verdict'] == 'faithful' for k in ['blockChecks', 'figureChecks'] for x in R222['output'][k]) and R222['output']['imageChecks'][0]['disposition'] == 'represented')
for k in ['domOrder', 'contextContinuity', 'semanticCompleteness']:
    field = 'complete' if k == 'semanticCompleteness' else 'faithful'
    check('222 unpassed flag preserved:' + k, R222['output'][k][field] is False)
check('222 budget exhausted', (H222['phaseUsed'], H222['phaseMaximum'], H222['remaining'], H222['retry']) == (3, 3, 0, 0))
count222 = runtime(H222['runtime']['path'], H222['runtime']['manifest']['sha256'])
parent_raw = bind({'path': 'audit/calls/' + PA222['calls'][0]['callId'] + '.json',
                   'sha256': 'a38f4973d1a3a896fbe48d9e808a37c143c775f6094fab913aca699c58b11c61'})
check('222 independent parent review bound to real raw', parent_raw['output'] == PA222['modelReview'] and parent_raw['success'] and parent_raw['exitCode'] == 0)
for h, raw, expected_images in [(H222, R222, 2)]:
    ex = raw['requestExecution']
    check('222 actual CLI terra max images', ex['model'] == 'gpt-6.1-terra' and ex['reasoningEffort'] == 'max' and len(ex['images']) == expected_images and ex['args'].count('-i') == expected_images)
    for image in ex['images']:
        p = Path(image['path']); check('222 actual image:' + p.name, sha(p.read_bytes()) == image['sha256'])
        PROTECTED[str(p)] = image['sha256']

# Read-only execution of the original frozen validator; never merge or save an audit.
validator = Path(H222['runtime']['path']) / 'textbook-audit-222-figure.mjs'
js = "import fs from 'node:fs';import {validateTargetFigureReview} from " + json.dumps(validator.as_uri()) + ";let a=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(JSON.stringify(validateTargetFigureReview(a.modelReview)));"
result = subprocess.run(['node', '--input-type=module', '-e', js, H222['audit']['path']], check=True, capture_output=True)
gate = json.loads(result.stdout)
check('222 original frozen validator still refuses pass', gate == H222['modelChecks'] and gate['passed'] is False)

# Keep the contiguous real sequence, including b0020, not another split target/context projection.
sequence = []
for i in range(16, 21):
    b = C222['body']['blocks'][i]
    sid = '79-bilibili-cn:cv1775262:b' + str(i + 1).zfill(4)
    check('222 exact ordered position:' + sid, b['sourceBlockIds'] == [sid] and S222['blocks'][i]['id'] == sid)
    sequence.append({'index': i, 'source': S222['blocks'][i], 'candidate': b,
                     'parent': P222['body']['blocks'][i],
                     'candidateBlockSha256': sha(canonical(b)),
                     'figure': next((f for f in C222['figures'] if f['figureId'] == b.get('figureId')), None)})
order_ref = write('222-contiguous-order.json', {'schema': 'coac244-222-contiguous-order-diagnostic/1',
    'candidate': H222['candidate'], 'parent': H222['parent'], 'parentAudit': H222['parentAudit'],
    'bodySerialization': 'UTF-8 compact JSON; object insertion order retained, not a new candidate',
    'bodySha256': sha(canonical(C222['body'])), 'sequence': sequence, 'newModelCalls': 0,
    'authority': 'Diagnostic evidence only; not an audit, effective review, or pass override.'})
assessment = {'schema': 'coac244-222-order-reuse-assessment/1', 'chapterId': H222['chapterId'],
    'candidate': H222['candidate'], 'audit': H222['audit'], 'raw': H222['raw'],
    'statusPreserved': 'needs-repair', 'modelReviewPreserved': H222['modelReview'], 'originalGateResult': gate,
    'reusableEvidence': {'unchangedOrder': PA222['modelReview']['domOrder'],
        'independentParentRawCall': PA222['calls'][0]['callId'], 'bodyEqualsParent': True,
        'candidateAndSourceContiguousOrder': order_ref, 'pointCall': H222['point']['callId'],
        'newIndependentTargetReading': 'faithful; two1m references confirmed'},
    'assessment': '父审的未改顺序结论可作为真实独立证据复用；不能把它写成此次模型已通过domOrder/contextContinuity/semanticCompleteness。现冻结合同要求新目标审全部这些标志为true并无uncertain，因此只补机械有序序列不足以产生合法passed收据。未改任何审或有效检查。',
    'nextAction': '将此精确证据与原uncertain一并留在现有owner，供授权范围内决定是否接受限定证据组合；不重制、不重读牌、不全章重审。本阶段预算已尽，不自动生成复用pass或追加调用。若决定仍须模型确认，只需b0017–b0021同序投影的1次限定连续性审（另行追加授权，0retry），不借当前余额。',
    'newModelCalls': 0, 'budget': {'used': 3, 'maximum': 3, 'remaining': 0, 'retry': 0},
    'notEstablished': ['No verified candidate order error.', 'No unsupported unknowns clearing; both arrays were already empty.', 'Remote weights, upstream executions and price remain unknown.']}
assessment_ref = write('222-assessment.json', assessment)

C283, S283, A283, REC283, RAW283, REQ283 = [bind(H283[k]) for k in
    ['candidate', 'source', 'originalAudit', 'receipt', 'raw', 'request']]
check('283 raw model output equals receipt', RAW283['output'] == REC283['modelReview'])
check('283 successful terminal', RAW283['success'] and RAW283['exitCode'] == 0 and not RAW283['timedOut'])
check('283 limited result not chapter passed', H283['status'] == 'passed-for-target-tables' and not H283['chapterAccepted'] and not REC283['chapterAccepted'])
check('283 all66 real figure results match', H283['figureResults'] == RAW283['output']['figureChecks'] and len(H283['figureResults']) == 66 and all(x['verdict'] == 'faithful' for x in H283['figureResults']))
check('283 all6 real tables match', H283['tableResults'] == RAW283['output']['tableChecks'] and len(H283['tableResults']) == 6 and all(x['verdict'] == 'faithful' for x in H283['tableResults']))
oldfig = {x['id']: x for x in A283['modelReview']['figureChecks']}
targets = {x['id'] for x in H283['figureResults']}
inherited = set(H283['inheritedFaithfulIds'])
table_figures = {b['figureId'] for b in C283['body']['blocks'] if b.get('figureId') and b.get('tableContext')}
check('283 old66 needs-repair exact table partition', targets == {i for i, f in oldfig.items() if i in table_figures and f['verdict'] == 'needs-repair'})
check('283 inherited28 faithful exact table partition', len(inherited) == 28 and inherited == {i for i, f in oldfig.items() if i in table_figures and f['verdict'] == 'faithful'} and not targets.intersection(inherited))
check('283 full94 accounted without duplicate review', len(targets | inherited) == 94)
check('283 raw complete limited target scope', RAW283['output']['completeTargetScopeCompared'] is True)
check('283 budget exhausted', H283['budget']['newCalls'] == H283['budget']['maximum'] == 1 and H283['budget']['remaining'] == H283['budget']['retry'] == H283['budget']['production'] == 0)
count283 = runtime(H283['runtime']['path'], H283['runtime']['manifestSha256'])
ex = RAW283['requestExecution']
check('283 actual request model max 30 images', ex['model'] == REQ283['model'] == 'gpt-6.1-terra' and ex['reasoningEffort'] == REQ283['reasoningEffort'] == 'max' and len(ex['images']) == len(REQ283['images']) == 30 and ex['args'].count('-i') == 30)
for i, image in enumerate(ex['images']):
    p = Path(image['path']); check('283 actual original image:' + p.name, str(p) == REQ283['images'][i] and sha(p.read_bytes()) == image['sha256'])
    PROTECTED[str(p)] = image['sha256']
check('283 saved prompt is actual raw prompt', REQ283['prompt'] == RAW283['prompt'] and sha(REQ283['prompt'].encode()) == H283['request']['promptSha256'])
check('283 original all19 issues retained', H283['oldOtherIssuesPreserved'] == A283['modelReview']['issues'])
batch = H283['inheritedPassedBatch']; bind(batch['checkpoint'])
check('283 same SHA 113 blocks already passed', batch['status'] == 'passed' and len(batch['sourceBlockIds']) == 113)

# The consumer worktree was cleaned: read immutable delivered git objects, never re-execute it.
consumer_dir = '.multica/delivery/coac249-283-tables-20261028/'
consumer_bytes = subprocess.run(['git', 'show', '148ba56:' + consumer_dir + 'supplement-runtime-manifest.json'], check=True, capture_output=True).stdout
check('283 consumer manifest recovered byte-exact from commit148ba56', sha(consumer_bytes) == H283['consumerManifest']['sha256'])
consumer = json.loads(consumer_bytes)
(OUT / 'consumer-runtime-manifest.json').write_bytes(consumer_bytes)
consumer_refs = consumer.get('files', [])
for f in consumer_refs:
    name = f.get('name', f.get('path'))
    name = name.replace('\\', '/').rsplit('/', 1)[-1]
    b = subprocess.run(['git', 'show', '148ba56:' + consumer_dir + name], check=True, capture_output=True).stdout
    check('283 delivered consumer file:' + name, sha(b) == f['sha256'])

geometry_ids = {x['id'] for x in H283['tableResults']}
# The Q33 original issue uses the caption source block, rather than its tableId.
geometry_ids.add('modern-yabejp-ja:chapter06-exercise003:b0502')
resolved = [x for x in H283['oldOtherIssuesPreserved'] if x['targetId'] in geometry_ids]
remaining = [x for x in H283['oldOtherIssuesPreserved'] if x['targetId'] not in geometry_ids]
check('283 six historical geometry findings mapped exactly', len(resolved) == 6 and len(remaining) == 13)
intake_path = ROOT / 'integration/coac250-283-six-table-evidence-intake-20261028.json'
intake = bind({'path': str(intake_path), 'sha256': sha(intake_path.read_bytes())})
check('250 already registered exact limited handoff', intake['handoff']['sha256'] == '984eb65c84e40842bc0b0db324e715df309915b3907860a255a149415b3ff946' and intake['status'] == 'registered-target-tables-only' and not intake['chapterAccepted'] and not intake['previewBuilt'] and not intake['consumerStarted'])
table_scope = {'schema': 'coac244-283-table-scope-registration/1', 'chapterId': H283['chapterId'],
    'candidate': H283['candidate'], 'source': H283['source'], 'originalAudit': H283['originalAudit'],
    'receipt': H283['receipt'], 'raw': H283['raw'], 'status': 'passed-for-target-tables', 'chapterAccepted': False,
    'newIndependentFigureResults': H283['figureResults'], 'sixTableResults': H283['tableResults'],
    'resolvedHistoricalGeometryFindings': resolved, 'inheritedFaithfulIds': H283['inheritedFaithfulIds'],
    'inheritedPassedBatch': batch, 'remainingOriginalFindings': remaining,
    'remainingBlockers': [x for x in remaining if x['severity'] != 'source-note'],
    'sourceNotesRetained': [x for x in remaining if x['severity'] == 'source-note'],
    'nextAction': '不重审六表/28faithful/113passed块。Q8 b0099、b0168等既有票在途先去重收据；b0396/b0962/b1017/b1181沿原审精确文字目标走合法制作及目标独审；b0785/b0947真实牌面及unknown仍须原图证据。此登记不派发、不移动额度。',
    'downstreamAlreadyReceived': {'issue': 'COAC-250', 'commentId': '01a17f1c-5fac-7d3a-86e7-5f6b68309a48', 'intakeSha256': sha(intake_path.read_bytes()), 'duplicateWakeupCreated': False},
    'newModelCalls': 0, 'budget': H283['budget'], 'oldModelReviewAndRawModified': False}
table_ref = write('283-scope-and-remaining.json', table_scope)

registration = {'schema': 'coac244-recorded222283/1', 'modelCallsThisRun': 0,
    'productionCallsThisRun': 0, 'acceptedChaptersThisRun': 0, 'newConsumers': 0,
    '222': assessment_ref, '283': table_ref, 'runtimeFilesVerified': {'222': count222, '283': count283},
    'warning': 'Limited evidence registration; neither chapter accepted. Old reviews and gates are unchanged.'}
reg_ref = write('registration.json', registration)

actions = {
    H222['chapterId']: '首审5b131a9b真实确认目标图/两处1m；仅因分数组缺合并顺序而uncertain。父审顺序faithful且23块body未变，可复用为事实证据；现冻结门禁仍拒绝，不零调用改pass。登记完整b0017–b0021同序证据及复用边界；3/3余0，不重制/重审/自动追加。',
    H283['chapterId']: '六表专项f5141a65已passed-for-target-tables，66图+6表独审通过，28faithful及113passed块继承。原19条问题保留历史，其中6条几何问题有新独立反证；其余13条(含source-note)精确列入新sidecar。250已限定登记，无整章合库。Q8/0168等既有在途先收据去重，复杂图/其它文字原阻断保留。1/1余0，不重审表。'
}
for name in ['coac244-remaining26-closure-register-20261028.json', 'coac250-uncovered-chapter-continuation-register-20261027b.json']:
    path = ROOT / 'integration' / name
    before = path.read_bytes(); d = json.loads(before); original = copy.deepcopy(d)
    (OUT / ('before-' + name)).write_bytes(before)
    touched = []
    for row in d['rows']:
        cid = row['chapterId']
        if cid not in actions:
            continue
        touched.append(cid)
        plan = row.get('closurePlan', row)
        plan['nextAction'] = actions[cid]
        row['reviewReturnRegistration'] = {**reg_ref, 'newModelCallsThisRun': 0, 'chapterAccepted': False,
            'scopeFile': assessment_ref if cid == H222['chapterId'] else table_ref}
    check('register exactly two intended rows:' + name, set(touched) == set(actions))
    check('register other rows and metadata unchanged:' + name,
          {k:v for k,v in d.items() if k != 'rows'} == {k:v for k,v in original.items() if k != 'rows'} and
          [r for r in d['rows'] if r['chapterId'] not in actions] == [r for r in original['rows'] if r['chapterId'] not in actions])
    for before_row, after_row in zip(original['rows'], d['rows']):
        if before_row['chapterId'] in actions:
            old = copy.deepcopy(before_row); new = copy.deepcopy(after_row)
            old.pop('reviewReturnRegistration', None); new.pop('reviewReturnRegistration', None)
            old.get('closurePlan', old).pop('nextAction', None); new.get('closurePlan', new).pop('nextAction', None)
            check('historical fields preserved:' + name + ':' + before_row['chapterId'], old == new)
    check('register no concurrent modification:' + name, path.read_bytes() == before)
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    shutil.copyfile(path, OUT / name)

for p, expected in PROTECTED.items():
    check('unchanged at finish:' + p, sha(Path(p).read_bytes()) == expected)
write('verification.json', {'schema': 'coac244-zero-call-receipt-verification/1', 'checks': CHECKS,
    'passed': all(x['passed'] for x in CHECKS), 'count': len(CHECKS),
    'protectedFiles': [{'path': p, 'sha256': h} for p,h in PROTECTED.items()],
    'modelCalls': 0, 'runtimeExecuted': 'Only pure frozen validateTargetFigureReview; no invoke/import auditor main, no consumer executed.'})
SHARED.mkdir(parents=True, exist_ok=True)
for p in OUT.iterdir():
    if p.is_file() and p.suffix == '.json':
        shutil.copyfile(p, SHARED / p.name)
print(json.dumps({'checks': len(CHECKS), 'passed': True, 'newCalls': 0,
    '222': 'needs-repair preserved; order evidence reusable only as factual scope',
    '283': {'newFigures': len(targets), 'tables': 6, 'remainingFindings': len(remaining),
            'blockingFindings': len(table_scope['remainingBlockers'])}, 'registration': reg_ref}, ensure_ascii=False))
