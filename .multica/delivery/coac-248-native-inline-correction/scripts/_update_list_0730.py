import json, hashlib

p = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
d = json.load(open(p, encoding='utf-8'))


def h(fp):
    return hashlib.sha256(open(fp, 'rb').read()).hexdigest()


P = 'E:/AgentData/Coach/knowledge/processing/'
objs = {o['objectId']: o for o in d['objects']}

# 222-1 resolved
o = objs['web-chapter:nemata-jp-chapter-222-1']
o.update({
    'candidatePath': P + 'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.rev1.json',
    'candidateSha256': '3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
    'auditPath': P + 'audit/web/articles/modern-yabejp-ja/chapter04-section004.3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a.json',
    'auditSha256': 'a3981976a82cd5870f05c53c89e26875dc279816ece3abcc9ef46dd86ba7943d',
    'auditStatus': 'passed', 'issueCount': 0,
    'currentDisposition': 'resolved-passed-target-text-revision-awaiting-250-handoff',
    'auditRecordedAt': '2026-10-27T07:03:20.943Z', 'auditSourceStale': False, 'diskShaVerified': True,
    'parentCandidatePath': P + 'web-production/v1/candidates/modern-yabejp-ja/chapter04-section004.display.json',
    'parentCandidateSha256': '0422143bd4f14e151ddcabd4b12e7fcda84937ef5acd4ab3e0335d8d56f4f4d2',
    'parentAuditPath': 'audit/web/articles/modern-yabejp-ja/chapter04-section004.0422143bd4f14e151ddcabd4b12e7fcda84937ef5acd4ab3e0335d8d56f4f4d2.retry-1792992204029-f963202a.json',
    'revision': {
        'kind': 'isolated-japanese-text-block-revision',
        'targets': ['modern-yabejp-ja:chapter04-section004:b0016', 'modern-yabejp-ja:chapter04-section004:b0018'],
        'from': '超过一半 / 两面听牌的立直无役',
        'to': '能达到一半以上 / 两面听牌、仅有立直这一役的听法',
        'why': '半分以上 includes exactly 50% and リーチのみ means riichi is the only yaku, not a yaku-less hand; the parent audit flagged both readings',
        'productionCall': {'callId': '5a366e25-98fe-4c41-a857-3ccf0dcf38c5', 'usage': {'inputTokens': 13574, 'cachedInputTokens': 0, 'outputTokens': 707}},
        'auditCall': {'callId': 'de957f3e-7c5f-4508-b32e-37be59842ab2', 'usage': {'inputTokens': 14142, 'cachedInputTokens': 0, 'outputTokens': 644}},
        'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
        'unchanged': 'the other 19 text blocks are byte-identical; the article has no figure runs'},
})

