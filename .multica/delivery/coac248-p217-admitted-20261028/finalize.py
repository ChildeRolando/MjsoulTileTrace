import copy,hashlib,json,pathlib,shutil,zipfile
from datetime import datetime,timezone
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing');L=pathlib.Path(__file__).resolve().parent
B='integration/coac248-p217-admitted-20261028';S=R/B
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
a=load(L/'native-inline-field-corrections.p217.root-acceptance.json');v=load(L/'verification.json')
assert v['nonTargetSerializedBytesRestoredToParentSha256']==a['parent']['sha256']
assert 'pass 22' in (L/'tests.log').read_text(encoding='utf-8-sig')
for item in a['inputs'].values():
 assert sha(R/item['path'])==item['sha256']
 assert sha(item['originalPath'])==item['sha256'],item['originalPath']
assert sha(R/a['candidate']['path'])==a['candidate']['sha256']
files=['runtime/textbook-audit-pdf-native-corrections.mjs','runtime/textbook-audit-pdf-p217-correction.mjs',
 'verify.mjs','correction.test.mjs','native-inline-field-corrections.p217.root-acceptance.json']
manifest={'schema':'coach-zero-call-pdf-correction-runtime/1','scope':'79-cn:217 exact legacy bridge only',
 'newModelCalls':0,'productionModelConfigurationChanged':False,
 'originalCorrectionLoaderSha256':'31b8c8022ab00e8f3f89d85d8889ad9f1fd61269d6449da736c0ab142b90f74b',
 'existingPinsUnchanged':8,'files':[{'path':f,'sha256':sha(L/f)} for f in files]}
write(L/'runtime-manifest.json',manifest)
now=datetime.now(timezone.utc).isoformat()
h={'schema':'coac248-p217-exact-revision-handoff/1','recordedAt':now,'from':'COAC-248','to':'COAC-249',
 'authorizationComment':'01a17f03-f390-7185-930a-57862eabdc33','chapterId':'79-cn-chapter-217-4',
 'figureId':'79-cn-p217-r1','sourceBlockId':'79-cn-p217-b8','candidate':a['candidate'],'parent':a['parent'],
 'admission':{'path':'audit/source-corrections/native-inline-field-corrections.p217.root-acceptance.json','sha256':sha(L/'native-inline-field-corrections.p217.root-acceptance.json')},
 'runtime':{'path':B,'manifestSha256':sha(L/'runtime-manifest.json')},
 'proof':{'path':B+'/correction-proof.json','sha256':sha(L/'correction-proof.json')},
 'projection':{'path':B+'/assembled-display.json','sha256':sha(L/'assembled-display.json')},
 'verification':{'path':B+'/verification.json','sha256':sha(L/'verification.json')},
 'diff':{'path':B+'/diff.json','sha256':sha(L/'diff.json')},'inputBindings':a['inputs'],
 'commands':[
  f'& E:/IDE/NodeJS/node.exe {R.as_posix()}/{B}/verify.mjs {R.as_posix()}',
  f'& E:/IDE/NodeJS/node.exe --test {R.as_posix()}/{B}/correction.test.mjs'],
 'checks':{'testsPassed':22,'testsFailed':0,'actualExistingLoaderPassed':True,'nonTargetSerializedBytesUnchanged':True,
  'northSecond9mUnchanged':True,'northFirstUnknownInstalled':True,'westCoordinateUnknownInstalled':True,
  'noteActuallyProjectedAfter218Argument':True,'authorTextUnchanged':True,'rawOrOldAuditEdited':False},
 'nextAction':'249 only zero-call evidence consistency; verify independent scope/limitations and candidate+projection+parent SHA chain. If consistent, hand limited acceptance to250; no new model budget.',
 'modelCalls':0,'newSemanticReviewAuthorized':False,'pageOrChapterPassed':False,'activeChanged':False,
 'remainingItems':[
  {'id':'217-derived-evidence-consistency','owner':'COAC-249','action':'zero-call check of this exact SHA, inherited full-page review and three independent receipts; source-note/limited unknown contract, never majority vote'},
  {'id':'PDF218-220-full-coverage','owner':'existing244/250 chapter owner','action':'separate existing candidate/coverage acceptance; this218-b3 annotation projection is not whole218 candidate or whole217-4 pass'},
  {'id':'web-variant','owner':'existing244 owner','action':'original separate web candidate errors/unknowns unchanged'}],
 'closedPoints':{'northSecond':'9m already matches independent point; resolved, no change',
  'northFirst':'unknown with independent general-impact limitation, not5m/6m',
  'west':'independent limited-unknown-acceptable; all six premises independent, no rank recognition pending'}}
write(L/'handoff.json',h);write(R/'integration/coac248-p217-admitted-20261028.json',h)
stage={'recordedAt':now,'candidate':a['candidate'],'parentSha256':a['parent']['sha256'],
 'handoff':{'path':'integration/coac248-p217-admitted-20261028.json','sha256':sha(L/'handoff.json')},
 'deterministicVerification':v,'runtimeManifestSha256':sha(L/'runtime-manifest.json'),
 'status':'exact-fields-and-note-installed-pending-249-zero-call-consistency','newCalls':0,
 'oldRawAndAuditsUnchanged':True,'oldSelectedRev5StillQuarantined':True,'passed':False,
 'remainingItems':h['remainingItems'],'recognitionOrWestImpactReReviewNeeded':False}
inventory=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json'
d=load(inventory);before=copy.deepcopy(d)
row=next(x for x in d['objects'] if x['objectId']=='79-cn:page:217')
row['exactAssembly20261028']=stage
row['currentDisposition']=stage['status']
row['nextAction']='249 zero-call consistency of derived a3b8eaf8 + proof +218 annotation projection; then250 limited acceptance only; no model calls.'
row['integrationAllowed']=False
assert all(x==y for x,y in zip(d['objects'],before['objects']) if x['objectId']!='79-cn:page:217')
assert d['productionFailureHistory']==before['productionFailureHistory']
inventory.write_text(json.dumps(d,ensure_ascii=False,indent=1)+'\n',encoding='utf-8',newline='\n')
owner=R/'integration/coac248-repair-handoff-20261027.json';o=load(owner);before=copy.deepcopy(o)
row=next(x for x in o['items'] if x.get('chapterId')=='79-cn-chapter-217-4' and x.get('kind')=='pdf-page-point-evidence')
row['exactAssembly20261028']=stage;row['nextAction']=stage['status']
assert all(x==y for x,y in zip(o['items'],before['items']) if x.get('chapterId')!='79-cn-chapter-217-4')
write(owner,o);write(L/'owner217-update.json',row)
write(L/'round.json',stage)
for p in L.rglob('*'):
 if p.is_file() and p.suffix!='.zip':
  target=S/p.relative_to(L);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(p.read_bytes())
with zipfile.ZipFile(L/'evidence-bundle.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in L.rglob('*'):
  if p.is_file() and p.suffix!='.zip':z.write(p,p.relative_to(L).as_posix())
print(json.dumps({'candidate':a['candidate'],'handoffSha256':sha(L/'handoff.json'),'runtimeManifestSha256':sha(L/'runtime-manifest.json'),'zipBytes':(L/'evidence-bundle.zip').stat().st_size},ensure_ascii=False))
