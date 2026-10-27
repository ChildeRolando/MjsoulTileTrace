import sys,os,json,glob,collections
sys.path.insert(0,'_analysis/scripts')
from lib import *
sys.stdout.reconfigure(encoding='utf-8')

cmap=load(ROOT+'/integration/chapter-map.navigation-v3.json')
cov=load(ROOT+'/integration/full-coverage-and-usage.json')
prev=load(ROOT+'/integration/accepted-preview-current.json')
cncorr=load(ROOT+'/integration/chinese-source-body-correspondence.json')
mpc=load(ROOT+'/integration/modern-pdf-url-coverage.json')
mtitle=load(ROOT+'/integration/modern-web-pdf-correspondence.json')
selv3=load(ROOT+'/integration/modern-current-source-selection-v3.json')
m246=load('_analysis/incoming/coac246-57-verification-summary.json')

chapters={c['id']:c for c in cmap['chapters']}
covch={c['chapterId']:c for c in cov['originalChapterCoverage']['chapters']}

# article -> chapters (body correspondence)
cn_art2ch={}
for a in cncorr['articles']:
    for cid in a['pdfChapterIds']: cn_art2ch.setdefault(a['articleId'],set()).add(cid)
cn_ch2art={}
for aid,cids in cn_art2ch.items():
    for cid in cids: cn_ch2art.setdefault(cid,set()).add(aid)

mod_ch2art={ch['pdfChapterId']:ch['articleId'] for ch in mpc['chapters'] if ch.get('sourceCaptured') and ch.get('articleId')}
mod_ch2meta={ch['pdfChapterId']:ch for ch in mpc['chapters']}
mod_title2ch={}
for u in mtitle['uniqueUrls']:
    for t in u.get('pdfTitleMatches',[]):
        mod_title2ch.setdefault(t['chapterId'],set()).add((u['catalogTitles'][0] if u.get('catalogTitles') else None,u['url']))

# preview sets
KNOWN=set(cncorr and [a['articleId'] for a in cncorr['articles']])|{ch['articleId'] for ch in mpc['chapters'] if ch.get('articleId')}
for u in mtitle['uniqueUrls']:
    for t in u.get('pdfTitleMatches',[]): pass
KNOWN|=set()
def article_of(path):
    base=os.path.basename(path)
    best=None
    for aid in KNOWN:
        if base.startswith(aid+'.') and (best is None or len(aid)>len(best)): best=aid
    return best or base.split('.display.json')[0]
prev_web=set()
for s in prev['selectedWeb']:
    art=article_of(s['candidatePath'])
    prev_web.add((s['candidatePath'],art,s['candidateSha256'],s['auditStatus']))
prev_web_articles={a for _,a,_,_ in prev_web}
prev_pdf_ch=set()
for st in prev['selectedPdf']['stages']:
    for cid in st['receipt'].get('chapterIds',[]): prev_pdf_ch.add(cid)
prev_legacy=set()
for a in prev.get('legacyAudits',[]): prev_legacy.add(a.get('chapterId'))

# classify every original chapter
rows=[]
for cid,c in chapters.items():
    mine=covch.get(cid,{})
    web_arts=set()
    tier=None
    if cid in cn_ch2art: web_arts|=cn_ch2art[cid]; tier='body'
    if cid in mod_ch2art: web_arts.add(mod_ch2art[cid]); tier='url-header'
    if not web_arts and cid in mod_title2ch: tier='title-only'
    in_prev_web = bool(web_arts & prev_web_articles)
    in_prev_pdf = cid in prev_pdf_ch
    legacy = cid in prev_legacy or (mine.get('legacyPreserved') and cid=='nemata-jp-chapter-098-1')
    rows.append(dict(chapterId=cid,sourceId=c.get('sourceId'),title=c.get('title'),
        units=len(c.get('units') or []),blocks=len(c.get('originalSourceBlockIds') or []),
        webArticles=sorted(web_arts),tier=tier,inPrevWeb=in_prev_web,inPrevPdf=in_prev_pdf,legacy=legacy,
        ledgerRoute=mine.get('verifiedRoute'),ledgerInPreview=mine.get('inVerifiedPreview')))
print('total chapters',len(rows))
print('preview web articles',len(prev_web_articles),'pdf chapters',len(prev_pdf_ch),'legacy',prev_legacy)
c=collections.Counter()
for r in rows:
    c[(r['inPrevWeb'],r['inPrevPdf'],r['legacy'],r['tier'])]+=1
for k,v in sorted(c.items(),key=str): print(v,k)
print('covered union',sum(1 for r in rows if r['inPrevWeb'] or r['inPrevPdf'] or r['legacy']))

uncovered=[r for r in rows if not (r['inPrevWeb'] or r['inPrevPdf'] or r['legacy'])]
print('computed uncovered',len(uncovered))
reg=load(ROOT+'/integration/coac250-uncovered-chapter-continuation-register-20261027b.json')
reg_ids={r['chapterId'] for r in reg['rows']}|{r['chapterId'] for r in reg['legacyCoveredRows']}
calc_ids={r['chapterId'] for r in uncovered}
print('register uncovered',len(reg_ids))
print('calc-only (register says covered, calc says not):',sorted(calc_ids-reg_ids))
print('register-only (calc says covered):',sorted(reg_ids-calc_ids))

print('\n=== UNCOVERED 62 (calc) with 246 + register ===')
regrows={r['chapterId']:r for r in reg['rows']}
c246={r['chapterId']:r for r in m246['chapters']}
for r in sorted(uncovered,key=lambda x:(x['sourceId'],x['chapterId'])):
    cid=r['chapterId']; m=c246.get(cid); rr=regrows.get(cid)
    print(f"{cid} | tier={r['tier']} | 246={m['action'] if m else '-'}/{m['auditStatus'] if m else '-'} | reg={rr['classification'] if rr else 'legacy'} | blocks={r['blocks']} units={r['units']}")
