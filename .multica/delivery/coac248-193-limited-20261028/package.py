"""Persist exact193 external proof; update only this row in existing repair owners."""
import copy,datetime,json,pathlib,shutil,hashlib
from verify import verify,P,R,PIN,load
L=pathlib.Path(__file__).resolve().parent
S=R/'integration/coac248-193-limited-20261028';S.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
proof=verify();write(L/'proof.json',proof)
receipt=load(P)
archive=[]
for ref,name in [(proof['candidate'],'candidate.json'),(proof['source'],'source.json'),(proof['oldAudit'],'audit.json'),
 (proof['independentReceipt'],'receipt.json'),(proof['raw'],'raw.json'),(proof['request'],'request.json'),
 (proof['separatePdfSupplement'],'pdf-bodies.json')]:
 dest=L/'evidence'/name;dest.parent.mkdir(exist_ok=True);shutil.copyfile(ref['path'],dest)
 assert sha(dest)==ref['sha256'];archive.append({'originalPath':ref['path'],'deliveryPath':'evidence/'+name,'sha256':ref['sha256']})
write(L/'path-map.json',{'files':archive})
manifest={'schema':'coac248-exact193-zero-proof-files/1','canonical':PIN['canonical'],
 'files':[{'path':n,'sha256':sha(L/n)} for n in ['verify.py','verify_test.py','gates.mjs','gates.json','proof.json','path-map.json']],
 'modelCalls':0,'candidateChanged':False,'oldRawOrAuditChanged':False}
write(L/'manifest.json',manifest)
handoff={'schema':'coac248193-existing-consumer-limited-fidelity-handoff/1','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'canonical':PIN['canonical'],'candidate':proof['candidate'],'source':proof['source'],'oldAudit':proof['oldAudit'],
 'proof':{'path':str(S/'proof.json'),'sha256':sha(L/'proof.json')},
 'manifest':{'path':str(S/'manifest.json'),'sha256':sha(L/'manifest.json')},
 'commands':[f'python -X utf8 {S.as_posix()}/verify.py',f'python -X utf8 {S.as_posix()}/verify_test.py',f'E:/IDE/NodeJS/node.exe {S.as_posix()}/gates.mjs'],
 'independentReceipt':proof['independentReceipt'],'raw':proof['raw'],'request':proof['request'],'target':proof['target'],
 'currentCandidateMeetsIndependentDisplayConditions':True,'candidateEditsNeeded':False,'newNoteNeededInCandidate':False,
 'requiredDisplayLimitations':receipt['modelReview']['requiredDisplayLimitations'],
 'unresolvedSourceVersionLimitations':proof['remainingUncertain'],
 'parentTargetImageCheckUncertainPreserved':proof['originalImageChecksPreserved'][-1],
 'separatePdfSourceVersion':{'chapterId':'79-cn-chapter-193-4-pdf193-supplement','alreadyIntegrated':True,
 'proof':proof['separatePdfSupplement'],'webTextUntouched':True,'countAsNewOriginalChapterAgain':False},
 'newModelCalls':0,'newProductionCalls':0,'readingTodoRemoved':True,'newReadingOrReviewBudget':0,
 'standardWholeArticlePassed':False,'admissionGranted':False,'coverageIncrementClaimed':0,
 'specificRemainingExecution':[
  {'owner':'existing COAC-244','action':'Pin only193 exact source/candidate/old-audit/target/bbox/raw and the two separately sourced PDF excerpts in existing limited-fidelity admission. The159/242 adapter currently rejects193; it requires one sole uncertain image/block whereas193 retains four source-fragment block checks and the target image as uncertain. Preserve those originals and implement the exact combined source-version/limited-unknown scope, not a generic ordinary-passed exception.'},
  {'owner':'existing COAC-250','action':'After lawful precise admission, incrementally stage current unchanged Web193 alongside already-integrated separate PDF193 supplement. Real MCP/Arena readback must show the explicit right-row2-col2 unknown, original red circles, author qualifiers, 7p limited two-sided-wait claim and5m wording/context, and separate-PDF version label; do not claim a complete reconstructed board or all-strategy safety.'},
  {'owner':'existing delivery environment owner','action':'Original250193 wakeup failed before start during worktree checkout: _analysis/coac250-217-display/route-stage/stages/pdf-79-cn-chapter-217-4/assets/full-f0129fbfa6a40d950650da302f380ad8d640433c3295ce1d434bf0dcafbaab78.png Filename too long. Preserve failed run01a17f9a-6a5e-7148-99c7-3b35a676bd0a and fix shortest-path delivery aliases in its own branch before one explicit original-run recovery. 248 did not switch branch, retry it, or create a second consumer.'}],
 'dedupe':{'existing244Wakeup':'01a17f99-5131-71ab-ada6-9aaaa8965857','observed244Status':'queued',
 'original250Wakeup':'01a17f99-54c9-79f6-83d2-121eae8d62be','observed250Status':'failed-before-agent-start',
 'newWakeupsCreated':0,'208276Untouched':True},
 'newSemanticModelGapIdentified':False,
 'note':'No full chapter pass is manufactured. Web fragment uncertainty remains explicitly bounded by the separately labelled existing independent PDF source version; the target unknown is no longer a digit-reading todo.'}
