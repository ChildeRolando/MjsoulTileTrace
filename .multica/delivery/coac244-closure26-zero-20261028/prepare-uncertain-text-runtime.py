from pathlib import Path
import json,hashlib,shutil
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path('.multica/delivery/coac244-closure26-zero-20261028');J=json.loads((O/'text-batch-183-236.json').read_text())
base=R/'audit/runtimes/coac244-inline-japanese-v2-20261027';out=R/'audit/runtimes/coac244-text-uncertain-183236-v1-20261028';out.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
for p in base.iterdir():
 if p.is_file():shutil.copyfile(p,out/p.name)
p=out/'textbook-audit-web.mjs';s=p.read_text();begin=s.index('export function verifyWebRevisionContent(');end=s.index('async function verifyWebRevisionContext',begin);scope=s[begin:end]
bindings=[{'parentSha256':j['parent']['sha256'],'notesSha256':j['parentAudit']['sha256'],'sourceSha256':j['source']['sha256'],'targetId':j['targetIds'][0]} for j in J['jobs']]
needle=" const clean=f=>"
insert=" const boundedUncertainText="+json.dumps(bindings,separators=(',',':'))+".some(b=>textMode&&ids.length===0&&texts.length===1&&texts[0]===b.targetId&&r.parentSha256===b.parentSha256&&r.notesSha256===b.notesSha256&&parent.source.sourceSha256===b.sourceSha256);\n"
assert needle in scope;scope=scope.replace(needle,insert+needle,1)
scope=scope.replace("i.severity==='error'&&i.targetId===id","(i.severity==='error'||boundedUncertainText&&i.severity==='uncertain')&&i.targetId===id")
scope=scope.replace("(textMode?review.blockChecks:review.figureChecks).find(c=>c.id===id)?.verdict!=='needs-repair'","!['needs-repair',...(boundedUncertainText?['uncertain']:[])].includes((textMode?review.blockChecks:review.figureChecks).find(c=>c.id===id)?.verdict)")
scope=scope.replace("i.severity!=='error'","(i.severity!=='error'&&!(boundedUncertainText&&i.severity==='uncertain'))")
scope=scope.replace("c.verdict!=='needs-repair'","(c.verdict!=='needs-repair'&&!(boundedUncertainText&&c.verdict==='uncertain'))")
s=s[:begin]+scope+s[end:];p.write_bytes(s.encode())
p=out/'textbook-production-cli.mjs';s=p.read_text();marker="  if (model !== 'gpt-6-luna'";assert marker in s;s=s.replace(marker,"  if(images.length)throw Error('bounded_uncertain_text_runtime_forbids_images_use_terra_runtime');\n"+marker,1);p.write_bytes(s.encode())
manifest={'schema':'coac244-bounded-uncertain-text-runtime/1','authorizationCommentId':'01a17e9a-43ad-71f2-a72f-9f8f034b0c55','base':str(base),'runtime':str(out),'modelCalls':0,'model':'gpt-6.1-sol','reasoningEffort':'high','imagesForbidden':True,'bindings':bindings,'change':'Draft admission only: original uncertain issue/verdict retained. All parent/raw/source bindings and all independent target review acceptance rules stay unchanged. This is not semantic approval and no candidate was produced.','files':[{'name':p.name,'sha256':sha(p)} for p in sorted(out.iterdir()) if p.is_file()]}
(out/'bounded-runtime-manifest.json').write_bytes((json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())
J['runtime']={'path':str(out),'manifestPath':str(out/'bounded-runtime-manifest.json'),'sha256':sha(out/'bounded-runtime-manifest.json')};J['oldCompleteParentGate']='web_revision_notes_scope rejected uncertain targets; do not downgrade original issue to error'
for job in J['jobs']:
 for key in ['preflightCommand','productionCommandAfterApproval']:job[key][1]=str(out/'textbook-production-web.mjs')
 job['runtime']=J['runtime'];job['fullInheritanceProofRequired']=True
(O/'text-batch-183-236.json').write_bytes((json.dumps(J,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'runtime':str(out),'manifestSha256':J['runtime']['sha256'],'modelCalls':0}))
