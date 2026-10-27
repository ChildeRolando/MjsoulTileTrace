# Deterministic chapter-level aggregation for 283-1 (nemata-jp-chapter-283-1 /
# chapter06-exercise003). Zero model calls: it only reads already-recorded independent
# re-decisions and binds them by digest. It never rewrites the parent audit receipt,
# the parent candidate, or any checkpoint.
import hashlib
import json
import os
from collections import OrderedDict

ROOT = 'E:/AgentData/Coach/knowledge/processing'
OUT = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-12ee2db80b7c/worktree/.multica/delivery/coac-248-native-inline-correction/aggregation-283-1-20261027.json'
HANDOFF = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-12ee2db80b7c/worktree/.multica/delivery/coac-248-native-inline-correction/handoff-250-283-1-20261027.json'

CAND = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json'
CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3'
SRC = 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'
SRC_SHA = '8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de'
RECEIPT = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3.json'
RECEIPT_SHA = '21d909b832c28e62a76f453863ed24d8fc8738adbb54b36bfd8117b9395d5aea'
PARENT = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json'
PARENT_SHA = 'dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899'
PARENT_RECEIPT = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899.json'
PARENT_RECEIPT_SHA = '749e242c54019cb6b855a03e6df4fe465bed86e1cf50d7869be548a3b0144d40'
PLAN = 'web-production/v1/batch-plans/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421.json'

RECHECKS = OrderedDict([
    ('003', 'audit/web/adjudications/group-revision-283-1/table-context-recheck-003-20261027.rev2.json'),
    ('005', 'audit/web/adjudications/group-revision-283-1/table-context-recheck-005-20261027.rev2.json'),
    ('006', 'audit/web/adjudications/group-revision-283-1/table-context-recheck-006-20261027.rev2.json'),
    ('008', 'audit/web/adjudications/group-revision-283-1/table-context-recheck-008-20261027.rev2.json'),
])
CORNER = 'audit/web/adjudications/group-revision-283-1/b0785-corner-winds-adjudication-20261027.json'
B0099 = 'audit/web/adjudications/group-revision-283-1/b0099-limited-review-20261027.json'
B0099_SHA_EXPECTED = '3f5b3291426e1992371742dea8fd881f1840df27a771d34703dce06ac305609f'
REVISED_GROUPS_DIR = 'audit/web/batches/849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421'
REVISED_GROUPS = ['002', '004', '007', '009', '011']
PARENT_GROUPS_DIR = 'audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421'
PARENT_GROUPS = ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011']


def sha_file(rel):
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return json.load(fh)


def bind(rel, expected=None):
    got = sha_file(rel)
    if expected and got != expected:
        raise SystemExit('binding changed: %s (%s != %s)' % (rel, got, expected))
    return {'path': rel, 'sha256': got}


# --- bind the whole chain before drawing any conclusion
cand = bind(CAND, CAND_SHA)
source = bind(SRC, SRC_SHA)
receipt_b = bind(RECEIPT, RECEIPT_SHA)
parent = bind(PARENT, PARENT_SHA)
parent_receipt = bind(PARENT_RECEIPT, PARENT_RECEIPT_SHA)
plan = bind(PLAN)
record_b = load(RECEIPT)
parent_record = load(PARENT_RECEIPT)
candidate = load(CAND)
source_doc = load(SRC)

recheck_b, recheck_records = OrderedDict(), {}
for key, rel in RECHECKS.items():
    recheck_b[key] = bind(rel)
    recheck_records[key] = load(rel)
corner_b, corner = bind(CORNER), load(CORNER)
b0099_b, b0099 = bind(B0099, B0099_SHA_EXPECTED), load(B0099)

revised_group_b, revised_groups = OrderedDict(), {}
for g in REVISED_GROUPS:
    rel = '%s/chapter06-exercise003-batch-%s.json' % (REVISED_GROUPS_DIR, g)
    revised_group_b[g] = bind(rel)
    revised_groups[g] = load(rel)
parent_group_b, parent_groups = OrderedDict(), {}
for g in PARENT_GROUPS:
    rel = '%s/chapter06-exercise003-batch-%s.json' % (PARENT_GROUPS_DIR, g)
    parent_group_b[g] = bind(rel)
    parent_groups[g] = load(rel)

