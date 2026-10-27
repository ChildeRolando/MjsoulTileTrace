from pathlib import Path
import json,hashlib,copy,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');I=P/'integration';O=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest()
dump=lambda p,x:Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
pins=load(O/'pins.json');verification=load(O/'verification.json');loader=load(O/'loader-verification.json');changes=[]
for file in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=I/file;before=path.read_bytes();doc=json.loads(before);old=copy.deepcopy(doc);rows=doc['rows']
 for k,pin in pins.items():
  row=next(r for r in rows if r['chapterId']==pin['canonical']);target=row if file.startswith('coac244') else row['closurePlan'];current=load(pin['binding']['path']);orig=load(pin['oldAudit']['path'])
  historical=target.get('blockingIssues',orig['modelReview']['issues'])
  target.setdefault('historicalBlockingIssuesBeforeBoundedFidelity',copy.deepcopy(historical))
  disposition=[]
  for issue in orig['modelReview']['issues']:
   if issue['severity']=='source-note':how='retained-source-note-not-new-repair'
   elif k=='193' and issue['targetId'].endswith((':b0008',':b0015')):how='web-source-fragment-uncertain-preserved-with-independent-labelled-PDF-pair'
   elif k=='276' and issue['targetId'].endswith((':b0014:figure',':b0025:figure')):how='exact-full-figure-and-body-parent-faithful-evidence-reused-original-uncertain-retained'
   else:how='independent-limited-author-fidelity-allowance-with-all-unknowns-and-display-limits-preserved'
   disposition.append({'originalIssueSha256':sha(json.dumps(issue,ensure_ascii=False,separators=(',',':')).encode()),'originalSeverity':issue['severity'],'targetId':issue['targetId'],'disposition':how,'evidence':pin['receipt'],'raw':pin['raw']})
  target['blockingIssues']=[]
  target['category']='independent-limited-fidelity-admitted-awaiting-existing250-master-readback'
  target['owner']='existing COAC-250 consumer; COAC-244 evidence owner'
  target['nextAction']='Use already executing250 exact three-SHA callback/stages for persistent integration and actual complete MCP/Arena readback. No new OCR, maker, independent review or consumer. Preserve original unknown/error/uncertain/raw.193 must keep separate labelled PDF193/b6 two-sentence navigation pair; no Web rewrite. Only250 updates actual coverage after readback.'
  target['limitedOwnerConvergence20261028']={'canonical':pin['canonical'],'candidate':pin['candidate'],'independentReceipt':pin['receipt'],'raw':pin['raw'],'binding':pin['binding'],'effectiveProductionOrSemanticRepairTodos':0,'originalIssueDispositions':disposition,'ordinaryWholeArticlePassed':False,'unknownsRemainUnknown':True,'independentDisplayLimitations':current['mandatoryDisplayLimits'],'existingLoader':loader['loader'],'loaderManifestSha256':loader['manifestSha256'],'existing250Run':loader['existingConsumerRun'],'actualStage':next(r for r in loader['rows']if r['key']==k),'remainingExecution':'Existing250 master MCP/Arena complete readback and persistent route, no new model budget','stageOwnerCalls':0,'reviewBudgetUsed':1,'reviewBudgetRemaining':0,'retry':0}
  if 'zero193208276Preparation' in target:
   prep=target['zero193208276Preparation'];prep['supersededByRealIndependentReceipt']=pin['receipt'];prep['minimumNextBudgetProposal']={'maker':0,'independentRecognitionAndImpact':0,'retry':0,'authorized':False,'reason':'Original proposed review completed1/1; no new call requested'}
  changes.append({'register':file,'canonical':pin['canonical'],'beforeCovered':row.get('covered'),'afterCovered':row.get('covered'),'ordinaryGateNotChanged':True,'semanticRepairTodos':0,'pending':'existing250 actual master readback'})
 # Only these exact three business rows may change; preserve counters/other canonical rows.
 for a,b in zip(old['rows'],doc['rows']):
  if a['chapterId']not in [p['canonical']for p in pins.values()]:assert a==b
 assert {k:v for k,v in old.items()if k!='rows'}=={k:v for k,v in doc.items()if k!='rows'}
 assert path.read_bytes()==before,'Concurrent register change: reconcile before writing'
 (O/(file+'.before')).write_bytes(before);dump(path,doc);shutil.copyfile(path,O/file)
for ref in load(O/'protected.json'):assert sha(Path(ref['path']).read_bytes())==ref['sha256']
handoff={'schema':'coac244-next3-limited-owner-consumption/1','canonical':[p['canonical']for p in pins.values()],'evidence':[{k:v for k,v in p.items()if k not in ['expectedOriginalReview','expectedBody','expectedFigures','expectedSourceBlocks']}for p in pins.values()], 'existingLoader':loader,'checks':verification['count'],'registerChanges':changes,'originalRawAndFindingsUnchanged':True,'newModelCalls':0,'newProductionCalls':0,'newCandidates':0,'newConsumers':0,'ordinaryWholeArticlePassed':False,'budget':{'completedIndependentCalls':3,'maximum':3,'remaining':0,'failedVoid':0,'retry':0},'noDuplicateDispatch':'250 run01a17f9e-1da5-7423-9f96-2b5a0cbe65e0 already owns all three actual stages/master readback. No new wakeup or consumer created.','next':'Existing250 complete all required master MCP/Arena reads and update coverage. This owner only consumes bounded fidelity, not whole-board truth.'}
dump(O/'handoff.json',handoff)
dest=I/'coac244-next3-limited-owner-20261028';assert not dest.exists();shutil.copytree(O,dest)
print(json.dumps({'rowChanges':len(changes),'checks':verification['count'],'handoffSha256':sha((O/'handoff.json').read_bytes()),'modelCalls':0,'consumers':0}))
