# -*- coding: utf-8 -*-
import json, io, hashlib, os
ROOT = 'E:/AgentData/Coach/knowledge/processing'
DEL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-f36510ad38d9/worktree/.multica/delivery/coac-248-native-inline-correction'


def sha(p):
    return hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()


def jwrite(path, obj):
    io.open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


NOW = '2026-10-27T10:50:00.000Z'

# ---- 199-1 handoff to 250 ----
cand13 = 'web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json'
aud13 = 'audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.retry-1793095290967-e15ea7b7.json'
handoff = {
    "schema": "coac250-incremental-staging-receipt/1",
    "recordedAt": NOW,
    "modelCalls": 0, "productionCalls": 0,
    "from_": "COAC-248", "to": "COAC-250",
    "before": {"pointer": "accepted-content-preview-2026-10-27T07-16-27-706Z", "chapters": 207, "units": 215, "selectedWeb": 178, "pendingWeb": 45},
    "chapters": [{
        "chapterId": "nemata-jp-chapter-199-1",
        "articleId": "chapter03-section013",
        "sourcePath": "web-sources/v1/modern-yabejp-ja/articles/chapter03-section013/source.json",
        "sourceSha256": "487d432cf454023931abc6b321412162da65095954a4002fcf733133fecfd863",
        "parentPath": "web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.display.json",
        "parentSha256": "37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292",
        "parentAuditPath": "audit/web/articles/modern-yabejp-ja/chapter03-section013.37849d97bb734d560b1d8099e8fa97760f6d62cbe6147030bfc7012458654292.retry-1792984608856-ca1856a7.json",
        "parentAuditSha256": "3856483c70366c5ba7a225ca80042f4b54072da96b8acfc9f906a78c41fd6f49",
        "candidatePath": cand13, "candidateSha256": sha(cand13),
        "auditPath": aud13, "auditSha256": sha(aud13),
        "auditStatus": "passed",
        "auditMethod": "independent-target-text-review-plus-unchanged-parent-audit",
        "targets": ["modern-yabejp-ja:chapter03-section013:b0006", "modern-yabejp-ja:chapter03-section013:b0009"],
        "changed": "b0006/b0009 及同段的「向听牌形」改为「一向听牌形」；其余 21 个文本块逐字节不变，14 个图元只去掉 presentationAsset。",
        "productionCallId": "f9f86b8d-2064-4040-8867-d034c0bf361e",
        "productionUsage": {"inputTokens": 15346, "cachedInputTokens": 0, "outputTokens": 464},
        "auditCallId": "8c774f65-879e-4ab6-93c1-7e34414bc610",
        "auditUsage": {"inputTokens": 21545, "cachedInputTokens": 0, "outputTokens": 2401},
        "retryOfAudit": {"path": "audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.json", "sha256": "4652f1bdc0504742e20ac3de8c8d8bf99caee4d4f055cb0122f59b1ce149959d", "voidCallId": "21477900-c7b4-4383-ba03-e99875dc538b"},
        "note": "首个独立审校调用因运行期把 transport 诊断条目判为 unexpected item 而 failed/void（已计费、已计入额度）；本轮按 owner 的「继续199」指令只重试 1 次即 passed。失败回执原样保留，retry 回执用 retryOfAudit 指回。"
    }]
}
jwrite(os.path.join(ROOT, 'integration', 'coac250-incremental-199-1-20261027.json'), handoff)
print('handoff250 sha', sha('integration/coac250-incremental-199-1-20261027.json'))

# ---- 199-1 receipt ----
receipt199 = {
    "schema": "coac-248-object-receipt/1",
    "objectId": "web-chapter:nemata-jp-chapter-199-1",
    "chapterId": "nemata-jp-chapter-199-1",
    "articleId": "chapter03-section013",
    "recordedAt": NOW,
    "status": "passed-awaiting-250-merge",
    "candidatePath": cand13, "candidateSha256": sha(cand13),
    "auditPath": aud13, "auditSha256": sha(aud13), "auditStatus": "passed",
    "voidAudit": {
        "path": "audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.json",
        "sha256": "4652f1bdc0504742e20ac3de8c8d8bf99caee4d4f055cb0122f59b1ce149959d",
        "callId": "21477900-c7b4-4383-ba03-e99875dc538b",
        "usage": {"inputTokens": 21547, "cachedInputTokens": 21376, "outputTokens": 1199},
        "reason": "runtime rejected the transport diagnostic item; the model had returned a complete target-text review"
    },
    "retry": {"authorisedBy": "2026-10-27T09:56:18Z owner comment: 继续199/201等保留章", "calls": 1,
              "callId": "8c774f65-879e-4ab6-93c1-7e34414bc610",
              "usage": {"inputTokens": 21545, "cachedInputTokens": 0, "outputTokens": 2401}},
    "handoff250": "integration/coac250-incremental-199-1-20261027.json"
}
jwrite(os.path.join(DEL, 'receipt-199-1.rev1-passed.json'), receipt199)