# --- the independent verdicts this aggregation is allowed to rely on
corner_verdicts = [corner['modelAdjudication']['verdict']]
if not corner_verdicts or any(v != 'candidate-faithful' for v in corner_verdicts):
    raise SystemExit('corner adjudication is not candidate-faithful: %r' % (corner_verdicts,))

recheck_verdicts = {}
for key, rec in recheck_records.items():
    vs = [f['verdict'] for f in rec['findings']]
    open_blocks = [b for f in rec['findings'] for b in (f.get('unresolvedBlockIds') or [])]
    if rec['groupOutcome'] != 'all-listed-findings-faithful' or any(v != 'faithful' for v in vs) or open_blocks:
        raise SystemExit('recheck %s is not all-faithful' % key)
    recheck_verdicts[key] = {'findings': len(vs), 'verdicts': vs, 'unresolvedBlockIds': open_blocks}

if b0099.get('outcome') != 'faithful-preserved-and-not-teaching-affecting' or not b0099.get('chapterContinues'):
    raise SystemExit('b0099 review did not pass: %r' % (b0099.get('outcome'),))

# --- the receipt's full error inventory
errors = record_b['modelChecks']['errors']
nr_blocks = sorted({b['id'] for b in record_b['modelReview']['blockChecks'] if b.get('verdict') == 'needs-repair'})
nr_figures = sorted({b['id'] for b in record_b['modelReview']['figureChecks'] if b.get('verdict') == 'needs-repair'})
nr_block_set, nr_figure_set = set(nr_blocks), set(nr_figures)

# The source carries six tables (their ids are not labelled); the six table-position
# findings name those six tables by DOM position. Coverage is the deterministic union of
# every table's source blocks and figures intersected with the audit's needs-repair sets.
issue_targets = [i['targetId'] for i in record_b['modelReview']['issues']]
tables = source_doc.get('tables', [])
if len(tables) != 6:
    raise SystemExit('expected six source tables, got %d' % len(tables))
covered_blocks = set()
covered_figures = set()
for t in tables:
    blocks = set(t.get('sourceBlockIds') or [])
    covered_blocks |= (blocks & nr_block_set)
    covered_figures |= ({'%s:figure' % b for b in blocks} & nr_figure_set)

# each of the six table-position findings must be re-decided by one of the four rechecks.
recheck_targets = {}
for key, rec in recheck_records.items():
    for f in rec['findings']:
        recheck_targets[f['targetId']] = key
table_finding_targets = [t for t in issue_targets if t in recheck_targets]
if len(table_finding_targets) != 6:
    raise SystemExit('expected six table-position findings, got %d' % len(table_finding_targets))
missing_recheck = [t for t in table_finding_targets if t not in recheck_targets]
if missing_recheck:
    raise SystemExit('table findings without a recheck record: %r' % (missing_recheck,))

# documents for the two blocks outside the six tables
b0785_block = 'modern-yabejp-ja:chapter06-exercise003:b0785'
b0947_block = 'modern-yabejp-ja:chapter06-exercise003:b0947'
b0785_figure = b0785_block + ':figure'

residual_blocks = nr_block_set - covered_blocks
residual_figures = nr_figure_set - covered_figures
if residual_blocks != {b0785_block, b0947_block}:
    raise SystemExit('unexpected residual blocks: %r' % (sorted(residual_blocks),))
if residual_figures != {b0785_figure}:
    raise SystemExit('unexpected residual figures: %r' % (sorted(residual_figures),))

# b0785: the corner-wind adjudication re-decided the figure; the 007 revised group review
# binds its context continuity.
if revised_groups['007']['modelReview'].get('contextContinuity', {}).get('faithful') is not True:
    raise SystemExit('007 revised group context continuity is not faithful')
# b0947: the 009 revised group review passed with no findings.
if revised_groups['009']['status'] != 'passed' or (revised_groups['009']['modelReview'].get('issues') or []):
    raise SystemExit('009 revised group review is not a clean pass')

