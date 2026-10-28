"""Record pre-call test iterations; impossible to reseal after either dispatch."""
import hashlib,json,shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=Path('E:/AgentData/Coach/knowledge/processing')
RT=ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028'
STAGE=ROOT/'web-production/v1/runs/coac269-109167-exact-v1-20261028'
assert not list(STAGE.glob('*dispatch*')) and not list(STAGE.glob('*call.json'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
manifest=json.loads((RT/'runtime-manifest.json').read_bytes())
for x in manifest['files']: assert sha(x['path'])==x['sha256']
n=len(list(HERE.glob('precall-manifest-*.json')))+1
shutil.copyfile(RT/'runtime-manifest.json',HERE/f'precall-manifest-{n}.json')
shutil.copyfile(HERE/'pair.mjs',RT/'pair.mjs')
for x in manifest['files']:
    x['sha256']=sha(x['path']);x['bytes']=Path(x['path']).stat().st_size
for p in [RT/'runtime-manifest.json',HERE/'runtime.json']:p.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=HERE/'pins.json';pins=json.loads(p.read_bytes());pins['runtime']['sha256']=sha(RT/'runtime-manifest.json');pins['runtime']['bytes']=(RT/'runtime-manifest.json').stat().st_size;p.write_text(json.dumps(pins,indent=2)+'\n',encoding='utf-8');print(json.dumps({'preCallOnly':True,'priorManifestArchived':n,'runtime':pins['runtime']}))