# 215-4 still open with the new evidence
o = objs['web-chapter:nemata-jp-chapter-215-4']
o.update({
    'candidatePath': P + 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.rev1.json',
    'candidateSha256': 'e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9',
    'auditPath': P + 'audit/web/articles/modern-yabejp-ja/chapter03-section027.e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9.retry-1793084669596-d7092797.json',
    'auditSha256': '42d80845eb434439bf7d81a811749b743de18b5043ed4ff930683a6d0c9ed918',
    'auditStatus': 'needs-repair', 'issueCount': 1,
    'currentDisposition': 'needs-repair-target-revision-rejected-by-independent-audit',
    'auditRecordedAt': '2026-10-27T07:06:06.290Z', 'auditSourceStale': False, 'diskShaVerified': True,
    'parentCandidatePath': P + 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section027.display.json',
    'parentCandidateSha256': '17f902a2c809d3af8206983f5d1bb40c36b76005176a3959a5e891bb6371677d',
    'parentAuditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section027.17f902a2c809d3af8206983f5d1bb40c36b76005176a3959a5e891bb6371677d.retry-1792990272154-1c6bf052.json',
    'revision': {
        'kind': 'isolated-japanese-text-block-revision',
        'targets': ['modern-yabejp-ja:chapter03-section027:b0011'],
        'from': '如果不是进张所致',
        'to': '若打出的这张牌并非新摸入的牌',
        'why': 'first attempt at the parent audit finding that 入り目 did not point at the discarded tile',
        'productionCall': {'callId': 'f3604120-2ab6-48f0-968c-765d428375e0', 'usage': {'inputTokens': 12669, 'cachedInputTokens': 0, 'outputTokens': 439}},
        'auditCall': {'callId': 'c59c0932-3a54-443e-935c-8dbf7f214ac0', 'usage': {'inputTokens': 12858, 'cachedInputTokens': 0, 'outputTokens': 1475}},
        'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
        'unchanged': 'the other 12 text blocks are byte-identical; the article has no figure runs',
        'verdict': 'the independent audit rejects the replacement: 入り目 marks the case where a drawn tile completes a 面子 and the leftover is cut, not whether the discarded tile is a fresh draw',
        'nextRepair': '若这张牌不是进张完成面子后切出的余牌 (the reviewer-provided reading), to be produced as a rev2 in a later bounded round',
        'auditAttempts': [
            {'kind': 'first', 'status': 'failed',
             'auditPath': P + 'audit/web/articles/modern-yabejp-ja/chapter03-section027.e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9.json',
             'auditSha256': 'f107b8d8faf4ec8b005a705e27f9f96bd1c3ab0440cbb85b049f1f0b9fb31f8e',
             'callId': '39ee8cc1-727b-4aaa-b231-3a7d6877d085',
             'reason': 'transport: WebSocket stream reconnect then HTTPS fallback; an unrecognised transport-diagnostic item made the call non-authoritative, and the receipt carries no model conclusion',
             'usage': {'inputTokens': 14533, 'cachedInputTokens': 13696, 'outputTokens': 402}},
            {'kind': 'retry-failed-no-model-result', 'status': 'needs-repair',
             'auditPath': P + 'audit/web/articles/modern-yabejp-ja/chapter03-section027.e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9.retry-1793084669596-d7092797.json',
             'auditSha256': '42d80845eb434439bf7d81a811749b743de18b5043ed4ff930683a6d0c9ed918',
             'callId': 'c59c0932-3a54-443e-935c-8dbf7f214ac0'}]},
})

d['countsCurrent']['needsRepair'] = 52
d['countsCurrent']['resolvedTotal'] = 10
d['countsCurrent']['resolvedThisStage'] = 6
d['refreshedAt'] = '2026-10-27T07:15:00.000Z'

d['round20261027T0730'] = {
    'recordedAt': '2026-10-27T07:15:00.000Z',
    'round': '2026-10-27T06:50-07:15Z',
    'resolved': [{'objectId': 'web-chapter:nemata-jp-chapter-222-1', 'articleId': 'chapter04-section004',
                  'candidateSha256': '3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
                  'auditSha256': 'a3981976a82cd5870f05c53c89e26875dc279816ece3abcc9ef46dd86ba7943d',
                  'targets': ['modern-yabejp-ja:chapter04-section004:b0016', 'modern-yabejp-ja:chapter04-section004:b0018']}],
    'stillOpen': [{'objectId': 'web-chapter:nemata-jp-chapter-215-4', 'articleId': 'chapter03-section027',
                   'candidateSha256': 'e9a9376e2a870f6f9236e3ce574972d1c68226d9597f9c7dd53d781d12da2af9',
                   'auditSha256': '42d80845eb434439bf7d81a811749b743de18b5043ed4ff930683a6d0c9ed918',
                   'status': 'needs-repair',
                   'reason': 'independent audit rejected the 入り目 rendering; a next bounded round can produce rev2 from the recorded repair reading'}],
    'modelCalls': {'production': 2, 'audit': 3,
                   'auditDetail': [
                       {'articleId': 'chapter03-section027', 'callId': '39ee8cc1-727b-4aaa-b231-3a7d6877d085', 'status': 'failed', 'reason': 'transport'},
                       {'articleId': 'chapter03-section027', 'callId': 'c59c0932-3a54-443e-935c-8dbf7f214ac0', 'status': 'needs-repair'},
                       {'articleId': 'chapter04-section004', 'callId': 'de957f3e-7c5f-4508-b32e-37be59842ab2', 'status': 'passed'}],
                   'productionDetail': [
                       {'articleId': 'chapter03-section027', 'callId': 'f3604120-2ab6-48f0-968c-765d428375e0'},
                       {'articleId': 'chapter04-section004', 'callId': '5a366e25-98fe-4c41-a857-3ccf0dcf38c5'}],
                   'auditRetries': 1},
    'handoff': {'receiptPath': 'integration/coac250-incremental-222-1-20261027.json',
                'receiptSha256': '7c562509efbb0b6d99f6c411bf91874ca40cf810188cfc1254e5e05a94f85b28',
                'chapters': ['nemata-jp-chapter-222-1']},
    'note': '222-1 passed its independent target-text review and is handed to 250; 215-4 stayed open because the retry audit reproduced a semantic rejection of the new 入り目 rendering, so no second revision was force-produced in the same round.'}

