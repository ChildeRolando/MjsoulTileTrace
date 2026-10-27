"""Record round 2026-10-27T06:00-07:00Z in the unified repair list.

283-1 (chapter06-exercise003) moved from "failed, two unlock paths" to a
group-targeted revision: five production calls and five independent group
audits, with a nine-item deferred difference set that is carried, not cleared.
No model call happens here.
"""
import json, hashlib, os
root = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(root, r)
sha = lambda b: hashlib.sha256(b).hexdigest()
LP = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'unified-repair-list-20261027.json'))
d = json.load(open(LP, encoding='utf-8'))
cand_rel = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json'
cand_bytes = open(P(cand_rel), 'rb').read(); cand_sha = sha(cand_bytes); c = json.loads(cand_bytes)
audit_rel = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.%s.json' % cand_sha
audit_bytes = open(P(audit_rel), 'rb').read(); a = json.loads(audit_bytes)
tg_rel = 'integration/coac248-283-1-group-revision-targets-20261027.json'
tg = json.load(open(P(tg_rel), encoding='utf-8')); tg_sha = sha(open(P(tg_rel), 'rb').read())
rev = c['provenance']['revision']
assert a['production']['sha256'] == cand_sha and a['method'] == 'independent-sol-high-complete-unit-batch-group-revision'
assert rev['groupRevision']['groups'] == tg['groups'] and sorted(rev['textBlockIds']) == sorted(tg['textBlockIds'])
entry = None
for o in d['failedSeparate']:
    if o.get('articleId') == 'chapter06-exercise003':
        entry = o
assert entry is not None, 'chapter06-exercise003 is not the tracked failed object'
groups = [{'batchId': r['group']['batchId'], 'status': r['status'], 'callId': r['calls'][0]['callId'],
           'usage': r['calls'][0]['usage'],
           'issues': [i['targetId'] + ':' + i['severity'] for i in (r['modelReview'] or {}).get('issues', [])]}
          for r in a['batchReviews']]
entry.update({
    'auditStatus': a['status'],
    'currentDisposition': 'needs-repair-group-revision-audited-deferred-open',
    'candidatePath': 'E:/AgentData/Coach/knowledge/processing/' + cand_rel,
    'candidateSha256': cand_sha,
    'auditPath': 'E:/AgentData/Coach/knowledge/processing/' + audit_rel,
    'auditSha256': sha(audit_bytes),
    'auditRecordedAt': a.get('recordedAt'),
    'issueCount': len(tg['deferred']),
    'auditSourceStale': False,
    'diskShaVerified': True,
    'groupRevision': {
        'schema': 'coac-283-1-group-targeted-revision/1',
        'parentCandidatePath': rev['parentPath'], 'parentCandidateSha256': rev['parentSha256'],
        'parentAuditPath': rev['notesPath'], 'parentAuditSha256': rev['notesSha256'],
        'targetsFile': {'path': tg_rel, 'sha256': tg_sha},
        'textBlockIds': tg['textBlockIds'], 'figureIds': tg['figureIds'],
        'groups': groups,
        'inheritedGroups': [{'batchId': r['group']['batchId'], 'status': r['status']} for r in a['inheritedBatchReviews']],
        'notReaudited': ['chapter06-exercise003-batch-010'],
        'deferred': tg['deferred'],
        'deferredCount': len(tg['deferred']),
        'productionCalls': len(c['provenance']['attempts']),
        'auditCalls': len(a['calls']),
        'projectionVersion': 3,
        'contested': {'targetId': 'modern-yabejp-ja:chapter06-exercise003:b0785:figure',
                      'auditVerdict': 'needs-repair (centre corner winds read as 左上西/右下东)',
                      'evidence': 'audit/web/adjudications/group-revision-283-1/b0785-corner-winds-contest-20261027.json',
                      'handling': 'candidate unchanged; one bounded adjudication call next round',
                      'modelCalls': 0},
        'unchanged': 'every non-target block and figure is byte-identical to the parent candidate; parent raw calls, batch checkpoints and the parent needs-repair receipt are untouched',
    },
})
d['round20261027T0700'] = {
    'at': '2026-10-27T06:00:00.000Z',
    'objects': ['web-failed:chapter06-exercise003'],
    'productionModelCalls': len(c['provenance']['attempts']),
    'auditModelCalls': len(a['calls']),
    'note': '283-1 option B: five group-targeted production calls and five independent group audits; eight error targets revised, nine findings deferred by exact issue hash (six table gaps outside the five groups plus b0099 and two river-tile unknowns)',
    'candidateSha256': cand_sha, 'auditSha256': sha(audit_bytes),
}
d['refreshedAt'] = '2026-10-27T06:00:00.000Z'
b = json.dumps(d, ensure_ascii=False, indent=2).encode('utf-8') + b'\n'
open(LP, 'wb').write(b)
print('list updated', sha(b), 'deferred', len(tg['deferred']), 'audit', a['status'])
