"""Update only the existing244 register's311 row. Never touch250 global coverage."""
import copy,hashlib,json,os,pathlib,shutil
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-311-curves-recorded-20261028';O=pathlib.Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
encoded=lambda x:json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
sha=lambda x:hashlib.sha256(x).hexdigest()
def save(name,x):
    (O/name).write_bytes(json.dumps(x,ensure_ascii=False,indent=2).encode('utf-8')+b'\n');shutil.copyfile(O/name,D/name)
r=load(D/'record.json');assert r['canonical']=='79-cn-chapter-311-18';assert not r['repairPassed'] and not r['limitedUnknownOkay']
shutil.copyfile(D/'record.json',O/'record.json')
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']==r['canonical']);old=copy.deepcopy(row)
addition={'schema':'coac244-cn311-latest-target-evidence/1','candidate':r['candidate'],'receipt':r['receipt'],'raw':r['raw'],'record':{'path':str(D/'record.json'),'sha256':sha((D/'record.json').read_bytes())},'transportCompleted':True,'repairPassed':False,'limitedUnknownOkay':False,'wholeChapterPassed':False,'newNumericReadings':0,'targetSeries':16,'unknownSlots':144,'impactCounts':r['impactCounts'],'effectiveTargetIssues':[f['independentTargetVerdict'] for f in r['figures']],'inheritedNonTargetIssue':r['scopeAttribution'],'originalIssuesPreserved':True,'phaseBudget':r['phaseBudget'],'thisRunNewModelCalls':0,'currentDisplayLimitationsImplemented':False,'globalCoverageChanged':False}
row['latestTargetReview']=addition;row['owner']='COAC-269';row['nextAction']=r['nextAction'];assert row['covered'] is False
for x,y in zip(a['rows'],b['rows']):
    if x['chapterId']!=r['canonical']:assert x==y
for k in a:
    if k!='rows':assert a[k]==b[k]
assert old['blockingIssues']==row['blockingIssues'];assert old['baseEvidence']==row['baseEvidence']
if a!=b:
    backup=D/'before-existing244-register.json'
    if not backup.exists():backup.write_bytes(before)
    assert reg.read_bytes()==before,'register changed concurrently: read again, never overwrite'
    temp=D/'updated-existing244-register.tmp';temp.write_bytes(json.dumps(b,ensure_ascii=False,indent=2).encode('utf-8')+b'\n');os.replace(temp,reg)
save('register-update.json',{'path':str(reg),'beforeFileSha256':sha(before),'afterFileSha256':sha(reg.read_bytes()),'chapterId':r['canonical'],'beforeRowSha256':sha(encoded(old)),'afterRowSha256':sha(encoded(row)),'onlyChanged311Fields':['latestTargetReview','owner','nextAction'],'allOtherRowsAndTopLevelFieldsEqual':True,'oldBlockingIssuesAndEvidenceUnchanged':True,'coac250GlobalRegistersWritten':False,'covered':False})
save('latest311-row.json',row)
save('consumer-dedup.json',{'269':{'originalAuthorizationThread':'01a18226-73d2-75c1-95bc-b6fe80283266','matchingCandidate':'f44231f95310e33608a596f1f4153f0e35afb55490fc3db1fdccd3fc11d3a125','productionDeliveryComment':'01a18230-2a71-7388-848b-33fa6f009b17','currentDifferentScopeRun':'01a18233-e474-770a-b39b-79971996530b','noRedispatch':True},'250':{'existing311Wakeup':'01a18238-b4a7-7366-b9d8-81c8f7194cdb','enabledAtCheck':True,'lastTaskIdAtCheck':None,'noNewConsumerCreated':True},'244Wakeup':{'id':'01a18238-a4f6-7ca2-bb58-a67e8fa2397f','onceFired':True,'enabled':False,'noNeedToDisableAgain':True},'newConsumers':0})
lines=['中文311八图真实靶审登记','',
'仅 `79-cn-chapter-311-18`。现有owner为269，250仍为全局唯一写者；不涉及另一书PDF311、人工页或其它章。此包不是准入凭据。','',
'候选 `f44231f95310e33608a596f1f4153f0e35afb55490fc3db1fdccd3fc11d3a125`。真实独审7777908d-0298-450a-a5f8-a3ff98af7329，terra/max、8原图、225有序配对，130941输入/0缓存/18093输出、199033ms。原阶段maker1+review1=2/2，余0、0retry；本次模型/制作/独审/新消费者均0。货币费用、远端权重和上游次数unknown。','',
'实际重走原冻结verifyProduction、prepareReview和verifyReviewExecution，33文件及55项绑定重算，实际请求与发布plan全等；真实raw输出/原收据/唯一ledger匹配。运输完成；repairPassed=false、limitedUnknownOkay=false、wholeChapterPassed=false原样保留。','',
'八靶均uncertain：16目标系列/144新槽全部unknown，无新增数字。225作者块、13非靶完整图、全部21原图及已录数组保持。b0156/b0158图例中的“和牌时的自摸比例”“被自摸率”译义已独立确认，不能因此称曲线补齐。','',
'| 图块 | 条件与真实最小缺口 | 作者命题边界 |','|---|---|---|']
for f in r['figures']:
    short=f['figureId'].split(':')[-2];claims='；'.join(dict.fromkeys(u['authorClaim'] for u in f['unknownImpacts'] if u['disposition']!='nonblocking-with-limits'))
    gap='不立直10%/立直0%的图例—轨迹绑定，各2/4/6/8/10/12/14巡，共14点未知' if short not in ['b0156','b0158'] else '自摸占比/被自摸率的图例—轨迹绑定，各1–15巡，共30点未知'
    if short=='b0132':gap+='；既有叉形[3400,3550,3700,3850,3900,3950,3800]仍不绑定条件'
    lines.append(f'| {short} | {gap} | {claims} |')
