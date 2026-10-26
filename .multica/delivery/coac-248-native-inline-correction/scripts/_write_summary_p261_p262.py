import json, io, hashlib

D = '.multica/delivery/coac-248-native-inline-correction/'
ROOT = 'E:/AgentData/Coach/knowledge/processing/'

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

summary = {
    'schema': 'coach-coac248-native-inline-delivery/1',
    'recordedAt': '2026-10-27T08:05:00.000Z',
    'ticket': 'COAC-248',
    'parentTicket': 'COAC-244',
    'stage': 'new PDF pages 260-262, first two objects (261, 262)',
    'triggerWakeup': '01a17a6a-c5cd-765e-adc0-f257e660fd0e',
    'scope': (
        'Two audit-located, source-backed text corrections on nemata-jp pages 261 and 262 through the existing '
        'root-approved exact native-inline field route. No full-page reproduction, no production model call, '
        'no change to the binding rules.'
    ),
    'freeSourceCheck': {
        'method': 'Source page block text read before any revision; the replacement was derived from the original sentence, not from the audit claim alone.',
        'p261': {'block': 'nemata-jp-p261-b4', 'source': '三色は手広い１シャンテンのなかからピンポイントに［5p］･［7p］を引かなければ成立しない', 'reading': '［5p］･［7p］ joined conjunctively: both tiles required.'},
        'p262': {'block': 'nemata-jp-p262-b17', 'source': '３ｓ引きで三面、', 'reading': 'the suit develops a three-sided shape; no tenpai claim and no whole-hand state change.'},
    },
    'code': {
        'repo': 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach (branch codex/mortal-rag-ablation)',
        'commit': 'c2411e7 Register native inline correction approvals for nemata-jp pages 261 and 262',
        'patch': 'native-inline-approvals-p261-p262.patch',
        'patchSha256': sha(D + 'native-inline-approvals-p261-p262.patch'),
        'approvals': [
            {'page': 261, 'path': 'audit/source-corrections/native-inline-field-corrections.p261.root-acceptance.json', 'sha256': sha(ROOT + 'audit/source-corrections/native-inline-field-corrections.p261.root-acceptance.json')},
            {'page': 262, 'path': 'audit/source-corrections/native-inline-field-corrections.p262.root-acceptance.json', 'sha256': sha(ROOT + 'audit/source-corrections/native-inline-field-corrections.p262.root-acceptance.json')},
        ],
        'runtime': 'audit/runtimes/native-repair-7076217daf842b13 (identity sha 7076217daf842b13eb6f945bd21ac0ceb87bc3994fa336e39ba8f2de63efefc6, unchanged)',
        'runtimeSync': {
            'finding': 'The runtime copy of textbook-audit-pdf-native-corrections.mjs was stale (309/315 only). A page already recorded as passed, 329, failed the gate today with audit_native_inline_correction_unapproved_page; the two-file runtime identity sha does not cover this module, so no receipt showed the drift.',
            'action': 'Synced from the coach repo after verifying every other runtime module was already byte-identical; 329 now re-gates cleanly.',
            'moduleSha256Before': '65cb6355968a5e9cd4f94224e7b0317199e0315608d820de51bb60895c423fdc',
            'moduleSha256After': 'd61eae23a509d063c9ae02f1346ec058733c7221ce884108c124bf6af580ddf9',
        },
    },
    'tests': {'file': 'scripts/scene-study/textbook-audit-pdf-native-corrections.test.mjs (+ pdf-native, pdf-scope, pdf-source-corrections)', 'result': '43 passed / 0 failed'},
    'negativeProbes': {
        'method': 'Zero-call in-memory mutations of each revision against the frozen gate and checker.',
        'results': {
            p: [
                {'case': 'undeclared paragraph text edit', 'result': 'rejected: audit_native_pdf_raw_flow_changed'},
                {'case': 'undeclared figure caption edit', 'result': 'rejected: audit_native_pdf_raw_figure_changed'},
                {'case': 'reverted approved change', 'result': 'rejected: audit_native_inline_correction_candidate_field_mismatch'},
                {'case': 'wrong parent SHA', 'result': 'rejected: audit_native_inline_correction_parent_changed'},
            ] for p in (261, 262)
        },
    },
    'pages': [
        {
            'page': 261,
            'parent': {'candidatePath': 'production/sol-high-fallback-inline-20261026/candidates/nemata-jp/page-0261.json', 'sha256': 'b63d2c602ec030eb9c2d5f7852e5119363391f8f9ba24992bbfab42fc847ecd7'},
            'revision': {'candidatePath': 'production/sol-high-field-repair18-20261027-p261/candidates/nemata-jp/page-0261.json', 'sha256': sha(ROOT + 'production/sol-high-field-repair18-20261027-p261/candidates/nemata-jp/page-0261.json')},
            'change': {'block': 'nemata-jp-p261-b1..b5', 'from': '必须恰好摸入5p或7p', 'to': '必须恰好摸入5p和7p'},
            'deterministicGate': 'passed (loadNativeInlineCorrection + checkNativePdfInlineContent, 0 model calls)',
            'independentReview': {'status': 'needs-repair', 'callId': 'a78f22ab-f417-4382-bc8d-cdd4f9e6f65f', 'usage': {'inputTokens': 41699, 'cachedInputTokens': 0, 'outputTokens': 7323}, 'auditPath': 'audit/pages/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.7076217daf84.json'},
            'outcome': 'The original b4 item is cleared — the review marks b4 faithful. The same review located one further unlisted defect at nemata-jp-p261-r50: the problem-17 second draw is transcribed/captioned/referenced as 3m while the source shows 5m (五万). The page stays needs-repair with a precise, source-backed next item; the revision is neither discarded nor counted as passed.',
            'remainingItem': {'target': 'nemata-jp-p261-r50', 'defect': '3m -> 5m (transcription, caption and inline figure text)', 'sourceGround': 'nemata-jp/pages/261.json problem-17 paragraph 「ドラ［5m］引きでもペン［3p］のダマ跳」 plus block nemata-jp-p261-b92'},
        },
        {
            'page': 262,
            'parent': {'candidatePath': 'production/sol-high-fallback-inline-20261026/candidates/nemata-jp/page-0262.json', 'sha256': '0025a1f80f4ceb7cba97f8c9382b02719701370e75af87a537c0130f3a2c604f'},
            'revision': {'candidatePath': 'production/sol-high-field-repair19-20261027-p262/candidates/nemata-jp/page-0262.json', 'sha256': sha(ROOT + 'production/sol-high-field-repair19-20261027-p262/candidates/nemata-jp/page-0262.json')},
            'change': {'block': 'nemata-jp-p262-b16..b19', 'from': '摸入3s可形成三面听', 'to': '摸入3s可形成三面形'},
            'deterministicGate': 'passed',
            'independentReview': {'status': 'passed', 'callId': '6c0a8b07-3859-4493-bb5b-29946542a087', 'usage': {'inputTokens': 27752, 'cachedInputTokens': 0, 'outputTokens': 4479}, 'auditPath': 'audit/pages/nemata-jp/page-0262.5c25921e229d285ea1ae30ec2baef23adbd9d7e20ee9740d7ef524809d9daba6.7076217daf84.json'},
            'outcome': 'passed — page resolved for this repair list; ready for the chapter assembly when its chapter is complete.',
        },
    ],
    'repairList': {
        'path': 'audit/unified-repair-list-20261027.json (and the delivery copy, now byte-identical)',
        'before': {'needsRepair': 21, 'resolvedThisStage': 15, 'newObjectsStillUnresolved': 16, 'breakdownNewPdfPages': 4},
        'after': {'needsRepair': 20, 'resolvedThisStage': 16, 'newObjectsStillUnresolved': 15, 'breakdownNewPdfPages': 3},
        'divergenceRepaired': 'The canonical audit/ copy had dropped the four metadata pages (17 objects vs 21 in the delivery copy); the delivery copy was the superset, so the same merged object was written back to both paths and both now hash to ee39808acfbdaca5bb1c8e858540fd4970a9c7941b11edacf661a451c67aca47.',
    },
    'gateways': {
        'productionModelCalls': 0,
        'reviewModelCalls': 2,
        'reviewUsageTotal': {'inputTokens': 69451, 'cachedInputTokens': 0, 'outputTokens': 11802},
        'admissionStops': 0,
        'httpFailures': 0,
        'duplicateDispatches': 0,
    },
    'next': [
        'nemata-jp:261 revision 2 — the located r50 3m->5m field change (figure transcription + caption + inline text), its own review call.',
        'nemata-jp:260 — five located transcription items (r5, r21, r26, r28, r33), source-image check first.',
        'Then old PDF 79-cn 50/217/263, nemata-jp 98/257, web 7, protected supplement 1.',
        'Still parked on a user decision, untouched this round: nemata-jp:330 structural blocker and the four metadata pages (1/2/3/317) evidence entry.',
        'chapter06-exercise003 / 004 stay in the failed bucket; no retry without the recorded recovery entry points.',
    ],
}

io.open(D + 'summary-p261-p262.json', 'w', encoding='utf-8', newline='\n').write(json.dumps(summary, ensure_ascii=False, indent=1) + '\n')
print('written', sha(D + 'summary-p261-p262.json'))
