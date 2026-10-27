import json,hashlib,shutil,datetime
from pathlib import Path
O=Path(__file__).parent;R=Path('E:/AgentData/Coach/knowledge/processing');S=R/'integration/coac244-scope215-pdf193-20261028'
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipts={n:load(S/n) for n in ['215-stage-receipt.json','193-reuse-receipt.json']}
progress=dict(schema='coac244-zero-model-scope-progress/1',recordedAt=now,modelCalls=0,productionCalls=0,newIndependentCalls=0,sourceOrRawChanged=False,formalActiveChanged=False,rows=[dict(chapterId='79-cn-chapter-215-4',status='complete-owned-chapter-staged-awaiting250-readback',receipt=bind(S/'215-stage-receipt.json'),scopeProof=bind(S/'215-scope-proof.json'),remainingAction='250唯一写者有限增量并保持scope重建选择；真实MCP/Arena回读后才加覆盖，p217整页仍needs-repair'),dict(chapterId='79-cn-chapter-193-4',status='passed-PDF-version-two-sentence-supplement-staged-chapter-held-for-b0042',receipt=bind(S/'193-reuse-receipt.json'),remainingAction='250将PDF来源两句作为独立不计原章的补文；网页b0042未知图单独待裁决，不重制两句，不改原网页source/raw')])
reg=R/'integration/coac250-uncovered-chapter-continuation-register-20261027b.json';before=load(reg);after=json.loads(json.dumps(before))
save(O/'continuation-before.json',before)
for item in progress['rows']:
 row=next(r for r in after['rows'] if r['chapterId']==item['chapterId'])
 row['closurePlan']={**row.get('closurePlan',{}),'latestZeroModelProgress':item,'modelCallsThisStage':0,'updatedAt':now}
assert [r for r in before['rows'] if r['chapterId'] not in [x['chapterId'] for x in progress['rows']]]==[r for r in after['rows'] if r['chapterId'] not in [x['chapterId'] for x in progress['rows']]]
# No counters, coverage classifications or original row data are rewritten.
for a,b in zip(before['rows'],after['rows']):assert {k:v for k,v in a.items() if k!='closurePlan'}=={k:v for k,v in b.items() if k!='closurePlan'}
save(reg,after);progress['continuationRegister']=bind(reg)
save(S/'progress.json',progress);save(R/'integration/coac244-scoped-closure-progress-20261028.json',progress)
for p in S.iterdir():
 if p.is_file():shutil.copy2(p,O/p.name)
for name in ['stage-215','stage-193-supplement']:
 d=O/name;d.mkdir(exist_ok=True)
 for p in (S/name).iterdir():
  if p.is_file():shutil.copy2(p,d/p.name)
tasks=load('mika-tasks.tmp.json')
runs=[{k:r.get(k) for k in ['id','issue_id','status','created_at','dispatched_at','started_at','completed_at','runtime_id']} for r in tasks if r['issue_id']=='01a17471-25e6-7731-a529-3df99acf3d42']
save(O/'downstream-start-observation.json',dict(observedAt=now,runs=runs,note='215实际running；193单独交接已正常queued，下一释放边界为同票215有限增量完成。不得以queued声称已实际执行。'))
for name in ['215-wakeup-created.tmp.json','193-wakeup-created.tmp.json']:
 data=load(name);save(O/name.replace('.tmp',''),{k:data.get(k) for k in ['id','issue_id','kind','next_fire_at','fire_count','last_task_id','source_task_id']})
owner=Path('short-stage-owner-prefix.md');text=owner.read_text(encoding='utf8')
prefix='''## 2026-10-28 215按归属装配与193来源补文已完成（零模型）

当前授权由主票触发01a17ebb-2cfd-7dc9-b80c-6ad97987768f确定：269已接183/236最多4calls，249已接两个单点最多2calls，均不重复派发；234本轮不重试。以下覆盖历史“待授权”提案文字。

`integration/coac244-scope215-pdf193-20261028`：215仅PDF217 b1/b3归本章，已验证原源/production/原raw/同SHA独审并完成215–217责任块装配，7正文块1单元，无图，stdio MCP/Arena全文及引用通过。PDF217原needs-repair不变、b8归217章，未伪造全页pass。250真实run01a17ec3-726e-7f22-ae25-59dbbe325603于19:08:30 UTC running；193交接run01a17ec4-6087-74df-9b24-89abe5442b0c queued，按同票有限阶段正常释放后继续，不起第二consumer。

193-4两句逐字从已pass父046188e3的PDF193/b6摘取，版本归属与网页缺字精确分列；独立PDF补文2块1navigation单元已编译、MCP全文/Arena引用隔离通过，原章覆盖增量0。网页b0042未知图继续阻断；网页/父/raw/回执字节不改。本阶段制作0、独审0、模型0，有限scope拒绝回归5项。250唯一写者完成真实增量后才写master覆盖，主票仍in_progress、formal active不切。

'''
owner.write_text(prefix+text,encoding='utf8')
print(json.dumps(dict(progress=bind(S/'progress.json'),modelCalls=0,chapter215Blocks=7,pdf193SupplementBlocks=2)))
