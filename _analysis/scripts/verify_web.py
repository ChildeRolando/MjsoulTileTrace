import sys,os,json,glob
sys.path.insert(0,'_analysis/scripts')
from lib import *
sys.stdout.reconfigure(encoding='utf-8')

scr=load(ROOT+'/integration/modern-current-source-selection-v3.json')
cur_sel={a['articleId']:a for a in scr['articles']}
corr=load(ROOT+'/integration/chinese-source-body-correspondence.json')
cn={a['articleId']:a for a in corr['articles']}
mpc=load(ROOT+'/integration/modern-pdf-url-coverage.json')

def current_source_sha(sourceId, articleId):
    # selection v3 covers modern only; chinese selection from body correspondence sourceSha256
    if articleId in cn:
        return cn[articleId]['sourceSha256'], 'chinese-source-body-correspondence'
    a=cur_sel.get(articleId)
    if a: return a['sourceFileSha256'], 'modern-current-source-selection-v3'
    return None,None

def receipts(sourceId, articleId):
    d=os.path.join(ROOT,'audit/web/articles',sourceId)
    out=[]
    for p in glob.glob(os.path.join(d,articleId+'.*.json')):
        try: r=load(p)
        except Exception: continue
        cand=r.get('production',{}).get('sha256')
        out.append(dict(path=rel(p),sha256=sha_file(p),status=r.get('status'),
            recordedAt=r.get('recordedAt'),candidateSha256=cand,
            sourceSha256=(r.get('source') or {}).get('sourceSha256'),
            sourcePath=(r.get('source') or {}).get('sourcePath'),
            det=(r.get('deterministicChecks') or {}).get('passed'),
            model=(r.get('modelChecks') or {}).get('passed'),
            indep=(r.get('independentSource') or {}).get('passed'),
            semantic=(r.get('semanticCompleteness') or {}).get('complete')))
    out.sort(key=lambda x:x['recordedAt'] or '')
    return out

def candidates(sourceId, articleId):
    d=os.path.join(ROOT,'web-production/v1/candidates',sourceId)
    out=[]
    for p in glob.glob(os.path.join(d,articleId+'*.json')):
        out.append(dict(path=rel(p),sha256=sha_file(p),size=os.path.getsize(p)))
    return out

# test on sample
for sid,aid in [('79-bilibili-cn','cv1721475'),('modern-yabejp-ja','chapter01-section020'),('modern-yabejp-ja','chapter01-section029')]:
    print('==',sid,aid)
    print(' current source sha:',current_source_sha(sid,aid))
    for c in candidates(sid,aid): print('  cand',c['sha256'][:16],c['path'])
    for r in receipts(sid,aid): print('  rcpt',r['status'],r['recordedAt'],'cand',(r['candidateSha256'] or '')[:16],'src',(r['sourceSha256'] or '')[:16],'det',r['det'],'model',r['model'],'indep',r['indep'],'sem',r['semantic'])
