import hashlib,json,shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027';OUT=Path('.multica/delivery/coac244-inline-text-20261027')
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
for n in ['run-inline-production.py','run-inline-audit.mjs']:shutil.copyfile(n,STAGE/n);shutil.copyfile(n,OUT/n)
proofs=read(STAGE/'zero-call-parent-proofs.json');jobs=read(STAGE/'jobs.json');selected=[j for j in jobs if j['chapterId'] in ['79-cn-chapter-162-3','79-cn-chapter-234-12']]
assert len(selected)==2 and all(next(p for p in proofs['results'] if p['chapterId']==j['chapterId'])['passed'] for j in selected)
packet={'schema':'coach-ticket-two-inline-text-chapters/1','authorizationCommentId':'01a17e4c-8ec2-73f3-8c59-92bb3f8910db',
 'agentId':'ba77da89-8574-4dea-8fc2-24e841fc2754','runtimeId':'731c52da-6d5e-4c5b-80c9-e9f39803735b','model':'gpt-6.1-sol','reasoningEffort':'high',
 'budget':{'perChapterProduction':1,'perChapterFirstReview':1,'maximumTotalNewCalls':4,'failedVoidCount':True,'automaticRetries':0},
 'jobs':selected,'runtime':read(STAGE/'runtime-manifest.json'),'parentProofs':[p for p in proofs['results'] if p['chapterId'] in [j['chapterId'] for j in selected]],
 'scripts':[{'path':str(STAGE/n),'sha256':sha(STAGE/n)} for n in ['run-inline-production.py','run-inline-audit.mjs','canonical-exclusion-helper.py']],
 'noDispatch':['79-cn-chapter-155-4','79-cn-chapter-157-11','79-cn-chapter-182-5','79-cn-chapter-205-5','nemata-jp-chapter-276-4'],
 'excluded182':'b0013 remains an independent uncertain source-semantic issue. Translating b0003 cannot make the chapter complete.',
 'exclusionRule':'Before each call re-read full canonical preview/register/bound-passed alternatives, existing raw and dispatch markers, active issue runs and claims. Skip any accepted or already dispatched chapter. No implicit re-creation or model retry.',
 'handoffRule':'Only new candidate SHA with a true independent pass goes individually to COAC-250, with this frozen verifier and exact source/parent/raw/plan/normalization chain. No formal active switch.'}
p=STAGE/'ticket-intake.json'
with p.open('x',encoding='utf-8') as f:json.dump(packet,f,ensure_ascii=False,indent=2);f.write('\n')
shutil.copyfile(p,OUT/'ticket-intake.json');print(json.dumps({'path':str(p),'sha256':sha(p),'chapters':[j['chapterId'] for j in selected]}))
