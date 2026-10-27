import json, hashlib, os

D = '.multica/delivery/coac-248-native-inline-correction'
P = D + '/unified-repair-list-20261027.json'
R = 'E:/AgentData/Coach/knowledge/processing'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

d = json.load(open(P, encoding='utf-8'))
d['latestRound'] = {
    'at': '2026-10-27T04:45:00.000Z',
    'objects': ['web-chapter:nemata-jp-chapter-211-1', 'web-chapter:nemata-jp-chapter-173-1'],
    'productionModelCalls': 2,
    'auditModelCalls': 13,
    'note': 'two isolated Japanese text-block revisions passed independent target-text review (211-1 emphasis scope, 173-1 一向听); the 283-1 batch audit finished all 11 groups and its table-position findings are shown to be a review-input limitation by exact tableContext evidence, so that article stays open with a documented repair-path blocker',
    'stillOpen': ['nemata-jp-chapter-283-1']}

h = d.setdefault('handoff', {})
h['w211'] = {
    'to': 'COAC-250 when chapter nemata-jp-chapter-211-1 is otherwise complete',
    'candidatePath': R + '/web-production/v1/candidates/modern-yabejp-ja/chapter03-section024.rev1.json',
    'candidateSha256': '643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba',
    'auditPath': R + '/audit/web/articles/modern-yabejp-ja/chapter03-section024.643cc5850bc62f76e02c5efca69466cefb8f995a48f05dfc41f12829ec196eba.json',
    'auditStatus': 'passed',
    'parentCandidateSha256': '692318b73842236f227a8a60a303c6286f106f229a68288842d0644cada1a38c'}
h['w173'] = {
    'to': 'COAC-250 when chapter nemata-jp-chapter-173-1 is otherwise complete',
    'candidatePath': R + '/web-production/v1/candidates/modern-yabejp-ja/chapter02-section023.rev1.json',
    'candidateSha256': '098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3',
    'auditPath': R + '/audit/web/articles/modern-yabejp-ja/chapter02-section023.098459b6cfb390423774251152486801538839a95d5b39c10a0a5fe133b69cd3.retry-1793074518139-c3b705f3.json',
    'auditStatus': 'passed',
    'parentCandidateSha256': 'a1c2a38bd361b38fad47680a4ebcf2fed77b0d933f47fb400e5f7b7259b22ef5'}

ev = R + '/audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json'
d['round20261027T0415']['tableContextEvidence'] = {
    'path': 'audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json',
    'sha256': sha(ev)}
d['round20261027T0415']['stillOpen'] = ['nemata-jp-chapter-283-1']

json.dump(d, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('list updated')
