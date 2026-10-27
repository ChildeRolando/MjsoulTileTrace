"""Bundle only this finite batch; do not modify raw, global gates, or integration selection."""
import json
import hashlib
import shutil
from pathlib import Path
from datetime import datetime, timezone

local=Path(__file__).resolve().parent.parent
root=Path('E:/AgentData/Coach/knowledge/processing')
def load(p): return json.loads(p.read_text(encoding='utf-8'))
def write(p,v): p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

out=[]
for key in ['222-5','246-3']:
    e=load(local/f'receipt-web{key}.rev1-awaiting-review.json')
    assert e['checks']['passed'] and e['preservation']['allNonTargetBytesPreserved']
    run=root/f'web-production/v1/runs/coac248-web-{key}-r1-20261027'
    dest=local/f'evidence-web{key}-20261027'
    dest.mkdir(exist_ok=False)
    for name in ['preflight.json','entry-preflight.json','dispatch-started.json','dispatch-finished.json','slot-released.json','production.stdout.json','production.stderr.txt','production-evidence.json']:
        shutil.copyfile(run/name,dest/name)
    call=e['productionAttempt']
    raw=root/'web-production/v1'/call['rawArtifactPath']
    assert sha(raw)==call['rawArtifactSha256']
    shutil.copyfile(raw,dest/(call['callId']+'.raw.json'))
    recovery=call.get('transportRecovery')
    if recovery:
        p=root/recovery['originalLedgerRecord']['path']
        assert sha(p)==recovery['originalLedgerRecord']['sha256']
        shutil.copyfile(p,dest/p.name)
    handoff=root/f'integration/coac249-incremental-{key}-20261027.json'
    h=load(handoff)
    h['transportRecovery']=recovery
    h['verifiedExistingRuntimeManifest']=load(local/'runtime-manifest-222-246-20261027.json')
    h['originalLedgerFailedCount']=e['modelCalls']['failed']
    write(handoff,h);shutil.copyfile(handoff,local/handoff.name)
    out.append({'chapterId':e['chapterId'],'articleId':e['articleId'],'candidateSha256':e['candidateSha256'],
                'handoff':str(handoff.relative_to(root)).replace('\\','/'),'handoffSha256':sha(handoff),
                'targetChanges':e['changes'],'modelCalls':e['modelCalls']})
body='COAC-248 A线本批两章已真实产出，交249各一次首次独立全章审校；不等待整票。先读取本票当前指令和评论，保留已有在途工作。\n\n'
for x in out:
    body+=f"- {x['chapterId']} / {x['articleId']}，唯一display文件SHA {x['candidateSha256']}；交接 {x['handoff']}（SHA {x['handoffSha256']}）。\n"
body+='\n以上路径相对于 E:/AgentData/Coach/knowledge/processing。只审各交接的display候选；r1.json是同次制作的未展示中间稿，不另审或合库。\n\n'
body+='222-5仅b0018；246-3仅b0025/b0037/b0047。正文/其它完整figure对象/顺序按JSON序列化逐字节不变，source/父稿/父审/raw/视觉入口全绑定。目标figure的caption/sourceNotes变动已全部列from/to于交接evidence，必须同牌码一道独立核对，父审和本线源图核读只定位，不是独审答案。不得按章尾号跨书匹配。\n\n'
body+='派发前最新preview/register/真实passed按canonical ID联合排除、同candidate/source/runtime任何终态去重、STOP、候选/父审/源/raw与全部视觉绑定核验，使用现有匹配冻结web-b8-transport-diag-20261027（manifest 56287cda5a49ca62a6f688e3c19dbccee2e3e5ddce5cfd9cff3717f78f56de35，9依赖已复算无diff）。不热改旧snapshot，不降低门禁。每候选最多1次首次独审，failed/void计额度，失败即停无自动retry，前台完成取得收据后结束。通过交250，退回反馈248。\n\n'
body+='制作总共2次：222-5原始ledger因确切HTTPS回退诊断判failed，实际turn.completed+完整schema+有限usage；沿既有恢复契约0新增模型调用导出候选，原failed/raw字节保留，完整链在provenance.transportRecovery。不能把恢复写成没有历史失败。246-3按实际交接记录。\n\n'
body+='不碰B线157-11/205-5，不重复090-6/081-8；p217/p257继续分流。本批无自审、无passed宣告、无新框架/工单/Work任务；不创建A线下一制作批。\n'
(local/'wakeup-249-222-246-20261027.md').write_text(body,encoding='utf-8')
write(local/'target-diff-222-246-20261027.json',{'schema':'coac248-finite-two-chapter-target-diff/1',
      'recordedAt':datetime.now(timezone.utc).isoformat(),'chapters':out,'semanticAcceptance':None})
print(json.dumps([{'chapterId':x['chapterId'],'candidateSha256':x['candidateSha256']} for x in out]))
