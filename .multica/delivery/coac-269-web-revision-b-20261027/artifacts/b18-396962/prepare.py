"""Freeze the exact two-target continuation; no model invocation or historical rewrite."""
from pathlib import Path
import hashlib
import json
import shutil
import difflib

ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path(__file__).resolve().parent
BASE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
OLD=ROOT/'audit/runtimes/coac269-283-b0168-review-v1-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-396962-v1-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-283-396962-20261028'
PACK=ROOT/'integration/coac244-283-convergence-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
bind=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
assert not (STAGE/'dispatch-started.json').exists(), 'never rebuild a dispatched snapshot'
for folder,name in [(BASE,'runtime-manifest.json'),(OLD,'b0168-review-runtime-manifest.json')]:
    manifest=load(folder/name)
    for f in manifest['files']:
        p=Path(f['path'])
        if not p.is_absolute():p=folder/p
        assert sha(p.read_bytes())==f['sha256']
packets=[load(PACK/f'next-{n}-request.json') for n in [396,962]]
for n,h in [(396,'3f8e011e955d280f1436f43d8040d29d0ae8bfd8c589fffb1b30fd02a324cb03'),(962,'3876319148eed8f633755f5e7b9ee7d0d3ee2e8c0a1b829228c8376ff6ef1c2a')]:
    assert sha((PACK/f'next-{n}-request.json').read_bytes())==h
parent_path=Path(packets[0]['latestCandidate']['path'])
parent=load(parent_path)
notes_path=ROOT/'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f.json'
notes=load(notes_path)
base_notes=load(ROOT/parent['provenance']['revision']['notesPath'])
assert bind(parent_path)['sha256']=='b2417de19a50ec85609f75a4e07f07e002cf636785e1427948c06000a0967c2f'
assert bind(notes_path)['sha256']=='d7c8b54d6b4bef37a4c6c0a97b88831a551ce4be8eb938fe51823a9ea1e401df'
targets=[]
issue_group={sha(json.dumps(i,ensure_ascii=False,separators=(',',':')).encode()):r['group']['batchId'] for r in base_notes['batchReviews'] for i in r['modelReview']['issues']}
for p in packets:
    original=json.loads(p['makerRequest']['prompt'][p['makerRequest']['prompt'].index('{'):])
    before=next(b['text'] for b in parent['body']['blocks'] if b['sourceBlockIds']==[p['target']])
    assert before==original['before']
    for image in p['images']:assert sha(Path(image['path']).read_bytes())==image['sha256']
    original.update(parent=bind(parent_path),parentAudit=bind(notes_path))
    prompt='只执行这一明确授权的精确文字替换。返回唯一目标expected，不重译上下文，不添加Markdown强调、标点、校注、段落或图。保持牌与条件、组合关系及其它字段不变。完整日中问题上下文和原PNG供核对。此前审校仅用于定位，不替代原文。\n'+json.dumps(original,ensure_ascii=False,separators=(',',':'))
    targets.append({'id':p['target'],'group':p['group'],'before':before,'expected':p['proposedText'],'images':p['images'],'prompt':prompt,'questionRange':p['questionRange']})
contract={'schema':'coac269-exact-396962/1','authorizationComment':'01a17f45-77b4-7734-91bc-d2fbcc796af6','parent':bind(parent_path),'notes':bind(notes_path),'source':original['source'],'baseNotes':bind(ROOT/parent['provenance']['revision']['notesPath']),'targets':targets,'issueGroup':issue_group,'maximumProductionCalls':2,'maximumFirstAuditCalls':2,'retry':0}
RUN.mkdir(parents=True,exist_ok=True);STAGE.mkdir(parents=True,exist_ok=True)
for p in BASE.iterdir():
    if p.is_file():shutil.copyfile(p,RUN/p.name)
