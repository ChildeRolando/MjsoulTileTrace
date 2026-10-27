import json,hashlib,shutil
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent
S=R/'audit/runtimes/coac244-text-exact-183236-v2-20261028';S.mkdir(parents=True,exist_ok=True)
B=R/'audit/runtimes/coac244-text-uncertain-183236-v1-20261028'
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
for p in B.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
batch=load('.multica/delivery/coac244-closure26-zero-20261028/text-batch-183-236.json')
jobs=[]
notes=['【校注（非原文）：前文数据中，已打出1张且持有0张时，役牌与客风牌的放铳率均为4%；已打出1张且持有1张时，役牌为2%、客风牌为3%。原文“见1张”是否包含已打出的1张，或指另持有1张，尚未确认；此处保留原文条件，不将其改为“持有1张”。】','【校注（非原文）：原文“巡目が僅か”未明确指已进行的巡数还是剩余巡数，此处不补入“剩余”；该时机条件仍未确认。】']
for i,j in enumerate(batch['jobs']):
 p=load(j['parent']['path']);b=next(b for b in p['body']['blocks'] if b['sourceBlockIds']==j['targetIds']);text=b['text'];base=text
 if i==1:
  assert text.count('即使剩余巡数很少，也应当立直')==1
  base=text.replace('即使剩余巡数很少，也应当立直','即使巡数很少，也应当立直')
 jobs.append(dict(chapterId=j['chapterId'],articleId=p['source']['articleId'],source=j['source'],parent=j['parent'],parentAudit=j['parentAudit'],targetId=j['targetIds'][0],parentText=text,approvedAuthorText=base,editorialNote=notes[i],expectedText=base+'\n\n'+notes[i],revisionGoal=j['revisionGoal']))
save(S/'exact-text-contracts.json',dict(schema='coac244-exact-two-text-contracts/1',modelCalls=0,jobs=jobs))
save(O/'exact-text-contracts.json',load(S/'exact-text-contracts.json'))
save(O/'paths.json',dict(runtime=str(S),root=str(R),base=str(B)))
print(str(S))
