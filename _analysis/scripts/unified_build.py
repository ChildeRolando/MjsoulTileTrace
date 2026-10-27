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


def build_record(cid):
    c = chapters[cid]
    mine = covch.get(cid, {})
    pages = chapter_pages(cid)
    sid = c.get('sourceId')
    owned = len(mine.get('originalSourceBlockIds') or [])
    arts = []
    if cid in cn_ch2art:
        for aid in sorted(cn_ch2art[cid]):
            arts.append(dict(articleId=aid, webSourceId='79-bilibili-cn', tier='body',
                             evidencePath='integration/chinese-source-body-correspondence.json',
                             allowed=True,
                             basis='explicit article-to-pdfChapterIds body correspondence; changed/additional text stays web source; version differences retained'))
    if cid in mod_ch2art and mod_ch2art[cid] not in [a['articleId'] for a in arts]:
        aid = mod_ch2art[cid]
        m = mod_ch2meta[cid]
        arts.append(dict(articleId=aid, webSourceId='modern-yabejp-ja', tier='url-header',
                         evidencePath='integration/modern-pdf-url-coverage.json',
                         allowed=True,
                         basis='exact URL printed in the PDF page header (not title similarity); body equivalence recorded separately',
                         headerPages=m.get('pdfPagesWithSameHeader'),
                         sourceFileSha256=m.get('sourceFileSha256')))
    if not arts and cid in mtitle_ch2urls:
        arts.append(dict(articleId=None, webSourceId='modern-yabejp-ja', tier='title-only',
                         evidencePath='integration/modern-web-pdf-correspondence.json',
                         allowed=False,
                         basis='title match only: decision=requires-body-comparison, fullBodyEquivalenceConfirmed=false',
                         urls=mtitle_ch2urls[cid]))
    web_detail = []
    for a in arts:
        if a['articleId']:
            st = web_status(a['webSourceId'], a['articleId'])
            a = dict(a)
            a['candidateFiles'] = st['candidates']
            a['latestReceipt'] = st['latest']
            a['currentSourceSha256'] = st['currentSourceSha256']
            a['currentSourceBasis'] = st['currentSourceBasis']
            a['inPreview'] = bool(prev_web.get(a['articleId']))
            a['previewEntries'] = [dict(candidatePath=e['candidatePath'], candidateSha256=e['candidateSha256'],
                                        auditStatus=e['auditStatus'], auditPath=e['auditPath'])
                                   for e in prev_web.get(a['articleId'], [])]
        web_detail.append(a)
    pdet = [pdf_page_status(sid, p) for p in pages]
    pdf_passed = [d for d in pdet if d['receipt'] and is_pass(d['receipt']['status'])]
    pdf_cand_pages = [d for d in pdet if d['candidates']]
    pdf_missing = [d['page'] for d in pdet if not (d['receipt'] and is_pass(d['receipt']['status']))]
    in_prev_web = any(a.get('inPreview') for a in web_detail)
    in_prev_pdf = cid in prev_pdf_ch
    legacy = mine.get('legacyPreserved') is True or cid == 'nemata-jp-chapter-098-1'
    covered = in_prev_web or in_prev_pdf or legacy
    web_cands = sum(len(a.get('candidateFiles') or []) for a in web_detail)
    latest = None
    for a in web_detail:
        r = a.get('latestReceipt')
        if r and (latest is None or (r['recordedAt'] or '') > (latest['recordedAt'] or '')):
            latest = r
    if covered:
        verdict = 'covered-effective'
    elif web_cands or pdf_cand_pages:
        if latest:
            if is_pass(latest['status']):
                verdict = 'produced-passed-not-staged'
            elif latest['status'] == 'needs-repair':
                verdict = 'produced-needs-repair'
            elif latest['status'] == 'failed':
                verdict = 'produced-audit-failed'
            else:
                verdict = 'produced-audit-' + str(latest['status'])
        else:
            pst = [(p.get('receipt') or {}).get('status') for p in pdet if (p.get('receipt') or {}).get('status')]
            if any(x == 'needs-repair' for x in pst):
                verdict = 'produced-needs-repair'
            elif any(x == 'failed' for x in pst):
                verdict = 'produced-audit-failed'
            elif pst and all(is_pass(x) for x in pst):
                verdict = 'produced-pdf-passed-not-staged' if not [p for p in pdet if not p['candidates']] else 'produced-pdf-partial'
            elif pdf_cand_pages:
                verdict = 'produced-pdf-review-pending'
            else:
                verdict = 'produced-unreviewed'
    else:
        verdict = 'unproduced-no-candidate'
    return dict(chapterId=cid, sourceId=sid, title=c.get('title'), units=len(c.get('units') or []),
                ownedSourceBlocks=owned, pdfPages=pages,
                preview=dict(inPreviewByWeb=in_prev_web, inPreviewByPdf=in_prev_pdf,
                             legacyRetained=legacy, covered=covered,
                             ledgerInVerifiedPreview=mine.get('inVerifiedPreview'),
                             ledgerRoute=mine.get('verifiedRoute')),
                webCorrespondence=web_detail,
                pdf=dict(pagesTotal=len(pdet), pagesWithCandidate=len(pdf_cand_pages),
                         pagesWithPassedCandidate=len(pdf_passed),
                         missingPassedPages=pdf_missing, pageDetail=pdet),
                verdict=verdict,
                coac246=(dict(action=c246[cid]['action'], auditStatus=c246[cid]['auditStatus'],
                              candidateSha256=c246[cid]['candidateSha256'],
                              candidatePath=c246[cid]['candidatePath'],
                              repairErrors=c246[cid].get('repairErrors'),
                              units=c246[cid].get('units'), blocks=c246[cid].get('blocks'))
                         if cid in c246 else None))


