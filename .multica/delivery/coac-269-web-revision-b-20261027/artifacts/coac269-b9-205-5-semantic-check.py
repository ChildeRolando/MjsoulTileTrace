#!/usr/bin/env python
"""COAC-269 line B batch-9: semantic check of the produced 205-5 candidate.

The frozen entry passed and the mechanical self-check passed, but the model's re-transcription of
the target figure b0004 does not match the bound source image. This script re-reads the disputed
tiles against the source screenshot and records, per tile, what the parent said, what the model
said, and what this line reads from the image. It also copies the crop images used into the ticket
bundle so the evidence travels with the commit.

No model call. Nothing is edited after production: the candidate and the raw call stay exactly as
produced (void, budget spent, no retry).
"""
import datetime
import hashlib
import io
import json
import os
import shutil

from PIL import Image

R = 'E:/AgentData/Coach/knowledge/processing/'
ART = os.path.dirname(os.path.abspath(__file__))
EVID = os.path.join(ART, 'evidence-b9')
os.makedirs(EVID, exist_ok=True)
sha_file = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()

IMG_REL = 'web-sources/v1/79-bilibili-cn/assets/104f115501ee58996276f1c53043a372d127a8a08fc2d9b429d8cee0c3be1d67.png'
IMG = R + IMG_REL
CAND_REL = 'web-production/v1/candidates/79-bilibili-cn/cv1770234.coac269rev1.json'
PAR_REL = 'web-production/v1/candidates/79-bilibili-cn/cv1770234.display.json'
PROD_REL = 'web-production/v1/coac269-20261027/receipts/production-b9-489e4b6d636f65a0.json'
SELF_REL = 'web-production/v1/coac269-20261027/receipts/selfcheck-b9-1e0e69b781973aae.json'

cand = json.load(io.open(R + CAND_REL, encoding='utf-8'))
par = json.load(io.open(R + PAR_REL, encoding='utf-8'))
cf = [f for f in cand['figures'] if f['figureId'].endswith('b0004:figure')][0]
pf = [f for f in par['figures'] if f['figureId'].endswith('b0004:figure')][0]

im = Image.open(IMG)


def crop(name, box, rotate=0, scale=8):
    c = im.crop(box)
    if rotate:
        c = c.rotate(rotate, expand=True)
    c = c.resize((c.width * scale, c.height * scale), Image.LANCZOS)
    p = os.path.join(EVID, name)
    c.save(p)
    return {'path': 'evidence-b9/' + name, 'sha256': sha_file(p), 'sourceImage': IMG_REL,
            'cropBox': list(box), 'rotationApplied': rotate}


rows = [
    {
        'area': '下侧手牌', 'position': '第 2 张',
        'parent': '1m', 'modelCandidate': '2m', 'sourceRead': '1m',
        'verdict': 'producer read: model contradicts the source here (diagnostic only)',
        'evidence': [crop('hand-first4-9x.png', (75, 443, 220, 500), 0, 9)],
        'reading': 'the first two tiles are both 一萬 (a single horizontal stroke over 萬); the model wrote 二萬 for the second.',
    },
    {
        'area': '下侧手牌', 'position': '第 13 张',
        'parent': '4s', 'modelCandidate': '6s', 'sourceRead': '4s',
        'verdict': 'producer read: model contradicts the source here (diagnostic only)',
        'evidence': [crop('hand-tail-9x.png', (300, 443, 420, 500), 0, 9)],
        'reading': 'tile 13 is 2 columns x 2 rows of bamboo = 4s; the model wrote 6s (3 columns x 2 rows).',
    },
    {
        'area': '下侧摸入牌', 'position': '右侧间隔后摸入',
        'parent': '6s', 'modelCandidate': '8s', 'sourceRead': '6s',
        'verdict': 'producer read: model contradicts the source here (diagnostic only)',
        'evidence': [crop('hand-tail-9x.png', (300, 443, 420, 500), 0, 9)],
        'reading': 'the separated drawn tile is 3 columns x 2 rows = 6s, not the 8s the model wrote.',
    },
    {
        'area': '左下副露', 'position': '整组',
        'parent': '2m、1m、3m，组成 123m 的吃', 'modelCandidate': '1m 1m 1m，为一万的碰',
        'sourceRead': '2m、1m、3m，组成 123m 的吃',
        'verdict': 'producer read: model contradicts the source here (diagnostic only)',
        'evidence': [crop('left-meld-10x.png', (20, 320, 90, 420), 0, 10)],
        'reading': 'the upright tile is 二萬 and the two clockwise-rotated tiles read 一萬 and 三萬; it is a 吃, not a 碰.',
    },
    {
        'area': '下侧弃牌区', 'position': '第 2 行第 1 张',
        'parent': '8s', 'modelCandidate': '4s', 'sourceRead': '8s',
        'verdict': 'producer read: model contradicts the source here (diagnostic only)',
        'evidence': [crop('bottom-discards-7x.png', (150, 290, 330, 375), 0, 7)],
        'reading': 'the tile shows the 8s cross pattern (four corner sticks plus the X connectors), the same glyph as the 8s dora in b0013; the model wrote 4s.',
    },
    {
        'area': '上侧弃牌区', 'position': '外侧一行第 3 张',
        'parent': '9m', 'modelCandidate': '6m', 'sourceRead': '9m (九萬)',
        'verdict': 'producer read: model likely contradicts the source here (diagnostic, lower confidence)',
        'evidence': [crop('top-discards-7x.png', (150, 60, 320, 160), 0, 7),
                     crop('topA3-rot.png', (256, 74, 284, 120), 180, 16)],
        'reading': 'rotated upright, the character above 萬 is 九 (a hook), not 六 (亠 + 八 as in the hand 六萬).',
    },
]

