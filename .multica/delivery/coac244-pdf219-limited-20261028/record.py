from pathlib import Path
import json,hashlib,copy,shutil,zipfile
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent;S=R/'integration/coac244-pdf219-limited-20261028';S.mkdir(exist_ok=True)
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def ref(p):return dict(path=str(p),sha256=sha(Path(p).read_bytes()))
admit=read(O/'219-limited-admission.json');checks=read(O/'checks.json');assert checks['status']=='passed'and admit['limitedFidelityAdmission']and not admit['standardWholePagePassed']
h=read(R/'integration/coac249-pdf218219-target-results-20261028.json');assert sha((R/'integration/coac249-pdf218219-target-results-20261028.json').read_bytes())=='b4755f133f70298679b6115b14933d807a5b70c31f099a9ab89534ef3379900b'
for name in ['limited219.mjs','219-limited-admission.json','checks.json','owner-contract.md']:shutil.copyfile(O/name,S/name)
gate=ref(S/'limited219.mjs');gate['export']='verify219LimitedFidelity';proof=ref(S/'219-limited-admission.json')
i218=h['results'][0];candidate=read(R/i218['candidate']['path']);figure=candidate['figures'][0];old='南家手牌从左至右为11334789m 234p 67s，最右侧新摸入1z（东）。';new='南家手牌从左至右为11334789m 234p ?s 7s，最右侧新摸入1z（东）。';assert figure['transcription'].count(old)==1
plan=dict(schema='coac244-pdf218-exact-unknown-contradiction-repair-goal/1',candidate=i218['candidate'],raw=i218['raw'],receipt=i218['receipt'],targetFigureId='79-cn-p218-r1',field='transcription',before=old,expected=new,occurrences=1,onlyChange='Remove unsupported certainty of first souzu rank; retain original-record6s explanation, known7s, all other text/unknowns/body/images/captions/order.',expectedIsNotProduction=True,candidateCreated=False,newModelCalls=0,authorizedExecution=False,remainingStageCalls=0,savedMakerAllowanceNotTransferable=True)
save(O/'218-exact-repair-goal.json',plan);save(S/'218-exact-repair-goal.json',plan)
for item in h['results']:
 receipt=read(item['receipt']['path']);raw=read(item['raw']['path']);assert raw['output']==receipt['modelReview']==item['modelReview'];assert sha(Path(item['raw']['path']).read_bytes())==item['raw']['sha256'];assert len(raw['requestExecution']['images'])==3
 for name,key in [('receipt','receipt'),('raw','raw')]:shutil.copyfile(item[key]['path'],O/('%d-original-%s.json'%(item['page'],name)))
