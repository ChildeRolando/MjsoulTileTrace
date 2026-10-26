import json, io, hashlib, shutil

ROOT = 'E:/AgentData/Coach/knowledge/processing'
CANON = ROOT + '/audit/unified-repair-list-20261027.json'
DELIVERY = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

d = json.load(io.open(DELIVERY, encoding='utf-8'))

p261 = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:261'][0]
p262 = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:262'][0]

rev261 = 'production/sol-high-field-repair18-20261027-p261/candidates/nemata-jp/page-0261.json'
rev262 = 'production/sol-high-field-repair19-20261027-p262/candidates/nemata-jp/page-0262.json'
aud261 = 'audit/pages/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.7076217daf84.json'
aud262 = 'audit/pages/nemata-jp/page-0262.5c25921e229d285ea1ae30ec2baef23adbd9d7e20ee9740d7ef524809d9daba6.7076217daf84.json'

# 262 resolved
d['objects'] = [o for o in d['objects'] if o['objectId'] != 'nemata-jp:page:262']
d['resolvedThisStage'].append({
    'objectId': 'nemata-jp:page:262',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 262,
    'parentCandidatePath': p262['candidatePath'],
    'parentCandidateSha256': p262['candidateSha256'],
    'repairedCandidatePath': ROOT + '/' + rev262,
    'repairedCandidateSha256': sha(ROOT + '/' + rev262),
    'auditPath': ROOT + '/' + aud262,
    'auditStatus': 'passed',
    'repairKind': 'declared-field-correction',
    'changeSummary': ['paragraph nemata-jp-p262-b16..b19: 「摸入3s可形成三面听」 -> 「摸入3s可形成三面形」, matching the source 「３ｓ引きで三面」 (a three-sided shape, not a tenpai claim)'],
    'sourceEvidence': 'nemata-jp/pages/262.json block b17 line text 「引きで三面、」 — the source says the suit develops a three-sided shape; it does not say the whole hand reaches tenpai.',
    'independentReview': {'callId': '6c0a8b07-3859-4493-bb5b-29946542a087', 'usage': {'inputTokens': 27752, 'cachedInputTokens': 0, 'outputTokens': 4479}, 'result': 'passed'},
    'productionModelCalls': 0,
})

# 261: original audit item resolved, but the fresh review located one further unlisted defect
idx = d['objects'].index(p261)
d['objects'][idx] = {
    'objectId': 'nemata-jp:page:261',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 261,
    'candidatePath': p261['candidatePath'],
    'candidateSha256': p261['candidateSha256'],
    'auditPath': p261['auditPath'],
    'auditStatus': 'needs-repair',
    'issueCount': 2,
    'reviewErrors': p261['issues'][0:1] and ['needs-repair:nemata-jp-p261-b4', 'error:nemata-jp-p261-b4'],
    'currentDisposition': 'needs-repair',
    'origin': p261['origin'],
    'newThisStage': True,
    'revision1': {
        'candidatePath': ROOT + '/' + rev261,
        'candidateSha256': sha(ROOT + '/' + rev261),
        'auditPath': ROOT + '/' + aud261,
        'auditStatus': 'needs-repair',
        'reviewErrors': ['needs-repair:nemata-jp-p261-b33', 'needs-repair:nemata-jp-p261-r50', 'error:nemata-jp-p261-r50'],
        'reviewCall': {'callId': 'a78f22ab-f417-4382-bc8d-cdd4f9e6f65f', 'usage': {'inputTokens': 41699, 'cachedInputTokens': 0, 'outputTokens': 7323}, 'result': 'needs-repair (original b4 item cleared; one new source-backed defect located)'},
        'resolvedOriginalItem': {
            'target': 'nemata-jp-p261-b4',
            'from': '必须恰好摸入5p或7p',
            'to': '必须恰好摸入5p和7p',
            'sourceGround': 'Source b4 reads ピンポイントに［5p］･［7p］を引かなければ成立しない — both tiles are required.',
            'confirmedBy': 'The revision review marks b4 faithful (「三色必须恰好摸5p、7p的不确定性及另一方案的牌引用准确」).',
        },
        'remainingItem': {
            'target': 'nemata-jp-p261-r50',
            'locatedBy': 'the same revision review (body b33 + figure r50 verdict needs-repair)',
            'defect': 'The inline tile for the second draw of problem 17 is transcribed, captioned and referenced as 3m; the source page shows 5m (五万).',
            'sourceGround': 'Source page block nemata-jp-p261-b92 / the problem-17 paragraph 「ドラ［5m］引きでもペン［3p］のダマ跳」 — the drawn tile before ダマ満テンパイ is 5m.',
            'whyNotFixedThisRound': 'Round budget is 1-2 objects; the item needs its own revision candidate, its own independent review call, and a fresh approval job bound to the new parent. Recorded here as the next entry in this page\'s chain.',
        },
    },
}

