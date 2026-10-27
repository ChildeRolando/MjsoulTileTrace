"""Zero-model intake of the bounded independent second-tile verdict."""
import copy
import hashlib
import io
import json
import pathlib
import subprocess
from datetime import datetime, timezone
from PIL import Image

ROOT = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
LOCAL = pathlib.Path(__file__).resolve().parent
LOCAL.mkdir(parents=True, exist_ok=True)
CID = '20ba52ad-a36c-4edb-b7aa-ae8ff9b89ec6'
COMMIT = 'af82e36b5704125dc500b1267b6b0c4dfb17a4bb'
PREFIX = '.multica/delivery/coac249-p217-second-20261028/'
def digest(b): return hashlib.sha256(b).hexdigest()
def read(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def write(p, x): pathlib.Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def sha(p): return digest(pathlib.Path(p).read_bytes())
hp = ROOT/'integration/coac249-p217-second-point-20261028.json'
assert sha(hp) == 'b1ee9973976f05f59d32acc9594e78b4d6dc2928a8061bc82a009b709c5cc70d'
h = read(hp)
ap = ROOT/'audit/point-adjudications/coac249-p217-second-20261028'
v = read(ap/'verification.json'); receipt = read(ap/'receipt.json'); raw = read(ap/'raw.json')
for b in [v['handoff'],v['receipt'],v['raw'],h['previousFirstTileResult']['raw']]:
    assert sha(b['path']) == b['sha256']
assert receipt == h['pointReceipt'] and receipt['result'] == raw['output']
assert raw['success'] and raw['callId'] == CID and not raw['timedOut']
assert receipt['classification'] == 'readable' and raw['output']['tileCode'] == '9m'
assert raw['output']['targetBBox'] == [174,325,196,357]
assert receipt['newCalls'] == 1 and receipt['retry'] == 0 and h['additionalBudget'] == 0
request = raw['requestExecution']
assert request['model'] == 'gpt-6.1-terra' and request['reasoningEffort'] == 'max'
assert request['args'][request['args'].index('--model')+1] == 'gpt-6.1-terra'
assert 'model_reasoning_effort="max"' in request['args']
assert len(request['images']) == 5
assert [request['args'][i+1] for i,x in enumerate(request['args']) if x == '-i'] == [x['path'] for x in request['images']]
images = []; restored = []
for i,b in enumerate(request['images']):
    # Temporary producer worktree is gone; recover the exact committed request bytes.
    relative = b['path'].replace('\\','/').split(PREFIX,1)[1]
    data = subprocess.check_output(['git','cat-file','blob',COMMIT+':'+PREFIX+relative])
    assert digest(data) == b['sha256'] and len(data) == b['bytes']
    image = Image.open(io.BytesIO(data)).convert('RGB'); images.append(image)
    dest = LOCAL/'inputs'/f'{i+1}-{pathlib.Path(relative).name}'; dest.parent.mkdir(exist_ok=True)
    dest.write_bytes(data)
    restored.append({'recordedPath':b['path'],'gitCommit':COMMIT,'gitPath':PREFIX+relative,
                     'sha256':digest(data),'bytes':len(data),'localPath':str(dest.relative_to(LOCAL))})
original,context,context4,target,target4 = images
assert original.size == (430,463)
assert original.crop((143,292,240,362)).tobytes() == context.tobytes()
assert context.resize((context.width*4,context.height*4),Image.Resampling.NEAREST).tobytes() == context4.tobytes()
assert original.crop((174,325,196,357)).tobytes() == target.tobytes()
assert target.resize((target.width*4,target.height*4),Image.Resampling.NEAREST).tobytes() == target4.tobytes()
packet = ROOT/'integration/coac244-text-contract-fix-20261028/p217-second-tile-packet/packet.json'
assert sha(packet) == h['target']['packetSha256']
p = read(packet)
assert sha(p['sourceImage']['path']) == h['target']['sourceImageSha256']
runtime = ROOT/'audit/runtimes/coac244-vision-terra-max-v1-20261027'
manifest = runtime/'runtime-manifest.json'
assert sha(manifest) == h['runtimeManifestSha256']
for f in read(manifest)['files']: assert sha(runtime/f['path']) == f['sha256']
candidate = pathlib.Path(h['target']['candidatePath']); candidate_bytes = candidate.read_bytes(); c = read(candidate)
assert digest(candidate_bytes) == h['target']['candidateSha256']
assert c['source']['pageDataSha256'] == h['target']['sourceFileSha256']
assert c['figures'][0]['chapterId'] == '79-cn-chapter-217-4'
assert c['figures'][0]['sourceImageBlockIds'] == ['79-cn-p217-b8']
assert h['comparison']['existingNorthDiscardLine'] in c['figures'][0]['transcription']
assert c['figures'][0]['unknowns'] and h['comparison']['newReadingMatchesCandidate']
inv_path = LOCAL.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
inv_bytes = inv_path.read_bytes(); inv = read(inv_path); before = copy.deepcopy(inv)
row = next(x for x in inv['objects'] if x['objectId'] == '79-cn:page:217')
assert row['candidateSha256'] == digest(candidate_bytes) and row['auditStatus'] == 'needs-repair'
assert CID not in json.dumps(row)
now = datetime.now(timezone.utc).isoformat()
entry = {'recordedAt':now,'callId':CID,'chapterId':'79-cn-chapter-217-4','figureId':'79-cn-p217-r1',
    'sourceImageBlockId':'79-cn-p217-b8','bbox':[174,325,196,357],'classification':'readable','tileCode':'9m',
    'handoff':v['handoff'],'receipt':v['receipt'],'raw':v['raw'],'model':request['model'],'reasoningEffort':request['reasoningEffort'],
    'usage':raw['usage'],'durationMs':raw['durationMs'],'manifestSha256':sha(manifest),'remoteWeights':'unknown',
    'candidateMatches':True,'candidateChanged':False,'revisionRequiredForThisPoint':False,
    'historical8mReadingsPreserved':True,'majorityVoteUsed':False,'pageOrChapterPassed':False,
    'limits':h['remainingLimits'],'newCallsBy249':1,'newCallsByThisIntake':0,'additionalBudget':0,
    'sourceResolutionLimitation':raw['output']['uncertainty'],'visualReasonFromIndependentCall':raw['output']['visualEvidence']}
row['firstTilePointEvidence'] = copy.deepcopy(row['latestPointEvidence'])
row['latestPointEvidence'] = v['handoff']
row['secondTilePointIntake'] = entry
row['currentDisposition'] = 'quarantined-rev5-second-tile9m-supported-first-and-west-unknown-remain'
row['nextAction'] = 'Keep second tile9m unchanged with new exact-coordinate evidence and historical8m disagreement. First-tile unknown requirement and west unknown remain; no production/review or acceptance promotion authorized.'
inv['point217SecondIntake20261028'] = {'evidence':'coac248-p217-second-intake-20261028/intake-receipt.json',
    'callId':CID,'newCalls':0,'candidateEdits':0,'countsUnchanged':True,'additionalBudget':0}
inv['refreshedAt'] = now
changed = [i for i,(a,b) in enumerate(zip(before['objects'],inv['objects'])) if a!=b]
assert len(changed) == 1 and inv['countsCurrent'] == before['countsCurrent']
assert inv['productionFailureHistory'] == before['productionFailureHistory']
op = ROOT/'integration/coac248-repair-handoff-20261027.json'; ob = op.read_bytes(); owner = read(op)
old_items = copy.deepcopy(owner['items'])
owner_item = next(x for x in owner['items'] if x.get('kind') == 'pdf-page-point-evidence' and x.get('chapterId') == '79-cn-chapter-217-4')
assert CID not in json.dumps(owner_item)
owner_item['secondTilePointIntake'] = entry
owner_item['disposition'] = row['currentDisposition']
owner['feedbackUpdatedAt'] = now
assert op.read_bytes() == ob and inv_path.read_bytes() == inv_bytes
assert candidate.read_bytes() == candidate_bytes
for name in ['raw.json','receipt.json','verification.json','handoff.json','attempt.json']:
    (LOCAL/('independent-'+name)).write_bytes((ap/name).read_bytes())
assert (LOCAL/'independent-handoff.json').read_bytes() == hp.read_bytes()
inv_path.write_text(json.dumps(inv,ensure_ascii=False,indent=1)+'\n',encoding='utf-8')
write(op,owner)
write(LOCAL/'intake-receipt.json',{'schema':'coac248-p217-second-point-intake/1','recordedAt':now,
    'result':entry,'requestExecution':request,'restoredInputs':restored,'pixelVerification':'Exact original/context/target/nearest4x; no semantic re-reading or generated detail.',
    'runtimeFilesReverified':27,'upstreamProtectedInputCount':v['protectedFilesUnchanged'],
    'currentCandidateSha256':sha(candidate),'candidateUnchanged':True,
    'firstTileEvidencePreserved':h['previousFirstTileResult'],'westUnknownPreserved':c['figures'][0]['unknowns'],
    'changedInventoryRows':changed,'unrelatedRowsPreserved':62,'countsUnchanged':True,'failureHistoryUnchanged':True,
    'ownerUpdate':{'path':str(op),'beforeSha256':digest(ob),'afterSha256':sha(op),'existingItemCountUnchanged':len(owner['items'])==len(old_items)},
    'newCalls':0,'newCandidates':0,'newPageAudits':0,'additionalBudget':0,'issueStatus':'in_progress'})
write(LOCAL/'owner-updated-item.json',owner_item)
print(json.dumps({'callIntake':CID,'newCalls':0,'candidateUnchanged':True,'exactPayloadFilesVerified':5,'changedRows':changed}))
