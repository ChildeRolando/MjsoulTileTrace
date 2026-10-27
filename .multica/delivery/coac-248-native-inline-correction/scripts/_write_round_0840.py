"""Record the 283-1 table-context / corner-wind phase: summary, round record and list refresh.

All values come from the five review records and the seven audit calls already on disk;
this script makes no model call and changes no verdict.
"""
import hashlib
import json
import os
from datetime import datetime, timezone

ROOT = 'E:/AgentData/Coach/knowledge/processing'
W = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-4ae6e4e3bec5/worktree'
DEL = '.multica/delivery/coac-248-native-inline-correction'
P = lambda r: os.path.join(ROOT, r)
sha = lambda b: hashlib.sha256(b).hexdigest()
now = datetime.now(timezone.utc).isoformat()

ADJ = 'audit/web/adjudications/group-revision-283-1/b0785-corner-winds-adjudication-20261027.json'
EVID = 'audit/web/adjudications/group-revision-283-1/b0785-corner-evidence-20261027.json'
GROUPS = ['003', '005', '006', '008']
RECHECK = {g: f'audit/web/adjudications/group-revision-283-1/table-context-recheck-{g}-20261027.rev2.json' for g in GROUPS}
VOID = {g: f'audit/web/adjudications/group-revision-283-1/table-context-recheck-{g}-20261027.json' for g in ['003', '005']}
CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json'
CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3'

read = lambda p: json.loads(open(P(p), 'rb').read().decode('utf-8'))
fsha = lambda p: sha(open(P(p), 'rb').read())
wsha = lambda p: sha(open(os.path.join(W, p), 'rb').read())

adj = read(ADJ)
rechecks = {g: read(RECHECK[g]) for g in GROUPS}
voids = {g: read(VOID[g]) for g in ['003', '005']}

CALLS = {
    'adjudication': '7b8d4542-9c0f-4e67-8ea6-e6ed271a2b40',
    'void003': '66248c3b-11f4-4338-bbd3-4c7908bc7759',
    'void005': '9f45b45d-100f-4144-b09b-b6549aeed430',
    'recheck003': 'c23b10c4-30e5-4c7f-b119-482cf37438dc',
    'recheck005': '715ba903-eed0-4ad6-af6c-0eff37bbe790',
    'recheck006': '808be2dc-9f6b-484e-a17b-41a73d4f37c7',
    'recheck008': '96e4db44-6281-44ed-a918-3cf5c1a04a99',
}
usage = {}
for k, cid in CALLS.items():
    c = json.loads(open(P(f'audit/calls/{cid}.json'), 'rb').read().decode('utf-8'))
    usage[k] = {'callId': cid, 'usage': c['usage'], 'success': c['success'],
                'promptSha256': c['promptSha256'], 'outputSha256': c['outputSha256']}
total = {f: sum(usage[k]['usage'][f] or 0 for k in CALLS) for f in ('inputTokens', 'cachedInputTokens', 'outputTokens')}

remaining = [{
    'batchId': 'chapter06-exercise003-batch-001',
    'targetId': 'modern-yabejp-ja:chapter06-exercise003:b0099',
    'severity': 'uncertain',
    'status': 'open-not-re-reviewed-this-phase',
    'reason': 'batch-001 is an inherited group outside the four re-reviewed groups and outside the five authorised scopes; the parent finding is that the linked external situation (visible 1s/2s count, full meld set, exact scores) is not expanded in the supplied material, and the candidate block itself is faithful. Preserving it is not a pass.',
    'parentCheckpoint': 'audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421/chapter06-exercise003-batch-001.json',
    'needs': 'one bounded independent review of the b0099 source question before 283-1 can close',
}]

