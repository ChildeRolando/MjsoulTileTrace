#!/usr/bin/env python
"""COAC-269 line B batch-9: zero-call source check of 157-11's five declared error targets.

The parent audit for cv1751276 declares five `error` issues, each claiming the hand's disputed
tile "4s" should be "6s" ("两列、每列三根索子"). This script re-reads the bound source images and
compares the disputed glyph structure with references rendered in the same bilibili/79-cn tile
artwork:

  * the same article's own 7s tiles  (1 red + 6 green sticks => 3 columns x 2 rows),
  * a 4s and a 6s tile from another article of the same book (cv1708627 b0008, whose parent
    transcription is "1s 2s 4s 5s 6s 6s 7s" and was not flagged).

Structure is counted mechanically: threshold the green bamboo pixels and count separated bands
along rows and columns. 4s = 2x2 (4 sticks). 6s = 3x2 (6 sticks).

No model call, no shared write, no candidate produced.
"""
import datetime
import hashlib
import io
import json
import os

import numpy as np
from PIL import Image

R = 'E:/AgentData/Coach/knowledge/processing/'
ART = os.path.dirname(os.path.abspath(__file__))
sha_file = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()


def bands(path, box):
    im = Image.open(R + path).convert('RGB').crop(box)
    a = np.array(im).astype(int)
    g = (a[:, :, 1] > 80) & (a[:, :, 0] < 140) & (a[:, :, 2] < 140)

    def runs(v):
        thr = max(1, v.max() * 0.15)
        out, inr = [], False
        for i, x in enumerate(v):
            if x > thr and not inr:
                s, inr = i, True
            elif x <= thr and inr:
                out.append([s, i])
                inr = False
        if inr:
            out.append([s, len(v)])
        return out

    rr, cc = runs(g.sum(axis=1)), runs(g.sum(axis=0))
    return {'cropBox': list(box), 'rowBands': len(rr), 'columnBands': len(cc),
            'sticks': len(rr) * len(cc), 'rows': rr, 'columns': cc}


ART157 = 'web-sources/v1/79-bilibili-cn/assets/'
A = {
    'b0005': ART157 + 'e92e6087d49744690943048bc34d8320e78cc8113865767420007920c267711b.png',
    'b0007': ART157 + '2646f88102f2261097f98d5da21820c1d51d9ef331feffda746c0e29881cbd5b.png',
    'b0009': ART157 + '885adeefbaa457fa67014cb6a36a08938aca7b75fa9226dc106ac5a231e5cfe2.png',
    'b0011': ART157 + '52934939c05078b749f6a7fda16e62ce8a50ee2d8d0d9b786c719736a27c89fb.png',
    'b0013': ART157 + 'fa77cc00b99926da7f6dc8a626a1dec41b4a83bcf19376fe9692d4ed502c9156.png',
}
ANCHOR = 'web-sources/v1/79-bilibili-cn/assets/ec41a43e8284cb3e2e23e9901fe17ef6b31a898316a5f223a8bcb51e46497689.png'

# disputed tile boxes (yellow-top runs detected on each strip image, 13-tile grid)
DISPUTED = [
    ('b0005', '79-bilibili-cn:cv1751276:b0005:figure', '手牌第 8 张',
     '5m 7m 7m 3p 5p 7p 3s 4s 7s 7s 8s 7z 7z', (240, 18, 263, 62)),
    ('b0007', '79-bilibili-cn:cv1751276:b0007:figure', '手牌第 7 张',
     '7m 7m 3p 5p 7p 3s 4s 7s 7s 8s', (217, 10, 240, 58)),
    ('b0009', '79-bilibili-cn:cv1751276:b0009:figure', '手牌第 5 张',
     '5m 7m 7m 3s 4s 7s 7s 8s 7z 7z', (153, 14, 176, 60)),
    ('b0011', '79-bilibili-cn:cv1751276:b0011:figure', '手牌第 8 张',
     '5m 7m 7m 3p 5p(赤) 7p 3s 4s 7s 7s 8s 7z 7z', (211, 18, 234, 66)),
    ('b0013', '79-bilibili-cn:cv1751276:b0013:figure', '手牌第 8 张',
     '3p 4p 6p 6p 7p 2s 2s 4s 8s 8s 8s 6z 6z', (242, 16, 265, 62)),
]
REFERENCES = [
    ('same-article 7s (b0005 tile 9)', A['b0005'], (269, 18, 292, 62),
     '7s = 1 red + 6 green, 3 columns x 2 rows'),
    ('same-article 7s (b0005 tile 10)', A['b0005'], (298, 18, 321, 62),
     '7s = 1 red + 6 green, 3 columns x 2 rows'),
    ('same-book anchor 4s (cv1708627 b0008 tile 9)', ANCHOR, (253, 16, 274, 66),
     'parent says 4s, no audit issue'),
    ('same-book anchor 6s (cv1708627 b0008 tile 11)', ANCHOR, (306, 16, 327, 66),
     'parent says 6s, no audit issue'),
]

AUDIT = ('audit/web/articles/79-bilibili-cn/cv1751276.'
         '30679ab106ecb7f8df1d30aeea265878e0488c2aa3c09e04fed58629114549de.json')
AUDIT_FINAL = ('audit/web/articles/79-bilibili-cn/cv1751276.'
               '30679ab106ecb7f8df1d30aeea265878e0488c2aa3c09e04fed58629114549de.'
               'retry-1792948857228-d69c915c.json')
parent_path = 'web-production/v1/candidates/79-bilibili-cn/cv1751276.display.json'
src_path = 'web-sources/v1/79-bilibili-cn/articles/cv1751276/source.json'

