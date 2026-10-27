import subprocess,json
from pathlib import Path
pointer=json.loads(Path('E:/AgentData/Coach/knowledge/processing/audit/vision-runtime-current.json').read_text(encoding='utf-8'))
ids=['01a1746d-cf4a-7ecc-9fae-3d4c2b55c39f','01a17471-0529-7d3d-bd8d-8b54ef38290d','01a17cae-06e4-7b30-a93f-3a030d1ae63f','01a17471-1595-79d5-bdfa-6feaa65172c0']
prefix='''## 2026-10-27 17:54 UTC 含图调用配置冻结（覆盖历史sol/high识图要求）

用户17:43已授权实际识图改用gpt-6.1-terra / reasoning effort=max，纯文字B162/234及主控运行时不变。唯一新冻结入口：E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac244-vision-terra-max-v1-20261027；runtime-manifest.json SHA256={digest}。逐文件依赖SHA及真实CLI参数构造已核，13项无收费mock参数/STOP回归、41项网页/图片绑定回归通过。旧snapshot/manifest/raw不改，provider/凭据/网关不改，不静默回落。实际图片输入按images.length路由，真实CLI为--model gpt-6.1-terra --config model_reasoning_effort="max" + 有序-i原图/补充图；raw和ledger写入requestExecution，含参数及图片SHA/字节，实际call model/effort来自该记录，不只改标签。

阶段配置与首件交接：E:/AgentData/Coach/knowledge/processing/audit/vision-runtime-current.json。网页制作textbook-production-web.mjs（完整组经textbook-production-web-batches.mjs）、PDF制作textbook-production.mjs、网页独审textbook-audit-web.mjs、PDF/native独审textbook-audit.mjs、字典制作/独审与legacy含图独审均须从此新namespace导入；独审后续验收也用新验证器，旧sol/high父证据依原model/raw验真继承。PDF新run明确--model gpt-6.1-terra --attempts 1，不复用旧run的manifest。

当前157旧制作940cf63b-732f-417f-b4a5-c1469ac6e202已自然完成，准确保留sol/high、10张原图+放大图、原usage；不得改写为terra。276尚未派。下一个已授权真实含图调用选249的157首次独审：canonical79-cn-chapter-157-11，display SHA1807377cc8f71afec95718f5050584a596690efac5658042cf75563f3d69dadc，integration/coac249-incremental-157-11-20261028.json及audit/explicit-targets-coac248-157-11-r1-20261028.json保留。249最多1首审、failed/void计、0retry，计原A157/276合计4call预算，不额外canary/测试识图、不重制157、不复审已pass。须正常取得现有audit guard；同SHA已在途/已终态就不重复。首件记录requested模型/effort、图片payload、thread/完整raw、真实usage、远端回执可见字段；若服务不支持就明确失败并停新派，不能回落sol。网关远端真实权重若不可见就记unknown，不能推测。

A接续276必须使用该新snapshot与原有剩余预算；B162/234继续旧inline-v2纯文字快照，不改其manifest/预算。保留全部源/父/独立审/差异白名单/uncertain/质量及限额STOP和现有锁，禁止强删锁、增加消费者或扩大批次，正式active不切。

'''.format(digest=pointer['manifest']['sha256'])
receipts=[]
for ident in ids:
 read=subprocess.run(['multica','issue','get',ident,'--output','json'],capture_output=True,encoding='utf-8')
 if read.returncode: raise RuntimeError(read.stderr)
 issue=json.loads(read.stdout)
 if issue['description'].startswith('## 2026-10-27 17:54 UTC 含图调用配置冻结'):
  receipts.append({'issueId':ident,'alreadyPresent':True});continue
 file=Path('terra-owner-'+ident+'.md');file.write_text(prefix+issue['description'],encoding='utf-8')
 write=subprocess.run(['multica','issue','update',ident,'--description-file',str(file),'--output','json'],capture_output=True,encoding='utf-8')
 if write.returncode: raise RuntimeError('Read back before retry '+ident+': '+write.stderr)
 receipts.append({'issueId':ident,'updated':True,'response':json.loads(write.stdout) if write.stdout.strip() else None});file.unlink()
Path('terra-owner-sync.json').write_text(json.dumps(receipts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{'issueId':i['issueId'],'updated':i.get('updated'),'alreadyPresent':i.get('alreadyPresent')} for i in receipts]))
