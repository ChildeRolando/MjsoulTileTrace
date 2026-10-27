import copy
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
SHARED = ROOT / 'integration/coac244-283-convergence-20261028'
CID = 'nemata-jp-chapter-283-1'


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def ref(name):
    return {'path': str(SHARED / name), 'sha256': sha(OUT / name)}


def save(name, d):
    (OUT / name).write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


reg, issue = read(OUT / 'registration.json'), read(OUT / 'effective-issue-register.json')
resolved = [i for i in issue['issues'] if i['status'].startswith('resolved')]
blocking = [i['originalIssue'] for i in issue['issues'] if i['status'] == 'open' and i['category'] != 'source-note']
notes = [i['originalIssue'] for i in issue['issues'] if i['category'] == 'source-note']
assert len(resolved) == 7 and len(blocking) == 10 and len(notes) == 2
action = '最新b2417de1的1194未改块/524图及137表块/94表图上下文hash继承已证。独立补充证明e4c53883依法复用旧六表审，6条几何问题移入resolved并逐条挂证；b0168 checkpoint通过另闭合1条。原19问题现7resolved、10有效阻断、2source-note；原16deferred有效对照6resolved/10open，旧回执/deferred字节不改。Q8由249既有在途；不重复表/0168/113passed。下一零调用预检目标b0396(裏目)及b0962(メンタンピン)，各仅1段/完整题解/原图序/tableContext，建议未来每项maker1+首审1总4，尚未授权、不借旧额度。整章不pass、不preview/active切换。'
checks = []
for name in ['coac244-remaining26-closure-register-20261028.json', 'coac250-uncovered-chapter-continuation-register-20261027b.json']:
    path = ROOT / 'integration' / name
    before = path.read_bytes(); data = json.loads(before); original = copy.deepcopy(data)
    row = next(r for r in data['rows'] if r['chapterId'] == CID)
    before_row = copy.deepcopy(row)
    if 'blockingIssues' in row:
        row['historicalBlockingIssuesBeforeConvergence'] = copy.deepcopy(row['blockingIssues'])
        row['blockingIssues'] = blocking
        row['sourceNotes'] = notes
    plan = row.get('closurePlan', row)
    plan['nextAction'] = action
    plan['effectiveBlockingIssues'] = blocking
    plan['sourceNotesPreserved'] = notes
    plan['resolvedIssuesWithEvidence'] = resolved
    plan['effectiveDeferredFindings'] = issue['deferred']
    row['evidenceConvergence'] = {**ref('registration.json'), 'effectiveIssueRegister': ref('effective-issue-register.json'),
        'tableSupplement': ref('table-reuse-supplement.json'), 'candidateSha256': reg['candidate']['sha256'],
        'counts': issue['counts'], 'chapterAccepted': False, 'newModelCalls': 0}
    assert [r for r in data['rows'] if r['chapterId'] != CID] == [r for r in original['rows'] if r['chapterId'] != CID]
    assert {k:v for k,v in data.items() if k != 'rows'} == {k:v for k,v in original.items() if k != 'rows'}
    assert row.get('covered') == before_row.get('covered')
    assert path.read_bytes() == before
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    save('row-change-' + name, {'before': before_row, 'after': row})
    checks.append({'path': str(path), 'onlyChangedCanonical': CID, 'allOtherRowsAndMetadataUnchanged': True,
        'beforeSha256': hashlib.sha256(before).hexdigest(), 'afterSha256': sha(path), 'coveredChanged': False})
save('register-change-verification.json', {'changes': checks, 'wholeChapterAccepted': False, 'newModelCalls': 0})
for f in read(OUT / 'verification.json')['protectedFiles']:
    assert sha(f['path']) == f['sha256']
for p in OUT.iterdir():
    if p.suffix in ['.json', '.mjs', '.py']:
        shutil.copyfile(p, SHARED / p.name)
with zipfile.ZipFile(OUT / '283-convergence-evidence.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for p in OUT.iterdir():
        if p.suffix in ['.json', '.mjs', '.py']:
            z.write(p, p.name)
print(json.dumps({'effectiveBlocking': len(blocking), 'resolved': len(resolved), 'notes': len(notes),
    'registersUpdated': 2, 'newCalls': 0, 'registration': ref('registration.json')}, ensure_ascii=False))
