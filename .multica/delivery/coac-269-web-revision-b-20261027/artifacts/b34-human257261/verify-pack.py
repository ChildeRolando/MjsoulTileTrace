"""Verify only this zero-model evidence packaging; never copy annotations or source books."""
import json,hashlib,ast
from pathlib import Path
HERE=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
r=load(HERE/'verification.json');assert r['newModelCalls']==r['newProductionCalls']==r['newVisionCalls']==r['newIndependentCalls']==0
assert not r['wholeChapterPassed'] and not r['admissionGranted'] and not r['displayImplementationVerified']
assert r['originalChecksReplayed']==37 and len(r['additionalNegativeChecks'])==7 and r['bindingsChecked']==180 and r['packageManifestFiles']==7
for f in r['packageBindings']:assert sha(f['path'])==f['sha256']
for key in ['257','261']:
 v=r['p'+key]['verification'];assert sha(v['candidate']['path'])==v['candidate']['sha256']
assert not r['p257']['fullRecordMultiplicityPassed'];assert r['p257']['requestIsUnexecutedProposalOnly'] and not r['p257']['semanticApplicationReviewAuthorized']
assert [(x['tile'],x['count']) for x in r['p257']['conflictPositions']]==[('4p',8),('1s',5),('8s',5),('9s',5)]
assert sum(len(x['positions']) for x in r['p257']['conflictPositions'])==23
assert r['p261']['actualFrozenVerifier']['status']=='passed-after-source-adjudication' and r['p261']['newReview']==r['p261']['newProduction']==0
assert len(r['reusedPages'])==11 and sum(p['sourceBlocks'] for p in r['reusedPages'])==837
for p in HERE.iterdir():
 assert p.is_file() and p.name not in ['events.raw.jsonl','final.json','candidate.json','raw.json'] and p.suffix.lower() not in ['.png','.jpg','.pdf','.jsonl']
 if p.suffix=='.py':ast.parse(p.read_text('utf8'))
longest=max(len(str(p.resolve())) for p in HERE.iterdir());assert longest<240
out={'passed':True,'newModelCalls':0,'originalChecks':37,'additionalNegativeChecks':7,'originalInputPins':180,'entryManifestFiles':7,'reusedSourceBlocks':837,'conflictPositions':23,'p257MultiplicityPassed':False,'p261Status':'passed-after-source-adjudication','maxWindowsCheckoutPath':longest,'pathLimit':240,'noRawHumanExportOrBookImagesCopied':True}
(HERE/'pack-check.json').write_bytes((json.dumps(out,indent=2)+'\n').encode());print(json.dumps(out))
