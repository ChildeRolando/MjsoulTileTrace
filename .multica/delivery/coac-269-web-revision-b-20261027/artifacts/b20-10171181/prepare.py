"""Freeze this authorization's two exact text targets. No model invocation."""
from pathlib import Path
import hashlib
import json
import shutil
import difflib

ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path(__file__).resolve().parent
OLD=ROOT/'audit/runtimes/coac269-283-396962-v1-20261028'
BASE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-10171181-v1-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-283-10171181-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
bind=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
js=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
assert not (STAGE/'dispatch-started.json').exists(), 'do not rebuild dispatched snapshot'
for folder in [OLD,BASE]:
    for f in load(folder/'runtime-manifest.json')['files']:
        p=Path(f['path']);p=p if p.is_absolute() else folder/p
        assert sha(p.read_bytes())==f['sha256']
assert (OLD/'textbook-production-cli.mjs').read_bytes()==(BASE/'textbook-production-cli.mjs').read_bytes()
register_path=ROOT/'integration/coac250-283-396962-effective-issues-20261028.json'
assert bind(register_path)['sha256']=='6d122aa508b6eb57a4122472c52bd96ee78e1b54ec8d1299ac77c0aa1e688617'
register=load(register_path);assert register['counts']['remainingBlocking']==7
parent_path=Path(register['candidate']['path']);parent=load(parent_path)
assert bind(parent_path)['sha256']=='00074d1c55051aa61e463d466a3ae43c2e4c5a9967c3aa291996656d2e09cbe2'
notes_path=Path(register['latestAggregate']['path']);notes=load(notes_path)
assert bind(notes_path)['sha256']=='81313304a429d04c4895798824756d0be0b23d0c03dc0ab6e7f4aa77aa1699f8'
source_path=ROOT/parent['source']['sourcePath'];source=load(source_path)
base_notes=load(OLD/'exact-contract.json')['baseNotes']
assert bind(Path(base_notes['path']))['sha256']==base_notes['sha256']
issue_group=load(OLD/'exact-contract.json')['issueGroup']
targets=[]
for number,lo,hi in [(1017,1008,1021),(1181,1169,1189)]:
    target_id=f'modern-yabejp-ja:chapter06-exercise003:b{number}'
    issue=next(i for i in register['issues'] if i['originalIssue']['targetId']==target_id)
    assert issue['status']=='open' and issue['originalIssue']['severity']=='error'
    assert sha(js(issue['originalIssue']).encode())==issue['originalIssueSha256']
    assert issue['originalIssue'] in notes['modelReview']['issues']
    before=next(b['text'] for b in parent['body']['blocks'] if b['sourceBlockIds']==[target_id])
    expected=(before.replace('三元牌役种','三元役（小三元／大三元）') if number==1017 else
              '这一条件即使不成立，也应优先于其他对子保留双两面形。')
    assert before!=expected
    ids={f'modern-yabejp-ja:chapter06-exercise003:b{n:04d}' for n in range(lo,hi+1)}
    blocks=[b for b in source['blocks'] if b['id'] in ids]
    assert len(blocks)==hi-lo+1
    asset_ids={i['assetId'] for b in blocks for i in b.get('images',[])}
    images=[{'assetId':a['assetId'],**bind(ROOT/'web-sources/v1'/a['path']),'bytes':a['bytes']} for a in source['assets'] if a['assetId'] in asset_ids]
    assert len(images)==len(asset_ids)
    for image in images:assert Path(image['path']).stat().st_size==image['bytes']
    group=next(x['group'] for x in notes['batchReviews']+notes['inheritedBatchReviews'] if target_id in x['group']['sourceBlockIds'])
    packet={'source':bind(source_path),'parent':bind(parent_path),'parentAudit':bind(notes_path),
            'targetId':target_id,'originalIndependentError':issue,'before':before,'expected':expected,
            'allowedChanges':[{'sourceBlockId':target_id,'field':'text','before':before,'after':expected}],
            'classification':{'translationOnly':True,'editorialNotesAdded':False,'explanation':
              '三元役括号是源术语的译名展开，不假称原文逐字列出两役；让步句的这一条件回指原有宝牌3m，不加新的战术事实。任何另加校注必须拒绝，不混入原文。'},
            'completeQuestion':{'range':[lo,hi],'sourceBlocks':blocks,
              'candidateBlocks':[b for b in parent['body']['blocks'] if b['sourceBlockIds'][0] in ids],
              'candidateFigures':[f for f in parent['figures'] if any(i in ids for i in f['sourceBlockIds'])]},'images':images}
    prompt='只执行本授权中唯一目标的精确文字替换，返回expected。不得重译上下文，不增删标点、强调、校注、段落或图；不得将解释性术语展开冒充原文逐字引语。完整日中题目、条件与原PNG用于核验，所有非目标字段保留。\n'+js(packet)
    targets.append({'id':target_id,'group':group,'before':before,'expected':expected,'images':images,'prompt':prompt,'questionRange':[lo,hi],'originalIssueSha256':issue['originalIssueSha256']})
contract={'schema':'coac269-exact-10171181/1','authorizationComment':'01a17f72-535c-762b-b136-2bbacd5c6cae',
          'parent':bind(parent_path),'notes':bind(notes_path),'source':bind(source_path),'baseNotes':base_notes,
          'register':bind(register_path),'targets':targets,'issueGroup':issue_group,'maximumProductionCalls':2,'maximumFirstAuditCalls':2,'retry':0}
