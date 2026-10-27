from pathlib import Path
import json,hashlib,shutil,zipfile
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent;S=R/'integration/coac244-pdf283-recorded-20261028';S.mkdir(exist_ok=True)
read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
def ref(p):return dict(path=str(p),sha256=sha(Path(p).read_bytes()))
def save(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
pre=read(O/'pre-verification.json');gates=read(O/'readonly-gates.json');assert pre['status']==gates['status']=='passed'
for p,digest in pre['protected'].items():assert sha(Path(p).read_bytes())==digest,p
pdf=read(O/'source-pdf-handoff.json');new=read(O/'source-283-handoff.json');rev=read(R/'integration/coac249-283-396962-reviewed-20261028.json')
snapshots=[]
for n in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 p=R/'integration'/n;data=read(p);save(O/n,data);snapshots.append(dict(**ref(p),role='Existing authoritative register already current. This intake performs no register rewrite.'))
effective=read(O/'effective283-existing-owner.json');assert effective['counts']==pre['chapter283']['counts']
remaining=pre['chapter283']['remaining'];assert len(remaining)==7
att=read(O/'159242-consistency.json')
assert [p['authorPropositions']for p in att['proofs']]==[9,10]
assert [len(p['tacticalUncertainRetained'])for p in att['proofs']]==[4,2]
assert all(p['conditionsAlreadySatisfied']and not p['newNonAuthorNoteNeeded']and p['originalTechnicalFalsePreserved']for p in att['proofs'])
for p in pdf['pdf']:shutil.copyfile(p['raw']['path'],O/('pdf%d-original-raw.json'%p['page']))
for p in rev['results']:shutil.copyfile(p['raw']['path'],O/('283-'+p['targetId'].split(':')[-1]+'-original-raw.json'))
registration=dict(schema='coac244-pdf-and283-existing-owner-registration/1',status='verified-existing-owner-state-recorded',newModelCalls=0,newProductionCalls=0,newConsumers=0,newWakeups=0,sourcePdfHandoff=ref(R/'integration/coac249-222-order-pdf218220-reviewed-20261028.json'),source283Handoff=ref(R/'integration/coac249-283-targets-and-159242-proof-20261028.json'),pdfDisposition=ref(R/'integration/coac247-pdf217220-review-disposition-20261028.json'),pdfIntake=ref(R/'integration/coac250-pdf217220-assembly-intake-20261028.json'),pdfPageResults=[dict(page=p['page'],canonical=p['canonical'],status=p['status'],candidate=p['candidate'],audit=p['audit'],raw=p['raw'],callId=p['callId'],blockingIssues=p['blockingIssues'],sourceNotes=p['sourceNotes'])for p in pre['pdf']],chapter283=dict(canonical='nemata-jp-chapter-283-1',candidate=rev['candidate'],effectiveIssueRegister=pre['chapter283']['effectiveIssues'],counts=effective['counts'],remaining=remaining,all14DeferredRetainedWithEffectiveMapping=True,wholeChapterPassed=False,previewAllowed=False),chapter222=dict(adjudication=pdf['chapter222']['adjudication'],originalAudit=pdf['chapter222']['originalAudit'],originalFalseFlagsRetained=True,newModelCalls=0,remainingConditionalOrderCall=1,notConsumed=True),alreadyCompleted159242=dict(candidatePropositions=[9,10],tacticalUncertain=[4,2],status='existing-v26-admission-and-readback-retained',proof=new['159242']['attestation'],ownerSidecar=new['159242']['existingOwnerSidecar'],rebuildOrConsumerStarted=False),registers=snapshots,priorBudgets=dict(pdf218219='4/4 used; remaining0',pdf220='2/2 used; remaining0',chapter283='4/4 used; remaining0',retry=0),checks=dict(shaAndBindingChecks=len(pre['checks']),protectedInputs=len(pre['protected']),readOnlyGates=dict(path=str(S/'readonly-gates.json'),sha256=sha((O/'readonly-gates.json').read_bytes()))),formalActiveChanged=False,bookComplete=False)
save(O/'registration.json',registration)
owner=Path('short-stage-owner-prefix.md');text=owner.read_text(encoding='utf-8');entry='''本轮249两批唤醒零模型收证（PDF218–220＋283 b0396/b0962）：原交接db25a729/ daf68062均实读验SHA；228项绑定检查、143受保护输入前后不变，冻结PDF30文件/220父30文件/28332文件逐个核验。未制作/审校/识字/新增消费者或唤醒。

79-cn-chapter-217-4：复用247现有coac247-pdf217220-review-disposition-20261028和250既有assembly-intake，不再覆写两份已正确register。218(9ff64a45)原terra/max独审a4bfda32：r1四阻断＝漏北13/东10/西13牌背；东河2/3/5/10/11和北河1/6/7未确认；南手首张6s未独立确认；ドラ:5m身份未证。219(4ed39627)独审ac6bf0ed：r2两阻断＝漏西13/北13/南10牌背及未见立直横置说明；西河靠中央行自右至左2字/6万未知。各暗手牌面仍未知；219“会吃得概率”原字保留、疑笔误只source-note。两页正常门禁均audit_checks_not_passed，不是transport失败。220(49df5a1c)独审8af52b0c整物理页8文本/2图passed且当前冻结verifyAuditForCandidate实际passed；b1/b3归217章，另8块含b9/b10两图归79-cn-chapter-220-4，22块217装配仍不可整章通过。217限定图＋218-b3强制非原文注、215已入成果保持。原2182194/4、2202/2均余0，未经新授权不修/复审。

nemata-jp-chapter-283-1：复用250已生成coac250-283-396962-effective-issues-20261028，SHA6d122aa5…，候选00074d1c…；仅b0396/b0962较b2417de1改变，1193非靶块/524完整figure对象逐hash不变。真实c500112c(13图、19.486秒)/1ca0aa10(12图、33.026秒)terra/max目标checkpoint均passed，verifyGroupRevisionAudit已实跑；标准整章门禁仍web_audit_not_passed_or_inputs_changed。六表/Q8/b0168与batch010113块证据继承，不重审。原19问题当前10解除/7阻断/2source-note；原16deferred为9解除/7开；新aggregate14deferred为7补证/7开，原issueSHA和severity不改，不把14当14新缺口。剩7：b1017、b1181两处文字；b0785下方手牌错录、三家隐手误称牌墙、三张公开河牌未知共3；b0947缺是否碰2s题问及两张风牌未知共2。DOM/表几何0阻断，语义5/关键未知图2；两条source-note保持。本批制作2＋独审2=4/4余0，不新派。

222原顺序限定补证只读验真passed，原新审false/needs-repair及raw保留，条件1call未消耗、不借PDF。159/242仅登记既有9＋10命题/4＋2战术uncertain与7组一致性证明，v26已实际合入读回，不增注/重建/识字；技术false与原审/raw不改。现有250正消费同一批证据，本轮不重复唤醒；整书仍未完成，正式active不切。完整零模型收证见integration/coac244-pdf283-recorded-20261028/registration.json。

'''
owner.write_text(entry+text,encoding='utf-8')
for p in O.iterdir():
 if p.is_file()and p.suffix!='.zip':shutil.copyfile(p,S/p.name)
with zipfile.ZipFile(O/'pdf283-existing-owner-evidence.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in O.iterdir():
  if p.is_file()and p.suffix!='.zip':z.write(p,p.name)
print(json.dumps(dict(status='recorded',newModelCalls=0,registersReused=2,counts283=effective['counts'],registration=ref(S/'registration.json'),zipBytes=(O/'pdf283-existing-owner-evidence.zip').stat().st_size),ensure_ascii=False))
