from pathlib import Path
import subprocess,json
issue='01a1746d-cf4a-7ecc-9fae-3d4c2b55c39f'
get=subprocess.run(['multica','issue','get',issue,'--output','json'],capture_output=True,encoding='utf-8');assert get.returncode==0,get.stderr
j=json.loads(get.stdout)
prefix='''## 2026-10-28 零模型26章闭合路线（最新）

当前基线v21为230/256原章、262/303原单元。本阶段模型0，A276既有run/余2调用不重复。现有continuation register已按26个完整canonical增加closurePlan；细项见integration/coac244-remaining26-closure-register-20261028.json，仓库owner short-stage-owner-prefix.md；源/父/独审/靶点及待执行包见本分支.multica/delivery/coac244-closure26-zero-20261028。不修改covered计数、旧raw或正式active。

新证据：79-cn-193的两处漏句在PDF193/b6及真实passed父稿046188e3中已找回；215章仅拥有p217/b1,b3，牌图b8属217章。283六表94牌块tableContext逐格已存在。234旧900s超时本地raw无最终输出，远端请求/执行次数和usage仍unknown；不自动重试。

下一建议仅文字nemata-jp-chapter-183-1/b0018、nemata-jp-chapter-236-1/b0003，各最多1制作+1独立目标首审，总4，失败void计0retry，待根下一批授权。旧入口预检虽通过，后续父链曾因error-only拒绝uncertain；新建exact-SHA/target绑定的纯文字兼容快照audit/runtimes/coac244-text-uncertain-183236-v1-20261028，manifest fdac719dc8237db59f7a2abd6cd2bdac44f895a03519abe67cf408242e392548，完整原父链及18门禁回归通过；原uncertain等级不改，新独审uncertain仍阻断。新快照禁止图片，含图继续既有terra/max。图点222与p217已备中立定位的真实图/上下文/最近邻包，未来各最多1单点裁决、总另2，不能全章同SHA重审；234如另批追加为1制作+原未用首审1，未来另2，上游次数不可假定为1。三提案全批准最多8个未来本地call，当前自动授权/新增0，不能合并超预算。

'''
if not j['description'].startswith('## 2026-10-28 零模型26章闭合路线'):
 p=Path('closure26-description.md');p.write_bytes((prefix+j['description']).encode())
 w=subprocess.run(['multica','issue','update',issue,'--description-file',str(p),'--output','json'],capture_output=True,encoding='utf-8')
 assert w.returncode==0,'Read-back before retry: '+w.stderr
 p.unlink();result=json.loads(w.stdout);print(json.dumps({'id':result.get('id'),'status':result.get('status'),'revision':result.get('revision')}))
else:print('Already synchronized')