d['latestRound'] = {'at': '2026-10-27T07:15:00.000Z',
                    'objects': ['web-chapter:nemata-jp-chapter-222-1', 'web-chapter:nemata-jp-chapter-215-4'],
                    'productionModelCalls': 2, 'auditModelCalls': 3,
                    'note': '222-1 targeted text revision passed independent target-text review and is handed to 250; 215-4 revision was rejected by the independent retry audit (入り目 reading), recorded with the reviewer-provided repair for a later bounded round; 283-1 received no production or audit call',
                    'stillOpen': ['nemata-jp-chapter-215-4']}

d['stageVerification20261027T0715'] = {
    'recordedAt': '2026-10-27T07:15:00.000Z',
    'modelCalls': 0,
    'finding': 'COAC-250 consumed the earlier handoffs: 211-1, 173-1, 227-1 and 246-1 are all in the current accepted preview',
    'pointer': 'accepted-content-preview-2026-10-27T06-08-03-592Z',
    'corpusId': '11298d626a584ba155bb00eb496b2408348bd9c3d44586868cb41e4e4a035bfc',
    'chapters': 206, 'units': 214, 'selectedWeb': 177, 'pendingWeb': 46,
    'merged': [
        {'chapterId': 'nemata-jp-chapter-211-1', 'previewChapterId': 'modern-yabejp-ja-chapter03-section024-chapter',
         'candidateSha256': '643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba', 'auditStatus': 'passed',
         'firstStagedIn': 'accepted-content-preview-2026-10-27T05-19-25-744Z'},
        {'chapterId': 'nemata-jp-chapter-173-1', 'previewChapterId': 'modern-yabejp-ja-chapter02-section023-chapter',
         'candidateSha256': '098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3', 'auditStatus': 'passed',
         'firstStagedIn': 'accepted-content-preview-2026-10-27T05-19-25-744Z'},
        {'chapterId': 'nemata-jp-chapter-227-1', 'previewChapterId': 'modern-yabejp-ja-chapter04-section007-chapter',
         'candidateSha256': '4e1c6ed36bef34ff0a9848ba8915f46b0422a9f71b611775f5ee7981292590d6', 'auditStatus': 'passed',
         'firstStagedIn': 'accepted-content-preview-2026-10-27T06-08-03-592Z'},
        {'chapterId': 'nemata-jp-chapter-246-1', 'previewChapterId': 'modern-yabejp-ja-chapter06-section002-chapter',
         'candidateSha256': 'bbf15bbd1390a0b7ce729d5205a65dad72e0f24cb6c2fe1f9789aaaea26e1904', 'auditStatus': 'passed',
         'firstStagedIn': 'accepted-content-preview-2026-10-27T06-08-03-592Z'}],
    'evidence': ['integration/coac250-unified-chapter-register-20261027b.json rows covered=true verdict=covered-effective',
                 'integration/current-web-candidate-selection.json (all four articleIds selected)',
                 'integration/specific-web-variant-selection.v7.json'],
    'note': 'no repeat handoff for these chapters; 283-1 remains produced-needs-repair and is not staged'}

d['handoff']['chapter222'] = {
    'chapterId': 'nemata-jp-chapter-222-1',
    'candidateSha256': '3910165816bc9776e27fccd11e9e46636c0eef860949df2978cb1481dde4d56a',
    'auditSha256': 'a3981976a82cd5870f05c53c89e26875dc279816ece3abcc9ef46dd86ba7943d',
    'receiptPath': 'integration/coac250-incremental-222-1-20261027.json',
    'receiptSha256': '7c562509efbb0b6d99f6c411bf91874ca40cf810188cfc1254e5e05a94f85b28'}

open(p, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print('written', h(p))
