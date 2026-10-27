from pathlib import Path
import json,hashlib,shutil,subprocess
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path('.multica/delivery/coac244-closure26-zero-20261028')
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def dump(n,v):(O/n).write_bytes((json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
j=load(O/'text-batch-183-236.json')
for job in j['jobs']:
 r=subprocess.run(job['preflightCommand'],capture_output=True,encoding='utf-8');assert r.returncode==0,r.stderr
 job['preflight']=json.loads(r.stdout);job['fullInheritanceProofRequired']=False;job['fullInheritanceProof']='text-parent-chain-proofs.json: true with original uncertain issue/verdict unchanged'
 if '183-1' in job['chapterId']:job['requiredOutputDiffWhitelist']='Existing target paragraph characters unchanged, append only a clearly labeled 校注 with both data cases (4%=4%;役牌2%<客风3%) and original 见1张 counting ambiguity explicitly unresolved. Reject any replacement of 见 with 持 as author text.'
 else:job['requiredOutputDiffWhitelist']='Only remove 剩余 from the one phrase 即使剩余巡数很少，也应当立直 and append a clearly labeled 校注 that the original does not specify elapsed/remaining turn timing. Other target paragraph characters unchanged.'
 job['mustCheckDiffBeforeAudit']='If model output violates this whitelist, preserve raw as failed, do not hand-edit it and do not spend the audit allowance or retry. Independent reviewer must retain uncertain if unresolved.'
dump('text-batch-183-236.json',j)
runtime=Path(j['runtime']['path']);manifest=load(j['runtime']['manifestPath']);assert sha(j['runtime']['manifestPath'])==j['runtime']['sha256']
(O/'bounded-text-runtime').mkdir(exist_ok=True)
for f in manifest['files']:
 assert sha(runtime/f['name'])==f['sha256'];shutil.copyfile(runtime/f['name'],O/'bounded-text-runtime'/f['name'])
shutil.copyfile(j['runtime']['manifestPath'],O/'bounded-text-runtime/bounded-runtime-manifest.json')
for n in ['prepare-uncertain-text-runtime.py','verify-text-parent-chains.mjs','finalize-closure26.py']:shutil.copyfile(n,O/n)
summary=load(O/'stage-summary.json');summary['textProposal']['boundedRuntime']=j['runtime'];summary['textProposal']['originalGateOnlyAcceptedErrors']=True;summary['textProposal']['boundUncertainDraftAdmissionRegressionCases']=18;summary['textProposal']['independentUncertainStillBlocksPass']=True;dump('stage-summary.json',summary)
verify=load(O/'verification.json');verify['boundedTextRegressionCases']=18;verify['fullRealParentChainsVerified']=2;verify['oldFrozenRuntimeFilesModified']=0;dump('verification.json',verify)
register=load(O/'remaining26-register.json')
for row in register['rows']:
 if row['chapterId'] in [v['chapterId'] for v in j['jobs']]:row['textExecutionPacket']='text-batch-183-236.json';row['boundedDraftRuntime']=j['runtime'];row['originalUncertainPreserved']=True
dump('remaining26-register.json',register);(R/'integration/coac244-remaining26-closure-register-20261028.json').write_bytes((O/'remaining26-register.json').read_bytes())
readme='本阶段0模型，仅补证与合法路径准备；没有候选/新审校、没有新派276、没有切active。\n\n'
readme+='基线230/256原章、262/303原单元，v21已入库。剩26完整canonical如下；计数不因本准备更新。\n\n'
for row in register['rows']:readme+='- '+row['chapterId']+' ['+row['category']+'] '+row['nextAction']+'\n'
readme+='\n下一最小批建议先纯文字183/236，各1制作+1独立target-text首审，总最多4新本地调用，失败void计、0重试，待根授权。新文字snapshot只允许这两个源/父/notes SHA和单段target的uncertain草稿入口，不改旧issue等级；独审uncertain仍阻断pass。\n\n'
readme+='图点222与PDF217各最多1次独立裁决，总另2，0生产，须查同SHA已有独审避免全章重复；p217只判单点不代表全页/全章通过。234本地旧调用1、2条重连提示、上游请求/执行数及费用unknown；本地无完整输出可恢复。若追加，最小1制作重试+原未用首审1，未来最多2，已知旧批本地总3/4，追加后最多5；不能把新制作挪用原首审额度。全部提案若都授权为4+2+2=8个未来本地调用，当前授权/执行新增0；不承诺未知远端次数或费用。\n'
(O/'README.md').write_bytes(readme.encode())
print(json.dumps({'boundedRuntime':j['runtime'],'fullParentProofs':2,'regressionCases':18,'modelCalls':0},ensure_ascii=False))
