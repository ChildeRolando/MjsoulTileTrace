# Round 2026-10-27T09:25-09:55Z: b0099 review, 283-1 aggregation, 199-1 revision
# (audit transport-failed), 201-1 revision + audit passed. Writes the 250 handoff for
# 201-1, updates the unified repair list, and records the ledger accounting.
import hashlib
import json
import os

BASE = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-12ee2db80b7c/worktree/.multica/delivery/coac-248-native-inline-correction'
ROOT = 'E:/AgentData/Coach/knowledge/processing'
LIST = os.path.join(BASE, 'unified-repair-list-20261027.json')
HANDOFF = 'integration/coac250-incremental-201-1-20261027.json'


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_file(rel):
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        return sha_bytes(fh.read())


def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return json.load(fh)


C201 = 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.rev1.json'
A201 = 'audit/web/articles/modern-yabejp-ja/chapter03-section015.d63f3a896005f1b939302ddf7268b99bead9e66d0542d545071a014ca24da5ed.json'
P201 = 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section015.display.json'
PA201 = 'audit/web/articles/modern-yabejp-ja/chapter03-section015.41c7c1bfc78a528fb4a1991f44613efd7dd7a9ec5089aaa859054badcdfb2bbf.retry-1792985735460-f21e7f4e.json'
S201 = 'web-sources/v1/modern-yabejp-ja/articles/chapter03-section015/source.json'

C199 = 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json'
A199_FAILED = 'audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.json'
P199 = 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.display.json'
PA199 = 'audit/web/articles/modern-yabejp-ja/chapter03-section013.37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292.retry-1792984608856-ca1856a7.json'

c201 = load(C201)
a201 = load(A201)

# --- bindings
c201_sha = sha_file(C201)
a201_sha = sha_file(A201)
p201_sha = sha_file(P201)
pa201_sha = sha_file(PA201)
s201_sha = sha_file(S201)
c199_sha = sha_file(C199)
a199_sha = sha_file(A199_FAILED)
p199_sha = sha_file(P199)
pa199_sha = sha_file(PA199)

if a201['status'] != 'passed' or a201['modelChecks']['passed'] is not True:
    raise SystemExit('201-1 audit is not a clean pass')
prod201 = c201['provenance']['attempts'][0]

# --- 250 handoff for 201-1
with open(os.path.join(ROOT, 'integration/accepted-content-preview-2026-10-27T07-16-27-706Z/accepted-preview-receipt.json'), encoding='utf-8') as fh:
    preview = json.load(fh)

