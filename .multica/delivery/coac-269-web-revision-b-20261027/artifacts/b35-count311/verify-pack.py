import json,hashlib,ast,copy
from pathlib import Path
H=Path(__file__).resolve().parent
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
s=load(H/'257-scope.json');r=load(H/'311-consumed.json')
for x in s['refs']:assert sha(x['path'])==x['sha256']
for k in ['candidate','receipt','raw','handoff','proof','proposal','runtime']:assert sha(r[k]['path'])==r[k]['sha256']
def scope_guard(z):
 assert z['displaySlots']==z['uniqueNamedDisplaySlots']==87 and z['displayScopeCheckPassed']
 assert not z['physicalEntityUniquenessAttested'] and not z['fourTileCapApplicableAsSemanticFailure'] and not z['sourceErrorProven'] and not z['specificMachineTileErrorProven']
 assert len(z['minimalUnresolvedMachinePositions'])==20 and len(z['trustedHumanConflictPositionsExcludedFromRelabel'])==3
 assert all(x['origin']=='inherited-machine-transcription' and x['newTileVerdict'] is None and not x['correctionAuthorized'] for x in z['minimalUnresolvedMachinePositions'])
 assert not z['candidateModified'] and not z['humanPageModified'] and z['newModelCalls']==0
scope_guard(s);checks=[]
for key in ['physicalEntityUniquenessAttested','fourTileCapApplicableAsSemanticFailure','sourceErrorProven','specificMachineTileErrorProven','candidateModified','humanPageModified']:
 z=copy.deepcopy(s);z[key]=True
 try:scope_guard(z)
 except AssertionError:checks.append(key)
 else:raise AssertionError('bad conclusion accepted:'+key)
assert r['repairPassed']==r['limitedUnknownOkay']==r['wholeChapterPassed']==r['admissionGranted']==False
assert len(r['limits'])==80 and len(r['perFigureGaps'])==8 and r['unknownSlots']==144 and r['numericReadingsAdded']==0
assert r['inheritanceRefsRehashed']==73 and len(r['missingHistoricalAdmissionSnapshots'])==4
assert r['dispositionCounts']=={'nonblocking-with-limits':12,'blocking':24,'uncertain':4}
assert r['phaseBudget']['total']==2 and r['phaseBudget']['remaining']==0 and r['newCallsHere']==0
assert r['scopeAttribution']['rawIssueNotRewritten'] and r['scopeAttribution']['rawTargetIdPreserved'].endswith(':b0156:figure') and r['scopeAttribution']['describedScope'].endswith(':b0154:figure')
for f in H.glob('*.py'):ast.parse(f.read_text('utf8'))
assert not list(H.glob('*.png')) and not list(H.glob('*.pdf')) and not list(H.glob('*.jsonl'))
longest=max(len(str(f.resolve())) for f in H.iterdir());assert longest<240
out={'passed':True,'counterNegativeChecks':len(s['negativeChecks']),'conclusionNegativeChecks':checks,'reviewNegativeChecks':len(r['negativeChecks']),'frozenReviewFiles':33,'proofRefsRehashed':73,'historicalAdmissionSnapshotsUnavailable':4,'newCalls':0,'maxWindowsCheckoutPath':longest,'pathLimit':240,'noRawExportsOrBookImagesCopied':True}
(H/'pack-check.json').write_bytes((json.dumps(out,indent=2)+'\n').encode());print(json.dumps(out))
