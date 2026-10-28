"""Freeze the user-authorized exact213 composition and reused display converter. Zero model calls."""
from pathlib import Path
import json,hashlib,shutil
R=Path('E:/AgentData/Coach/knowledge/processing');H=Path(__file__).resolve().parent;D=R/'integration/coac248-jp213-composite-20261028';assert not D.exists(),'Inspect an existing package before reuse'
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda b:hashlib.sha256(b).hexdigest();ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
def save(p,x,indent=2):p.write_text(json.dumps(x,ensure_ascii=False,indent=indent)+'\n',encoding='utf-8',newline='\n')
rref=ref(R/'integration/coac249-213-target-impact-reviewed-20261028.json');assert rref['sha256']=='a91fd5ef0e13a880d32e0036c87f34f341d54b4c7afa9088f636b3dc857321d8';r=load(rref['path']);old=load(r['parentAudit']['path']);qref=ref(R/'integration/coac249-213-display-and-residual-20261028.json');aref=ref(R/'integration/coac244-213-contract-assessment-20261028/contract-assessment.json');iref=ref(R/'integration/coac249-213-scope-inheritance-20261028.json');q=load(qref['path'])
mapping=[{'parentIssueIndex':i,'parentIssue':a,'parentIssueSha256':sha(json.dumps(a,ensure_ascii=False,separators=(',',':')).encode()),'currentIssueIndex':i,'currentIssue':b,'currentIssueSha256':sha(json.dumps(b,ensure_ascii=False,separators=(',',':')).encode()),'objectBytesIdentical':a==b,'scope':'historical-error-with-current-target-faithful-evidence' if i<2 else 'retained-unknown-with-conditional-argument-permission','resolutionEvidence':r['modelReview']['textRepair'] if i==0 else r['modelReview']['figureRepair'] if i==1 else r['modelReview']['unknownImpact']} for i,(a,b) in enumerate(zip(old['modelReview']['issues'],r['modelReview']['issues']))]
plan={'schema':'coac248-jp213-exact-composite-scope/1','authorizationCommentId':'01a18226-92e6-7a4a-81e0-3c365559b152','canonical':r['canonical'],'candidate':r['candidate'],'source':r['source'],'parent':r['parent'],'parentAudit':r['parentAudit'],'independentReceipt':rref,'raw':r['raw'],'issueMapping':mapping,'issueObjectsByteIdentical':False,'newSemanticVerdict':False,'sourceIssueSeverityUnchanged':True,'requiredDisplayLimitations':q['requiredDisplayLimitations'],'anchor':{'afterSourceBlockId':'modern-yabejp-ja:chapter03-section026:b0032','beforeSourceBlockId':'modern-yabejp-ja:chapter03-section026:b0033','label':'审校限制（非原文）','authorText':False},'originalStrictVerification':r['verification'],'globalAdmissionGranted':False,'newCalls':0,'humanAnnotationDataUsed':False}
owner=R/'integration/coac244-remaining26-closure-register-20261028.json';before=owner.read_bytes();x=json.loads(before);row=next(a for a in x['rows'] if a['chapterId']==r['canonical']);row['exact213CompositePreparation']=plan;assert owner.read_bytes()==before;save(owner,x,1)
save(H/'scope-plan.json',plan)
origin=R/'integration/coac244-jp193-r2-composite-20261028'
for name in ['stage-base.mjs']:
 text=(origin/name).read_text(encoding='utf-8-sig').replace('jp193','jp213').replace('Japanese193 r2','Japanese213 r1').replace('verified-exact-jp213-r2-composite-evidence','verified-exact-jp213-composite-evidence')
 (H/name).write_text(text,encoding='utf-8',newline='\n')
assert (H/'stage.mjs').is_file(),'Use the delivered exact inline-anchor overlay, never regenerate it from another chapter'
review=ref(R/'integration/coac248-193213-20261028/review.mjs');files=[rref,qref,aref,iref,review,ref(R/'integration/coac248-193213-20261028/release.json')]
for k in ['raw','plan','candidate','source','parent','parentAudit','runtime','handoff']:
 if k in r:files.append(r[k])
rt=load(r['runtime']['path'])
for f in rt['files']:files.append(ref(Path(r['runtime']['path']).parent/f['name']))
for path in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/path))
for name in ['stage-base.mjs','stage.mjs']:files.append(ref(origin/name))
for name in ['admit.mjs','stage-base.mjs','stage.mjs','scope-plan.json']:files.append({'path':str(D/name),'sha256':sha((H/name).read_bytes())})
files=list({f['path'].replace('\\','/').lower():f for f in files}.values())
manifest={'schema':'coac248-jp213-exact-composite-frozen/1','authorizationCommentId':plan['authorizationCommentId'],'receipt':rref,'proposal':qref,'assessment':aref,'inheritance':iref,'reviewModule':review,'files':files,'scope':'exact213 text/7p current faithful targets plus retained unknown-impact allowance and eight visible non-author limits; pin every original/new issue object','newCalls':0,'globalPointerMayChange':False,'originalFalseMustRemain':True};save(H/'manifest.json',manifest);D.mkdir()
for p in H.iterdir():
 if p.is_file():shutil.copyfile(p,D/p.name)
print(json.dumps({'scope':r['canonical'],'frozenFiles':len(files),'oldNewIssueObjectBytesIdentical':False,'individualIssueHashMappings':len(mapping),'newCalls':0}))
