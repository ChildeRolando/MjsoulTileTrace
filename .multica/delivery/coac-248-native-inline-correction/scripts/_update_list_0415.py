import json
P = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
d = json.load(open(P, encoding='utf-8'))
by_id = {o['objectId']: o for o in d['objects']}

o = by_id['web-chapter:nemata-jp-chapter-211-1']
o['auditStatus'] = 'passed'
o['candidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json'
o['candidateSha256'] = '643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba'
o['auditPath'] = 'E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json'
o['auditSha256'] = 'e52ca57e40973e50dca0420b40e665dd50b4e784983b78d6f3c7b00f06563073'
o['parentCandidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.display.json'
o['parentCandidateSha256'] = '692318b73842236f227a8a60a303c6286f106f229a68288842d0644cada1a38c'
o['currentDisposition'] = 'resolved-passed-target-text-revision-awaiting-250-handoff'
o['issueCount'] = 0
o['revision'] = {
    'kind': 'isolated-japanese-text-block-revision',
    'targets': ['modern-yabejp-ja:chapter03-section024:b0039'],
    'from': '但…在七对子等的单骑选择中，应该还是*选择已现1张的字牌*更好。',
    'to': '但*在七对子等的单骑选择中，选择已现1张的字牌*应该更好。',
    'why': 'the source emphasis span covers 七対子等の単騎選択の場合は１枚切れ字牌を選ぶ; the candidate emphasized only the choice, dropping the condition',
    'productionCall': {'callId': '6b1f1cbb', 'usage': {'inputTokens': 12241, 'cachedInputTokens': 0, 'outputTokens': 590}},
    'auditCall': {'callId': 'd3e42423-e17c-4f2e-a8bf-a7e9a42b516a', 'usage': {'inputTokens': 12987, 'cachedInputTokens': 0, 'outputTokens': 505}},
    'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
    'unchanged': 'the other 27 text blocks and all 20 figures are byte-identical; the display pair keeps its own presentation assets and is untouched'}

o = by_id['web-chapter:nemata-jp-chapter-173-1']
o['auditStatus'] = 'passed'
o['candidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json'
o['candidateSha256'] = '098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3'
o['auditPath'] = 'E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json'
o['auditSha256'] = '28f117371b0fcd08f8fb696e33c81c3fd8be2ff693f369b39e70d2ed1b869678'
o['parentCandidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.display.json'
o['parentCandidateSha256'] = 'a1c2a38bd361b38fad47680a4ebcf2fed77b0d933f47fb400e5f7b7259b22ef5'
o['currentDisposition'] = 'resolved-passed-target-text-revision-awaiting-250-handoff'
o['issueCount'] = 0
o['revision'] = {
    'kind': 'isolated-japanese-text-block-revision',
    'targets': ['modern-yabejp-ja:chapter02-section023:b0004'],
    'from': '至少也很可能处于进张面宽的向听状态或更好的状态',
    'to': '至少也很可能处于进张面宽的一向听或更好的状态',
    'why': 'シャンテン unqualified reads as 1-shanten here; 向听状态 also admitted 2-shanten or worse, blurring the progress judgement the author states',
    'productionCall': {'callId': 'see provenance.attempts[0]', 'usage': {'inputTokens': 13433, 'cachedInputTokens': 0, 'outputTokens': 586}},
    'auditCall': {'callId': '8f4cc075-9d2a-44b1-99f4-7b8ac5154557', 'usage': {'inputTokens': 13955, 'cachedInputTokens': 0, 'outputTokens': 582}},
    'auditMethod': 'independent-target-text-review-plus-unchanged-parent-audit',
    'transportFailurePreserved': {'callId': '33a396b8-5502-453d-992e-ddb4f812b0a0', 'receipt': 'audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.json', 'reason': 'unexpectedTool plus workspace-routing reconnect errors; its raw output and usage are kept and the retry is linked by retryOfAudit'},
    'unchanged': 'the other 4 text blocks are byte-identical; the article has no figures'}

d['round20261027T0415'] = {
    'recordedAt': '2026-10-27T04:20:00Z',
    'resolved': ['nemata-jp-chapter-211-1', 'nemata-jp-chapter-173-1'],
    'note': 'both are isolated one-block Japanese text revisions with a real production call and a real independent target-text review; no gate changed and no exemption added'}
json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('updated')
