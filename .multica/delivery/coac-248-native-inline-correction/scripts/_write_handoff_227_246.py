import json, hashlib, os
ROOT = r'E:/AgentData/Coach/knowledge/processing'
def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def rel(p):
    return os.path.relpath(p, ROOT).replace(chr(92), '/')

PREVIEW = 'integration/accepted-content-preview-2026-10-27T05-19-25-744Z/accepted-preview-receipt.json'
prev = json.load(open(os.path.join(ROOT, PREVIEW), encoding='utf-8'))

CH = [
    ('chapter04-section007', 'nemata-jp-chapter-227-1',
     'b0007「確和了」原译「确保和牌」把“用和牌锁定当前名次（二確/三確）”读成“保证能和牌”；修订为「选择通过和牌锁定当前名次，在名次期望值上更有利的情况也时常出现」。其余 9 块逐字节不变，本章无图。'),
    ('chapter06-section002', 'nemata-jp-chapter-246-1',
     'b0070「３０秒未満」是严格少于 30 秒，原译「３０秒以内」把边界改宽；修订为「用完后每步必须在不足３０秒的时间内走出」。其余 85 块与 10 图逐字节不变。'),
]
chapters = []
for art, chap, changed in CH:
    cp = f'web-production/v1/candidates/modern-yabejp-ja/{art}.rev1.json'
    d = json.load(open(os.path.join(ROOT, cp), encoding='utf-8'))
    rev = d['provenance']['revision']
    ap = f'audit/web/articles/modern-yabejp-ja/{art}.{sha(os.path.join(ROOT, cp))}.json'
    a = json.load(open(os.path.join(ROOT, ap), encoding='utf-8'))
    pend = [x for x in prev['pendingWeb'] if x['path'].replace(chr(92), '/').endswith(f'{art}.display.json')]
    chapters.append({
        'chapterId': chap,
        'articleId': art,
        'sourcePath': d['source']['sourcePath'],
        'sourceSha256': d['source']['sourceSha256'],
        'parentPath': rev['parentPath'],
        'parentSha256': rev['parentSha256'],
        'parentAuditPath': rev['notesPath'],
        'parentAuditSha256': rev['notesSha256'],
        'candidatePath': cp,
        'candidateSha256': sha(os.path.join(ROOT, cp)),
        'auditPath': ap,
        'auditSha256': sha(os.path.join(ROOT, ap)),
        'auditStatus': a['status'],
        'auditMethod': a['method'],
        'previewChapterId': f"{d['source']['sourceId']}-{art}-chapter",
        'productionCallId': d['provenance']['attempts'][0]['callId'],
        'productionUsage': d['provenance']['attempts'][0]['usage'],
        'auditCallId': a['calls'][0]['callId'],
        'auditUsage': a['calls'][0]['usage'],
        'changed': changed,
        'dedupe': f"当前 accepted-content-preview 仍把 {art}.display.json 列在 pendingWeb（web_audit_not_passed_or_inputs_changed）；候选 SHA 与既有选择清单无重复",
        'pendingWebBefore': bool(pend),
    })

receipt = {
    'schema': 'coac250-incremental-staging-receipt/1',
    'recordedAt': '2026-10-27T06:30:00.000000+00:00',
    'modelCalls': 0,
    'productionCalls': 0,
    'from_': 'COAC-248',
    'to': 'COAC-250',
    'before': {
        'pointer': 'accepted-content-preview-2026-10-27T05-19-25-744Z',
        'chapters': prev['chapters'],
        'units': prev['units'],
        'selectedWeb': len(prev['selectedWeb']),
        'pendingWeb': len(prev['pendingWeb']),
        'corpusId': prev['corpusId'],
    },
    'chapters': chapters,
    'notes': '两章均为 target-text 修订稿：父候选、父审 needs-repair 回执、原始 raw 与旧调用全部保留；只重译被独立审校判为 error 的单个文本块，其余正文与全部图逐字节继承。审计回执为 passed，方法为 independent-target-text-review-plus-unchanged-parent-audit。本回执零模型调用，仅交接既有已验收结果。',
}
out = os.path.join(ROOT, 'integration/coac250-incremental-227-1-246-1-20261027.json')
with open(out, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(receipt, f, ensure_ascii=False, indent=1)
    f.write('\n')
print(out)
print(sha(out))
