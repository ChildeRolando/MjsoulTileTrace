"""Read-only revalidation of the exact Chinese311 native fidelity evidence."""
import sys
sys.dont_write_bytecode = True
import copy, hashlib, importlib.util, json, pathlib, subprocess

ROOT = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
OUT = pathlib.Path(__file__).resolve().parent
PACK = ROOT / 'integration/coac244-311-native-proposal-20261028'
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def save(name, obj):
    with (OUT / name).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2); f.write('\n')
def bound(p, h):
    b = pathlib.Path(p).read_bytes(); assert sha(b) == h, str(p)
    return {'path':str(p), 'sha256':h, 'bytes':len(b)}

pins = {
 'integration/coac249-311-native-fidelity-owner-handoff-20261028.md':'604be171ec1ee06e4bac4d639e0c36581c1578fb09c0d0275b964a33be40ad66',
 'integration/coac244-311-native-proposal-20261028/presentation-proposal.json':'ca5792a85433de54d0bfa82649a3707707ef64747d3beb5f8944a5bec372ad97',
 'integration/coac249-311-native-fidelity-reviewed-20261028.json':'9245894ecccf7e94f3fac8f3b5e177d5014d29a8f99baca40bb31e892afc22c6',
 'audit/calls/47c48143-2aaf-433f-829d-91aa9b07461d.json':'f68c9936f06e16b29110f3789756cc17f7f54332dc7fb5ec37fefb70df3b1268',
 'integration/coac249-311-native-fidelity-inheritance-20261028.json':'a9684639e2bc0a49888ba114a25e57305623e6db0fe4d026f38bff207738c765',
 'integration/coac249-311-native-mandatory-display-20261028.json':'5502384c26e5e939284b07b9a2ee073a4a75043926acfb1ac4ecaaf72c2c3b12',
}
primary = [bound(ROOT/p,h) for p,h in pins.items()]
proof=read(ROOT/'integration/coac249-311-native-fidelity-inheritance-20261028.json')
receipt=read(ROOT/'integration/coac249-311-native-fidelity-reviewed-20261028.json')
scope=read(ROOT/'integration/coac249-311-native-mandatory-display-20261028.json')
raw=read(receipt['raw']['path']); proposal=read(receipt['proposal']['path'])
verified=[]; unavailable=[]
for ref in proof['refs']:
    p=pathlib.Path(ref['path'])
    if p.exists():
        got=bound(p,ref['sha256']); assert got['bytes']==ref['bytes']; verified.append(got)
    elif p.name=='review.mjs':
        b=subprocess.run(['git','show','agent/mika/coac-249:artifacts/a249-311-native-review/review.mjs'],check=True,capture_output=True).stdout
        assert sha(b)==ref['sha256'] and len(b)==ref['bytes']
        alias=OUT/'review-original.mjs'; alias.write_bytes(b)
        verified.append({**ref,'recoveredFrom':'agent/mika/coac-249:artifacts/a249-311-native-review/review.mjs','localAlias':alias.name})
    else:
        assert p.name in ['admission-0-preview.json','admission-0-register.json','admission-1-preview.json','admission-1-register.json'], str(p)
        unavailable.append({**ref,'classification':'historical-dedupe-snapshot-only','replayed':False,'currentStateIndependentlyChecked':True})
assert len(verified)==148 and len(unavailable)==4
manifest=read(receipt['runtime']['path']); bound(receipt['runtime']['path'],receipt['runtime']['sha256'])
rt=pathlib.Path(receipt['runtime']['path']).parent
for f in manifest['files']: bound(pathlib.Path(f['path']) if pathlib.Path(f['path']).is_absolute() else rt/f['path'],f['sha256'])
assert len(manifest['files'])==28

# Run the existing eighteen rejection checks without writing its sealed checks.json.
sys.path.insert(0,str(PACK)); import build, check
suppressed=[]; build.write=lambda *args,**kwargs:suppressed.append(str(args[0]))
originalChecks=(PACK/'checks.json').read_bytes()
mechanical=check.check(ROOT,PACK)
assert (PACK/'checks.json').read_bytes()==originalChecks
save('proposal-check.json',{'result':mechanical,'originalChecksUnchanged':True,'writesSuppressed':suppressed})

assert raw['output']==json.loads(raw['rawLastMessage'])==receipt['modelReview']==scope['modelReview']
assert receipt['verificationError'] is None
assert receipt['verification']['executionVerified'] is True
assert receipt['verification']['limitedFidelityAccepted'] is False
assert scope['conditionalAcceptanceExplicitInModel'] is True
assert raw['output']['actualFidelityGaps']==[]
assert all(x['verdict']=='faithful' for x in raw['output']['figureChecks'])
assert len(raw['output']['figureChecks'])==8
assert len(scope['mandatoryDisplayConditions'])==10 and len(proposal['editorialNotes'])==8
assert raw['output']['handAImpact']['sourceFidelityGap'] is False
assert raw['output']['handAImpact']['disposition']=='inherited-source-limit-with-mandatory-note'
assert raw['output']['editorialLimitsSufficient'] is False
assert scope['implementationVerified'] is False and scope['admissionGranted'] is False
assert receipt['wholeChapterPassed'] is False
plan=read(receipt['plan']['path']); contract=read(receipt['requestContract']['path'])
payload=json.loads(plan['prompt'][plan['prompt'].index('\n\n')+2:])
assert len(payload['orderedPairs'])==225
assert len(proposal['body']['blocks'])==225 and len(proposal['figures'])==21
assert sum(x['type']=='text' for x in proposal['body']['blocks'])==204
source=read(receipt['source']['path']); parent=read(receipt['parent']['path'])
assert proposal['body']==parent['body']
for i,x in enumerate(payload['orderedPairs']):
    assert x['source']==source['blocks'][i]
    assert x['candidateBlock']==proposal['body']['blocks'][i]
    fid=x['candidateBlock'].get('figureId')
    assert x['proposalFigure']==next((f for f in proposal['figures'] if f['figureId']==fid),None)