lines+=['','40项逐unknown影响：24 blocking、12 nonblocking-with-limits、4 uncertain。完整原句/作者命题/sourceBlockIds/原图SHA/逐系列巡目/80条必要显示限制均在record.json逐字段保留。12项有限允许主要针对既有约值精度及作者已写判断，不会覆盖仍阻断的条件绑定或图读复核。80限制只是未实施提案，不是合法整章许可。','',
'b0156正文第12巡22%可作为作者陈述保留，不能反填未知曲线。b0158约7000点同理；该图第7巡的被自摸率输入未核定。六图的第4/6/12/14巡判断按原文归作者，不冒称图读阈值已核验。','',
'手牌A原issue误标b0156，但“仅12张、图14/35、b0155上下文”的描述属于非靶b0154。该完整图对象与原父相同，父审对b0154已有uncertain。scopeAttribution只补归属：原raw/issue/targetId/severity不改，不多算一条新曲线错误、不扩手牌复审。附件编号仍source-note，不变成语义错误。','',
'本次仅更新共享既有244 remaining26 register的311行：latestTargetReview、现有owner、nextAction；旧blockingIssues/baseEvidence原样留作历史。其它行、顶层计数及250全局register均不动，不能把历史31/26章口径当当前覆盖。变更证明见register-update.json。','',
'269原制作交接已匹配此SHA，当前在另一范围处理人标；250已有311 once提醒01a18238-b4a7-7366-b9d8-81c8f7194cdb，不再新建消费者。244触发once已fire_count=1/enabled=false，无需重复禁用。','',
'下一步只保留这八个具体图靶及继承b0154源缺张。若今后取得可靠系列标记/更清晰原源或精确人工曲线判读，先映射到上述条件/巡目/源SHA再提最小新范围；当前没有新授权，不自动重复同输入识图、填值、插值或推公式。只有图例译义可复用，尚不能合库整章、增加覆盖或切active。','',
'共享路径：`integration/coac244-311-curves-recorded-20261028/`。复验：`node verify.mjs`（只读真实输入；仅写本包record.json，不包含模型调用入口）。原书源/候选/raw/完整请求留在既有处理根，不随附件上传。']
(O/'README.md').write_bytes(('\n'.join(lines)+'\n').encode('utf-8'));shutil.copyfile(O/'README.md',D/'README.md')
for n in ['verify.mjs','record.py','.gitattributes']:shutil.copyfile(O/n,D/n)
print(json.dumps({'only311RowUpdated':True,'targetFigures':8,'unknownPoints':144,'covered':False,'newModelCalls':0}))
