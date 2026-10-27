import json, hashlib, io, os
ROOT='E:/AgentData/Coach/knowledge/processing'
SUM='C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-250-bde01703b1bc/worktree/_analysis/incoming/coac246-57-verification-summary.json'
L='.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for c in iter(lambda:f.read(1<<20),b''): h.update(c)
    return h.hexdigest()
s=json.load(open(SUM,encoding='utf-8'))
lst=json.load(open(L,encoding='utf-8'))
byc={o.get('chapterId'):o for o in lst['objects'] if o.get('chapterId')}
rep=[c for c in s['chapters'] if c['action']=='repair']
res={'repairChapters':len(rep),'inList':0,'missingFromList':[],'shaMismatch':[],'diskMismatch':[],'missingDisk':[],'dedupeSameSha':[],'dedupeShaMismatch':[],'nonRepairInList':[],'failedOverlap':[]}
failed={o.get('objectId') for o in lst['failedSeparate']}
failedArt={}
for o in lst['failedSeparate']:
    failedArt[o.get('articleId')]=o
for c in rep:
    o=byc.get(c['chapterId'])
    if not o: res['missingFromList'].append(c['chapterId']); continue
    res['inList']+=1
    if o.get('candidateSha256')!=c['candidateSha256']: res['shaMismatch'].append(c['chapterId'])
    p=os.path.join(ROOT,c['candidatePath'])
    if not os.path.exists(p): res['missingDisk'].append(c['chapterId'])
    elif sha(p)!=c['candidateSha256']: res['diskMismatch'].append(c['chapterId'])
    if o.get('dedupeNote') or o.get('origin')=='COAC-249 explicit 20':
        pass
    if c['articleId'] in failedArt: res['failedOverlap'].append(c['articleId'])
# dedupe entries
for d in lst['dedupe']:
    o=byc.get(d.get('chapterId'))
    if o is None: continue
    if o.get('candidateSha256')!=d['candidateSha256']: res['dedupeShaMismatch'].append(d['objectId'])
    else: res['dedupeSameSha'].append(d['objectId'])
# non repair in list
ids={c['chapterId'] for c in rep}
for c in s['chapters']:
    if c['action']!='repair' and c['chapterId'] in byc: res['nonRepairInList'].append((c['chapterId'],c['action']))
res['nonRepairCount']=sum(1 for c in s['chapters'] if c['action']!='repair')
res['diskVerified']=res['inList']-len(res['missingDisk'])-len(res['diskMismatch'])
res['shaVerified']=res['inList']-len(res['shaMismatch'])
print(json.dumps(res,ensure_ascii=False,indent=1))
json.dump(res,open('_verify_246.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
