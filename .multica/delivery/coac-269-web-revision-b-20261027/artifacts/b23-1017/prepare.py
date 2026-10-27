"""Freeze the authorized deletion against the real reviewed parent; zero calls."""
from pathlib import Path
import hashlib,json,shutil,difflib
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path(__file__).resolve().parent
OLD=ROOT/'audit/runtimes/coac269-283-10171181-v1-20261028'
BASE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-1017-v2-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-283-1017-v2-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
bind=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
js=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
assert not (STAGE/'dispatch-started.json').exists(),'never rebuild dispatched snapshot'
for folder in [OLD,BASE]:
    for f in load(folder/'runtime-manifest.json')['files']:
        p=Path(f['path']);p=p if p.is_absolute() else folder/p
        assert sha(p.read_bytes())==f['sha256']
assert (OLD/'textbook-production-cli.mjs').read_bytes()==(BASE/'textbook-production-cli.mjs').read_bytes()
register_path=ROOT/'integration/coac244-283-10171181-recorded-20261028/effective-issue-register.json'
register=load(register_path);assert register['counts']['remainingBlocking']==6
parent_path=Path(register['latestCandidate']['path']);parent=load(parent_path)
assert bind(parent_path)['sha256']=='b90f7c4fbedb5b6498a1a783cf514303c23288eae36e73624788d2142f507458'
notes_path=Path(register['latestAggregate']['path']);notes=load(notes_path)
assert bind(notes_path)['sha256']=='93366b71af9e39d56305d20f7cf2b88a9a5b84ce24b80c2cbcf135008f0616df'
oldc=load(OLD/'exact-contract.json');base_notes=oldc['baseNotes'];issue_group=dict(oldc['issueGroup'])
assert bind(base_notes['path'])['sha256']==base_notes['sha256']
source_path=ROOT/parent['source']['sourcePath'];source=load(source_path)
assert bind(source_path)['sha256']=='8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de'
target_id='modern-yabejp-ja:chapter06-exercise003:b1017'
issue=next(i for i in register['issues'] if i['originalIssue']['targetId']==target_id)
assert issue['status']=='open-new-independent-target-error'
assert issue['effectiveIssue']['severity']=='error' and issue['effectiveIssue'] in notes['modelReview']['issues']
assert sha(js(issue['effectiveIssue']).encode())==issue['effectiveIssueSha256']
for f in [issue['evidence'],issue['independentRaw']]:assert bind(f['path'])['sha256']==f['sha256']
assert issue['callId']=='53722d02-3924-4fba-b304-68df1b2b45f0'
before=next(b['text'] for b in parent['body']['blocks'] if b['sourceBlockIds']==[target_id])
assert before=='搭子过多，又有三元役（小三元／大三元）的可能，所以保留发，宝牌为'
expected=before.replace('（小三元／大三元）','');assert before.count('（小三元／大三元）')==1
ids={f'modern-yabejp-ja:chapter06-exercise003:b{n:04d}' for n in range(1008,1022)}
blocks=[b for b in source['blocks'] if b['id'] in ids];assert len(blocks)==14
asset_ids={i['assetId'] for b in blocks for i in b.get('images',[])}
images=[{'assetId':a['assetId'],**bind(ROOT/'web-sources/v1'/a['path']),'bytes':a['bytes']} for a in source['assets'] if a['assetId'] in asset_ids]
assert len(images)==len(asset_ids)==11
for image in images:assert Path(image['path']).stat().st_size==image['bytes']
group=next(x['group'] for x in notes['batchReviews'] if target_id in x['group']['sourceBlockIds'])
issue_group[issue['effectiveIssueSha256']]=group['batchId']
packet={'source':bind(source_path),'parent':bind(parent_path),'parentAudit':bind(notes_path),'targetId':target_id,
        'currentIndependentError':issue,'before':before,'expected':expected,
        'allowedChanges':[{'sourceBlockId':target_id,'field':'text','before':before,'after':expected}],
        'classification':{'translationOnly':True,'editorialNotesAdded':False,'explanation':'仅删除独立审指出缩窄源义的括注，保留三元役；不新增原文事实、术语解释或校注。'},
        'completeQuestion':{'range':[1008,1021],'sourceBlocks':blocks,
        'candidateBlocks':[b for b in parent['body']['blocks'] if b['sourceBlockIds'][0] in ids],
        'candidateFigures':[f for f in parent['figures'] if any(i in ids for i in f['sourceBlockIds'])]},'images':images}
prompt='仅执行唯一目标的精确删除：删去（小三元／大三元），完整返回expected。保留三元役及所有条件。不重译上下文，不增删其它文字、标点、强调、校注、段落或图。原文未限定的术语不得自行缩窄。完整Q65日中题目与11张原PNG只用于核验，非靶字段原样继承。\n'+js(packet)
targets=[{'id':target_id,'group':group,'before':before,'expected':expected,'images':images,'prompt':prompt,'questionRange':[1008,1021],'originalIssueSha256':issue['effectiveIssueSha256']}]
contract={'schema':'coac269-exact-1017-repair/2','authorizationComment':'01a17f97-7b92-7797-8d8f-14284b6fa298',
          'parent':bind(parent_path),'notes':bind(notes_path),'source':bind(source_path),'baseNotes':base_notes,
          'register':bind(register_path),'targets':targets,'issueGroup':issue_group,'maximumProductionCalls':1,'maximumFirstAuditCalls':1,'retry':0,
          'deterministicRoute':'No existing web text raw-derived correction entry applies. Use one recorded real maker; no fabricated derived raw.'}
