import pathlib,json,copy,hashlib,shutil,datetime
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent;S=P/'integration/coac244-283-10171181-recorded-20261028'
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
def objsha(x):return sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode())
def bind(p):p=pathlib.Path(p);return dict(path=str(p),sha256=sha(p.read_bytes()),bytes=p.stat().st_size)
def save(p,x):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
v=load(O/'verification.json');h=load(O/'249-results.json');ih=load(O/'249-inheritance.json');oldpath=P/'integration/coac250-283-396962-effective-issues-20261028.json';old=load(oldpath);new=copy.deepcopy(old)
assert old['counts']['remainingBlocking']==7
passed=next(r for r in h['results'] if r['targetId'].endswith(':b1181'));failed=next(r for r in h['results'] if r['targetId'].endswith(':b1017'))
for row in new['issues']:
 assert objsha(row['originalIssue'])==row['originalIssueSha256']
 if row['originalIssue']['targetId']==passed['targetId']:
  assert row['status']=='open';row.update(status='resolved-by-independent-target-checkpoint',evidence=passed['checkpoint'],independentRaw=passed['raw'],callId=passed['call']['callId'],candidate=h['candidate'])
 if row['originalIssue']['targetId']==failed['targetId']:
  assert row['status']=='open';row.update(status='open-new-independent-target-error',evidence=failed['checkpoint'],independentRaw=failed['raw'],callId=failed['call']['callId'],candidate=h['candidate'],effectiveIssue=failed['modelReview']['issues'][0],effectiveIssueSha256=objsha(failed['modelReview']['issues'][0]),historicalAdvicePreserved=True,disposition='旧“三元牌役种”问题及旧建议原样留历史；当前责任是新独立确认括注缩窄范围，删除括注并保留三元役。不能把旧建议当作推翻新审的授权。')
resolved=[r for r in new['issues'] if r['status'].startswith('resolved')]
notes=[r for r in new['issues'] if r['originalIssue']['severity']=='source-note']
blocking=[r for r in new['issues'] if not r['status'].startswith('resolved') and r['originalIssue']['severity']!='source-note']
assert (len(new['issues']),len(resolved),len(blocking),len(notes))==(19,11,6,2)
byhash={r['originalIssueSha256']:r for r in new['issues']}
for row in new['deferred']:
 target=byhash[row['issueSha256']];row['effectiveStatus']=target['status']
 if row['targetId'] in [passed['targetId'],failed['targetId']]:row['supplement']=target['evidence']
 assert objsha(row['originalIssue'])==row['issueSha256']
assert (sum(r['effectiveStatus'].startswith('resolved') for r in new['deferred']),sum(not r['effectiveStatus'].startswith('resolved') for r in new['deferred']))==(10,6)
current=[]
for row in ih['deferredOriginalIssues']:
 x=copy.deepcopy(row);t=byhash[x['issueSha256']];x['effectiveStatus']='resolved-by-existing-independent-supplement' if t['status'].startswith('resolved') else 'open';current.append(x)
