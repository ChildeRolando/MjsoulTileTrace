import json, io, hashlib, os
ROOT = 'E:/AgentData/Coach/knowledge/processing'
P = ROOT + '/audit/unified-repair-list-20261027.json'
d = json.load(io.open(P, encoding='utf-8'))

def sha(p):
    return hashlib.sha256(open(ROOT + '/' + p, 'rb').read()).hexdigest()

p329_obj = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:329'][0]
p330_obj = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:330'][0]

rev329 = 'production/sol-high-field-repair16-20261027-p329/candidates/nemata-jp/page-0329.json'
rev330 = 'production/sol-high-field-repair17-20261027-p330/candidates/nemata-jp/page-0330.json'
aud329 = 'audit/pages/nemata-jp/page-0329.a991dd8900f39256c130e38974acc971f5fa798ae5db5cd101fa49e1a7bedcb7.7076217daf84.json'
aud330 = 'audit/pages/nemata-jp/page-0330.7eaa03dd9e5a276efe07e42d3b84d068364f4f71f355dfcacc9f64e9eb7f199f.7076217daf84.json'

# 329 resolved
d['objects'] = [o for o in d['objects'] if o['objectId'] != 'nemata-jp:page:329']
d['resolvedThisStage'].append({
    'objectId': 'nemata-jp:page:329',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 329,
    'parentCandidatePath': p329_obj['candidatePath'],
    'parentCandidateSha256': p329_obj['candidateCandidateSha256'] if 'candidateCandidateSha256' in p329_obj else p329_obj['candidateSha256'],
    'repairedCandidatePath': ROOT + '/' + rev329,
    'repairedCandidateSha256': sha(rev329),
    'auditPath': ROOT + '/' + aud329,
    'auditStatus': 'passed',
    'repairKind': 'declared-field-correction',
    'changeSummary': ['paragraph nemata-jp-p329-b20..b23: appended separate 校注 marking the interpretive completion of 「速度ではほぼ無し」 as non-original; translation unchanged and original sentence quoted'],
    'sourceEvidence': 'nemata-jp/pages/329.json block b22 reads 雀頭固定、ターツ固定共に速度ではほぼ無し。 — no comparison object; the audit located the unmarked interpretive completion.',
    'independentReview': {'callId': 'c0cc7615-8eaf-4b34-85b1-ef19e76ce37c', 'usage': {'inputTokens': 21454, 'cachedInputTokens': 0, 'outputTokens': 3962}, 'result': 'passed'},
    'productionModelCalls': 0,
})

# 330 still needs repair: subset fixed, structural blocker stays
preserved = dict(p330_obj)
d['objects'][d['objects'].index(p330_obj)] = {
    'objectId': 'nemata-jp:page:330',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 330,
    'candidatePath': p330_obj['candidatePath'],
    'candidateSha256': p330_obj['candidateSha256'],
    'auditPath': p330_obj['auditPath'],
    'auditStatus': 'needs-repair',
    'issueCount': 2,
    'reviewErrors': ['visual_reading_flow_not_faithful', 'needs-repair:nemata-jp-p330-b10', 'needs-repair:nemata-jp-p330-b11', 'error:nemata-jp-p330-b10', 'error:nemata-jp-p330-b11'],
    'currentDisposition': 'needs-repair',
    'origin': p330_obj['origin'],
    'newThisStage': True,
    'revision1': {
        'candidatePath': ROOT + '/' + rev330,
        'candidateSha256': sha(rev330),
        'auditPath': ROOT + '/' + aud330,
        'auditStatus': 'needs-repair',
        'reviewErrors': ['visual_reading_flow_not_faithful', 'needs-repair:nemata-jp-p330-b10', 'needs-repair:nemata-jp-p330-b11', 'error:nemata-jp-p330-b10', 'error:nemata-jp-p330-b11'],
        'reviewCall': {'callId': 'd922961d-a755-445d-bcde-3b7f5cb14404', 'usage': {'inputTokens': 35696, 'cachedInputTokens': 0, 'outputTokens': 7446}, 'result': 'needs-repair (structural flow only)'},
        'resolvedTileErrors': [
            'nemata-jp-p330-r1 125554m -> 123334m (transcription + caption)',
            'nemata-jp-p330-r4 544555m -> 344555m (transcription + caption, 四张5m -> 三张5m)',
            'nemata-jp-p330-r22 554566m -> 334566m (transcription + caption, 三张5m -> 一张5m)',
        ],
        'resolvedBlocks': ['nemata-jp-p330-b5', 'nemata-jp-p330-b8', 'nemata-jp-p330-b20'],
        'verifiedByIndependentReview': 'The revision review no longer lists any tile-form error; the three corrected figures and their inline blocks are faithful.',
    },
    'structuralBlocker': {
        'finding': 'The independent review of the corrected page located a reading-order defect in the two pon examples: r6-r14 are overlapping vertical slices of two source rows (r6 244.8-290.4, r7/r8/r9 254.4-301.9/321.4, r10-r13 285.4-336.5, r14 300.5-339.6), so the first example repeats its whole hand across r6/r7 and r9 carries the second example forward past the first example\'s →打.',
        'whyTheRouteCannotExpressIt': 'Restoring one hand -> pon -> discard per example requires changing the figure region partition (bbox/sourceImageBlockIds) or adding/removing body blocks. The exact-field route requires every unlisted field to equal the preserved production raw and every figure to be referenced exactly once, and rebuilding rawFlow from a restructured body is rejected as audit_native_pdf_raw_flow_changed / audit_native_inline_correction_structural_error.',
        'optionsNotTaken': 'Full-page re-production is excluded by the ticket (不重制整页); no global binding rule was loosened.',
        'decisionNeeded': 'A page-scoped structural entry for page 330 (page-scoped region re-derivation or a page-scoped block arrangement approval), authorised like the previous 309/315 entry.',
    },
}

