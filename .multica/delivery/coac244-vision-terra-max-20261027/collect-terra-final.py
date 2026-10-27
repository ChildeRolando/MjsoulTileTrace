from pathlib import Path
import json,hashlib,shutil,subprocess
ROOT=Path('E:/AgentData/Coach/knowledge/processing');out=Path('.multica/delivery/coac244-vision-terra-max-20261027');stage=Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-249-20bf7baa7083/worktree/.multica/delivery/coac-249-a157-terra-first-20261028')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
record=json.loads((stage/'attestation.json').read_text(encoding='utf-8'))
assert record['auditStatus']=='passed' and record['reverifiedStatus']=='passed'
assert record['callId']=='eff9a0e4-5072-4f54-ad15-8d065c9b98dd'
assert sha(ROOT/record['raw']['path'])==record['raw']['sha256']
assert sha(ROOT/record['auditPath'])==record['auditSha256']
for image in record['requestExecution']['images']:
 assert sha(Path(image['path']))==image['sha256']
 assert Path(image['path']).stat().st_size==image['bytes']
assert len(record['requestExecution']['images'])==10
pointer=json.loads((ROOT/'audit/vision-runtime-current.json').read_text(encoding='utf-8'))
manifest=json.loads(Path(pointer['manifest']['path']).read_text(encoding='utf-8'))
assert sha(Path(pointer['manifest']['path']))==pointer['manifest']['sha256']
for f in manifest['files']:assert sha(Path(pointer['runtime'])/f['path'])==f['sha256']
for n in ['admission.json','attestation.json','audit-raw.json','audit-receipt.json','guard-released.json','dispatch-started.json','dispatch-finished.json','process-during.json','process-after.json','coac249-reviewed-157-11-terra-20261028.json']:
 shutil.copyfile(stage/n,out/('first-'+n))
shutil.copyfile('collect-terra-final.py',out/'collect-terra-final.py')
session=next(e['thread_id'] for e in record['returnedEvents'] if e['type']=='thread.started')
summary={'schema':'coac244-terra-max-delivery/1','configurationCommit':'34e5f3c','runtime':pointer['runtime'],'manifest':pointer['manifest'],'changedPaths':['textbook-production-cli.mjs','textbook-production-web.mjs','textbook-production.mjs','textbook-production-web-dictionary.mjs','textbook-audit-web.mjs','textbook-audit.mjs','textbook-audit-web-batches.mjs','textbook-audit-tile-dictionary.mjs','textbook-audit-legacy.mjs'],'imageModel':'gpt-6.1-terra','imageEffort':'max','textRuntimeUnchanged':True,'oldTextDependencyFilesVerified':15,'regressionCases':{'requestMock':13,'semanticAndImageBinding':41,'paidTests':0},'ownersSynchronized':['244','248-A','269-B','249'],'oldInFlight':pointer['inFlightPreserved'],'firstLive':{'chapterId':record['chapterId'],'candidateSha256':record['candidateSha256'],'callId':record['callId'],'model':record['model'],'reasoningEffort':record['reasoningEffort'],'images':10,'originals':5,'enlargements':5,'auditStatus':record['auditStatus'],'auditSha256':record['auditSha256'],'raw':record['raw'],'sessionId':session,'usage':record['usage'],'responseModel':None,'responseEffort':None,'remoteWeights':'unknown','guardNormallyReleased':True,'retries':0,'counts':{'blocks':18,'figures':7,'occurrences':7}},'budget':{'firstLiveCalls':1,'extraPaidTests':0,'A157276TotalAuthorized':4,'A157ProductionUsed':1,'A157AuditUsed':1,'A276RemainingMaximum':2,'moneyCost':None},'platformRecovery':{'failedStartRun':'01a17e83-a2ea-73eb-b8ea-77b3b456a38a','failure':'start POST EOF; started_at null; no model call','supportedRerun':'01a17e84-d92f-745b-b1a4-20bf7baa7083','startedAt':'2026-10-27T18:00:05Z'},'coverage':'157 is passed and handed to250; do not increase original coverage until actual integration receipt','formalActiveChanged':False,'productCodeChanged':False}
(out/'delivery-receipt.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