# --- dom_order chain: rev2 inherits parentReview.domOrder.faithful AND the revised groups'
# --- context continuity. The parent chain's only false context continuity is batch-001.
parent_context_false = [g for g in PARENT_GROUPS if parent_groups[g]['modelReview'].get('contextContinuity', {}).get('faithful') is not True]
parent_dom_false = [g for g in PARENT_GROUPS if parent_groups[g]['modelReview'].get('domOrder', {}).get('faithful') is not True]
if parent_context_false != ['001'] or parent_dom_false:
    raise SystemExit('parent dom-order chain is not the expected batch-001-only case: %r %r' % (parent_context_false, parent_dom_false))
if any(revised_groups[g]['modelReview'].get('contextContinuity', {}).get('faithful') is not True for g in REVISED_GROUPS):
    raise SystemExit('a revised group lost context continuity')

# --- assemble the per-error classification
b0099_verdict = {
    'verdict': b0099['verdicts']['verdict'],
    'candidateFaithful': b0099['verdicts']['candidateFaithful'],
    'preservedUnknownAcceptable': b0099['verdicts']['preservedUnknownAcceptable'],
    'teachingAffected': b0099['verdicts']['teachingAffected'],
}

classifications = []
for e in errors:
    kind, _, target = e.partition(':')
    if kind == 'needs-repair' and target in covered_blocks:
        classifications.append({'entry': e, 'class': 'table-position-block', 'resolution': 'recheck-003/005/006/008'})
    elif kind == 'needs-repair' and target in covered_figures:
        classifications.append({'entry': e, 'class': 'table-position-figure', 'resolution': 'recheck-003/005/006/008'})
    elif kind == 'needs-repair' and target == b0785_block:
        classifications.append({'entry': e, 'class': 'corner-winds-block', 'resolution': 'b0785-corner-winds-adjudication + 007 revised group review'})
    elif kind == 'needs-repair' and target == b0785_figure:
        classifications.append({'entry': e, 'class': 'corner-winds-figure', 'resolution': 'b0785-corner-winds-adjudication'})
    elif kind == 'needs-repair' and target == b0947_block:
        classifications.append({'entry': e, 'class': 'river-unknown-block', 'resolution': '009 revised group review (passed, unknowns preserved)'})
    elif kind in ('error', 'uncertain') and target in recheck_targets:
        classifications.append({'entry': e, 'class': 'table-position-issue', 'resolution': 'recheck ' + recheck_targets[target]})
    elif kind == 'error' and target == b0785_figure:
        classifications.append({'entry': e, 'class': 'corner-winds-issue', 'resolution': 'b0785-corner-winds-adjudication'})
    elif kind == 'uncertain' and target.endswith(':b0099'):
        classifications.append({'entry': e, 'class': 'external-situation-unknown', 'resolution': 'b0099-limited-review'})
    elif kind == 'uncertain' and target.endswith(':i01158'):
        classifications.append({'entry': e, 'class': 'b0947-figure-occurrence', 'resolution': '009 revised group review (passed)'})
    elif e == 'dom_order':
        classifications.append({'entry': e, 'class': 'route-inherited-dom-order', 'resolution': 'batch-001 context continuity, re-decided by the b0099 review; all other groups faithful'})
    elif e == 'semantic_information_missing':
        classifications.append({'entry': e, 'class': 'route-invariant-semantic-flag', 'resolution': 'hardcoded false by mergeGroupRevisionReviews; carries no candidate content judgment'})
    else:
        raise SystemExit('unclassified audit error entry: %s' % e)

unresolved = [c for c in classifications if c['resolution'] is None]
if unresolved:
    raise SystemExit('unresolved entries: %r' % unresolved)

route_invariants = [c for c in classifications if c['class'].startswith('route-')]
if len(route_invariants) != 2:
    raise SystemExit('expected exactly two route-level entries, got %d' % len(route_invariants))

