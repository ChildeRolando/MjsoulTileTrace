import json,hashlib,shutil,datetime
from pathlib import Path
O=Path(__file__).parent
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
P=load(O/'paths.json');R=Path(P['root']);S=Path(P['runtime']);B=Path(P['base']);raw=load(P['oldRaw']['path']);v=load(O/'verification.json')
original=load(B/'runtime-manifest.json');unchanged=[]
for f in original['files']:
 p=B/f['path'];assert bind(p)['sha256']==f['sha256'];unchanged.append(bind(p))
assert bind(P['oldRaw']['path'])['sha256']==P['oldRaw']['sha256']
receipt=load(O/'failed-production-receipt.json');parent=R/receipt['candidatePath'];assert bind(parent)['sha256']==receipt['candidateSha256']
assert not (R/'web-production/v1/candidates/79-bilibili-cn/cv1775262.r2.display.json').exists()
schemaError=next(e['error']['message'] for e in raw['events'] if e['type']=='turn.failed')
summary=dict(schema='coac244-maker-schema-repair/1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),chapterId='79-cn-chapter-222-5',originalCallId=raw['callId'],raw=P['oldRaw'],terminalClass='server-output-schema-rejection',actualTerminalError=json.loads(schemaError),transportDiagnostics=[e for e in raw['events'] if e['type']=='error'],rawLastMessage=None,parsedOutput=None,usage=None,completedTurn=False,localTimedOut=False,localOutputOverflow=False,exitCode=raw['exitCode'],recovery=dict(possible=False,reason='no complete output, no turn.completed; retained failure cannot be promoted or hand-restored'),schemaSuspects=['figures.items.properties.unknowns.enum contains array value []','figures.items.properties.sourceNotes.enum contains array value','minLength/count keywords removed from conservative wire; local checks retain semantics'],serverDidNotIdentifyLeaf=True,fix=dict(runtime=P['newManifest'],productionSchema=bind(S/'production-schema.mjs'),cli=bind(S/'textbook-production-cli.mjs'),standardWebMaker=bind(S/'textbook-production-web.mjs'),exact222Maker=bind(O/'run222-fixed.mjs'),wire='only object/array/string, required-all-keys, additionalProperties:false, scalar string enums',localGate='exact target count/IDs, nonempty content, fixed kind/caption/unknowns/sourceNotes, exact two-reference transcription; before candidate write',remoteAcceptanceProven=False,reviewFirstLiveDoesNotProveMakerFirstLive=True),verification=dict(passedChecks=len(v['checks']),actualRequestConstructionCases=3,modelCalls=0),budget=dict(originalFailedMaker=1,additionalMakerRequired=1,originalUnusedFirstAudit=1,minimumFutureLocalCalls=2,stageLifetimeMaximumLocalCalls=3,automaticRetry=0,dispatched=False,upstreamRequests=None,monetaryCost=None),unchangedOriginalRuntimeFiles=unchanged,originalCandidate=bind(parent),newCandidate=None,formalActiveChanged=False,providerOrCredentialsChanged=False,newModelCalls=0,officialDocs='https://developers.openai.com/api/docs/guides/structured-outputs')
save(O/'stage-summary.json',summary)
save(O/'runtime-manifest.json',load(S/'runtime-manifest.json'))
D=O/'runtime';D.mkdir(exist_ok=True)
for p in S.iterdir():
 if p.is_file():shutil.copy2(p,D/p.name)
T=R/'integration/coac244-maker-schema-fix-20261028';T.mkdir(exist_ok=True)
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,T/p.name)
save(T/'handoff-248.json',summary)
(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
owner=Path('short-stage-owner-prefix.md');old=owner.read_text(encoding='utf8')
prefix='''## 2026-10-28 222制作schema兼容已零模型修复

原制作b702fbf7-dbe4-4533-9a55-aa0912a334f3完整raw终态为服务端invalid_json_schema，param=text.format.schema，exit1、无turn.completed/最终消息/parsedOutput/usage，本地非超时/截断；前置重连不改变最终分类，无法0调用恢复。原失败和额度1保留，不能把157含图独审首件当制作已验活。

新冻结制作快照 `audit/runtimes/coac244-vision-production-schema-v2-20261028`：修实际222 caller与标准web producer的schema/本地输出校验，CLI的prepareTextbookCliRequest与真实invoke复用同一argv/stdin/schema/images构造。采用保守线格式，数组不再enum整个数组，数目/非空/固定数组与两处转录白名单仍由本地写候选前逐项拒绝。原source/父/独审/27依赖快照不变。25项离线回归、三条真实制作请求构造（222/web figure-target/纯文）通过；含图terra/max，纯文sol/high不变，未调模型。服务端没指出具体schema叶节点，不能以离线lint称唯一根因或远端已接受。

交接 `integration/coac244-maker-schema-fix-20261028/handoff-248.json`，修复caller `run222-fixed.mjs` 使用新run目录保留r2失败，排除账已含失败call。原余1仅独审；下一步若追加授权1maker，则未来最多2调用(新制作1+原独审1)、本阶段累计最多3，失败void计0retry，本轮未派。目标仅222的两处2m→1m，其它字段字节不动，未产候选/未判pass；不重开已有来源装配与其他正常任务。

'''
owner.write_text(prefix+old,encoding='utf8')
print(json.dumps(dict(shared=str(T),runtime=P['newManifest'],oldFilesUnchanged=len(unchanged),modelCalls=0)))