v218=dict(page=218,candidate=i218['candidate'],receipt=i218['receipt'],raw=i218['raw'],status=i218['status'],targetVerdict=i218['targetVerdict'],originalIssueChecks=i218['modelReview']['originalIssueChecks'],blockingIssues=i218['modelReview']['issues'],repairGoal=ref(S/'218-exact-repair-goal.json'),newCalls=0)
save(O/'218-disposition.json',v218);save(S/'218-disposition.json',v218)
assert [x['outcome']for x in v218['originalIssueChecks']]==['resolved','unresolved','unresolved','uncertain']
assert [x['severity']for x in v218['blockingIssues']]==['error','uncertain','uncertain']
handoff=dict(schema='coac244-pdf219-limited-fidelity-and218-results/1',canonical='79-cn-chapter-217-4',sourceHandoff=ref(R/'integration/coac249-pdf218219-target-results-20261028.json'),page219=dict(status=admit['status'],candidate=admit['candidate'],admission=proof,verifier=gate,sourceBlockIds=admit['sourceBlockIds'],originalModelVerdict='uncertain',originalTechnicalStatus='needs-repair',standardWholePagePassed=False,wholeChapterAccepted=False,authorBodySha256='658bd505d063b4f7e32d31e812ea59d6adbc59b28130188f4c36919e38e55cc3',retainedUnknowns=4),page218=ref(S/'218-disposition.json'),assembly=h['assembly'],registerPolicy='Only PDF route limited219 fidelity accepted.2183 actual new blockers stay open; old alternative-web issue history retained. Whole217 hold and coverage unchanged.',newModelCalls=0,newProductionCalls=0,newCandidate=False,newReviewAuthorized=False,reviewBudget=dict(used=2,maximum=2,remaining=0,retry=0,savedMakerAllowance=2,transferable=False),formalActiveChanged=False)
save(O/'handoff.json',handoff);save(S/'handoff.json',handoff);hr=ref(S/'handoff.json');records=[]
for name in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=R/'integration'/name;before=path.read_bytes();d=json.loads(before);matches=[]
 def walk(x):
  if isinstance(x,dict):
   if x.get('chapterId')=='79-cn-chapter-217-4' and ('closurePlan'in x or 'blockingIssues'in x):matches.append(x);return
   for v in x.values():walk(v)
  elif isinstance(x,list):
   for v in x:walk(v)
 walk(d);assert len(matches)==1,(name,len(matches));row=matches[0]
 if row.get('blockingIssues'):row.setdefault('historicalAlternativeRouteIssuesBeforePdfTargetSupplement',copy.deepcopy(row['blockingIssues']))
 row.update(pdfTargetSupplement=hr,currentRepairRoute='native-PDF217220-limited-scope-assembly',blockingIssues=[dict(**i,targetId='79-cn-p218-r1',raw=i218['raw'])for i in i218['modelReview']['issues']],effectivePdfRouteBlockingIssues=copy.deepcopy(i218['modelReview']['issues']),retainedPdf219Uncertain=admit['proof']['retainedOriginalIssue2'],retainedPdf219ModelIssues=admit['proof']['retainedModelIssues'],pdf219LimitedFidelityAdmission=proof,wholeChapterPassed=False,nextAction='218 only: prepare exact first-souzu certainty-to?s contradiction repair through legal bounded path after explicit authorization; river/dora uncertain remain.219 accepted solely for unchanged conditional-author argument display via exact raw-backed verifier; no paid rereading. Preserve217 paired limitation/220 pass and22-block assembly hold; no new calls.')
 assert path.read_bytes()==before,'concurrent register update'
 save(O/('before-'+name),json.loads(before));save(path,d);save(O/('after-'+name),d);records.append(dict(path=str(path),beforeSha256=sha(before),afterSha256=sha(path.read_bytes()),onlyCanonical='79-cn-chapter-217-4',coverageUnchanged=True))
reg=dict(schema='coac244-pdf219-limited-intake-registration/1',handoff=hr,registers=records,status=admit['status'],pdf218Remaining=3,pdf219UnknownsRetained=4,oldVerdictsUnchanged=True,modelCalls=0,productionCalls=0,candidateWrites=0,semanticFullPagePassesCreated=0,negativeChecks=10,bookComplete=False,formalActiveChanged=False)
save(O/'registration.json',reg);save(S/'registration.json',reg)
owner=Path('short-stage-owner-prefix.md');owner.write_text(f'''219限定准入已零模型实际验真并交接：候选464c607a、独审9c0751f9（terra/max真实3图，196.468秒），原targetVerdict uncertain/receipt needs-repair/technical checks false及raw全部不改。原7文本与r1独立faithful、未改body SHA658bd505、b5/b7逐原行映射、原unknown4项及raw UTF8[500,599)明确允许“不妨碍理解条件性论证”的陈述绑定。新状态accepted-for-specific-pdf219-conditional-argument-display，仅b5/b9/b7范围；standardWholePagePassed/scopedTargetPassed/wholeChapterAccepted全false，不证明完整牌河/暗手/听牌/打点/具体概率。10项错SHA/缺unknown/猜牌/变条件/缺独立允许/伪全页pass/改非靶父图/改uncertain/错摘录/父覆盖不足拒绝；原verifyPdfTargetReceipt两页仍needs-repair，30冻结文件未改。218候选5d0091cb仍有3项真实阻断（首张索子确定码矛盾error、河牌未知uncertain、ドラ语义uncertain），original-1牌背数量已独立resolved；首次67s→?s 7s只写精确修订目标，未改候选。省下2制作额度不转审，原独审2/2余0。本轮模型/制作/候选0。现有两个remaining register仅217canonical更新PDF路线3项及219限定证据，原替代网页问题存历史、原raw不改；217整章仍hold，217限定图＋218-b3强制注/220pass/215保持。共享交接{hr['path']} SHA{hr['sha256']}。\n\n'''+owner.read_text(encoding='utf-8'),encoding='utf-8')
for p in O.iterdir():
 if p.is_file()and p.suffix!='.zip':shutil.copyfile(p,S/p.name)
with zipfile.ZipFile(O/'pdf219-limited-evidence.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in O.iterdir():
  if p.is_file()and p.suffix!='.zip':z.write(p,p.name)
print(json.dumps(dict(status=admit['status'],handoff=hr,registersUpdated=len(records),newModels=0,zipBytes=(O/'pdf219-limited-evidence.zip').stat().st_size),ensure_ascii=False))