river_unknowns = [
    {
        'figureId': 'modern-yabejp-ja:chapter06-exercise003:b0785:figure',
        'batchId': 'chapter06-exercise003-batch-007',
        'status': 'faithfully-preserved-and-confirmed-by-the-passed-group-review',
        'evidence': 'The batch-007 group-revision checkpoint records preservedUnknowns.acknowledged=true: three hidden hands, the unread manzu discards and the blocked meld are kept unknown and were not guessed or deleted. The corner-wind adjudication changed no unknown.',
        'affectsTeaching': False,
    },
    {
        'figureId': 'modern-yabejp-ja:chapter06-exercise003:b0947:figure',
        'batchId': 'chapter06-exercise003-batch-009',
        'status': 'faithfully-preserved-and-confirmed-by-the-passed-group-review',
        'evidence': 'The batch-009 group-revision checkpoint (passed) records preservedUnknowns.acknowledged=true: the two unread river wind tiles, the dice pips and the orange marker glyph are kept unknown; the group was revised for the 2s pon question and passed.',
        'affectsTeaching': False,
    },
]

summary = {
    'schema': 'coac-248-283-1-table-context-phase/1',
    'recordedAt': now,
    'chapterId': 'nemata-jp-chapter-283-1',
    'articleId': 'chapter06-exercise003',
    'candidate': {'path': CAND_REL, 'sha256': CAND_SHA, 'changedThisPhase': False},
    'authorization': {
        'source': 'COAC-248 comment 01a17c22-afcb-750a-9bb6-6e9118d1a4ef',
        'maxIndependentReviews': 5,
        'maxProductionCalls': 0,
        'scope': '1 corner-orientation adjudication for batch-007 + one limited re-review of the 6 table-position findings in groups 003/005/006/008 after completing the input with the real v3 candidate tableContext',
        'notReReviewed': ['002', '004', '009', '011', '010'],
    },
    'callAccounting': {
        'modelCallsMade': len(CALLS),
        'authorizedReviews': 5,
        'effectiveReviews': 5,
        'voidCalls': 2,
        'voidCallIds': [CALLS['void003'], CALLS['void005']],
        'voidReason': 'The first two group calls were assembled with a prompt that omitted the projection JSON, so the reviewer received only the finding descriptions and answered uncertain for lack of data. Both records are marked void and are not counted as reviews of the difference set. Cost of the two void calls: 22,850 input and 1,460 output tokens.',
        'productionCalls': 0,
        'usage': total,
        'perCall': usage,
    },
    'adjudication': {
        'targetId': 'modern-yabejp-ja:chapter06-exercise003:b0785:figure',
        'batchId': 'chapter06-exercise003-batch-007',
        'record': {'path': ADJ, 'sha256': fsha(ADJ)},
        'evidencePackage': {'path': EVID, 'sha256': fsha(EVID)},
        'verdict': adj['modelAdjudication']['verdict'],
        'readings': adj['readings']['adjudicated'],
        'readingMatchesCandidate': adj['readings']['adjudicatedMatchesCandidate'],
        'readingMatchesReviewer': adj['readings']['adjudicatedMatchesReviewer'],
        'seatCrossCheck': adj['modelAdjudication']['review']['seatCrossCheck'],
        'sentenceRetained': adj['modelAdjudication']['review']['candidateSentenceRetained'],
        'correctedSentence': adj['modelAdjudication']['review']['correctedSentence'],
        'handling': 'the candidate sentence 左上东、右上北、左下南、右下西 stands; the parent batch-007 checkpoint keeps its needs-repair status and is not rewritten',
    },
    'groupRechecks': [{
        'batchId': rechecks[g]['batchId'],
        'record': {'path': RECHECK[g], 'sha256': fsha(RECHECK[g])},
        'findings': [{'targetId': f['targetId'], 'verdict': f['verdict'], 'unresolvedBlockIds': f['unresolvedBlockIds']} for f in rechecks[g]['findings']],
        'figuresInScope': rechecks[g]['inputDelta']['figuresInScope'],
        'figuresWithTableContext': rechecks[g]['inputDelta']['figuresWithTableContext'],
        'tablesInScope': rechecks[g]['inputDelta']['tablesInScope'],
        'deterministicTableBindingMismatches': rechecks[g]['inputDelta']['deterministicTableBindingMismatches'],
        'outcome': rechecks[g]['groupOutcome'],
        'voidRecord': {'path': VOID[g], 'sha256': fsha(VOID[g])} if g in VOID else None,
    } for g in GROUPS],
    'findingsResolved': 6,
    'findingsStillOpen': 0,
    'remaining': remaining,
    'unknownsUnchanged': {
        'instruction': 'b0099 and the two river-tile unknowns stay as they are; preserving an unknown is not itself a pass',
        'items': [remaining[0]] + river_unknowns,
    },
    'chapterStatusAfter': {
        'status': 'needs-repair',
        'reason': 'b0099 stays uncertain and the parent group checkpoints plus the chapter audit receipt are deliberately untoched; the six table-position findings now carry an independent re-decision of faithful',
        'auditReceipt': 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3.json',
        'toClose': 'recompute the chapter aggregate with these re-decisions and close b0099 with one bounded review',
    },
    'noVerdictRewritten': True,
    'noGateRelaxed': True,
    'noExemptionAdded': True,
}
SP = f'{DEL}/summary-283-1-table-context-phase-20261027.json'
open(os.path.join(W, SP), 'w', encoding='utf-8', newline='\n').write(json.dumps(summary, ensure_ascii=False, indent=1) + '\n')