records = [build_record(cid) for cid in chapters]
import datetime
out = dict(schema='coac250-unified-source-mapping/1',
           recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
           modelCalls=0, productionCalls=0,
           denominator=dict(originalChapters=256, originalUnits=303, originalSourceBlocks=21212),
           display=dict(previewOutput=prev['output'], corpusId=prev['corpusId'],
                        displayChapters=prev['chapters'], displayUnits=prev['units'],
                        displayBlocks=prev['blocks'], displayFigures=prev['figures'],
                        selectedWeb=len(prev['selectedWeb']), pendingWeb=len(prev['pendingWeb']),
                        pdfStages=len(prev['selectedPdf']['stages'])),
           contract=dict(
               chinese='integration/chinese-source-body-correspondence.json: explicit article->pdfChapterIds body correspondence; changed/additional text stays web source; version differences retained',
               modern_url='integration/modern-pdf-url-coverage.json: mapping evidence is the exact URL printed in the PDF page header, not title similarity; body equivalence compared separately',
               modern_title='integration/modern-web-pdf-correspondence.json: title match only is decision=requires-body-comparison, fullBodyEquivalenceConfirmed=false, therefore NOT an approved substitute',
               countPolicy='integration/full-coverage-and-usage.json originalChapterCoverage.countPolicy: web correspondence is not proof of per-block identity; final literal PDF-block equivalence is a separate acceptance check'),
           records=records)
open('_analysis/unified-source-mapping-20261027.json', 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')

import collections as _c
vc = _c.Counter(r['verdict'] for r in records)
print('verdicts:', dict(vc))
print('covered:', sum(1 for r in records if r['preview']['covered']))
unc = [r for r in records if not r['preview']['covered']]
print('uncovered:', len(unc))
print('uncovered with 246:', sum(1 for r in unc if r['coac246']))
print('uncovered not in 246:', [r['chapterId'] for r in unc if not r['coac246']])
print('uncovered no candidate at all:', [r['chapterId'] for r in unc if r['verdict'] == 'unproduced-no-candidate'])
