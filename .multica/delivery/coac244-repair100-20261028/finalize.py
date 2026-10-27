from pathlib import Path
import json,hashlib,copy,datetime,shutil,zipfile
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
digest=lambda b:hashlib.sha256(b).hexdigest()
save=lambda p,v:Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
r=load(O/'final-result.json');s=load(O/'isolated-stage-result.json');assert r['status']==s['status']=='passed'
shared=P/'integration/coac244-condition100-repaired-20261028';shared.mkdir(exist_ok=True)
for n in ['verify-final.mjs','final-result.json','production-result.json','preflight-results.json','isolated-stage-result.json','manifest.json','manifest-v2.json','manifest-v3.json','actual-cli-request.json','actual-maker-request.json','actual-maker-request-v2.json','actual-independent-request.json','audit-projection-preflight.json','audit-guard-released.json','composite-parent.json']:
 shutil.copyfile(O/n,shared/n)
proofs=[]
for n,path in [('production-raw.json',r['production']['raw']['path']),('independent-raw.json',r['raw']['path']),('new-audit.json',r['independentAudit']['path'])]:
 shutil.copyfile(path,O/n);proofs.append(dict(path=str(Path(path)),sha256=digest(Path(path).read_bytes())))
v=shared/'verify-final.mjs'
handoff=dict(schema='coac244-condition100-repaired-handoff/1',canonical='nemata-jp-chapter-100-1',status='independently-passed-awaiting250-incremental-readback',authorizationComment='01a17f4b-adc5-76d9-bd04-78a849727fe9',candidate=r['production']['candidate'],source=r['production']['source'],audit=r['independentAudit'],raw=r['raw'],newIndependentCall=r['call'],productionCall=r['production']['call'],productionRaw=r['production']['raw'],verifier=dict(path=str(v),sha256=digest(v.read_bytes()),export='verify100Final'),runtime=r['runtime'],independentScope=dict(targetTextIds=['modern-yabejp-ja:chapter01-section035:b0041'],newFigureChecks=0,images=[],contextSourceBlocks=107,originalABDefinitionBlocks=39,inheritedOriginalPassedBlocks=243,inheritedOtherNewFaithfulBlocks=67,unchangedOtherBlocks=310,unchangedCompleteFigureObjects=128),condition=dict(sourceDefinition='生きている（２枚以上切れてない）孤立字牌',targetSource='役牌トイツ１組＋生きている字牌２〜３種',oldPhrase='1组役牌对子＋仍有剩余的字牌2～3种',approvedPhrase='1组役牌对子＋2～3种仍然有效（尚未被打出2张以上）的字牌'),modelReview=r['modelReview'],budget=r['budget'],preflightIncident=r['production']['preflightIncident'],oldEvidenceRetained=True,formalActiveChanged=False,isolatedStage=s,next='250 existing single writer verifies all53 frozen dependencies and exact callback, incrementally stages exactSHA and records MCP/Arena full readback. Preserve all existing selections and raw; no new model, no whole-book review, no formalactive switch.',bookComplete=False)
save(O/'handoff.json',handoff);save(shared/'handoff.json',handoff)
hb=dict(path=str(shared/'handoff.json'),sha256=digest((shared/'handoff.json').read_bytes()))
records=[]
for name in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 p=P/'integration'/name;b=p.read_bytes();d=json.loads(b);before=copy.deepcopy(d);hits=[]
 def visit(x):
  if isinstance(x,dict):
   if x.get('chapterId',x.get('canonical'))=='nemata-jp-chapter-100-1':
    hits.append(x)
    if x.get('blockingIssues'):x.setdefault('resolvedEvidenceHistory',[]).append(dict(scope='b0041 condition',originalBlockingIssues=copy.deepcopy(x['blockingIssues']),closure=hb))
    x.update(blockingIssues=[],owner='COAC-250',closureStatus='independent-target-condition-passed-awaiting-incremental-readback',condition100Repair=hb,nextAction='Consume exact0415bd3c candidate with verified composite independent parent plus3591af22 target pass; incrementally read MCP/Arena, preserve active. Budget2/2 exhausted; no new model.')
    return
   for v in x.values():visit(v)
  elif isinstance(x,list):
   for v in x:visit(v)
 visit(d);assert len(hits)==1,(name,len(hits));assert p.read_bytes()==b,'concurrent register changed'
 save(O/('before-'+name),before);save(p,d);save(O/('after-'+name),d)
 records.append(dict(path=str(p),beforeSha256=digest(b),afterSha256=digest(p.read_bytes()),onlyCanonical='nemata-jp-chapter-100-1',coveredOrBaselineCountsUnchanged=True))
reg=dict(schema='coac244-condition100-registration/1',handoff=hb,registers=records,budget=r['budget'],newModels=2,retry=0,owner='COAC-250',formalActiveChanged=False,bookComplete=False)
save(O/'registration.json',reg);save(shared/'registration.json',reg)
owner=Path('short-stage-owner-prefix.md');t=owner.read_text(encoding='utf-8');prefix=f'''100 b0041条件修订已真实独审passed，候选0415bd3cab999892faec1f3ae6ae8586f4b4adb1b93f486e37b1188bf7c49fc3；maker0bc838f2（15.360秒，160751in/286out）+首审3591af22（31.852秒，158310in/449out），均sol/high images=[]，预算2/2余0、0retry。实际107块日中上下文/39A/B定义保留，原243pass+新67faithful及各自DOM证据显式继承；仅b0041短语修改，310其它块/128完整figure对象原样，旧uncertain/DOM false和raw未改。新原始独审通过目标语义/条件/上下文/完整性，标准新SHA审校入口与实际隔离compiler复验passed。已形成53依赖冻结v3和只读验真回调，交250增量实读，正式active不切；原2次额度全用，不新增重复。交接{hb['path']} SHA{hb['sha256']}。预检误触maker事件按实记账保留，不称全阶段零调用，之后14项实际CLI/白名单/父证据测试为0调用。\n\n'''
owner.write_text(prefix+t,encoding='utf-8')
with zipfile.ZipFile(O/'condition100-evidence.zip','w',zipfile.ZIP_DEFLATED)as z:
 for p in O.rglob('*'):
  if not p.is_file()or p.name.endswith('.zip')or 'isolated-stage' in p.parts or any(x.startswith('cli-request-')for x in p.parts):continue
  z.write(p,p.relative_to(O).as_posix())
print(json.dumps(dict(status='passed',handoff=hb,updatedRegisters=len(records),budget=r['budget'],zipBytes=(O/'condition100-evidence.zip').stat().st_size),ensure_ascii=False))
