import json,sys,os
sys.stdout.reconfigure(encoding='utf-8')
ROOT='E:/AgentData/Coach/knowledge/processing'
R=json.load(open(ROOT+'/integration/coac250-uncovered-chapter-continuation-register-20261027b.json',encoding='utf-8'))
rows=R['rows']
from collections import Counter
cnt=Counter()
for r in rows:
    cls=r['classification']
    wc=r.get('webCorrespondence') or []
    have=[]
    for w in wc:
        for f in w.get('candidateFiles',[]):
            if os.path.exists(os.path.join(ROOT,f)): have.append(f)
    key=(cls, 'hasWebCorr' if wc else 'noWebCorr', 'filesExist' if have else 'noFiles')
    cnt[key]+=1
for k,v in sorted(cnt.items(),key=lambda x:str(x)): print(k,v)
print()
# list truly-unproduced with web corr but no files, and with files
for r in rows:
    if r['classification']!='truly-unproduced': continue
    wc=r.get('webCorrespondence') or []
    have=[f for w in wc for f in w.get('candidateFiles',[]) if os.path.exists(os.path.join(ROOT,f))]
    print(r['chapterId'], '| webCorr',len(wc), [w.get('articleId') for w in wc], '| files', len(have), '| blocks',r['ownedSourceBlocks'], '| pages',r['pageFrom'],'-',r['pageTo'])
