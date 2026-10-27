"""Zero-model collection of existing independent results; no reviewer or producer invocation."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
SHARED = ROOT / 'integration/coac244-q8-236-recorded-20261028'
CHECKS, PROTECTED, RECOVERED = [], {}, []


def digest(b):
    return hashlib.sha256(b).hexdigest()


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def check(name, passed):
    CHECKS.append({'name': name, 'passed': bool(passed)})
    if not passed:
        raise AssertionError(name)


intake = read(ROOT / 'integration/coac250-q8-target-evidence-intake-20261028.json')
ALIASES = {r['originalPath']: r['recoveredPath'] for r in intake['recovered'] if 'originalPath' in r}


def bound(ref, binary=False):
    orig = Path(ref['path']); p = orig if orig.is_absolute() else ROOT / orig
    if not p.exists() and str(orig) in ALIASES:
        p = Path(ALIASES[str(orig)])
        RECOVERED.append({'originalPath': str(orig), 'sameBytePath': str(p), 'sha256': ref['sha256']})
    b = p.read_bytes()
    check('SHA:' + str(p), digest(b) == ref['sha256'])
    PROTECTED[str(p)] = ref['sha256']
    return b if binary else json.loads(b)


def file_ref(p):
    return {'path': str(p), 'sha256': digest(Path(p).read_bytes())}


def save(name, data):
    p = OUT / name
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'path': str(SHARED / name), 'sha256': digest(p.read_bytes())}


qpath = ROOT / 'integration/coac249-q8-source-reviewed-20261028.json'
wpath = ROOT / 'integration/coac249-236-fidelity-reviewed-20261028.json'
q = bound({'path': str(qpath), 'sha256': 'd567b8135953b7dce8d1b82d0344941d47764fa2b33d091d953c8049981a8c68'})
w = bound({'path': str(wpath), 'sha256': 'eea58df5c29fcdacb27b760bfe4dda756f33573a4e681e91016c49ab399887e1'})
qc, qs, qa, qr, qrec, qrequest, latest = [bound(q[k]) for k in ['candidate', 'source', 'originalAudit', 'raw', 'receipt', 'request', 'currentQ8IdenticalCandidate']]
for ref in q['bindings']:
    bound(ref, binary=True)
check('all93 Q8 bound inputs checked', len(q['bindings']) == 93)
qmanifest = bound({'path': str(Path(q['runtime']['path']) / 'runtime-manifest.json'), 'sha256': q['runtime']['manifestSha256']})
for f in qmanifest['files']:
    bound({'path': str(Path(q['runtime']['path']) / f['path']), 'sha256': f['sha256']}, binary=True)
check('Q8 frozen27 files', len(qmanifest['files']) == 27)
packet = json.loads(qrequest['prompt'][qrequest['prompt'].index('{'):])
qids = [x['id'] for x in packet['q8']['sourceBlocks']]
new_blocks = [x for x in latest['body']['blocks'] if x['sourceBlockIds'][0] in qids]
old_blocks = [x for x in qc['body']['blocks'] if x['sourceBlockIds'][0] in qids]
new_figures = [x for x in latest['figures'] if x['sourceBlockIds'][0] in qids]
old_figures = [x for x in qc['figures'] if x['sourceBlockIds'][0] in qids]
check('Q8 complete21 source and candidate blocks', len(qids) == len(new_blocks) == 21 and old_blocks == new_blocks == packet['q8']['candidateBlocks'])
check('Q8 all7 figure objects inherit unchanged', old_figures == new_figures == packet['q8']['candidateFigures'] and len(new_figures) == 7)
check('Q8 original source range unaltered', packet['q8']['sourceBlocks'] == [x for x in qs['blocks'] if x['id'] in qids])
check('Q8 real raw conclusion identical receipt', qr['success'] and qr['exitCode'] == 0 and not qr['timedOut'] and qr['output'] == q['modelReview'] == qrec['modelReview'] == json.loads(qr['rawLastMessage']))
check('Q8 independent supported target only', q['status'] == 'passed-for-target-q8' and not q['chapterAccepted'] and qr['output']['resolution'] == 'supported' and qr['output']['q8Argument']['verdict'] == 'faithful' and qr['output']['completeTargetScopeCompared'])
check('Q8 prompt/schema actual raw match', qr['prompt'] == qrequest['prompt'] and qr['schema'] == qrequest['schema'])
execution = qr['requestExecution']
check('Q8 actual15 images terra max CLI', execution['model'] == 'gpt-6.1-terra' and execution['reasoningEffort'] == 'max' and execution['args'].count('-i') == len(execution['images']) == 15 and [i['path'] for i in execution['images']] == qrequest['images'])
for i, image in enumerate(execution['images']):
    bound(image, binary=True)
    positions = [j for j, a in enumerate(execution['args']) if a == '-i']
    check('Q8 argv image order:' + str(i), execution['args'][positions[i] + 1] == image['path'])
check('Q8 closed prompt exact', qr['requestPrompt'].endswith(qrequest['prompt']) and digest(qr['requestPrompt'].encode()) == qr['requestPromptSha256'])
check('Q8 all source limitations remain explicit', all(q['limits'].values()) and len(qr['output']['fieldsStillUnknown']) >= 4)

wc, wa, wr = [bound(w[k]) for k in ['candidate', 'audit', 'raw']]
for ref in w['bound']:
    bound(ref, binary=True)
wm = bound({'path': w['runtime']['manifestPath'], 'sha256': w['runtime']['manifestSha256']})
for ref in wm['files']:
    bound(ref, binary=True)
pm = bound(wm['parent'])
for ref in pm['files']:
    p = Path(ref['path'])
    if not p.is_absolute():
        p = Path(wm['parent']['path']).parent / p
    bound({'path': str(p), 'sha256': ref['sha256']}, binary=True)
check('236 new17 and old18 runtime unchanged', len(wm['files']) == 17 and len(pm['files']) == 18)
check('236 real raw target faithful', wr['success'] and wr['exitCode'] == 0 and wr['output'] == w['modelReview'] == wa['modelReview'] == json.loads(wr['rawLastMessage']) and wa['status'] == 'passed' and wa['modelChecks']['passed'] and wa['effectiveModelChecks']['passed'])
check('236 raw missing structured execution preserved', 'requestExecution' not in wr)
runtime = ROOT / w['runtime']['path']
js = "import {verifyAuditForWebCandidate} from " + json.dumps((runtime / 'textbook-audit-web.mjs').as_uri()) + ";const r=await verifyAuditForWebCandidate(process.argv[1],process.argv[2]);process.stdout.write(JSON.stringify({status:r.status,auditSha256:r.auditSha256}));"
result = json.loads(subprocess.run(['node', '--input-type=module', '-e', js, str(ROOT), w['candidate']['path']], check=True, capture_output=True).stdout)
check('236 real frozen full verifier passes exact audit', result == {'status': 'passed', 'auditSha256': w['audit']['sha256']})

# Existing250 already composed Q8 into the new-SHA table/b0168 evidence graph. Reuse, do not fork it.
effective_path = ROOT / 'integration/coac250-283-effective-issues-with-q8-20261028.json'
effective = bound(file_ref(effective_path))
check('effective283 graph targets latestSHA and accepted Q8 raw', effective['candidate']['sha256'] == q['currentQ8IdenticalCandidate']['sha256'] and effective['additionalAcceptedQ8']['raw'] == q['raw'])
check('Q8 mandatory limits faithfully inherited', effective['additionalAcceptedQ8']['mandatoryLimits'] == q['limits'] and effective['additionalAcceptedQ8']['fieldsStillUnknown'] == q['modelReview']['fieldsStillUnknown'])
check('effective ledger8resolved9blocking2notes', effective['counts']['resolved'] == 8 and effective['counts']['remainingBlocking'] == 9 and effective['counts']['sourceNotes'] == 2 and not effective['wholeChapterAccepted'])
check('Q8 original uncertain resolves via genuine independent evidence', next(i for i in effective['issues'] if i['originalIssue']['targetId'].endswith('b0099'))['status'] == 'resolved-by-independent-q8-supplement')
save('q8-scope.json', {'canonical': q['canonical'], 'handoff': file_ref(qpath), 'candidate': q['currentQ8IdenticalCandidate'], 'originalCandidate': q['candidate'], 'receipt': q['receipt'], 'raw': q['raw'], 'status': q['status'], 'chapterAccepted': False, 'actualCall': q['call']['callId'], 'usage': q['call']['usage'], 'durationMs': qr['durationMs'], 'effectiveIssueRegister': file_ref(effective_path), 'scopeContentHash': digest(json.dumps({'source': packet['q8']['sourceBlocks'], 'candidate': new_blocks, 'figures': new_figures}, ensure_ascii=False, separators=(',', ':')).encode()), 'mandatoryLimits': q['limits'], 'fieldsStillUnknown': q['modelReview']['fieldsStillUnknown'], 'completeOriginalIndependentModelReview': q['modelReview'], 'sourceAndReceiptModified': False, 'newCalls': 0})
save('236-scope.json', {'canonical': w['canonical'], 'handoff': file_ref(wpath), 'candidate': w['candidate'], 'audit': w['audit'], 'raw': w['raw'], 'status': w['status'], 'modelReview': w['modelReview'], 'runtime': w['runtime'], 'verifierActualResult': result, 'originalRawStructuredExecutionMissing': True, 'newCalls': 0, 'alreadyIntegrated250': {'commentId': '01a17f39-2631-74d4-a648-327cda54bad6', 'selectionVersion': 25, 'reportedOriginalCoverage': '233/256 chapters;265/303 units;23 remaining', 'duplicateWakeupCreated': False}})

pre_path = ROOT / 'integration/coac249-100-zero-preflight-20261028.json'
pre = bound(file_ref(pre_path))
bound(pre['helper'], binary=True)
pre_manifest = bound(pre['manifest'])
for ref in pre_manifest['files']:
    p = Path(ref['path'])
    if not p.is_absolute():
        p = Path(pre['manifest']['path']).parent / p
    bound({'path': str(p), 'sha256': ref['sha256']}, binary=True)
check('100 earlier preflight31 dependencies', len(pre_manifest['files']) == 31)
later_path = ROOT / 'integration/coac249-next3-100-reviewed-20261028.json'
later = read(later_path)
save('100-routing-observation.json', {'canonical': pre['canonical'], 'zeroPreflight': file_ref(pre_path), 'helperActualLocation': pre['helper'], 'manifest': pre['manifest'], 'laterExistingAuthorizedConsumer': {'runId': '01a17f29-cde9-7167-bcd5-afe7e5899bc5', 'observedStatus': 'running', 'newHandoffFile': file_ref(later_path), 'handoffReportedStatus': later['status'], 'handoffReportedNewCalls': later['newCalls'], 'fullNewReviewVerifiedByThisRun': False}, 'instruction': 'Do not repeat100/159/242 or represent earlier zero preflight as a new passed receipt; existing consumer owns later actual review collection.', 'newCallsThisRun': 0})
registration = save('registration.json', {'schema': 'coac244-q8-236-collection/1', 'q8': {'path': str(SHARED / 'q8-scope.json'), 'sha256': digest((OUT / 'q8-scope.json').read_bytes())}, '236': {'path': str(SHARED / '236-scope.json'), 'sha256': digest((OUT / '236-scope.json').read_bytes())}, '100': {'path': str(SHARED / '100-routing-observation.json'), 'sha256': digest((OUT / '100-routing-observation.json').read_bytes())}, 'newCalls': 0, 'historicalBatch': {'maximum': 2, 'used': 2, 'remaining': 0, 'retry': 0}, 'newProducerOrAuditDispatch': False, 'previewBuilt': False, 'formalActiveChanged': False, 'newConsumers': 0, 'fees': None, 'upstreamExecutions': None, 'remoteWeights': 'unknown'})

actions = {
 'nemata-jp-chapter-283-1': 'Q8独立补证a5187359已passed-for-target-q8，21块/7图在最新b2417de1与原父同对象，原图JPEG+x4及13内联图实际15图已核。直接复用250现有8resolved/9blockers/2source-note收敛账；保留副露两万子/其它河牌unknown、异时HTML/JPEG/尺寸/第6巡/2s安全性矛盾，不重派Q8/六表/0168。整章仍needs-repair；原审/raw不改，无新call或preview/active。',
 'nemata-jp-chapter-236-1': '真实新增独审2b075f4d已passed，同SHA61932126不改，fidelity冻结17文件及父18文件、原raw与完整父审继承均核，新原验证器实际passed。旧7a1363b3 uncertain/raw原样；保留巡数方向作者歧义和非原文校注，不把未说明事实补成确定读法。250已真实纳入v25并完成MCP/Arena读回，不再制作/审校/重派；本批2/2余0，本次0call。',
 'nemata-jp-chapter-100-1': '原零模型预检helper位于交接根context100.mjs，31依赖已核；既有授权consumer01a17f29…现running，已有coac249-next3-100-reviewed-20261028.json报告needs-repair/1call，由原消费者继续收口。本次只登记预检和后续结果存在，未代验新审全链、未另派100/159/242；原零模型预检不能冒充新passed收据，不借Q8/236额度。'
}
changes = []
for name in ['coac244-remaining26-closure-register-20261028.json', 'coac250-uncovered-chapter-continuation-register-20261027b.json']:
    path = ROOT / 'integration' / name
    before = path.read_bytes(); data = json.loads(before); original = copy.deepcopy(data)
    for row in data['rows']:
        cid = row['chapterId']
        if cid not in actions:
            continue
        before_row = copy.deepcopy(row)
        plan = row.get('closurePlan', row)
        plan['nextAction'] = actions[cid]
        row['q8FidelityCollection'] = {**registration, 'scope': cid, 'newModelCallsThisRun': 0}
        if cid == 'nemata-jp-chapter-236-1':
            if 'blockingIssues' in row:
                row['originalUncertainBeforeFidelityPass'] = copy.deepcopy(row['blockingIssues'])
                row['blockingIssues'] = []
            plan['latestIndependentStatus'] = {'status': 'passed', 'audit': w['audit'], 'candidate': w['candidate'], 'integrated250Version': 25, 'oldUncertainRawPreserved': True}
        if cid == 'nemata-jp-chapter-283-1':
            check('existing current283 ledger not regressed:' + name, len(plan.get('effectiveBlockingIssues', [])) == 9)
        save('row-' + cid.split('-')[-2] + ('-closure.json' if name.startswith('coac244') else '-continuation.json'), {'before': before_row, 'after': row})
    check('all other rows unchanged:' + name, [r for r in data['rows'] if r['chapterId'] not in actions] == [r for r in original['rows'] if r['chapterId'] not in actions])
    check('all coverage and metadata unchanged:' + name, {k:v for k,v in data.items() if k != 'rows'} == {k:v for k,v in original.items() if k != 'rows'})
    check('no concurrent register mutation:' + name, path.read_bytes() == before)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    changes.append({'path': str(path), 'onlyChangedCanonicals': list(actions), 'beforeSha256': digest(before), 'afterSha256': digest(path.read_bytes()), 'coverageChanged': False})

for path, expected in PROTECTED.items():
    check('immutable at finish:' + path, digest(Path(path).read_bytes()) == expected)
save('verification.json', {'passed': True, 'checks': CHECKS, 'count': len(CHECKS), 'protectedFiles': [{'path': p, 'sha256': h} for p,h in PROTECTED.items()], 'sameByteRecoveredInputs': RECOVERED, 'runtimeInvocation': 'Only frozen verifyAuditForWebCandidate; no auditWebCandidate/invokeTextbookCodex/producer/consumer executed.', 'registerChanges': changes, 'newCalls': 0})
for label, p in [('q8-handoff.json', qpath), ('236-handoff.json', wpath)]:
    shutil.copyfile(p, OUT / label)
SHARED.mkdir(parents=True, exist_ok=True)
for p in OUT.iterdir():
    if p.suffix in ['.json', '.py']:
        shutil.copyfile(p, SHARED / p.name)
with zipfile.ZipFile(OUT / 'q8-236-registration-evidence.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.json', '.py']:
            z.write(p, p.name)
print(json.dumps({'checks': len(CHECKS), 'newCalls': 0, 'Q8': 'target passed;2838resolved9blockers2notes', '236': 'independent passed;already integratedv25', 'registration': registration}, ensure_ascii=False))
