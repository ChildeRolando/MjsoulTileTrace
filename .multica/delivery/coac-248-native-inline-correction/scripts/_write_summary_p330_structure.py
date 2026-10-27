import json, io, hashlib
ROOT = 'E:/AgentData/Coach/knowledge/processing'
D = '.multica/delivery/coac-248-native-inline-correction'


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


cand = ROOT + '/production/sol-high-field-repair20-20261027-p330/candidates/nemata-jp/page-0330.json'
aud = ROOT + '/audit/pages/nemata-jp/page-0330.314cb19f1b1cf8ed7d420cbccb00cdea1c8ae8210fd5bcdb88953d90f42c25f6.7076217daf84.json'
rec = json.load(io.open(aud, encoding='utf-8'))
call = rec['calls'][-1]

s = {
    'schema': 'coach-coac248-native-inline-delivery/1',
    'recordedAt': '2026-10-27T00:15:00.000Z',
    'ticket': 'COAC-248',
    'parentTicket': 'COAC-244',
    'stage': '330-structure',
    'triggerComment': '01a17a7e-21cf-77f2-9250-fc81d43bc2bd',
    'previousStageSummary': D + '/summary-p261-p262.json',
    'scope': 'Page-scoped structural revision for nemata-jp page 330 only: restore the two source pon examples as hand -> pon -> discard, reusing the existing row-slice image blocks. No full-page re-production, no new production model call, no global binding rule loosened.',
    'reason': 'The independent review of revision 1 located a reading-order defect: r6-r14 were overlapping horizontal slices, so the first example repeated its whole hand and r9 carried the second example forward past the first example discard.',
    'code': {
        'repo': 'E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach (branch codex/mortal-rag-ablation)',
        'newModule': 'scripts/scene-study/textbook-audit-pdf-native-structure-corrections.mjs',
        'gateWiring': 'scripts/scene-study/textbook-audit-pdf-native.mjs now applies the page-scoped corrected raw AND corrected plan before checkNativePdfInlineContent; all other bindings are unchanged.',
        'test': 'scripts/scene-study/textbook-audit-pdf-native-structure-corrections.test.mjs (14 tests)',
        'tests': '66 passed / 66 across the five audit suites',
        'runtimeSync': {'runtime': 'audit/runtimes/native-repair-7076217daf842b13', 'identityAfter': '7076217daf842b13eb6f945bd21ac0ceb87bc3994fa336e39ba8f2de63efefc6', 'note': 'The two-file runtime identity is unchanged; the new module and the wiring module were copied in and re-verified from the runtime path.'},
    },
    'page': {
        'page': 330,
        'status': 'passed',
        'parentCandidatePath': 'production/sol-high-field-repair17-20261027-p330/candidates/nemata-jp/page-0330.json',
        'parentCandidateSha256': '7eaa03dd9e5a276efe07e42d3b84d068364f4f71f355dfcacc9f64e9eb7f199f',
        'candidatePath': 'production/sol-high-field-repair20-20261027-p330/candidates/nemata-jp/page-0330.json',
        'candidateSha256': sha(cand),
        'structureDiffPath': 'audit/source-corrections/diffs/native-inline-page-structure.p330.7eaa03dd9e5a276efe07e42d3b84d068364f4f71f355dfcacc9f64e9eb7f199f.json',
        'structureDiffSha256': '3057ae955144022c8023f1ee0c85c366ac007787ffe2e703f86a9e63dd7c5666',
        'proofPath': 'audit/source-corrections/proofs/native-inline-page-structure.p330.314cb19f1b1cf8ed7d420cbccb00cdea1c8ae8210fd5bcdb88953d90f42c25f6.json',
        'proofSha256': 'b60c601f35ca38a357a8d76dc67f067ddcb8d757404da879d2650c3cf5ec52ba',
        'approvalPath': 'audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json',
        'approvalSha256': '8b96b361f4517322c40a555748713914a3bff8f7b902a7c01057040111a7cd61',
        'auditPath': aud,
        'auditFileSha256': sha(aud),
        'auditStatus': 'passed',
        'reviewCall': {'callId': call['callId'], 'usage': call['usage'], 'model': call['model'], 'result': 'passed'},
        'structuralDiff': {
            'replacedFigures': ['nemata-jp-p330-r6', 'nemata-jp-p330-r7', 'nemata-jp-p330-r8', 'nemata-jp-p330-r9', 'nemata-jp-p330-r10', 'nemata-jp-p330-r11', 'nemata-jp-p330-r12', 'nemata-jp-p330-r13', 'nemata-jp-p330-r14'],
            'newFigures': [
                {'figureId': 'nemata-jp-p330-ex1-hand', 'blocks': ['nemata-jp-p330-b38', 'nemata-jp-p330-b41', 'nemata-jp-p330-b45'], 'tr': '344555m 33478s (11 tiles)'},
                {'figureId': 'nemata-jp-p330-ex1-pon', 'blocks': ['nemata-jp-p330-b39', 'nemata-jp-p330-b42', 'nemata-jp-p330-b43', 'nemata-jp-p330-b46'], 'tr': 'broken left end + 7z7z, unknowns retained'},
                {'figureId': 'nemata-jp-p330-ex1-discard', 'blocks': ['nemata-jp-p330-b40', 'nemata-jp-p330-b44', 'nemata-jp-p330-b47'], 'tr': 'discard 4s'},
                {'figureId': 'nemata-jp-p330-ex2-hand', 'blocks': ['nemata-jp-p330-b48', 'nemata-jp-p330-b51', 'nemata-jp-p330-b55', 'nemata-jp-p330-b60'], 'tr': '345556m 33478s (11 tiles)'},
                {'figureId': 'nemata-jp-p330-ex2-pon', 'blocks': ['nemata-jp-p330-b49', 'nemata-jp-p330-b52', 'nemata-jp-p330-b56', 'nemata-jp-p330-b57', 'nemata-jp-p330-b61'], 'tr': 'broken left end + 7z7z, unknowns retained'},
                {'figureId': 'nemata-jp-p330-ex2-discard', 'blocks': ['nemata-jp-p330-b50', 'nemata-jp-p330-b53', 'nemata-jp-p330-b58', 'nemata-jp-p330-b62'], 'tr': 'discard 6m'},
                {'figureId': 'nemata-jp-p330-ex2-used4m', 'blocks': ['nemata-jp-p330-b54', 'nemata-jp-p330-b59', 'nemata-jp-p330-b63'], 'tr': 'parenthesised 4m used-tile'},
            ],
            'flowChanges': ['b10: 例： / 　碰 / 　→打 with hand, pon, discard in source order', 'b11: the same plus the parenthesised 4m tile before 已用掉1张'],
            'sourceBlocksReusedExactlyOnce': 26,
            'blocksMissing': 0,
            'blocksDuplicated': 0,
            'geometryFromSourceBlocksOnly': True,
        },
        'tileCodeCorrection': {
            'foundBy': 'direct pixel comparison of the 900-dpi page render and the embedded strip assets while binding the new region bboxes',
            'defect': 'The third sou tile of both examples is 4s (four sticks, 2x2), not 6s; example 1 discards that same 4s, not 6s.',
            'was': 'hand 33678s; example 1 discard 6s',
            'now': 'hand 33478s; example 1 discard 4s',
            'independentReview': 'The revision review marks both bodies faithful and states that the first example hand, pon and discard-4s correspond completely.',
            'note': 'This defect was not in the original audit errors; it is not an unrelated rewrite - the affected hand and discard figures are exactly the figures this structural revision replaces, and the source strips are bound in each new figure record.',
        },
    },
    'verification': {
        'realDataRejections': [
            'diff: missing block -> audit_native_structure_missing_block',
            'diff: duplicate block -> audit_native_structure_duplicate_block',
            'diff: wrong source SHA -> audit_native_structure_source_sha',
            'diff: wrong reading order -> audit_native_structure_reading_order',
            'diff: invented region bbox -> audit_native_structure_region_bbox',
            'diff: unlisted flow text change -> audit_native_structure_flow_text_changed',
            'diff: marker anchor out of range / duplicate -> audit_native_structure_marker_position',
            'diff: replaced figure record changed -> audit_native_structure_replaced_figure_changed',
            'diff: unaffected figure digest changed -> audit_native_structure_unaffected_figures_changed',
            'candidate: unlisted figure bbox change -> audit_native_pdf_region_binding',
            'candidate: unlisted paragraph edit -> audit_native_pdf_compiled_paragraph_changed',
            'candidate: figure referenced twice -> audit_native_pdf_compiled_paragraph_changed',
            'candidate: reverted parent field correction -> audit_native_pdf_raw_figure_changed',
            'loader: wrong parent SHA -> audit_native_structure_parent_changed',
            'loader: approval file changed -> audit_native_structure_approval_changed',
        ],
        'happyPath': 'The real candidate rebuilds exactly from the preserved raw + the corrected plan and passes the unchanged global gate.',
    },
    'supersededAttempt': {
        'candidateSha256': 'a10aa62a166f411a4ee2ce7fe087169c3afaea000ffb82a9c330deb7d85a65f7',
        'auditPath': 'audit/pages/nemata-jp/page-0330.a10aa62a166f411a4ee2ce7fe087169c3afaea000ffb82a9c330deb7d85a65f7.7076217daf84.json',
        'result': 'needs-repair, deterministic only, zero review calls',
        'error': 'audit_native_structure_original_raw_changed',
        'reason': 'The page-scoped gate compared the parent field-corrected baseline against the original production raw. Fixed before any model review; the structural diff states the same page content and records this supersession in routeNote.',
    },
    'execution': {'productionModelCalls': 0, 'reviewModelCalls': 1, 'reAudits': 1},
    'nextRound': {
        'p330': 'passed; hand to COAC-250 with chapter assembly when the chapter is otherwise complete',
        'nemata-jp:261': 'revision 2 (r50 3m -> 5m only), parent 376c71a3, original audit = the revision-1 needs-repair receipt',
        'nemata-jp:260': '_issues.txt five points (r5/r21/r26/r28/r33), free source check first',
        'metadataFour': 'unresolved-evidence; p317 b5 fix authorised, queued with the array-valued unknowns entry it needs',
    },
}
io.open(D + '/summary-p330-structure.json', 'w', encoding='utf-8', newline='\n').write(json.dumps(s, ensure_ascii=False, indent=1) + '\n')
print('summary written', sha(cand), sha(aud))
