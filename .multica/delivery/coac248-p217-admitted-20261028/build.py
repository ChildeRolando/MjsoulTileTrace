"""Build one source-bound external PDF correction; never invoke a model."""
import copy,hashlib,json,pathlib,re
R=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
L=pathlib.Path(__file__).resolve().parent
B='integration/coac248-p217-admitted-20261028'
S=R/B
S.mkdir(parents=True,exist_ok=True)
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x):
 p=pathlib.Path(p);p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
plan=load(L.parent/'coac248-p217-west-implementation-20261028/implementation-plan.json')
chain=load(L.parent/'coac-248-native-inline-correction/receipt-p217-revision-chain-20261027.json')
inputs={}
def bind(id,path,expected=None):
 p=pathlib.Path(path)
 if not p.is_absolute():p=R/p
 h=sha(p)
 if expected:assert h==expected,(id,h,expected)
 target=L/'evidence'/id/(p.name)
 target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(p.read_bytes())
 rel=f'{B}/evidence/{id}/{p.name}'
 dest=R/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
 inputs[id]={'path':rel,'sha256':h,'originalPath':str(p)}
 return load(p) if p.suffix=='.json' else None
p=bind('parent',plan['parent']['path'],plan['parent']['sha256'])
bind('originalRaw',plan['originalRaw']['path'],plan['originalRaw']['sha256'])
bind('page217','79-cn/pages/217.json','f8de2eddd4ba2939ae40796ffd8d1d1f971d49474dede72d108e61809ef1d6f8')
bind('page218','79-cn/pages/218.json','83d1909e9e92a9622c46c9ba0ea46efca12bef60cb27ec5b35d72fcbd8f92abd')
bind('image','assets/64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978.png','64038b63bc4470d69f21b42e68d8285cf98d69b001dcf3bd9a250155da5f6978')
for rev in chain['chain']:
 bind(rev['rev'],rev['root']+'/candidates/79-cn/page-0217.json',rev.get('candidateFileSha256',rev.get('candidateSha256')))
 if rev['auditPath']:
  audit=bind('parentAudit' if rev['rev']=='rev4' else rev['rev']+'Audit',rev['auditPath'])
  for call in audit['calls']:
   bind(rev['rev']+'AuditRaw',f"audit/calls/{call['callId']}.json")
bind('north-first','integration/coac249-point-222-p217-20261028.json','60e2d281df88896c5675d1599f87dc8815bcaeb198e9a7a66fcfb21cfe2f69f9')
first=next(c for c in load(R/'integration/coac249-point-222-p217-20261028.json')['calls'] if c['callId']=='09362d05-d221-427e-b474-a79017ff7619')
bind('north-first-raw',first['raw']['path'],first['raw']['sha256'])
for key,file,h in [('north-second','coac249-p217-second-point-20261028.json','b1ee9973976f05f59d32acc9594e78b4d6dc2928a8061bc82a009b709c5cc70d'),('west-impact','coac249-p217-west-impact-20261028.json','1fe84448edbf053d6a61ea4bb550518d6a4875df566347b72964ad8f8a65dedd')]:
 handoff=bind(key,'integration/'+file,h)
 receipt=handoff.get('receipt',handoff.get('pointReceipt'))
 bind(key+'-raw',receipt['raw']['path'],receipt['raw']['sha256'])
bind('west-impact-receipt','audit/point-adjudications/coac249-p217-west-impact-20261028/receipt.json','5f2e2fd009758c3df6d435073bf1f9dcb80c6f033f06213d931a668ef957e18b')
bind('chapter-map','integration/chapter-map.json')
bind('ownership','integration/source-block-ownership.json')
bind('revision-chain',L.parent/'coac-248-native-inline-correction/receipt-p217-revision-chain-20261027.json')
bind('original-render','production/sol-high-fallback-finite-20261024-schemafix/renders/79-cn/page-0217-r1.png','106a64491e8136c516bc9138ef50eba7e15e953a31818c6296d4e65e407cfef0')
note={'kind':'non-author-limitation','chapterId':'79-cn-chapter-217-4','text':plan['note']['text'],
 **{k:v for k,v in plan['note']['placement'].items() if k!='beforeNextSection'},
 'evidenceIds':['north-first','north-second','west-impact']}
c=copy.deepcopy(p)
for change in plan['changes']:c['figures'][0][change['field']]=change['toValue']
c['editorialAnnotations']=[note]
n={'schema':'coach-native-inline-field-correction/1','route':'p217-exact-legacy-field-correction',
 'sourceId':'79-cn','page':217,'parentPath':inputs['parent']['path'],'parentSha256':inputs['parent']['sha256'],
 'newProductionModelCalls':0,'originalProductionRaw':inputs['originalRaw'],
 'sourcePageDataSha256':inputs['page217']['sha256'],'changes':plan['changes'],
 'editorialAnnotationPath':'/editorialAnnotations/0','evidenceIds':['north-first','north-second','west-impact'],
 'derivation':'external-deterministic-revision-not-model-output','inheritedRawUnknownCount':0,'parentUnknownCount':1,'derivedUnknownCount':2}
