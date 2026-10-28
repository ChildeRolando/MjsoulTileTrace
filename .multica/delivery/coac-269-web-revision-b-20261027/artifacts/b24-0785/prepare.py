"""Bind244's recovered packet to one real maker and one external249 review."""
from pathlib import Path
import hashlib,json,shutil,subprocess
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
OUT=Path(__file__).resolve().parent
REC=ROOT/'integration/coac244-recovery-20261028'
OLD=ROOT/'audit/runtimes/coac269-283-1017-v2-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-0785-v1-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-283-0785-v1-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_bytes())
bind=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
assert not (STAGE/'dispatch-started.json').exists(),'dispatch already exists; no retry'
manifest=bind(REC/'files.sha256.json')
assert manifest['sha256']=='e72683343d3dae50758617467c2d1edfb25876a6ca886c66ef763a1325560c1d'
for f in load(manifest['path']):
    p=REC/f['path'];assert bind(p)['sha256']==f['sha256'] and p.stat().st_size==f['bytes']
cp=subprocess.run(['git','show','5c7092a9d4cad1e40f74a561ecb7b0177cd56197:.multica/delivery/coac244-recovery-20261028/files.sha256.json'],capture_output=True)
assert cp.returncode==0 and sha(cp.stdout)==manifest['sha256'],'recovery manifest must equal pushed244 commit'
packet_path=REC/'complex-original/b0785-packet.json';packet=load(packet_path)
assert bind(packet_path)['sha256']=='fc7da7408411b6870f378e0407842048cd5905cbf0ecd6da902357acf1b001c3'
returned=load(ROOT/'integration/coac249-283-1017-r2-reviewed-20261028.json')
assert returned['candidate']['sha256']==packet['current']['sha256'] and returned['results'][0]['status']=='passed'
for folder in [OLD,ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028']:
    for f in load(folder/'runtime-manifest.json')['files']:
        p=Path(f['path']);p=p if p.is_absolute() else folder/p;assert bind(p)['sha256']==f['sha256']
assert (OLD/'textbook-production-cli.mjs').read_bytes()==(ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028/textbook-production-cli.mjs').read_bytes()
parent=load(packet['current']['path']);donor=load(packet['donor']['path'])
donor_audit=ROOT/'audit/web/articles/modern-yabejp-ja'/('chapter06-exercise003.'+packet['donor']['sha256']+'.json')
assert bind(donor_audit)['sha256']=='21d909b832c28e62a76f453863ed24d8fc8738adbb54b36bfd8117b9395d5aea'
contract={'schema':'coac269-exact-0785-seat/1','authorizationComment':'01a18193-7e18-7193-8ca8-89c80dae4edd',
 'canonical':'nemata-jp-chapter-283-1','targetId':'modern-yabejp-ja:chapter06-exercise003:b0785:figure',
 'source':packet['source'],'parent':packet['current'],'parentAudit':returned['audit'],'donor':packet['donor'],'donorAudit':bind(donor_audit),
 'donorMaker':packet['maker'],'donorReview':packet['independent'],'recoveryManifest':manifest,'packet':bind(packet_path),
 'parentRuntime':bind(OLD/'runtime-manifest.json'),'b1017Pass':bind(ROOT/'integration/coac249-283-1017-r2-reviewed-20261028.json'),
 'expected':packet['expectedFigureNotProduced'],'images':packet['originalImagesAndDerivedViews'],
 'figureFields':['kind','transcription','unknowns','caption','sourceNotes'],
 'parentOriginalIssueGroup':load(OLD/'exact-contract.json')['issueGroup'],
 'maximumProductionCalls':1,'maximumIndependentCalls':1,'maximumTotalCalls':2,'retry':0,
 'assembly':'All parent fields inherit unchanged except the exact target figure fields emitted by the real maker and its actual provenance. Reviewed donor hand/hidden-area/unknown fields are explicitly supplied as fixed output, with only its two independently identified east/west characters changed. No other donor figure or body block is imported.',
 'priorAcceptedEvidence':[bind(ROOT/('integration/'+name)) for name in ['coac249-283-1017-r2-scope-inheritance-20261028.json','coac249-283-10171181-scope-inheritance-20261028.json','coac249-283-396962-scope-inheritance-20261028.json','coac249-b0168-reviewed-target-20261028.json','coac249-283-six-table-supplement-20261028.json','coac250-283-effective-issues-with-q8-20261028.json']]}
for b in [contract['source'],contract['parent'],contract['parentAudit'],contract['donor'],contract['donorAudit'],contract['b1017Pass'],*contract['images'],*contract['priorAcceptedEvidence']]:assert bind(b['path'])['sha256']==b['sha256']
RUN.mkdir(parents=True,exist_ok=True);STAGE.mkdir(parents=True,exist_ok=True)
for p in OLD.iterdir():
    if p.is_file() and p.name!='runtime-manifest.json':shutil.copyfile(p,RUN/p.name)
shutil.copyfile(OUT/'b0785.mjs',RUN/'b0785.mjs')
(RUN/'0785-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
m={'schema':'coac269-0785-exact-runtime/1','parentRuntime':contract['parentRuntime'],'authorizationComment':contract['authorizationComment'],'files':[bind(p) for p in sorted(RUN.iterdir()) if p.is_file() and p.name!='runtime-manifest.json']}
(RUN/'runtime-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
for name,path in [('contract.json',RUN/'0785-contract.json'),('runtime.json',RUN/'runtime-manifest.json'),('244-manifest.json',REC/'files.sha256.json'),('packet.json',packet_path),('1017-passed.json',ROOT/'integration/coac249-283-1017-r2-reviewed-20261028.json')]:shutil.copyfile(path,OUT/name)
print(json.dumps({'runtime':bind(RUN/'runtime-manifest.json'),'files':len(m['files']),'recoveredFiles':len(load(manifest['path'])),'modelCalls':0}))
