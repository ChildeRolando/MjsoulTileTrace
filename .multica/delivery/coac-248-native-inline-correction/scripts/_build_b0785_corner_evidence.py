"""Build the bound-evidence package for the b0785 centre-corner-wind adjudication.

Free, deterministic: crops the four corner glyphs, the central panel and the round
label out of the bound original image, records every bbox and SHA-256, and states
the two competing readings. It does not decide anything and makes no model call.
"""
import hashlib
import json
import os
from datetime import datetime, timezone

from PIL import Image

ROOT = 'E:/AgentData/Coach/knowledge/processing'
P = lambda r: os.path.join(ROOT, r)
sha = lambda b: hashlib.sha256(b).hexdigest()

CAND_REL = 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev2.json'
CAND_SHA = '849267b84c85544fc8378ec8e462be1a2101766c40726dbd77ce7558c67c50f3'
SRC_REL = 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'
SRC_SHA = '8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de'
ASSET_REL = 'web-sources/v1/modern-yabejp-ja/assets/d3b908cf0a30ca29f61443e06d7254b9bec9601c4d006885dd2af0dfc465020d.jpg'
ASSET_SHA = 'd3b908cf0a30ca29f61443e06d7254b9bec9601c4d006885dd2af0dfc465020d'
OUT_DIR_REL = 'audit/web/adjudications/group-revision-283-1/crops-20261027'
OUT_REL = 'audit/web/adjudications/group-revision-283-1/b0785-corner-evidence-20261027.json'

cand_bytes = open(P(CAND_REL), 'rb').read()
src_bytes = open(P(SRC_REL), 'rb').read()
asset_bytes = open(P(ASSET_REL), 'rb').read()
assert sha(cand_bytes) == CAND_SHA, 'candidate changed'
assert sha(src_bytes) == SRC_SHA, 'source changed'
assert sha(asset_bytes) == ASSET_SHA, 'source asset changed'
cand = json.loads(cand_bytes)
src = json.loads(src_bytes)

figure = next(f for f in cand['figures'] if f['figureId'] == 'modern-yabejp-ja:chapter06-exercise003:b0785:figure')
assert figure['sourceAssetBindings'][0]['sha256'] == ASSET_SHA

im = Image.open(P(ASSET_REL)).convert('RGB')
os.makedirs(P(OUT_DIR_REL), exist_ok=True)

# bboxes are inclusive-exclusive (left, top, right, bottom) in the bound original's pixels.
CROPS = [
    ('board', 'whole board as displayed, for seat arrangement', (0, 0, 621, 565), 2),
    ('panel', 'central round/score panel with all four corner labels in place', (215, 215, 400, 340), 6),
    ('corner_tl', 'top-left corner glyph', (236, 229, 272, 267), 14),
    ('corner_tr', 'top-right corner glyph', (360, 229, 396, 267), 14),
    ('corner_bl', 'bottom-left corner glyph', (236, 292, 272, 330), 14),
    ('corner_br', 'bottom-right corner glyph', (358, 292, 394, 330), 14),
    ('round_label', 'the large round label 東四局 in the same panel', (262, 248, 300, 282), 12),
]

crops = []
for name, purpose, bbox, scale in CROPS:
    c = im.crop(bbox)
    c_native = c.copy()
    c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
    path_rel = f'{OUT_DIR_REL}/b0785-{name}-x{scale}.png'
    c.save(P(path_rel))
    crops.append({
        'name': name,
        'purpose': purpose,
        'path': path_rel,
        'sha256': sha(open(P(path_rel), 'rb').read()),
        'bboxInBoundOriginal': list(bbox),
        'scale': scale,
        'filter': 'nearest-neighbour',
        'outputPixels': [c.width, c.height],
        'nativePixels': [c_native.width, c_native.height],
    })

body_block = next(b for b in cand['body']['blocks'] if (b.get('sourceBlockIds') or [None])[0] == 'modern-yabejp-ja:chapter06-exercise003:b0785')
assert body_block.get('type') == 'figure' and body_block['figureId'] == figure['figureId']

evidence = {
    'schema': 'coac-bounded-corner-glyph-evidence/1',
    'recordedAt': datetime.now(timezone.utc).isoformat(),
    'chapterId': 'nemata-jp-chapter-283-1',
    'articleId': 'chapter06-exercise003',
    'figureId': figure['figureId'],
    'candidate': {'path': CAND_REL, 'sha256': CAND_SHA},
    'source': {'path': SRC_REL, 'sha256': SRC_SHA},
    'sourceAsset': {'path': ASSET_REL, 'sha256': ASSET_SHA, 'pixels': [im.width, im.height]},
    'competingReadings': {
        'candidateTranscription': '四角方位字样按画面位置为：左上东、右上北、左下南、右下西。',
        'batchReviewClaim': '原图中央四角方位为：左上西、右上北、左下南、右下东。',
        'candidateVerdict': '左上东、右上北、左下南、右下西（与父候选 dea1ba24 同一句一致）',
        'reviewerVerdict': '候选将中央左上与右下的东、西对调，造成座位方位信息错误。',
        'undisputedCorners': ['右上北', '左下南'],
    },
    'seatContext': {
        'bottomHand': '画面下方为该手牌与摸入5s；手牌正上方有一枚橙色「東」标记牌。',
        'otherHands': '顶部、左侧、右侧三家隐手，牌面朝外或仅露侧面。',
        'roundLabel': '中央大字为「東四局」，剩余47张，立直棒计数1，本场计数1。',
        'note': '此处只记录画面位置事实，不给出方位结论；座次与四角字样的对应关系须由复核者从图中自行判定，无法判定时须明确说明。',
    },
    'unknownsPreservedByCandidate': figure.get('unknowns', []),
    'crops': crops,
    'modelCallsThisBuild': 0,
    'notAwaived': 'No verdict is changed by this build; the parent group checkpoint keeps needs-repair until the bounded adjudication call decides the corner reading.',
}
with open(P(OUT_REL), 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(evidence, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({
    'out': OUT_REL,
    'outSha256': sha(open(P(OUT_REL), 'rb').read()),
    'crops': [{'name': c['name'], 'sha256': c['sha256'], 'pixels': c['outputPixels']} for c in crops],
}, ensure_ascii=False, indent=1))
