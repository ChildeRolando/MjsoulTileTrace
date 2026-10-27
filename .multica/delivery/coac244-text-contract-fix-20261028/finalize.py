import json,hashlib,shutil,datetime
from pathlib import Path
O=Path(__file__).parent;P=json.loads((O/'paths.json').read_text(encoding='utf8'));R=Path(P['root']);S=Path(P['runtime']);T=R/'integration/coac244-text-contract-fix-20261028';T.mkdir(exist_ok=True)
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
old=load('.multica/delivery/coac244-closure26-zero-20261028/text-batch-183-236.json');jobs=[]
for j in old['jobs']:
 cmd=list(j['productionCommandAfterApproval']);cmd[1]=str(S/'textbook-production-web.mjs');cmd[cmd.index('--variant')+1]='coac244exactv2'
 jobs.append(dict(chapterId=j['chapterId'],source=j['source'],parent=j['parent'],parentAudit=j['parentAudit'],targetIds=j['targetIds'],requestOnlyCommand=cmd+['--request-only','true'],futureProductionCommandRequiresAdditionalAllowance=cmd,firstAudit='original unused one target-text independent review, not a production retry allowance',productionBudgetAdditional=1,originalAuditBudget=1,automaticRetry=0))
summary=dict(schema='coac244-text-contract-repair-and-p217-scope/1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),newModelCalls=0,oldProductionCalls=2,oldIndependentCalls=0,remainingOriginalFirstAuditCalls=2,newCandidatesCreated=0,passedChapters=0,rawOrSourceChanged=False,oldRuntimeChanged=False,runtime=bind(S/'exact-runtime-manifest.json'),contracts=bind(S/'exact-text-contracts.json'),verification=bind(O/'request-output-investigation.json'),p217=bind(O/'p217-location-corrigendum.json'),jobs=jobs,proposedBudget=dict(extraProductionCalls=2,originalRemainingFirstAudits=2,futureLocalCallsMaximum=4,lifetimeBatchMaximum=6,automaticRetry=0,authorizedOrDispatchedHere=False,money=None),sourceAssembly='215scope/193supplement remain under existing250 runs; no duplicate handoff or consumer')
save(O/'stage-summary.json',summary)
save(O/'exact-runtime-manifest.json',load(S/'exact-runtime-manifest.json'))
for p in S.iterdir():
 if p.is_file():
  D=O/'runtime';D.mkdir(exist_ok=True);shutil.copy2(p,D/p.name)
# Confirm original frozen runtime still matches its pre-existing manifest, not the newly exported snapshot.
manifest=load(Path(P['base'])/'bounded-runtime-manifest.json');proof=[]
for f in manifest.get('files',[]):
 p=Path(f.get('path',str(Path(P['base'])/f.get('name',''))));h=f.get('sha256')
 if p.is_file() and h:
  assert bind(p)['sha256']==h;proof.append(bind(p))
batch=load(R/'web-production/v1/runs/coac269-text-183236-20261028/batch-result.json')
for c in batch['chapters']:assert bind(c['raw']['path'])['sha256']==c['raw']['sha256']
save(O/'immutable-checks.json',dict(oldRuntimeFiles=proof,raws=[c['raw'] for c in batch['chapters']],sourceParentsAudits=[b for j in old['jobs'] for b in [j['source'],j['parent'],j['parentAudit']]],modelCalls=0))
for j in old['jobs']:
 for b in [j['source'],j['parent'],j['parentAudit']]:assert bind(b['path'])['sha256']==b['sha256']
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,T/p.name)
shutil.copytree(O/'p217-second-tile-packet',T/'p217-second-tile-packet',dirs_exist_ok=True)
(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
owner=Path('short-stage-owner-prefix.md');prior=owner.read_text(encoding='utf8')
prefix='''## 2026-10-28 183/236制作请求纠正及PDF217坐标纠正（本阶段0调用）

269原制作629d37ab/abef6c4b各1次，均无校注且目标段越白名单，未独审。旧真实prompt已有引用的校注建议及父译文，但主指令仍泛译，批准的精确保留规则没有成为实际硬请求/schema。现 `audit/runtimes/coac244-text-exact-183236-v2-20261028` 在真正invoke共用modelRequest中加入唯一完整text enum、父段白名单、强制“校注（非原文）”，候选写入前严格拒绝，旧raw回放拒绝、27项具名测试通过，真实closedPrompt/schema完整归档。旧冻结/runtime/source/raw/父/回执不改，无模型。

旧raw均没有校注。父+唯一目标+校注的内存组合被现有verifyWebProductionCall以web_production_translation_not_from_bound_output拒绝；不得借155单call格式归一化例外绕此契约，不产派生稿。若续本两章需额外制作各1次，总新增制作2；原剩2仅首审，未来最多4、本批累计最多6，失败void计0retry，未经追加预算本阶段未派。精确命令/来源/父审/actual request/回放stderr见integration/coac244-text-contract-fix-20261028。

PDF217旧11:58单牌请求明确北家第二行第二张(9m/8m争议)，244上一包误选第一张历史5m/6m争议；249按[150,325,175,357]只审第一张，09362d05结论unknown，不能外推第二张。已单列第二张[174,325,196,357]、原PNG/邻行邻牌/最近邻4倍待审包；不读取像素相关率作语义结论，未增模型，rev5继续隔离。追加单点审仅提案1call，不在原已用2point预算内。215仅b1/b3的scope不受b8争议连坐，193补文在途不重复。

'''
owner.write_text(prefix+prior,encoding='utf8')
print(json.dumps(dict(runtime=summary['runtime'],shared=str(T),oldRuntimeFilesVerified=len(proof),newModelCalls=0)))