# Retain the already verified b0168 audit projection and duplicate-finding identity.
auditor=(OLD/'textbook-audit-web.mjs').read_text(encoding='utf-8')
old_auditor=auditor
parent_sha=contract['parent']['sha256'];notes_sha=contract['notes']['sha256']
ids=[t['id'] for t in targets];groups=[t['group']['batchId'] for t in targets]
js=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
constants=f'''
// Fixed COAC-269 continuation; no new authorization for other parents or targets.
const continuationParent={js(parent_sha)},continuationNotes={js(notes_sha)},continuationTargets={js(ids)},continuationGroups={js(groups)},continuationIssueGroups={js(issue_group)};
function continuationScope(r){{return r?.parentSha256===continuationParent&&r.notesSha256===continuationNotes&&same(r.textBlockIds,continuationTargets)&&same(r.figureIds,[])&&same(r.groupRevision?.groups,continuationGroups);}}
function continuationIssueScope(notes,revision){{
 if(!continuationScope(revision))throw Error('continuation_exact_scope');
 const issues=notes.modelReview.issues.filter(i=>i.severity!=='source-note'),deferred=revision.groupRevision.deferred;
 const expected=issues.filter(i=>!continuationTargets.includes(i.targetId)).map(i=>({{batchId:continuationIssueGroups[sha(JSON.stringify(i))],targetId:i.targetId,severity:i.severity,issueSha256:sha(JSON.stringify(i))}}));
 if(continuationTargets.some(id=>!issues.some(i=>i.targetId===id&&i.severity==='error'))||expected.some(i=>!i.batchId)||!Array.isArray(deferred)||deferred.length!==expected.length||new Set(deferred.map(d=>d.issueSha256)).size!==expected.length||expected.some(i=>!deferred.some(d=>['batchId','targetId','severity','issueSha256'].every(k=>d[k]===i[k]))))throw Error('continuation_deferred_findings');
 return true;
}}
'''
auditor+=constants
auditor=auditor.replace('verifyWebBatchedProductionCalls,readVerifiedAuditBatchPlan,','verifyWebBatchedProductionCalls,readVerifiedAuditBatchPlan as readVerifiedOriginalAuditBatchPlan,',1)
auditor+='''
async function readVerifiedAuditBatchPlan(root,candidate){
 if(candidate.candidateSha256==='ee3fc67ae880c68bb2c318acd807bad72bbffa53f72b4128e299cc6bdd466873'&&candidate.provenance.revision?.parentSha256==='dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899'){
  const bytes=await readFile(bound(root,candidate.provenance.revision.parentPath));
  if(sha(bytes)!==candidate.provenance.revision.parentSha256)throw Error('continuation_original_plan_parent');
  const original=JSON.parse(bytes);if(!same(original.provenance.batches,candidate.provenance.batches))throw Error('continuation_original_plan_changed');
  return readVerifiedOriginalAuditBatchPlan(root,original);
 }
 return readVerifiedOriginalAuditBatchPlan(root,candidate);
}
'''
needle=" const gr=revision?.groupRevision;"
auditor=auditor.replace(needle," if(notes.production?.sha256===continuationParent)return continuationIssueScope(notes,revision);\n"+needle,1)
needle=" const parent=JSON.parse(parentBytes),notes=JSON.parse(notesBytes),{source,checks,independentSource}=await verifySource(root,parent);\n if(notes.status!=='needs-repair'||notes.method!=='independent-sol-high-complete-unit-batch-reviews')"
replacement=""" const parent=JSON.parse(parentBytes),notes=JSON.parse(notesBytes),{source,checks,independentSource}=await verifySource(root,parent);
 if(r.parentSha256===continuationParent){
  if(!continuationScope(r)||r.notesSha256!==continuationNotes||notes.status!=='needs-repair'||!same(notes.deterministicChecks,checks)||!same(notes.independentSource,independentSource)||!same(notes.source,parent.source))throw Error('continuation_parent_binding');
  const validated=await verifyGroupRevisionAudit(root,bound(root,r.parentPath));
  if(validated.auditSha256!==continuationNotes)throw Error('continuation_parent_review');
  const production=await verifyWebProductionCall(root,parent),presentation=await verifyWebPresentations(root,parent);
  if(!same(production,notes.productionCall)||!same(presentation,notes.presentation??null))throw Error('continuation_parent_production');
  verifyGroupRevisionContent(candidate,parent,notes);continuationIssueScope(notes,r);
  const {groups}=await readVerifiedAuditBatchPlan(root,parent);
  const inheritedAssetIds=[...new Set(parent.figures.flatMap(f=>f.sourceAssetBindings.map(a=>a.assetId)))];
  return {revision:r,parentAudit:{path:r.notesPath,sha256:r.notesSha256,originalStatus:notes.status},batchParent:{method:'exact-verified-group-revision-parent',groups:groups.map(g=>g.batchId),parentSha256:r.parentSha256,parentAuditSha256:validated.auditSha256},inheritedAssetIds,groups,revisedGroups:groups.filter(g=>r.groupRevision.groups.includes(g.batchId))};
 }
 if(notes.status!=='needs-repair'||notes.method!=='independent-sol-high-complete-unit-batch-reviews')"""
