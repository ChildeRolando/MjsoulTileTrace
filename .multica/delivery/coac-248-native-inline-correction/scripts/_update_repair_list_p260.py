import json, io, hashlib

ROOT = 'E:/AgentData/Coach/knowledge/processing'
CANON = ROOT + '/audit/unified-repair-list-20261027.json'
DELIVERY = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

d = json.load(io.open(CANON, encoding='utf-8'))

p260 = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:260'][0]
rev260 = 'production/sol-high-field-repair21-20261027-p260/candidates/nemata-jp/page-0260.json'
rev260_sha = sha(ROOT + '/' + rev260)
aud260 = 'audit/pages/nemata-jp/page-0260.' + rev260_sha + '.7076217daf84.json'

# p260 resolved
d['objects'] = [o for o in d['objects'] if o['objectId'] != 'nemata-jp:page:260']
d['resolvedThisStage'].append({
    'objectId': 'nemata-jp:page:260',
    'kind': 'pdf-page',
    'sourceId': 'nemata-jp',
    'page': 260,
    'parentCandidatePath': p260['candidatePath'],
    'parentCandidateSha256': p260['candidateSha256'],
    'repairedCandidatePath': ROOT + '/' + rev260,
    'repairedCandidateSha256': rev260_sha,
    'auditPath': ROOT + '/' + aud260,
    'auditStatus': 'passed',
    'repairKind': 'declared-field-correction',
    'changeSummary': [
        'figure nemata-jp-p260-r5 (transcription + caption): 9s -> 7s',
        'figure nemata-jp-p260-r21 (transcription + caption): hand 455567m 6p 2336887s -> 455567m 6p 2334557s',
        'figure nemata-jp-p260-r26 (transcription + caption): discard candidates 2359s -> 2357s',
        'figure nemata-jp-p260-r28 (transcription + caption): B-type discard 9s -> 7s',
        'figure nemata-jp-p260-r33 (transcription + caption): 336s／889s -> one continuous cross-line 334557s',
    ],
    'sourceEvidence': 'Every tile was re-read from the embedded source assets before any edit: b46 is 7s (one red head over 3+3); b63 is the 14-tile hand 455567m 6p 2334557s; b68 is 2s 3s 5s 7s; b70 is the same 7s tile; b75 (3s 3s 4s) and b76 (5s 5s 7s) form one continuous 334557s shape split by the printed line break. Tile identities were anchored against same-book figures whose per-block transcription and unmistakable tiles (2m/8m/6s) confirm the source-image to block ordering.',
    'independentReview': {'callId': 'd30a1c4a-04f3-4440-914e-1c6988733f59', 'usage': {'inputTokens': 35285, 'cachedInputTokens': 0, 'outputTokens': 7100}, 'result': 'passed'},
    'productionModelCalls': 0,
})

# p261: record the source check that contradicts the revision review's r50 finding
p261 = [o for o in d['objects'] if o['objectId'] == 'nemata-jp:page:261'][0]
p261['revision1']['remainingItem']['sourceCheckThisRound'] = {
    'result': 'contested-not-applied',
    'finding': 'The source tile at nemata-jp-p261-b92 is 3m, not 5m. The revision review (a78f22ab…) misread the tile: the candidate transcription, caption and inline text were already correct.',
    'method': 'Pixel comparison of the embedded source asset f502bc23… against same-book anchor tiles whose block order is fixed by an unmistakable 8m (八), a 6s (six green bamboos) and the 5m tiles in the same figure. 3m anchors cc38d849 (b42), 7a889595 (b71) and 2c730d58 (b78) match the source tile at 0.97-0.99 mask IoU; 5m anchors 8da455ae (b43), 183da1d5 (b72) and 909943e9 (b79) sit at ~0.64 and show the distinct 五 glyph.',
    'action': 'No 5m revision was built. The page stays needs-repair on its recorded review results pending an owner decision on the contested tile, so nothing fabricated enters the corpus.',
}

c = d['countsCurrent']
c['needsRepair'] = c['needsRepair'] - 1
c['resolvedThisStage'] = c['resolvedThisStage'] + 1
c['newObjectsStillUnresolved'] = c['newObjectsStillUnresolved'] - 1
d['breakdown']['newPdfPages'] = d['breakdown']['newPdfPages'] - 1

n = d['nativeInlineCorrection']
n['approvals'] += ['audit/source-corrections/native-inline-field-corrections.p260.root-acceptance.json']
n['reviewCalls'] += [
    {'page': 260, 'candidateSha256': rev260_sha, 'result': 'passed (5 located tile/transcription items; 0 further items)'},
]
n['p260SourceCheck'] = {
    'method': 'embedded source assets read and compared against same-book anchor tiles before any edit',
    'itemsConfirmed': 5,
    'auditClaimCheck': 'All five COAC-247 audit items were confirmed by the source images; none were taken on the audit text alone.',
    'contrast': 'On page 261 the same method refutes the review finding at r50 (see nemata-jp:page:261.revision1.remainingItem.sourceCheckThisRound).',
}
n['runtimeCorrectionModuleSync']['p260Refresh'] = {
    'action': 'Added the p260 approval to knownNativeInlineCorrections and re-synced the module into the frozen runtime under the single-writer boundary.',
    'moduleSha256Before': 'd61eae23a509d063c9ae02f1346ec058733c7221ce884108c124bf6af580ddf9',
    'moduleSha256After': '71794ddd84a2b70c472724f8b1b443e37c95681aebc1f5edb7f26d0ac08373c7',
    'measuredAfter330': 'The p261/p262 refresh note above records the pre-330 module; the 330 round and this round each re-synced and re-verified from the runtime path.',
}
n['verificationDependenciesManifest'] = {
    'path': 'audit/runtimes/native-repair-7076217daf842b13/verification-dependencies.json',
    'previousManifestSha256': '5a60dfbce5ccb3726c0ecc109bb1f23af3cfeca6546ff671a789cfd7e4d4ef21',
    'newManifestSha256': '8020f7b2e760ad443e6951ac1074c571f9dc5878f47e8df20759db8d3d5e1452',
    'historyPath': 'audit/runtimes/native-repair-7076217daf842b13/verification-dependencies.history/5a60dfbce5ccb3726c0ecc109bb1f23af3cfeca6546ff671a789cfd7e4d4ef21.json',
    'pageApprovals': ['p260', 'p261', 'p262', 'p309', 'p315', 'p329', 'p330-field', 'p330-structure'],
    'note': 'The previous manifest was archived unchanged, not overwritten as if it had always matched.',
}

d['refreshedAt'] = '2026-10-27T08:40:00.000Z'
payload = json.dumps(d, ensure_ascii=False, indent=1) + '\n'
for path in (CANON, DELIVERY):
    io.open(path, 'w', encoding='utf-8', newline='\n').write(payload)

print(json.dumps({'needsRepair': c['needsRepair'], 'resolvedThisStage': c['resolvedThisStage'],
                  'newObjectsStillUnresolved': c['newObjectsStillUnresolved'],
                  'objects': [o['objectId'] for o in d['objects']],
                  'canonSha': sha(CANON), 'deliverySha': sha(DELIVERY)}, ensure_ascii=False))
