import copy
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
SHARED = ROOT / 'integration/coac244-next3-admit-20261028'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def save(name, d):
    p = OUT / name
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'path': str(SHARED / name), 'sha256': sha(p)}


h = read(OUT / 'handoff.json')
contract = read(OUT / '100-repair-contract.json')
upstream_path = ROOT / 'integration/coac249-next3-reviewed-20261028.json'
assert sha(upstream_path) == 'ebe45f7418c0a049acea441bfe361810bbcc7ce5b74f2505cb1bb03bdc5b880b'
upstream = read(upstream_path)
hundred = read(ROOT / 'integration/coac249-next3-100-reviewed-20261028.json')
raw100 = read(hundred['raw']['path'])
request100 = read(hundred['request']['path'])
projection = json.loads(request100['prompt'][request100['prompt'].index('{'):])
checks = []
for ref in hundred['allBoundInputs'] + [hundred['raw'], hundred['receipt'], hundred['candidate'], hundred['source'], hundred['oldAudit'], hundred['request']]:
    assert sha(ref['path']) == ref['sha256']
    checks.append({'shaMatched': ref})
assert raw100['output'] == hundred['modelReview'] == read(hundred['receipt']['path'])['modelReview']
assert raw100['requestExecution']['model'] == 'gpt-6.1-sol' and raw100['requestExecution']['reasoningEffort'] == 'high' and raw100['requestExecution']['images'] == []
assert raw100['prompt'] == request100['prompt'] and len(projection['source']['blocks']) == len(projection['candidate']['blocks']) == 107
assert hundred['modelReview']['issues'][0]['targetId'] == contract['targetId']
assert sum(x['verdict'] == 'faithful' for x in hundred['modelReview']['blockChecks']) == 67
assert hundred['status'] == 'needs-repair' and hundred['sidecar'] is None
deps = read(OUT / 'runtime-manifest.json')
for ref in deps['files'] + deps['originalStageDependencies']:
    assert sha(ref['path']) == ref['sha256']
    checks.append({'dependencyMatched': ref})
for ref in read(OUT / 'verification.json')['protectedFiles']:
    assert sha(ref['path']) == ref['sha256']
