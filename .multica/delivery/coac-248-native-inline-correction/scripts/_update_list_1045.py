# -*- coding: utf-8 -*-
import json, io, hashlib, os
ROOT = 'E:/AgentData/Coach/knowledge/processing'
DEL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-f36510ad38d9/worktree/.multica/delivery/coac-248-native-inline-correction'
P = os.path.join(DEL, 'unified-repair-list-20261027.json')


def sha(p):
    return hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()


j = json.load(io.open(P, encoding='utf-8'))
by_id = {o['objectId']: o for o in j['objects']}

# ---- 199-1 resolved ----
o199 = by_id['web-chapter:nemata-jp-chapter-199-1']
o199.update({
    "candidatePath": "E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter03-section013.rev1.json",
    "candidateSha256": "3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8",
    "auditPath": "audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.retry-1793095290967-e15ea7b7.json",
    "auditStatus": "passed",
    "auditSha256": "2247cb220cf2b82a291510f5ca06573c3c8c13720065d63d884bf2499d5c0563",
    "issueCount": 0,
    "currentDisposition": "passed-awaiting-250-merge",
    "voidAuditPreserved": "audit/web/articles/modern-yabejp-ja/chapter03-section013.3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8.json (4652f1bd…, void call 21477900… billed)",
    "handoff250": "integration/coac250-incremental-199-1-20261027.json",
})

# ---- 217 revision chain ----
o217 = by_id['79-cn:page:217']
o217.update({
    "candidatePath": "E:/AgentData/Coach/knowledge/processing/production/sol-high-field-repair25-20261027-p217d/candidates/79-cn/page-0217.json",
    "candidateSha256": "99f98c0257142c5a02f701b0293263e7fa9d28f34cf6a023ca6dca79bd267101",
    "auditPath": "audit/pages/79-cn/page-0217.ebe43a8c9e3a181bf26a10dd2afc9d472cd4645833a99f3803e2b6edfc27d2ea.6baa4a7e1404.json",
    "auditStatus": "needs-repair",
    "issueCount": 2,
    "currentDisposition": "revision4-produced-not-audited; all suits fixes accepted by audit3; only the north second-row 9m/8m dispute (image evidence: not 8m) and one disclosed unknown remain",
    "revisionChain": "receipt-p217-revision-chain-20261027.json",
    "adjudication": "adjudication-p217-tile-20261027.json",
})

j['countsCurrent'] = dict(j['countsCurrent'])
j['countsCurrent']['needsRepair'] = j['countsCurrent'].get('needsRepair', 48) - 1
j['countsCurrent']['resolvedThisStage'] = j['countsCurrent'].get('resolvedThisStage', 10) + 1
j['countsCurrent']['resolvedTotal'] = j['countsCurrent'].get('resolvedTotal', 14) + 1

j['round20261027T1045'] = {
    "recordedAt": "2026-10-27T10:50:00.000000+00:00",
    "round": "2026-10-27T09:58-10:50Z",
    "parallelEntry": {
        "mechanism": "parallel/slots.mjs (COAC-244 delivery f5b4815, 15/15 verified)",
        "claim": {"chapterId": "79-cn-chapter-217-4", "lane": "A", "owner": "COAC-248 Mika",
                  "candidateSha256": "73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add",
                  "path": "parallel/claims/79-cn-chapter-217-4.json"},
        "makerSlot": "not acquired: this round dispatched no production model call (all page work is deterministic repair + independent page audit)",
        "liveMakersAtRoundStart": 0
    },
    "resolved": [{
        "objectId": "web-chapter:nemata-jp-chapter-199-1",
        "candidateSha256": "3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8",
        "auditSha256": "2247cb220cf2b82a291510f5ca06573c3c8c13720065d63d884bf2499d5c0563",
        "handoff": "integration/coac250-incremental-199-1-20261027.json",
        "handoffSha256": "5ba224af71ac8bde1e984bac944701fcc25bd24aa95a4be7612fb57fb1adfe0d"
    }],
    "producedNotPassed": [{
        "objectId": "79-cn:page:217",
        "candidateSha256": "99f98c0257142c5a02f701b0293263e7fa9d28f34cf6a023ca6dca79bd267101",
        "revisions": 4,
        "audits": 3,
        "open": ["北家第二行第二张 9m vs 审校的 8m（锚点相关性 0.90/0.57 反证 8m）", "西家第二行第二张 8m 已在转录中标待核"]
    }],
    "modelCalls": {
        "production": 0, "audit": 4, "void": 0, "deterministicRejections": 0,
        "usage": {"audit": {"inputTokens": 83230, "cachedInputTokens": 0, "outputTokens": 19965}},
        "detail": [
            {"object": "nemata-jp-chapter-199-1", "call": "8c774f65-879e-4ab6-93c1-7e34414bc610", "scope": "web target-text retry", "usage": "21545/0/2401"},
            {"object": "79-cn:page:217 rev1", "call": "audit-one-pdf-page", "usage": "20595/0/6891"},
            {"object": "79-cn:page:217 rev2", "call": "audit-one-pdf-page", "usage": "20596/0/6273"},
            {"object": "79-cn:page:217 rev3", "call": "audit-one-pdf-page", "usage": "20594/0/4400"}
        ]
    },
    "stillOpen": {
        "needsRepair": 47,
        "list": ["79-cn:page:217 (one disputed tile + one disclosed unknown)",
                 "nemata-jp-chapter-215-4 (entry decision: revision verifier rejects target-text parent receipt)",
                 "nemata-jp-chapter-236-1 (entry decision: parent audit has uncertain-only issue)",
                 "nemata-jp:page:98 / 257, supplement chapter02-section019, metadata pages 1/2/3/317 (evidence-blocked)"]
    },
    "nextBatch": "p217 rev4 audit -> if only the tile dispute remains, owner/249 limited adjudication; then nemata-jp:page:257 and the supplement"
}

