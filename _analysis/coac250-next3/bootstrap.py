from pathlib import Path
import subprocess,json,hashlib,re
p=Path('_analysis/coac250-next3'); p.mkdir(exist_ok=True)
root=Path('E:/AgentData/Coach/knowledge/processing'); repo=Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach')
out=root/'integration/coac250-limited-159242-20261028'; out.mkdir(exist_ok=True)
consumer=out/'consumer'; consumer.mkdir(exist_ok=True)
names=subprocess.check_output(['git','ls-tree','-r','--name-only','c285275','artifacts/a249-next3']).decode().splitlines()
for name in names:
    dest=consumer/Path(name).relative_to('artifacts/a249-next3');dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(subprocess.check_output(['git','show','c285275:'+name]))
sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha((consumer/'consumer-manifest.json').read_bytes())=='a3b9b0b091ec85a5db5a94af55ca6613d87781f73ccebf5792a9c9d24cc9f58b'
for f in json.loads((consumer/'consumer-manifest.json').read_bytes())['files']:
    assert sha((consumer/f['path']).read_bytes())==f['sha256']
assert sha((consumer/'fidelity-evidence.mjs').read_bytes())=='efa256a8ffa1a96874dd8d7267b1319d8f3643d3ddf238c6308e2471e1441382'
runtime=out/'runtime';runtime.mkdir(exist_ok=True);base=repo/'scripts/scene-study';seen=set()
def copy_module(name):
    if name in seen:return
    seen.add(name); b=(base/name).read_bytes(); dest=runtime/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
    for spec in re.findall(r"(?:from\s*|import\s*\()['\"](\.[^'\"]+)['\"]",b.decode('utf-8')):
        copy_module(str((Path(name).parent/spec).as_posix()))
copy_module('textbook-audit-web.mjs')
for name in ['textbook-audit-web-source.py','textbook-production-web-visual.py','textbook-production-web-present.py']:
    (runtime/name).write_bytes((base/name).read_bytes())
original=(runtime/'textbook-audit-web.mjs').read_text(encoding='utf8')
start=original.index('export async function verifyAuditForWebCandidate(');end=original.index('\n// ---------------------------------------------------------------------------',start)
function=original[start:end].replace('export async function verifyAuditForWebCandidate(', 'export async function verifyOriginalUnknownParent(',1)
anchor='const latest=await latestWebAuditReceipt(processingRoot,input);'
function=function.replace(anchor,"if(!['5f2555f1ad90b99581f054974c7bc29b6536896926cc7c33a3f9574cf51c3373','62987619296c7f7ef775b41967e69f84802a17c08146df9ffd436f51f84b19aa'].includes(sha(bytes)))throw Error('limited_parent_candidate_not_authorized');"+anchor,1)
function=function.replace("!['passed','passed-after-transport-recovery','passed-after-specific-presentation-repair'].includes(receipt.status)","receipt.status!=='needs-repair'||receipt.method!=='independent-sol-high-full-article-review'",1)
function=function.replace('||!(receipt.effectiveSemanticCompleteness??receipt.semanticCompleteness)?.complete',"||receipt.semanticCompleteness?.complete!==false",1)
function=function.replace('!validateWebReview(receipt.effectiveModelReview??receipt.modelReview,source,candidate).passed','!same(validateWebReview(receipt.modelReview,source,candidate),receipt.modelChecks)',1)
assert function.count('verifyOriginalUnknownParent')==1
(runtime/'textbook-audit-web.mjs').write_text(original+'\n// Read-only parent evidence verification for the two authorized unknown-fidelity scopes.\n// Original ordinary verifyAuditForWebCandidate above is unchanged; this returns needs-repair.\n'+function,encoding='utf8',newline='\n')
(out/'original-parent-verifier.mjs.txt').write_text(original[start:end],encoding='utf8')
stagebase=repo/'scripts/textbook-processing';stage=(stagebase/'stage-web-textbook.mjs').read_text(encoding='utf8')
stage=re.sub(r"from '(\.[^']+)'",lambda m:"from '"+(stagebase/m[1]).resolve().as_uri()+"'",stage)
stage=stage.replace("new URL('./stage-web-image.py',import.meta.url)","new URL('"+(stagebase/'stage-web-image.py').as_uri()+"')")
needle="'passed-after-specific-source-editorial-note'].includes(audit.status)"
assert needle in stage
stage=stage.replace(needle,"'passed-after-specific-source-editorial-note','admitted-exact-limited-unknown-fidelity'].includes(audit.status)")
needle='if(![\'passed\',\'passed-after-specific-input-adjudication\''
assert needle in stage
stage=stage.replace(needle,"if(audit.status==='admitted-exact-limited-unknown-fidelity'){const strict=await import('./admit.mjs');const verified=await strict.verifyLimitedUnknownFidelity(processingRoot,path);if(JSON.stringify(audit)!==JSON.stringify(verified))throw Error('limited_stage_callback_binding');}\n "+needle)
stage=stage.replace("auditStatus:audit.status,","auditStatus:audit.status,limitedUnknownFidelity:audit.limitedUnknownFidelity??null,")
(out/'stage-limited.mjs').write_text(stage,encoding='utf8',newline='\n')
contract={'schema':'coac250-exact-limited-unknown-fidelity-contract/1','authorizationWakeup':'01a17f47-fc4a-7821-ae40-f8c2c7b83439','scope':['79-cn-chapter-159-9','79-cn-chapter-242-3'],'purpose':'Faithful presentation of author argument with original unknown retained; not certification of all implicit tactical facts.','parentRule':'Original source/production/raw and review binding gates are rerun; every non-target block/figure faithful, all image occurrences represented, sole uncertain block/figure exactly the authorized target.','supplementRule':'Exact independent raw/call/figure/bbox/candidate/source/old-audit binding, actual terra/max five images, limited-unknown-acceptable and all author contributions faithfulWithUnknown. Uncertain exact dependencies remain uncertain.','status':'admitted-exact-limited-unknown-fidelity','standardWholeArticlePassed':False,'oldReceiptChanged':False,'candidateChanged':False,'extraModelCalls':0,'displayRule':'Preserve all source text/conditions/emphasis, original image bytes, transcription/caption/sourceNotes/unknowns. No added note required by either independent model.','ordinaryGateUnchanged':True}
(out/'contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
owner=repo/'docs/plans/2026-10-24-full-textbook-processing.md'
(p/'owner.before.md').write_bytes(owner.read_bytes())
with owner.open('a',encoding='utf8',newline='\n') as f:f.write('\n\n### COAC-250：159/242 已授权限定 unknown 忠实性准入\n\n只允许 `integration/coac250-limited-159242-20261028/contract.json` 绑定的两个原候选及独立补证。沿原门禁复验来源、制作、原审/raw 与全部未改范围；限定靶点消费真实 terra/max 的作者论证忠实性结论，保留牌码 unknown 和仍 uncertain 的战术依赖。采用单独 `admitted-exact-limited-unknown-fidelity` 准入状态，不修改原 needs-repair 回执，不伪称普通整章 passed；完整 MCP/Arena 回读后才计覆盖。其它章及普通门禁不变，本阶段模型与制作均0。\n')
(p/'owner.after.md').write_bytes(owner.read_bytes())
print(json.dumps({'recoveredCommit':'c285275','consumerFiles':len(names),'runtimeModules':len(seen),'output':str(out),'modelCalls':0}))