handoff = {
    'schema': 'coac250-incremental-staging-receipt/1',
    'recordedAt': '2026-10-27T09:55:00.000Z',
    'modelCalls': 0,
    'productionCalls': 0,
    'from_': 'COAC-248',
    'to': 'COAC-250',
    'before': {
        'pointer': 'accepted-content-preview-2026-10-27T07-16-27-706Z',
        'chapters': preview.get('chapters'),
        'units': preview.get('units'),
        'selectedWeb': preview.get('selectedWeb'),
        'pendingWeb': preview.get('pendingWeb'),
        'corpusId': preview.get('corpusId'),
        'note': 'read from accepted-preview-receipt.json in this round',
    },
    'chapters': [{
        'chapterId': 'nemata-jp-chapter-201-1',
        'articleId': 'chapter03-section015',
        'sourcePath': S201,
        'sourceSha256': s201_sha,
        'parentPath': P201,
        'parentSha256': p201_sha,
        'parentAuditPath': PA201,
        'parentAuditSha256': pa201_sha,
        'candidatePath': C201,
        'candidateSha256': c201_sha,
        'auditPath': A201,
        'auditSha256': a201_sha,
        'auditStatus': 'passed',
        'auditMethod': a201['method'],
        'productionCallId': prod201['callId'],
        'productionUsage': prod201['usage'],
        'auditCallId': a201['calls'][0]['callId'],
        'auditUsage': a201['calls'][0]['usage'],
        'changed': 'b0041「より優先する単騎待ち」原译「更优先选择的单骑听牌」缺少比较标记、比较方向不明；改为「单骑的优先度低于所选的单骑听牌」。其余 27 个文本块逐字节不变，19 个图元只去掉渲染步生成的 presentationAsset。',
        'pendingWebBefore': True,
    }],
}
with open(os.path.join(ROOT, HANDOFF), 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(handoff, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
handoff_sha = sha_file(HANDOFF)

# --- unified repair list
with open(LIST, 'rb') as fh:
    list_bytes = fh.read()
j = json.loads(list_bytes)
by_id = {o['objectId']: o for o in j['objects']}

o = by_id['web-chapter:nemata-jp-chapter-201-1']
o.update({
    'candidatePath': os.path.join(ROOT, C201).replace('\\', '/'),
    'candidateSha256': c201_sha,
    'auditPath': A201,
    'auditStatus': 'passed',
    'auditSha256': a201_sha,
    'issueCount': 0,
    'currentDisposition': 'resolved-passed-target-text-revision-awaiting-250-handoff',
    'revisedFrom': {
        'parentCandidatePath': P201,
        'parentCandidateSha256': p201_sha,
        'parentAuditPath': PA201,
        'parentAuditSha256': pa201_sha,
        'targets': ['modern-yabejp-ja:chapter03-section015:b0041'],
    },
    'handoff250': HANDOFF,
})

o = by_id['web-chapter:nemata-jp-chapter-199-1']
o.update({
    'candidatePath': os.path.join(ROOT, C199).replace('\\', '/'),
    'candidateSha256': c199_sha,
    'auditPath': A199_FAILED,
    'auditStatus': 'failed',
    'auditSha256': a199_sha,
    'issueCount': 5,
    'currentDisposition': 'produced-revision1-audit-transport-failed-void-call-counted-no-retry',
    'revisedFrom': {
        'parentCandidatePath': P199,
        'parentCandidateSha256': p199_sha,
        'parentAuditPath': PA199,
        'parentAuditSha256': pa199_sha,
        'targets': ['modern-yabejp-ja:chapter03-section013:b0006', 'modern-yabejp-ja:chapter03-section013:b0009'],
    },
    'auditFailure': {
        'callId': '21477900-c7b4-4383-ba03-e99875dc538b',
        'usage': {'inputTokens': 21547, 'cachedInputTokens': 21376, 'outputTokens': 1199},
        'reason': 'the runtime rejected the call on an unexpected item: a transport diagnostic item ("Falling back from WebSockets to HTTPS transport. request timed out") that is not the exact string the runtime whitelists; the model still returned a complete target-text review (both targets faithful, no issues)',
        'whyNotAccepted': 'accepting it would mean overriding the runtime gate, which is not allowed',
        'whyNoRetry': 'the failed call is billed and consumes this chapter\'s one audit allowance; retrying needs the owner\'s word, not an automatic retry',
    },
})

# 283-1: the aggregation record and the b0099 review live on the failed-separate entry.
entry = j['failedSeparate'][0]
if entry.get('groupRevision', {}).get('schema') != 'coac-283-1-group-targeted-revision/1':
    raise SystemExit('unexpected failedSeparate[0]')
entry['b0099Review20261027'] = {
    'record': 'audit/web/adjudications/group-revision-283-1/b0099-limited-review-20261027.json',
    'sha256': '3f5b3291426e1992371742dea8fd881f1840df27a771d34703dce06ac305609f',
    'callId': '91065dda-1315-437b-8bf1-70612d154648',
    'usage': {'inputTokens': 12994, 'cachedInputTokens': 0, 'outputTokens': 1366},
    'verdict': 'faithful；unknown 忠实保留；不构成教学影响',
    'scope': '最多 1 次限定独立审校、0 制作；调用前零调用预检确认未审过、无在途',
    'noRetry': True,
}
entry['chapterAggregation20261027'] = {
    'record': '.multica/delivery/coac-248-native-inline-correction/aggregation-283-1-20261027.json',
    'sha256': sha_bytes(open(os.path.join(BASE, 'aggregation-283-1-20261027.json'), 'rb').read()),
    'handoff': '.multica/delivery/coac-248-native-inline-correction/handoff-250-283-1-20261027.json',
    'handoffSha256': sha_bytes(open(os.path.join(BASE, 'handoff-250-283-1-20261027.json'), 'rb').read()),
    'entriesClassified': 174,
    'unclassified': 0,
    'effectiveStatus': 'passed-after-independent-resolution',
    'originalReceiptStatus': 'needs-repair (unchanged)',
    'note': '174 条 modelChecks 全部映射到独立复核记录：94 表格块 + 66 表格图 + 6 表格项 → 4 份限定复核；b0785 块/图/项 → 方位裁决；b0947 块 + i01158 → 009 修订组复审 passed；b0099 → 本轮限定审校。dom_order 追到 batch-001 上下文连续性并由 b0099 裁决重新导出；semantic_information_missing 是 mergeGroupRevisionReviews 硬编码 false 的路线常量，不含候选内容判断。',
}
entry['status'] = 'produced-needs-repair; content findings resolved; chapter aggregation prepared; 250 staging decision pending'

j['countsCurrent']['needsRepair'] = j['countsCurrent']['needsRepair'] - 1
j['countsCurrent']['resolvedThisStage'] = j['countsCurrent']['resolvedThisStage'] + 1
j['countsCurrent']['resolvedTotal'] = j['countsCurrent']['resolvedTotal'] + 1

j['policy283Ledger20261027'] = {
    'recordedAt': '2026-10-27T09:55:00.000Z',
    'correctionAccepted': '283 上一阶段实际使用 7 次审校调用，超过 5 次上限 2 次；void/failed 一律计费计额度。',
    'priorPhaseLedger': {'cap': 5, 'used': 7, 'effective': 5, 'void': 2, 'usage': {'inputTokens': 270765, 'cachedInputTokens': 57344, 'outputTokens': 6978}},
    'rulesNow': [
        '每次模型调用前先做零调用预检：投影/上下文/绑定必须真实嵌入提示，并核对实际账本额度与在途调用',
        '不得自动追加重试；失败调用计入额度，重试需单独授权',
        'void/failed 与有效调用分列，用量照记',
    ],
    'appliedThisRound': 'b0099 review ran its preflight (bindings, projection embedding, prior-review absence, in-flight count) before its single call; the 199-1 audit failure is recorded as a billed void call and was not retried',
}

j['round20261027T0955'] = {
    'recordedAt': '2026-10-27T09:55:00.000000+00:00',
    'round': '2026-10-27T09:25-09:55Z',
    'resolved': [{
        'objectId': 'web-chapter:nemata-jp-chapter-201-1',
        'articleId': 'chapter03-section015',
        'candidateSha256': c201_sha,
        'auditSha256': a201_sha,
        'targets': ['modern-yabejp-ja:chapter03-section015:b0041'],
        'handoff': HANDOFF,
    }],
    'chapter283_1': entry['chapterAggregation20261027'],
    'producedNotAudited': [{
        'objectId': 'web-chapter:nemata-jp-chapter-199-1',
        'candidateSha256': c199_sha,
        'auditCallId': '21477900-c7b4-4383-ba03-e99875dc538b',
        'auditStatus': 'failed-transport',
        'retried': False,
    }],
    'modelCalls': {
        'total': 5,
        'effective': 4,
        'void': 1,
        'production': 2,
        'audit': 3,
        'detail': [
            {'chapter': 'nemata-jp-chapter-283-1', 'kind': 'audit', 'scope': 'b0099-limited-review', 'callId': '91065dda-1315-437b-8bf1-70612d154648', 'usage': {'inputTokens': 12994, 'cachedInputTokens': 0, 'outputTokens': 1366}, 'void': False},
            {'chapter': 'nemata-jp-chapter-199-1', 'kind': 'production', 'callId': load(C199)['provenance']['attempts'][0]['callId'], 'usage': load(C199)['provenance']['attempts'][0]['usage'], 'void': False},
            {'chapter': 'nemata-jp-chapter-199-1', 'kind': 'audit', 'callId': '21477900-c7b4-4383-ba03-e99875dc538b', 'usage': {'inputTokens': 21547, 'cachedInputTokens': 21376, 'outputTokens': 1199}, 'void': True, 'voidReason': 'unexpected transport-diagnostic item; runtime gate rejected the call'},
            {'chapter': 'nemata-jp-chapter-201-1', 'kind': 'production', 'callId': prod201['callId'], 'usage': prod201['usage'], 'void': False},
            {'chapter': 'nemata-jp-chapter-201-1', 'kind': 'audit', 'callId': '16082ed6-d090-4ee3-9bed-1f20c32ab1bc', 'usage': {'inputTokens': 17057, 'cachedInputTokens': 0, 'outputTokens': 482}, 'void': False},
        ],
        'deterministicRejections': 0,
        'zeroCallPreflight': ['b0099 review preflight', '199-1 production --preflight-only', '201-1 production --preflight-only'],
    },
    'rerivedFrom249': '250/249 lane status not re-read this round; no overlap was taken with the parallel ordinary-web lane root split off',
    'stillOpen': {
        'needsRepair': j['countsCurrent']['needsRepair'],
        'list': [
            'nemata-jp-chapter-283-1 (content resolved; 250 staging decision pending)',
            'nemata-jp-chapter-199-1 (revision1 produced; audit call was a billed void; retry needs authorisation)',
            'nemata-jp-chapter-215-4 (revision entry decision)',
            'nemata-jp-chapter-236-1 (entry decision)',
        ],
    },
    'nextBatchWish': '199-1 retry decision; 236-1 entry decision; continue the remaining small web chapters',
}
j['latestRound'] = {
    'at': '2026-10-27T09:55:00.000000+00:00',
    'objects': ['nemata-jp-chapter-201-1', 'nemata-jp-chapter-283-1', 'nemata-jp-chapter-199-1'],
    'productionModelCalls': 2,
    'auditModelCalls': 3,
    'voidModelCalls': 1,
    'deterministicRejections': 0,
    'note': 'b0099 passed its single bounded review; 283-1 chapter aggregation classifies all 174 audit entries and is handed for a 250 staging decision; 201-1 passed and is handed; 199-1 revision produced but its one audit call was a billed void and was not retried',
    'stillOpen': ['nemata-jp-chapter-215-4', 'nemata-jp-chapter-236-1', 'nemata-jp-chapter-199-1'],
}
j['refreshedAt'] = '2026-10-27T09:55:00.000000+00:00'

out = json.dumps(j, ensure_ascii=False, indent=1) + '\n'
with open(LIST, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(out)

print(json.dumps({
    'handoff': HANDOFF,
    'handoffSha256': handoff_sha,
    'listSha256': sha_bytes(out.encode('utf-8')),
    'listBytes': len(out),
    'counts': j['countsCurrent'],
}, ensure_ascii=False, indent=1))
