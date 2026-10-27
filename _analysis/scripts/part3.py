import sys, os, json, collections
sys.path.insert(0, '_analysis/scripts')
from lib import *
sys.stdout.reconfigure(encoding='utf-8')

d = load('_analysis/unified-source-mapping-20261027.json')
recs = d['records']
byid = {r['chapterId']: r for r in recs}
reg = load(ROOT + '/integration/coac250-uncovered-chapter-continuation-register-20261027b.json')
reg_rows = {r['chapterId']: r for r in reg['rows']}
reg_legacy = {r['chapterId'] for r in reg['legacyCoveredRows']}
reg80 = set(reg_rows) | reg_legacy

# candidate body block counts
def body_blocks(path):
    p = os.path.join(ROOT, path)
    if not os.path.exists(p):
        return None
    try:
        dd = load(p)
        return len((dd.get('body') or {}).get('blocks') or [])
    except Exception:
        return None

def primary_web(r):
    best = None
    for a in r['webCorrespondence']:
        lr = a.get('latestReceipt')
        cands = a.get('candidateFiles') or []
        pick = None
        if lr and lr.get('candidatePath'):
            for c in cands:
                if c['sha256'] == lr['candidateSha256']:
                    pick = c
        if pick is None and cands:
            pick = cands[0]
        entry = dict(articleId=a.get('articleId'), webSourceId=a.get('webSourceId'), tier=a.get('tier'),
                     evidencePath=a.get('evidencePath'), substitutionAllowed=a.get('allowed'),
                     bodyEquivalenceConfirmed=(a.get('tier') == 'body'),
                     articleInPreview=a.get('inPreview'),
                     candidate=pick, latestReceipt=lr,
                     currentSourceSha256=a.get('currentSourceSha256'))
        if best is None:
            best = entry
        elif (entry['latestReceipt'] or {}).get('recordedAt', '') > (best['latestReceipt'] or {}).get('recordedAt', ''):
            best = entry
    return best

def gaps(r):
    owned = r['ownedSourceBlocks']
    if r['preview']['covered']:
        return dict(ownedSourceBlocks=owned, missingProductionBlocks=0, producedBlocks=owned,
                    acceptedBlocks=owned, pagesWithoutCandidate=[],
                    pagesWithoutPassedCandidate=r['pdf']['missingPassedPages'])
    web = primary_web(r)
    web_produced = bool(web and web.get('candidate'))
    pdf_prod = sum((p.get('blocks') or 0) for p in r['pdf']['pageDetail'] if p['candidates'])
    pdf_acc = sum((p.get('blocks') or 0) for p in r['pdf']['pageDetail']
                  if p.get('receipt') and str(p['receipt'].get('status', '')).startswith('passed'))
    pages_no_cand = [p['page'] for p in r['pdf']['pageDetail'] if not p['candidates']]
    if web_produced:
        produced = owned
        missing = 0
    else:
        produced = min(owned, pdf_prod)
        missing = max(0, owned - pdf_prod)
    web_passed = bool(web_produced and web.get('latestReceipt') and str(web['latestReceipt'].get('status', '')).startswith('passed'))
    accepted = min(owned, pdf_acc) if not web_produced else (owned if web_passed else 0)
    if web_produced:
        pend = 0 if web_passed else owned
        pend_pages = [] if web_passed else list(r['pdf']['missingPassedPages'])
    else:
        pend = 0
        pend_pages = []
        for p in r['pdf']['pageDetail']:
            st = (p.get('receipt') or {}).get('status')
            if p.get('candidates') and not (st and str(st).startswith('passed')):
                pend += (p.get('blocks') or 0)
                pend_pages.append(p['page'])
    return dict(ownedSourceBlocks=owned, missingProductionBlocks=missing, producedBlocks=produced,
                acceptedBlocks=accepted, acceptanceGapBlocks=pend, acceptanceGapPages=pend_pages,
                pagesWithoutCandidate=(pages_no_cand if not web_produced else []),
                pagesWithoutPassedCandidate=r['pdf']['missingPassedPages'])

groups = {}
for cid in reg80:
    r = byid[cid]
    if cid in reg_legacy:
        groups[cid] = 'legacy-covered'
    elif r['preview']['covered']:
        groups[cid] = 'reclassified-covered'
    elif r['coac246']:
        groups[cid] = 'confirmed-produced-not-covered'
    else:
        groups[cid] = 'additional-uncovered-not-in-246'

