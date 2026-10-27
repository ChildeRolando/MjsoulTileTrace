"""Write the round record and per-chapter receipts for 2026-10-27T05:15-05:35Z."""
import json, hashlib, os
from datetime import datetime, timezone

root = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(root, r)
sha = lambda b: hashlib.sha256(b).hexdigest()
here = os.path.dirname(os.path.abspath(__file__))
out_dir = os.path.normpath(os.path.join(here, '..'))

specs = [
    dict(chapter='nemata-jp-chapter-227-1', articleId='chapter04-section007', cand='chapter04-section007.rev1.json',
         parent='chapter04-section007.display.json',
         parentAudit='audit/web/articles/modern-yabejp-ja/chapter04-section007.b496daf315d5278e20aa81e233c156fad909add5efd97438acbbace5c6902740.retry-1792992301748-11647458.json',
         target='modern-yabejp-ja:chapter04-section007:b0007',
         frm='因此，选择确保和牌在名次期望值上更有利的情况，时常会出现。',
         to='因此，选择通过和牌锁定当前名次，在名次期望值上更有利的情况也时常出现。',
         why='確和了 is a win that locks the current placement (二確/三確 style), not a promise that a win will happen; 确保和牌 inverted the term',
         sourceEvidence='source block b0007: 「確和了をした方が順位期待値上有利になるケースはしばしば現れます。」',
         unchanged='the other 9 text blocks byte-identical; no figure runs in this article',
         displayNote='the revision candidate carries no presentationAsset; the display parent still serves the images'),
    dict(chapter='nemata-jp-chapter-246-1', articleId='chapter06-section002', cand='chapter06-section002.rev1.json',
         parent='chapter06-section002.display.json',
         parentAudit='audit/web/articles/modern-yabejp-ja/chapter06-section002.eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json',
         target='modern-yabejp-ja:chapter06-section002:b0070',
         frm='用完后每步必须在３０秒以内走出。',
         to='用完后每步必须在不足３０秒的时间内走出。',
         why='３０秒未満 is strictly less than 30 seconds; 以内 includes 30 and moved the rule boundary',
         sourceEvidence='source block b0070: 「持ち時間は１５分、無くなると１手３０秒未満で指すルール。」',
         unchanged='the other 85 text blocks byte-identical; the 10 figures are identical apart from the removed display-only presentationAsset',
         displayNote='the revision candidate carries no presentationAsset; the display parent still serves the images'),
]

receipts = []
for s in specs:
    cand_bytes = open(P('web-production/v1/candidates/modern-yabejp-ja/' + s['cand']), 'rb').read()
    cand_sha = sha(cand_bytes)
    c = json.loads(cand_bytes)
    audit_rel = 'audit/web/articles/modern-yabejp-ja/' + s['articleId'] + '.' + cand_sha + '.json'
    audit_bytes = open(P(audit_rel), 'rb').read()
    a = json.loads(audit_bytes)
    parent_bytes = open(P('web-production/v1/candidates/modern-yabejp-ja/' + s['parent']), 'rb').read()
    parent_audit_bytes = open(P(s['parentAudit']), 'rb').read()
    src_bytes = open(P(c['source']['sourcePath']), 'rb').read()
    assert a['status'] == 'passed' and a['production']['sha256'] == cand_sha
    assert c['provenance']['revision']['parentSha256'] == sha(parent_bytes)
    assert c['provenance']['revision']['notesSha256'] == sha(parent_audit_bytes)
    assert sha(src_bytes) == c['source']['sourceSha256'] == a['source']['sourceSha256']
    prod = c['provenance']['attempts'][0]
    aud = a['calls'][0]
    rec = dict(
        schema='coac-248-web-revision-receipt/1',
        status='passed',
        chapterId=s['chapter'], articleId=s['articleId'],
        source=dict(path=c['source']['sourcePath'], sha256=sha(src_bytes)),
        parent=dict(path='web-production/v1/candidates/modern-yabejp-ja/' + s['parent'], sha256=sha(parent_bytes),
                    auditPath=s['parentAudit'], auditSha256=sha(parent_audit_bytes), auditStatus='needs-repair'),
        candidate=dict(path='web-production/v1/candidates/modern-yabejp-ja/' + s['cand'], sha256=cand_sha),
        audit=dict(path=audit_rel, sha256=sha(audit_bytes), status=a['status'], method=a.get('method'),
                   recordedAt=a.get('recordedAt')),
        change=dict(target=s['target'], from_=s['frm'], to=s['to'], why=s['why'], sourceEvidence=s['sourceEvidence']),
        unchanged=s['unchanged'],
        presentation=s['displayNote'],
        calls=dict(production=dict(callId=prod['callId'], usage=prod.get('usage')),
                   audit=dict(callId=aud['callId'], usage=aud.get('usage'))),
        modelChecks=a['modelChecks'], effectiveModelChecks=a.get('effectiveModelChecks'),
        verify='ledger-level: candidate digest, receipt binding, parent/notes/source SHAs recomputed from disk in this round',
    )
    receipts.append(rec)
    rp = os.path.join(out_dir, 'receipt-' + s['articleId'] + '.passed.json')
    open(rp, 'w', encoding='utf-8').write(json.dumps(rec, ensure_ascii=False, indent=2) + '\n')
    print('wrote', os.path.basename(rp), sha(open(rp, 'rb').read()))

handoff_path = 'integration/coac250-incremental-211-1-173-1-20261027.json'
hb = open(P(handoff_path), 'rb').read()
tr_rel = 'audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-limited-recheck-20261027.json'
trb = open(P(tr_rel), 'rb').read()
tr = json.loads(trb)
list_bytes = open(os.path.join(out_dir, 'unified-repair-list-20261027.json'), 'rb').read()

round_doc = dict(
    schema='coac-248-round-record/1',
    recordedAt=datetime.now(timezone.utc).isoformat(),
    round='2026-10-27T05:15-05:35Z',
    receipts=[dict(chapterId=r['chapterId'], candidateSha256=r['candidate']['sha256'], auditSha256=r['audit']['sha256']) for r in receipts],
    modelCalls=dict(production=2, audit=2, productionUsage=[r['calls']['production']['usage'] for r in receipts],
                    auditUsage=[r['calls']['audit']['usage'] for r in receipts], retries=0, transportFailures=0),
    handoff250=dict(path=handoff_path, sha256=sha(hb), chapters=['nemata-jp-chapter-211-1', 'nemata-jp-chapter-173-1'],
                    delivery='the rolling COAC-250 consumer run started by the owner handoff comment was still active, so the receipt was written for it and no second wakeup was fired'),
    tableContextLimitedRecheck=dict(path=tr_rel, sha256=sha(trb), modelCalls=0, totals=tr['totals'],
                                    verdictsUnchanged=True),
    list=dict(path='.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json',
              sha256=sha(list_bytes)),
    stillOpen=dict(needsRepair=53, decisionHold=1, failedSeparate=1,
                   note='two web chapters left the open set this round; 283-1 stays open with no new production or audit call'),
)
rp = os.path.join(out_dir, 'round-20261027T0530.json')
open(rp, 'w', encoding='utf-8').write(json.dumps(round_doc, ensure_ascii=False, indent=2) + '\n')
print('wrote', os.path.basename(rp), sha(open(rp, 'rb').read()))
