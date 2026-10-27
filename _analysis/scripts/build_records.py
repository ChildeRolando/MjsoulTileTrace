import sys, os, json, glob, collections
sys.path.insert(0, '_analysis/scripts')
from lib import *
sys.stdout.reconfigure(encoding='utf-8')

cmap = load(ROOT + '/integration/chapter-map.navigation-v3.json')
cov = load(ROOT + '/integration/full-coverage-and-usage.json')
prev = load(ROOT + '/integration/accepted-preview-current.json')
cncorr = load(ROOT + '/integration/chinese-source-body-correspondence.json')
mpc = load(ROOT + '/integration/modern-pdf-url-coverage.json')
mtitle = load(ROOT + '/integration/modern-web-pdf-correspondence.json')
selv3 = load(ROOT + '/integration/modern-current-source-selection-v3.json')
m246 = load('_analysis/incoming/coac246-57-verification-summary.json')
cursel = load(ROOT + '/integration/current-candidate-selection.json')

chapters = {c['id']: c for c in cmap['chapters']}
covch = {c['chapterId']: c for c in cov['originalChapterCoverage']['chapters']}
c246 = {r['chapterId']: r for r in m246['chapters']}

cn_art2ch = {}
for a in cncorr['articles']:
    for cid in a['pdfChapterIds']:
        cn_art2ch.setdefault(a['articleId'], set()).add(cid)
cn_ch2art = {}
for aid, cids in cn_art2ch.items():
    for cid in cids:
        cn_ch2art.setdefault(cid, set()).add(aid)
cn_by_id = {a['articleId']: a for a in cncorr['articles']}
mod_ch2meta = {ch['pdfChapterId']: ch for ch in mpc['chapters']}
mod_ch2art = {cid: ch['articleId'] for cid, ch in mod_ch2meta.items() if ch.get('sourceCaptured') and ch.get('articleId')}
mtitle_ch2urls = {}
for u in mtitle['uniqueUrls']:
    for t in u.get('pdfTitleMatches', []):
        mtitle_ch2urls.setdefault(t['chapterId'], []).append(u['url'])
sel_v3 = {a['articleId']: a for a in selv3['articles']}

KNOWN = set(cn_by_id) | set(mod_ch2art.values()) | {ch['articleId'] for ch in mpc['chapters'] if ch.get('articleId')}


def article_of(path):
    base = os.path.basename(path)
    best = None
    for aid in KNOWN:
        if base.startswith(aid + '.') and (best is None or len(aid) > len(best)):
            best = aid
    return best or base


prev_web = {}
for s in prev['selectedWeb']:
    prev_web.setdefault(article_of(s['candidatePath']), []).append(s)
prev_pdf_ch = set()
for st in prev['selectedPdf']['stages']:
    for cid in st['receipt'].get('chapterIds', []):
        prev_pdf_ch.add(cid)


def is_pass(s):
    return bool(s) and s.startswith('passed')


def web_receipts(sid, aid):
    out = []
    for p in glob.glob(os.path.join(ROOT, 'audit/web/articles', sid, aid + '.*.json')):
        r = load(p)
        prod = r.get('production') or {}
        out.append(dict(path=rel(p), status=r.get('status'), recordedAt=r.get('recordedAt'),
                        candidateSha256=prod.get('sha256'), candidatePath=prod.get('path'),
                        sourceSha256=(r.get('source') or {}).get('sourceSha256'),
                        sourcePath=(r.get('source') or {}).get('sourcePath'),
                        deterministicPassed=(r.get('deterministicChecks') or {}).get('passed'),
                        semanticComplete=(r.get('semanticCompleteness') or {}).get('complete'),
                        modelChecksPassed=(r.get('modelChecks') or {}).get('passed')))
    out.sort(key=lambda x: x['recordedAt'] or '')
    return out


def web_candidates(sid, aid):
    out = []
    for p in glob.glob(os.path.join(ROOT, 'web-production/v1/candidates', sid, aid + '*.json')):
        out.append(dict(path=rel(p), sha256=sha_file(p), size=os.path.getsize(p)))
    out.sort(key=lambda x: x['path'])
    return out