c = d['countsCurrent']
c['needsRepair'] = c['needsRepair'] - 1
c['resolvedThisStage'] = c['resolvedThisStage'] + 1
c['newObjectsStillUnresolved'] = c['newObjectsStillUnresolved'] - 1
d['breakdown']['newPdfPages'] = d['breakdown']['newPdfPages'] - 1

n = d['nativeInlineCorrection']
n['approvals'] += ['audit/source-corrections/native-inline-field-corrections.p329.root-acceptance.json',
                   'audit/source-corrections/native-inline-field-corrections.p330.root-acceptance.json']
n['reviewCalls'] += [
    {'page': 329, 'candidateSha256': 'a991dd8900f39256c130e38974acc971f5fa798ae5db5cd101fa49e1a7bedcb7', 'result': 'passed'},
    {'page': 330, 'candidateSha256': '7eaa03dd9e5a276efe07e42d3b84d068364f4f71f355dfcacc9f64e9eb7f199f', 'result': 'needs-repair (structural flow, tile corrections accepted)'},
]
n['structuralBlocked'] = {'page': 330, 'reason': 'overlapping slice partition of the two pon example rows; needs a page-scoped structural decision'}

for f in d['failedSeparate']:
    if f['articleId'] == 'chapter06-exercise003':
        f['recoveryInvestigation'] = {
            'checkedAt': '2026-10-26T22:52:00.000Z',
            'result': 'Deterministic preflight failure in verifyWebBatchedProductionCalls: the stored batch output does not assemble onto the candidate (translations/figures count, per-block text, or figure provenance.callId/outputSourceBlockId mismatch). No model call was made; the same error reproduced 3 times with 0 calls.',
            'safeRecovery': 'Not an audit retry. Requires re-deriving the assembled output from the stored batch raw (or re-running that article\'s production batch in the maker lane) before any review.',
        }
    if f['articleId'] == 'chapter06-exercise004':
        f['recoveryInvestigation'] = {
            'checkedAt': '2026-10-26T22:52:00.000Z',
            'result': 'Batches 001 and 002 passed with real reviews; batch-003\'s call failed (success=false, usage 58576/58368/10724) and its checkpoint is recorded failed, so the article stopped at incomplete_independent_batch_review after 3 attempts.',
            'safeRecovery': 'Re-run only batch-003 as one review call, reusing the passed batch-001/002 receipts; no blind whole-article retry.',
        }

d['refreshedAt'] = '2026-10-27T07:05:00.000Z'
io.open(P, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({'needsRepair': c['needsRepair'], 'resolvedThisStage': c['resolvedThisStage'], 'objects': [o['objectId'] for o in d['objects']]}, ensure_ascii=False))