assert len(current)==12 and sum(r['effectiveStatus']=='open' for r in current)==5
new.update(schema='coac244-283-effective-issues-after10171181/1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),supersedes=bind(oldpath),latestCandidate=h['candidate'],latestAggregate=h['audit'],scopeInheritance=v['inheritance'],targetCheckpoints=[dict(targetId=r['targetId'],status=r['status'],checkpoint=r['checkpoint'],raw=r['raw']) for r in h['results']],deferredCurrent=current,counts=dict(originalIssues=19,resolved=11,remainingBlocking=6,sourceNotes=2,originalDeferred=16,effectiveDeferredResolved=10,effectiveDeferredOpen=6,newAggregateDeferred=12,newAggregateDeferredResolved=7,newAggregateDeferredOpen=5,currentTargetErrorsOutsideDeferred=1),classification=dict(domTableGeometry=0,semanticConditionOrFigureTranscription=4,criticalUnknownFigure=2,sourceNotes=2),wholeChapterAccepted=False,oldRawOrDeferredModified=False,newModelCalls=0)
save(O/'effective-issue-register.json',new);shutil.copy2(O/'effective-issue-register.json',S/'effective-issue-register.json');eff=bind(S/'effective-issue-register.json')
save(O/'old-effective-issue-register.json',old)
next_action='283当前精确工作稿b90f7c4f，原19问题有效11已补证/6阻断/2source-note；b1181据真实独审236cb892闭合，勿重复制作/复审。b1017独审53722d02确认括注小三元／大三元缩窄范围，仅删除该括注并保留三元役是后续最小修订目标，未改候选；未来需另获maker1+单目标独审1共2调用，当前4/4余0，不自动执行。剩b0785两error+河牌unknown、b0947题问error+两风牌unknown保持；六表/Q8/0168/0396/0962/batch010原证据精确继承，不重审、不合整283、不切active。'
registration=dict(candidate=h['candidate'],source=h['source'],aggregate=h['audit'],targetCheckpoints=new['targetCheckpoints'],scopeInheritance=v['inheritance'],effectiveIssueRegister=eff,counts=new['counts'],classification=new['classification'],wholeChapterAccepted=False,newModelCalls=0,budget=dict(used=4,maximum=4,remaining=0,retry=0),minimum1017RepairGoal=str(S/'1017-repair-goal.json'))
for name in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=P/'integration'/name;before=load(path);after=copy.deepcopy(before);row=next(x for x in after['rows'] if x['chapterId']=='nemata-jp-chapter-283-1')
 row['historicalBefore10171181']={k:copy.deepcopy(row.get(k)) for k in ['blockingIssues','effectiveBlockingIssues','resolvedIssuesWithEvidence','effectiveDeferredFindings','evidenceConvergence','nextAction']}
 row.update(blockingIssues=[r.get('effectiveIssue',r['originalIssue']) for r in blocking],effectiveBlockingIssues=blocking,resolvedIssuesWithEvidence=resolved,effectiveDeferredFindings=current,evidence10171181=registration,nextAction=next_action,sourceNotesPreserved=[r['originalIssue'] for r in notes],wholeChapterPassed=False)
 if name.startswith('coac244-'):
  assert row['covered']==False;row['category']='six-effective-blockers-after-two-target-review';row['modelCallsThisStage']=0
 if 'evidenceConvergence' in row:row['evidenceConvergence'].update(effectiveIssueRegister=eff,candidateSha256=h['candidate']['sha256'],counts=new['counts'],chapterAccepted=False,newModelCalls=0)
 if 'closurePlan'in row:row['closurePlan'].update(category='six-effective-blockers-after-two-target-review',nextAction=next_action,evidenceRegister=eff['path'],modelCallsThisStage=0)
 assert {k:x for k,x in before.items() if k!='rows'}=={k:x for k,x in after.items() if k!='rows'}
 for x,y in zip(before['rows'],after['rows']):
  if x['chapterId']!='nemata-jp-chapter-283-1':assert x==y
 shutil.copy2(path,O/(name+'.before'));assert load(path)==before;save(path,after);shutil.copy2(path,O/(name+'.after'))
# Do not overwrite the250 unified coverage register: this is a partial target receipt, not a new chapter.
u=load(P/'integration/coac250-unified-chapter-register-20261027b.json');assert not next(x for x in u['rows'] if x['chapterId']=='nemata-jp-chapter-283-1')['covered']
for f in v['protectedInputs']:assert bind(f['path'])['sha256']==f['sha256']
save(O/'registration.json',dict(schema='coac244-283-target-outcomes-recorded/1',canonical='nemata-jp-chapter-283-1',**registration,remainingTargets=[dict(issueSha256=r.get('effectiveIssueSha256',r['originalIssueSha256']),targetId=r.get('effectiveIssue',r['originalIssue'])['targetId'],severity=r.get('effectiveIssue',r['originalIssue'])['severity'],description=r.get('effectiveIssue',r['originalIssue'])['description']) for r in blocking],allOtherRegisterRowsAndCountsUnchanged=True,protectedInputsUnchanged=len(v['protectedInputs']),originalCoverage=u['counts'],newProductionCalls=0,newCandidates=0,newConsumers=0,formalActiveChanged=False))
save(O/'handoff.json',dict(schema='coac244-283-10171181-zero-recorded/1',canonical='nemata-jp-chapter-283-1',candidate=h['candidate'],registration=str(S/'registration.json'),effectiveIssues=eff,b1181=passed['checkpoint'],b1017=failed['checkpoint'],remainingBlockers=6,counts=new['counts'],newModelCalls=0,newProductionCalls=0,newCandidates=0,newConsumers=0,noDispatch=True,noWholeChapterIntegration=True,nextAction=next_action))
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
print(json.dumps(dict(counts=new['counts'],classification=new['classification'],protected=len(v['protectedInputs']),newModelCalls=0),ensure_ascii=False))
