"""Record actual250 start after the executable handoff, without touching global coverage."""
from pathlib import Path
import json,hashlib,shutil,zipfile,copy,os
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-p257-human20-admission-20261029';W=O.parents[2]
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,x):
 (D/n).write_bytes((json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode());shutil.copyfile(D/n,O/n)
run=next(x for x in load(W/'250-active.json') if x['id']=='01a18367-3300-7a96-872a-a43f120ac551');assert run['status']=='running' and run['started_at']=='2026-10-28T16:45:51Z'
wake=load(W/'250-route-state.json');assert wake['last_task_id']==run['id'] and wake['fire_count']==1 and not wake['enabled']
save('routing.json',{'existingIssue':'01a17471-25e6-7731-a529-3df99acf3d42','existingOnce':wake['id'],'onceRevision':wake['revision'],'fireCount':1,'enabledAfterFire':False,
 'oldIntakeRunCompleted':'01a182d8-b90e-7534-a5cb-eb3302ac982a','preflightRunCompletedBeforeDispatch':'01a18356-cdda-763f-8cf3-ebfbdcaa9c92','interfaceCommit':'3bbd5773',
 'actualContinuationRun':run['id'],'startedAt':run['started_at'],'observedStatus':'running','executableInterfaceAndStageVerified':True,'newConsumers':0,'newModelSubcalls':0,
 'rootHeldWriterSlot':False,'actualGlobalMcpArenaReadbackCompleted':False,'finalGlobalCoverageChangedByRoot':False,'formalActiveChangedByRoot':False})
shutil.copyfile(O/'finalize.py',D/'finalize.py')
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']=='nemata-jp-chapter-250-1');row['human20ExactStageInterface']['existing250Run']=run['id'];row['human20ExactStageInterface']['soleWriterActuallyStartedAt']=run['started_at']
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!='nemata-jp-chapter-250-1':assert x==y
assert reg.read_bytes()==before;tmp=D/'register.tmp';tmp.write_bytes((json.dumps(b,ensure_ascii=False,indent=2)+'\n').encode());os.replace(tmp,reg)
save('routing-register-update.json',{'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),'onlyChangedCanonical':'nemata-jp-chapter-250-1','global250CoverageWritten':False})
prefix=W/'short-stage-owner-prefix.md';text=prefix.read_text(encoding='utf-8-sig');note='2026-10-29 最后PDF257接口包3bbd5773已实交250：stage涵盖945源位置/344显示块/303图，35拒绝检查与真实浏览器验证通过，六近邻非原文限制及b3/b4原始图链接已实际安装。复用原257 once只触发一次并停用，原预检run01a18356-cdda已结束后，新run01a18367-3300-7a96-872a-a43f120ac551于2026-10-28T16:45:51Z实际running。根不占全局写者锁，当前交付是可执行接口＋完整stage且已启动接续；基线v42 255/256、302/303的最后全章MCP/Arena与持久重建/覆盖更新仍由该250完成，不提前称全书完成，不切active。新增模型/制作/识图0。\n\n'
if not text.startswith(note):prefix.write_bytes((note+text).encode())
pub=[f for f in O.iterdir() if f.is_file() and f.name!='files.sha256.json'];save('files.sha256.json',{'files':[{'path':f.name,'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(pub)]})
z=W/'coac244-p257-human20-admission-20261029.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as a:
 for f in sorted(O.iterdir()):
  if f.is_file():a.write(f,f.name)
shutil.copyfile(z,D/z.name)
print(json.dumps({'actual250Run':run['id'],'handoffUnchangedSha256':sha((D/'handoff.json').read_bytes()),'zipBytes':z.stat().st_size,'zipSha256':sha(z.read_bytes()),'newModelCalls':0}))