n = json.load(io.open(R + AUDIT_FINAL, encoding='utf-8'))
issues = [i for i in n['modelReview']['issues'] if i.get('severity') != 'source-note']

out = {
    'schema': 'coac269-batch9-source-conflict/1',
    'ticket': 'COAC-269', 'line': 'B', 'batch': 'b9',
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'modelCalls': 0, 'productionCalls': 0,
    'chapterId': '79-cn-chapter-157-11', 'articleId': 'cv1751276',
    'dispatchSource': ('COAC-244 6145c9f classification: 79-cn-chapter-157-11, category '
                       'figure-targeted-executable, entryPass true, declaredErrorTargets 5'),
    'parent': {'path': parent_path, 'sha256': sha_file(R + parent_path)},
    'parentAudit': {'path': AUDIT_FINAL, 'sha256': sha_file(R + AUDIT_FINAL),
                    'baseAudit': {'path': AUDIT, 'sha256': sha_file(R + AUDIT)},
                    'status': n['status'], 'method': n.get('method')},
    'source': {'path': src_path, 'sha256': sha_file(R + src_path)},
    'declaredIssues': [{'targetId': i['targetId'], 'severity': i['severity'],
                        'sourceEvidence': i.get('sourceEvidence'),
                        'description': i.get('description'),
                        'suggestedRepair': i.get('suggestedRepair')} for i in issues],
    'disputedTileReads': [], 'references': [],
    'sameArticleAnchors': {
        'b0005 tile 7 (parent: 3s)': bands(A['b0005'], (211, 18, 234, 62)),
        'b0005 tile 9 (parent: 7s)': bands(A['b0005'], (269, 18, 292, 62)),
        'b0013 dora (parent: 8s)': bands(A['b0013'], (456, 16, 479, 62)),
    },
    'otherObservation': {
        'b0011 dora indicator': {
            'parentTranscription': '宝牌；标注右侧的牌：6s',
            'sourceRead': bands(A['b0011'], (438, 18, 461, 66)),
            'note': ('producer diagnostic: the dora indicator glyph reads as the same 2 columns x 2 rows as the '
                     'disputed hand tiles, which conflicts with the parent label 6s. It is NOT one of the declared '
                     'error targets; it stays an unresolved item for the independent adjudication and was not '
                     'repaired and not added as a target'),
        },
    },
    'evidenceClass': 'producer-side diagnostic, NOT a semantic verdict (issue description correction 2026-10-27T15:52Z)',
    'conclusion': ('Producer-side visual diagnostic only. This line reads a 4-stick (2 columns x 2 rows) bamboo '
                   'tile at all five disputed positions, matching the parent transcription, while the parent '
                   'audit describes 3 columns x 2 rows (6s). Per the 2026-10-27T15:52Z rule this reading is an '
                   'unsupported diagnostic: it does not overturn the independent audit, does not declare the '
                   'parent faithful and does not declare the audit wrong. What it does establish for this batch '
                   'is that two readings conflict and that no independent image audit exists for cv1751276, so '
                   'the chapter was not dispatched (0 model calls, 0 candidate).'),
    'decision': 'withheld-before-dispatch, pending independent adjudication (0 production calls)',
    'decisionBasis': [
        'source images are exact matches of the book pages (chinese-source-body-correspondence.json exactSourceMatches)',
        'same-book 4s/6s anchors distinguish 2x2 from 3x2 mechanically — diagnostic only, not a verdict',
        'COAC-269 rule: 只修具体问题 / 未知不猜 / 不能盲发模型',
        'tile-audit-anchor-check: conflicts are not turned into revisions',
        '2026-10-27T15:52Z correction: visual reads are diagnostics; semantic conclusions need an independent GPT image audit on the same candidate SHA',
    ],
    'recommendedNext': ('schedule an independent image audit / adjudication of the cv1751276 parent audit through '
                        'COAC-244; that adjudication decides whether the chapter needs a revision or should be '
                        'reclassified. This line does not re-dispatch, retry, or expand targets.'),
}
for key, target, where, parent_text, box in DISPUTED:
    out['disputedTileReads'].append({
        'figure': target, 'disputedTile': where, 'parentTranscription': parent_text,
        'parentSays': '4s', 'auditSays': '6s', 'sourceRead': bands(A[key], box),
        'image': A[key], 'imageSha256': sha_file(R + A[key]),
    })
for name, path, box, note in REFERENCES:
    out['references'].append({'name': name, 'image': path, 'imageSha256': sha_file(R + path),
                              'transcriptionContext': note, 'structure': bands(path, box)})
out['allDisputedAre2x2'] = all(
    d['sourceRead']['rowBands'] == 2 and d['sourceRead']['columnBands'] == 2
    for d in out['disputedTileReads'])

out_path = os.path.join(ART, 'b9-157-11-source-conflict.json')
with io.open(out_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({
    'ok': out['allDisputedAre2x2'],
    'artifact': os.path.basename(out_path), 'sha256': sha_file(out_path),
    'disputed': [{'figure': d['figure'], 'rows': d['sourceRead']['rowBands'],
                  'cols': d['sourceRead']['columnBands']} for d in out['disputedTileReads']],
    'refs': [{'name': r['name'], 'rows': r['structure']['rowBands'],
              'cols': r['structure']['columnBands']} for r in out['references']],
    'dora': {'rows': out['otherObservation']['b0011 dora indicator']['sourceRead']['rowBands'],
             'cols': out['otherObservation']['b0011 dora indicator']['sourceRead']['columnBands']},
}, ensure_ascii=False, indent=2))
