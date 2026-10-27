from pathlib import Path
import json,hashlib,zipfile,difflib
p=Path('_analysis/coac250-222order');a=json.loads((p/'assembly.json').read_bytes())
(p/'selection-route.patch').write_text(''.join(difflib.unified_diff((p/'builder.before.mjs').read_text(encoding='utf8').splitlines(True),(p/'builder.after.mjs').read_text(encoding='utf8').splitlines(True),fromfile='a/integration/build-accepted-preview.mjs',tofile='b/integration/build-accepted-preview.mjs')),encoding='utf8',newline='\n')
text='''222-5完整章预览，23块（13正文/10图）。打开目录中的knowledge.html。

本次按用户授权的特定顺序输入缺口裁决接收：完整23块作者正文与已独立审校父稿相同，目标图两处2m经真实制作修为1m，并经真实独审确认。b0017–b0021同一有序数组及成品实际图文位置已经验证。

原5b131a9b的false/uncertain及旧审、raw均保留；不是新模型整章审校，也不声称旧模型看过缺失数组。本次集成0模型、0制作。正式active未切。

v27当前预览237展示章/245单元/6443块/5148图。原书覆盖236/256章、268/303单元，仍余20章。PDF217未通过，不包含在本次新增覆盖中。
'''
(p/'preview说明.txt').write_text(text,encoding='utf8',newline='\n')
with zipfile.ZipFile(p/'222-preview.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(p/'preview说明.txt','说明.txt')
 for x in Path(a['destination']).rglob('*'):
  if x.is_file():z.write(x,'222/'+x.relative_to(a['destination']).as_posix())
(p/'README.md').write_text('''COAC-250仅新增222-5，零模型、零制作；PDF217–220复用前一轮真实状态，不重复构建。

使用上游SHA08c9ffe7的order222.mjs只读导出verify222OrderedSupplement。先核模块摘要，重算原v3 source/parent/production/raw/point/presentation链及精确adjudication，原stageWebTextbook共享模块不改。不要直接运行callback.mjs的CLI main，它是上游原字节归档；本流程只import其只读验证导出。

adjudication9bc8b55f状态accepted-specific-order-input-composition、calls=[]；原5b131a9b/raw88d71694/审06658a3d的false和uncertain未改。独立父审完整23块自然原序与当前body相同，目标figure由真实独审确认两处1m；组合恰好覆盖原输入缺失，不伪称新整章模型审。

专用回调、原stage和精确合同及其依赖纳入v27选择/持久重建。新route只接受完整c51650a4，wrong candidate/adjudication拒绝。原v26其他jobs及PDF scopes/version supplements逐对象保留。orderReview仅pin222证据/代码依赖，不pin无关章可变owner状态。

原249私有目录已清理，未派发的真实CLI包装顺序请求从5f3575a原字节恢复，SHAcdc05196匹配；其5行数组与当前源/候选完全相同，closedPrompt与冻结CLI包装一致。原实际请求7项拒绝回归保留，本轮另复验7项有序数组拒绝和2项持久route拒绝，0模型。

实际MCP全章分页23块与10张图字节、b0017–b0021连续顺序、例5两处1m、sourceSegments/强调/完整译文/原unknowns=[]验证。全库245单元/5148图、Arena全文/引用边界、来源去重通过；原244单元逐对象相等。v27回滚v26，正式active原hash保持。

原书覆盖236/256章、268/303单元，余20；展示237章/245单元/6443块/5148图。与原书分母分开，PDF193两句独立navigation补文仍不计原章。

主register只更新222行。closure owner在运行期间另有100新证据更新，本轮重新读取实际owner并只合并222行，100及其余25行的新内容完整保留；100未在本轮合库。原217/218/219/220与215行不变。

一次目标读回校验因父路径相对数据根而误从工作目录解析，补正确root解析后只重跑该校验；全文/图字节和Arena已通过检查没有重复。无模型重试。owner合并检测到并发100更新时保留该更新后完成；覆盖、pointer、selection和owner最终一致。

详见final-verification.json、readback.json、coverage.json及seal.mjs；222-preview.zip为独立可读本章。所有本机绝对路径仅是取证绑定，附件/分支归档是交付物。
''',encoding='utf8',newline='\n')
files={}
for x in p.rglob('*'):
 if x.is_file() and x.name!='archive-shas.json':
  b=x.read_bytes();files[x.relative_to(p).as_posix()]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
(p/'archive-shas.json').write_text(json.dumps({'schema':'coac250222-order-delivery/1','files':files,'modelCalls':0},ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'files':len(files),'bytes':sum(f['bytes'] for f in files.values()),'previewZipBytes':(p/'222-preview.zip').stat().st_size}))