c = d['countsCurrent']
c['needsRepair'] = c['needsRepair'] - 1
c['resolvedThisStage'] = c['resolvedThisStage'] + 1
c['newObjectsStillUnresolved'] = c['newObjectsStillUnresolved'] - 1
d['breakdown']['newPdfPages'] = d['breakdown']['newPdfPages'] - 1

n = d['nativeInlineCorrection']
n['approvals'] += ['audit/source-corrections/native-inline-field-corrections.p261.root-acceptance.json',
                   'audit/source-corrections/native-inline-field-corrections.p262.root-acceptance.json']
n['reviewCalls'] += [
    {'page': 261, 'candidateSha256': '376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359', 'result': 'needs-repair (original b4 cleared; new r50 3m/5m defect located)'},
    {'page': 262, 'candidateSha256': '5c25921e229d285ea1ae30ec2baef23adbd9d7e20ee9740d7ef524809d9daba6', 'result': 'passed'},
]
n['runtimeCorrectionModuleSync'] = {
    'runtime': 'audit/runtimes/native-repair-7076217daf842b13',
    'finding': 'The runtime copy of textbook-audit-pdf-native-corrections.mjs was stale: it listed only 309/315, so a page already recorded as passed (329) failed the deterministic gate with audit_native_inline_correction_unapproved_page when re-checked today. The two-file runtime identity sha (7076217d…) does not cover this module, so the drift was invisible in the receipts.',
    'action': 'Synced the module from the coach repo (all other runtime modules were already byte-identical), restoring 309/315/329/330 and adding 261/262. Verified afterwards that 329 re-gates cleanly. Runtime identity sha unchanged: 7076217daf842b13eb6f945bd21ac0ceb87bc3994fa336e39ba8f2de63efefc6.',
    'moduleSha256Before': '65cb6355968a5e9cd4f94224e7b0317199e0315608d820de51bb60895c423fdc',
    'moduleSha256After': 'd61eae23a509d063c9ae02f1346ec058733c7221ce884108c124bf6af580ddf9',
}
n['listCopyDivergence'] = {
    'finding': 'audit/unified-repair-list-20261027.json had dropped the four metadata pages (1/2/3/317) that the previous round added: the copy there held 17 objects while the delivery copy held 21. The delivery copy is the superset; nothing in the audit copy was missing from it.',
    'action': 'Rebuilt from the superset and wrote the same object to both paths this round, so the canonical and delivery copies agree again.',
}

d['refreshedAt'] = '2026-10-27T08:05:00.000Z'
payload = json.dumps(d, ensure_ascii=False, indent=1) + '\n'
for path in (CANON, DELIVERY):
    io.open(path, 'w', encoding='utf-8', newline='\n').write(payload)

print(json.dumps({'needsRepair': c['needsRepair'], 'resolvedThisStage': c['resolvedThisStage'],
                  'objects': [o['objectId'] for o in d['objects']],
                  'canonSha': sha(CANON), 'deliverySha': sha(DELIVERY)}, ensure_ascii=False))
