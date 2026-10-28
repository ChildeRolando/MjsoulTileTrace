from pathlib import Path
import json, hashlib, copy, subprocess
from PIL import Image
from datetime import datetime, timezone

P=Path('E:/AgentData/Coach/knowledge/processing'); O=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
J=lambda p:json.loads(Path(p).read_bytes())
def save(n,x): (O/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def ref(p):
 p=Path(p); b=p.read_bytes(); return {'path':str(p),'sha256':H(b),'bytes':len(b)}
def verify(r):
 assert H(Path(r['path']).read_bytes())==r['sha256'],r['path']; return J(r['path'])
checks=[]
def check(n,v):
 assert v,n;checks.append({'name':n,'passed':True})

# Capture rather than edit concurrent COAC-250 registers/pointers.
master=P/'integration/coac250-unified-chapter-register-20261027b.json'
mb=master.read_bytes();d=json.loads(mb);(O/'master-readonly-snapshot.json').write_bytes(mb)
remaining=[r for r in d['rows'] if not r['covered']]
check('remaining canonical count matches current master',len(remaining)==d['counts']['effectiveUncoveredOriginalChapters'])
closures=J(P/'integration/coac244-remaining26-closure-register-20261028.json')
byid={r['chapterId']:r for r in closures['rows']}; rows=[]
for r in remaining:
 ec=r.get('existingCandidate'); material=[];issues=[]
 if ec:
  for label,key in [('candidate','path'),('audit','auditPath')]:
   if ec.get(key):
    path=P/ec[key];material.append({'role':label,**ref(path)})
    if label=='candidate':check(r['chapterId']+' registered candidate SHA',material[-1]['sha256']==ec['sha256'])
    if label=='audit':
     a=J(path);issues=copy.deepcopy(a.get('modelReview',{}).get('issues',[]))
     for batch in a.get('batchReviews',[]):issues+=copy.deepcopy(batch.get('modelReview',{}).get('issues',[]))
 cp=byid.get(r['chapterId'],{})
 nextstep=cp.get('nextAction','沿现有源/候选/原独审，先按下列精确原问题核复用/修订白名单；未授权模型，不从头重制。')
 if r['chapterId']=='79-cn-chapter-234-12':nextstep='旧900秒超时无完整最终输出，底层重连后上游执行次数未知；保持原失败账，先补传输可观测计数边界，不自动retry。'
 if r['chapterId']=='nemata-jp-chapter-001-64':nextstep='封面组合补证由当前249现有运行核验；保留六处unknown与非核心限定，实际确定转录撤销的精确字段沿246原链，不重复识字。'
 if r['chapterId']=='nemata-jp-chapter-283-1':nextstep='以本次精确b1017通过链解除该项；复杂5条见complex-original/five-issue-map.json。b0947复用旧目标独审后合法装配0call；b0785仅中央东/西方位待修，提案1maker+1靶审，当前不派。'
 rows.append({'canonical':r['chapterId'],'title':r['title'],'verdict':r['verdict'],'materials':material,'registeredCandidate':ec,'pdfRoute':r['pdfRoute'],'gap':r['gaps'],'originalAuditIssuesPreserved':issues,'nextStep':nextstep,'newCallsAuthorizedThisRecovery':0})
save('remaining-canonical-register.json',{'schema':'coac244-readonly-recovery-register/1','recordedAt':datetime.now(timezone.utc).isoformat(),'master':{'path':str(master),'sha256':H(mb)},'counts':d['counts'],'display':d['display'],'canonicalCount':len(rows),'rows':rows,'note':'原始register历史候选不等于最新分支；本文件列原证据并明确下方283覆盖状态。共享register/集成指针未写入。'})

r=J(P/'integration/coac249-283-1017-r2-reviewed-20261028.json')
c=verify(r['candidate']);parent=verify(r['parent']);a=verify(r['audit']);rt=verify(r['runtime'])
for f in rt['files']:check('frozen dependency '+Path(f['path']).name,H(Path(f['path']).read_bytes())==f['sha256'])
cp=verify(r['results'][0]['checkpoint']);raw=verify(r['results'][0]['raw'])
check('b1017 raw exact independent checkpoint output',json.loads(raw['rawLastMessage'])==raw['output']==cp['modelReview'])
check('b1017 target faithful no issues',cp['status']=='passed' and cp['modelReview']['issues']==[] and cp['modelReview']['completeTargetScopeCompared'] and cp['modelReview']['contextContinuity']['faithful'])
changed=[i for i,(x,y) in enumerate(zip(parent['body']['blocks'],c['body']['blocks'])) if x!=y]
check('1195 blocks exactly one changed',len(c['body']['blocks'])==1195 and len(parent['body']['blocks'])==1195 and len(changed)==1)
i=changed[0];old=parent['body']['blocks'][i];new=c['body']['blocks'][i]
check('only approved b1017 parenthesis deleted',new['sourceBlockIds']==['modern-yabejp-ja:chapter06-exercise003:b1017'] and new['text']==old['text'].replace('（小三元／大三元）',''))
restored=copy.deepcopy(new);restored['text']=old['text'];check('all b1017 nontext fields exact',restored==old)
check('524 full figure objects unchanged',len(c['figures'])==524 and c['figures']==parent['figures'])
ex=raw['requestExecution'];check('actual terra max 11 image payload',ex['model']=='gpt-6.1-terra' and ex['reasoningEffort']=='max' and len(ex['images'])==11)
for image in ex['images']:
 path=Path(image['path']);check('actual image '+path.name,H(path.read_bytes())==image['sha256'])
check('new aggregate is still needs-repair',a['status']=='needs-repair')
# Git commit names in the recovery instruction are verified against their tracked artifacts.
git_result=json.loads(subprocess.run(['git','show','d7a3602:artifacts/a249-1017-r2/result.json'],capture_output=True,check=True).stdout)
check('d7a3602 audit result equals shared original',git_result==r)
producer_result=J(P/'web-production/v1/runs/coac269-283-1017-v2-20261028/result.json')
check('02d2f27 linked maker handoff candidate SHA',producer_result['candidate']['sha256']==r['candidate']['sha256'])
git_handoff=json.loads(subprocess.run(['git','show','02d2f27:.multica/delivery/coac-269-web-revision-b-20261027/artifacts/b23-1017/handoff-started.json'],capture_output=True,check=True).stdout)
save('b1017-commit-handoff.json',git_handoff)
save('b1017-exact-closure.json',{'canonical':r['chapterId'],'candidate':r['candidate'],'source':r['source'],'parent':r['parent'],'independent':r['results'][0],'runtime':r['runtime'],'auditCommit':'d7a3602','makerHandoffCommit':'02d2f27','onlyTextDeleted':'（小三元／大三元）','unchangedBlocks':1194,'unchangedCompleteFigures':524,'aggregateStatusPreserved':a['status'],'wholeChapterAccepted':False,'oldAuditAndRawModified':False,'newCalls':0})
oldreg=J(P/'integration/coac244-283-10171181-recorded-20261028/effective-issue-register.json')
effective=copy.deepcopy(oldreg)
for item in effective['issues']:
 if item['originalIssue']['targetId'].endswith(':b1017'):
  item['status']='resolved-by-independent-target-checkpoint';item['evidence']=r['results'][0]
effective.update({'latestCandidate':r['candidate'],'b1017ExactClosure':r['results'][0],'activeLegacyComplexIssues':J(O/'complex-original/five-issue-map.json'),'effectiveLegacyBlockers':5,'sourceNoteCount':2,'nextOperationalRepair':'b0785 donor central east/west seat reversal only; b0947 exact reviewed donor assembly needs no model','countsWarning':'5为主分支尚未装配的原问题，非5个需要重新识字的任务。旧rev2已有独立证据；只在精确装配后解除当前对应项。','wholeChapterAccepted':False,'newModelCalls':0})
effective['historicalCountsBeforeRecovery']=effective['counts']
effective['counts']={'originalIssues':19,'resolved':12,'remainingBlocking':5,'sourceNotes':2,'originalDeferred':16,'effectiveDeferredResolved':11,'effectiveDeferredOpen':5,'currentTargetErrorsOutsideDeferred':0}
effective['classification']={'domTableGeometry':0,'semanticConditionOrFigureTranscription':3,'criticalUnknownFigure':2,'sourceNotes':2}
effective['historicalDeferredBeforeRecovery']=effective.pop('deferredCurrent')
effective['latestAggregate']=r['audit']
for item in effective['deferred']:
 if item.get('targetId','').endswith(':b1017'):
  item['effectiveStatus']='resolved-by-independent-target-checkpoint';item['supplement']=r['results'][0]
save('283-effective-issue-register.json',effective)
# Per-block and full-figure hashes prove exact scope inheritance without editing old receipts.
digest=lambda v:H(json.dumps(v,ensure_ascii=False,separators=(',',':')).encode())
save('283-content-hashes.json',{'canonical':r['chapterId'],'candidate':r['candidate'],'parent':r['parent'],'blocks':[{'sourceBlockIds':b['sourceBlockIds'],'sha256':digest(b),'parentSha256':digest(parent['body']['blocks'][i]),'unchanged':b==parent['body']['blocks'][i]} for i,b in enumerate(c['body']['blocks'])],'figures':[{'sourceBlockIds':f['sourceBlockIds'],'sha256':digest(f),'parentSha256':digest(parent['figures'][i]),'unchanged':f==parent['figures'][i]} for i,f in enumerate(c['figures'])]})
for key in ['b0785','b0947']:
 packet=J(O/('complex-original/'+key+'-packet.json'))
 check(key+' current scope pin',packet['current']=={**r['candidate'],'bytes':Path(r['candidate']['path']).stat().st_size})
 for image in packet['originalImagesAndDerivedViews']:
  check(key+' original/derived image SHA '+Path(image['path']).name,H(Path(image['path']).read_bytes())==image['sha256'])
 original=Image.open(packet['originalImagesAndDerivedViews'][0]['path']).convert('RGBA')
 for image in packet['originalImagesAndDerivedViews']:
  if 'nearest' not in image['role']:continue
  actual=Image.open(image['path']).convert('RGBA'); base=original.crop(tuple(image['bbox'])) if 'bbox' in image else original
  check(key+' nearest pixels '+image['role'],actual.tobytes()==base.resize(actual.size,Image.Resampling.NEAREST).tobytes())
 cm={b['sourceBlockIds'][0]:b for b in c['body']['blocks']}
 check(key+' exact ordered full question and definitions',all(cm[pair['source']['id']]==pair['candidate'] for pair in packet['orderedSourceCandidatePairs']))
check('five historical issue identities preserved',len(J(O/'complex-original/five-issue-map.json'))==5)
preview=Path(d['display']['previewOutput'])
evidence=[]
for n in ['accepted-preview-receipt.json','mcp-validation.json','arena-validation.json']:
 f=preview/n; proof=J(f);check('same current corpus '+n,proof['corpusId']==d['display']['corpusId']);evidence.append(ref(f));(O/n).write_bytes(f.read_bytes())
check('preview formal active unchanged',J(preview/'accepted-preview-receipt.json')['activeLibraryChanged'] is False)
check('real Arena exact body readback',J(preview/'arena-validation.json')['realStdioMcp'] and J(preview/'arena-validation.json')['exactBody'])
save('parallel250-readonly-proof.json',{'currentRegister':{'path':str(master),'sha256':H(mb)},'corpusId':d['display']['corpusId'],'effectiveCoveredOriginalChapters':d['counts']['effectiveCoveredOriginalChapters'],'effectiveUncoveredOriginalChapters':len(rows),'proofs':evidence,'sharedPointersWrittenBy244':False,'integrationWriter':'existing COAC-250 run; no redispatch'})
save('recovery-verification.json',{'checks':checks,'count':len(checks),'newModelCalls':0,'productionWrites':0,'oldRawWrites':0,'sharedPointerWrites':0,'remainingCanonicalCount':len(rows),'b1017Closed':True,'wholeChapterPassed':False})
print(json.dumps({'checks':len(checks),'remaining':len(rows),'b1017':'passed scoped only','newCalls':0},ensure_ascii=False))
