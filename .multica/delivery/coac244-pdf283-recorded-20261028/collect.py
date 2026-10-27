"""One bounded zero-model intake. Reuse existing247/250 owners; never dispatch."""
from pathlib import Path
import json,hashlib,copy,shutil
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent
checks=[];protected={}
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(n,v):
 p=O/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def check(name,value):
 checks.append(dict(name=name,passed=bool(value)));assert value,name
def bind(ref):
 p=Path(ref['path']);p=p if p.is_absolute()else R/p;b=p.read_bytes();check('bound:'+p.name,sha(b)==ref['sha256']);protected[str(p)]=sha(b);return json.loads(b) if p.suffix=='.json'else b
pdfref=dict(path=str(R/'integration/coac249-222-order-pdf218220-reviewed-20261028.json'),sha256='db25a7294c736e9675c6d32287eb4bf49e8b285d94307dbab83a19965e23c7a1')
newref=dict(path=str(R/'integration/coac249-283-targets-and-159242-proof-20261028.json'),sha256='daf6806291fdeab42f0e490acfac072bded84aaae8b01cd228710405383d3894')
pdf,new=bind(pdfref),bind(newref);save('source-pdf-handoff.json',pdf);save('source-283-handoff.json',new)
ledger=[json.loads(x)for x in (R/'audit/calls.jsonl').read_text(encoding='utf-8').splitlines()if x.strip()]
pages=[]
for p in pdf['pdf']:
 c,a,raw=bind(p['candidate']),bind(p['audit']),bind(p['raw']);call=p['call'];execution=raw.get('requestExecution',call.get('requestExecution'))
 check('pdf%d one real standard-ledger entry'%p['page'],len([x for x in ledger if x.get('callId')==call['callId']])==1)
 check('pdf%d independent full review raw matches receipt'%p['page'],p['modelReview']==a['modelReview']==raw['structuredOutput']==json.loads(raw['rawLastMessage']))
 check('pdf%d successful transport and retained semantic result'%p['page'],raw['success'] and raw['exitCode']==0 and a['status']==p['status'])
 check('pdf%d actualterra/max'%p['page'],execution['model']=='gpt-6.1-terra'and execution['reasoningEffort']=='max')
 check('pdf%d actual2or3 image arguments'%p['page'],len(execution['images'])==(2 if p['page']==218 else 3)and execution['args'].count('-i')==len(execution['images']))
 for im in execution['images']:
  b=Path(im['path']).read_bytes();check('actual image bytes:'+Path(im['path']).name,sha(b)==im['sha256']and len(b)==im['bytes']);protected[im['path']]=sha(b)
 save('pdf%d-original-audit.json'%p['page'],a)
 pages.append(dict(page=p['page'],canonical=p['canonical'],candidate=p['candidate'],audit=p['audit'],raw=p['raw'],callId=call['callId'],model=execution['model'],effort=execution['reasoningEffort'],images=len(execution['images']),status=p['status'],modelReview=p['modelReview'],blockingIssues=[i for i in p['modelReview']['issues']if i['severity']!='source-note'],sourceNotes=[i for i in p['modelReview']['issues']if i['severity']=='source-note'],usage=call['usage'],durationMs=call['durationMs'],firstReviewCount=1,remainingAuthorizedCalls=0))
check('218 four blockers219 two blockers220 none',[len(p['blockingIssues'])for p in pages]==[4,2,0])
check('218219 needsrepair220 fullpagepassed',[p['status']for p in pages]==['needs-repair','needs-repair','passed'])
check('220 all8 text2figure checked',len(pages[2]['modelReview']['bodyChecks'])==8 and len(pages[2]['modelReview']['figureChecks'])==2)
assembly=bind(pdf['assembly']);ownership=bind(assembly['ownership']);owned=[x for x in ownership['blocks']if x['sourceId']=='79-cn'and x['page']==220]
check('220 all10 ownership rows unique',len(owned)==10 and len({x['sourceBlockId']for x in owned})==10)
check('220 b1b3 only belong217',sorted(x['sourceBlockId']for x in owned if x['chapterId']=='79-cn-chapter-217-4')==['79-cn-p220-b1','79-cn-p220-b3'])
check('220 other8 blocks and both figures belong220-4',len([x for x in owned if x['chapterId']=='79-cn-chapter-220-4'])==8 and all(next(x for x in owned if x['sourceBlockId']=='79-cn-p220-'+b)['chapterId']=='79-cn-chapter-220-4'for b in ['b9','b10']))
save('pdf-physical-page-disposition.json',dict(pages=pages,physical220Ownership=owned,assembly=pdf['assembly'],whole217ChapterAccepted=False,p217LimitedPairPreserved=assembly['pairedLimitedSupplement'],protected215=assembly['protected215'],sourceTextNotEdited=True))
for n in ['integration/coac247-pdf217220-review-disposition-20261028.json','integration/coac250-pdf217220-assembly-intake-20261028.json']:
 d=read(R/n);save(Path(n).name,d)
