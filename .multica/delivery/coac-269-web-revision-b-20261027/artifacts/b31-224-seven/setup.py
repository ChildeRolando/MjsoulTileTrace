"""Freeze the exact224 seven-cell adapter. No model calls or candidate writes."""
import hashlib,json,shutil
from pathlib import Path
from PIL import Image
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
RT=ROOT/'audit/runtimes/coac269-224-seven-v1-20261028';STAGE=ROOT/'web-production/v1/runs/coac269-224-seven-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
def bind(p):p=Path(p);return {'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def save(p,o):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(o,f,ensure_ascii=False,indent=2);f.write('\n')
RT.mkdir(exist_ok=False);STAGE.mkdir(exist_ok=False)
receipt=ROOT/'integration/coac249-224-target-impact-reviewed-20261028.json';r=load(receipt)
assert bind(receipt)['sha256']=='20d624441531f37ebd9b69f5407c69dd03a5eedbc6390edc04fe51c108be4c20'
assert r['candidate']['sha256']=='82c282e5546ed39278a878cb160ef5ef7645d0190fded81d5b21fd5f5a3b01ea'
assert Image.open(r['images'][0]['path']).size==(480,270);assert Image.open(r['images'][1]['path']).size==(960,540)
data=[(1,'放铳率',6,[203,178,219,196],'黄色','放铳率第6、7巡约在15—16附近'),(1,'放铳率',7,[231,178,247,196],'黄色','放铳率第6、7巡约在15—16附近'),(2,'和牌中自摸所占比例',6,[203,111,219,129],'橙色','和牌中自摸所占比例第6巡约49'),(3,'立直棒被没收率',12,[367,167,383,186],'紫色','立直棒被没收率第12巡约20—21'),(6,'和牌时一发比例',6,[203,174,219,193],'亮绿色','和牌时一发比例第6、7巡约16—17'),(6,'和牌时一发比例',7,[231,174,247,193],'亮绿色','和牌时一发比例第6、7巡约16—17'),(6,'和牌时一发比例',12,[367,163,383,183],'亮绿色','第12巡约22')]
cells=[{'id':f'224-b0013-{row}-{turn}','row':row,'series':series,'turn':turn,'sourcePixelBox':box,'x2ViewPixelBox':[2*v for v in box],'curveColor':color,'makerRawPointer':f'/output/rows/{row}/values/{turn-1}','reviewQuote':quote,'reviewRawPointer':'/output/issues/0/sourceEvidence'} for row,series,turn,box,color,quote in data]
contract={'schema':'coac269-fixed224-seven-cells/1','canonical':'nemata-jp-chapter-224-1','authorizationComment':'01a181f7-0ecd-7a2e-80c8-ea12832c2685','parent':r['candidate'],'receipt':bind(receipt),'reviewRaw':r['raw'],'makerRaw':r['productionProof']['raw'],'source':r['source'],'baseRuntime':r['runtime'],'figureId':'modern-yabejp-ja:chapter04-section005:b0013:figure','candidatePath':str(ROOT/'web-production/v1/candidates/modern-yabejp-ja/chapter04-section005.coac269b31r1.json'),'images':r['images'],'cells':cells,'pixelCalibration':{'originalSize':[480,270],'existingNearestNeighborViewSize':[960,540],'coordinateOrigin':'top-left; boxes [left,top,right,bottom]','xAxisTurns1to15Centers':[74.5,456.5],'yAxis0to90Centers':[217.5,40.5],'legendBox':[156,45,390,100],'condition':'先制愚形待ち立直（1人攻め）; original ordered author conditions inherited, not a new general recommendation'},'maximumMaker':1,'maximumIndependentReview':1,'retry':0,'wholeChapterPassed':False}
save(RT/'contract.json',contract);shutil.copyfile(HERE/'seven.mjs',RT/'seven.mjs');shutil.copyfile(RT/'contract.json',HERE/'contract.json')
files=load(r['runtime']['path'])['files']+[bind(r['runtime']['path']),bind(RT/'contract.json'),bind(RT/'seven.mjs')]
save(RT/'runtime-manifest.json',{'schema':'coac269-frozen224-seven-runtime/1','files':files,'actualTransport':'unchanged244-schema-v2-cli-from-base-runtime','baseManifest':r['runtime']});save(HERE/'runtime.json',bind(RT/'runtime-manifest.json'))
print(json.dumps({'prepared':True,'files':len(files),'runtime':bind(RT/'runtime-manifest.json'),'newCalls':0}))
