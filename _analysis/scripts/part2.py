

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
