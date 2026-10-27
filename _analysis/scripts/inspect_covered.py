import sys,os,json
sys.path.insert(0,'_analysis/scripts')
from lib import *
sys.stdout.reconfigure(encoding='utf-8')
mpc=load(ROOT+'/integration/modern-pdf-url-coverage.json')
mod={ch['pdfChapterId']:ch for ch in mpc['chapters']}
prev=load(ROOT+'/integration/accepted-preview-current.json')
sel={}
KNOWN=set()
cncorr=load(ROOT+'/integration/chinese-source-body-correspondence.json')
KNOWN|={a['articleId'] for a in cncorr['articles']}
KNOWN|={ch['articleId'] for ch in mpc['chapters'] if ch.get('articleId')}
def article_of(path):
    base=os.path.basename(path); best=None
    for aid in KNOWN:
        if base.startswith(aid+'.') and (best is None or len(aid)>len(best)): best=aid
    return best or base
for s in prev['selectedWeb']:
    sel.setdefault(article_of(s['candidatePath']),[]).append(s)
ids=['79-cn-chapter-054-4','79-cn-chapter-070-6','79-cn-chapter-072-7','79-cn-chapter-114-4','79-cn-chapter-117-3','79-cn-chapter-211-5','nemata-jp-chapter-047-1','nemata-jp-chapter-083-1','nemata-jp-chapter-098-1','nemata-jp-chapter-108-1','nemata-jp-chapter-111-1','nemata-jp-chapter-111-25','nemata-jp-chapter-263-1','nemata-jp-chapter-318-1','nemata-jp-chapter-319-1','nemata-jp-chapter-324-1','nemata-jp-chapter-335-1','nemata-jp-chapter-345-1']
cmap={c['id']:c for c in load(ROOT+'/integration/chapter-map.navigation-v3.json')['chapters']}
reg={r['chapterId']:r for r in load(ROOT+'/integration/coac250-uncovered-chapter-continuation-register-20261027b.json')['rows']}
for cid in ids:
    ch=cmap[cid]
    m=mod.get(cid)
    print('==',cid,'| pages',ch.get('units') and [ (u.get('from') or {}).get('page') for u in ch['units']][:3])
    if m: print('   modern map: article',m.get('articleId'),'headerPages',m.get('pdfPagesWithSameHeader'),'captured',m.get('sourceCaptured'))
    else: print('   modern map: NONE')
    if cid in reg:
        wc=reg[cid].get('webCorrespondence') or []
        print('   register webCorr:',[(w.get('articleId'),w.get('decision')) for w in wc])
    # find article in preview
    arts=set()
    for a in cncorr['articles']:
        if cid in a['pdfChapterIds']: arts.add(a['articleId'])
    if m and m.get('articleId'): arts.add(m['articleId'])
    for a in arts:
        entries=sel.get(a,[])
        print('   article',a,'in preview:',len(entries), [(os.path.basename(e['candidatePath']),e['auditStatus'],e['candidateSha256'][:12]) for e in entries])
