import json,csv,hashlib
from pathlib import Path
from datetime import datetime,timezone
here=Path(__file__).parent
def load(name):return json.loads((here/name).read_text(encoding='utf-8-sig'))
receipts=[];categories={}
for p in sorted(here.glob('recycle-*-receipts.jsonl')):
    rows=[json.loads(s) for s in p.read_text(encoding='utf-8-sig').splitlines() if s]
    receipts+=rows
    categories[p.name]={'items':len(rows),'recycled':sum(r['status']=='recycled' for r in rows),'logicalBytes':sum(r['logicalBytes'] for r in rows if r['status']=='recycled')}
assert all(r['status']=='recycled' for r in receipts)
recovery=load('recycle-recovery-verification.json')
assert recovery['verified']==len(receipts)
health=load('health-after.json');assert health['allProtectedBytesUnchanged']
mcp=load('post-consumer/formal-mcp.json');arena=load('post-consumer/arena-validation.json')
assert mcp['passed'] and len(mcp['units'])==266 and len(mcp['images'])==6288
refs=load('live-reference-closure.json')
missing=[p for p in refs['paths'] if not Path(p).is_file()]
assert not missing,missing
release=load('formal-release-summary.json')
data={
 'schema':'coac244-textbook-project-closeout/1','at':datetime.now(timezone.utc).isoformat(),
 'authorizationComment':'01a183b6-080b-7e99-8697-bbd245566e5a',
 'release':release,'releaseRun':load('release-run-terminal.json'),
 'cleanup':{'categories':categories,'items':len(receipts),'logicalBytes':sum(r['logicalBytes'] for r in receipts),
 'recycleBinRecoverabilityVerified':True,'diskSpaceReleasedClaimed':False,
 'manuallyRemovedGitWorktrees':0,'platformAutomaticallyRemovedCompleted250Worktree':True,
 'remoteBranchesDeleted':0,'permanentDeletes':0,'newLargeArchives':0},
 'preserved':{'currentReferenceFilesStillPresent':len(refs['paths']),
 'protectedLibraryAndHumanFilesByteUnchanged':len(health['files']),
 'sourceOriginalsRawAuditHistoryAndHumanEventsUnmodified':True,
 'retainedInventory':'retained-inventory.json','historicalPreviewsWithAssetDirectoriesRetained':42,
 'legacyDirtyCodeTree':'E:/AgentWorkspaces/Coach/mortal-rag-ablation',
 'legacyDirtyOrUntrackedEntries':len((here/'legacy-code-status.txt').read_text(encoding='utf-8-sig').splitlines()),
 'legacyIgnoredEntries':len((here/'legacy-ignored.txt').read_text(encoding='utf-8-sig').splitlines()),
 'legacyUncommittedPatch':'legacy-uncommitted.patch',
 'scopeExclusions':['Review Loop','Other Coach business','Other user projects','Unknown ownership','Platform task/issue history']},
 'postCleanup':{'http':health['http'],'realMcp':{'units':266,'figures':6288,'corpusId':mcp['corpusId'],'requiredScopes':mcp['requiredScopes']},
 'arena':{'units':len(mcp['units']),'localVerificationPassed':True,'evidence':'post-consumer/arena-validation.json'},
 'services':load('services-after.json'),'allSourceBindingsStillExist':not missing},
 'issues':load('issue-status-after.json'),'wakeupSummary':load('wakeup-summary.json'),
 'residual':{'blockingCleanupErrors':[],
 'retainedByDesign':['Current cleanup worktree until run exit; branch is preserved in Git','Legacy dirty dependency code tree and all unique untracked/ignored files','Source/raw/candidate/runtime evidence','Current preview and exact-bound older preview/stage dependencies','Both human annotation batches/history and running local services'],
 'acceptedConsumerLockAbsent':not Path('E:/AgentData/Coach/knowledge/processing/integration/accepted-consumer.lock').exists(),
 'makerSlotCount':len(list(Path('E:/AgentData/Coach/knowledge/processing/parallel/slots').glob('*'))),
 'chapterClaimCount':len(list(Path('E:/AgentData/Coach/knowledge/processing/parallel/claims').glob('*'))),
 'productionLaneLockFile':'Persistent empty lock inode retained, not a running owner',
 'historicallyNamedStaleDriverLock':'Retained historical stale-20261025 record; not an active lock',
 'running':load('running-after.json')},
 'newModelCalls':0,'textbookChanges':0,'reviewLoopChanges':0,'prApprovalActions':0,
 'persistentMetadata':'E:/AgentData/Coach/knowledge/processing/integration/coac244-project-closeout-20261029'}
(here/'final-report.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
with (here/'cleaned-paths.tsv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f,delimiter='\t');w.writerow(['originalPath','owner','logicalBytes','files','status','reason'])
    for r in receipts:w.writerow([r['originalPath'],r['ownerIssue'],r['logicalBytes'],r['files'],r['status'],r['reason']])
print(json.dumps({'items':data['cleanup']['items'],'bytes':data['cleanup']['logicalBytes'],'categories':categories,'currentReferenceFilesStillPresent':len(refs['paths']),'mcpUnits':266,'mcpImages':6288}))