rows = []
for cid in sorted(reg80):
    r = byid[cid]
    web = primary_web(r)
    row = dict(chapterId=cid, originalChapterId=cid, sourceId=r['sourceId'], title=r['title'],
               units=r['units'], ownedSourceBlocks=r['ownedSourceBlocks'],
               adjudicationGroup=groups[cid],
               covered=r['preview']['covered'],
               coverageRoute=('web' if r['preview']['inPreviewByWeb'] else 'pdf' if r['preview']['inPreviewByPdf'] else 'legacy' if r['preview']['legacyRetained'] else None),
               approvedWebCorrespondence=({k: web[k] for k in ['articleId', 'webSourceId', 'tier', 'evidencePath', 'substitutionAllowed', 'bodyEquivalenceConfirmed', 'articleInPreview']} if web else None),
               existingCandidate=(dict(path=(web.get('candidate') or {}).get('path'),
                                        sha256=(web.get('candidate') or {}).get('sha256'),
                                        bodyBlocks=body_blocks((web.get('candidate') or {}).get('path') or ''),
                                        sourceSha256=(web.get('latestReceipt') or {}).get('sourceSha256'),
                                        currentSourceSha256=web.get('currentSourceSha256'),
                                        sourceBoundCurrent=(web.get('latestReceipt') or {}).get('sourceBoundCurrent'),
                                        auditStatus=(web.get('latestReceipt') or {}).get('status'),
                                        auditPath=(web.get('latestReceipt') or {}).get('path'),
                                        auditRecordedAt=(web.get('latestReceipt') or {}).get('recordedAt'),
                                        deterministicPassed=(web.get('latestReceipt') or {}).get('deterministicPassed'),
                                        semanticComplete=(web.get('latestReceipt') or {}).get('semanticComplete'))
                                   if web and web.get('candidate') else None),
               pdfRoute=dict(pagesTotal=r['pdf']['pagesTotal'], pagesWithCandidate=r['pdf']['pagesWithCandidate'],
                             pagesWithPassedCandidate=r['pdf']['pagesWithPassedCandidate'],
                             missingPassedPages=r['pdf']['missingPassedPages'],
                             pagesDetail=[dict(page=p['page'], candidates=p['candidates'], receiptStatus=(p['receipt'] or {}).get('status'),
                                               sourceBound=(p['receipt'] or {}).get('sourceBound'), selected=p['selected'], blocks=p.get('blocks'))
                                          for p in r['pdf']['pageDetail']]),
               gaps=gaps(r),
               verdict=r['verdict'],
               coac246=r['coac246'])
    rows.append(row)

counts = dict(
    originalChapters=256, originalUnits=303, originalSourceBlocks=21212,
    displayChapters=d['display']['displayChapters'], displayUnits=d['display']['displayUnits'],
    displayBlocks=d['display']['displayBlocks'], displayFigures=d['display']['displayFigures'],
    effectiveCoveredOriginalChapters=sum(1 for r in recs if r['preview']['covered']),
    effectiveUncoveredOriginalChapters=sum(1 for r in recs if not r['preview']['covered']),
    uncoveredProduced=sum(1 for r in recs if not r['preview']['covered'] and r['verdict'].startswith('produced')),
    trulyUnproduced=sum(1 for r in recs if r['verdict'] == 'unproduced-no-candidate'),
    register80=len(rows),
    register80Groups=collections.Counter(groups.values()),
    verdicts=collections.Counter(r['verdict'] for r in recs),
)

out = dict(schema='coac250-unified-chapter-register/1',
           recordedAt=d['recordedAt'], modelCalls=0, productionCalls=0,
           supersedes=dict(
               register='integration/coac250-uncovered-chapter-continuation-register-20261027b.json',
               readback='integration/coac250-coverage-readback-20261027b.json',
               coac246='coac246-57-verification-summary.json'),
           purpose='统一来源映射与真缺口裁决：逐原章列出获准网页对应、现存候选/源/审校状态、是否允许替代、缺失源块；供 244/246/247/248/249/250 全链使用。不触发新制作。',
           denominator=d['denominator'], display=d['display'], contract=d['contract'],
           counts=counts, rows=rows,
           corrections=[
               dict(id='register-classification', detail='原 80 章中 17 章在既定替代契约下已被当前预览有效覆盖（获准网页对应 + 已选候选审校 passed），应从“未覆盖/真未制作”移出；098-1 仍按 legacy 保留章覆盖。'),
               dict(id='truly-unproduced-zero', detail='逐 ID 核对候选后，80 章中 0 章为“真未制作”：56 章（246 组）+ 6 章（246 未覆盖到的 needsRepair 组）均有现存候选或已通过 PDF 页。'),
               dict(id='coac246-130-1', detail='246 记录为 audit-retry/failed；2026-10-27T01:43:49Z 已有 passed 回执（候选 021f93bc…，源 337b6f3f…，源绑定一致），应改判为 passed-not-staged。'),
               dict(id='coac246-source-stale', detail='246 对 131-1、183-1、303-1 标记 auditSourceStale=true；本轮重算候选/回执/source selection 三处源 SHA 一致（a463edd2…、cb73d3a8…、567beb70…），未复现过期。其未通过来自语义/模型结论（needs-repair/failed），不是源过期。'),
               dict(id='preview-preserved', detail='当前预览 194 展示章/202 units/5084 blocks/3653 figures 未改动；本轮 0 模型调用、0 生产调用、未推进 pointer、未写 selection。')])
open('_analysis/unified-chapter-register-20261027.json', 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({k: (dict(v) if isinstance(v, collections.Counter) else v) for k, v in counts.items()}, ensure_ascii=False, indent=1))
