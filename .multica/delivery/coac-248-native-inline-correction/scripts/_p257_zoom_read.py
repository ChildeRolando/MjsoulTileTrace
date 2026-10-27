# COAC-248 / 2026-10-27 / p257 逐张放大核读（确定性像素工作，0 模型调用）
# 输入：同书同页渲染 production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0257-r1.png
# 做法：连通域取每张牌精确 bbox -> 按牌河方向转正 -> 与同页已核锚点做灰度相关 + 颜色特征
import numpy as np, scipy.ndimage as nd
from PIL import Image

P = r'E:/AgentData/Coach/knowledge/processing/production/sol-high-fallback-inline-20261026/renders/nemata-jp/page-0257-r1.png'
IM = Image.open(P).convert('RGB')

def crop(box, rot=0):
    return IM.crop(box).rotate(rot, expand=True)

def norm(img, size=(48, 64), inset=5):
    w, h = img.size
    img = img.crop((inset, inset, w - inset, h - inset)).convert('L').resize(size, Image.LANCZOS)
    a = np.asarray(img).astype(float); a -= a.mean()
    return a / (a.std() or 1.0)

def corr(a, b):
    return float((a * b).mean())

def color_sig(box, rot=0):
    img = crop(box, rot); w, h = img.size
    a = np.asarray(img.crop((5, 5, w - 5, h - 5))).astype(int)
    dark = a.mean(axis=2) < 130
    px = a[dark]
    if len(px) < 20: return {'n': int(len(px))}
    return {'n': int(len(px)),
            'R': round(float(px[:, 0].mean()), 1), 'G': round(float(px[:, 1].mean()), 1), 'B': round(float(px[:, 2].mean()), 1),
            'greenFrac': round(float(((px[:, 1] - px[:, 0]) > 25).mean()), 2),
            'redFrac': round(float(((px[:, 0] - px[:, 1]) > 25).mean()), 2)}

def digit_half(box, rot=0, frac=0.45):
    img = crop(box, rot); w, h = img.size
    img = img.crop((5, 5, w - 5, int(h * frac))).convert('L').resize((48, 28), Image.LANCZOS)
    a = np.asarray(img).astype(float); a -= a.mean()
    return a / (a.std() or 1.0)

def boxes(x0, x1, y0, y1, thr=215, minw=40, minh=40):
    sub = np.asarray(IM).astype(int)[y0:y1, x0:x1]
    lab, _ = nd.label(sub.mean(axis=2) > thr)
    out = []
    for i, sl in enumerate(nd.find_objects(lab)):
        if sl is None: continue
        h = sl[0].stop - sl[0].start; w = sl[1].stop - sl[1].start
        if w >= minw and h >= minh:
            out.append((x0 + sl[1].start, x0 + sl[1].stop, y0 + sl[0].start, y0 + sl[0].stop))
    return sorted(out, key=lambda b: (b[2], b[0]))

# --- 锚点（本页已验证读法）---
HAND = [1669 + 54 * i for i in range(14)]; HY = (2728, 2794)          # CPU 手牌（正立）
BOT = [1855 + 54 * i for i in range(7)]; BY = [2400, 2473, 2546, 2619]  # 下方牌河（正立）
def hand(i, rot=0): return norm(crop((HAND[i], HY[0], HAND[i + 1], HY[1]), rot))
def bot(i, rot=0):
    c, r = i % 6, i // 6
    return norm(crop((BOT[c], BY[r], BOT[c + 1], BY[r + 1]), rot))

ANCHORS = {
    '1s': hand(6), '3s': hand(7), '8s': hand(8), '9s': hand(9), '4p': hand(5),
    '3m': hand(0), '6m': hand(2), '8m': hand(4), '3z_hand': hand(11),
    '1z': bot(0), '4z': bot(1), '7z': bot(3), '3p': bot(9), '2s': bot(6), '1p': bot(17), '2m': bot(15),
    '6z_green': norm(crop((1762, 2052, 1829, 2101), 90)),   # 左方#1 發
    '9m': norm(crop((1618, 2052, 1686, 2101), 90)),         # 左方#13 九萬
    '5p': norm(crop((1762, 2266, 1829, 2316), 90)),
}
TARGETS = {
    'upper#1':  ((2132, 1955, 2180, 2021), 180),
    'upper#6':  ((1863, 1955, 1916, 2021), 180),
    'upper#17': ((1917, 1810, 1966, 1880), 180),
    'left#16':  ((1616, 2213, 1664, 2280), 0),      # 横置牌，本身正立
    'right#1':  ((2210, 2324, 2279, 2372), -90),
    'right#2':  ((2210, 2269, 2278, 2320), -90),
    'right#7':  ((2280, 2324, 2350, 2372), -90),
    'right#13': ((2352, 2324, 2423, 2372), -90),
    'right#14': ((2352, 2270, 2423, 2320), -90),
}
if __name__ == '__main__':
    for name, (box, rot) in TARGETS.items():
        v = norm(crop(box, rot))
        top = sorted(((corr(v, a), k) for k, a in ANCHORS.items()), reverse=True)[:4]
        print(f'{name:9s}', ' '.join(f'{k}:{s:.3f}' for s, k in top), color_sig(box, rot))
