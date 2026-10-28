import hashlib,json,subprocess
from pathlib import Path
from datetime import datetime,timezone
HERE=Path(__file__).resolve().parent
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
STAGE=ROOT/'web-production/v1/runs/coac269-283-0785-v1-20261028'
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f: f.write(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def bind(p):
    p=Path(p);b=p.read_bytes();return {'path':str(p),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
def platform(args):
    cp=subprocess.run(['multica',*args,'--output','json'],capture_output=True,text=True,encoding='utf-8',check=True)
    return json.loads(cp.stdout)
c=read(HERE/'contract.json');r=read(HERE/'result.json');proof=read(HERE/'selfcheck.json');pre=read(HERE/'preflight.json')
assert r['exitCode']==0 and r['productionCallsRecorded']==1 and r['independentCallsHere']==0
assert proof['passed'] and proof['reviewRequestBuiltNotSent']
candidate=r['candidate'];needle=candidate['sha256'];assert bind(candidate['path'])['sha256']==needle
active=platform(['issue','runs','01a17471-1595-79d5-bdfa-6feaa65172c0','--active'])
rules=platform(['issue','wakeup','list','01a17471-1595-79d5-bdfa-6feaa65172c0'])
duplicates=[x for x in rules if needle in x.get('instruction','')]
ledger=ROOT/'audit/calls.jsonl'
same=[json.loads(line) for line in ledger.read_text(encoding='utf-8').splitlines() if needle in line]
receipts=[str(p) for p in (ROOT/'audit/web').rglob('*'+needle+'*')]
stage_markers=[str(p) for p in STAGE.rglob('*') if p.is_file() and any(s in p.name.lower() for s in ('dispatch','audit','checkpoint','receipt'))]
dedup={'at':datetime.now(timezone.utc).isoformat(),'active249':active,'sameCandidateRules':duplicates,'auditLedgerRows':same,'sameSHAReceiptPaths':receipts,'stageDispatchAndReceiptPaths':stage_markers,'candidate':candidate}
write(HERE/'review-dedup.json',dedup)
assert not active and not duplicates and not same and not receipts
# The sole existing stage dispatch is the maker, never an independent-audit marker.
assert all(Path(p).name=='dispatch-started.json' for p in stage_markers),stage_markers
for n in ['preflight.json','selfcheck.json','exact-diff.json']:
    write(STAGE/n,read(HERE/n))
handoff={'schema':'coac269-283-0785-seat-first-independent-target-review/1',
 'authorization':{'issue':'01a17cae-06e4-7b30-a93f-3a030d1ae63f','comment':'01a18193-7e18-7193-8ca8-89c80dae4edd'},
 'canonical':'nemata-jp-chapter-283-1','targetId':c['targetId'],'candidate':candidate,
 'source':c['source'],'parent':c['parent'],'parentAudit':c['parentAudit'],'reviewedDonor':c['donor'],'donorAudit':c['donorAudit'],'donorReview':c['donorReview'],
 'packet':c['packet'],'recoveryManifest':c['recoveryManifest'],'b1017Pass':c['b1017Pass'],
 'runtime':pre['runtime'],'runtimeFiles':34,'entry':str(ROOT/'audit/runtimes/coac269-283-0785-v1-20261028/b0785.mjs'),
 'prepareFunction':'prepare0785Review','verifyProductionFunction':'verify0785Production','verifyReviewFunction':'verify0785ReviewExecution',
 'reviewRequest':bind(STAGE/'review-request.json'),'preflight':bind(STAGE/'preflight.json'),'selfcheck':bind(STAGE/'selfcheck.json'),'exactDiff':bind(STAGE/'exact-diff.json'),
 'realMaker':r['calls'][0],'productionRaw':proof['productionProof']['raw'],
 'budget':{'maximumTotal':2,'makerUsed':1,'independentUsedHere':0,'remainingIndependentMaximum':1,'failedVoidCount':True,'automaticRetries':0},
 'images':c['images'],'actualReviewConfiguration':{'model':'gpt-6.1-terra','reasoningEffort':'max','policy':'coac244-vision-production-schema-v2-20261028'},
 'scope':{'bodyBlocksUnchanged':1195,'nonTargetBlocksUnchanged':1194,'nonTargetFiguresUnchanged':523,'donorOnlySeatChange':['左上东、右上北、左下南、右下西','左上西、右上北、左下南、右下东'],'allDonorUnknownsPreserved':True,'wholeChapterAccepted':False,'b0947NotAssembled':True},
 'callCollection':'Existing249 owner only, existing STOP/claim/audit guard; exactly one invokeTextbookCodex with the frozen prepared plan. Preserve real raw even on failure and standard unique audit/calls.jsonl plus scoped receipt/checkpoint binding this exact candidate, source,parent,donor,contract,runtime. No retry or second consumer.',
 'validation':'Recompute all manifest/source/parent/donor/raw/image hashes, run verify0785Production and prepare0785Review(root,candidatePath,manifestSHA). Compare actual closed prompt/schema/images against reviewRequest. Verify real response via verify0785ReviewExecution(result,plan,manifestSHA) and the full published strict output schema; keep raw/modelReview unchanged. Output has separate targetPassed and limitedUnknownOkay. A target seat pass does not resolve unknowns or accept the chapter.',
 'boundary':'Complete16 ordered pairs: nine definitions plus Q48 b0784-b0790;4 images original JPG/inline8s/nearest originalx2/central seatx4. No new tile reading or guesses. Only reviewed east/west seat swap plus honest retained-unknown teaching impact. Do not audit other figures or b0947.',
 'legacyGate':'The existing whole-chapter machinery does not recognize this exact bounded donor assembly. Its parent needs-repair refusal stays unchanged. Use the explicit frozen target supplement entry, not auditWebCandidate or a fake generic passed aggregate. No gate relaxation or historical receipt on newSHA.',
 'nextAction':'249 returns one real independent scoped result to269 current authorization thread and existing244/250 aggregation. Keep chapter needs-repair, no active/integration switch. b1017/1181/0168/0396/0962/six tables/Q8/batch010 inherit unchanged content and prior exact evidence, no paid repeat. b0947 rev2 assembly belongs to244/250 separately.',
 'monetaryCost':None,'remoteWeights':None,'upstreamExecutionCount':None}
dest=ROOT/'integration/coac269-283-0785-handoff-249-20261028.json'
write(dest,handoff);write(HERE/'handoff-249.json',handoff)
print(json.dumps({'handoff':bind(dest),'independentCallsHere':0,'remainingIndependentMaximum':1,'dedupPassed':True}))
