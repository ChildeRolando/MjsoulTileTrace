"""Prepare immutable evidence, exact overlay and readable preview for existing owners."""
import base64,copy,datetime,hashlib,html,json,pathlib,shutil
from verify import verify,inputs,assemble_preview,R,D,RECEIPT
L=pathlib.Path(__file__).resolve().parent;S=R/'integration/coac248-256-limits-20261028';S.mkdir(exist_ok=True)
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,x,indent=2):pathlib.Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
p=verify();a,v,c,source,parent,raw,plan=inputs();now=datetime.datetime.now(datetime.timezone.utc).isoformat()
write(L/'proof.json',p);write(L/'overlay.json',p['proposal'])
archives=[]
refs=[(a['candidate'],'candidate.json'),(a['parent'],'parent.json'),(a['source'],'source.json'),(a['parentAudit'],'audit.json'),
 ({'path':str(D/'receipt.json'),'sha256':RECEIPT},'receipt.json'),(a['raw'],'raw.json'),(a['plan'],'plan.json'),
 ({'path':str(D/'verification.json'),'sha256':sha(D/'verification.json')},'verification.json')]
for ref,name in refs:
 dest=L/'evidence'/name;dest.parent.mkdir(exist_ok=True);shutil.copyfile(ref['path'],dest);assert sha(dest)==ref['sha256']
 archives.append({'originalPath':ref['path'],'deliveryPath':'evidence/'+name,'sha256':ref['sha256']})
write(L/'path-map.json',{'files':archives})
# An excerpt preview only, never an integration or MCP acceptance receipt.
parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>256例2限制展示核对</title>',
 '<style>body{max-width:850px;margin:2rem auto;font:17px/1.7 system-ui;padding:1rem}img{max-width:100%;height:auto}aside{border-left:4px solid #9a6500;background:#fff8e7;padding:1rem;margin:1rem 0}pre{white-space:pre-wrap}header{color:#555}</style>',
 '<header>例2限定展示预览；待精确准入与实际MCP/Arena验收。原候选未修改。</header>']
for block in c['body']['blocks'][14:21]:
 if block['type']=='text':parts.append('<p>'+html.escape(block['text'])+'</p>')
 else:
  f=next(f for f in c['figures'] if f['figureId']==block['figureId']);asset=f['sourceAssetBindings'][0]
  data=base64.b64encode((R/asset['path']).read_bytes()).decode();parts.append('<figure><img alt="例2绑定原图" src="data:image/png;base64,'+data+'"><figcaption>'+html.escape(f['caption'])+'</figcaption></figure>')
  parts.append('<pre>'+html.escape(f['transcription'])+'</pre><p>明确未知：'+html.escape('；'.join(f['unknowns']))+'</p>')
parts.append('<aside aria-label="非原文审校范围">')
for n in p['proposal']['notes']:parts.append('<p id="'+n['id']+'">'+html.escape(n['text'])+'</p>')
parts.append('</aside><hr><p>后续原例3保持原位置及内容；本文件仅展示例2与6条限制的插入边界。</p></html>')
preview='\n'.join(parts);(L/'overlay-preview.html').write_text(preview,encoding='utf-8',newline='\n')
assert preview.count('id="limited256-')==6
for n in p['proposal']['notes']:assert html.escape(n['text']) in preview
handoff={'schema':'coac248256-independent-review-limits-to-existing-owner/1','recordedAt':now,
 'canonical':p['canonical'],'candidate':a['candidate'],'source':a['source'],'parent':a['parent'],'parentAudit':a['parentAudit'],
 'independentReceipt':p['independentReceipt'],'independentRaw':a['raw'],'independentCall':a['call'],
 'proof':{'path':str(S/'proof.json'),'sha256':sha(L/'proof.json')},
 'exactOverlayProposal':{'path':str(S/'overlay.json'),'sha256':sha(L/'overlay.json')},
 'readablePreview':{'path':str(S/'overlay-preview.html'),'sha256':sha(L/'overlay-preview.html'),'actualMcpReadback':False},
 'frozenExecutionRecheck':{'path':str(S/'gates.json'),'sha256':sha(L/'gates.json')},
 'commands':[f'python -X utf8 {S.as_posix()}/verify.py',f'python -X utf8 {S.as_posix()}/verify_test.py',f'E:/IDE/NodeJS/node.exe {S.as_posix()}/gates.mjs'],
 'displayRequirements':p['limitations'],'candidateEditNeeded':False,'sixRestrictionsAlreadyInstalledClaimed':False,
 'proposedPlacement':p['proposal']['placement'],
 'exactExistingOwnerWork':'Extend only legal256 supplemental scope for this precise source/parent/audit/maker/new-review/raw/SHA, consuming the proposed six non-author display blocks. Reuse existing overlay staging mechanics, never159/242 pins or a generic passed exception. Map insertion after the last staged chunk for b0021, before b0022 separator. Verify all other staged author blocks, images, links, marks, tableContext and order remain byte-equivalent.',
 'specificRemaining':['Install six verbatim independent restrictions in actual256 consumer scope with explicit non-author marker; current unknown markers alone do not satisfy notes2/3/5/6.',
 'ActualMCP/Arena readback: exact8s, both unknowns, all6 notes, all author conditions and source image references; preserve original uncertain/source-note and separate mechanical historical-diff proof.'],
 'existingDispatches':{'owner244':'01a17fb1-429e-7e02-87c7-fd3138d21a40','consumer250':'01a17fb1-463b-75a9-ba4b-306ce0ac21b9','newWakeupsOrConsumers':0},
 'phaseCalls':a['phaseCalls'],'newModelCallsThisRun':0,'newProductionCalls':0,'retry':0,
 'newSemanticReviewGapIdentified':False,'ordinaryWholeChapterPassed':False,'admissionGranted':False,'formalActiveChanged':False,
 'preserved':'The two original independent uncertain issues, old parent uncertain/source-note and every original raw/receipt are unchanged. Historical full-object differences are proven mechanically, not attributed to the model.'}
