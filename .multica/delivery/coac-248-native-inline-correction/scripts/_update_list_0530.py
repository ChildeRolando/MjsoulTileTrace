"""Update the unified repair list for round 2026-10-27T05:15-05:35Z.

Marks 227-1 and 246-1 resolved-passed, records the 250 handoff receipt for
211-1/173-1, and files the 283-1 tableContext limited re-check plus the two
unlock paths. No model call happens here.
"""
import json, hashlib, os, shutil
from datetime import datetime, timezone

root = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(root, r)
sha = lambda b: hashlib.sha256(b).hexdigest()
list_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'unified-repair-list-20261027.json')
list_path = os.path.normpath(list_path)
d = json.load(open(list_path, encoding='utf-8'))

resolved = [
    dict(objectId='web-chapter:nemata-jp-chapter-227-1', chapterId='nemata-jp-chapter-227-1',
         articleId='chapter04-section007', cand='chapter04-section007.rev1.json',
         parent='chapter04-section007.display.json',
         parent_sha='b496daf315d5278e20aa81e233c156fad909add5efd97438acbbace5c6902740',
         notes='chapter04-section007.b496daf315d5278e20aa81e233c156fad909add5efd97438acbbace5c6902740.retry-1792992301748-11647458.json',
         target='modern-yabejp-ja:chapter04-section007:b0007',
         frm='选择确保和牌在名次期望值上更有利的情况',
         to='选择通过和牌锁定当前名次，在名次期望值上更有利的情况',
         why='確和了 means winning to lock the current placement, not guaranteeing that a win happens; the candidate turned the term into 确保和牌',
         unchanged='the other 9 text blocks are byte-identical; the article has no figure runs'),
    dict(objectId='web-chapter:nemata-jp-chapter-246-1', chapterId='nemata-jp-chapter-246-1',
         articleId='chapter06-section002', cand='chapter06-section002.rev1.json',
         parent='chapter06-section002.display.json',
         parent_sha='eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4',
         notes='chapter06-section002.eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json',
         target='modern-yabejp-ja:chapter06-section002:b0070',
         frm='用完后每步必须在３０秒以内走出',
         to='用完后每步必须在不足３０秒的时间内走出',
         why='３０秒未満 is strictly less than 30 seconds; 以内 wrongly includes 30',
         unchanged='the other 85 text blocks and all 10 figures are byte-identical apart from the removed display-only presentationAsset'),
]
by_id = {o['objectId']: o for o in d['objects']}
for r in resolved:
    o = by_id[r['objectId']]
    cand_bytes = open(P('web-production/v1/candidates/modern-yabejp-ja/' + r['cand']), 'rb').read()
    cand_sha = sha(cand_bytes)
    c = json.loads(cand_bytes)
    audit_rel = 'audit/web/articles/modern-yabejp-ja/' + r['articleId'] + '.' + cand_sha + '.json'
    audit_bytes = open(P(audit_rel), 'rb').read()
    a = json.loads(audit_bytes)
    assert a['status'] == 'passed' and a['production']['sha256'] == cand_sha
    assert c['provenance']['revision']['parentSha256'] == r['parent_sha']
    prod = c['provenance']['attempts'][0]
    aud = a['calls'][0]
    o.update({
        'candidatePath': 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/' + r['cand'],
        'candidateSha256': cand_sha,
        'auditPath': 'E:/AgentData/Coach/knowledge/processing/' + audit_rel,
        'auditSha256': sha(audit_bytes),
        'auditStatus': 'passed',
        'issueCount': 0,
        'currentDisposition': 'resolved-passed-target-text-revision-awaiting-250-handoff',
        'auditRecordedAt': a.get('recordedAt'),
        'diskShaVerified': True,
        'parentCandidatePath': 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/' + r['parent'],
        'parentCandidateSha256': r['parent_sha'],
        'revision': {
            'kind': 'isolated-japanese-text-block-revision',
            'targets': [r['target']],
            'from': r['frm'],
            'to': r['to'],
            'why': r['why'],
            'productionCall': {'callId': prod['callId'], 'usage': prod.get('usage')},
            'auditCall': {'callId': aud['callId'], 'usage': aud.get('usage')},
            'auditMethod': a.get('method'),
            'unchanged': r['unchanged'],
        },
    })

d['countsCurrent']['needsRepair'] -= 2
d['countsCurrent']['resolvedThisStage'] += 2
d['countsCurrent']['resolvedTotal'] += 2

handoff_path = 'integration/coac250-incremental-211-1-173-1-20261027.json'
hb = open(P(handoff_path), 'rb').read()
d['handoff']['w227'] = {'to': 'COAC-250 when chapter nemata-jp-chapter-227-1 is otherwise complete',
                        'candidateSha256': by_id['web-chapter:nemata-jp-chapter-227-1']['candidateSha256'],
                        'auditSha256': by_id['web-chapter:nemata-jp-chapter-227-1']['auditSha256'],
                        'auditStatus': 'passed'}
d['handoff']['w246'] = {'to': 'COAC-250 when chapter nemata-jp-chapter-246-1 is otherwise complete',
                        'candidateSha256': by_id['web-chapter:nemata-jp-chapter-246-1']['candidateSha256'],
                        'auditSha256': by_id['web-chapter:nemata-jp-chapter-246-1']['auditSha256'],
                        'auditStatus': 'passed'}
