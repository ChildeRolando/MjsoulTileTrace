"""Register verified existing target evidence only; no model or semantic receipt writes."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
SHARED = ROOT / 'integration/coac244-b0168-recorded-20261028'
CID = 'nemata-jp-chapter-283-1'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def save(name, d):
    p = OUT / name
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'path': str(SHARED / name), 'sha256': sha(p.read_bytes())}


hpath = ROOT / 'integration/coac249-b0168-reviewed-target-20261028.json'
assert sha(hpath.read_bytes()) == '3e718558ce87ec9476d1965defc9d3d81d1c5b98644ca5f1d44e95cc218db98c'
h = read(hpath)
v = read(OUT / 'verification.json')
assert v['passed'] and v['newCalls'] == 0 and v['verifierResults']['targetGroup']['passed']
audit = read(h['audit']['path'])
parent = read(h['parentAudit']['path'])
original_findings = [i for b in parent['batchReviews'] for i in b['modelReview']['issues']]
deferred = []
for d in h['deferredOriginalIssues']:
    issue = next(i for i in original_findings if i['targetId'] == d['targetId'] and i['severity'] == d['severity'] and sha(json.dumps(i, ensure_ascii=False, separators=(',', ':')).encode()) == d['issueSha256'])
    deferred.append({**d, 'originalIssue': issue})
assert len(deferred) == 16
table_path = ROOT / 'integration/coac249-283-six-table-supplement-20261028.json'
table = read(table_path)
assert sha(table_path.read_bytes()) == '984eb65c84e40842bc0b0db324e715df309915b3907860a255a149415b3ff946'
table_ids = {x['id'] for x in table['tableResults']} | {'modern-yabejp-ja:chapter06-exercise003:b0502'}
other = [d for d in deferred if d['targetId'] not in table_ids]
assert len(other) == 10
registration = {
    'schema': 'coac244-b0168-target-evidence-registration/1', 'chapterId': CID,
    'targetId': h['targetId'], 'handoff': {'path': str(hpath), 'sha256': sha(hpath.read_bytes())},
    'candidate': h['candidate'], 'source': h['source'], 'parent': h['parent'], 'parentAudit': h['parentAudit'],
    'audit': h['audit'], 'checkpoint': h['checkpoint'], 'raw': h['raw'], 'runtime': h['runtime'],
    'targetStatus': 'passed', 'chapterStatus': 'needs-repair', 'chapterAccepted': False,
    'modelReview': h['modelReview'], 'verification': v['verifierResults'],
    'unchanged': {'nonTargetBodyBlocks': 1194, 'figures': 524, 'onlyDiff': '在b0168末尾摸入宝牌后增加或'},
    'deferred16PreservedWithOriginalIssues': deferred,
    'independentTableBranch': {'candidate': table['candidate'], 'receipt': table['receipt'], 'raw': table['raw'],
        'handoffSha256': sha(table_path.read_bytes()), 'figures': 66, 'tables': 6,
        'relationship': 'Both candidates are stored. New b0168 SHA figures and non-target body equal its parent. Table evidence remains bound to original dea1ba24 SHA; not imported into new aggregate or declared full283 passed.'},
    'planningOnlyOther10Deferred': other,
    'sourceNotesRetained': [i for i in audit['modelReview']['issues'] if i['severity'] == 'source-note'],
    'inheritedBatch010': h['inheritedBatch010'],
    'call': {'callId': h['call']['callId'], 'actualModel': h['requestExecution']['model'],
             'actualEffort': h['requestExecution']['reasoningEffort'], 'images': h['requestExecution']['images'],
             'usage': h['call']['usage'], 'durationMs': h['durationMs'],
             'callerModel': 'gpt-6.1-sol', 'callerEffort': 'high',
             'routing': 'Frozen CLI resolved the two-image audit to terra/max; caller fields preserved.'},
    'budget': {'historicalMaker': 1, 'historicalFirstAudit': 1, 'used': 2, 'maximum': 2, 'remaining': 0, 'retry': 0},
    'thisRun': {'modelCalls': 0, 'productionCalls': 0, 'newCandidates': 0, 'newAcceptedChapters': 0,
                'newConsumers': 0, 'previewBuilt': False, 'formalActiveChanged': False},
    'downstreamDeduplication': {'COAC-250': {'alreadyRegisteredComment': '01a17f2d-65fd-7a81-afcc-293cd1bd5d06', 'newWakeupCreated': False}},
    'nextAction': 'b0168目标闭合，不重制/重审1195块。原16条deferred继续按完整canonical/候选SHA逐项管理；六表证据沿原分支保留，不重审表。Q8及其它既有在途先收据去重，其余文字/复杂图只沿原精确目标继续，须相应已授权预算，不能借用本批已用尽额度。此登记不追加调用。',
    'measurementLimits': {'fee': None, 'upstreamExecutionTotal': None, 'remoteWeights': 'unknown'},
    'verificationArtifact': {'path': str(SHARED / 'verification.json'), 'sha256': sha((OUT / 'verification.json').read_bytes())},
}
reg_ref = save('registration.json', registration)
for label in ['checkpoint', 'producerHandoff']:
    shutil.copyfile(h[label]['path'], OUT / (label + '.json'))
shutil.copyfile(hpath, OUT / hpath.name)

row_checks = []
for name in ['coac244-remaining26-closure-register-20261028.json', 'coac250-uncovered-chapter-continuation-register-20261027b.json']:
    p = ROOT / 'integration' / name
    before = p.read_bytes(); d = json.loads(before); orig = copy.deepcopy(d)
    row = next(r for r in d['rows'] if r['chapterId'] == CID)
    prior_row = copy.deepcopy(row)
    row['b0168TargetRegistration'] = {**reg_ref, 'candidateSha256': h['candidate']['sha256'], 'targetPassed': True, 'chapterAccepted': False, 'newModelCallsThisRun': 0}
    row.get('closurePlan', row)['nextAction'] = 'b0168新候选b2417de1唯一目标首审3bbbff33已passed，原aggregate仍needs-repair。制作/首审真实生产链与同冻结两验证入口已复验，不将wrapper exit1视transport失败；2/2余0、0retry，不再派b0168。原16条deferred/113passed完整保留；旧dea1ba24六表66图+6表补证按原SHA独立登记，不覆盖新旧分支或伪整章pass。250已登记，无新consumer/preview/active变更。其余精确问题沿既有票继续，先查Q8等在途收据，不借本批额度。'
    assert [r for r in d['rows'] if r['chapterId'] != CID] == [r for r in orig['rows'] if r['chapterId'] != CID]
    assert {k:v for k,v in d.items() if k != 'rows'} == {k:v for k,v in orig.items() if k != 'rows'}
    temp = copy.deepcopy(row);temp.pop('b0168TargetRegistration')
    temp.get('closurePlan', temp)['nextAction'] = prior_row.get('closurePlan', prior_row)['nextAction']
    assert temp == prior_row
    assert p.read_bytes() == before
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    row_checks.append({'path': str(p), 'beforeSha256': sha(before), 'afterSha256': sha(p.read_bytes()),
        'onlyChangedChapterId': CID, 'historicalFieldsAndOtherRowsUnchanged': True})
    save('register-row-' + name, {'before': prior_row, 'after': row})
save('register-change-verification.json', {'newCalls': 0, 'checks': row_checks})
for item in v['protectedFiles']:
    assert sha(Path(item['path']).read_bytes()) == item['sha256']
SHARED.mkdir(parents=True, exist_ok=True)
for p in OUT.iterdir():
    if p.suffix in ['.json', '.mjs', '.py']:
        shutil.copyfile(p, SHARED / p.name)
with zipfile.ZipFile(OUT / 'b0168-target-registration-evidence.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.json', '.mjs', '.py']:
            z.write(p, p.name)
print(json.dumps({'registration': reg_ref, 'newCalls': 0, 'originalDeferred': 16, 'checks': len(v['checks']), 'chapterAccepted': False}, ensure_ascii=False))