targets=set(receipt['targetFigureIds'])
assert len([f for f in proposal['figures'] if f['figureId'] not in targets])==13
for f in proposal['figures']:
    if f['figureId'] not in targets: assert f==next(p for p in parent['figures'] if p['figureId']==f['figureId'])
restored=copy.deepcopy(proposal['figures'])
diffs=read(PACK/'derivation.json')['changes']; assert len(diffs)==24
for d in diffs:
    _,kind,index,key=d['path'].split('/'); assert kind=='figures'
    assert restored[int(index)][key]==d['to']; restored[int(index)][key]=d['from']
assert restored==parent['figures']
old=read(receipt['inheritedReceipt']['path']); oldraw=read(receipt['inheritedRaw']['path'])
assert old['modelReview']==oldraw['output']==payload['originalIndependentReview']
assert len(oldraw['output']['targetChecks'])==8 and len(oldraw['output']['unknownImpacts'])==40 and len(oldraw['output']['issues'])==10
assert old['verification']['repairPassed'] is False and old['verification']['limitedUnknownOkay'] is False
ledger=[json.loads(x) for x in (ROOT/'audit/calls.jsonl').read_text(encoding='utf-8').splitlines() if x.strip()]
rows=[x for x in ledger if x['callId']==receipt['call']['callId']]; assert len(rows)==1
assert rows[0]==receipt['call']
assert raw['requestExecution']['images']==receipt['images'] and len(receipt['images'])==9
for i,im in enumerate(receipt['images']):
    got=bound(im['path'],im['sha256']); assert got['bytes']==im['bytes']
    assert plan['images'][i]==im['path']
assert raw['requestExecution']['model']=='gpt-6.1-terra' and raw['requestExecution']['reasoningEffort']=='max'
assert raw['schema']==plan['schema'] and raw['prompt']==plan['prompt']
save('bindings.json',{'primary':primary,'verifiedDependencies':verified,'unavailableHistoricalSnapshots':unavailable,'runtimeFiles':28})
save('display-map.json',{
 'schema':'coac250-311-native-display-interface-map/1','canonical':receipt['canonical'],
 'proposal':receipt['proposal'],'receipt':{'path':str(ROOT/'integration/coac249-311-native-fidelity-reviewed-20261028.json'),'sha256':pins['integration/coac249-311-native-fidelity-reviewed-20261028.json']},
 'existingEightNotes':proposal['editorialNotes'],'mandatoryConditions':scope['mandatoryDisplayConditions'],
 'handAImpact':scope['handAImpact'],'authorText':False,'implementationVerified':False,
 'sourceNotePolicy':'Preserve immutable sourceNotes. Suppress incorrect historical attachment pairing only in display and install the exact mandatory attachment notice. Bind all images to original source SHA, not adjacent historical numbers.',
 'requiredStageContract':{'positions':225,'authorTextBlocks':204,'completeFigures':21,'existingNotes':8,'mandatoryConditions':10,'removeNotesRestoresAuthorBodyExactly':True,'allOriginalImageBytesRequired':True,'historicalArrayLabelsAndUnknownsPreserved':True},
 'admissionGranted':False,'actualMcpArenaReadbackCompleted':False
})
save('verification.json',{
 'schema':'coac250-311-native-evidence-verification/1','canonical':receipt['canonical'],
 'evidenceReverified':True,'verifiedDependencies':148,'unavailableHistoricalDedupeSnapshots':4,'runtimeFiles':28,
 'sourcePositions':225,'authorTextBlocks':204,'figures':21,'unchangedNonTargetFigures':13,'restoredLeafChanges':24,
 'existingNotes':8,'mandatoryConditions':10,'images':9,'ledgerRowsForCall':1,
 'nativeDisplayVerdict':raw['output']['nativeDisplayVerdict'],'actualFidelityGapCount':0,
 'conditionalAcceptanceExplicitInModel':True,'originalEditorialLimitsSufficient':False,'originalLimitedFidelityAccepted':False,
 'oldEightUncertainFortyImpactsTenIssuesPreserved':True,'newModelCalls':0,'newProductionCalls':0,
 'displayImplementationVerified':False,'admissionGranted':False,'actualMcpArenaReadbackCompleted':False,
 'minimumRemainingGap':'Exact 311 native-proposal admission/stage/staged-verifier contract, installation of 8 original notes and 10 mandatory conditions, then real global MCP/Arena readback. No new semantic review or 144-point recovery required.'
})
print(json.dumps({'verified':True,'refs':len(verified),'historicalUnavailable':len(unavailable),'positions':225,'mandatoryConditions':10,'newCalls':0}))
