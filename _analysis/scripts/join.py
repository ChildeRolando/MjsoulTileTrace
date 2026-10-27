import json,sys
sys.stdout.reconfigure(encoding='utf-8')
R=json.load(open('E:/AgentData/Coach/knowledge/processing/integration/coac250-uncovered-chapter-continuation-register-20261027b.json',encoding='utf-8'))
C=json.load(open('_analysis/incoming/coac246-57-verification-summary.json',encoding='utf-8'))
rows=R['rows']
mine={r['chapterId']:r for r in rows}
mine_ids=set(mine)
c246={r['chapterId']:r for r in C['chapters']}
c246_ids=set(c246)
print('mine rows',len(rows),'unique',len(mine_ids))
print('246 rows',len(C['chapters']),'unique',len(c246_ids))
print('\n246-only (not in my 79 rows):')
for i in sorted(c246_ids-mine_ids): print('  ',i, c246[i]['action'], c246[i]['auditStatus'])
print('\nmine-only (in my 79, not in 246 57):')
for i in sorted(mine_ids-c246_ids):
    r=mine[i]; print('  ',i,r.get('classification'),r.get('priorGroup'),'blocks',r.get('ownedSourceBlocks'))
print('\nboth:',len(mine_ids&c246_ids))
# classification cross tab
from collections import Counter
ct=Counter()
for i in mine_ids&c246_ids: ct[(mine[i].get('classification'),c246[i]['action'])]+=1
for k,v in sorted(ct.items(),key=str): print(k,v)