consumer250 = ROOT / 'integration/coac250-limited-159242-20261028'
assert all(not r['standardWholeArticlePassed'] and r['oldStatus'] == 'needs-repair' and r['ordinaryWholeArticleGateStillRejects'] for r in read(OUT / '250-adapter-verification.json')['results'])
consumer_refs = [{'path': str(consumer250 / n), 'sha256': sha(consumer250 / n)} for n in ['contract.json', 'manifest.json', 'admit.mjs', 'stage-limited.mjs']]
registration = save('registration.json', {'schema': 'coac244-next3-bounded-collection/1', 'upstream': {'path': str(upstream_path), 'sha256': sha(upstream_path)}, 'admitted': h['items'], 'contract100': h['contract100'], 'runtime': h['manifest'], 'ownDiagnosticVerification': h['verification'], 'existing250Adapter': {'files': consumer_refs, 'actualVerifierResult': read(OUT / '250-adapter-verification.json'), 'currentRun': '01a17f49-0391-799b-8f86-976b5a9f927c', 'newConsumerStarted': False, 'newWakeupCreated': False}, 'budget': upstream['budget'], 'newModelCallsThisRun': 0, 'newProductionThisRun': 0, 'newCandidateThisRun': 0, 'masterPreviewBuiltThisRun': False, 'formalActiveChanged': False, 'standardWholeArticlePassed': False})
actions = {
 'nemata-jp-chapter-100-1': '新增独审c821f2f0真实完成：107块(68目标+39定义)，67目标faithful、仅b0041漏生きている的“尚未被打出2张以上”条件；原243passed及128图继承。精确100-repair-contract已零调用准备，只改该短语、其余310块/128图/sourceSegments不动，原raw不改、无passed sidecar。下一最小合法maker1+目标首审1须另批授权，当前3/3余0，不自动制作/复审。',
 '79-cn-chapter-159-9': '真实50eb7aaf独立允许现有unknown下作者论证忠实展示；数字仍unknown、战术事实dependsOnExactTile uncertain全部保留，技术receipt limitedOkay=false不改。精确SHA/源/原call/bbox及父审非目标准入已实跑，隔离stage保留原unknown、原点数/1500目标/5万碰例外；无需maker或新增注。仅忠实展示范围解除原识字待办，标准全章passed=false；250现有run完成真实MCP/Arena/合库，若已消费则同SHA去重，不另派模型/消费者。',
 '79-cn-chapter-242-3': '真实d98dff34独立允许现有?m下作者论证忠实展示；数字仍unknown、不猜3m、不独立证明结算或最优。技术false/战术uncertain原样，原图/source/原call/bbox及父审非目标限定准入已实跑，隔离stage保留“上家的3万/也许/基本/争TOP/亲家”条件；无需maker或新增注。标准全章passed=false；250现有run继续真实MCP/Arena/合库，同SHA去重，不再挂识字复审。'
}
rows = []
for name in ['coac244-remaining26-closure-register-20261028.json', 'coac250-uncovered-chapter-continuation-register-20261027b.json']:
    path = ROOT / 'integration' / name
    before = path.read_bytes(); data = json.loads(before); original = copy.deepcopy(data)
    for row in data['rows']:
        cid = row['chapterId']
        if cid not in actions:
            continue
        old = copy.deepcopy(row); plan = row.get('closurePlan', row)
        plan['nextAction'] = actions[cid]
        row['next3BoundedCollection'] = {**registration, 'newModelCallsThisRun': 0, 'scope': cid}
        if cid == 'nemata-jp-chapter-100-1':
            issue = hundred['modelReview']['issues'][0]
            if 'blockingIssues' in row:
                row['historicalIssuesBeforeContext100Review'] = copy.deepcopy(row['blockingIssues'])
                row['blockingIssues'] = [issue]
            plan['effectiveBlockingIssues'] = [issue]
            plan['repairContract'] = h['contract100']
        else:
            admitted = next(a for a in h['items'] if a['canonical'] == cid)
            evidence = read(admitted['evidence']['path'])
            if 'blockingIssues' in row:
                row['historicalIssuesBeforeLimitedFidelity'] = copy.deepcopy(row['blockingIssues'])
                row['blockingIssues'] = []
            plan['effectiveBlockingIssuesForFaithfulDisplay'] = []
            plan['limitedFaithfulDisplayAdmission'] = admitted['proof']
            plan['tacticalFactsStillUncertain'] = evidence['dependenciesStillUncertain']
            plan['sourceNotesPreserved'] = [i for i in read(evidence['oldAudit']['path'])['modelReview']['issues'] if i['severity'] == 'source-note']
            plan['standardWholeArticlePassed'] = False
        assert row.get('covered') == old.get('covered')
        save('row-' + cid.split('-')[-2] + ('-closure.json' if name.startswith('coac244') else '-continuation.json'), {'before': old, 'after': row})
    assert [r for r in data['rows'] if r['chapterId'] not in actions] == [r for r in original['rows'] if r['chapterId'] not in actions]
    assert {k:v for k,v in data.items() if k != 'rows'} == {k:v for k,v in original.items() if k != 'rows'}
    assert path.read_bytes() == before
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    rows.append({'path': str(path), 'beforeSha256': hashlib.sha256(before).hexdigest(), 'afterSha256': sha(path), 'onlyCanonicalsChanged': list(actions), 'coverageChanged': False})
save('collection-verification.json', {'checks': checks, 'registerChanges': rows, 'newCalls': 0, '100SidecarAbsent': True, '100NewError': hundred['modelReview']['issues'][0], 'originalBudgetExhausted': True})
for p in OUT.iterdir():
    if p.suffix in ['.json', '.mjs', '.py']:
        shutil.copyfile(p, SHARED / p.name)
with zipfile.ZipFile(OUT / 'next3-admission-evidence.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.json', '.mjs', '.py']:
            z.write(p, p.name)
print(json.dumps({'registration': registration, 'additionalChecks': len(checks), 'newCalls': 0, 'readyLimitedDisplay': ['159', '242'], '100': 'exact contract only, no budget'}, ensure_ascii=False))
