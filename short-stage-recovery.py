"""Bounded offline recovery receipt; never calls models or writes shared artifacts."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path('short-stage-recovery')
OUT.mkdir(exist_ok=True)
basis = json.loads((OUT / 'remaining-31-basis.json').read_text(encoding='utf-8'))

def load(path):
    raw = (ROOT / path).read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()

def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

rows = []
for row in basis['rows']:
    notes = row.get('notes')
    item = {k: row.get(k) for k in ('chapterId', 'category', 'parent', 'source', 'existingEntryResult')}
    if notes:
        audit, audit_hash = load(notes['path'])
        review = audit.get('modelReview') or {}
        item.update(auditPath=notes['path'], auditFileSha256=audit_hash,
                    issues=review.get('issues', []),
                    semanticCompleteness=audit.get('semanticCompleteness'),
                    modelChecks=audit.get('modelChecks'),
                    independentSource=audit.get('independentSource'))
    rows.append(item)
save('remaining-31-actionable-evidence.json', {'basis': basis['basis'], 'coverageRecomputed': False,
     'modelCalls': 0, 'rows': rows})

# Only two exact text replacements already proposed by their independent audits.
# A patch is prepared against immutable parents; no new model provenance or pass is invented.
targets = [
    ('79-cn-chapter-155-4', '79-bilibili-cn:cv1751265:b0008', '大丈夫だ，問題ない！', '没关系，没问题！'),
    ('nemata-jp-chapter-347-1', 'modern-yabejp-ja:archive01-section008:b0066',
     '相关牌在场上的安全程度', '相关花色在场上是否便宜（较少被他家使用）'),
]
patches = []
for chapter, target, old, new in targets:
    row = next(r for r in basis['rows'] if r['chapterId'] == chapter)
    parent, parent_hash = load(row['parent']['path'])
    assert row['parent']['sha256'] in (parent_hash, parent.get('candidateSha256'))
    audit, audit_hash = load(row['notes']['path'])
    issue = next(i for i in audit['modelReview']['issues'] if i.get('targetId') == target)
    assert new in issue['suggestedRepair']
    matches = [(i, b) for i, b in enumerate(parent['body']['blocks']) if target in b.get('sourceBlockIds', [])]
    assert len(matches) == 1
    index, block = matches[0]
    assert block['text'].count(old) == 1
    after = block['text'].replace(old, new)
    local = copy.deepcopy(parent)
    local['body']['blocks'][index]['text'] = after
    undo = copy.deepcopy(local)
    undo['body']['blocks'][index]['text'] = block['text']
    assert undo == parent
    assert local['figures'] == parent['figures']
    patches.append({'chapterId': chapter, 'targetId': target, 'parentPath': row['parent']['path'],
                    'parentFileSha256': parent_hash, 'parentCandidateSha256': parent.get('candidateSha256'),
                    'source': row['source'], 'auditPath': row['notes']['path'], 'auditFileSha256': audit_hash,
                    'auditIssue': issue, 'operations': [
                        {'op': 'test', 'path': f'/body/blocks/{index}/text', 'value': block['text']},
                        {'op': 'replace', 'path': f'/body/blocks/{index}/text', 'value': after}],
                    'verified': {'exactOneReplacement': True, 'allOtherFieldsUnchanged': True,
                                 'figuresAndSourceSegmentsUnchanged': True},
                    'state': 'prepared-exact-patch-not-production-or-independent-pass',
                    'entryConstraint': row['existingEntryResult']})
save('text-155-347-exact-patches.json', {'modelCalls': 0, 'newCandidates': 0, 'patches': patches,
    'applicationRule': 'Do not forge producer provenance. 155 remains blocked by the existing verbatim gate; owner must authorize the exact translation exception before applying through the supported entry. 347 needs an admitted revision mechanism and same-SHA audit. Existing passed receipts do not apply to a changed SHA.'})

# Six reported table omissions: compare the existing parent with its exact bound DOM.
row = next(r for r in basis['rows'] if r['chapterId'] == 'nemata-jp-chapter-283-1')
parent, parent_hash = load(row['parent']['path'])
source, source_hash = load(row['source']['path'])
assert row['parent']['sha256'] in (parent_hash, parent.get('candidateSha256'))
assert row['source']['sha256'] in (source_hash, source.get('sourceSha256'))
ranges = [(266, 267), (269, 270), (272, 273), (275, 276),
          (292, 293), (295, 296), (298, 299), (301, 302),
          (325, 327), (329, 331), (333, 335), (337, 339),
          (507, 512), (516, 521), (526, 530), (536, 541),
          (627, 633), (635, 641), (643, 649), (651, 656),
          (811, 814), (816, 819), (821, 824), (826, 829)]
checks = []
for start, stop in ranges:
    for number in range(start, stop + 1):
        block_id = f'modern-yabejp-ja:chapter06-exercise003:b{number:04d}'
        sb = next(b for b in source['blocks'] if b['id'] == block_id)
        pb = next(b for b in parent['body']['blocks'] if block_id in b.get('sourceBlockIds', []))
        checks.append({'blockId': block_id, 'source': sb.get('tableContext'),
                       'candidate': pb.get('tableContext'),
                       'equal': bool(sb.get('tableContext')) and sb.get('tableContext') == pb.get('tableContext')})
assert len(checks) == 94
save('283-existing-table-context-check.json', {'chapterId': row['chapterId'],
    'parent': row['parent'], 'parentFileSha256': parent_hash,
    'source': row['source'], 'sourceFileSha256': source_hash,
    'modelCalls': 0, 'checkedCells': len(checks), 'allEqual': all(c['equal'] for c in checks),
    'checks': checks, 'candidateChanged': False,
    'scope': 'Only refutes the literal claim that these 94 candidate body blocks lack tableContext. Does not certify rendering of empty cells, arrows, visual tile semantics, translations, or the complete chapter. Keep the original audit and other blockers.'})
print(json.dumps({'modelCalls': 0, 'newCandidates': 0, 'preparedTextPatches': len(patches),
                  'tableCellsChecked': len(checks), 'tableContextsAlreadyPresentAndEqual': sum(c['equal'] for c in checks)}, ensure_ascii=False))
