import json, hashlib, shutil
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
HERE=Path(__file__).resolve().parent
PKG=ROOT/'integration/coac248-182201-20261028'
RT=ROOT/'audit/runtimes/coac248-182201-inline-v1-20261028'
BASE=ROOT/'audit/runtimes/coac244-text-exact-183236-v2-20261028'
WIRE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
AUTH='01a181a7-0e17-79cd-9f13-c8fe5cf060b2'
assert not (PKG/'release.json').exists(), 'Already frozen: do not rebuild an executed runtime or reset its call history.'
def digest(b): return hashlib.sha256(b).hexdigest()
def compact(x): return json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
def write(p,x): p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
PKG.mkdir(exist_ok=True); RT.mkdir(exist_ok=True)
jobs=[]
for chapter,article,target,quote,carry in [
 ('79-cn-chapter-182-5','cv1760573','b0003','かけるは内、のばすは外','b0013'),
 ('79-cn-chapter-201-6','cv1770179','b0006','日本がアメリカに戦争を挑むくらい無謀でしょう。','b0005:figure')]:
 pp=f'web-production/v1/candidates/79-bilibili-cn/{article}.display.json'
 pb=(ROOT/pp).read_bytes(); parent=json.loads(pb); ph=digest(pb)
 np=f'audit/web/articles/79-bilibili-cn/{article}.{ph}.json'
 nb=(ROOT/np).read_bytes(); notes=json.loads(nb)
 sp=parent['source']['sourcePath']; sb=(ROOT/sp).read_bytes(); source=json.loads(sb)
 tid=f'79-bilibili-cn:{article}:{target}'
 plan={'schema':'coach-inline-japanese-revision/1','authorizationCommentId':AUTH,'chapterId':chapter,'bindings':{'parentSha256':ph,'notesSha256':digest(nb),'sourceSha256':digest(sb)},'edits':[{'sourceBlockId':tid,'quotedText':quote,'operation':'gloss'}]}
 planpath=f'integration/coac248-182201-20261028/{article}-plan.json'; write(ROOT/planpath,plan)
 prior=[json.loads(l) for l in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if l and json.loads(l).get('articleId')==article]
 job={'chapterId':chapter,'articleId':article,'targetId':tid,'carryId':f'79-bilibili-cn:{article}:{carry}','parentPath':pp,'parentSha256':ph,'notesPath':np,'notesSha256':digest(nb),'sourcePath':sp,'sourceSha256':digest(sb),'parentObjectSha256':digest(compact(parent)),'notesObjectSha256':digest(compact(notes)),'sourceObjectSha256':digest(compact(source)),'planPath':planpath,'planSha256':digest((ROOT/planpath).read_bytes()),'plan':plan,'priorCallIds':[p['callId'] for p in prior],'history':[{'callId':p['callId'],'success':p['success'],'usage':p.get('usage'),'transportStatus':p.get('transportStatus')} for p in prior]}
 jobs.append(job)
write(PKG/'jobs.json',jobs); write(RT/'jobs.json',jobs)
for f in BASE.iterdir():
 if f.suffix in ('.mjs','.py'): shutil.copyfile(f,RT/f.name)
for name in ['textbook-production-cli.mjs','production-schema.mjs']: shutil.copyfile(WIRE/name,RT/name)
shutil.copyfile(HERE/'exact-carry.mjs',RT/'exact-carry.mjs')
p=RT/'inline-japanese-revision.mjs'; t=p.read_text(encoding='utf8')
t="import {assertExactCarryPlan} from './exact-carry.mjs';\n"+t
t=t.replace("export function assertInlinePlan(plan,parent,notes,source,bindings){", "export function assertInlinePlan(plan,parent,notes,source,bindings){\n if(plan?.authorizationCommentId==='"+AUTH+"')return assertExactCarryPlan(plan,parent,notes,source,bindings);")
p.write_text(t,encoding='utf8',newline='\n')
p=RT/'textbook-audit-web.mjs'; t=p.read_text(encoding='utf8')
t="import {exactCarryScope} from './exact-carry.mjs';\n"+t
needle=' const boundedUncertainText='
assert t.count(needle)==1
t=t.replace(needle,' if(exactCarryScope(candidate,parent,notes))return true;\n'+needle)
needle="if(!validateWebReview(coverageProbe,source,parent).passed)throw Error('web_revision_parent_other_scope_or_coverage_missing');"
assert t.count(needle)==1
t=t.replace(needle,"if(!validateWebReview(coverageProbe,source,parent).passed&&!exactCarryScope(candidate,parent,notes))throw Error('web_revision_parent_other_scope_or_coverage_missing');")
needle='inheritedAssetIds,...(sourceContext?{sourceContext}:{})};'
assert t.count(needle)==1
t=t.replace(needle,"inheritedAssetIds,...(exactCarryScope(candidate,parent,notes)?{unresolvedParentIssuesPreserved:notes.modelReview.issues.filter(i=>i.severity!=='source-note'&&!r.textBlockIds.includes(i.targetId)),productionOnlyAuthorization:true,chapterAccepted:false}:{}),...(sourceContext?{sourceContext}:{})};")
p.write_text(t,encoding='utf8',newline='\n')
manifest={'schema':'coac248-exact-inline-production-runtime/1','authorizationCommentId':AUTH,'baseRuntime':str(BASE),'wireRuntime':str(WIRE),'scope':jobs,'files':[{'name':p.name,'sha256':digest(p.read_bytes())} for p in sorted(RT.iterdir()) if p.name!='runtime-manifest.json'],'productionOnly':True,'chapterAccepted':False,'modelCalls':0}
write(RT/'runtime-manifest.json',manifest)
release={'runtimePath':str(RT).replace('\\','/'),'runtimeManifestSha256':digest((RT/'runtime-manifest.json').read_bytes()),'packagePath':str(PKG).replace('\\','/'),'jobs':jobs}
write(HERE/'release.json',release);write(PKG/'release.json',release)
shutil.copyfile(HERE/'run.mjs',PKG/'run.mjs')
print(json.dumps({'runtimeFiles':len(manifest['files']),'runtimeManifestSha256':release['runtimeManifestSha256'],'chapters':[j['chapterId'] for j in jobs]}))
