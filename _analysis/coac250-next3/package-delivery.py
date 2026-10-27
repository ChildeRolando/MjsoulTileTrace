from pathlib import Path
import json,zipfile,difflib,hashlib
p=Path('_analysis/coac250-next3');a=json.loads((p/'assembly.json').read_bytes());f=json.loads((p/'final-verification.json').read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()
(p/'selection-and-scoped-route.patch').write_text(''.join(difflib.unified_diff((p/'builder.before.mjs').read_text(encoding='utf8').splitlines(True),(p/'builder.after.mjs').read_text(encoding='utf8').splitlines(True),fromfile='a/integration/build-accepted-preview.mjs',tofile='b/integration/build-accepted-preview.mjs')),encoding='utf8')
(p/'owner-contract.patch').write_text(''.join(difflib.unified_diff((p/'owner.before.md').read_text(encoding='utf8').splitlines(True),(p/'owner.after.md').read_text(encoding='utf8').splitlines(True),fromfile='a/docs/plans/2026-10-24-full-textbook-processing.md',tofile='b/docs/plans/2026-10-24-full-textbook-processing.md')),encoding='utf8')
readme='''本次仅接受159-9、242-3的作者论证忠实呈现范围。原图未知牌码、原条件/语气/例外、仍uncertain的战术依赖原样保留；不证明全部隐含战术事实。

两个原候选未修改。新限定准入状态admitted-exact-limited-unknown-fidelity；旧整章needs-repair及技术limitedOkay=false均未重标。

新增67源块/67展示块、10图；真实stdio MCP全量244单元/5138图及Arena全文、来源去重通过。两章单独MCP分页/图字节与重建入口均通过。原242单元逐对象一致。

v26预览：236展示章/244单元/6420块/5138图；原书覆盖235/256章、267/303单元，21章仍未完成。v25保留回滚，formal active未切。

100未通过：仅b0041漏“未被打出2张以上”限制。新68目标中67faithful，原A/B上下文问题已消除。未授权制作/复审，不合库。

此ZIP的159、242目录是各章独立可读展示。打开各目录knowledge.html。原始审校、限定证据、绑定清单及回读验证另在附送JSON中。费用、上游实际执行总数和远端权重unknown；本次集成0模型/0制作。
'''
(p/'preview说明.txt').write_text(readme,encoding='utf8')
with zipfile.ZipFile(p/'159-242-preview.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(p/'preview说明.txt','说明.txt')
    for s in a['stages']:
        dest=Path(s['dest'])
        for x in dest.rglob('*'):
            if x.is_file():z.write(x,s['key']+'/'+str(x.relative_to(dest)).replace('\\','/'))
(p/'README.md').write_text('''COAC-250 本轮完成159/242精确限定unknown忠实性增量，0模型，0制作，formal active不切。详见final-verification.json、readback.json、coverage.json。

- 新准入由package/contract.json限定，旧needs-repair/limitedOkay=false原样保存。只认证作者论证忠实呈现，非全部战术事实或普通全章passed。
- package/runtime/textbook-audit-web.mjs 保留原普通验证器；追加只读、两SHA白名单的父证据复验函数。该函数仍返回needs-repair，复算原modelChecks=false，来源/制作/原审raw/语义输入链不跳过。admit.mjs另验证新独立限定证据，并检查除靶点外完整父范围faithful。
- stage-limited.mjs为新影子stager；共享原stager未改。仅补一种限定状态，强制重新调用精确准入验证并逐字段比较callback结果。builder路由及v26选择持久化，已实际重建两章。
- 复用c285275原始交接归档。旧249私有路径已清理，按提交原字节恢复到consumer；原path→共享同SHA副本/归档关系保留，未猜造来源。consumer下review/prepare/fidelity-evidence是上游原始记录，不要运行其模型或写入入口。
- 真实stdio MCP全量244单元/5138图、Arena全文/引用、canonical去重及新两章分页/图字节检查通过。旧242单元逐对象相等；v25回滚保留。
- coverage.json为实际原书覆盖235/256章、267/303单元，剩21；100仅登记b0041条件遗漏，未合库、无后续制作/审额度。
- 初次回读脚本误按不存在的image.unitId筛图，改用unit.blocks.figureId后读回全部图；与模型/候选质量无关。发布脚本pending局部变量遗漏导致最后选择元数据写入前退出，finish-publication.mjs在校验所有已写内容后完成元数据，最终pointer/selection/builder/register一致。无模型重试或源审改动。

部署数据根的绝对路径仅是本机取证绑定；本分支归档、JSON和ZIP供审阅。新主书预览是阶段成果，正式active仍为原版。
''',encoding='utf8')
archive={str(x.relative_to(p)).replace('\\','/'):{'sha256':sha(x.read_bytes()),'bytes':x.stat().st_size} for x in p.rglob('*') if x.is_file() and x.name!='archive-shas.json'}
(p/'archive-shas.json').write_text(json.dumps({'schema':'coac250-next3-delivery-archive/1','files':archive,'modelCalls':0},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'files':len(archive),'previewZipBytes':(p/'159-242-preview.zip').stat().st_size,'modelCalls':0}))
