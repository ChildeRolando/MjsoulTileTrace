from pathlib import Path
import json,hashlib,subprocess,shutil
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path('.multica/delivery/coac244-closure26-zero-20261028')
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p):
 p=Path(p);p=p if p.is_absolute() else R/p
 return {'path':str(p),'sha256':sha(p)}
def dump(name,obj):(O/name).write_bytes((json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode())
j=load(O/'remaining26-register.json')
for row in j['rows']:
 if row['baseEvidence']:continue
 source=row['chapterId'].split('-chapter-')[0];pages=row['pdfBoundary']['missingPassedPages'];ev=[]
 for n in pages:
  for ap in (R/'audit/pages'/source).glob(f'page-{n:04}*.json'):
   a=load(ap);p=a.get('production',{}).get('path');
   if p and Path(p).exists():
    ev.append({'page':n,'source':bind(f'{source}/pages/{n:03}.json'),'audit':bind(ap),'candidate':bind(p),'status':a['status'],'issues':(a.get('modelReview') or {}).get('issues',[]),'callIds':[c['callId'] for c in a.get('calls',[])]})
 row['pdfEvidence']=ev
ownership=load(R/'integration/source-block-ownership.json');owned=[b for b in ownership['blocks'] if b['sourceId']=='79-cn' and b['page']==217]
boundary={'sourceOwnership':bind('integration/source-block-ownership.json'),'source':bind('79-cn/pages/217.json'),'rows':owned,'chapter215OwnedIds':['79-cn-p217-b1','79-cn-p217-b3'],'figureBelongsTo':'79-cn-chapter-217-4','next':'215 only owns b1/b3 of p217. Reuse audited faithful text contribution and existing215/216 accepted pages; prove scope assembly through existing boundary gate before claiming acceptance. If the stager requires whole-page passed, fix only scope admission with bound original full raw/ownership proof, not a new figure review or fabricated page pass.','modelCalls':0}
dump('p217-canonical-boundary.json',boundary)
row=next(r for r in j['rows'] if r['chapterId']=='79-cn-chapter-215-4');row['nextAction']='已核p217仅b1/b3归215章，b8牌图归217章；复用已独审文字及215/216已过页，零模型验证现有scope装配。全页passed硬门槛若阻塞，仅补显式ownership/source/raw绑定的装配兼容，不因外章牌图重审整页。';row['ownershipEvidence']=boundary
dump('remaining26-register.json',j);(R/'integration/coac244-remaining26-closure-register-20261028.json').write_bytes((O/'remaining26-register.json').read_bytes())
cpath=R/'integration/coac250-uncovered-chapter-continuation-register-20261027b.json';c=load(cpath)
for r in c['rows']:
 if r['chapterId']==row['chapterId']:r['closurePlan']['nextAction']=row['nextAction']
cpath.write_bytes((json.dumps(c,ensure_ascii=False,indent=2)+'\n').encode())
receipt=load(O/'register-update-receipt.json');receipt['afterSha256']=sha(cpath);dump('register-update-receipt.json',receipt)
# Recheck 193 parent with the existing full verifier, without dispatching any reviewer.
command=['node','--input-type=module','-e',"const m=await import('file:///E:/AgentData/Coach/knowledge/processing/audit/runtimes/coac244-vision-terra-max-v1-20261027/textbook-audit.mjs');const r=await m.verifyAuditForCandidate('E:/AgentData/Coach/knowledge/processing','E:/AgentData/Coach/knowledge/processing/production/sol-high-layout-repair-20261026-schemafix/candidates/79-cn/page-0193.json');console.log(JSON.stringify({status:r.status,production:r.production,calls:r.calls?.map(c=>c.callId)}));"]
v=subprocess.run(command,capture_output=True,encoding='utf-8');assert v.returncode==0,v.stderr
source=load(O/'193-recovered-source.json');source['parentVerifierReadback']=json.loads(v.stdout);source['parentVerifierCommand']=command;dump('193-recovered-source.json',source)
# Deterministic source/target proof; these are not production candidates or new passes.
summary={'schema':'coac244-closure26-zero-stage/1','modelCalls':0,'canonicalRowsUpdated':26,'coverageBase':{'originalChapters':230,'originalUnits':262,'remainingOriginalChapters':26,'formalActiveChanged':False},'textProposal':{'chapters':['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1'],'productionPerChapter':1,'firstTargetAuditPerChapter':1,'totalMaximumFutureCalls':4,'automaticRetry':0,'uncertainPreserved':True,'bothActualEntryPreflightsPassed':True,'requiresAuthorization':True},'imageProposal':{'targets':['79-cn-chapter-222-5 / b0018 sixth tile','79-cn-chapter-217-4 / PDF217 north river second-row first tile'],'maximumIndependentTargetCalls':2,'newProductionCalls':0,'sameShaFullReauditForbidden':True,'requiresAuthorization':True},'234Proposal':{'newProduction':1,'unusedExistingFirstAudit':1,'maximumFutureCalls':2,'upstreamExecutedRequests':None,'usage':None,'currentlyDispatched':False,'separateAuthorizationRequired':True},'aggregateIfAllThreeProposalsAuthorized':{'text':4,'imageAdjudications':2,'234':2,'maximumFutureLocalCalls':8,'automaticallyAuthorizedNow':0,'moneyCost':None},'sourceRecovery':'79-cn-chapter-193-4: two missing web source sentences found in PDF193/b6 and actual passed parent046188e3 / call eb2060c9; no new model needed for exact passed PDF text contribution','boundaryRecovery':'79-cn-chapter-215-4 owns only PDF217/b1,b3; contested figure b8 belongs79-cn-chapter-217-4','A276':'existing run01a17e99-7230-73f7-99ba-62fb9efb1544 and original2calls untouched','deferredWithoutNewModel':['100 exact A/B context bundled; audit context input adapter required before <=1 group review','182 HTML and PDF183 both retain 对日; upstream collation still missing','283 94 tableContext fields already present; renderer/arrow verification + Q8 external source and b0168 scope remain separate','metadata p1/2/3/317 cover microtext unresolved; no silent downgrade to navigation'], 'registerUpdate':receipt}
dump('stage-summary.json',summary)
shutil.copyfile('prepare-closure26.py',O/'prepare-closure26.py');shutil.copyfile('enrich-closure26.py',O/'enrich-closure26.py')
print(json.dumps({'modelCalls':0,'pdfParentsAdded':True,'193ParentVerified':'passed','215OwnershipVerified':True,'proposalCalls':summary['aggregateIfAllThreeProposalsAuthorized']},ensure_ascii=False))
