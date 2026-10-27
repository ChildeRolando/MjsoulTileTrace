import json, hashlib, io, os

P = '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
d = json.load(open(P, encoding='utf-8'))

def sha_file(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

# 303-1: the sibling article's retry review passed and 250 staged it; it leaves the failed list.
kept = []
for o in d['failedSeparate']:
    if o['articleId'] == 'chapter06-exercise004':
        o['currentDisposition'] = 'corrected-passed-and-staged-not-failed'
        o['correction'] = {
            'recordedAt': '2026-10-27T03:40:00Z',
            'chapter': 'nemata-jp-chapter-303-1',
            'receiptPath': 'audit/web/articles/modern-yabejp-ja/chapter06-exercise004.736810e43a8a94084c6d9c7c2d63f91654a50f236ece06753bc75713918319eb.retry-1793067200166-6d2dc122.json',
            'receiptStatus': 'passed',
            'receiptRecordedAt': '2026-10-27T02:13:20.167Z',
            'candidateSha256': '736810e43a8a94084c6d9c7c2d63f91654a50f236ece06753bc75713918319eb',
            'stagedIntoAcceptedPreviewAt': '2026-10-27T02:48:58Z',
            'note': 'The earlier failed entry is retained as history with the original error; it must not be written as failed or un-retried any more.'}
        kept.append(o)
d['failedSeparate'] = kept

by_id = {o['objectId']: o for o in d['objects']}

o = by_id.get('web-chapter:nemata-jp-chapter-131-1')
if o:
    o['auditStatus'] = 'passed'
    o['candidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.rev1.json'
    o['candidateSha256'] = '20e84a64d9ea6526ceea7395131bf96825133244b84d41c9ef0bd0f94799be33'
    o['auditPath'] = 'E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter01-section049.20e84a64d9ea6526ceea7395131bf96825133244b84d41c9ef0bd0f94799be33.json'
    o['currentDisposition'] = 'resolved-passed-audit-awaiting-250-handoff'
    o['issueCount'] = 0
    o['sourceGateResolution'] = {
        'boundSourcePath': 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section049/source.v2.json',
        'boundSourceSha256': 'a463edd2bf6d41428d46be506a60cf27615b2bd7c698b16dd39ced7ee30968bd',
        'independentSourceCheck': 'passed',
        'nonContentAsset': 'modern-yabejp-ja:d2581cf81efbb0a5ec3d5bd4 is the amazon affiliate 1x1 tracking pixel, recorded in ignoredPlaceholders with empty alt; the superseded v1 capture is the only place it is marked failed',
        'notExempted': 'no tile image exempted, no tracking address requested, global gate unchanged'}

o = by_id.get('web-chapter:nemata-jp-chapter-116-1')
if o:
    o['auditStatus'] = 'passed'
    o['candidatePath'] = 'E:/AgentData/Coach/knowledge/processing/web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.rev3.json'
    o['candidateSha256'] = '6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46'
    o['auditPath'] = 'E:/AgentData/Coach/knowledge/processing/audit/web/articles/modern-yabejp-ja/chapter01-section041.6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46.json'
    o['currentDisposition'] = 'resolved-passed-first-revision-audit-awaiting-250-handoff'
    o['issueCount'] = 0
    o['blocker'] = None
    o['firstRevisionChain'] = {
        'evidencePath': 'audit/source-corrections/web-first-revision/chapter01-section041.deterministic-rejection.json',
        'evidenceSha256': '4d7d156ffb5e63a29b00257f7e4678b38cd81aefa20a4c2800fe96092f531a7c',
        'parentAudit': None,
        'auditMethod': 'independent-sol-high-full-article-review',
        'runtime': 'audit/runtimes/web-first-revision-20261027',
        'runner': 'web-production/v1/runs/modern-first-revision-116-1/frozen-runner/textbook-production-web.mjs',
        'scope': 'only b0016 re-translated; every other block and figure unchanged; the whole article received a real first review'}

d.setdefault('resolvedThisStage', [])
d['resolvedThisStage'].append({
    'objectId': 'web-chapter:nemata-jp-chapter-131-1',
    'kind': 'web-article',
    'articleId': 'chapter01-section049',
    'repairedCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section049.rev1.json',
    'repairedCandidateSha256': '20e84a64d9ea6526ceea7395131bf96825133244b84d41c9ef0bd0f94799be33',
    'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter01-section049.20e84a64d9ea6526ceea7395131bf96825133244b84d41c9ef0bd0f94799be33.json',
    'auditStatus': 'passed',
    'repairKind': 'isolated-target-text-revision',
    'modelCalls': {'production': 1, 'audit': 1}})
d['resolvedThisStage'].append({
    'objectId': 'web-chapter:nemata-jp-chapter-116-1',
    'kind': 'web-article',
    'articleId': 'chapter01-section041',
    'repairedCandidatePath': 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section041.rev3.json',
    'repairedCandidateSha256': '6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46',
    'auditPath': 'audit/web/articles/modern-yabejp-ja/chapter01-section041.6d5fd5aef0b8e6a1cb926b89a485488e7669ad98119201a1fe5ef5a2a86e9e46.json',
    'auditStatus': 'passed',
    'repairKind': 'first-revision-chain-without-parent-audit',
    'modelCalls': {'production': 3, 'audit': 1}})

d['countsCurrent'] = {
    'needsRepair': 55,
    'decisionHold': 1,
    'failedSeparate': 1,
    'resolvedThisStage': 3,
    'totalTracked': 61,
    'resolvedTotal': 7}
d['refreshedAt'] = '2026-10-27T03:45:00Z'
d['round20261027T0330'] = {
    'record': '.multica/delivery/coac-248-native-inline-correction/round-20261027T0330.json',
    'register': {'path': 'integration/coac250-unified-chapter-register-20261027b.json',
                 'sha256': '0294cb22e36ee7ffa076e8c3795528542b2c84e4224690729dc6004d14926588'},
    'passed': ['nemata-jp-chapter-131-1', 'nemata-jp-chapter-116-1'],
    'corrected': ['nemata-jp-chapter-303-1 (passed and staged, was carried as failed)'],
    'separate': ['nemata-jp-chapter-283-1 (deterministic reassembly done, batch audit 2/11 groups)'],
    'modelCalls': {'production': 4, 'audit': 3}}

open(P, 'w', encoding='utf-8', newline='').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('list updated', d['countsCurrent'])