out = {
    'schema': 'coac269-batch9-semantic-failure/1',
    'ticket': 'COAC-269', 'line': 'B', 'batch': 'b9',
    'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'modelCalls': 1, 'productionCalls': 1, 'retries': 0,
    'chapterId': '79-cn-chapter-205-5', 'articleId': 'cv1770234',
    'targetFigure': '79-bilibili-cn:cv1770234:b0004:figure',
    'source': {'path': IMG_REL, 'sha256': sha_file(IMG)},
    'parent': {'path': PAR_REL, 'sha256': sha_file(R + PAR_REL), 'transcription': pf['transcription']},
    'candidate': {'path': CAND_REL, 'sha256': sha_file(R + CAND_REL), 'transcription': cf['transcription']},
    'productionReceipt': PROD_REL, 'selfCheckReceipt': SELF_REL,
    'mechanical': {'verifyWebRevisionContent': True, 'verifyWebProductionCall': True,
                   'webDeterministicChecks': True,
                   'note': 'all three frozen gates pass: they check bindings and scope, not whether the model read the image correctly'},
    'evidenceClass': 'producer-side diagnostic, NOT a semantic verdict (issue description correction 2026-10-27T15:52Z)',
    'diffs': rows,
    'conclusion': ('PRODUCER ACCUSATION, NOT A CONFIRMED SEMANTIC ERROR. This line reads the single budgeted production '
                   'output as contradicting the bound source in at least five places (hand tiles 2 and 13, the drawn '
                   'tile, the bottom-left meld type, and bottom discard row 2), with the parent reading those places '
                   'differently. Under the 2026-10-27T15:52Z rule a producer-side visual read cannot declare a semantic '
                   'failure: the candidate has no independent first audit on its own SHA, so it stays pending, not '
                   'failed. What is decided here is only the dispatch consequence: the candidate is not presented as a '
                   'valid repair, is not handed to 249/250 on mechanical ok alone, keeps its raw output untouched, and '
                   'the chapter\'s 1 production call is spent under the no-retry rule.'),
    'decision': 'void-no-retry-no-handoff, semantic status pending independent adjudication',
    'budget': {'productionCallsAllowedPerChapter': 1, 'productionCallsUsed': 1, 'retriesAllowed': 0,
               'firstAuditCallsAllowedPerChapter': 1, 'firstAuditSpent': False,
               'note': 'not handed to 249, so the first-audit budget was not spent; an independent first audit on the '
                       'same candidate SHA is the open item'},
    'preserved': {'rawCall': 'web-production/v1/raw-calls/358f4e70-5660-4e0c-8918-6ad8a4287011.json',
                  'rawArtifactSha256': '4cf399c450ced144a4c36627f53a677ef83145872e34449fab4e145852a85fa5',
                  'candidateKeptAsProduced': True, 'handEdits': 0},
}
p = os.path.join(ART, 'b9-205-5-semantic-failure.json')
with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'artifact': os.path.basename(p), 'sha256': sha_file(p),
                  'diffs': len(rows), 'evidenceFiles': sorted(os.listdir(EVID))}, ensure_ascii=False, indent=2))