# ---- p217 chain + adjudication ----
p217_chain = [
    {"rev": "rev1", "root": "production/sol-high-field-repair22-20261027-p217",
     "candidateSha256": "279dab7bb834bc463ce8b0c89678f2dc8c164af9e7f3c3504784fde4d7876494",
     "auditPath": "audit/pages/79-cn/page-0217.279dab7bb834bc463ce8b0c89678f2dc8c164af9e7f3c3504784fde4d7876494.6baa4a7e1404.json",
     "auditStatus": "needs-repair", "auditUsage": {"inputTokens": 20595, "cachedInputTokens": 0, "outputTokens": 6891},
     "changes": ["北家第二行 8m→9m", "补录可见牌背 南13/西13/东10", "ドラ 栏改为不判定宝牌/指示牌"],
     "rejected": ["审校的 第二行5m→6m（同图锚点反证，见 adjudication）"]},
    {"rev": "rev2", "root": "production/sol-high-field-repair23-20261027-p217b",
     "candidateSha256": "2a7551768ad0668da86d159e9f677b45a6c7a68a0500a2b3ef95b461bf33e5cd",
     "auditPath": "audit/pages/79-cn/page-0217.2a7551768ad0668da86d159e9f677b45a6c7a68a0500a2b3ef95b461bf33e5cd.6baa4a7e1404.json",
     "auditStatus": "needs-repair", "auditUsage": {"inputTokens": 20596, "cachedInputTokens": 0, "outputTokens": 6273},
     "changes": ["东家两行改为各列自下向上并反转序列（依据同书已过审 p254 的东家写法）"],
     "rejected": []},
    {"rev": "rev3", "root": "production/sol-high-field-repair24-20261027-p217c",
     "candidateSha256": "ebe43a8c9e3a181bf26a10dd2afc9d472cd4645833a99f3803e2b6edfc27d2ea",
     "auditPath": "audit/pages/79-cn/page-0217.ebe43a8c9e3a181bf26a10dd2afc9d472cd4645833a99f3803e2b6edfc27d2ea.6baa4a7e1404.json",
     "auditStatus": "needs-repair", "auditUsage": {"inputTokens": 20594, "cachedInputTokens": 0, "outputTokens": 4400},
     "changes": ["北家手牌第7张 9s→8s", "北家第一行第2、4张 8s→9s", "西家第一行第5张 8s→9s（三处均经红/绿像素量确认）"],
     "rejected": []},
    {"rev": "rev4", "root": "production/sol-high-field-repair25-20261027-p217d",
     "candidateSha256": "99f98c0257142c5a02f701b0293263e7fa9d28f34cf6a023ca6dca79bd267101",
     "auditPath": None, "auditStatus": "not-audited", "auditUsage": None,
     "changes": ["西家第二行第二张加待核标注（旋转万子牌，数字低于位图分辨率）"],
     "rejected": []},
]
adj = {
    "schema": "coac-248-p217-tile-adjudication/1",
    "recordedAt": NOW,
    "objectId": "79-cn:page:217",
    "figure": "79-cn-p217-r1",
    "assetPath": "assets/64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978.png",
    "assetPixels": [430, 463],
    "question": "北家舍牌第二行第二张是 8m（四次独立审校一致）还是 9m（本轮测量）",
    "method": "同图锚点：北家手牌前两张为 8m（四次审校均认可）。把四张牌切成两块做 Pearson 相关：萬 半部（下 30 行）与 数字半部（上 26 行）。",
    "correlations": {
        "full": {"anchor8m_vs_anchor8m": 0.905, "disputed_vs_anchor8m": [0.565, 0.569]},
        "wan_half": {"anchor_vs_anchor": 0.885, "disputed_vs_anchor": [0.885, 0.871]},
        "numeral_half": {"anchor_vs_anchor": 0.920, "disputed_vs_anchor": [0.267, 0.295]}
    },
    "reading": "萬 半部四张牌互相关 0.87–0.94（同一渲染、同一方向、同一尺度）；数字半部两张 8m 互相关 0.92，争议牌只有 0.27–0.30。即争议牌与 8m 只在「萬」上相同、在数字上完全不同，放大后字形带钩。",
    "conclusion": "争议牌不是 8m；本轮保留 9m，不按审校改回 8m。",
    "notDone": "没有把该页标 passed，没有改旧回执，没有为这一张牌追加重审；建议 owner 或 249 做一次仅限该牌的独立裁决。",
    "reviewRuns": [{"rev": r["rev"], "auditPath": r["auditPath"], "auditStatus": r["auditStatus"]} for r in p217_chain if r["auditPath"]]
}
jwrite(os.path.join(DEL, 'adjudication-p217-tile-20261027.json'), adj)

chain_rec = {
    "schema": "coac-248-object-receipt/1",
    "objectId": "79-cn:page:217",
    "recordedAt": NOW,
    "status": "revision4-produced-not-audited; one tile disputed by four audits, image evidence says not-8m; one position disclosed as unknown",
    "parentCandidateSha256": "73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add",
    "chain": p217_chain,
    "claim": {"registry": "parallel/claims/79-cn-chapter-217-4.json", "lane": "A", "owner": "COAC-248 Mika"},
    "nextBatch": "对 rev4 跑 1 次页审校；若仍只剩该张万子争议，把 adjudication-p217-tile-20261027.json 交 owner 或 249 做仅限该牌的裁决"
}
jwrite(os.path.join(DEL, 'receipt-p217-revision-chain-20261027.json'), chain_rec)
print('p217 rev4 sha', sha('production/sol-high-field-repair25-20261027-p217d/candidates/79-cn/page-0217.json'))
