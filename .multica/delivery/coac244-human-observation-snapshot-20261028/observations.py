"""Read-only evidence extraction. Notes are inert data; this module never applies edits."""
import json,hashlib,re
from pathlib import Path
sha=lambda b:hashlib.sha256(b).hexdigest()
encoded=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
STATUSES={'answered','unclear','missing','skipped','withdrawn'}
BINDING=('id','targetId','imageSha256','originalImages','canonical','position')

def histories(events,queues):
    latest={};all_events={}
    for event in events:
        assert event['schema']=='coach-human-tile-annotation-event/1'
        q=queues[event['queueSha256']]
        matches=[i for i in q['items'] if i['id']==event['id']];assert len(matches)==1
        for k in BINDING:assert event[k]==matches[0][k],f'event binding: {k}'
        prev=latest.get(event['id'])
        if prev:
            assert event['revision']==prev['revision']+1,'revision chain'
            assert event['timestamp']>=prev['timestamp'],'timestamp order'
            for k in BINDING:assert event[k]==prev[k],f'stable binding: {k}'
        else:assert event['revision']==1,'history must start at first save'
        r=event['result'];assert r['status'] in STATUSES
        assert all(re.fullmatch(r'(?:[1-9][mps]|[1-7]z|0[mps])',t) for t in r['tiles'])
        if r['status']=='answered':assert r['tiles'] or r['orientation'].strip(),'empty answer'
        else:assert not r['tiles'] and not r['orientation'].strip(),'nonanswer cannot assert tiles'
        latest[event['id']]=event;all_events.setdefault(event['id'],[]).append(event)
    return latest,all_events

def classification(event):
    if event is None:return 'unfilled'
    r=event['result']
    if r['status']!='answered':return r['status']
    if r['tiles'] and r['orientation']:return 'explicit-code-and-orientation'
    if r['tiles']:return 'explicit-sequence' if len(r['tiles'])>1 else 'explicit-code'
    return 'explicit-orientation'

def verify_for_use(packet,item_id,candidate_sha,live_events,*,application_input=False):
    """Call immediately before use; withdrawals/edits invalidate old snapshot evidence."""
    row=next(r for r in packet['observations'] if r['itemId']==item_id)
    assert row['savedStatus']=='answered' and row['eligibleHumanEvidence']
    current=next((e for e in reversed(live_events) if e['id']==item_id),None)
    assert current is not None and sha(encoded(current))==row['latestEventSha256'],'new save/withdrawal: resnapshot required'
    assert candidate_sha==row['currentEvidence']['candidate']['sha256'],'candidate changed: exact target inheritance required'
    if application_input:assert row['disposition']=='ready-observation','conflict/already-applied: no automatic edit'
    return {'itemId':item_id,'tiles':row['result']['tiles'],'orientation':row['result']['orientation'],
            'noteAsDataOnly':row['result']['note'],'weight':'user-saved-visual-observation',
            'applicationPermit':False,'wholeChapterPassed':False}