pdf_cands = collections.defaultdict(list)
for p in glob.glob(ROOT + '/production/**/candidates/*/page-*.json', recursive=True):
    parts = p.replace(os.sep, '/').split('/')
    sid = parts[-2]
    fn = parts[-1]
    try:
        pg = int(fn.replace('page-', '').replace('.json', ''))
    except ValueError:
        continue
    pdf_cands[(sid, pg)].append(rel(p))
pdf_rcpts = collections.defaultdict(dict)
for p in glob.glob(ROOT + '/audit/pages/*/page-*.json'):
    parts = p.replace(os.sep, '/').split('/')
    sid = parts[-2]
    fn = parts[-1]
    try:
        pg = int(fn.split('.')[0].replace('page-', ''))
    except ValueError:
        continue
    r = load(p)
    csha = fn.split('.')[1] if len(fn.split('.')) > 1 else None
    pdf_rcpts[(sid, pg)].setdefault(csha, []).append(
        dict(path=rel(p), status=r.get('status'), recordedAt=r.get('recordedAt'),
             pageDataSha256=(r.get('source') or {}).get('pageDataSha256'),
             det=(r.get('deterministicChecks') or {}).get('passed')))
sel_pages = {}
for pg in cursel.get('pages', []):
    sel_pages[(pg['sourceId'], pg['page'])] = pg


def page_block_count(sid, pg):
    p = os.path.join(ROOT, sid, 'pages', '%03d.json' % pg)
    if not os.path.exists(p):
        return None
    d = load(p)
    return len(d.get('blocks') or [])


def pdf_page_status(sid, pg):
    fp = os.path.join(ROOT, sid, 'pages', '%03d.json' % pg)
    cur_sha = sha_file(fp) if os.path.exists(fp) else None
    cands = pdf_cands.get((sid, pg), [])
    rc = pdf_rcpts.get((sid, pg), {})
    best = None
    for csha, lst in rc.items():
        lst = sorted(lst, key=lambda x: x['recordedAt'] or '')
        last = lst[-1]
        rec = dict(candidateSha256=csha, status=last['status'], recordedAt=last['recordedAt'],
                   receiptPath=last['path'],
                   sourceBound=(last['pageDataSha256'] == cur_sha) if cur_sha else None,
                   deterministicPassed=last['det'])
        if best is None or (rec['recordedAt'] or '') > (best['recordedAt'] or ''):
            best = rec
    return dict(page=pg, candidates=len(cands), candidatePaths=cands, receipt=best,
                blocks=page_block_count(sid, pg), selected=(sid, pg) in sel_pages,
                selectedStatus=sel_pages.get((sid, pg), {}).get('auditStatus'))


def chapter_pages(cid):
    ent = chapters[cid]
    pages = set()
    for u in ent.get('units') or []:
        f = (u.get('from') or {}).get('page')
        t = (u.get('to') or {}).get('page')
        if f is None:
            continue
        for p in range(min(f, t), max(f, t) + 1):
            pages.add(p)
    return sorted(pages)


def web_status(sid, aid):
    cands = web_candidates(sid, aid)
    rc = web_receipts(sid, aid)
    cur = None
    basis = None
    if aid in cn_by_id:
        cur = cn_by_id[aid]['sourceSha256']
        basis = 'chinese-source-body-correspondence.sourceSha256'
    elif aid in sel_v3:
        cur = sel_v3[aid]['sourceFileSha256']
        basis = 'modern-current-source-selection-v3.sourceFileSha256'
    best = None
    for r in rc:
        rec = dict(r)
        rec['sourceBoundCurrent'] = (r['sourceSha256'] == cur) if cur else None
        if best is None or (r['recordedAt'] or '') > (best['recordedAt'] or ''):
            best = rec
    return dict(candidates=cands, receipts=rc, latest=best,
                currentSourceSha256=cur, currentSourceBasis=basis)