RUN.mkdir(parents=True,exist_ok=True);STAGE.mkdir(parents=True,exist_ok=True)
for p in OLD.iterdir():
    if p.is_file() and p.name!='runtime-manifest.json':shutil.copyfile(p,RUN/p.name)
old=(OLD/'textbook-audit-web.mjs').read_text(encoding='utf-8');auditor=old
constants=old[old.index('// Fixed COAC-269 following;'):].replace('following','repair1017')
for a,b in [(oldc['parent']['sha256'],contract['parent']['sha256']),(oldc['notes']['sha256'],contract['notes']['sha256']),
            (js([t['id'] for t in oldc['targets']]),js([target_id])),
            (js([t['group']['batchId'] for t in oldc['targets']]),js([group['batchId']])),
            (js(oldc['issueGroup']),js(issue_group))]:
    assert a in constants
    constants=constants.replace(a,b)
auditor+='\n'+constants
needle='async function readVerifiedAuditBatchPlan(root,candidate){';assert auditor.count(needle)==1
plan_case=f'''
 if(candidate.candidateSha256==={js(parent['candidateSha256'])}){{
  const bytes=await readFile({js(str(parent_path))});
  if(sha(bytes)!==repair1017Parent||!same(JSON.parse(bytes),candidate))throw Error('repair1017_exact_plan_candidate');
  const ancestorBytes=await readFile(bound(root,candidate.provenance.revision.parentPath));
  if(sha(ancestorBytes)!==candidate.provenance.revision.parentSha256)throw Error('repair1017_exact_plan_ancestor');
  const ancestor=JSON.parse(ancestorBytes);if(!same(ancestor.provenance.batches,candidate.provenance.batches))throw Error('repair1017_exact_plan_changed');
  return readVerifiedAuditBatchPlan(root,ancestor);
 }}
'''
auditor=auditor.replace(needle,needle+plan_case)
needle=' if(notes.production?.sha256===followingParent)return followingIssueScope(notes,revision);';assert auditor.count(needle)==1
auditor=auditor.replace(needle,' if(notes.production?.sha256===repair1017Parent)return repair1017IssueScope(notes,revision);\n'+needle)
start=old.index(' if(r.parentSha256===followingParent){');end=old.index(' if(r.parentSha256===continuationParent){',start)
branch=old[start:end].replace('following','repair1017')
auditor=auditor.replace(' if(r.parentSha256===followingParent){',branch+' if(r.parentSha256===followingParent){',1)
image_map={group['batchId']:[i['assetId'] for i in images]}
auditor=auditor.replace(' const followingImages=',' const repair1017Images=repair1017Scope(revision)?('+js(image_map)+')[group.batchId]??[]:[];\n const followingImages=',1)
auditor=auditor.replace('const contextAssets=new Set(followingImages.length?','const contextAssets=new Set(repair1017Images.length?repair1017Images:followingImages.length?',1)
needle='...((followingScope(r)||continuationScope(r))?parentNotes.inheritedBatchReviews';assert needle in auditor
auditor=auditor.replace(needle,'...((repair1017Scope(r)||followingScope(r)||continuationScope(r))?parentNotes.inheritedBatchReviews',1)
(RUN/'textbook-audit-web.mjs').write_text(auditor,encoding='utf-8',newline='\n')
(OUT/'audit.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),auditor.splitlines(True),fromfile='10171181/audit',tofile='1017-repair/audit')),encoding='utf-8')
(RUN/'exact-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
deferred=[]
for i in notes['modelReview']['issues']:
    if i['severity']=='source-note' or i['targetId']==target_id:continue
    h=sha(js(i).encode());deferred.append({'batchId':issue_group[h],'targetId':i['targetId'],'severity':i['severity'],'issueSha256':h,'reason':'outside the one exact authorized text deletion; original finding retained'})
assert len(deferred)==12
target={'schema':'coach-web-group-revision-targets/1','parentSha256':contract['parent']['sha256'],'sourceSha256':parent['source']['sourceSha256'],'groups':[group['batchId']],'textBlockIds':[target_id],'figureIds':[],'deferred':deferred}
(STAGE/'targets.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
manifest={'schema':'coac269-1017-repair-runtime/2','parentRuntime':bind(OLD/'runtime-manifest.json'),'schemaV2Parent':bind(BASE/'runtime-manifest.json'),'authorizationComment':contract['authorizationComment'],
          'files':[bind(p) for p in sorted(RUN.iterdir()) if p.is_file() and p.name!='runtime-manifest.json']}
(RUN/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
for name,p in [('contract.json',RUN/'exact-contract.json'),('runtime.json',RUN/'runtime-manifest.json'),('targets.json',STAGE/'targets.json'),('remaining-before.json',register_path)]:shutil.copyfile(p,OUT/name)
(OUT/'.gitattributes').write_text('* -text whitespace=cr-at-eol\n*.patch -whitespace\n',encoding='utf-8')
print(json.dumps({'runtimeManifest':bind(RUN/'runtime-manifest.json'),'targets':1,'deferred':len(deferred),'images':11,'modelCalls':0}))
