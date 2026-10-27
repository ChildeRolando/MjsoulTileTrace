import json, hashlib, os

R = 'E:/AgentData/Coach/knowledge/processing'
D = '.multica/delivery/coac-248-native-inline-correction'
B = R + '/audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

TABLE_MARK = ('tableContext', '表格格位', '表格定位', '表格结构', '表格行列')
def is_table_issue(i):
    blob = (i.get('targetId') or '') + (i.get('description') or '') + (i.get('suggestedRepair') or '')
    return ':table:' in blob or any(m in blob for m in TABLE_MARK)

groups = []
for fn in sorted(os.listdir(B)):
    d = json.load(open(os.path.join(B, fn), encoding='utf-8'))
    mr = d.get('modelReview') or {}
    iss = []
    for i in mr.get('issues', []):
        iss.append({'severity': i['severity'], 'targetId': i['targetId'], 'class': 'table-position' if is_table_issue(i) else 'content',
                    'description': i['description'], 'suggestedRepair': i['suggestedRepair']})
    groups.append({'batchId': d['group']['batchId'], 'status': d['status'], 'callId': d['calls'][0]['callId'],
                   'usage': d['calls'][0]['usage'], 'checkpoint': 'audit/web/batches/' + sha(R + '/web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json') + '/' + d['planSha256'] + '/' + d['group']['batchId'] + '.json',
                   'issues': iss})

passed = [g for g in groups if g['status'] == 'passed']
content = [i for g in groups for i in g['issues'] if i['class'] == 'content' and i['severity'] == 'error']
tables = [i for g in groups for i in g['issues'] if i['class'] == 'table-position']
uncertain = [i for g in groups for i in g['issues'] if i['severity'] == 'uncertain']

doc = {
    'schema': 'coac-283-1-batch-audit-catalog/1',
    'recordedAt': '2026-10-27T04:50:00Z',
    'articleId': 'chapter06-exercise003',
    'chapterId': 'nemata-jp-chapter-283-1',
    'candidate': {'path': 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json',
                  'sha256': sha(R + '/web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json')},
    'planSha256': '554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421',
    'groups': groups,
    'counts': {'groups': len(groups), 'passed': len(passed), 'needsRepair': len(groups) - len(passed),
               'tablePositionFindings': len(tables), 'contentErrors': len(content), 'uncertain': len(uncertain)},
    'dispositions': {
        'table-position': 'review-input limitation: the batch projection never sends candidate figure tableContext, while every candidate block holds exactly the bound source tableContext (audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json, 0 mismatches). Not a candidate defect and not waived: the affected groups keep their needs-repair status.',
        'b0099': 'stays uncertain on evidence: the group cannot show the referenced full board (visible 1s/2s counts, melds, points), which the reviewer states explicitly; no translation content was lost and nothing is guessed.',
        'content': 'real candidate errors to repair in a later round: b0168 (摸入宝牌 read as the dora four-sou, losing 北 as the actual dora), b0396 (裏目 read as 失算), b0785 figure (4s/6s transcribed as 6s/7s; opponent concealed hands called 牌墙), b0947 figure (the question does not say whether to call 碰 on 2s, and two river winds stay unknown), b0962 (メンタンピン read as an unclear list), b1017 (三元牌 does not say 小三元/大三元), b1179+b1181 (the concessive condition is not formed across the two blocks).'},
    'interruptedCall': {'batchId': 'chapter06-exercise003-batch-009', 'note': 'the first runner was stopped at its 30-minute background limit while batch-009 was in flight; that in-flight call produced no raw and no checkpoint, so it was called once more after the restart. Every other group resumed from its checkpoint with no repeated call.'},
    'repairPathBlocker': {
        'textRevision': 'textbook-production-web.mjs --revision-* derives targets from every non-source-note issue in the bound receipt and requires each to be an isolated text block of a single-output parent; this article is a batched candidate and its issue set also contains table ids, so the isolated-repair entry point refuses it.',
        'figureRevision': 'the same entry point only supports figure targets when source.language is zh-CN; this source is Japanese, so the b0785 figure error has no supported isolated-repair mode.',
        'whatWouldUnblock': 'either a review runtime whose projection includes candidate figure tableContext (it changes what every group is shown, so it needs the owner decision and a full 11-group re-review), or a supported group-level re-production path for a batched article.'}}
open(os.path.join(D, 'summary-283-1-batch-audit-20261027.json'), 'w', encoding='utf-8').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
print(json.dumps(doc['counts'], ensure_ascii=False))
print('written', sha(os.path.join(D, 'summary-283-1-batch-audit-20261027.json')))
