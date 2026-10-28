import hashlib,json,shutil
from pathlib import Path
from PIL import Image
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
HERE=Path(__file__).resolve().parent
PACKAGE=ROOT/'integration/coac244-ready109167-zero-20261028'
BASE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
RT=ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-109167-exact-v1-20261028'
load=lambda p:json.loads(Path(p).read_bytes())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p): return {'path':str(p),'sha256':sha(p),'bytes':Path(p).stat().st_size}
def save(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f: f.write(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
assert sha(PACKAGE/'files.sha256.json')=='d8e012c8ca1112782678992dab142d91c51a940aa77aa39fb60702ec8dbe6d7b'
files=load(PACKAGE/'files.sha256.json');assert len(files)==45
for f in files: assert sha(PACKAGE/f['path'])==f['sha256'],f
assert not RT.exists() and not STAGE.exists(),'do not rebuild a frozen/dispatched runtime'
RT.mkdir();STAGE.mkdir()
base=load(BASE/'runtime-manifest.json')
for f in base['files']:
    assert sha(BASE/f['path'])==f['sha256'];shutil.copyfile(BASE/f['path'],RT/f['path'])
jobs={}
for key,article in [('109','cv1729038'),('167','cv1754620')]:
    pp=PACKAGE/'packets'/str(article+'.json');packet=load(pp)
    for b in [packet['bindings']['candidate'],packet['bindings']['audit'],packet['bindings']['source'],*packet['bindings']['productionRaws'],*packet['bindings']['independentRaws']]: assert sha(b['path'])==b['sha256']
    audit=load(packet['bindings']['audit']['path'])
    jobs[key]={'canonical':packet['canonical'],'article':article,'packet':bind(pp),'parent':packet['bindings']['candidate'],'source':packet['bindings']['source'],'parentAudit':packet['bindings']['audit'],'auditor':bind(ROOT/audit['auditor']['path']),'repairFigureIds':packet['reviewTargets']['repairFigureIds'],'unknownImpactFigureIds':packet['reviewTargets']['unknownImpactFigureIds'],'candidatePath':str(ROOT/f'web-production/v1/candidates/79-bilibili-cn/{article}.coac269b25r1.json')}
    shutil.copyfile(pp,HERE/f'{key}-packet.json')
gif=next(x for x in load(PACKAGE/'packets/cv1754620.json')['images'] if x['format']=='GIF')
png=next(x for x in load(PACKAGE/'packets/cv1754620.json')['images'] if x['format']=='PNG')
with Image.open(gif['path']) as g,Image.open(png['path']) as p:
    assert g.n_frames==1 and g.size==p.size and g.convert('RGBA').tobytes()==p.convert('RGBA').tobytes()
save(HERE/'167-pixels.json',{'passed':True,'original':gif,'existingLosslessAlias':png,'frames':1,'pixelsIdentical':True,'imageWrites':0})
contract={'schema':'coac269-exact-109167-only/1','authorizationComment':'01a181af-e1d9-7e64-8dcf-1607be707075','packageManifest':bind(PACKAGE/'files.sha256.json'),'baseManifest':bind(BASE/'runtime-manifest.json'),'jobs':jobs,'maximumMakerPerChapter':1,'maximumIndependentPerChapter':1,'retry':0}
save(RT/'pair-contract.json',contract);shutil.copyfile(RT/'pair-contract.json',HERE/'contract.json')
shutil.copyfile(HERE/'pair.mjs',RT/'pair.mjs')
manifest={'schema':'coac269-frozen-exact-109167-runtime/1','files':[bind(p) for p in sorted(RT.iterdir()) if p.is_file()]}
save(RT/'runtime-manifest.json',manifest);save(HERE/'runtime.json',manifest)
save(HERE/'pins.json',{'runtime':bind(RT/'runtime-manifest.json'),'packageManifest':contract['packageManifest'],'runtimeFiles':len(manifest['files']),'packageFilesVerified':len(files),'modelCalls':0})
(HERE/'.gitattributes').write_text('* -text\n',encoding='utf-8')
print(json.dumps({'runtime':bind(RT/'runtime-manifest.json'),'files':len(manifest['files']),'packageFilesVerified':len(files),'modelCalls':0}))
