"""Write the 283-1 group-revision round record, summary and delivery copies."""
import json, hashlib, os, shutil
from datetime import datetime, timezone
root = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(root, r)
D = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sha = lambda b: hashlib.sha256(b).hexdigest()
fsha = lambda p: sha(open(p, 'rb').read())
cand_rel = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json'
cand_path = P(cand_rel); cand_sha = fsha(cand_path)
cand = json.load(open(cand_path, encoding='utf-8'))
audit_rel = 'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.%s.json' % cand_sha
audit_path = P(audit_rel); a = json.load(open(audit_path, encoding='utf-8'))
tg_rel = 'integration/coac248-283-1-group-revision-targets-20261027.json'
tg_path = P(tg_rel); tg = json.load(open(tg_path, encoding='utf-8'))
rev = cand['provenance']['revision']
te_rel = 'integration/coac250-incremental-227-1-246-1-20261027.json'
te = json.load(open(P(te_rel), encoding='utf-8'))
te_sha = fsha(P(te_rel))
groups = {}
for r in a['batchReviews']:
    c = r['calls'][0]
    groups[r['group']['batchId']] = {
        'status': r['status'], 'callId': c['callId'], 'usage': c['usage'],
        'issues': [{'severity': i['severity'], 'targetId': i['targetId'], 'description': i['description']} for i in (r['modelReview'] or {}).get('issues', [])],
        'checkpoint': r['checkpoint'],
    }
summary = {
    'schema': 'coac-283-1-group-revision/1',
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'articleId': 'chapter06-exercise003', 'chapterId': 'nemata-jp-chapter-283-1',
    'option': 'B: group-targeted revision, no whole-chapter re-production',
    'parent': {'path': rev['parentPath'], 'sha256': rev['parentSha256'], 'auditPath': rev['notesPath'], 'auditSha256': rev['notesSha256']},
    'candidate': {'path': cand_rel, 'sha256': cand_sha, 'selfSha256': cand['candidateSha256']},
    'targets': {'path': tg_rel, 'sha256': fsha(tg_path), 'textBlockIds': tg['textBlockIds'], 'figureIds': tg['figureIds'], 'groups': tg['groups']},
    'production': {'calls': len(cand['provenance']['attempts']), 'usage': cand['provenance']['usage'],
                   'groups': [{'batchId': x['batchId'], 'callId': x['callId'], 'targets': x['targets'], 'usage': x['usage']} for x in cand['provenance']['attempts']]},
    'audit': {'path': audit_rel, 'sha256': fsha(audit_path), 'status': a['status'], 'method': a['method'],
              'calls': len(a['calls']), 'groups': groups,
              'inheritedGroups': [{'batchId': r['group']['batchId'], 'status': r['status']} for r in a['inheritedBatchReviews']]},
    'deferred': tg['deferred'],
    'deferredCount': len(tg['deferred']),
    'deferredBreakdown': {'tablePositionOutsideFiveGroups': 6, 'uncertainUnknowns': 3},
    'contested': {'targetId': 'modern-yabejp-ja:chapter06-exercise003:b0785:figure',
                  'auditVerdict': 'needs-repair: the auditor reads the centre corner winds as 左上西/右下东',
                  'productionEvidence': 'audit/web/adjudications/group-revision-283-1/b0785-corner-winds-contest-20261027.json',
                  'handling': 'candidate left unchanged; bounded adjudication requested for the next round (one audit call), consistent with the earlier rule that an audit tile/label reading needs same-book anchor or original-image counter-evidence before a candidate is edited',
                  'modelCalls': 0},
    'notReaudited': ['chapter06-exercise003-batch-010'],
    'preserved': 'parent candidate, all parent raw calls, the eleven parent batch checkpoints and the parent needs-repair audit receipt are untouched; every non-target block and figure is byte-identical',
    'projectionVersion': 3,
    'handoff250': {'path': te_rel, 'sha256': te_sha, 'chapters': [c['chapterId'] for c in te['chapters']],
                   'wakeupId': '01a17bf2-2e69-7337-9583-eec0d41621a5'},
}
sp = os.path.join(D, 'summary-283-1-group-revision-20261027.json')
with open(sp, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(summary, f, ensure_ascii=False, indent=1); f.write('\n')
rp = os.path.join(D, 'receipt-283-1-group-revision.json')
shutil.copyfile(audit_path, rp)
round_record = {
    'schema': 'coac-248-round-record/1',
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'round': '2026-10-27T06:00-07:00Z',
    'receipts': [],
    'groupRevision': {
        'chapterId': 'nemata-jp-chapter-283-1', 'option': 'B',
        'candidate': {'path': cand_rel, 'sha256': cand_sha},
        'audit': {'path': audit_rel, 'sha256': fsha(audit_path), 'status': a['status']},
        'parent': {'path': rev['parentPath'], 'sha256': rev['parentSha256'], 'auditSha256': rev['notesSha256']},
        'targets': {'path': tg_rel, 'sha256': fsha(tg_path), 'textBlockIds': tg['textBlockIds'], 'figureIds': tg['figureIds']},
        'groups': list(groups.keys()),
        'inheritedGroups': [r['group']['batchId'] for r in a['inheritedBatchReviews']],
        'deferredCount': len(tg['deferred']),
        'deferredBreakdown': {'tablePositionOutsideFiveGroups': 6, 'uncertainUnknowns': 3},
        'projectionVersion': 3,
    },
    'modelCalls': {
        'production': len(cand['provenance']['attempts']),
        'audit': len(a['calls']),
        'productionUsage': [x['usage'] for x in cand['provenance']['attempts']],
        'auditUsage': [x['usage'] for x in a['calls']],
        'retries': 0, 'transportFailures': 0,
        'caps': {'production': 5, 'audit': 5},
    },
    'handoff250': {'path': te_rel, 'sha256': te_sha, 'chapters': [c['chapterId'] for c in te['chapters']],
                   'wakeupId': '01a17bf2-2e69-7337-9583-eec0d41621a5'},
    'list': {'path': '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'},
    'runtime': {'path': 'audit/runtimes/web-group-revision-20261027',
                'manifest': 'audit/runtime-patches/20261027-coac248-283-1-group-revision/manifest.json'},
    'stillOpen': {'needsRepair': 53, 'b0785CornerContest': 1, 'note': '283-1 stays needs-repair: nine deferred findings (six table gaps outside the five revised groups, b0099 and two river-tile unknowns) remain open by instruction'},
}
rpth = os.path.join(D, 'round-20261027T0700.json')
with open(rpth, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(round_record, f, ensure_ascii=False, indent=1); f.write('\n')
for p in (sp, rp, rpth):
    print(p, fsha(p))
