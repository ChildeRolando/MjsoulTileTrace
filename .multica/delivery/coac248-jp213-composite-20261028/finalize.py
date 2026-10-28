import pathlib,json,hashlib,shutil,zipfile,datetime
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');H=pathlib.Path(__file__).resolve().parent;D=R/'integration/coac248-jp213-composite-20261028';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_bytes())
def save(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
v=load(D/'verification.json');m=load(D/'manifest.json');assert v['exactLimitedCompositionVerified'] and v['allEightLimitsInstalledInIsolatedStage'];assert v['originalStrictVerification']['limitedEvidenceVerified'] is False
h={'schema':'coac248-jp213-zero-call-composite-handoff/1','authorizationCommentId':'01a18226-92e6-7a4a-81e0-3c365559b152','canonical':v['canonical'],'candidate':v['candidate'],'source':v['source'],'parent':v['parent'],'parentAudit':v['parentAudit'],'independentReceipt':v['independentReceipt'],'raw':v['raw'],'package':str(D).replace('\\','/'),'loader':{'path':str(D/'admit.mjs').replace('\\','/'),'sha256':sha(D/'admit.mjs'),'function':'verifyLimited(root,candidatePath)'},'stageEntry':{'path':str(D/'stage.mjs').replace('\\','/'),'sha256':sha(D/'stage.mjs'),'function':'stageLimited(options)'},'stageVerifier':{'path':str(D/'verify-stage.mjs').replace('\\','/'),'sha256':sha(D/'verify-stage.mjs'),'function':'verifyStaged(root,stagePath)'},'stage':str(D/'stage').replace('\\','/'),'stageFiles':{'path':str(D/'stage-files.json').replace('\\','/'),'sha256':sha(D/'stage-files.json')},'manifest':{'path':str(D/'manifest.json').replace('\\','/'),'sha256':sha(D/'manifest.json')},'verification':{'path':str(D/'verification.json').replace('\\','/'),'sha256':sha(D/'verification.json')},'exactLimitedCompositionVerified':True,'isolatedNotesInstalled':8,'unknownsRetained':4,'negativeChecks':len(v['negativeChecks']),'issueObjectsByteIdentical':False,'issueMapping':'Three old/new issue pairs each pinned separately; current two targets independently faithful, retained unknowns permitted only with eight limits. No generic ignoring of issues.','originalStrictFalseAndSeveritiesRetained':True,'onlyExisting250Writer':True,'ordinaryWholeArticlePassed':False,'globalAdmissionGranted':False,'actualGlobalMcpArenaReadbackRequired':True,'newModelCalls':0,'humanAnnotationDataUsed':False}
save(D/'handoff.json',h);save(H/'handoff.json',h)
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';before=owner.read_bytes();o=json.loads(before);row=next(r for r in o['rows'] if r['chapterId']==v['canonical']);row['exact213CompositeResult']=h;row['nextActionBefore213Composite']=row.get('nextAction');row['nextAction']='用户01a18226授权的213精确组合及隔离展示已完成：新旧issues不是逐字相同，三组新旧对象各自SHA固定并逐靶点匹配真实faithful/unknown影响证据；原false/severity保留。八条非原文限制在b0031+b0032内联图段落后、b0033前实际显示，四unknown保留；35项负例与反向作者内容一致性、HTML/语料核验通过。交现有250核verifyLimited/verifyStaged、固定持久路由及真实MCP/Arena读回后再判断全局准入。原2/2余0、无新增模型，不用人标数据，不切正式active。';assert owner.read_bytes()==before;save(owner,o,1);save(H/'owner-row.json',row)
invPath=H.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';inv=load(invPath)
for row in inv['objects']:
 if row.get('chapterId')==v['canonical']:
  assert row['candidateSha256']==v['candidate']['sha256'];row['currentDisposition']='exact-composite-isolated-display-ready-awaiting250-readback';row['exact213Composite']=h
inv['exact213Composite']=h;save(invPath,inv,1)
paths=set()
def add(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve();assert p.is_file(),str(p);paths.add(p)
for f in m['files']:add(f['path'])
for f in ['verification.json','handoff.json','manifest.json','scope-plan.json','stage-files.json']:add(D/f)
for p in (D/'stage').rglob('*'):
 if p.is_file():add(p)
seen=set()
def candidate(path):
 p=pathlib.Path(path);p=(p if p.is_absolute() else R/p).resolve()
 if p in seen:return
 seen.add(p);add(p);c=load(p);pr=c['provenance']
 for a in pr['attempts']:add(R/pr['artifactRoot']/a['rawArtifactPath'])
 for k in ['derivedFromCandidate','dictionary','verifiedAssetDictionary','reuseMap']:
  b=pr.get(k)
  if isinstance(b,dict) and b.get('path'):add(b['path'])
 for f in c['figures']:
  if f.get('presentationAsset'):add(f['presentationAsset']['path'])
 if pr.get('revision'):
  r=pr['revision'];candidate(r['parentPath']);add(r['notesPath']);n=load(R/r['notesPath'])
  for c in n.get('calls',[]):add('audit/calls/'+c['callId']+'.json')
  if n.get('auditor'):add(n['auditor']['path'])
candidate(v['candidate']['path']);s=load(pathlib.Path(v['source']['path']))
for k in ['html','main']:add('web-sources/v1/'+s[k]['path'])
for a in s['assets']:add('web-sources/v1/'+a['path'])
dest=H/'evidence';dest.mkdir(exist_ok=True);mapping=[]
for i,p in enumerate(sorted(paths,key=str)):
 name='evidence/'+str(i).zfill(3)+p.suffix;shutil.copyfile(p,H/name);assert sha(H/name)==sha(p);mapping.append({'archivePath':name,'originalPath':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
save(H/'path-map.json',mapping)
with zipfile.ZipFile(H/'stage-snapshot.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in (D/'stage').rglob('*'):
  if p.is_file():z.write(p,p.relative_to(D/'stage').as_posix())
instruction=f'''COAC-248→既有250唯一写者。用户01a18226-92e6-7a4a-81e0-3c365559b152授权的日文213零模型合法组合已完成，接此现有213范围，不创建新工单/并行消费者或模型调用，不用人标数据。先读当前票/相关评论并以精确候选和交接SHA核已消费/在途，已消费不重复。
根E:/AgentData/Coach/knowledge/processing。交接integration/coac248-jp213-composite-20261028/handoff.json SHA{sha(D/'handoff.json')}。候选a667937d4e119a1b22659fc60987f07d3eea9d246c8b2b6ddabcdacb4fe5dd47，原raw/父审/候选未动。
重要：新issues不是父审字节相同，而是独审明确的历史重述。admit.mjs逐一固定三对旧新issue对象各自SHA及真实textRepair/figureRepair faithful与四unknown影响，不泛化忽略error；任何新增/改变issue或新语义error均拒绝。原limitedEvidenceVerified=false/no_limited_allowance及全部severity照留。
按handoff精确hash读取manifest，调用verifyLimited(root,candidatePath)及verify-stage.mjs的verifyStaged(root,stagePath)。已有隔离stage含八条可见“审校限制（非原文）”，位置为保持原样的b0031+b0032内联图段落之后、b0033之前；53源位置/24完整图及四unknown保持，HTML和编译语料实际核验，反向去注精确恢复原作者块。35项负例全部拒绝。sealed stage-files.json SHA{h['stageFiles']['sha256']}，32输出文件逐字节固定，stage-snapshot.zip和完整父链副本可还原。
250继续依法接本213固定SHA持久重建路由，再真实MCP/Arena完整读回：b0017条件、7p/方向/摸切红线、四unknown、全部八条限制、暗手遮挡及作者所称5p–8p、弃和为作者结论，原图/作者全部条件/链接/标记/图序保持。不把本组合当普通全章passed；全局准入仍false，MCP/Arena未由248执行。正式active不切。
本阶段新增模型预算0；原213 maker1+独审1=2/2余0，0retry。不重复193/234，不挪其它额度。若具体路由兼容尚缺，只零模型处理精确scope；不收费重审，不吞原false。正常在本票前台有限阶段完成并给真实结果。'''
(H/'handoff250.md').write_text(instruction,encoding='utf-8',newline='\n')
print(json.dumps({'candidateSha256':v['candidate']['sha256'],'handoffSha256':sha(D/'handoff.json'),'isolatedNotes':8,'negativeChecks':35,'evidenceFiles':len(mapping),'newCalls':0,'globalAdmissionGranted':False}))