c['provenance']['sourceFieldCorrection']=n
c.pop('candidateSha256',None)
c['candidateSha256']=hashlib.sha256(json.dumps(c,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
cp=L/'page-0217.rev6.json'
# Preserve the parent's serialized bytes as well as its field values. Only the
# approved leaf spans, self-hash, and two explicit external-proof insertions move.
parent_text=pathlib.Path(inputs['parent']['originalPath']).read_bytes().decode('utf-8')
text=parent_text
def encoded(x,indent=0):
 s=json.dumps(x,ensure_ascii=False,indent=2)
 return s.replace('\n','\n'+' '*indent)
old=json.dumps(p['figures'][0]['transcription'],ensure_ascii=False)
assert text.count(old)==1
text=text.replace(old,json.dumps(c['figures'][0]['transcription'],ensure_ascii=False),1)
old='"unknowns": '+encoded(p['figures'][0]['unknowns'],6)
assert text.count(old)==1
text=text.replace(old,'"unknowns": '+encoded(c['figures'][0]['unknowns'],6),1)
decoder=json.JSONDecoder();start=text.index('"provenance": ')+len('"provenance": ')
_,end=decoder.raw_decode(text,start)
assert text[end-4:end]=='\n  }'
text=text[:end-4]+',\n    "sourceFieldCorrection": '+encoded(n,4)+text[end-4:]
needle='  "candidateSha256": '+json.dumps(p['candidateSha256'])
assert text.count(needle)==1
text=text.replace(needle,'  "editorialAnnotations": '+encoded([note],2)+',\n  "candidateSha256": '+json.dumps(c['candidateSha256']),1)
assert json.loads(text)==c
cp.write_bytes(text.encode());(S/cp.name).write_bytes(cp.read_bytes())
# Reversing just those changes must recover the complete parent file bytes.
back=text.replace('  "editorialAnnotations": '+encoded([note],2)+',\n','',1)
back=back.replace(json.dumps(c['candidateSha256']),json.dumps(p['candidateSha256']),1)
back=back.replace(',\n    "sourceFieldCorrection": '+encoded(n,4),'',1)
back=back.replace('"unknowns": '+encoded(c['figures'][0]['unknowns'],6),old,1)
back=back.replace(json.dumps(c['figures'][0]['transcription'],ensure_ascii=False),json.dumps(p['figures'][0]['transcription'],ensure_ascii=False),1)
assert back.encode()==pathlib.Path(inputs['parent']['originalPath']).read_bytes()
approval={'schema':'coach-pdf217-exact-field-admission/1','authorizationComment':'01a17f03-f390-7185-930a-57862eabdc33',
 'scope':'79-cn-chapter-217-4:79-cn-p217-r1 only; exact218-b3 editorial projection; no global unknown gate change',
 'candidate':{'path':f'{B}/{cp.name}','sha256':sha(cp)},'parent':inputs['parent'],
 'inputs':inputs,'sourceFieldCorrection':n,'note':note,
 'semanticEvidence':'Independent receipts retained verbatim; this approval is deterministic admission only',
 'modelCalls':0,'pageOrChapterPassed':False}
ap=L/'native-inline-field-corrections.p217.root-acceptance.json';write(ap,approval)
write(R/'audit/source-corrections'/ap.name,approval)
helper=L/'runtime/textbook-audit-pdf-p217-correction.mjs'
s=helper.read_text(encoding='utf-8');s=re.sub(r"admissionSha256='(?:PENDING|[a-f0-9]{64})'",f"admissionSha256='{sha(ap)}'",s)
helper.write_text(s,encoding='utf-8',newline='\n')
base=L/'runtime/textbook-audit-pdf-native-corrections.mjs'
s=base.read_text(encoding='utf-8')
if "from './textbook-audit-pdf-p217-correction.mjs'" not in s:
 s="import {load217Correction} from './textbook-audit-pdf-p217-correction.mjs';\n"+s
 s=s.replace('export async function loadNativeInlineCorrection(root,candidate,candidateSha256){','export async function loadNativeInlineCorrection(root,candidate,candidateSha256){\n if(candidate.source?.sourceId===\'79-cn\'&&candidate.source?.page===217)return load217Correction(root,candidate,candidateSha256);')
base.write_text(s,encoding='utf-8',newline='\n')
write(L/'diff.json',{'parent':inputs['parent'],'candidate':approval['candidate'],'changes':plan['changes'],
 'addedEditorialAnnotation':note,'originalRawChanged':False,'authorBodyChanged':False,'captionChanged':False,
 'northSecond9mUnchanged':True,'metadataChanges':['/provenance/sourceFieldCorrection','/candidateSha256']})
print(json.dumps({'candidate':approval['candidate'],'admissionSha256':sha(ap),'inputs':len(inputs)},ensure_ascii=False))
