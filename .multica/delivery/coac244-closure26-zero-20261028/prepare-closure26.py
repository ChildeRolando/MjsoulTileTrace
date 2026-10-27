from pathlib import Path
import json,hashlib,shutil,datetime,subprocess
from PIL import Image
R=Path('E:/AgentData/Coach/knowledge/processing')
O=Path('.multica/delivery/coac244-closure26-zero-20261028');O.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def dump(n,obj): (O/n).write_bytes((json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode())
def bind(p):
 p=Path(p);p=p if p.is_absolute() else R/p
 return {'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}
def issues(a):return (a.get('effectiveModelReview') or a.get('modelReview') or {}).get('issues',[])
master=R/'integration/coac250-unified-chapter-register-20261027b.json';m=load(master);baseSha=sha(master)
remaining=[x for x in m['rows'] if not x['covered']]
assert len(remaining)==26
plans={
'79-cn-chapter-109-4':('image-unknown','COAC-248','复用最新同源修订和父审；b0004/b0006的5m读法与b0012三处未明牌分开，后者取更清晰同源图或定位审证；不得仅修已知两牌就放行。'),
'79-cn-chapter-159-9':('image-unknown','COAC-248','b0013上方牌河第4张倒置万子，先绑定原图+方位邻牌取得可判读输入；仅该点目标审，不整章重制。'),
'79-cn-chapter-167-4':('image-unknown','COAC-248','b0005先保留7p立直宣言牌方向修订目标，另将南家第5行第3列万子未明点数定位补证；两项均闭合后再独审。'),
'79-cn-chapter-182-5':('source-text-ambiguity','COAC-248','b0003日文格言可定点翻译，但b0013“对日”在原HTML与PDF183一致；需最小上游原句校勘，现不猜对应行为、不为单一格言花整章调用。'),
'79-cn-chapter-193-4':('source-recovered-plus-image','COAC-247/248','已从PDF193/b6找回两面听牌及三分之二两句并有同页passed父稿；走有来源标识的PDF补缺/混合装配，原网页source不改。b0042右家万子仍需图证，补源不等于章通过。'),
'79-cn-chapter-201-6':('text-and-image-repair','COAC-248','先复用已有rev1及独审差异；b0006比喻翻译与b0005北家9m各有原定位，限定同源目标，不覆盖其它正文。'),
'79-cn-chapter-208-4':('image-unknown','COAC-248','b0004倒置万子及b0006 A/B/C三牌分点证据包；附件配对说明可机械修但不代替牌码独审。'),
'79-cn-chapter-215-4':('pdf-shared-page-boundary','COAC-247/250','215/216已过；先核p217跨章ownedSourceBlockIds，仅对本章贡献验收/装配。不要把同页归属217章的牌图结论自动套本章，也不能未核归属直接视为全章通过。'),
'79-cn-chapter-217-4':('image-conflict','COAC-248','网页b0004/b0010未明万子与PDFp217单牌证据分别记录；本轮p217北家第二行首张5m/6m包仅诊断，rev5隔离，已有同SHA旧独审不整页再审。'),
'79-cn-chapter-222-5':('image-conflict','COAC-248/249','b0018例5第6张1m/2m，两版独审对同源像素结论相反；本轮原图+邻牌+箭头包只用于有新增输入的单点裁决，不重审同SHA全章。'),
'79-cn-chapter-234-12':('transport-count-unknown','COAC-269','旧生产ba432ee3超时且rawLastMessage=null，完整raw无可恢复输出；上游请求数/usage未知。先明确观测边界和追加授权，最小仅b0003三个俗称，无图，不自动重试。'),
'79-cn-chapter-242-3':('image-unknown','COAC-248','b0014牌河?m为教学明牌；从绑定原图取得清晰点数，保持未知，不以修附件编号替代语义闭合。'),
'79-cn-chapter-256-18':('image-unknown','COAC-248','使用最新r1 56ea08c0及其真实独审，定位b0016两张仍未明牌；8s建议只作审证定位，未明项未闭合不重派全章。'),
'79-cn-chapter-276-4':('existing-authorized-in-flight','COAC-248','根已恢复现有run 01a17e99-7230-73f7-99ba-62fb9efb1544，仅1制作+1独审余2调用；本轮不派、不重试、不抢槽。'),
'79-cn-chapter-311-18':('complex-figure-and-text','COAC-248','按原独审逐target/group生成有限补丁和shared-premise闭包，保留题库225块原顺序；先核当前修订/失败ledger，不整章从头再制。'),
'nemata-jp-chapter-001-64':('metadata-cover-uncertainty','COAC-247','p1-3正文/作者书评不降为导航；现阻断是封面微字/牌面。先复用已有同源封面资产/高分辨率版，p2-b61接p3-b23保持；只有明确接受条件变化才由用户裁定封面边缘信息范围。'),
'nemata-jp-chapter-100-1':('audit-context-gap','COAC-249','定义A/B在同源b0004..b0036已有且候选已译；对含b0040/b0056/b0065的原审组补hash绑定上下文。原production plan/raw不改，需先有审核上下文补充入口证明，再最多1组独审，不重制311块。'),
'nemata-jp-chapter-183-1':('text-target-ready','COAC-269','采用candidate绑定source.v2.json（19文字/0图），b0018忠实保留原条件并显式校注4%=4%、2%<3%及“见1张”口径未定；1制作+1target-text独审，uncertain仍由独审裁决，非主控消除。'),
'nemata-jp-chapter-193-1':('image-and-terminology','COAC-248','与79-cn-193不同：b0080末三张6p/8p、右手第4-6张未明牌；b0081“入り目”需同作者原语境。补文术语不替代三张图证。'),
'nemata-jp-chapter-213-1':('image-and-terminology','COAC-248','b0017入り目条件限定与b0032左家7p分别定点；对家字牌/两家点数未知仍需源图补证，不能由牌理推。'),
'nemata-jp-chapter-224-1':('chart-quantitative-repair','COAC-248','b0013保留7系列x15巡图，原轴坐标可机械形成空表；读数需明确约值与误差，图例自摸译名定点修，不把相关率或曲线走向替代105格定量独审。'),
'nemata-jp-chapter-232-1':('text-and-image-repair','COAC-248','b0002確和了、b0004や并列可文字定修；b0005手牌3s/2s及右家万子未明分别带图审，不能只修文字放行。'),
'nemata-jp-chapter-236-1':('text-target-ready','COAC-269','b0003删未经原文支持的“剩余”限定，保留中性巡数并加明确校注原时点未明；全文4块无图，1制作+1target-text独审，保留uncertain直到真实裁决。'),
'nemata-jp-chapter-250-1':('pdf-image-and-flow-hold','COAC-247/248','复用11页真实passed，只处理p257与p261；p257旧主控像素断言不作裁决，p261查现有完整raw/布局验证后限定修复，不重开258或13页整制。'),
'nemata-jp-chapter-283-1':('structure-counterevidence-plus-source-gap','COAC-248/249','94牌块tableContext已逐格存在，不能重复“补坐标”；6组空格/箭头需真实渲染顺序核验。Q8外链场况和b0168宝牌/四索条件另列，不把389历史errors当389生产任务。'),
'nemata-jp-chapter-317-51':('metadata-translation-and-cover','COAC-247','b5“暂定版”性质可文字修，封面微字/署名浊点仍unknown；正文说明不降级导航，保留链接及原页源顺序，先取同源清晰封面再有限审。')}
assert set(plans)=={x['chapterId'] for x in remaining}
rows=[]
for x in remaining:
 cat,owner,nxt=plans[x['chapterId']];c=x.get('existingCandidate');a=load(R/c['auditPath']) if c else None
 evidence=[];variants=[]
 if c:
  evidence=[bind(c['path']),bind(c['auditPath'])];p=load(R/c['path']);evidence.append(bind(p['source']['sourcePath']))
  folder=(R/c['path']).parent;article=p['source']['articleId']
  for f in folder.glob(article+'*.json'):
   h=sha(f);audits=[]
   for ap in (R/'audit/web/articles'/p['source']['sourceId']).glob(article+'.'+h+'*.json'):
    av=load(ap);audits.append({'path':str(ap),'sha256':sha(ap),'status':av['status'],'blockingIssues':[i for i in issues(av) if i['severity']!='source-note']})
   variants.append({'path':str(f),'sha256':h,'audits':audits,'notAutomaticallySelected':True})
 row={'chapterId':x['chapterId'],'covered':False,'baseVerdictPreserved':x['verdict'],'category':cat,'owner':owner,'nextAction':nxt,'baseEvidence':evidence,'blockingIssues':issues(a) if a else [],'existingVariants':variants,'pdfBoundary':x.get('pdfRoute'),'modelCallsThisStage':0}
 rows.append(row)
register={'schema':'coac244-canonical-closure-register/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'modelCalls':0,'baseline':{'master':bind(master),'coverage':bind(R/'integration/coac250-157-coverage-20261028.json'),'originalCoveredChapters':230,'originalCoveredUnits':262,'remainingOriginalChapters':26,'formalActiveChanged':False},'rows':rows,'warning':'Coverage/statuses are preserved, this is a closure plan not new semantic acceptance. Full canonical IDs prevent Chinese/Japanese193 and PDF page217 ownership conflation.'}
dump('remaining26-register.json',register)
# Ready text batch: original uncertainty is never recategorized as error.
jobs=[]
for chapter in ['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1']:
 x=next(x for x in remaining if x['chapterId']==chapter);c=x['existingCandidate'];p=load(R/c['path']);s=load(R/p['source']['sourcePath']);a=load(R/c['auditPath']);target=issues(a)[0]['targetId'];num=chapter.split('-')[-2]
 argv=['node',str(R/'audit/runtimes/coac244-vision-terra-max-v1-20261027/textbook-production-web.mjs'),'--source',p['source']['sourcePath'],'--revision-from',c['path'],'--revision-notes',c['auditPath'],'--dictionary',p['provenance']['dictionary']['path'],'--variant','coac244closure'+num,'--preflight-only']
 pre=subprocess.run(argv,capture_output=True,encoding='utf-8');assert pre.returncode==0,pre.stderr
 jobs.append({'chapterId':chapter,'source':bind(p['source']['sourcePath']),'parent':bind(c['path']),'parentAudit':bind(c['auditPath']),'parentCalls':a.get('calls'),'targetIds':[target],'sourceAndCandidateContext':[{'source':b,'candidate':[q for q in p['body']['blocks'] if b['id'] in q.get('sourceBlockIds',[])]} for b in s['blocks']],'originalIssues':issues(a),'revisionGoal':plans[chapter][2],'preflight':json.loads(pre.stdout),'preflightCommand':argv,'productionCommandAfterApproval':argv[:-1],'independentPath':'auditWebCandidate -> independent-target-text-review-plus-unchanged-parent-audit; source/parent/raw/uncertain and target completeness remain checked','budget':{'production':1,'firstIndependentReview':1,'failedVoidCount':True,'automaticRetry':0},'model':'gpt-6.1-sol','reasoningEffort':'high','images':0,'notDispatched':True})
dump('text-batch-183-236.json',{'schema':'coac244-proposed-text-batch/1','modelCalls':0,'requiresNextBatchAuthorization':True,'maximumFutureNewCalls':4,'jobs':jobs})
# 100: exact already-existing A/B premises, no production plan edits.
x=next(x for x in remaining if x['chapterId']=='nemata-jp-chapter-100-1');p=load(R/x['existingCandidate']['path']);s=load(R/p['source']['sourcePath']);plan=load(R/p['provenance']['batches']['planPath'])
ids=[b['id'] for b in s['blocks'] if b['type']=='text' and (int(b['id'].split(':b')[-1])<=41 or b['id'].endswith(('b0056','b0065')))]
dump('100-shared-premises.json',{'chapterId':x['chapterId'],'source':bind(p['source']['sourcePath']),'parent':bind(x['existingCandidate']['path']),'audit':bind(x['existingCandidate']['auditPath']),'productionPlan':bind(p['provenance']['batches']['planPath']),'affectedGroups':[g for g in plan['groups'] if any(i in g['sourceBlockIds'] for i in [s['sourceId']+':'+s['articleId']+':'+t for t in ['b0040','b0056','b0065']])],'sourceAndTranslation':[{'source':b,'candidate':[q for q in p['body']['blocks'] if b['id'] in q.get('sourceBlockIds',[])]} for b in s['blocks'] if b['id'] in ids],'next':'Bind b0004/b0005/b0010/b0019/b0031/b0036 as shared premises in independent audit input. Existing production plan/raw unchanged. Frozen current reviewer has no arbitrary context override: explicit hash-bound audit-context compatibility is needed before one new target/group review. No 311-block reproduction.','futureMaximumCalls':1,'modelCalls':0})
# 193 missing web source is present in a passed PDF parent.
page=load(R/'79-cn/pages/193.json');sourceBlock=next(b for b in page['blocks'] if b['id']=='79-cn-p193-b6');passed=[]
for ap in (R/'audit/pages/79-cn').glob('page-0193*.json'):
 a=load(ap)
 if a['status'].startswith('passed'):
  c=load(a['production']['path']);passed.append({'receipt':bind(ap),'candidate':bind(a['production']['path']),'originalCalls':a.get('calls'),'matchedCandidateBlocks':[b for b in c['body']['blocks'] if '79-cn-p193-b6' in b.get('sourceBlockIds',[])]})
quotes=[{'text':l['text'],'bbox':l['bbox'],'lineIndex':i} for i,l in enumerate(sourceBlock['lines']) if '最应该警戒' in l['text'] or '三分之二' in l['text']]
assert len(quotes)==2 and passed
dump('193-recovered-source.json',{'chapterId':'79-cn-chapter-193-4','webSource':bind('web-sources/v1/79-bilibili-cn/articles/cv1765377/source.json'),'pdfPageSource':bind('79-cn/pages/193.json'),'pdfSha256':page['sourceSha256'],'sourceBlockId':sourceBlock['id'],'quotes':quotes,'passedParents':passed,'nextAction':'Use explicit PDF-version supplement/mixed assembly with attribution and these exact line bindings; do not silently edit original web source/raw. New semantic call unnecessary for byte-identical already-passed PDF contribution; b0042 image uncertainty remains separate.','modelCalls':0})
# Two real-image packets, nearest-neighbor derivatives only; not a verdict.
def imagepack(name,source,roi,focus,metadata):
 d=O/name;d.mkdir(exist_ok=True);src=R/source;im=Image.open(src);im.load();shutil.copyfile(src,d/'original.png')
 records=[]
 for kind,box in [('context',roi),('target',focus)]:
  crop=im.crop(box);crop.save(d/(kind+'.png'));crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST).save(d/(kind+'-x4.png'))
  assert list(Image.open(d/(kind+'-x4.png')).resize(crop.size,Image.Resampling.NEAREST).getdata())==list(crop.getdata())
  records.append({'role':kind,'originalPixelBBox':box,'crop':bind((d/(kind+'.png')).resolve()),'enlargement':bind((d/(kind+'-x4.png')).resolve()),'scale':4,'resampling':'nearest','generatedDetails':False})
 packet={'schema':'coac244-single-target-image-evidence/1','status':'prepared-not-adjudicated','modelCalls':0,'original':bind(src),'width':im.width,'height':im.height,'derivatives':records,**metadata};(d/'packet.json').write_bytes((json.dumps(packet,ensure_ascii=False,indent=2)+'\n').encode());return packet
aud222=[]
for ap in (R/'audit/web/articles/79-bilibili-cn').glob('cv1775262*.json'):
 a=load(ap);aud222.append({'receipt':bind(ap),'production':a['production'],'status':a['status'],'issues':issues(a),'callIds':[c['callId'] for c in a.get('calls',[])]})
src222=load(R/'web-sources/v1/79-bilibili-cn/articles/cv1775262/source.json');near222=[b for b in src222['blocks'] if b['id'].endswith(('b0017','b0018','b0019'))]
pa=imagepack('image-222-sixth-tile','web-sources/v1/79-bilibili-cn/assets/d2274e920d3d4ce0bf95992da486067edfb14c13ccd227529a050faa0542e7cf.png',[142,0,223,74],[170,28,196,65],{'chapterId':'79-cn-chapter-222-5','targetId':'79-bilibili-cn:cv1775262:b0018:figure','locator':'例5第6张，5m之后、北之前，第一支向下箭头下；记录1m/2m冲突，主控不裁决','source':bind('web-sources/v1/79-bilibili-cn/articles/cv1775262/source.json'),'neighboringSource':near222,'existingIndependentAudits':aud222,'sameCandidateFullReauditAllowed':False,'newEvidenceScope':'same original pixels with a source-bound single-target crop/adjacent arrows; at most one explicitly authorized target adjudication, not an entire-candidate repeat','futureMaximumTargetReviewCalls':1})
aud217=[]
for ap in (R/'audit/pages/79-cn').glob('page-0217*.json'):
 a=load(ap);aud217.append({'receipt':bind(ap),'production':a['production'],'status':a['status'],'issues':issues(a),'callIds':[c['callId'] for c in a.get('calls',[])]})
page217=load(R/'79-cn/pages/217.json')
pb=imagepack('image-p217-north-second-row','assets/64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978.png',[143,292,202,358],[150,325,175,357],{'chapterId':'79-cn-chapter-217-4','sharedPageOtherChapter':'79-cn-chapter-215-4 (must use ownership subset, not this figure automatically)','targetId':'79-cn-p217-r1','locator':'下方北家舍牌第二行第一张万子，左邻/上邻牌保留；旧独审存在5m/6m读法差异，不裁决','source':bind('79-cn/pages/217.json'),'pdfSha256':page217['sourceSha256'],'fullPage':bind('production/sol-high-fallback-finite-20261024-schemafix/renders/79-cn/page-0217.png'),'sourceImageBlockId':'79-cn-p217-b8','neighboringSource':[b for b in page217['blocks'] if b['type']=='text' and b['id'] in ['79-cn-p217-b5','79-cn-p217-b6','79-cn-p217-b7']],'existingIndependentAudits':aud217,'quarantinedDraft':bind('production/sol-high-field-repair26-20261027-p217e/candidates/79-cn/page-0217.json'),'quarantinedDraftMayBeSelected':False,'sameCandidateFullReauditAllowed':False,'futureMaximumTargetReviewCalls':1})
dump('image-packets-index.json',{'modelCalls':0,'targetCount':2,'packets':[pa,pb],'futureBudget':{'maxIndependentTargetReviews':2,'newProduction':0,'automaticRetry':0,'phase':'proposal only, not dispatched','minimumFirstBatch':'222 single target only, max1; p217 separate max1 after checking existing source-adjudication ledger'}})
# 234 transport result: one local process is observable; upstream retries/cost are not.
raw=R/'web-production/v1/raw-calls/ba432ee3-0d28-42b9-ad34-cde09c97313e.json';rv=load(raw)
ledger=[json.loads(l) for l in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()];calls=[c for c in ledger if c['callId']==rv['callId']];assert len(calls)==1
trace=Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-269-2e6698c50769/codex-home/sessions/2026/10/28/rollout-2026-10-28T01-17-28-01a17e5d-de92-75a1-8aa9-62c049d6cc68.jsonl')
traceHits=[]
for i,line in enumerate(trace.read_text(encoding='utf-8').splitlines()):
 if any(k in line for k in ['ba432ee3','01a17e66-b9fa-7be2-a9bd-0813aa7ba763']):
  obj=json.loads(line);traceHits.append({'line':i+1,'timestamp':obj.get('timestamp'),'type':obj.get('type'),'sha256':hashlib.sha256(line.encode()).hexdigest()})
existing=list((R/'web-production/v1/candidates/79-bilibili-cn').glob('cv1780400*.json'));complete=rv.get('rawLastMessage') is not None and any(e['type']=='turn.completed' for e in rv.get('events',[]))
assert not complete and not (R/'web-production/v1/candidates/79-bilibili-cn/cv1780400.coac244inline20261027.json').exists()
dump('234-recovery-and-count-boundary.json',{'chapterId':'79-cn-chapter-234-12','raw':bind(raw),'localLedgerRows':calls,'dispatchFinished':load(R/'web-production/v1/runs/coac244-inline-japanese-20261027/chapter-234/dispatch-finished.json'),'events':rv['events'],'rawLastMessage':rv['rawLastMessage'],'usage':rv['usage'],'rawStdout':rv['rawStdout'],'stderr':rv['stderr'],'existingCandidates':[bind(p) for p in existing],'trace':{'binding':bind(trace),'hits':traceHits,'fullTraceNotPublished':True,'reason':'root-agent transcript is not a provider request log'},'recovery':{'completeRaw':False,'recoverableCandidate':False,'conclusion':'Preserved complete capture contains no final message, turn.completed, usage or candidate. Root transcript contains observations, not a hidden successful response.'},'countBoundary':{'observableLocalProductionInvocations':1,'logicalThreadsObserved':1,'retryNotices':2,'retryNoticeLabels':['2/5','3/5'],'upstreamHTTPRequests':None,'upstreamExecutedGenerations':None,'actualServerCost':None,'doNotInferThreeOrFiveCalls':True},'nextMinimumRequest':{'scope':'only cv1780400:b0003, three Japanese labels with whole Chinese paragraph + bound parent; images:[]','newProductionAllowanceNeeded':1,'existingUnusedFirstAuditAllowance':1,'futureMaximumLocalCalls':2,'priorBatchObservedCalls':3,'observedTotalAfterThisProposalMaximum':5,'automaticRetry':0,'currentlyAuthorizedNewRetry':False,'limitation':'Current CLI does not expose acknowledged upstream attempt IDs. One local invocation cannot prove one upstream generation. Before a hard remote-call cap can be accepted, require transport/server request-id/attempt records; no model/provider/gateway settings changed here.'},'modelCallsThisStage':0})
# Publish a scoped continuation overlay in the EXISTING continuation register, no coverage mutation.
continuation=R/'integration/coac250-uncovered-chapter-continuation-register-20261027b.json';old=continuation.read_bytes();cj=json.loads(old);byid={x['chapterId']:x for x in rows};matched=0
for row in cj['rows']:
 if row['chapterId'] in byid:
  planrow=byid[row['chapterId']];row['closurePlan']={k:planrow[k] for k in ['category','owner','nextAction','modelCallsThisStage']};row['closurePlan']['evidenceRegister']='integration/coac244-remaining26-closure-register-20261028.json';matched+=1
assert matched==26
backup=O/'continuation-register-before.json';backup.write_bytes(old)
assert continuation.read_bytes()==old,'concurrent continuation update; re-read before publishing'
continuation.write_bytes((json.dumps(cj,ensure_ascii=False,indent=2)+'\n').encode())
published=R/'integration/coac244-remaining26-closure-register-20261028.json';published.write_bytes((O/'remaining26-register.json').read_bytes())
dump('register-update-receipt.json',{'existingContinuationPath':str(continuation),'beforeSha256':hashlib.sha256(old).hexdigest(),'afterSha256':sha(continuation),'updatedCanonicalRows':matched,'coveredRowsChanged':0,'masterRegisterUnchanged':sha(master)==baseSha,'masterBeforeSha256':baseSha,'masterAfterSha256':sha(master),'modelCalls':0})
(O/'.gitattributes').write_bytes(b'* -text\n')
print(json.dumps({'rows':len(rows),'textJobs':[j['chapterId'] for j in jobs],'imageTargets':2,'sourceRecovery':'79-cn-193 PDF193/b6 passed parent','updatedContinuationRows':matched,'modelCalls':0},ensure_ascii=False))