write(L/'handoff.json',handoff)
stage={'recordedAt':now,'status':'independent8s-and-unknown-impact-complete-six-display-limits-prepared-awaiting-legal-consumption',
 'candidate':a['candidate'],'independentReceipt':p['independentReceipt'],'independentRaw':a['raw'],'independentCallId':a['call']['callId'],
 'phaseCalls':a['phaseCalls'],'unknownReadingTodo':False,'unknownsRetained':p['unknowns'],
 'handoff':{'path':str(S/'handoff.json'),'sha256':sha(L/'handoff.json')},'proof':handoff['proof'],'overlayProposal':handoff['exactOverlayProposal'],
 'modelCallsThisRun':0,'originalAuditAndRawChanged':False,'candidateChanged':False,'admissionGranted':False,
 'ordinaryWholeChapterPassed':False,'remaining':'Legal exact256 overlay consumption with all6 explicit non-author limits, then realMCP/Arena readback; no more maker, digit reading or model review.'}
inv=L.parent/'coac-248-native-inline-correction/unified-repair-list-20261027.json';data=json.loads(inv.read_text(encoding='utf-8'));before=copy.deepcopy(data)
row=next(x for x in data['objects'] if x.get('chapterId')==p['canonical']);row['independent256Limits20261028']=stage
row['currentDisposition']=stage['status'];row['nextAction']=stage['remaining'];row['currentValidCandidate']=a['candidate'];row.pop('currentValidUnauditedCandidate',None)
assert all(x==y for x,y in zip(before['objects'],data['objects']) if x.get('chapterId')!=p['canonical'])
assert data['productionFailureHistory']==before['productionFailureHistory'] and data['countsCurrent']==before['countsCurrent'];write(inv,data,indent=1)
for file,key in [(R/'integration/coac248-repair-handoff-20261027.json','items'),(R/'integration/coac244-remaining26-closure-register-20261028.json','rows')]:
 oldbytes=file.read_bytes();d=json.loads(oldbytes);rows=[x for x in d[key] if x.get('chapterId')==p['canonical']];assert len(rows)==1
 rows[0]['independent256Limits20261028']=stage;rows[0]['nextAction']=stage['remaining'];assert file.read_bytes()==oldbytes;write(file,d)
write(L/'owner-update.json',stage)
for file in L.iterdir():
 if file.is_file() and file.suffix in ['.json','.py','.mjs','.html','.md']:(S/file.name).write_bytes(file.read_bytes())
shutil.copytree(L/'evidence',S/'evidence',dirs_exist_ok=True)
print(json.dumps({'handoffSha256':sha(L/'handoff.json'),'overlaySha256':sha(L/'overlay.json'),'limits':6,'newModelCalls':0,'candidateChanged':False}))
