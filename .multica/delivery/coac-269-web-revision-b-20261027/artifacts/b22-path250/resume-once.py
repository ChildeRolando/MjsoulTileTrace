"""Restore the exact never-started zero-model250 wakeup once, after successful push/checkouts."""
import json
import os
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
ISSUE='01a17471-25e6-7731-a529-3df99acf3d42'
WAKEUP='01a17f8f-d0c4-7d0f-a846-70af665c93e9'
FAILED='01a17f90-dd76-7202-b0b2-d4f39be097e0'
env=dict(os.environ,NO_PROXY='127.0.0.1,localhost,::1,api.multica.ai')
cli=lambda *a:json.loads(subprocess.check_output(['multica',*a,'--output','json'],env=env))
write=lambda n,d:(HERE/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert not (HERE/'resume250.json').exists(), 'only one recovery request'
proof=json.loads((HERE/'checkout-test.json').read_text());assert proof['passed']
assert json.loads((HERE/'push250.json').read_text())['returncode']==0
assert cli('issue','runs',ISSUE,'--active')==[], '250 already has an active writer'
history=cli('issue','runs',ISSUE);failed=next(x for x in history if x['id']==FAILED)
assert failed['status']=='failed' and failed.get('started_at') is None
rule=cli('issue','wakeup','get',ISSUE,WAKEUP)
assert rule['last_task_id']==FAILED and not rule['enabled']
issue=cli('issue','get',ISSUE);assert issue['assignee_id']==rule['agent_id']
head=subprocess.check_output(['git','rev-parse','agent/mika/coac-250']).decode().strip();assert head==proof['commit']
remote=subprocess.check_output(['git','ls-remote','--heads','origin','agent/mika/coac-250']).decode().split()[0];assert remote==head
write('resume-exclusion.json',{'active250':[],'failedRun':failed,'ruleBefore':rule,'head':head,'remoteHead':remote})
note=f'''COAC-269按用户评论01a17f92-9b94-7ecd-a75b-3bfacf6565fe，仅恢复此前从未started的run{FAILED}一次。仅证据包装路径过长修复，agent/mika/coac-250已快进并正常推送到{head}，直接继承v29 f1435b1，未重建v29、未重制或调用模型。当前269的HEAD仍为agent/ticket/coac-269，未切换/覆盖共享工作树。

包装变更：12图片副本改a01.png–a04.png、4上游审回执副本改audit.json；16文件blob/字节完全相同。只更新8个本地展示包装/索引引用。_analysis/path250/manifest.json保留原路径、完整SHA、原Git blob及包装副本映射；原数据根/raw/候选/独审/active未改。完整3157文件在真实同branch同Windows深度检出通过，最长229字符（严格<240）；_analysis和delivery新增245字符文件均被新guard拒绝。

恢复后先确认本run真实HEAD含{head}，在仓库根执行 python _analysis/path250/verify.py；新事先做完整包装路径检查再新增delivery/_analysis。原不可变收据仍保留原数据根路径/SHA；本地副本通过manifest的oldPath/path映射读取，不能把包装别名当新候选/新通过。不要重跑旧stage-owned/assembler/compiler/build/finalize、重建v29或复制全量数据来修路径。

只继续下方原零模型登记指令；不追加制作、识图、审校、集成消费者或任何额度。保留原两个启动失败run，本次恢复不自动重复。完成正常回本票原交接线程，原正文与unknown限制不扩大。

原指令（逐字保留）：
'''+rule['instruction']
body=HERE/'resume250.md';body.write_text(note,encoding='utf-8',newline='\n')
args=['issue','wakeup','update',ISSUE,WAKEUP,'--kind','at','--after','1s','--mode','once','--agent-id',rule['agent_id'],'--instruction-file',str(body)]
if rule.get('parent_comment_id'):args+=['--parent',rule['parent_comment_id']]
updated=cli(*args);write('resume250.json',updated)
print(json.dumps({k:updated.get(k) for k in ['id','enabled','mode','next_fire_at','last_task_id','fire_count']}))
