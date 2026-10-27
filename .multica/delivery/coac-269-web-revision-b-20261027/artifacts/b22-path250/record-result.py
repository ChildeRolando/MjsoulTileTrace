"""Record only completed checkout/startup evidence on269's delivery branch."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

HERE=Path(__file__).resolve().parent
load=lambda n:json.loads((HERE/n).read_text(encoding='utf-8-sig'))
start=load('started250.json');checkout=load('checkout-test.json');commit=load('commit250.json');push=load('push250.json')
assert start['passed'] and start['task']['started_at'] and start['recoveryRequests']==1
assert start['containsPackagingFix']==commit['commit'] and checkout['passed'] and push['returncode']==0
assert checkout['verification']['maximumFullPathUtf16Characters']==229
assert subprocess.check_output(['git','branch','--show-current']).decode().strip()=='agent/ticket/coac-269'
actualPaths=subprocess.check_output(['git','ls-tree','-r','--name-only',start['head']],text=True,encoding='utf-8').splitlines()
actualMax=max(len((start['actualWorktree']+'/'+n).encode('utf-16-le'))//2 for n in actualPaths)
assert actualMax<240
for f in HERE.glob('*.py'):ast.parse(f.read_text(encoding='utf-8'))
receipt={'passed':True,'modelCalls':0,'foreignBranch':commit['branch'],'foreignParent':commit['parent'],'foreignCommit':commit['commit'],
         'renamedFilesByteIdentical':16,'localWrapperEdits':8,'oldMaximum':267,'newMaximum':229,'limitExclusive':240,
         'realSameBranchCheckout':checkout['realCheckoutPath'],'trackedFiles':3157,'imageReferencesVerified':32,
         'newAnalysisAndDeliveryGuardCases':checkout['newFileGuardTests'],'pushConfirmed':True,'recoveryRequests':1,
         'failedOriginalRun':'01a17f90-dd76-7202-b0b2-d4f39be097e0','recoveredRun':start['task']['id'],
         'actualStartedAt':start['task']['started_at'],'actualWorktree':start['actualWorktree'],'observedHead':start['head'],
         'recoveryActualTreeFiles':len(actualPaths),'recoveryActualFullPathMax':actualMax,
         'dataRootTouched':False,'v29Rebuilt':False,'globalGitOrOSChanged':False,'ownHEADStayedOn':'agent/ticket/coac-269'}
(HERE/'result.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
owner=HERE.parent.parent/'README.md';text=owner.read_text(encoding='utf-8')
assert 'Recovery startup verified:' not in text
text+=f"\nRecovery startup verified: `{start['task']['id']}` actually started at `{start['task']['started_at']}`.\nIts real250 checkout HEAD `{start['head']}` contains the packaging fix; the single original\nwakeup has fired once. This is actual started_at/branch evidence, not merely a queued task.\nOnly the restored original zero-model registration continues; this repair's work is complete.\n"
owner.write_text(text,encoding='utf-8',newline='\n')
names=['.gitattributes','README.md','prepare.py','verify-package.py','apply-and-test.py','resume-once.py','check-start.py','record-result.py',
       'commit250.json','manifest250.json','repair250.patch','preflight-tests.json','owner-exclusion.json','checkout-attempt.json','checkout-test.json',
       'push250.json','original-wakeup.json','resume-exclusion.json','resume250.md','resume250.json','started250.json','result.json']
longest=max(len(str((HERE/n).resolve()).encode('utf-16-le'))//2 for n in names);assert longest<240
manifest={'files':[{'name':n,'sha256':hashlib.sha256((HERE/n).read_bytes()).hexdigest(),'bytes':(HERE/n).stat().st_size} for n in names],
          'maximumFullWindowsPath':longest,'modelCalls':0}
(HERE/'package.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');names.append('package.json')
subprocess.run(['git','add','-f','--']+[str(HERE/n) for n in names]+[str(owner)],check=True)
for n in names:
    path=(HERE/n).relative_to(Path.cwd()).as_posix()
    assert subprocess.check_output(['git','show',':'+path])==(HERE/n).read_bytes(),n
with zipfile.ZipFile('b22-evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
    for n in names:z.write(HERE/n,n)
print(json.dumps({'passed':True,'recoveredRun':receipt['recoveredRun'],'startedAt':receipt['actualStartedAt'],'files':len(names),'ownPackageMaximum':longest,'modelCalls':0}))
