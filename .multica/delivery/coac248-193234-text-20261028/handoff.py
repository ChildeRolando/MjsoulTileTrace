import json,pathlib,hashlib,sys,datetime
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=pathlib.Path(__file__).parent;P=R/'integration/coac248-193234-text-20261028';key=sys.argv[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda p:json.loads(p.read_bytes())
def write(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
r=load(P/'release.json');j=next(x for x in r['jobs'] if x['key']==key);e=load(D/(j['articleId']+'-production.json'));plan=load(P/(key+'-review-plan.json'))
assert e['candidateSha256']==plan['proof']['candidateSha256'];assert plan['images']==[] and plan['model']=='gpt-6.1-sol' and plan['reasoningEffort']=='high'
bindings=[]
for p in [R/e['candidatePath'],R/j['parentPath'],R/j['notesPath'],R/j['sourcePath'],P/'release.json',P/'review.mjs',P/'run.mjs',P/(key+'-review-plan.json'),P/(j['articleId']+'-production.json'),R/('web-production/v1/'+e['productionCall']['rawArtifactPath']),pathlib.Path(r['runtimePath'])/'runtime-manifest.json']:
 bindings.append({'path':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
if key=='234':
 p=P/'runner234.mjs';bindings.append({'path':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
if key=='193':
 for p in [R/j['reviewRawPath'],R/'integration/coac249-jp193-display-and-residual-20261028.json',R/'integration/coac249-jp193-scope-inheritance-20261028.json']:
  bindings.append({'path':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
else:
 p=R/j['oldTimeout']['rawPath'];bindings.append({'path':str(p).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size})
h={'schema':'coac248-193234-text-recovery-handoff/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorizationCommentId':r['authorizationCommentId'],'canonical':j['chapterId'],'bindings':bindings,'candidate':{'path':e['candidatePath'],'sha256':e['candidateSha256']},'source':{'path':j['sourcePath'],'sha256':j['sourceSha256']},'parent':{'path':j['parentPath'],'sha256':j['parentSha256']},'parentReview':{'path':j['notesPath'],'sha256':j['notesSha256']},'productionCall':e['productionCall']['callId'],'model':e['productionCall']['model'],'reasoningEffort':e['productionCall']['reasoningEffort'],'images':[],'usage':e['productionCall']['usage'],'fee':'unknown','remoteWeights':'unknown','upstreamExecutions':'unknown','diff':e['diff'],'preservation':e['preservation'],'budget':{'thisItemMaximum':2,'makerConsumed':1,'reservedIndependentTextReview':1,'retry':0,'failedVoidCount':True,'prior193PhaseConsumed':2 if key=='193' else None,'old234Timeout':j.get('oldTimeout'),'noBudgetBorrowing':True},'reviewEntry':{'module':str(P/'review.mjs').replace('\\','/'),'prepare':'prepare193234TextReview(root,"'+key+'")','verify':'verify193234TextReviewExecution(result,plan)','publishedPlan':str(P/(key+'-review-plan.json')).replace('\\','/'),'publishedPlanSha256':sha(P/(key+'-review-plan.json')),'model':'gpt-6.1-sol','reasoningEffort':'high','images':[],'scope':'Only one complete text target with full ordered argument, no image or full-chapter review'},'chapterAccepted':False,'wholeChapterPassed':False,'admissionGranted':False,'independentRequiredDisplayLimitationsInstalled':False if key=='193' else None}
write(P/(key+'-handoff249.json'),h);write(D/(key+'-handoff249.json'),h)
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';o=load(owner);row=next(x for x in o['rows'] if x['chapterId']==j['chapterId']);row['owner']='COAC-248';row['textRecovery193234']=h;row['nextAction']='本次真实纯文字制作完成，原父审/原raw/历史失败不变；仅余249一次独立文字靶审，0retry。'+('只核b0081入り目子句及完整b0080–0097论证；6p图修与4unknown影响及7条可见限制继承，不重识牌；实际限制须后续244/250依法安装并读回。' if key=='193' else '只核b0003三处中文释义及完整条件/支付数值；旧900秒timeout/2重连/unknown usage保留，新attempt为新增真实调用，不重复计算旧首审。')
row['modelCallsThisRecoveryStage']=1;write(owner,o,1)
ins=f'''COAC-248→既有249独立审单写者：本次用户授权01a181e7-d3dc-76f2-adb8-00cbb4f4e332的{j['chapterId']}真实纯文字maker已成功。不要创建新工单/消费者，不自增额度。先读当前票/相关评论并查同SHA审/在途去重，复用既有单guard、STOP、ledger和原子chapter claim。
根E:/AgentData/Coach/knowledge/processing。交接integration/coac248-193234-text-20261028/{key}-handoff249.json，SHA{sha(P/(key+'-handoff249.json'))}。唯一candidate {e['candidatePath']} SHA{e['candidateSha256']}；父{j['parentSha256']}，源{j['sourceSha256']}；真实maker {e['productionCall']['callId']}，实际sol/high、images=[]。本项新预算最多2，maker已1，唯一剩余独立文字靶审1；failed/void计、0自动retry；不能跨项借额度。旧历史全部保留，不算零调用恢复。
用integration/coac248-193234-text-20261028/review.mjs导出prepare193234TextReview(root,"{key}")构造plan，先JSON运输字节核对已发布{key}-review-plan.json全文，真实prompt/schema均一致；通过后既有invokeTextbookCodex调用1次，gpt-6.1-sol/high、images=[]，完整requestExecution/argv/stdin/session/events/raw/usage保留。收齐后verify193234TextReviewExecution(realResult,plan)，本票maker不自审。
'''+('只审b0081子句，不重做6p图修或4unknown识字/影响。完整97有序源/稿/图配对、真实原句、旧双条件错误与b0080–0097完整论证、实际diff均入请求。原独审figureRepair faithful、4unknown允许影响及7条编者限制按原SHA继承；原orderedContextFaithful=false/错误/uncertain/raw不改，不造普通passed。文字成立后交既有244/250将所有限制按合法精确scope实际安装和MCP/Arena读回。旧1932/2和新本项2/2单独记账。' if key=='193' else '只审b0003ゴットー/ワンツー/ワンスリー后中文释义，原支付数值/条件/中文/Japanese/其它字节保持。完整有序教学正文及图对象和父审在plan，原图不新审。旧ba432ee3 timeout为1本地+2重连，raw无output/usage未知，仍保留；本次新attempt独立计费账未知，不双算旧未用首审。')+f'''
成功即沿既有250单写者交接，未满足只列精确子句，不自动新增调用。费用/远端权重/上游次数unknown，正式active不切。结果回248原线程01a181e7-d3dc-76f2-adb8-00cbb4f4e332；正常释放guard/claim，不等另一项。'''
(D/(key+'-wakeup-instruction.md')).write_text(ins,encoding='utf-8',newline='\n')
print(json.dumps({'key':key,'handoffSha256':sha(P/(key+'-handoff249.json')),'candidateSha256':e['candidateSha256']}))