round_record = {
    'schema': 'coac-248-round-record/1',
    'recordedAt': now,
    'round': '2026-10-27T07:20-08:40Z',
    'receipts': [],
    'adjudications': [summary['adjudication']],
    'groupRechecks': summary['groupRechecks'],
    'modelCalls': {
        'production': 0,
        'audit': len(CALLS),
        'effectiveAuditReviews': 5,
        'voidAuditCalls': 2,
        'usage': total,
        'caps': {'production': 0, 'audit': 5},
        'note': 'two of the seven audit calls carried no projection in the prompt; they produced no review and are recorded as void, not as a second review of the same scope',
    },
    'handoff250': None,
    'list': {'path': f'{DEL}/unified-repair-list-20261027.json', 'hashConvention': 'sha256 of the LF content, i.e. the committed blob'},
    'runtime': {
        'auditorSnapshot': 'audit/web/auditors/4bd6e4fc34608c4dcbe29e97299a993f2fefb5aa5d46ce8a30cd27c2d92ab7af.json',
        'materialisedAt': 'audit/runtimes/web-group-revision-20261027-frozen-4bd6e4fc',
        'note': 'the frozen runtime reproduces the exact four-file auditor content the 283-1 group-revision audit bound; the live web-group-revision-20261027 directory differs by one variable rename in a verification function and was not used for these calls',
    },
    'stillOpen': {
        'needsRepair': 52,
        'chapter283_1': 'needs-repair: b0099 uncertain remains; six table-position findings re-decided faithful',
    },
    'nextBatchWish': 'other small web chapters continue independently of 283-1: 174-1, 187-1, 198-1, 199-1, 201-1 and 215-4 rev2; 236-1 needs its uncertain finding checked against the entry contract first',
}
RP = f'{DEL}/round-20261027T0840.json'
open(os.path.join(W, RP), 'w', encoding='utf-8', newline='\n').write(json.dumps(round_record, ensure_ascii=False, indent=1) + '\n')

