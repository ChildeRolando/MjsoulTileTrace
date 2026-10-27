import json, hashlib, os
ROOT = 'C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-248-31373b8161df/worktree'
P = os.path.join(ROOT, '.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json')
def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()
d = json.load(open(P, encoding='utf-8'))
CAND = 'web-production/v1/candidates/79-bilibili-cn/cv1721475.r1.json'
AUD = 'audit/web/articles/79-bilibili-cn/cv1721475.d1fc1ea8f072cc73c3c1a1649f3a7608f6fd55ecb38be8ff19a34340d5c2a3dd.json'
PR = 'E:/AgentData/Coach/knowledge/processing/'
for o in d['objects']:
    oid = o['objectId']
    if oid == 'web-chapter:79-cn-chapter-081-8':
        o['candidatePath'] = PR + CAND
        o['candidateSha256'] = sha(PR + CAND)
        o['auditPath'] = PR + AUD
        o['auditSha256'] = sha(PR + AUD)
        o['auditStatus'] = 'passed'
        o['issueCount'] = 0
        o['reviewErrors'] = []
        o['currentDisposition'] = 'resolved-passed-targeted-figure-revision-awaiting-250'
        o['resolution'] = {
            'parentPath': 'web-production/v1/candidates/79-bilibili-cn/cv1721475.display.json',
            'parentSha256': '50b62ce5b808d89f5f6231e8a88ed7ce546731211bb73684642d54d700d11853',
            'changed': '四个 figure 的牌码按原图重读：b0004 末张 9s→7s；b0006 变化A/B/例2 共四处 9s→7s；b0008 两行倒数第二张 9s→7s；b0018 切6m 末张 9s→7s、切2s 首张饼 4p→5p。正文与另外 4 图逐字节不变。',
            'modelCalls': {'production': 1, 'audit': 1},
            'handoff': 'integration/coac250-incremental-081-8-20261027.json',
            'sourceVerification': '改前对四个 figure 绑定的原图逐张放大复读：7s 为一根红竹＋两组三根绿竹；8s 为双 M 形；b0018 切2s 行首张饼为五圆含中心红点＝5p。三次独立读法（父审、本线像素复读、修订模型）一致。'
        }
    elif oid == 'web-chapter:nemata-jp-chapter-215-4':
        o['auditStatus'] = 'passed'
        o['currentDisposition'] = 'resolved-passed-by-249-web-target-text-chain-8f02f593-and-merged-into-250-preview'
        o['ownerUpdate'] = 'owner 2026-10-27T10:59:46Z：215-4 rev2 已由 249 用 web-target-text-chain 独审 passed 8f02f593，250 最新 211 章预览已真实合入；不再列入口卡点，不再制作审校。'
    elif oid == 'web-chapter:nemata-jp-chapter-183-1':
        o['currentDisposition'] = 'decision-hold-b-line-parent-audit-uncertain-rejected-by-249'
        o['ownerUpdate'] = 'owner 2026-10-27T10:59:46Z：183-1 父审 uncertain、越界改写已被 249 拒绝，B 已保留原稿待裁决；不是可直接修错项，A 线不处理。'
    elif oid == '79-cn:page:217':
        o['currentDisposition'] = 'rev5 待单张裁决：已按 owner 指示交 249 独立限定核读该牌；不得再以整页审校或多数票/单一像素相关率强改；无确定证据则保持 unknown'
        o['nextAction'] = '等 249/owner 对该牌的限定结论；有确定读法才落 rev6 + 1 次页审校，否则留 unknown'
        o['handoff249'] = 'integration/coac249-p217-single-tile-read-20261027.json'
    elif oid == 'nemata-jp:page:257':
        o['currentDisposition'] = 'needs-repair-unknown（源图分辨率不足的审校 uncertain）；本轮不派审校、不阻塞其它章节'
        o['nextAction'] = '若要推进，只能按 248 已记录的逐张放大核读（0 模型调用）；本轮优先做可修的源文错误，未追加调用'
d['refreshedAt'] = '2026-10-27T11:58:00.000Z'
d['round20261027T1155'] = {
    'round': '2026-10-27T11:15-11:58Z',
    'trigger': 'owner 2026-10-27T10:59:46Z（更新过期阻塞信息，优先可修源文错误）',
    'resolved': ['web-chapter:79-cn-chapter-081-8'],
    'modelCalls': {'production': 1, 'audit': 1, 'void': 0, 'failedNoCall': 1},
    'failedNoCallNote': '首次派发时冻结 runner 副本缺 textbook-production-web-visual.py，在读取该文件阶段即退出（ENOENT，node 未发起模型调用、无 raw 回执）；补齐完整 frozen-runner 后重跑，只有 1 次有效制作。',
    'notes': ['215-4 已按 owner 更新移出卡点；211 已并入 250 预览；183-1 属 B 线 decision-hold；p217 交 249 单张限定核读；p257 保持 unknown 且不阻塞。']
}
open(P, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print('updated', P)