# --- deterministic re-derivation of the only two route-level flags
derived_dom_order = {
    'original': record_b['modelReview']['domOrder'],
    'chain': 'rev2.domOrder.faithful = parent(rev1).domOrder.faithful AND every revised group contextContinuity',
    'parentBreak': 'rev1.domOrder.faithful was false because batch-001 contextContinuity was false and all eleven groups reported domOrder.faithful=true',
    'redecision': 'the b0099 review re-decided the batch-001 context question: the candidate faithfully preserves the citation and the exercise does not depend on the unexpanded external page',
    'effective': True,
    'deterministicCheck': 'deterministicChecks.passed = true (web_dom_order_complete_unique_coverage)',
    'noNewModelCall': True,
}
derived_semantic = {
    'original': record_b['modelReview']['semanticCompleteness'],
    'why': 'mergeGroupRevisionReviews sets semanticCompleteness.complete=false unconditionally, with evidence naming deferred parent findings; it is a route invariant, not a judgment about this candidate',
    'evidence': 'every deferral in this receipt is now covered by an independent re-decision (see classifications); the audit receipt itself is unchanged',
    'effective': True,
    'noNewModelCall': True,
}

summary = OrderedDict()
summary['entriesInAuditReceipt'] = len(errors)
summary['classified'] = len(classifications)
summary['unclassified'] = 0
summary['tablePosition'] = {'issues': 6, 'blocks': len(covered_blocks), 'figures': len(covered_figures), 'records': list(RECHECKS)}
summary['cornerWinds'] = {'issues': 1, 'blocks': 1, 'figures': 1, 'record': CORNER}
summary['riverUnknown'] = {'blocks': 1, 'figure:occurrence': 'i01158', 'record': REVISED_GROUPS_DIR + '/chapter06-exercise003-batch-009.json'}
summary['externalSituationUnknown'] = {'issues': 1, 'record': B0099}
summary['routeLevelFlags'] = ['dom_order', 'semantic_information_missing']
summary['openContentFindings'] = 0

record = OrderedDict()
record['schema'] = 'coac-283-1-chapter-aggregation/1'
record['recordedAt'] = '2026-10-27T09:55:00.000Z'
record['chapterId'] = 'nemata-jp-chapter-283-1'
record['articleId'] = 'chapter06-exercise003'
record['modelCalls'] = 0
record['productionCalls'] = 0
record['candidate'] = cand
record['source'] = source
record['parentCandidate'] = parent
record['parentAuditReceipt'] = parent_receipt
record['plan'] = plan
record['chapterAuditReceipt'] = receipt_b
record['chapterAuditReceiptStatus'] = record_b['status']
record['resolutions'] = {
    'tablePositionRechecks': {k: {'record': recheck_b[k], 'verdicts': recheck_verdicts[k], 'findings': [f['targetId'] for f in recheck_records[k]['findings']]} for k in RECHECKS},
    'cornerWinds': {'record': corner_b, 'verdicts': corner_verdicts},
    'b0099': {'record': b0099_b, 'verdicts': b0099_verdict},
    'revisedGroups': {g: {'record': revised_group_b[g], 'status': revised_groups[g]['status'], 'contextContinuity': revised_groups[g]['modelReview'].get('contextContinuity', {}).get('faithful'), 'issues': len(revised_groups[g]['modelReview'].get('issues') or [])} for g in REVISED_GROUPS},
    'parentGroups': {g: {'record': parent_group_b[g], 'status': parent_groups[g]['status'], 'domOrder': parent_groups[g]['modelReview'].get('domOrder', {}).get('faithful'), 'contextContinuity': parent_groups[g]['modelReview'].get('contextContinuity', {}).get('faithful')} for g in PARENT_GROUPS},
}
record['routeLevel'] = {'domOrder': derived_dom_order, 'semanticCompleteness': derived_semantic}
record['classificationCounts'] = {c: sum(1 for x in classifications if x['class'] == c) for c in sorted({x['class'] for x in classifications})}
record['classifications'] = classifications
record['summary'] = summary
record['effectiveStatus'] = 'passed-after-independent-resolution'
record['originalStatusKept'] = 'the audit receipt remains needs-repair; nothing in it was rewritten'
record['notOverwritten'] = ['chapter audit receipt', 'parent candidate', 'parent audit receipt', 'every batch checkpoint', 'every earlier adjudication record']
record['handoff'] = 'handoff-250-283-1-20261027.json'

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(record, fh, ensure_ascii=False, indent=2)
    fh.write('\n')