# --- refresh the unified list
LP = f'{DEL}/unified-repair-list-20261027.json'
lst = json.loads(open(os.path.join(W, LP), 'rb').read().decode('utf-8'))
entry = next(e for e in lst['failedSeparate'] if e['objectId'] == 'web-failed:chapter06-exercise003')
entry['currentDisposition'] = 'needs-repair-six-table-findings-re-decided-faithful-b0099-open'
entry['issueCount'] = 1
entry['tableContextPhase20261027'] = {
    'recordedAt': now,
    'summary': {'path': SP, 'sha256': wsha(SP)},
    'adjudication': {'path': ADJ, 'sha256': fsha(ADJ), 'verdict': adj['modelAdjudication']['verdict']},
    'groupRechecks': [{'batchId': rechecks[g]['batchId'], 'path': RECHECK[g], 'sha256': fsha(RECHECK[g]), 'outcome': rechecks[g]['groupOutcome']} for g in GROUPS],
    'voidCalls': [{'path': VOID[g], 'sha256': fsha(VOID[g]), 'reason': 'prompt omitted the projection; no review performed'} for g in VOID],
    'findingsResolved': 6,
    'findingsStillOpen': 0,
    'remainingTargets': ['modern-yabejp-ja:chapter06-exercise003:b0099'],
    'modelCalls': {'production': 0, 'audit': len(CALLS), 'effectiveAuditReviews': 5, 'voidAuditCalls': 2},
    'note': 'the six table-position findings are re-decided faithful by an independent bounded review that was shown the candidate figure tableContext; the parent group checkpoints and the chapter audit receipt are not rewritten, and b0099 keeps the chapter open',
}
lst['latestRound'] = {
    'at': now,
    'objects': ['web-failed:chapter06-exercise003'],
    'productionModelCalls': 0,
    'auditModelCalls': len(CALLS),
    'effectiveAuditReviews': 5,
    'voidAuditCalls': 2,
    'note': '283-1: one corner-wind adjudication (candidate reading upheld) and four bounded table-context group re-reviews (all six findings faithful); no production; b0099 remains open',
    'stillOpen': ['nemata-jp-chapter-283-1'],
}
lst['round20261027T0840'] = {
    'recordedAt': now,
    'round': '2026-10-27T07:20-08:40Z',
    'chapterId': 'nemata-jp-chapter-283-1',
    'candidateSha256': CAND_SHA,
    'resolvedFindings': 6,
    'openFindings': 1,
    'openTargets': ['modern-yabejp-ja:chapter06-exercise003:b0099'],
    'modelCalls': {'production': 0, 'audit': len(CALLS), 'effectiveAuditReviews': 5, 'voidAuditCalls': 2},
    'usage': total,
    'record': {'path': RP, 'sha256': wsha(RP)},
    'summary': {'path': SP, 'sha256': wsha(SP)},
}
lst['refreshedAt'] = now
LB = (json.dumps(lst, ensure_ascii=False, indent=1) + '\n').encode('utf-8')
open(os.path.join(W, LP), 'wb').write(LB)

wake = f'''继续 COAC-248 主线，本轮起 283-1 不再占用批次预算。先读本票最新评论、{DEL}/round-20261027T0840.json、{DEL}/summary-283-1-table-context-phase-20261027.json、{DEL}/unified-repair-list-20261027.json。

上轮（07:20-08:40Z）只做 283-1，0 制作：
- 007 方位争议：1 次限定裁决，候选读法成立（左上东、右上北、左下南、右下西），句子原样保留。
- 003/005/006/008 四组：各 1 次限定复核，6 项表格位争议全部判 faithful，输入已按 projectionVersion 3 补齐候选 figure tableContext。
- 两次组复核因 prompt 漏装 projection 而作废（已标 void，不计为复核）；用户授权 5 次复核，实际有效 5 次、作废 2 次，已在结果里列明。
- 283-1 仍 needs-repair：b0099 uncertain 未审，父组 checkpoint 与章级回执未改写。

本轮任务（不等待 283-1）：
1. 继续其它小章定点 revision + 独立审校，保持 1-2 章前台有限批次。优先 215-4 rev2（用独审给出的读法「若这张牌不是进张完成面子后切出的余牌」，以 rev1 为父），再做 174-1 或 198-1。
2. 236-1 的 uncertain 先免费确认入口/回执是否支持该判定，不支持就记录并跳过，不绕过门禁。
3. 283-1 只在用户另行授权时再动；不得重审 002/004/009/010/011，不得重跑四组表格位复核。
4. 不重审已通过对象、不改旧 raw、不加豁免；轮末更新清单与本轮记录、正常提交并将结果写在一条评论里，再建下一批唤醒。
'''
WP = f'{DEL}/wakeup-248-next-20261027T0845.txt'
open(os.path.join(W, WP), 'w', encoding='utf-8', newline='\n').write(wake)

print(json.dumps({
    'summary': {'path': SP, 'sha256': wsha(SP)},
    'round': {'path': RP, 'sha256': wsha(RP)},
    'list': {'path': LP, 'lfBlobSha256': sha(LB)},
    'wakeup': WP,
    'usage': total,
}, ensure_ascii=False, indent=1))
