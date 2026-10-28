"""Freeze only the approved web311 eight-curve revision; no paid calls."""
import json,hashlib,shutil
from pathlib import Path
from PIL import Image
ROOT=Path('E:/AgentData/Coach/knowledge/processing'); HERE=Path(__file__).resolve().parent
OLD=HERE.parent/'b29-311250-prep'; RT=ROOT/'audit/runtimes/coac269-311-curves-v1-20261028'; STAGE=ROOT/'web-production/v1/runs/coac269-311-curves-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
def bind(p):return {'path':str(p),'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()}
def save(p,x):
 with Path(p).open('x',encoding='utf8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
w=load(OLD/'plan.json')['web311'];parent=load(w['parent']['path']); audit=load(w['parentAudit']['path'])
for k in ['parent','source','parentAudit']:assert bind(w[k]['path'])['sha256']==w[k]['sha256']
assert w['parent']['sha256']=='5d74d3836050c55996dee84fc35c6df4b82228c79674e9ff93065eb7aee20d97'
assert len(w['charts'])==8 and len(parent['body']['blocks'])==225 and len(parent['figures'])==21
base=ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028/runtime-manifest.json'
assert bind(base)['sha256']=='814df700d298188dea14d20fd84ac818d1ded9a706e370bc7a1714141ad6a7a9'
for f in load(base)['files']:assert bind(f['path'])['sha256']==f['sha256']
images=[];rules=[]
for chart in w['charts']:
 idx=next(i for i,f in enumerate(parent['figures']) if f['figureId']==chart['figureId']); a=chart['sourceAssets'][0];path=ROOT/a['path']; assert bind(path)['sha256']==a['sha256']
 im=Image.open(path);images.append({**bind(path),'bytes':path.stat().st_size,'width':im.width,'height':im.height,'figureId':chart['figureId'],'assetId':a['assetId'],'role':'original'})
 rules.append({**chart,'index':idx,'imageIndex':len(images),'axisMaximum':[4500,8000,6000,12000,7000,8000,80,80][len(rules)],'allowedLeafPaths':[f'/figures/{idx}/transcription',f'/figures/{idx}/unknowns'],'pointReadingsAuthorizedNow':True})
raw=ROOT/'audit/calls'/f"{audit['calls'][0]['callId']}.json"
contract={'schema':'coac269-fixed-web311-curves/1','canonical':w['canonical'],'authorizationComment':'01a18226-73d2-75c1-95bc-b6fe80283266','parent':w['parent'],'source':w['source'],'parentAudit':w['parentAudit'],'parentReviewRaw':bind(raw),'baseRuntime':bind(base),'preparationPlan':bind(OLD/'plan.json'),'context':bind(OLD/'311-context.json'),'images':images,'charts':rules,'candidatePath':str(ROOT/'web-production/v1/candidates/79-bilibili-cn/cv1815400.coac269b33r1.json'),'maximumMaker':1,'maximumIndependentReview':1,'retry':0,'wholeChapterPassed':False,'nonTargetHandAUntouched':True,'noHumanTileEvidenceUsed':True}
RT.mkdir(exist_ok=False);STAGE.mkdir(exist_ok=False)
save(RT/'contract.json',contract);save(HERE/'contract.json',contract);shutil.copyfile(HERE/'curves.mjs',RT/'curves.mjs')
save(RT/'runtime-manifest.json',{'schema':'coac269-frozen-web311-curves/1','baseManifest':bind(base),'files':load(base)['files']+[bind(base),bind(RT/'contract.json'),bind(RT/'curves.mjs')]})
save(HERE/'runtime.json',bind(RT/'runtime-manifest.json'));print(json.dumps({'prepared':True,'files':len(load(RT/'runtime-manifest.json')['files']),'images':len(images),'newModelCalls':0}))
