"""Bounded zero-call re-check of the six 283-1 table-position findings.

It assembles the exact input a reviewer would need (candidate figure tableContext)
and proves block-by-block that every affected figure block already equals its bound
source tableContext. It does not re-audit any group, does not modify any raw or
receipt and does not change any verdict.
"""
import json, hashlib, os
from datetime import datetime, timezone

root = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(root, r)
sha = lambda b: hashlib.sha256(b).hexdigest()

cand_rel = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json'
src_rel = 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'
cand_bytes = open(P(cand_rel), 'rb').read()
src_bytes = open(P(src_rel), 'rb').read()
c = json.loads(cand_bytes)
s = json.loads(src_bytes)
byid = {b['id']: b for b in s['blocks']}
blocks = c['body']['blocks']


def find(bid):
    return next(b for b in blocks if (b.get('sourceBlockIds') or [None])[0] == bid)


tables = {t['tableId']: t for t in s['tables']}
findings = [
    dict(findingId='table-position:batch-003:div179table3', batchId='chapter06-exercise003-batch-003',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:table:main/div[179]/table[3]',
         reviewClaim='the eight figure blocks omit table position and there is no alternative table structure'),
    dict(findingId='table-position:batch-003:div189table21', batchId='chapter06-exercise003-batch-003',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:table:main/div[189]/table[21]',
         reviewClaim='the eight figure blocks omit table position; the 3s keeps no row 1 column 2 position against the arrow above'),
    dict(findingId='table-position:batch-003:div209table21', batchId='chapter06-exercise003-batch-003',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:table:main/div[209]/table[21]',
         reviewClaim='the twelve figure blocks omit table position and no complete table structure carries the seat and three discard columns'),
    dict(findingId='table-position:batch-005:b0502', batchId='chapter06-exercise003-batch-005',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:b0502',
         reviewClaim='the twenty-three river figure blocks have no table cell position'),
    dict(findingId='table-position:batch-006:div395table29', batchId='chapter06-exercise003-batch-006',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:table:main/div[395]/table[29]',
         reviewClaim='the twenty-seven discard figure blocks lack tableContext and there is no candidate table structure'),
    dict(findingId='table-position:batch-008:div505table23', batchId='chapter06-exercise003-batch-008',
         reviewTargetId='modern-yabejp-ja:chapter06-exercise003:table:main/div[505]/table[23]',
         reviewClaim='the sixteen discard cells became figures without tableContext, so the seat/river table relation is not represented'),
]
out = []
for f in findings:
    tgt = f['reviewTargetId']
    if tgt.startswith('modern-yabejp-ja:chapter06-exercise003:b'):
        tid = find(tgt)['tableContext']['tableId']
    else:
        tid = tgt
    figs = [b for b in blocks if b.get('type') == 'figure' and (b.get('tableContext') or {}).get('tableId') == tid]
    recs = []
    for b in figs:
        sid = (b.get('sourceBlockIds') or [None])[0]
        st = byid[sid].get('tableContext')
        recs.append(dict(sourceBlockId=sid, figureId=b.get('figureId'),
                         candidateTableContext=b.get('tableContext'), sourceTableContext=st,
                         candidateEqualsSource=json.dumps(b.get('tableContext'), sort_keys=True) == json.dumps(st, sort_keys=True),
                         transcriptionUnchangedForThisCheck=True))
    t = tables[tid]
    cells = [cell for row in t['rows'] for cell in row['cells']]
    out.append({**f, 'tableId': tid, 'figureBlocks': len(figs),
                'allCandidateContextsEqualSource': all(r['candidateEqualsSource'] for r in recs),
                'sourceTable': {'domPath': t.get('domPath'), 'rows': len(t['rows']), 'cells': len(cells),
                                'emptyCells': sum(1 for x in cells if x.get('empty')),
                                'headerCells': sum(1 for x in cells if x.get('header')),
                                'spans': sorted({(x.get('rowspan'), x.get('colspan')) for x in cells}),
                                'tableId': t.get('tableId')},
                'blocks': recs})

delta = [{'sourceBlockId': (b.get('sourceBlockIds') or [None])[0], 'figureId': b.get('figureId'),
          'tableContext': b.get('tableContext')}
         for b in blocks if b.get('type') == 'figure' and b.get('tableContext')]

cand_sha = sha(cand_bytes)
doc = dict(
    schema='coac-web-table-context-limited-recheck/1',
    recordedAt=datetime.now(timezone.utc).isoformat(),
    articleId='chapter06-exercise003', chapterId='nemata-jp-chapter-283-1',
    candidate=dict(path=cand_rel, sha256=cand_sha, unchangedByThisCheck=True),
    source=dict(path=src_rel, sha256=sha(src_bytes)),
    modelCalls=0, productionCalls=0, auditCalls=0,
    scope=dict(
        what='bounded re-check of the six table-position findings only, by assembling the real input a reviewer would need; no group re-audited, no raw modified, no verdict changed',
        notInScope=['the eight content errors', 'the three uncertain items', 'the one passed group (batch-010)',
                    'every content-faithful block of the article'],
        notCleared='the six findings keep their needs-repair status and the affected groups keep theirs until a review that is actually shown the candidate figure tableContext re-decides them'),
    whatTheReviewSaw=dict(
        function='webSemanticProjection (textbook-audit-web.mjs) candidate branch',
        candidateTextBlocks='type, sourceBlockIds, paragraphId, text (+ sourceSegments, tableContext when includeTargetMarks)',
        candidateFigureBlocks='type, sourceBlockIds, paragraphId, figureId only',
        sourceSide='every source block carries tableContext and source.tables is included',
        consequence='the reviewer could not see the table cell coordinates that the candidate actually holds'),
    projectionDelta=dict(
        change='add tableContext to the candidate non-text (figure) block projection',
        addedField='tableContext', affectedFigureBlocks=len(delta), sourceTables=len(s['tables']),
        blocks=delta),
    findings=out,
    totals=dict(findings=len(out), figureBlocks=sum(x['figureBlocks'] for x in out),
                candidateEqualSource=sum(x['figureBlocks'] for x in out if x['allCandidateContextsEqualSource']),
                candidateDifferent=sum(x['figureBlocks'] for x in out if not x['allCandidateContextsEqualSource'])),
    evidenceChain=dict(
        priorEvidence='audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json',
        deterministicGate='web_paragraph_table_binding enforces candidate tableContext == source tableContext on every block at audit time',
        receiptsUntouched='the eleven batch receipts, their raw calls and checkpoints are preserved as the record of the run that lacked this projection',
        reReviewRequirement='the re-review must bind the same candidate SHA ' + cand_sha + ' and the patched runtime SHA; it can then re-decide these six findings with the tableContext above'),
)
p = 'audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-limited-recheck-20261027.json'
b = (json.dumps(doc, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
os.makedirs(os.path.dirname(P(p)), exist_ok=True)
open(P(p), 'wb').write(b)
print(p, sha(b), len(b))
print(json.dumps(doc['totals'], ensure_ascii=False))
for x in out:
    print(x['findingId'], x['figureBlocks'], x['allCandidateContextsEqualSource'],
          x['sourceTable']['rows'], x['sourceTable']['cells'], x['sourceTable']['emptyCells'])
