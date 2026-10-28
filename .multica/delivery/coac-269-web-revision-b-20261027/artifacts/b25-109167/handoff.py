"""Handoff one genuinely produced chapter to the existing249 owner; no review call here."""
import hashlib,json,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
STAGE=ROOT/'web-production/v1/runs/coac269-109167-exact-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
def bind(p):p=Path(p);return {'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
def save(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
def platform(args):
    cp=subprocess.run(['multica',*args,'--output','json'],capture_output=True,text=True,encoding='utf-8',check=True);return json.loads(cp.stdout)
key=sys.argv[1];assert key in ['109','167'];c=load(HERE/'contract.json');j=c['jobs'][key];r=load(HERE/f'{key}-result.json');check=load(HERE/f'{key}-selfcheck.json');pins=load(HERE/'pins.json')
assert r['exitCode']==0 and r['callsRecorded']==1 and r['remainingIndependentMaximum']==1 and check['passed']
needle=r['candidate']['sha256'];assert bind(r['candidate']['path'])['sha256']==needle
issue=platform(['issue','get','01a17471-1595-79d5-bdfa-6feaa65172c0']);assert issue['assignee_id']=='b144c077-cadd-4749-a53d-4b9cb98191b8'
active=platform(['issue','runs','01a17471-1595-79d5-bdfa-6feaa65172c0','--active'])
rules=platform(['issue','wakeup','list','01a17471-1595-79d5-bdfa-6feaa65172c0'])
duplicates=[x for x in rules if needle in x.get('instruction','')]
ledger=[json.loads(s) for s in (ROOT/'audit/calls.jsonl').read_text(encoding='utf-8').splitlines() if needle in s]
receipts=[str(p) for p in (ROOT/'audit/web').rglob('*'+needle+'*')]
save(HERE/f'{key}-dedup.json',{'at':datetime.now(timezone.utc).isoformat(),'active249':active,'sameCandidateRules':duplicates,'sameCandidateAuditLedger':ledger,'sameCandidateReceipts':receipts,'candidate':r['candidate']})
assert not duplicates and not ledger and not receipts
p=load(j['packet']['path']);handoff={'schema':'coac269-exact-109167-one-produced-target-audit/1','canonical':j['canonical'],'key':key,'authorizationComment':c['authorizationComment'],'candidate':r['candidate'],'parent':j['parent'],'source':j['source'],'parentAudit':j['parentAudit'],'originalIndependentRaws':p['bindings']['independentRaws'],'originalIssues':p['originalIssues'],'packageManifest':c['packageManifest'],'packet':j['packet'],'runtime':pins['runtime'],'runtimeFiles':pins['runtimeFiles'],'entry':str(ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028/pair.mjs'),'prepareFunction':'prepareReview(key,candidatePath,manifestSHA)','verifyFunction':'verifyReviewExecution(key,realResult,plan,manifestSHA)','productionVerifier':'verifyProduction(key,candidatePath,manifestSHA)','maker':r['calls'][0],'raw':check['productionProof']['raw'],'reviewRequest':bind(STAGE/f'{key}-review-request.json'),'selfcheck':bind(STAGE/f'{key}-selfcheck.json'),'reviewTargets':p['reviewTargets'],'exactDiff':check['exactDiff'],'bodyUnchanged':True,'budget':{'maximumPerChapter':2,'makerUsed':1,'independentUsedHere':0,'remainingIndependentMaximum':1,'maximumPair':4,'failedVoidCount':True,'retry':0,'separateFrom283And182201':True},'configuration':{'model':'gpt-6.1-terra','reasoningEffort':'max','makerImages':len(r['calls'][0]['requestExecution']['images']),'reviewImages':len(check['reviewImages'])},'wholeChapterAccepted':False,'fee':None,'upstreamExecutionCount':None}
dest=ROOT/f'integration/coac269-109167-{key}-handoff-249-20261028.json';save(dest,handoff);save(HERE/f'{key}-handoff.json',handoff)
text=f'''接269授权评论01a181af-e1d9-7e64-8dcf-1607be707075，本次只收{j['canonical']}真实新候选的合并靶审，最多1独立新call，failed/void计、0retry。此章maker已用1；109/167整批最多4（各maker1+249独审1），与283/b0785及248的182/201独立，不借额度。不新建消费者、不制作、不做全章重审。

根E:/AgentData/Coach/knowledge/processing。唯一交接integration/{dest.name}，SHA256 {bind(dest)['sha256']}。候选{needle}，真实maker {r['calls'][0]['callId']}，terra/max、{len(r['calls'][0]['requestExecution']['images'])}图，完整raw/argv/session/events/usage和精确diff已绑定；maker-B/claim已正常释放。原父/源/独审SHA、所有unknown/issues都在交接，不篡改原uncertain。

唯一冻结audit/runtimes/coac269-109167-exact-v1-20261028/runtime-manifest.json SHA {pins['runtime']['sha256']}，{pins['runtimeFiles']}文件。新入口只认109/167两个硬编码source/parent/audit SHA元组，原一般web_revision_notes_scope门禁未改；不套256专用例外。244共享包45文件已逐项重算，76零调用回归通过，实际maker prompt/schema/images匹配预检。原32/34属于其它批，不能误用；本manifest完整原字节才为准。

先核现有在途、同SHA/scope的ledger/raw/receipt/checkpoint/dispatch去重、STOP和原audit guard/章节claim。其它已授权249在途正常结束，不能删锁、开第二独审进程或占maker-B等审。此SHA未派过。服务capacity/quota/质量STOP立即留raw停派，不换provider/模型，不retry。

从上述冻结pair.mjs调用verifyProduction('{key}',candidatePath,manifestSHA)和prepareReview('{key}',candidatePath,manifestSHA)。后者生成真实新SHA的完整有序source/candidate/figure上下文（{len(p['orderedContext'])}块）和unknown影响问题，必须逐字段等于共享run/{key}-review-request.json的plan/actual。通过同冻结textbook-production-cli.mjs invokeTextbookCodex({{...plan,stopFiles:原STOP路径}})恰1次。实际terra/max、{len(check['reviewImages'])}张图片全部-i入真实payload；167已有单帧GIF无损PNG别名像素一致，不重做图片。不要调auditWebCandidate退成全章或花调用探路。

范围：repairFigureIds={json.dumps(j['repairFigureIds'],ensure_ascii=False)}；unknownImpactFigureIds={json.dumps(j['unknownImpactFigureIds'],ensure_ascii=False)}。109只确认b0004/b0006首张5m，b0012三unknown原样；167只确认b0005立直7p及方向，其余unknown原样。连读完整有序正文条件、数值和原图。每个原unknown逐条按作者贡献/sourceBlockIds判断是否依赖精确牌码，不猜牌、不机械降级或放行、不认证全部牌河/概率/最优。若允许保留unknown，给实际强制显示限制；若仍阻断，给具体论证与字段证据。原unknownText字符串应在输出中逐字引用；repairChecks按发布repairFigureIds顺序完整覆盖。新增收据区分repairPassed与limitedUnknownOkay，不能删除原uncertain或把它改error/source-note；wholeChapterAccepted必须false。

完整结果前台收齐，先保留原始响应/raw，标准audit/calls.jsonl唯一记录本SHA调用和实际model/effort/-i序/SHA/bytes、完整session/events/stdout、usage/耗时。按发布严格schema检查，再用verifyReviewExecution('{key}',realResult,plan,manifestSHA)验证真实请求。保存精确candidate/source/父/raw/runtime绑定的目标checkpoint/收据，不改模型原结果、不伪造普通全章passed。通用入口不识本bounded mixed-parent补证，旧拒绝原样；此显式补证不等于绕门禁准入。

交269原授权线程01a181af-e1d9-7e64-8dcf-1607be707075及现有244/250逐项归并账；真实合格结果才走原限定准入，全部限制须映射展示。未知仍阻断则如实结束，不自动重制/复审。未改范围按父/源/raw完整SHA链继承。此指令不触碰248的182/201或283后续装配/合库，不切active。费用和上游实际执行总数未知。
'''
(HERE/f'{key}-instruction.md').write_text(text,encoding='utf-8',newline='\n')
rule=platform(['issue','wakeup','create','01a17471-1595-79d5-bdfa-6feaa65172c0','--agent-id','b144c077-cadd-4749-a53d-4b9cb98191b8','--kind','at','--after','2s','--instruction-file',str(HERE/f'{key}-instruction.md')]);save(HERE/f'{key}-wakeup.json',rule)
print(json.dumps({'key':key,'candidate':needle,'handoff':bind(dest),'wakeupId':rule['id'],'independentCallsHere':0,'remainingIndependentMaximum':1}))
