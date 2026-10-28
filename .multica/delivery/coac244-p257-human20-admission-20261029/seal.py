"""Seal exact stage/code; leave book data/raw/images in shared storage only."""
from pathlib import Path
import json,hashlib,shutil,zipfile,copy,os
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-p257-human20-admission-20261029';W=O.parents[2]
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));sha=lambda b:hashlib.sha256(b).hexdigest();ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
def save(n,x):
 (D/n).write_bytes((json.dumps(x,ensure_ascii=False,indent=2)+'\n').encode());shutil.copyfile(D/n,O/n)
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
stage=D/'stage';files=[{'path':str(f.relative_to(stage)).replace('\\','/'),'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(stage.rglob('*')) if f.is_file()]
save('stage-files.sha256.json',{'canonical':'nemata-jp-chapter-250-1','candidateSha256':'a9ce50898c0407ecca32dc538ad208f667a0a950372acec1114263e177f000e7','files':files})
manifest=load(D/'manifest.json');r=load(manifest['receipt']['path']);v=load(D/'verification.json')
h={'schema':'coac244-p257-human20-exact-display-stage-handoff/1','canonical':'nemata-jp-chapter-250-1','candidate':r['candidate'],'source':r['source'],'parent':r['parent'],'independentReceipt':manifest['receipt'],'raw':r['raw'],
 'package':str(D),'loader':str(D/'admit.mjs'),'loaderFunction':'verifyLimited(root,candidatePath)','stageEntry':str(D/'stage.mjs'),'stageFunction':'stageLimited(options)','ownedStageFunction':'stageOwnedHuman257({processingRoot,destination,sourceLibraryPath,binding})','stageVerifierFunction':'verifyStage(root,candidatePath,stageDirectory)',
 'postBuildFunction':'installOriginalImageLinks({processingRoot,directory})','stage':str(stage),'manifest':ref(D/'manifest.json'),'stageSeal':ref(D/'stage-files.sha256.json'),'verification':ref(D/'verification.json'),'browserVerification':ref(D/'browser-verification.json'),
 'sourceBlocksOwned':945,'originalOther11PageSourceBlocks':837,'selected261':r['applicationEvidence']['source261'],'displayBlocks':344,'figures':303,'mandatoryDisplayConditions':6,'q9OrderedSourcePositions':18,
 'wholeChapterPassed':False,'ordinaryWholePagePassed':False,'globalAdmissionGranted':False,'actualGlobalMcpArenaReadbackRequired':True,'newModelCalls':0,'requiresNoNewReviewOrHumanAnnotation':True,
 'routeNote':'250 must add one exact canonical PDF owned-scope route and post-build source link hook, consume sealed stage or stageOwnedHuman257, verifyStage then real MCP/Arena whole945 source/344 display/303 images/6notes and original b3/b4 links; durable rebuild must retain them. Do not fake a generic passed page for257.'}
save('handoff.json',h)
reg=P/'integration/coac244-remaining26-closure-register-20261028.json';before=reg.read_bytes();a=load(reg);b=copy.deepcopy(a);row=next(x for x in b['rows'] if x['chapterId']==h['canonical']);row['human20ExactStageInterface']={'handoff':ref(D/'handoff.json'),'isolatedDisplayVerified':True,'mandatoryConditionsInstalled':6,'sourceBlocksOwned':945,'figures':303,'originalUncertainRetained':True,'covered':False,'newModelCalls':0};row['nextAction']='Exact human20+recovered Q9 admission/stage now executable in integration/coac244-p257-human20-admission-20261029. Existing250 sole writer integrates its canonical owned stage plus post-build original screenshot links, realMCP/Arena945 source positions/344blocks/303images/6limits and b3/b4 original links, verifies durable rebuild then whole-book coverage. Upper15 old6p stays uncertain;2613m and11pages837 preserved. No model/maker/review/human repeats or active switch.'
for x,y in zip(a['rows'],b['rows']):
 if x['chapterId']!=h['canonical']:assert x==y
assert reg.read_bytes()==before;tmp=D/'register.tmp';tmp.write_bytes((json.dumps(b,ensure_ascii=False,indent=2)+'\n').encode());os.replace(tmp,reg)
save('register-update.json',{'beforeSha256':sha(before),'afterSha256':sha(reg.read_bytes()),'onlyChangedCanonical':h['canonical'],'global250CoverageWritten':False})
prefix=W/'short-stage-owner-prefix.md';text=prefix.read_text(encoding='utf-8-sig');note='2026-10-29 PDF257 human20精确准入/stage缺项已实修：integration/coac244-p257-human20-admission-20261029，固定a9ce5089/源ca638236/父5403cb35/恢复收据4e1cc55a/真实2b216edc。438绑定、35拒绝检查、浏览器实核六近邻非原文限制/344显示块/303图和b3/b4原始截图链接；完整945源＝837复用11页＋26193＋25715，2613m沿原source-adjudication，Q9十八位置有序保留。上河15旧6p仍uncertain，不拿5处显示标签认证实体同时性或改四个人标6p凑数；四unknown/原body/图/raw/父审历史不变，丢失preflight/私有历史快照不伪造。真实verifyLimited、stageOwnedHuman257/stageLimited、verifyStage及原始图链接post-build接口已提供，250唯一写者须注册持久路由并读全章/重建后判覆盖；根不写全局covered或active，新增模型/制作/识图0，不重复人标或独审。\n\n'
if not text.startswith(note):prefix.write_bytes((note+text).encode())
pub=[f for f in O.iterdir() if f.is_file() and f.name!='files.sha256.json'];save('files.sha256.json',{'files':[{'path':f.name,'sha256':sha(f.read_bytes()),'bytes':f.stat().st_size} for f in sorted(pub)]})
z=W/'coac244-p257-human20-admission-20261029.zip'
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as a:
 for f in sorted(O.iterdir()):
  if f.is_file():a.write(f,f.name)
shutil.copyfile(z,D/z.name)
print(json.dumps({'handoff':ref(D/'handoff.json'),'stageFiles':len(files),'zipBytes':z.stat().st_size,'zipSha256':sha(z.read_bytes()),'newModels':0}))
