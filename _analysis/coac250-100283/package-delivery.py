from pathlib import Path
import json,hashlib,zipfile,difflib
p=Path('_analysis/coac250-100283');a=json.loads((p/'assembly.json').read_bytes());pre=json.loads((p/'preconsume.json').read_bytes())
(p/'selection-route.patch').write_text(''.join(difflib.unified_diff((p/'builder.before.mjs').read_text(encoding='utf8').splitlines(True),(p/'builder.after.mjs').read_text(encoding='utf8').splitlines(True),fromfile='a/integration/build-accepted-preview.mjs',tofile='b/integration/build-accepted-preview.mjs')),encoding='utf8',newline='\n')
root=Path('E:/AgentData/Coach/knowledge/processing');refs=[]
for mp in [Path(pre['conditionReview']['manifest']['path']),Path(json.loads((p/'283-result.json').read_bytes())['runtime']['path'])]:
 for f in json.loads(mp.read_bytes())['files']:
  path=Path(f['path']);b=path.read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'];dest=p/'dependencies'/(f['sha256']+path.suffix);dest.parent.mkdir(exist_ok=True);dest.write_bytes(b);refs.append({**f,'archivePath':dest.relative_to(p).as_posix()})
(p/'dependency-archive.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
text='''100-1完整章预览，打开100/knowledge.html。

本次仅b0041补回“尚未被打出2张以上”的条件。真实首目标文字审校passed；其余310块及128完整图对象继承既有独立证据，未新审图片。

311源块压缩为106展示块、128图，真实MCP/Arena读全且图字节一致。旧uncertain/DOM false/raw保留；本次集成0模型/0制作，正式active未切。

v28预览238展示章/246单元/6549块/5276图；原书覆盖237/256章、269/303单元，仍余19章。283仅新增两个通过靶点，整章仍有7项阻断，未混入本预览。
'''
(p/'preview说明.txt').write_text(text,encoding='utf8',newline='\n')
with zipfile.ZipFile(p/'100-preview.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(p/'preview说明.txt','说明.txt')
 for x in Path(a['destination']).rglob('*'):
  if x.is_file():z.write(x,'100/'+x.relative_to(a['destination']).as_posix())
(p/'README.md').write_text('''COAC-250本轮处理两个合并唤醒，全程新增模型/制作0，正式active未切。

100：handoff a30db651、候选0415bd3c、源722ef1a4、标准新审e9d5db1e及真实3591af22 raw198d2a4a均核SHA。先核verify-final模块1b18b13f和冻结manifest f21b00fe的53依赖，再import只读verify100Final，原源/生产/父审/像素/新独审门禁真实passed。原共享stage不改，v28精确持久路由只接受本SHA。

仅b0041改变，310其它块和128完整图对象不变；107上下文含39A/B定义，原243pass及其它67faithful显式继承。新文字目标首审不是新图片审，旧0439标准审DOMfalse/uncertain与raw原样保存；composite parent的DOM继承证据单独保留。上游maker1+review1=2/2、剩0，request-only解析提前执行事件如实计1，v1/v2/v3历史未抹除，未重复模型。

真实MCP全章311源块→106展示块分页、128图字节、精确条件及无旧扩大条件短语核验通过。全库246单元/5276图、Arena全文/引用、source canonical去重通过；原245单元逐对象一致。持久route实际再编译相同corpus，v27回滚保留。

283：两个真实checkpoint passed；32冻结文件、原PNG13/12实际-i顺序/SHA/bytes、发布prompt/schema和CLI closedPrompt一致。原通用gate仍拒绝needs-repair，原verifyGroupRevisionAudit已重算两checkpoint/父链/合并结果。1193非靶块及524图不变，六表原只读verifier passed，Q8/0168/batch010原证据继承。

原19条有效账为10解决/7阻断/2source-note。旧16deferred为9解决/7open；新aggregate14条历史deferred中7已有补证解除、7仍open，不能当14新缺口。原aggregate81313304、raw、severity、deferred未改。两现有收口owner清单实际只更新283行，主register追加新分支精确证据，不将其取代别的分支或改整章passed。无283 stage/preview。

159/242：999cd1d4一致性证明、18绑定、9+10作者命题、4+2战术uncertain及7组回归均核对；现有59fdbafb sidecar已指向该证明，去重而未写第二份，不重建已接受章。原technical false/needs-repair口径保持。

PDF218/219 needs-repair、220 passed、217限定图与强制非原文注、215等保持。只有100增加覆盖：237/256原章、269/303原单元，剩19；展示238章/246单元/6549块/5276图。主书未完成。

详见final-verification.json、283-effective-issues.json、283-verification.json、readback.json、coverage.json与seal.mjs。本机绝对路径仅是取证绑定；附件/分支归档才是交付物。
''',encoding='utf8',newline='\n')
files={}
for x in p.rglob('*'):
 if x.is_file() and x.name!='archive-shas.json':
  b=x.read_bytes();files[x.relative_to(p).as_posix()]={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
(p/'archive-shas.json').write_text(json.dumps({'schema':'coac250100283-delivery/1','files':files,'modelCalls':0},ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'files':len(files),'bytes':sum(v['bytes'] for v in files.values()),'dependencyBindings':len(refs),'previewZipBytes':(p/'100-preview.zip').stat().st_size}))
