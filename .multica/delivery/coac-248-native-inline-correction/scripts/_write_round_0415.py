import json, hashlib, os

R = 'E:/AgentData/Coach/knowledge/processing'
D = '.multica/delivery/coac-248-native-inline-correction'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

issues = json.load(open('_283_issues.json', encoding='utf-8'))
reg = R + '/integration/coac250-unified-chapter-register-20261027b.json'
plan = R + '/web-production/v1/batch-plans/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421.json'
cand283 = R + '/web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json'
cand211 = R + '/web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json'
cand173 = R + '/web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json'
a211 = R + '/audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json'
a173 = R + '/audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json'
ev = R + '/audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json'

def sev(g):
    return {s: sum(1 for i in g['issues'] if i['severity'] == s) for s in ('error', 'uncertain', 'source-note')}

doc = {
 'schema': 'coac-248-round-record/1',
 'recordedAt': '2026-10-27T04:45:00Z',
 'round': '2026-10-27T03:55-04:45Z',
 'register': {
  'path': 'integration/coac250-unified-chapter-register-20261027b.json',
  'sha256': sha(reg),
  'note': 'unchanged this round; 211-1 and 173-1 leave needs-repair through real revision receipts, 283-1 stays separate and open'},
 'resolved': [
  {'objectId': 'web-chapter:nemata-jp-chapter-211-1', 'chapterId': 'nemata-jp-chapter-211-1', 'articleId': 'chapter03-section024',
   'parentCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.display.json',
   'parentCandidateSha256': '692318b73842236f227a8a60a303c6286f106f229a68288842d0644cada1a38c',
   'parentAuditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section024.692318b73842236f227a8a60a303c6286f106f229a68288842d0644cada1a38c.retry-1792989999048-fe8fc2f0.json',
   'repairedCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json',
   'repairedCandidateSha256': sha(cand211),
   'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json',
   'auditSha256': sha(a211), 'auditStatus': 'passed',
   'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
   'changed': {'blockId': 'modern-yabejp-ja:chapter03-section024:b0039',
               'from': '但在七对子等的单骑选择中，应该还是*选择已现1张的字牌*更好。',
               'to': '但*在七对子等的单骑选择中，选择已现1张的字牌*应该更好。'},
   'productionCall': {'callId': 'df49cf06-a2d7-43a8-8500-170fa2059cb4', 'usage': {'inputTokens': 12241, 'cachedInputTokens': 0, 'outputTokens': 590}},
   'auditCall': {'callId': 'd3e42423-e17c-4f2e-a8bf-a7e9a42b516a', 'usage': {'inputTokens': 12987, 'cachedInputTokens': 0, 'outputTokens': 505}},
   'unchanged': 'the other 27 text blocks and all 20 figures are byte-identical; the display pair keeps its own presentation assets'},
  {'objectId': 'web-chapter:nemata-jp-chapter-173-1', 'chapterId': 'nemata-jp-chapter-173-1', 'articleId': 'chapter02-section023',
   'parentCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.display.json',
   'parentCandidateSha256': 'a1c2a38bd361b38fad47680a4ebcf2fed77b0d933f47fb400e5f7b7259b22ef5',
   'parentAuditPath': 'audit/web/articles/modern-yabejp-ja/chapter02-section023.a1c2a38bd361b38fad47680a4ebcf2fed77b0d933f47fb400e5f7b7259b22ef5.retry-1792975494558-0e383e0d.json',
   'repairedCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json',
   'repairedCandidateSha256': sha(cand173),
   'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json',
   'auditSha256': sha(a173), 'auditStatus': 'passed',
   'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
   'changed': {'blockId': 'modern-yabejp-ja:chapter02-section023:b0004',
               'from': '至少也很可能处于进张面宽的向听状态或更好的状态',
               'to': '至少也很可能处于进张面宽的一向听或更好的状态'},
   'productionCall': {'callId': '84523d8a-1626-4b62-b99e-50995f0370e3', 'usage': {'inputTokens': 13433, 'cachedInputTokens': 0, 'outputTokens': 586}},
   'auditCall': {'callId': '8f4cc075-9d2a-44b1-99f4-7b8ac5154557', 'usage': {'inputTokens': 13955, 'cachedInputTokens': 0, 'outputTokens': 582}},
   'transportFailurePreserved': {'callId': '33a396b8-5502-453d-992e-ddb4f812b0a0',
     'receipt': 'audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.json',
     'error': 'unexpectedTool plus workspace-routing reconnect errors',
     'retryLinkedBy': 'retryOfAudit'}}],
 'stillOpen': {'nemata-jp-chapter-283-1': {
   'candidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json',
   'candidateSha256': sha(cand283),
   'planSha256': sha(plan),
   'batchAudit': {'groupsDone': issues['done'], 'groupsTotal': issues['total'], 'needsRepair': issues['needsRepair'],
                  'passed': issues['passed'], 'issueCount': issues['issueCount']},
   'groups': [{'batchId': g['batchId'], 'status': g['status'], 'issueCount': len(g['issues']), 'severityCounts': sev(g)} for g in issues['groups']],
   'tableContextEvidence': {'path': 'audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json',
     'sha256': sha(ev),
     'conclusion': 'every candidate block carries the exact source tableContext (0 mismatches across 1195 blocks); the reviewer is not shown candidate figure tableContext, so the table-position findings are review-input limitations, not content defects'},
   'blocker': 'the targeted-revision route derives its targets from the audit issues and requires every target to be an isolated text block of a single-call parent; this article is a batched candidate whose issue set mixes table-position findings with real text and figure findings, and the CLI has no figure-revision mode for Japanese sources. Repair needs either a review runtime that projects candidate figure tableContext, or a supported group-level re-production path. Neither was changed unilaterally this round.'}},
 'realModelCallsThisRound': {'production': 2, 'productionDetail': '211-1 b0039, 173-1 b0004',
   'audit': 13, 'auditDetail': '211-1 one target-text review; 173-1 one transport-failed review plus one retry; 283-1 nine recorded batch group reviews plus one batch-009 call lost when the first runner hit its background limit and recorded nothing',
   'total': 14},
 'note': 'no gate changed, no exemption added; every parent draft, raw call and failed receipt retained; b0099 stays uncertain on evidence (the group cannot show the referenced full board), not guessed'
}
open(os.path.join(D, 'round-20261027T0415.json'), 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
print('written', sha(os.path.join(D, 'round-20261027T0415.json')))