j['latestRound'] = {
    "at": "2026-10-27T10:50:00.000000+00:00",
    "objects": ["web-chapter:nemata-jp-chapter-199-1", "79-cn:page:217"],
    "productionModelCalls": 0,
    "auditModelCalls": 4,
    "voidModelCalls": 0,
    "deterministicRejections": 0,
    "note": "199-1 passed on the single authorised retry and handed to 250; 79-cn:page:217 went rev1→rev4 on four verified source checks with three page audits, all suits fixes accepted, one 萬 tile disputed with anchor evidence",
    "stillOpen": ["79-cn:page:217", "nemata-jp-chapter-215-4", "nemata-jp-chapter-236-1"]
}
j['refreshedAt'] = '2026-10-27T10:50:00.000000+00:00'

out = json.dumps(j, ensure_ascii=False, indent=1) + '\n'
io.open(P, 'w', encoding='utf-8', newline='\n').write(out)
print('list sha', hashlib.sha256(out.encode('utf-8')).hexdigest())

round_rec = {
    "schema": "coac-248-round-record/1",
    "recordedAt": "2026-10-27T10:50:00.000000+00:00",
    "round": "2026-10-27T09:58-10:50Z",
    "trigger": "owner 2026-10-27T09:56:18Z: use COAC-244's verified entry/shared claim, continue the 199/201 reserved chapters, replace the fixed 10:30 timer with 'next limited batch as soon as the current phase ends'",
    "objects": [
        {"objectId": "web-chapter:nemata-jp-chapter-199-1", "result": "passed",
         "candidateSha256": "3d93eb869db859bf35ff7b6ab832cc88b45fbd035bc78018ace54b33ae293ec8",
         "auditSha256": "2247cb220cf2b82a291510f5ca06573c3c8c13720065d63d884bf2499d5c0563",
         "handoff": "integration/coac250-incremental-199-1-20261027.json"},
        {"objectId": "79-cn:page:217", "result": "revision4 produced, not passed",
         "candidateSha256": "99f98c0257142c5a02f701b0293263e7fa9d28f34cf6a023ca6dca79bd267101",
         "chainRecord": "receipt-p217-revision-chain-20261027.json",
         "adjudication": "adjudication-p217-tile-20261027.json"}
    ],
    "modelCalls": {"production": 0, "audit": 4, "void": 0},
    "entryIntegration": {
        "claimed": "79-cn-chapter-217-4 (lane A, owner COAC-248 Mika)",
        "makerSlot": "not needed this round (no production model call)",
        "note": "shared claim used for the page's chapter so a second line cannot dispatch the same object"
    },
    "stillOpen": ["79-cn:page:217", "nemata-jp-chapter-215-4", "nemata-jp-chapter-236-1"],
    "nextBatch": "audit p217 rev4 once; if only the 9m/8m tile remains, take the adjudication record to the owner or 249 as a one-tile decision; in parallel start nemata-jp:page:257 source check"
}
io.open(os.path.join(DEL, 'round-20261027T1045.json'), 'w', encoding='utf-8', newline='\n').write(json.dumps(round_rec, ensure_ascii=False, indent=1) + '\n')
print('round written')
