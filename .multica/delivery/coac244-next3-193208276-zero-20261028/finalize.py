import copy,hashlib,json,pathlib,shutil
O=pathlib.Path(__file__).resolve().parent;P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');S=P/'integration/coac244-next3-193208276-zero-20261028'
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def bind(p):p=pathlib.Path(p);return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(p,d):pathlib.Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rt=P/'audit/runtimes/coac244-vision-production-schema-v2-20261028';m=load(rt/'runtime-manifest.json')
for f in m['files']:assert bind(rt/f['path'])['sha256']==f['sha256']
save(O/'runtime-reverified.json',dict(manifest=bind(rt/'runtime-manifest.json'),verifiedFiles=len(m['files']),unchanged=True,newModelCalls=0))
for ref in load(O/'protected-inputs.json'):assert bind(ref['path'])==ref
h=load(O/'handoff.json');updates={}
for key in ['193','208','276']:
 d=load(O/(key+'-packet.json'));new=dict(stage='zero-model-source-impact-preparation',candidate=d['candidate'],source=d['source'],audit=d['audit'],packet=bind(O/(key+'-packet.json')),sharedPacket=str(S/(key+'-packet.json')),originalPositions=[dict(id=p['id'],figureId=p['figureId'],bbox=p['bbox'],location=p['location']) for p in d['points']],orderedOriginalAndDerivedImages=len(d['orderedImages']),wholeChapterPassed=False,admissionGranted=False,newModelCalls=0,minimumNextBudgetProposal=dict(maker=0,independentRecognitionAndImpact=1,retry=0,failedVoidCount=True,authorized=False),entry='COAC-249 existing consumer; '+str(S/(key+'-prepared-request.json')))
 if key=='193':new['reusable']='PDF193/b6两句已pass源版本补文已入库，不重复制作；原网页候选/source不改。';next='已备b0042右河第2行右列单点原图394x415/邻位/全文/候选/旧审；尚无独立unknown影响允许。下一提案仅辨识+教学影响独审1call，0maker/0retry，未派。'
 if key=='208':new['reusable']='旧全文/顺序/非目标b0008 faithful；加工附件编号仅source-note。';next='已备b0004上河屏幕最左及b0006左河2/5、右河2z右侧共4点，原PNG446x465/432x461、完整兜牌条件/候选/原审。下一提案四点同一次辨识+影响独审1call，0maker/0retry；未获得独立限定unknown许可、不主控放行。'
 if key=='276':
  new['reusable']=dict(proof=bind(O/'276-inheritance-proof.json'),sharedProof=str(S/'276-inheritance-proof.json'),figures=['79-bilibili-cn:cv1793434:b0014:figure','79-bilibili-cn:cv1793434:b0025:figure'],status='两个父独立faithful及完整图/body相同已补证；原新审uncertain保留，不增加视觉判断。')
  next='旧阶段预算已用尽；最新r2 94b2d56a不重做。b0014/b0025真实父独审raw4ad05d19逐牌faithful和完整图/body精确继承证明已补齐，勿再收费识图；剩b0005四风牌原error，已备500x499原图/邻位/完整攻守条件，下一提案仅辨识+影响独审1call，0maker/0retry，尚未派发。'
 updates[d['canonical']]=(new,next)
for n in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 p=P/'integration'/n;before=load(p);after=copy.deepcopy(before);shutil.copy2(p,O/(n+'.before'))
 for row in after['rows']:
  if row['chapterId'] not in updates:continue
  new,nxt=updates[row['chapterId']];target=row if n.startswith('coac244-') else row['closurePlan'];target['nextAction']=nxt;target['zero193208276Preparation']=new
 # Only the selected rows and two explicit fields can change, including preservation of counts/coverage/old issues.
 for x,y in zip(before['rows'],after['rows']):
  if x['chapterId'] not in updates:assert x==y
  else:
   q=copy.deepcopy(y);z=q if n.startswith('coac244-') else q['closurePlan'];old=x if n.startswith('coac244-') else x['closurePlan'];z.pop('zero193208276Preparation');z['nextAction']=old['nextAction'];assert q==x
 assert {k:v for k,v in before.items() if k!='rows'}=={k:v for k,v in after.items() if k!='rows'}
 save(p,after);shutil.copy2(p,O/n)
ledger=P/'audit/calls.jsonl';rows=[json.loads(x) for x in ledger.read_text(encoding='utf-8-sig').splitlines() if x.strip()]
save(O/'final-verification.json',dict(newModelCalls=0,newCandidates=0,newAcceptedChapters=0,existingRuntimeFilesReverified=len(m['files']),protectedInputsUnchanged=len(load(O/'protected-inputs.json')),requestChecks=len(load(O/'request-preflight-checks.json')['checks']),inheritanceChecks=len(load(O/'276-inheritance-proof.json')['tests']),sameShaAuditCounts={k:len(load(O/(k+'-packet.json'))['sameShaAudits']) for k in ['193','208','276']},actualTargetLedger=[dict(callId=x['callId'],articleId=x['articleId'],model=x['model'],productionSha256=x['binding']['productionSha256']) for x in rows if x.get('articleId') in ['cv1765377','cv1770245','cv1793434']],registerUpdatesOnly=list(updates),remainingAtPreparation=len(load(O/'remaining-universe.json')['uncovered']),allRawSourceCandidateUnchanged=True,budgetAuthorized=False))
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
files=[dict(path=p.name,sha256=bind(p)['sha256'],bytes=p.stat().st_size) for p in sorted(O.iterdir()) if p.is_file() and p.name!='delivery-manifest.json']
save(O/'delivery-manifest.json',dict(schema='coac244-evidence-files/1',files=files,newModelCalls=0));shutil.copy2(O/'delivery-manifest.json',S/'delivery-manifest.json')
print(json.dumps(load(O/'final-verification.json'),ensure_ascii=False))
