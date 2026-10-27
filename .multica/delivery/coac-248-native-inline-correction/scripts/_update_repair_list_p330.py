import json, io, hashlib

ROOT = 'E:/AgentData/Coach/knowledge/processing'
CANON = ROOT + '/audit/unified-repair-list-20261027.json'
DELIVERY = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


d = json.load(io.open(DELIVERY, encoding='utf-8'))
p330 = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:330'][0]

cand = ROOT + '/production/sol-high-field-repair20-20261027-p330/candidates/nemata-jp/page-0330.json'
aud = ROOT + '/audit/pages/nemata-jp/page-0330.314cb19f1b1cf8ed7d420cbccb00cdea1c8ae8210fd5bcdb88953d90f42c25f6.7076217daf84.json'
rec = json.load(io.open(aud, encoding='utf-8'))
call = rec['calls'][-1]

d['objects'] = [o for o in d['objects'] if o['objectId'] != 'nemata-jp:page:330']
d['resolvedThisStage'].append({
    'objectId': 'nemata-jp:page:330',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 330,
    'parentCandidatePath': p330['candidatePath'],
    'parentCandidateSha256': p330['candidateSha256'],
    'repairedCandidatePath': cand,
    'repairedCandidateSha256': sha(cand),
    'auditPath': aud,
    'auditStatus': 'passed',
    'repairKind': 'page-scoped structural correction',
    'changeSummary': [
        'The two source pon examples are restored as one hand -> pon -> discard group each: 9 overlapping row slices become 7 semantic regions that reuse the same 26 source image blocks exactly once.',
        'The same revision corrects the third sou tile from 6s to 4s and the first example discard from 6s to 4s, backed by the bound source strips and confirmed by the independent review.',
    ],
    'structureDiffPath': 'audit/source-corrections/diffs/native-inline-page-structure.p330.7eaa03dd9e5a276efe07e42d3b84d068364f4f71f355dfcacc9f64e9eb7f199f.json',
    'structureDiffSha256': '3057ae955144022c8023f1ee0c85c366ac007787ffe2e703f86a9e63dd7c5666',
    'approvalPath': 'audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json',
    'approvalSha256': '8b96b361f4517322c40a555748713914a3bff8f7b902a7c01057040111a7cd61',
    'sourceEvidence': 'Embedded source strips b38-b63 of nemata-jp page 330: each example is one source row whose hand, pon and discard are separate column groups; the third sou tile carries four sticks (2x2).',
    'independentReview': {'callId': call['callId'], 'usage': call['usage'], 'result': 'passed'},
    'productionModelCalls': 0,
})

c = d['countsCurrent']
c['needsRepair'] = c['needsRepair'] - 1
c['resolvedThisStage'] = c['resolvedThisStage'] + 1
c['newObjectsStillUnresolved'] = c['newObjectsStillUnresolved'] - 1
d['breakdown']['newPdfPages'] = d['breakdown']['newPdfPages'] - 1

n = d['nativeInlineCorrection']
n['approvals'].append('audit/source-corrections/native-inline-page-structure.p330.root-acceptance.json')
n['reviewCalls'].append({'page': 330, 'candidateSha256': sha(cand), 'result': 'passed (structural revision)'})
n['structureRoute'] = {
    'page': 330,
    'module': 'scripts/scene-study/textbook-audit-pdf-native-structure-corrections.mjs',
    'gate': 'checkNativePdfInlineContent now receives the page-scoped corrected raw and corrected plan; every other binding is unchanged.',
    'rejections': ['missing block', 'duplicate block', 'wrong order', 'wrong source SHA', 'unlisted structural change', 'unlisted text change', 'wrong parent SHA', 'changed approval'],
    'tests': 'scripts/scene-study/textbook-audit-pdf-native-structure-corrections.test.mjs (14 cases); 66/66 across the five audit suites',
    'supersededAttempt': 'audit/pages/nemata-jp/page-0330.a10aa62a166f411a4ee2ce7fe087169c3afaea000ffb82a9c330deb7d85a65f7.7076217daf84.json (deterministic-only rejection, zero review calls; route bug fixed before any model review)',
}
n.pop('structuralBlocked', None)
d.pop('structuralBlocked', None)

d['metadataEvidenceInventory'] = {
    'path': '.multica/delivery/coac-248-native-inline-correction/metadata-evidence-inventory-20261027.json',
    'finding': 'Pages 1/2/3/317 stay unresolved-evidence. Every failing item is microprint inside a 272-416 px embedded cover bitmap (~300 dpi native); no local source can resolve it, and none of the missing text carries the body argument. p317 b5 is a separate, proven translation defect; correcting it is authorised and queued because the exact-field route cannot rewrite the figure unknowns array.',
    'bodyTextImpact': 'none of the missing microprint is cited by any paragraph on those pages',
}

d['refreshedAt'] = '2026-10-27T08:20:00.000Z'
payload = json.dumps(d, ensure_ascii=False, indent=1) + '\n'
for path in (CANON, DELIVERY):
    io.open(path, 'w', encoding='utf-8', newline='\n').write(payload)

print(json.dumps({'needsRepair': c['needsRepair'], 'resolvedThisStage': c['resolvedThisStage'],
                  'objects': [o['objectId'] for o in d['objects']],
                  'canonSha': sha(CANON), 'deliverySha': sha(DELIVERY)}, ensure_ascii=False))