RUN.mkdir(parents=True,exist_ok=True);STAGE.mkdir(parents=True,exist_ok=True)
for p in OLD.iterdir():
    if p.is_file() and p.name!='runtime-manifest.json':shutil.copyfile(p,RUN/p.name)
old=(OLD/'textbook-audit-web.mjs').read_text(encoding='utf-8');auditor=old
start=old.index('// Fixed COAC-269 continuation;');end=old.index('async function readVerifiedAuditBatchPlan',start)
constants=old[start:end].replace('continuation','following')
oldc=load(OLD/'exact-contract.json')
for a,b in [(oldc['parent']['sha256'],contract['parent']['sha256']),(oldc['notes']['sha256'],contract['notes']['sha256']),
            (js([t['id'] for t in oldc['targets']]),js([t['id'] for t in targets])),
            (js([t['group']['batchId'] for t in oldc['targets']]),js([t['group']['batchId'] for t in targets]))]:constants=constants.replace(a,b)
auditor+='\n'+constants
needle='async function readVerifiedAuditBatchPlan(root,candidate){'
assert auditor.count(needle)==1
plan_case=f'''
 if(candidate.candidateSha256==={js(parent['candidateSha256'])}){{
  const bytes=await readFile({js(str(parent_path))});
  if(sha(bytes)!==followingParent||!same(JSON.parse(bytes),candidate))throw Error('following_exact_plan_candidate');
  const ancestorBytes=await readFile(bound(root,candidate.provenance.revision.parentPath));
  if(sha(ancestorBytes)!==candidate.provenance.revision.parentSha256)throw Error('following_exact_plan_ancestor');
  const ancestor=JSON.parse(ancestorBytes);if(!same(ancestor.provenance.batches,candidate.provenance.batches))throw Error('following_exact_plan_changed');
  return readVerifiedAuditBatchPlan(root,ancestor);
 }}
'''
auditor=auditor.replace(needle,needle+plan_case)
needle=' if(notes.production?.sha256===continuationParent)return continuationIssueScope(notes,revision);'
assert auditor.count(needle)==1
auditor=auditor.replace(needle,' if(notes.production?.sha256===followingParent)return followingIssueScope(notes,revision);\n'+needle)
start=old.index(' if(r.parentSha256===continuationParent){');end=old.index(" if(notes.status!=='needs-repair'||notes.method",start)
branch=old[start:end].replace('continuation','following')
auditor=auditor.replace(' if(r.parentSha256===continuationParent){',branch+' if(r.parentSha256===continuationParent){',1)
image_map={t['group']['batchId']:[i['assetId'] for i in t['images']] for t in targets}
auditor=auditor.replace(' const continuationImages=', ' const followingImages=followingScope(revision)?('+js(image_map)+')[group.batchId]??[]:[];\n const continuationImages=',1)
auditor=auditor.replace('const contextAssets=new Set(continuationImages.length?', 'const contextAssets=new Set(followingImages.length?followingImages:continuationImages.length?',1)
auditor=auditor.replace('...(continuationScope(r)?parentNotes.inheritedBatchReviews', '...((followingScope(r)||continuationScope(r))?parentNotes.inheritedBatchReviews',1)
(RUN/'textbook-audit-web.mjs').write_text(auditor,encoding='utf-8',newline='\n')
(OUT/'audit.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True),auditor.splitlines(True),fromfile='396962/audit',tofile='10171181/audit')),encoding='utf-8')
(RUN/'exact-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
ids=[t['id'] for t in targets];groups=[t['group']['batchId'] for t in targets]
deferred=[]
for i in notes['modelReview']['issues']:
    if i['severity']=='source-note' or i['targetId'] in ids:continue
    h=sha(js(i).encode());deferred.append({'batchId':issue_group[h],'targetId':i['targetId'],'severity':i['severity'],'issueSha256':h,'reason':'outside the two exact authorized text targets; original finding retained'})
target={'schema':'coach-web-group-revision-targets/1','parentSha256':contract['parent']['sha256'],'sourceSha256':parent['source']['sourceSha256'],'groups':groups,'textBlockIds':ids,'figureIds':[],'deferred':deferred}
(STAGE/'targets.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
manifest={'schema':'coac269-10171181-runtime/1','parentRuntime':bind(OLD/'runtime-manifest.json'),'schemaV2Parent':bind(BASE/'runtime-manifest.json'),'authorizationComment':contract['authorizationComment'],
          'files':[bind(p) for p in sorted(RUN.iterdir()) if p.is_file() and p.name!='runtime-manifest.json']}
(RUN/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
for name,p in [('contract.json',RUN/'exact-contract.json'),('runtime.json',RUN/'runtime-manifest.json'),('targets.json',STAGE/'targets.json'),('remaining-before.json',register_path)]:shutil.copyfile(p,OUT/name)
(OUT/'.gitattributes').write_text('* -text whitespace=cr-at-eol\n',encoding='utf-8')
print(json.dumps({'runtimeManifest':bind(RUN/'runtime-manifest.json'),'targets':len(targets),'deferred':len(deferred),'images':[len(t['images']) for t in targets],'modelCalls':0}))