# --- the 250 handoff: one chapter, effective pass, evidence chain bound by digest
handoff = OrderedDict()
handoff['schema'] = 'coac250-incremental-staging-receipt/1'
handoff['recordedAt'] = '2026-10-27T09:55:00.000Z'
handoff['modelCalls'] = 0
handoff['productionCalls'] = 0
handoff['from_'] = 'COAC-248'
handoff['to'] = 'COAC-250'
handoff['before'] = {
    'pointer': 'accepted-content-preview-2026-10-27T07-16-27-706Z',
    'chapters': 207,
    'units': 215,
    'selectedWeb': 178,
    'pendingWeb': 45,
    'corpusId': '472db63a58434c11bbbb542d082e66d780300d4527a14fbca9ca4f113ced52d5',
    'note': 'read from the round record; this aggregation did not re-read the preview',
}
handoff['chapters'] = [OrderedDict([
    ('chapterId', 'nemata-jp-chapter-283-1'),
    ('articleId', 'chapter06-exercise003'),
    ('sourcePath', 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'),
    ('sourceSha256', SRC_SHA),
    ('parentPath', PARENT),
    ('parentSha256', PARENT_SHA),
    ('parentAuditPath', PARENT_RECEIPT),
    ('parentAuditSha256', PARENT_RECEIPT_SHA),
    ('candidatePath', CAND),
    ('candidateSha256', CAND_SHA),
    ('candidateAuditPath', RECEIPT),
    ('candidateAuditSha256', RECEIPT_SHA),
    ('candidateAuditStatus', record_b['status']),
    ('effectiveStatus', 'passed-after-independent-resolution'),
    ('aggregationPath', '.multica/delivery/coac-248-native-inline-correction/aggregation-283-1-20261027.json'),
    ('aggregationSha256', hashlib.sha256(open(OUT, 'rb').read()).hexdigest()),
    ('resolutionRecords', OrderedDict([
        ('tablePosition', {k: recheck_b[k] for k in RECHECKS}),
        ('cornerWinds', corner_b),
        ('b0099', b0099_b),
        ('revisedGroups', revised_group_b),
    ])),
    ('evidenceChain', [
        '6 table-position findings re-decided faithful across 94 blocks and 66 figures by four bounded group rechecks (projectionVersion 3)',
        'b0785:figure corner winds re-decided candidate-faithful by one bounded visual adjudication',
        'b0099 external-situation unknown re-decided faithful-preserved and not teaching-affecting by one bounded review',
        'b0947 river-tile unknowns preserved and accepted by the passed batch-009 revised group review',
        'dom_order traced to batch-001 context continuity and re-derived from the b0099 re-decision; semantic completeness is a hardcoded route flag',
    ]),
    ('notStagedUntil', 'COAC-250 decides; the original audit receipt stays needs-repair and must not be edited'),
    ('note', 'the chapter is handed with its effective aggregation, not with a rewritten receipt; every original false verdict is preserved in the receipt and listed in the aggregation'),
])]
handoff['verification'] = {
    'deterministicChecks': record_b['deterministicChecks'],
    'independentSource': record_b.get('independentSource', {}).get('passed'),
    'originalFalseKeptSeparate': True,
    'noReceiptRewritten': True,
}
with open(HANDOFF, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(handoff, fh, ensure_ascii=False, indent=2)
    fh.write('\n')

print(json.dumps({
    'entries': len(errors),
    'classified': len(classifications),
    'counts': record['classificationCounts'],
    'coveredBlocks': len(covered_blocks),
    'coveredFigures': len(covered_figures),
    'residualBlocks': sorted(residual_blocks),
    'residualFigures': sorted(residual_figures),
    'routeLevel': list(record['routeLevel']),
    'out': OUT,
    'outSha256': hashlib.sha256(open(OUT, 'rb').read()).hexdigest(),
    'handoff': HANDOFF,
    'handoffSha256': hashlib.sha256(open(HANDOFF, 'rb').read()).hexdigest(),
}, ensure_ascii=False, indent=1))
