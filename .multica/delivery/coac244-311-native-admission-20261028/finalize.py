"""Record the actual sole-writer start and archive only code/derived metadata."""
from pathlib import Path
import json,hashlib,shutil,zipfile,copy,os
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-311-native-admission-20261028'
W=O.parents[2];load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,x):
 (D/n).write_bytes((json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode());shutil.copyfile(D/n,O/n)
active=load(W/'250-active.json');run=next(r for r in active if r['id']=='01a182d7-4c87-779b-8b0d-f6ce9b915a86');assert run['status']=='running' and run['started_at']=='2026-10-28T14:08:42Z'
wake=load(W/'250-state.json');assert wake['last_task_id']==run['id'] and wake['fire_count']==1 and not wake['enabled']
save('routing.json',{'existingIssue':'01a17471-25e6-7731-a529-3df99acf3d42','existingOnce':wake['id'],'revision':wake['revision'],'fireCount':1,'enabledAfterFire':False,
 'previousRun':'01a18295-0172-786c-816b-fd96ed45fce0','previousRunCompletedAt':'2026-10-28T13:08:36Z','previousInterfaceRequestCommit':'314b995f',
 'interfaceCommit':'2fb35faf','newRun':run['id'],'startedAt':run['started_at'],'observedStatus':'running','newConsumers':0,'newModelSubcalls':0,
 'actualGlobalMcpArenaReadbackCompleted':False,'newRunWriterReleaseVerified':False,'pendingReleaseOwner':'Existing250 writes result and releases its own normal writer lock; root does not hold that lock.'})
for n in ['browser.py','browser-verification.json','finalize.py']:
 shutil.copyfile(O/n,D/n)
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']=='79-cn-chapter-311-18');row['nativeStageInterface']['existing250Run']=run['id'];row['nativeStageInterface']['startedAt']=run['started_at'];row['nativeStageInterface']['soleWriterActuallyStarted']=True
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!='79-cn-chapter-311-18':assert x==y
assert reg.read_bytes()==before;tmp=D/'register.tmp';tmp.write_bytes((json.dumps(b,ensure_ascii=False,indent=2)+'\n').encode());os.replace(tmp,reg)
save('routing-register-update.json',{'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),'onlyChangedCanonical':'79-cn-chapter-311-18','global250CoverageWritten':False})
prefix=W/'short-stage-owner-prefix.md';text=prefix.read_text(encoding='utf-8-sig')
note='2026-10-28 14:09 UTC 311真实接口漏接已修复：integration/coac244-311-native-admission-20261028，固定proposal ca5792a8/真实47c48143条件性独审，verifyLimited＋stageLimited＋verifyStage三个可执行入口，157绑定/28拒绝检查，225来源位置/204正文/21源图原字节，8原注＋10强制条件＝18非原文块实际进入隔离HTML/corpus，浏览器DOM核225/18可见相邻/21图加载通过。b0154手牌A近邻注保持仅12可见/构型进张概率图14输入未独立验证，错误附件配对仅对外隐藏并保留原历史。原所有strict false/unknown/raw/作者句和原图不变，144加工槽只删派生显示。2fb35faf已推送；旧250 run01a18295在13:08已完成，不能再称仍运行。复用250原once修复接续，新run01a182d7-4c87-779b-8b0d-f6ce9b915a86于14:08:42真实running，单次触发并停用；全局MCP/Arena读回、持久路由/重建和新写者锁释放仍待250真实结果，本root未写globalcovered/active，新增模型/制作/识图0，不重复257人标支。\n\n'
if not text.startswith(note):prefix.write_bytes((note+text).encode())
pub=[f for f in O.iterdir() if f.is_file() and f.name!='files.sha256.json'];save('files.sha256.json',{'files':[{'path':f.name,'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(pub)]})
z=W/'coac244-311-native-admission-20261028.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as a:
 for f in sorted(O.iterdir()):
  if f.is_file():a.write(f,f.name)
shutil.copyfile(z,D/z.name)
print(json.dumps({'rootRegisterUpdated':True,'soleWriterRun':run['id'],'zipBytes':z.stat().st_size,'zipSha256':sha(z.read_bytes()),'newModelCalls':0}))
