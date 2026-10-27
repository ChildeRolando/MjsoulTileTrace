import json, hashlib
ROOT = 'E:/AgentData/Coach/knowledge/processing'
DL = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-6506c6699664/worktree/.multica/delivery'
LP = DL + '/coac-248-native-inline-correction/unified-repair-list-20261027.json'
lst = json.load(open(LP, encoding='utf-8'))


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


now = '2026-10-27T02:56:00.000Z'

new_objects = [
    {
        "objectId": "web-chapter:nemata-jp-chapter-116-1",
        "kind": "web-article",
        "chapterId": "nemata-jp-chapter-116-1",
        "sourceId": "modern-yabejp-ja",
        "articleId": "chapter01-section041",
        "candidatePath": ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.display.json",
        "candidateSha256": sha(ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.display.json"),
        "auditPath": None,
        "auditStatus": "no-receipt",
        "issueCount": 1,
        "unitCount": 1,
        "pdfPages": [116, 117],
        "currentDisposition": "blocked-deterministic-gate",
        "origin": "COAC-250 unified chapter register 2026-10-27",
        "newThisStage": True,
        "diskShaVerified": True,
        "bodyComparison": {
            "verdict": "body-identical",
            "evidence": "the candidate's bound source text is identical to the nemata-jp PDF pages 116-117 text after edition-typography normalisation",
        },
        "blocker": {
            "kind": "web_translation_placeholder",
            "targetId": "modern-yabejp-ja:chapter01-section041:b0016",
            "observedAt": "2026-10-27T02:49:44Z",
            "detail": "the full-article audit refuses at the deterministic gate because b0016 still carries the translation placeholder for the repeated-text marker; no model call was made. The isolated revision route needs a needs-repair parent receipt, which cannot be created while the gate refuses, so the next step is a root-accepted correction entry for this one block, not a model retry.",
        },
    },
    {
        "objectId": "web-chapter:nemata-jp-chapter-131-1",
        "kind": "web-article",
        "chapterId": "nemata-jp-chapter-131-1",
        "sourceId": "modern-yabejp-ja",
        "articleId": "chapter01-section049",
        "candidatePath": ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.display.json",
        "candidateSha256": sha(ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.display.json"),
        "auditPath": ROOT + "/audit/web/articles/modern-yabejp-ja/chapter01-section049.470217d79cd1acd28f234a1e691d4d950ae99d0c0463e6bd0211561c95de28ac.json",
        "auditStatus": "needs-repair",
        "issueCount": 1,
        "unitCount": 1,
        "pdfPages": [131, 132, 133],
        "currentDisposition": "blocked-source-gate",
        "origin": "COAC-250 unified chapter register 2026-10-27",
        "newThisStage": True,
        "diskShaVerified": True,
        "auditSourceStale": False,
        "bodyComparison": {
            "verdict": "body-identical",
            "evidence": "bound source text equals the nemata-jp PDF pages 131-133 text; the source SHA recomputed from disk matches the register and the receipt",
        },
        "issue": {
            "targetId": "modern-yabejp-ja:chapter01-section049:b0123",
            "detail": "\u300c\u4e03\u5bfe\u5b50\u306e\u30ed\u30b9\u300d was translated as \u300c\u5931\u53bb\u4e03\u5bf9\u5b50\u7684\u53ef\u80fd\u6027\u300d, which overstates the loss: cutting one 6s breaks one pair but does not remove the seven-pairs route.",
        },
        "blocker": {
            "kind": "web_source_assets_not_complete",
            "observedAt": "2026-10-27T02:46:00Z",
            "detail": "the capture for chapter01-section049 is marked blocked-invalid-or-missing-original-image with 1 failed asset of 35 \u2014 modern-yabejp-ja:d2581cf81efbb0a5ec3d5bd4, an Amazon affiliate tracking pixel (assoc-amazon.jp/e/ir). The revision runner refuses the source at its asset gate. Not bypassed: a global source gate is not local to this repair.",
        },
    },
    {
        "objectId": "web-chapter:nemata-jp-chapter-183-1",
        "kind": "web-article",
        "chapterId": "nemata-jp-chapter-183-1",
        "sourceId": "modern-yabejp-ja",
        "articleId": "chapter03-section003",
        "candidatePath": ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.display.json",
        "candidateSha256": sha(ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter03-section003.display.json"),
        "auditPath": ROOT + "/audit/web/articles/modern-yabejp-ja/chapter03-section003.889adf0d0f694bc09475a5c35d83d758493e94af90c3e389dfdebfa5bf205b02.json",
        "auditStatus": "needs-repair",
        "issueCount": 1,
        "unitCount": 1,
        "pdfPages": [183],
        "currentDisposition": "decision-hold",
        "origin": "COAC-250 unified chapter register 2026-10-27",
        "newThisStage": True,
        "diskShaVerified": True,
        "bodyComparison": {
            "verdict": "body-identical",
            "evidence": "bound source text equals the nemata-jp PDF page 183 text",
        },
        "issue": {
            "targetId": "modern-yabejp-ja:chapter03-section003:b0018",
            "detail": "uncertain: the source sentence carries a quantity ambiguity",
        },
        "hold": "Earlier instruction stands: keep the author's \u300c\uff11\u679a\u5207\u308c\uff11\u679a\u898b\u3048\u300d exactly, do not rewrite it to \u6301\u3061 and do not insert an in-body note until the annotation wording is agreed. The source gate for this article is also blocked by the same kind of affiliate tracking pixel, so no revision route is open.",
        "modelCalls": 0,
    },
]

resolved = {
    "objectId": "web-chapter:nemata-jp-chapter-197-1",
    "kind": "web-article",
    "chapterId": "nemata-jp-chapter-197-1",
    "sourceId": "modern-yabejp-ja",
    "articleId": "chapter03-section011",
    "candidatePath": ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter03-section011.rev1.json",
    "candidateSha256": "6ad44173945b9347cd8dd7c44640fa3341bf8e83109695e4cd8aacc6d3d98b21",
    "auditPath": ROOT + "/audit/web/articles/modern-yabejp-ja/chapter03-section011.6ad44173945b9347cd8dd7c44640fa3341bf8e83109695e4cd8aacc6d3d98b21.json",
    "auditStatus": "passed",
    "issueCount": 0,
    "unitCount": 1,
    "pdfPages": [197],
    "currentDisposition": "resolved-passed-audit-awaiting-250-handoff",
    "origin": "COAC-250 unified chapter register 2026-10-27",
    "newThisStage": True,
    "diskShaVerified": True,
    "auditSourceStale": False,
    "parentCandidatePath": ROOT + "/web-production/v1/candidates/modern-yabejp-ja/chapter03-section011.display.json",
    "parentCandidateSha256": "f5b699f060d476958c88f4a8f45fe1e7f87037f89eb0a226ac51aa1c1f4bcf49",
    "parentAuditPath": ROOT + "/audit/web/articles/modern-yabejp-ja/chapter03-section011.f5b699f060d476958c88f4a8f45fe1e7f87037f89eb0a226ac51aa1c1f4bcf49.retry-1793066575642-39f02f00.json",
    "auditSha256": "407481634d84b5a861a7e31058f8d58de664872d2c61bbfe3827ad91e4079727",
    "bodyComparison": {
        "verdict": "body-identical",
        "evidence": "bound source text equals the nemata-jp PDF page 197 text; the audit evidence also records 85 body blocks, 41 figures and 65 image occurrences compared",
    },
    "resolution": {
        "kind": "isolated-target-text-revision",
        "scope": "only block modern-yabejp-ja:chapter03-section011:b0010; all other text blocks and all 41 figures unchanged",
        "issue": "the source \u300c\u306e\u5834\u5408\u306b\u9650\u3063\u3066\u300d marks the exception as applying only to those two cases; the parent translation dropped the restriction",
        "change": "\uff09\u7684\u60c5\u51b5\u4e0b\uff0c\u8fd8\u6709\u6d89\u53ca\u5f79\u79cd\u3001\u5355\u9a91\u542c\u724c\u4ee5\u5916\u7684\u4f8b\u5916\u3002\u90a3\u5c31\u662f\uff0c \u2192 \uff09\u8fd9\u4e24\u79cd\u60c5\u51b5\u4e0b\uff0c\u624d\u5b58\u5728\u9664\u5f79\u79cd\u56e0\u7d20\u3001\u5355\u9a91\u542c\u724c\u4e4b\u5916\u7684\u4f8b\u5916\u3002\u90a3\u5c31\u662f\uff0c",
        "producer": {
            "callId": "efa3c170-f343-4d1f-bd39-25e1ebbfd4d2",
            "route": "textbook-production-web.mjs --revision-from/--revision-notes",
            "usage": {"inputTokens": 14297, "outputTokens": 329},
            "targets": {
                "textIds": ["modern-yabejp-ja:chapter03-section011:b0010"],
                "figureIds": [],
            },
        },
        "audit": {
            "callId": "d6772b8c-6680-4ddb-a441-bd5263174738",
            "scope": "textbook-web-target-text-audit",
            "usage": {"inputTokens": 20654, "outputTokens": 385},
            "method": "independent-target-text-review-plus-unchanged-parent-audit",
            "inheritedParentCallIds": ["4ac4c202-182e-4d3e-9b4a-ae03d529b566"],
        },
        "parentPreserved": "parent candidate, parent raw and the parent needs-repair receipt are untouched",
        "chapterComplete": True,
        "chapterNote": "nemata-jp-chapter-197-1 is one unit; the article now passes, so the chapter has no remaining repair object.",
    },
}

existing_ids = {o['objectId'] for o in lst['objects']}
for o in new_objects + [resolved]:
    if o['objectId'] in existing_ids:
        raise SystemExit('duplicate object ' + o['objectId'])
lst['objects'].extend(new_objects + [resolved])

keep = {
    '79-cn-chapter-104-5',
    'nemata-jp-chapter-098-1',
    'nemata-jp-chapter-130-1',
    'nemata-jp-chapter-260-18',
    'nemata-jp-chapter-283-1',
    'nemata-jp-chapter-303-1',
}
lst['relatedNonRepair']['chapters'] = [
    c for c in lst['relatedNonRepair']['chapters'] if c.get('chapterId') in keep
]
have = {c.get('chapterId') for c in lst['relatedNonRepair']['chapters']}
for cid, action, note in [
    ('nemata-jp-chapter-130-1', 'staging-fix', 'candidate 021f93bc passes; only staging remains for COAC-250'),
    ('nemata-jp-chapter-260-18', 'staging-fix', 'PDF route passed; only selection/staging remains for COAC-250'),
    ('nemata-jp-chapter-283-1', 'failed-separate', 'production-assembly failure (0 model calls); the register classifies the same candidate as produced-unreviewed \u2014 both are true: no review exists because production never assembled. Not retried.'),
    ('nemata-jp-chapter-303-1', 'failed-separate', 'model review returned no usable review after 3 calls; not retried.'),
]:
    if cid not in have:
        lst['relatedNonRepair']['chapters'].append({'chapterId': cid, 'action': action, 'note': note})

integ = json.load(open(DL + '/coac-248-register-body-comparison/register-integration-20261027.json', encoding='utf-8'))
bc = json.load(open(DL + '/coac-248-register-body-comparison/body-comparison-final.json', encoding='utf-8'))
cn = json.load(open(DL + '/coac-248-register-body-comparison/body-comparison-cn.json', encoding='utf-8'))
lst['registerIntegration'] = {
    'registerPath': integ['register']['path'],
    'registerSha256': integ['register']['sha256'],
    'adoptedAt': now,
    'registerCounts': integ['register']['counts'],
    'superseded': 'the earlier 80-chapter / 63-unproduced figures; kept only as history',
    'registerUnpassedRows': integ['registerUnpassed'],
    'matchedExistingObjects': integ['matchedByExistingObject'],
    'untrackedRepair': integ['untracked']['repair'],
    'staging': integ['untracked']['staging'],
    'failed': integ['untracked']['failed'],
    'sharedCandidateSha': integ['dedupe']['sharedCandidateSha'],
    'dedupeBasis': 'object identity (web-chapter:<chapterId> or <sourceId>:page:<n>) first, then effective candidate SHA; 0 chapters missed, 0 chapters double-counted',
    'note': 'Matched count is before this round appended the four untracked repair objects; after the append every unpassed register row resolves to exactly one object or to the failed-separate list.',
}
lst['bodyComparison'] = {
    'recordedAt': now,
    'modelCalls': 0,
    'nemataJp': {
        'chapters': bc['counts'],
        'path': '.multica/delivery/coac-248-register-body-comparison/body-comparison-final.json',
    },
    'chinese': {
        'chapters': cn['counts'],
        'path': '.multica/delivery/coac-248-register-body-comparison/body-comparison-cn.json',
        'caveat': 'The Chinese register page ranges run past chapter boundaries (running heads and the next chapter title sit on the last page of a range), so this zero-model comparison cannot separate a mapping gap from a boundary artefact. It is recorded as evidence only; the governing Chinese substitution evidence stays integration/chinese-source-body-correspondence.json, which already carries bodyEquivalenceConfirmed=true per article->chapter mapping.',
    },
    'conclusion': 'Among the 44 Japanese chapters that have a web candidate, 40 bind exactly the print page body, 3 differ only because the last page of the register page range opens the next chapter (the differing sentences are present in another web article), and 1 differs only by list numbering. 4 further Japanese chapters have no web candidate and can only be covered by the print route. No print sentence of any web-covered Japanese chapter is absent from the web corpus.',
}

objs = lst['objects']
web = [o for o in objs if o['kind'] == 'web-article']
bps = [o for o in objs if o['kind'] == 'protected-supplement']
pdfs = [o for o in objs if o['kind'] == 'pdf-page']


def needs_repair(o):
    d = o.get('currentDisposition') or ''
    return d.startswith('needs-repair') or d.startswith('blocked-')


META = {'nemata-jp:page:1', 'nemata-jp:page:2', 'nemata-jp:page:3', 'nemata-jp:page:317'}
status = {
    'needsRepairOpen': [o['objectId'] for o in objs if needs_repair(o)],
    'decisionHold': [o['objectId'] for o in objs if (o.get('currentDisposition') or '') == 'decision-hold'],
    'resolved': [o['objectId'] for o in objs if (o.get('currentDisposition') or '').startswith('resolved-')],
}
lst['countsCurrent'] = {
    'needsRepair': len(status['needsRepairOpen']),
    'decisionHold': len(status['decisionHold']),
    'failedSeparate': len(lst['failedSeparate']),
    'resolvedThisStage': len(status['resolved']),
    'totalTracked': len(objs),
}
lst['breakdown'] = {
    'oldPdfRemaining': len([o for o in pdfs if needs_repair(o) and o.get('objectId') not in META]),
    'newPdfPages': 0,
    'web': len([o for o in web if needs_repair(o)]),
    'protectedSupplement': len([o for o in bps if needs_repair(o)]),
    'failed': len(lst['failedSeparate']),
    'metadataFrontMatter': len([o for o in pdfs if o.get('objectId') in META]),
    'statusDetail': status,
}
lst['refreshedAt'] = now
lst['latestRound'] = {
    'at': now,
    'objects': ['web-chapter:nemata-jp-chapter-197-1'],
    'productionModelCalls': 1,
    'auditModelCalls': 1,
    'note': 'Register integrated (COAC-250 unified register e5a6bf89), body comparison run with zero model calls, one isolated target-text repair passed (197-1); two chapters blocked by the source asset gate, one by the deterministic placeholder gate.',
}
lst['latestAddition'] = {
    'objectId': 'web-chapter:nemata-jp-chapter-197-1',
    'addedAt': now,
    'status': 'passed',
    'candidateSha256': resolved['candidateSha256'],
    'auditPath': resolved['auditPath'],
    'note': 'Isolated revision from the 249/250 register set; parent receipt, parent candidate and raw preserved.',
}
json.dump(lst, open(LP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(LP, 'a', encoding='utf-8').write('\n')
print(json.dumps(lst['countsCurrent']), json.dumps(lst['breakdown']))
print('objects', len(objs))