d['handoff']['w211w173Consumption'] = {
    'receiptPath': handoff_path,
    'receiptSha256': sha(hb),
    'chapters': ['nemata-jp-chapter-211-1', 'nemata-jp-chapter-173-1'],
    'delivery': 'written to the shared processing root for the running COAC-250 consumer; a same-target COAC-250 run was already active from the owner handoff comment, so no second wakeup was fired',
}

tr = json.load(open(P('audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-limited-recheck-20261027.json'), encoding='utf-8'))
trb = open(P('audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-limited-recheck-20261027.json'), 'rb').read()

d['round20261027T0530'] = {
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'round': '2026-10-27T05:15-05:35Z',
    'resolved': [{'objectId': r['objectId'], 'articleId': r['articleId'],
                  'candidateSha256': by_id[r['objectId']]['candidateSha256'],
                  'auditSha256': by_id[r['objectId']]['auditSha256'],
                  'targets': [r['target']]} for r in resolved],
    'modelCalls': {
        'production': 2, 'audit': 2,
        'detail': [
            {'chapter': '227-1', 'production': 'f47c585e-cfc6-4450-a14b-f1bc95e13107', 'audit': '353f10e8-ecdf-4825-88d7-a3a4da715f83'},
            {'chapter': '246-1', 'production': '24994d5d-4d31-444f-b150-e6b7142994f4', 'audit': '6e90283c-c0bb-4617-aaef-ef729da525ad'},
        ],
        'auditRetries': 0, 'auditTransportFailures': 0,
    },
    'handoff': d['handoff']['w211w173Consumption'],
    'stillOpen': {'needsRepair': d['countsCurrent']['needsRepair'], 'decisionHold': d['countsCurrent']['decisionHold']},
    'note': 'each revision is an isolated target-block re-translation on the bound needs-repair parent; the independent review ran on the revision candidate with target scope, first pass, no retry',
}

d['tableContextLimitedRecheck'] = {
    'path': 'audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-limited-recheck-20261027.json',
    'sha256': sha(trb),
    'candidateSha256': tr['candidate']['sha256'],
    'modelCalls': 0,
    'findings': tr['totals']['findings'],
    'figureBlocks': tr['totals']['figureBlocks'],
    'candidateEqualSource': tr['totals']['candidateEqualSource'],
    'candidateDifferent': tr['totals']['candidateDifferent'],
    'unlockPaths': {
        'pathA_projectionPatch': {
            'candidateContentRedone': {'blocks': 0, 'figures': 0, 'candidateSha256Unchanged': tr['candidate']['sha256']},
            'entryToChange': 'audit/runtimes/<sha>/textbook-audit-web.mjs, webSemanticProjection candidate non-text branch: add tableContext (new runtime snapshot, semanticProjectionVersion bump, new projection SHA)',
            'newCalls': {'production': 0, 'auditMinimum': 4, 'auditFullChapter': 11},
            'scope': 'the 6 findings sit in 4 groups (batch-003 x3, batch-005, batch-006, batch-008): 439 blocks / 217 figures in those groups, of which 94 figure blocks are the table cells that carry tableContext',
            'observedAuditCostPerGroupCall': 'about 59k-70k input and 12k-16k output tokens (measured on the 11 batch calls of the previous round)',
            'evidenceChain': 'the 11 existing receipts, raw calls and checkpoints stay untouched as the record of the run without this projection; new receipts bind the same candidate SHA and the new runtime/projection SHA; no gate relaxed, no waiver',
            'doesNotClose': 'the 8 content errors and 3 uncertain items are independent of this projection and stay open',
        },
        'pathB_groupReProduction': {
            'entryLimitation': 'textbook-production-web.mjs rejects --batch-plan with --revision-*; its revision mode derives targets from every non-source-note issue of the bound receipt and needs isolated single-output text blocks, so a batched article with table ids and figures is refused',
            'asIs_fullReProduction': {'groups': 11, 'blocks': 1195, 'figures': 524, 'productionCalls': 11, 'auditCalls': 11,
                                      'consequence': 'the current candidate and its one passed group are superseded and every translation is rewritten'},
            'withNewGroupLevelEntry': {'groups': 5, 'groupIds': ['batch-002', 'batch-004', 'batch-007', 'batch-009', 'batch-011'],
                                       'blocksInThoseGroups': 530, 'figuresInThoseGroups': 220,
                                       'targetsRegenerated': {'textBlocks': 6, 'figures': 2},
                                       'targetIds': ['b0168', 'b0396', 'b0962', 'b1017', 'b1179', 'b1181', 'b0785:figure', 'b0947:figure'],
                                       'productionCalls': 5, 'auditCalls': 5,
                                       'otherBlocks': 'copied byte-identical from the current candidate, so batch-010 stays as it is'},
            'evidenceChain': 'new candidate keeps the current candidate as parent with explicit target diff; the old receipts/raw stay; the five affected groups are re-reviewed under the new batch binding; b0099, the two b0947 river tiles and the two b0785 river tiles stay uncertain until the real board input exists',
        },
        'recommendedCombination': 'path A on its 4 groups plus path B group-level re-production on its 5 groups: 9 new calls (4 audit + 5 production) and 5 re-audits, leaving both the table findings and the content errors decided by a review that saw the real input',
    },
}

tmp = list_path + '.tmp'
open(tmp, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
os.replace(tmp, list_path)
print(json.dumps({'list': list_path, 'sha256': sha(open(list_path, 'rb').read()), 'counts': d['countsCurrent'],
                  'handoff': d['handoff']['w211w173Consumption'], 'tableRecheck': d['tableContextLimitedRecheck']['sha256']},
                 ensure_ascii=False, indent=1))
