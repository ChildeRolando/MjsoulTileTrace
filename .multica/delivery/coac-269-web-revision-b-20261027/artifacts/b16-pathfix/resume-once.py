"""Recover the original, never-started wakeup once after checkout repair."""
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ISSUE = '01a17471-0529-7d3d-bd8d-8b54ef38290d'
WAKEUP = '01a17f15-3885-7e86-a02e-793a20dda9dc'
env = dict(os.environ)
env['NO_PROXY'] = '127.0.0.1,localhost,::1,api.multica.ai'
cli = lambda *args: json.loads(subprocess.check_output(['multica',*args,'--output','json'],env=env))
write = lambda name,data: (HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert not (HERE/'resume248.json').exists(), 'recovery already requested; do not duplicate'
assert json.loads((HERE/'checkout-test.json').read_text())['passed']
assert cli('issue','runs',ISSUE,'--active') == [], 'another 248 run exists; stop'
rule = cli('issue','wakeup','get',ISSUE,WAKEUP)
assert rule['last_task_id']=='01a17f16-8947-7e89-971e-fdea09027ce6' and not rule['enabled']
write('wakeup-before.json',rule)
instruction = '''COAC-269按用户评论01a17f1a-05a6-7bd8-8179-837449191d83仅恢复此前从未started的run01a17f16-8947-7e89-971e-fdea09027ce6一次，不是新的制作/审校授权。原worktree准备失败已修复，agent/mika/coac-248已快进到a7f5201e90aa8846051c7f06f22e0bdac482968c并正常推送。4份delivery审回执副本改短名audit.json，path-map.json保留全部29项完整原路径与SHA；字节核对和同branch同Windows路径深度worktree检出通过，最长250字符。原数据根、候选、raw、审回执、准入和制作脚本均未改。当前269自己的HEAD仍在agent/ticket/coac-269；没有切换或覆盖共享工作树。

本次只接下列原零调用登记指令。恢复后先确认本run实际分支含a7f5201，按path-map读取delivery副本；不要重跑build.py/finalize.py或改动原始输入。222额度3/3余0；283六表/Q8/b0168其它票在途不触碰。不要自动重试本恢复或新增消费者。保留原失败run，最终回原222线程说明真实登记结果。

原指令（内容不变）：
'''+rule['instruction']
path = HERE/'resume248.md'
path.write_text(instruction,encoding='utf-8',newline='\n')
updated = cli('issue','wakeup','update',ISSUE,WAKEUP,'--kind','at','--after','1s','--mode','once','--agent-id',rule['agent_id'],'--parent',rule['parent_comment_id'],'--instruction-file',str(path))
write('resume248.json',updated)
print(json.dumps({k:updated.get(k) for k in ['id','enabled','mode','next_fire_at','last_task_id','fire_count']}))
