import pathlib,json,hashlib,shutil,copy,os,zipfile
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-232-human-conditional-20261028';O=pathlib.Path(__file__).resolve().parent
load=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,x):
 (O/n).write_bytes(json.dumps(x,ensure_ascii=False,indent=2).encode('utf-8')+b'\n');shutil.copyfile(O/n,D/n)
m=load(D/'manifest.json');v=load(D/'verification.json');r=load(m['receipt']['path']);assert v['negativeChecksPassed']==27
save('handoff250.json',{'schema':'coac244-exact232-conditional-display-interface/1','canonical':'nemata-jp-chapter-232-1','candidate':r['candidate'],'receipt':m['receipt'],'raw':r['raw'],'manifest':{'path':str(D/'manifest.json'),'sha256':sha((D/'manifest.json').read_bytes())},'verify':{'module':str(D/'admit.mjs'),'export':'verify232Conditional'},'stage':{'module':str(D/'stage.mjs'),'export':'stage232Conditional'},'stagedVerify':{'module':str(D/'stage.mjs'),'export':'verifyStaged'},'sealedStage':str(D/'stage'),'sealedOutputFiles':m['stageFiles'],'actualIsolatedVerification':v['stage'],'conditionalEvidenceAlreadyIndependentlySufficient':True,'originalTechnicalLimitedUnknownOkay':False,'originalIssuesRawAndSeverityUnchanged':True,'fullAuthorCandidateUnchanged':True,'ordinaryWholeArticlePassed':False,'globalAdmissionGranted':False,'globalMcpArenaReadbackCompleted':False,'newModelCalls':0,'newProductionCalls':0,'same250ExistingConsumerWakeup':'01a18249-0354-7cf1-a6bd-8811cf79798d'})
shutil.copyfile(D/'verification.json',O/'verification.json')
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']=='nemata-jp-chapter-232-1')
row['humanConditionalDisplayContract']={'candidate':r['candidate'],'receipt':m['receipt'],'handoff':{'path':str(D/'handoff250.json'),'sha256':sha((D/'handoff250.json').read_bytes())},'applicationAndArgumentIndependentlyFaithful':True,'fourLimitsConditionallySufficient':True,'originalTechnicalLimitedUnknownOkay':False,'isolatedStageInstalledAndVerified':True,'globalMcpArenaReadback':False,'covered':False,'newModelCalls':0}
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!='nemata-jp-chapter-232-1':assert x==y
assert reg.read_bytes()==before
if not (D/'before244-register.json').exists():(D/'before244-register.json').write_bytes(before)
tmp=D/'register.tmp';tmp.write_bytes(json.dumps(b,ensure_ascii=False,indent=2).encode('utf-8')+b'\n');os.replace(tmp,reg)
save('register-update.json',{'path':str(reg),'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),'onlyChangedField':'232.humanConditionalDisplayContract','otherRowsAndOldIssuesPreserved':True,'global250CoverageWritten':False,'newModelCalls':0})
for n in ['README.md','handoff250.md','finalize.py']:
 if (O/n).exists():shutil.copyfile(O/n,D/n)
print(json.dumps({'readyForExisting250':True,'sealedOutputs':len(m['stageFiles']),'dependencyBindings':len(m['files']),'globalAdmissionGranted':False,'newModels':0}))
