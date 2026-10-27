from pathlib import Path
import json,hashlib,shutil
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path('.multica/delivery/coac244-closure26-zero-20261028');load=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
p=R/'web-production/v1/candidates/79-bilibili-cn/cv1793434.r2.display.json';h=sha(p);ap=R/f'audit/web/articles/79-bilibili-cn/cv1793434.{h}.json';a=load(ap);candidate=load(p)
v={'path':str(p),'sha256':h,'audits':[{'path':str(ap),'sha256':sha(ap),'status':a['status'],'blockingIssues':[i for i in a['modelReview']['issues'] if i['severity']!='source-note']}],'notAutomaticallySelected':True}
action='既有276阶段已完成1制作+1首审，余2额度已用尽；r2 94b2d56a独审needs-repair，不再派。b0005四个风牌未明须源图补证；b0014/b0025先零模型补齐真实父审逐牌回执，不能把复用身份直接当转录证明，也不因上下文缺口盲目再审。'
j=load(O/'remaining26-register.json');row=next(r for r in j['rows'] if r['chapterId']=='79-cn-chapter-276-4');row['category']='existing-authorized-budget-exhausted';row['nextAction']=action;row['latestObservedTerminal']=v
if not any(x['sha256']==h for x in row['existingVariants']):row['existingVariants'].append(v)
row['remainingCallsInExistingStage']=0
(O/'remaining26-register.json').write_bytes((json.dumps(j,ensure_ascii=False,indent=2)+'\n').encode());(R/'integration/coac244-remaining26-closure-register-20261028.json').write_bytes((O/'remaining26-register.json').read_bytes())
cp=R/'integration/coac250-uncovered-chapter-continuation-register-20261027b.json';cj=load(cp)
for r in cj['rows']:
 if r['chapterId']==row['chapterId']:r['closurePlan']['category']=row['category'];r['closurePlan']['nextAction']=action
cp.write_bytes((json.dumps(cj,ensure_ascii=False,indent=2)+'\n').encode());update=load(O/'register-update-receipt.json');update['afterSha256']=sha(cp);(O/'register-update-receipt.json').write_bytes((json.dumps(update,indent=2)+'\n').encode())
summary=load(O/'stage-summary.json');summary['A276']={'status':a['status'],'candidateSha256':h,'auditSha256':sha(ap),'productionCallIds':[c['callId'] for c in candidate['provenance']['attempts']],'auditCallIds':[c['callId'] for c in a['calls']],'existingAuthorizedCallsUsed':2,'remaining':0,'thisCoordinatorNewCalls':0,'automaticRetry':False};summary['registerUpdate']=update;(O/'stage-summary.json').write_bytes((json.dumps(summary,ensure_ascii=False,indent=2)+'\n').encode())
shutil.copyfile(ap,O/'276-observed-existing-audit.json');shutil.copyfile('refresh-276-result.py',O/'refresh-276-result.py')
print(json.dumps(summary['A276']))