write(L/'handoff.json',handoff)
stage={'recordedAt':handoff['recordedAt'],'status':'limited-unknown-author-fidelity-proven-awaiting-exact-admission-and-readback',
 'candidateSha256':PIN['candidate'],'proof':handoff['proof'],'handoff':{'path':str(S/'handoff.json'),'sha256':sha(L/'handoff.json')},
 'point':proof['target'],'newModelCalls':0,'pointReadingTodo':False,'newCandidateNeeded':False,
 'sourceFragmentUncertainPreserved':True,'pdfSupplementSeparateVersion':True,
 'remaining':'Exact193 scope admission; repair250 pre-start long-path failure in its own branch; lawful integration and realMCP/Arena readback. No additional model review or reading.',
 'admissionGranted':False,'standardWholeArticlePassed':False}
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d);row=next(x for x in d['objects'] if x.get('chapterId')==PIN['canonical'])
row['limited193Fidelity20261028']=stage;row['currentDisposition']=stage['status'];row['nextAction']=stage['remaining']
assert all(x==y for x,y in zip(before['objects'],d['objects']) if x.get('chapterId')!=PIN['canonical'])
assert d['countsCurrent']==before['countsCurrent']
write(inventory,d,indent=1)
owner=R/'integration/coac248-repair-handoff-20261027.json';beforebytes=owner.read_bytes();o=load(owner);old=copy.deepcopy(o)
items=[x for x in o['items'] if x.get('chapterId')==PIN['canonical']]
if not items:o['items'].append({'kind':'193-limited-unknown-source-version-intake','chapterId':PIN['canonical'],'candidateSha256':PIN['candidate'],'limited193Fidelity20261028':stage})
else:
 for x in items:x['limited193Fidelity20261028']=stage
assert owner.read_bytes()==beforebytes
write(owner,o)
closure=R/'integration/coac244-remaining26-closure-register-20261028.json';cb=closure.read_bytes();cl=load(closure);previous=copy.deepcopy(cl)
cr=next(x for x in cl['rows'] if x['chapterId']==PIN['canonical']);cr['limited193Fidelity20261028']=stage;cr['nextAction']=stage['remaining']
assert all(x==y for x,y in zip(previous['rows'],cl['rows']) if x['chapterId']!=PIN['canonical'])
assert closure.read_bytes()==cb;write(closure,cl)
write(L/'owner-update.json',stage)
for p in L.iterdir():
 if p.is_file() and p.suffix in ['.py','.mjs','.json','.md']:(S/p.name).write_bytes(p.read_bytes())
shutil.copytree(L/'evidence',S/'evidence',dirs_exist_ok=True)
print(json.dumps({'handoffSha256':sha(L/'handoff.json'),'proofSha256':sha(L/'proof.json'),'conditionsMapped':8,'currentCandidateUnchanged':True,'newModelCalls':0}))
