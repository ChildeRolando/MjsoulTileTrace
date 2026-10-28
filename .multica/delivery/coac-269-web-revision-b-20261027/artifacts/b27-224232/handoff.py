import hashlib,json,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent;STAGE=ROOT/'web-production/v1/runs/coac269-224232-exact-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
def bind(p):p=Path(p);return {'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
def save(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
def platform(args):return json.loads(subprocess.run(['multica',*args,'--output','json'],capture_output=True,text=True,encoding='utf-8',check=True).stdout)
key=sys.argv[1];assert key in ['224','232'];c=load(HERE/'contract.json');j=c['jobs'][key];r=load(HERE/f'{key}-result.json');proof=load(HERE/f'{key}-selfcheck.json');pins=load(HERE/'pins.json');p=load(j['packet']['path']);needle=r['candidate']['sha256']
assert r['exitCode']==0 and r['callsRecorded']==1 and proof['passed'];assert bind(r['candidate']['path'])['sha256']==needle
issue=platform(['issue','get','01a17471-1595-79d5-bdfa-6feaa65172c0']);assert issue['assignee_id']=='b144c077-cadd-4749-a53d-4b9cb98191b8'
active=platform(['issue','runs','01a17471-1595-79d5-bdfa-6feaa65172c0','--active']);rules=platform(['issue','wakeup','list','01a17471-1595-79d5-bdfa-6feaa65172c0']);duplicates=[x for x in rules if needle in x.get('instruction','')]
ledger=[json.loads(s) for s in (ROOT/'audit/calls.jsonl').read_text(encoding='utf-8').splitlines() if needle in s];receipts=[str(p) for p in (ROOT/'audit/web').rglob('*'+needle+'*')]
save(HERE/f'{key}-dedup.json',{'at':datetime.now(timezone.utc).isoformat(),'active249':active,'sameSHARules':duplicates,'sameSHAAuditRows':ledger,'sameSHAReceipts':receipts});assert not duplicates and not ledger and not receipts
handoff={'schema':'coac269-exact224232-first-combined-target-review/1','key':key,'canonical':j['canonical'],'authorizationComment':c['authorizationComment'],'candidate':r['candidate'],'source':j['source'],'parent':j['parent'],'parentAudit':j['parentAudit'],'originalIndependentRaws':p['bindings']['independentRaws'],'originalIssues':p['originalIssues'],'packet':j['packet'],'runtime':pins['runtime'],'runtimeFiles':pins['runtimeFiles'],'entry':str(ROOT/'audit/runtimes/coac269-224232-exact-v1-20261028/pair.mjs'),'verifyProduction':'verifyProduction(key,candidatePath,manifestSHA)','prepare':'prepareReview(key,candidatePath,manifestSHA)','verifyReview':'verifyReviewExecution(key,realResult,plan,manifestSHA)','reviewRequest':bind(STAGE/f'{key}-review-request.json'),'selfcheck':bind(STAGE/f'{key}-selfcheck.json'),'maker':r['calls'][0],'raw':proof['productionProof']['raw'],'exactDiff':proof['exactDiff'],'textIds':j['textIds'],'figureIds':j['repairFigureIds'],'preservedUnknowns':p['figureRule']['unknowns'],'budget':{'maximumPair':4,'maximumThisChapter':2,'makerUsed':1,'independentUsedHere':0,'remainingIndependentMaximum':1,'failedVoidCount':True,'retry':0},'wholeChapterAccepted':False,'fee':None,'upstreamExecutionCount':None}
dest=ROOT/f'integration/coac269-224232-{key}-handoff-249-20261028.json';save(dest,handoff);save(HERE/f'{key}-handoff.json',handoff)
scope=('224仅b0013七系列×15巡约值和自摸图例。真实maker输出原图读数strings rows，冻结renderer只接原前缀+105槽，完整raw可重放，不是控制器手填数值。原精确值和单位未知保持，仅更正未知列表的两处系列术语。b0008仍source-note且全文逐字未改，不重算作者数值。' if key=='224' else '232仅b0002名次不变的结束和牌含义、b0004去掉配牌与摸牌必须同时有利的条件、b0005本家2s→3s。未知河牌/小字/计数等全保留，不猜。')
instruction=f'''接269明确授权01a181c4-730d-7821-8325-b8bc9e48a7cc，仅{j['canonical']}真实新SHA首次合并靶审。此章maker已用1，249最多1新独审；两章224/232总最多4真实calls，各maker1+review1，failed/void全计，0自动retry，不借其它批额度。不是新制作/全章审，不碰193/213或283合库，不新开消费者。

根E:/AgentData/Coach/knowledge/processing。唯一交接integration/{dest.name} SHA256 {bind(dest)['sha256']}。candidate={needle}，真实maker={r['calls'][0]['callId']}，实际terra/max、{len(r['calls'][0]['requestExecution']['images'])}张原图/既有放大图，原raw/argv/完整session/events/usage在交接绑定。制作槽/claim已正常释放，本票269未自己独审。

唯一冻结audit/runtimes/coac269-224232-exact-v1-20261028/runtime-manifest.json SHA {pins['runtime']['sha256']}，{pins['runtimeFiles']}文件。原244 schema-v2运输/门禁原字节未改；新入口只认两章硬编码source/parent/audit元组，逐一验原真实生产/raw/独审/schema/projection及全部父issues，不套256例外或泛化重写许可。77项零调用请求/越界负例通过，实际maker prompt/schema/images已逐字段核同。未改范围依真实父链继承，原error/uncertain/source-note原样保存。

先核在途及相同SHA/scope ledger/raw/receipt/checkpoint/dispatch去重、原STOP/claim/audit guard。正常等待已有249调用释放，不删锁、不另开消费者、不占maker-B等审。此SHA未有真实独审。服务quota/capacity/质量STOP异常保存断点/raw立即停派，不收费探路、换模型/provider或retry。

合法入口为该冻结pair.mjs verifyProduction('{key}',candidatePath,manifestSHA)，再prepareReview('{key}',candidatePath,manifestSHA)。必须与共享run/{key}-review-request.json的已发布plan/actual逐字段相等；该输入含{len(p['orderedContext'])}块完整有序source/candidate/figure、全部条件/数值/sourceSegments/tableContext、真实新maker原输出和unknown影响问题。通过同冻结textbook-production-cli.mjs invokeTextbookCodex({{...plan,stopFiles:原STOP路径}})恰1次，实际gpt-6.1-terra/max、有序{len(p['images'])}个-i，图SHA/bytes全部核真。路径别名仅用于核同，实际运输使用发布字符串。不要调auditWebCandidate退成全章；原一般入口不兼容混合文本/图或translated图修订，拒绝原样，不因其报错再收费调用。

{scope}
text targets={json.dumps(j['textIds'],ensure_ascii=False)}；figure targets={json.dumps(j['repairFigureIds'],ensure_ascii=False)}。独审完整有序论证及真实图/相邻条件，只核本次指定修订是否faithful及保留unknown对作者实际命题的影响。不要求恢复隐藏信息、不机械降级/放行，不推算图中未读点或牌码。每个preservedUnknowns字符串逐字作为unknownText覆盖；targetChecks按textIds+figureIds顺序齐全。若未知阻断，给具体作者命题/字段缺口；若允许有限展示，给必须实际落实的显示限制。原uncertain不能改error/source-note，原source-note不能自动升错。

前台收齐唯一真实响应，先保存完整raw/argv/requestExecution/-i图序SHA bytes/stdin/schema/session/events/stdout/usage/耗时，标准audit/calls.jsonl本SHA恰1条。严格按发布schema验证，再用verifyReviewExecution('{key}',realResult,plan,manifestSHA)验真，保存精确source/parent/candidate/raw/runtime绑定的目标checkpoint/收据。区分repairPassed、limitedUnknownOkay，整章状态始终不能由此伪造普通passed。原通用门禁拒绝不等于运输失败；0retry，不能换variant。

及时回269原授权线程01a181c4-730d-7821-8325-b8bc9e48a7cc，真实合格结果交250及244已有账，所有显示限制先合法映射再真实读回。未过则保留原证据/精确下一步，不自动重制/复审。当前交接只给此一审额度，不触碰别章；正式active不切。费用、远端权重及上游总次数未知。
'''
(HERE/f'{key}-instruction.md').write_text(instruction,encoding='utf-8',newline='\n');rule=platform(['issue','wakeup','create','01a17471-1595-79d5-bdfa-6feaa65172c0','--agent-id','b144c077-cadd-4749-a53d-4b9cb98191b8','--kind','at','--after','2s','--instruction-file',str(HERE/f'{key}-instruction.md')]);save(HERE/f'{key}-wakeup.json',rule);print(json.dumps({'key':key,'candidate':needle,'handoff':bind(dest),'wakeupId':rule['id'],'independentCallsHere':0,'remainingIndependentMaximum':1}))
