# Write the 2026-10-27T09:55 round record.
import hashlib
import json

BASE = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-12ee2db80b7c/worktree/.multica/delivery/coac-248-native-inline-correction'
ROOT = 'E:/AgentData/Coach/knowledge/processing'


def load(p):
    with open(p, encoding='utf-8') as fh:
        return json.load(fh)


def sha(p):
    with open(p, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


c199 = load(ROOT + '/web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json')
c201 = load(ROOT + '/web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json')
p199 = c199['provenance']['attempts'][0]
p201 = c201['provenance']['attempts'][0]

rec = {
    'schema': 'coac-248-round-record/1',
    'recordedAt': '2026-10-27T09:55:00.000000+00:00',
    'round': '2026-10-27T09:25-09:55Z',
    'receipts': [
        {
            'objectId': 'web-chapter:nemata-jp-chapter-201-1',
            'chapterId': 'nemata-jp-chapter-201-1',
            'articleId': 'chapter03-section015',
            'parent': {
                'candidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.display.json',
                'sha256': '41c7c1bfc78a528fb4a1991f44613efd7dd7a9ec5089aaa859054badcdfb2bbf',
                'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section015.41c7c1bfc78a528fb4a1991f44613efd7dd7a9ec5089aaa859054badcdfb2bbf.retry-1792985735460-f21e7f4e.json',
                'auditSha256': '77f02f9acceb64517962360e11f536152c36517b73848dcd3a99da8b98cdbeea',
                'auditStatus': 'needs-repair',
            },
            'candidate': {'path': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json', 'sha256': 'd63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed'},
            'audit': {'path': 'audit/web/articles/modern-yabejp-ja/chapter03-section015.d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed.json', 'sha256': '6034b9a13d54bd4992da8fcb5fa5002ed158ca2d0722aefa30c58cef77d14db6', 'status': 'passed', 'method': 'independent-target-text-review-plus-unchanged-parent-audit'},
            'targets': ['modern-yabejp-ja:chapter03-section015:b0041'],
            'from': '更优先选择的单骑听牌，因此很可能是',
            'to': '单骑的优先度低于所选的单骑听牌，因此很可能是',
            'reason': '原文「より優先する単騎待ち」是比较结构：最终选择的是优先于西单骑的那种单骑听牌；原译缺比较标记，方向可被读反',
            'unchanged': '其余 27 个文本块逐字节不变；19 个图元只去掉渲染步生成的 presentationAsset，其余字段与父稿一致；source-note i00018 未改动',
            'callIds': {'production': p201['callId'], 'audit': '16082ed6-d090-4ee3-9bed-1f20c32ab1bc'},
            'productionUsage': p201['usage'],
            'auditUsage': {'inputTokens': 17057, 'cachedInputTokens': 0, 'outputTokens': 482},
            'handoff250': 'integration/coac250-incremental-201-1-20261027.json',
        },
        {
            'objectId': 'web-chapter:nemata-jp-chapter-199-1',
            'chapterId': 'nemata-jp-chapter-199-1',
            'articleId': 'chapter03-section013',
            'parent': {
                'candidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.display.json',
                'sha256': '37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292',
                'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter03-section013.37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292.retry-1792984608856-ca1856a7.json',
                'auditSha256': '3856483c70366c5ba7a225ca80042f4b54072da96b8acfc9f906a78c41fd6f49',
                'auditStatus': 'needs-repair',
            },
            'candidate': {'path': 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json', 'sha256': '3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8'},
            'audit': {'path': 'audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.json', 'sha256': '4652f1bdc0504742e20ac3de8c8d8bf99caee4d4f055cb0122f59b1ce149959d', 'status': 'failed', 'failure': 'the runtime rejected the call on an unexpected item: the transport diagnostic item "Falling back from WebSockets to HTTPS transport. request timed out" is not the exact string the runtime whitelists; the model nevertheless returned a complete target-text review (both targets faithful, no issues)'},
            'targets': ['modern-yabejp-ja:chapter03-section013:b0006', 'modern-yabejp-ja:chapter03-section013:b0009'],
            'from': '含有复合搭子的向听牌形 / 两面×２的向听牌形 / ３对子形的向听牌形',
            'to': '含有复合搭子的一向听牌形 / 有两个两面搭子的一向听牌形 / ３对子形的一向听牌形',
            'unchanged': '其余 21 个文本块逐字节不变；14 个图元只去掉 presentationAsset',
            'callIds': {'production': p199['callId'], 'audit': '21477900-c7b4-4383-ba03-e99875dc538b'},
            'productionUsage': p199['usage'],
            'auditUsage': {'inputTokens': 21547, 'cachedInputTokens': 21376, 'outputTokens': 1199},
            'auditVoid': True,
            'retried': False,
            'note': '审校失败调用按额度计费，本章本节审校额度已用；是否重试待 owner 裁决',
        },
    ],
    'adjudications': [
        {
            'targetId': 'modern-yabejp-ja:chapter06-exercise003:b0099',
            'record': {'path': 'audit/web/adjudications/group-revision-283-1/b0099-limited-review-20261027.json', 'sha256': '3f5b3291426e1992371742dea8fd881f1840df27a771d34703dce06ac305609f'},
            'callId': '91065dda-1315-437b-8bf1-70612d154648',
            'usage': {'inputTokens': 12994, 'cachedInputTokens': 0, 'outputTokens': 1366},
            'verdict': 'faithful',
            'preservedUnknownAcceptable': True,
            'teachingAffected': False,
            'preflight': '零调用：绑定源/候选/父审回执/batch-001 checkpoint/plan 全部按 SHA 校验；确认此前无 b0099 专项复核记录、无在途调用；提示文本确含投影本体',
            'caps': {'production': 0, 'audit': 1, 'retries': 0},
        }
    ],
    'chapterAggregation': {
        'chapterId': 'nemata-jp-chapter-283-1',
        'record': {'path': '.multica/delivery/coac-248-native-inline-correction/aggregation-283-1-20261027.json', 'sha256': '587457c41da5d080c75dc712ae0d9a8c08717d119bfdcb66e1dba8a07317fbeb'},
        'handoff': {'path': '.multica/delivery/coac-248-native-inline-correction/handoff-250-283-1-20261027.json', 'sha256': '7a789a1047799d9a87bba225bde20e8f8feb9b00072ce8891bb86fb0af6041b8'},
        'entriesInAuditReceipt': 174,
        'classified': 174,
        'unclassified': 0,
        'mapping': {
            'table-position': '94 blocks + 66 figures + 6 issues -> 4 bounded rechecks (003/005/006/008)',
            'corner-winds': 'b0785 block + figure + issue -> corner adjudication candidate-faithful',
            'river-unknown': 'b0947 block + i01158 occurrence -> batch-009 revised group review passed with unknowns acknowledged',
            'external-situation': 'b0099 uncertain -> this round limited review',
            'route-level': 'dom_order and semantic_information_missing',
        },
        'domOrderDerivation': 'rev2.domOrder.faithful = parent.rev1.domOrder.faithful AND all revised-group contextContinuity; rev1 was false solely because batch-001 contextContinuity was false, which is the b0099 external-situation question this round re-decided; the deterministic DOM-order check passed',
        'semanticFlag': 'mergeGroupRevisionReviews sets semanticCompleteness.complete=false unconditionally; route invariant, not a candidate judgment',
        'effectiveStatus': 'passed-after-independent-resolution',
        'originalReceiptStatus': 'needs-repair（旧回执未改写）',
    },
    'modelCalls': {
        'total': 5,
        'effective': 4,
        'void': 1,
        'production': 2,
        'audit': 3,
        'deterministicRejections': 0,
        'usage': {
            'effective': {'inputTokens': 12994 + 15346 + 13510 + 17057, 'cachedInputTokens': 0, 'outputTokens': 1366 + 464 + 531 + 482},
            'void': {'inputTokens': 21547, 'cachedInputTokens': 21376, 'outputTokens': 1199},
        },
        'detail': [
            {'chapter': '283-1', 'kind': 'audit', 'callId': '91065dda-1315-437b-8bf1-70612d154648', 'void': False},
            {'chapter': '199-1', 'kind': 'production', 'callId': p199['callId'], 'void': False},
            {'chapter': '199-1', 'kind': 'audit', 'callId': '21477900-c7b4-4383-ba03-e99875dc538b', 'void': True, 'voidReason': 'unexpected transport-diagnostic item; runtime gate rejected the call'},
            {'chapter': '201-1', 'kind': 'production', 'callId': p201['callId'], 'void': False},
            {'chapter': '201-1', 'kind': 'audit', 'callId': '16082ed6-d090-4ee3-9bed-1f20c32ab1bc', 'void': False},
        ],
        'ledgerCorrection283': '上一阶段 283 实际 7 次审校（5 有效 + 2 void）超过 5 次上限 2 次；void/failed 一律计费计额度。本阶段起每次调用前零调用预检（投影/上下文/绑定 + 实际账本额度 + 在途），不自动重试。',
    },
    'runtimeRuns': [
        {'what': 'frozen runner copy for 199-1', 'path': 'web-production/v1/runs/coac248-web-199-1-rev1-20261027/frozen-runner/textbook-production-web.mjs', 'sha256': '4a5ce8ab361e659bf7a8e822d3e013ccf413701cfa604aaa1c58c688beab8ca9', 'note': 'byte-identical to the 174-1/187-1/198-1 runs'},
        {'what': 'frozen runner copy for 201-1', 'path': 'web-production/v1/runs/coac248-web-201-1-rev1-20261027/frozen-runner/textbook-production-web.mjs', 'sha256': '4a5ce8ab361e659bf7a8e822d3e013ccf413701cfa604aaa1c58c688beab8ca9', 'note': 'byte-identical'},
    ],
    'runtimeChanges': [],
    'laneBoundary': {
        'kept': '198/187/199/201/215-4/236/283 + PDF/metadata',
        'notTouched': 'the ordinary web revision line root split off to the existing ticket executor; no shared code or shared list written on its behalf; same-SHA atomic claim not exercised this round',
        'dualSlot': 'not attempted; the existing single production lock is respected',
    },
    'handoff250': ['integration/coac250-incremental-201-1-20261027.json', 'integration/coac250-283-1-aggregation-20261027.json'],
    'stillOpen': {
        'needsRepair': 48,
        'list': [
            'nemata-jp-chapter-283-1 (content resolved; 250 staging decision pending)',
            'nemata-jp-chapter-199-1 (revision1 produced; audit was a billed void; retry needs authorisation)',
            'nemata-jp-chapter-215-4 (revision entry decision)',
            'nemata-jp-chapter-236-1 (entry decision)',
        ],
    },
    'nextBatchWish': '199-1 审校重试裁决；236-1 入口裁决；继续其余小 web 章',
}

with open(BASE + '/round-20261027T0955.json', 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(json.dumps(rec, ensure_ascii=False, indent=1) + '\n')

print(json.dumps({
    'roundSha256': sha(BASE + '/round-20261027T0955.json'),
    'prod199': [p199['callId'], p199['usage']],
    'prod201': [p201['callId'], p201['usage']],
}, ensure_ascii=False, indent=1))