assert auditor.count(needle)==1
auditor=auditor.replace(needle,replacement)
needle="const contextAssets=new Set(q12Exact?"
assert needle in auditor
image_map={t['group']['batchId']:[i['assetId'] for i in t['images']] for t in targets}
auditor=auditor.replace(needle,"const continuationImages=continuationScope(revision)?("+js(image_map)+")[group.batchId]??[]:[];\n const contextAssets=new Set(continuationImages.length?continuationImages:q12Exact?",1)
# The old ternary closes with :[]); and remains valid for the extra condition.
old="receipt.inheritedBatchReviews=parentNotes.batchReviews.filter(x=>!r.groupRevision.groups.includes(x.group.batchId))"
new="receipt.inheritedBatchReviews=[...parentNotes.batchReviews,...(continuationScope(r)?parentNotes.inheritedBatchReviews??[]:[])].filter(x=>!r.groupRevision.groups.includes(x.group.batchId))"
assert old in auditor;auditor=auditor.replace(old,new)
(RUN/'textbook-audit-web.mjs').write_text(auditor,encoding='utf-8',newline='\n')
(OUT/'audit.patch').write_text(''.join(difflib.unified_diff(old_auditor.splitlines(True),auditor.splitlines(True),fromfile='b0168-frozen/audit',tofile='396962-frozen/audit')),encoding='utf-8')
(RUN/'exact-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
helper=r'''import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const contract=JSON.parse(await readFile(new URL('./exact-contract.json',import.meta.url)));
export async function assertFrozen(expected){
 const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await readFile(new URL('./runtime-manifest.json',import.meta.url));
 assert.match(expected??'',/^[a-f0-9]{64}$/);assert.equal(sha(bytes),expected);
 for(const f of JSON.parse(bytes).files)assert.equal(sha(await readFile(f.path)),f.sha256);
 for(const f of [contract.parent,contract.notes,contract.source,...contract.targets.flatMap(t=>t.images)])assert.equal(sha(await readFile(f.path)),f.sha256);
}
export function exactRequest({ids,figureIds,revision,batch}){
 assert.equal(revision.parentSha256,contract.parent.sha256);assert.equal(revision.notesSha256,contract.notes.sha256);assert.deepEqual(figureIds,[]);
 const t=contract.targets.find(t=>t.group.batchId===batch.batchId);assert(t);assert.deepEqual(ids,[t.id]);
 const schema={type:'object',additionalProperties:false,required:['translations','figures'],properties:{translations:{type:'array',minItems:1,maxItems:1,items:{type:'object',additionalProperties:false,required:['sourceBlockId','text'],properties:{sourceBlockId:{type:'string',enum:[t.id]},text:{type:'string',enum:[t.expected]}}}},figures:{type:'array',maxItems:0,items:{type:'object',additionalProperties:false,properties:{}}}}};
 return {prompt:t.prompt,schema,visualInputs:t.images.map(i=>({path:i.path.replaceAll('\\','/').replace('E:/AgentData/Coach/knowledge/processing/',''),sha256:i.sha256,assetId:i.assetId,role:'original',scale:1}))};
}
export function validateExact(output,ids){
 assert.deepEqual(Object.keys(output).sort(),['figures','translations']);assert.deepEqual(output.figures,[]);
 assert.deepEqual(output.translations,ids.map(id=>({sourceBlockId:id,text:contract.targets.find(t=>t.id===id).expected})));
 return true;
}
export function validateCandidate(candidate,parent){
 const restored=structuredClone(candidate.body);for(const t of contract.targets){const b=restored.blocks.find(b=>b.sourceBlockIds[0]===t.id);assert.equal(b.text,t.expected);b.text=t.before;}
 assert.deepEqual(restored,parent.body);assert.deepEqual(candidate.figures,parent.figures);assert.deepEqual(candidate.source,parent.source);return true;
}
'''
(RUN/'exact-request.mjs').write_text(helper,encoding='utf-8',newline='\n')
producer=(BASE/'textbook-production-web.mjs').read_text(encoding='utf-8');old_producer=producer
producer=producer.replace("import {webProductionSchema", "import {exactRequest,validateExact,validateCandidate,assertFrozen} from './exact-request.mjs';\nimport {verifyWebRevisionInheritance} from './textbook-audit-web.mjs';\nimport {webProductionSchema",1)
producer=producer.replace('async function ensureDispatchAllowed(){','async function ensureDispatchAllowed(){await assertFrozen(option(\'--runtime-sha\'));',1)
producer=producer.replace('const attempts=[];let usage=null;','const requests=[];const attempts=[];let usage=null;')
producer=producer.replace(' const schema=webProductionSchema',' let schema=webProductionSchema').replace(' const prompt=[japanese?',' let prompt=[japanese?')
needle=" if(option('--request-only')){"
at=producer.index(needle);end=producer.index('\n',at)
producer=producer[:at]+" const exact=exactRequest({ids,figureIds,revision,batch});prompt=exact.prompt;schema=exact.schema;visualInputs=exact.visualInputs;\n if(option('--request-only')){const work=join(dataPath(option('--request-only')),batch.batchId);await mkdir(work,{recursive:true});const request=await prepareTextbookCliRequest({prompt,schema,model:'gpt-6.1-sol',reasoningEffort:'high',images:visualInputs.map(a=>dataPath(a.path)),work});requests.push({batchId:batch.batchId,prompt,schema,request,visualInputs});continue;}"+producer[end:]
producer=producer.replace(' validateWebProductionOutput(call.output,',' validateExact(call.output,ids);\n validateWebProductionOutput(call.output,',1)
producer=producer.replace('if(batchPlan)usage=batchHelpers.summarizeWebBatchUsage(attempts).usage;',"if(option('--request-only')){console.log(JSON.stringify({requests,modelCalls:0}));process.exit(0);}\nif(batchPlan)usage=batchHelpers.summarizeWebBatchUsage(attempts).usage;",1)
producer=producer.replace('candidate.candidateSha256=sha(JSON.stringify(candidate));','validateCandidate(candidate,parentCandidate);\nawait verifyWebRevisionInheritance(processing,candidate);\ncandidate.candidateSha256=sha(JSON.stringify(candidate));',1)
(RUN/'textbook-production-web.mjs').write_text(producer,encoding='utf-8',newline='\n')
(OUT/'production.patch').write_text(''.join(difflib.unified_diff(old_producer.splitlines(True),producer.splitlines(True),fromfile='schema-v2/producer',tofile='396962/producer')),encoding='utf-8')
deferred=[]
for issue in notes['modelReview']['issues']:
    if issue['severity']=='source-note' or issue['targetId'] in ids:continue
    h=sha(json.dumps(issue,ensure_ascii=False,separators=(',',':')).encode())
    deferred.append({'batchId':issue_group[h],'targetId':issue['targetId'],'severity':issue['severity'],'issueSha256':h,'reason':'outside the two exact authorized text targets; original finding retained'})
target={'schema':'coach-web-group-revision-targets/1','parentSha256':parent_sha,'sourceSha256':parent['source']['sourceSha256'],'groups':groups,'textBlockIds':ids,'figureIds':[],'deferred':deferred}
(STAGE/'targets.json').write_text(json.dumps(target,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
manifest={'schema':'coac269-396962-runtime/1','schemaV2Parent':bind(BASE/'runtime-manifest.json'),'b0168Parent':bind(OLD/'b0168-review-runtime-manifest.json'),'authorizationComment':contract['authorizationComment'],'files':[{'path':str(p),'sha256':sha(p.read_bytes())} for p in sorted(RUN.iterdir()) if p.is_file() and p.name!='runtime-manifest.json']}
(RUN/'runtime-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
for name,p in [('contract.json',RUN/'exact-contract.json'),('runtime.json',RUN/'runtime-manifest.json'),('targets.json',STAGE/'targets.json')]:shutil.copyfile(p,OUT/name)
print(json.dumps({'runtimeManifest':bind(RUN/'runtime-manifest.json'),'targets':len(targets),'deferred':len(deferred),'modelCalls':0}))