check('existing247 disposition already current',read(R/'integration/coac247-pdf217220-review-disposition-20261028.json')['sourceHandoff']['sha256']==pdfref['sha256'])
intake=read(R/'integration/coac250-pdf217220-assembly-intake-20261028.json');check('existing250 preserves whole217 block',intake['wholeChapterPassed']==False and intake['previewBuilt']==False)
rev=bind(new['chapter283']['result']);inherit=bind(new['chapter283']['scopeInheritance']);candidate,parent,source=bind(rev['candidate']),bind(rev['parent']),bind(rev['source']);aggregate=bind(rev['audit'])
diff=[];content=[]
for a,b in zip(candidate['body']['blocks'],parent['body']['blocks']):
 same=a==b;key=a['sourceBlockIds'][0];content.append(dict(id=key,parentSha256=sha(json.dumps(b,ensure_ascii=False,separators=(',',':')).encode()),candidateSha256=sha(json.dumps(a,ensure_ascii=False,separators=(',',':')).encode()),unchanged=same))
 if not same:diff.append(key)
check('1195 source/candidate/parent blocks complete',len(content)==1195 and len(parent['body']['blocks'])==1195 and len(source['blocks'])==1195)
check('only396and962 changed',diff==['modern-yabejp-ja:chapter06-exercise003:b0396','modern-yabejp-ja:chapter06-exercise003:b0962'])
check('1193 others unchanged',sum(x['unchanged']for x in content)==1193)
check('524 full figure objects unchanged',candidate['figures']==parent['figures']and len(candidate['figures'])==524)
save('283-block-hashes.json',dict(candidate=rev['candidate'],parent=rev['parent'],blocks=content,figures=[dict(id=f['figureId'],sha256=sha(json.dumps(f,ensure_ascii=False,separators=(',',':')).encode()))for f in candidate['figures']]))
for ref in inherit['refs']:bind(ref)
for t in rev['results']:
 cp,raw=bind(t['checkpoint']),bind(t['raw']);call=t['call'];execution=raw['requestExecution']
 check(t['targetId']+' checkpointpassed',t['status']=='passed'and cp['status']=='passed'and cp['modelReview']==raw['output']and raw['output']==json.loads(raw['rawLastMessage'])and raw['success'])
 check(t['targetId']+' context and issues',raw['output']['contextContinuity']['faithful']and not raw['output']['issues'])
 check(t['targetId']+' real ledger once',len([x for x in ledger if x.get('callId')==call['callId']])==1)
 check(t['targetId']+' terra/max images',execution['model']=='gpt-6.1-terra'and execution['reasoningEffort']=='max'and len(execution['images'])==(13 if 'b0396' in t['targetId']else 12))
 for im in execution['images']:
  b=Path(im['path']).read_bytes();check('283image:'+Path(im['path']).name,sha(b)==im['sha256']and len(b)==im['bytes']);protected[im['path']]=sha(b)
 save('283-'+t['targetId'].split(':')[-1]+'-checkpoint.json',cp)
check('283 original14 deferred remain and generic whole gate still refuses',len(inherit['deferredOriginalIssues'])==14 and aggregate['status']=='needs-repair'and rev['verification']['wholeError']=='web_audit_not_passed_or_inputs_changed')
check('9 inherited groups including113 batch010',len(rev['inheritedBatchReviews'])==9 and inherit['batch010']['status']=='passed')
row=next(x for x in read(R/'integration/coac244-remaining26-closure-register-20261028.json')['rows']if x['chapterId']=='nemata-jp-chapter-283-1')
effective=bind(row['evidence396962']['effectiveIssueRegister']);save('effective283-existing-owner.json',effective)
check('existing250 effective19 ledger10resolved7open2notes',effective['counts']['resolved']==10 and effective['counts']['remainingBlocking']==7 and effective['counts']['sourceNotes']==2)
check('current14deferred mapped7resolved7open',effective['counts']['newAggregateDeferred']==14 and effective['counts']['newAggregateDeferredResolved']==7 and effective['counts']['newAggregateDeferredOpen']==7)
check('canonical exact current candidate',effective['candidate']['sha256']==rev['candidate']['sha256']and len(row['blockingIssues'])==7)
for q in effective['issues']:
 if q['originalIssue']['targetId']in diff:check('newtarget formally resolved:'+q['originalIssue']['targetId'],q['status'].startswith('resolved'))
att=bind(new['159242']['attestation']);bind(new['159242']['existingOwnerSidecar']);save('159242-consistency.json',att)
for ref in att['bound']:bind(ref)
check('159242 already admitted with no extraconsumer',new['159242']['alreadyAdmittedAndReadBack']and not new['159242']['duplicateConsumerCreated']and att['newModelCalls']==0 and att['regressionGroupsPassed']==7)
for name,expected in [('audit/runtimes/coac269-283-396962-v1-20261028/runtime-manifest.json',32),('production/coac247-pdf218219-terra-v2-20261028/runtime-manifest.json',30),('production/coac247-pdf220-terra-20261028/runtime-manifest.json',30)]:
 m=read(R/name);check(name+' filecount',len(m['files'])==expected)
 for f in m['files']:bind(f)
save('pre-verification.json',dict(status='passed',checks=checks,protected=protected,pdf=pages,chapter283=dict(candidate=rev['candidate'],effectiveIssues=row['evidence396962']['effectiveIssueRegister'],counts=effective['counts'],remaining=[x for x in effective['issues']if x['status']=='open'and x['category']!='source-note']),newModelCalls=0,newCandidates=0,newConsumers=0,registerWrites=0,existingOwnersAlreadyCurrent=True))
print(json.dumps(dict(status='passed',checks=len(checks),protected=len(protected),newModelCalls=0,pdf=[(p['page'],p['status'])for p in pages],counts283=effective['counts']),ensure_ascii=False))
