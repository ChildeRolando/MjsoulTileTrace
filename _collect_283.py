import json,os
B='E:/AgentData/Coach/knowledge/processing/audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421'
plan=json.load(open('E:/AgentData/Coach/knowledge/processing/web-production/v1/batch-plans/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421.json',encoding='utf-8'))
rows=[]
for g in plan['groups']:
    p=os.path.join(B,g['batchId']+'.json')
    if not os.path.exists(p):
        rows.append({'batchId':g['batchId'],'status':'not-run','issues':[]});continue
    d=json.load(open(p,encoding='utf-8'))
    iss=[{'severity':i['severity'],'targetId':i['targetId'],'description':i['description'],'suggestedRepair':i['suggestedRepair']} for i in (d.get('modelReview') or {}).get('issues',[])]
    rows.append({'batchId':g['batchId'],'status':d['status'],'usage':d['calls'][0]['usage'],'callId':d['calls'][0]['callId'],'issues':iss})
out={'groups':rows,'done':sum(1 for r in rows if r['status']!='not-run'),'total':len(rows),
     'needsRepair':sum(1 for r in rows if r['status']=='needs-repair'),'passed':sum(1 for r in rows if r['status']=='passed'),
     'issueCount':sum(len(r['issues']) for r in rows)}
open('_283_issues.json','w',encoding='utf-8').write(json.dumps(out,ensure_ascii=False,indent=1))
print(json.dumps({k:v for k,v in out.items() if k!='groups'},ensure_ascii=False))
for r in rows:
    print(r['batchId'],r['status'],len(r['issues']))
