from pathlib import Path
import json,hashlib,shutil
O=Path(__file__).resolve().parent
P=Path('E:/AgentData/Coach/knowledge/processing')
R=O/'runtime';name='coac244-256-exact-8s-v1-20261028'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
dump=lambda p,x:p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
base=P/'audit/runtimes/coac244-vision-production-schema-v2-20261028';bm=load(base/'runtime-manifest.json')
for f in bm['files']:assert sha((base/f['path']).read_bytes())==f['sha256']
files=[{'path':p.relative_to(R).as_posix(),'sha256':sha(p.read_bytes())}for p in sorted(R.rglob('*'))if p.is_file() and p.name!='runtime-manifest.json']
assert len(files)==30
manifest={'schema':'coac244-exact256-vision-runtime/1','authorization':'01a17f8d-38c9-7cf9-ad2c-01bddd851470','runtime':str(P/'audit/runtimes'/name),'imageRequest':bm['imageRequest'],'textRequest':bm['textRequest'],'files':files,'parentManifest':{'path':str(base/'runtime-manifest.json'),'sha256':sha((base/'runtime-manifest.json').read_bytes())},'changes':['one exact production admission predicate; parent/source/audit digests and only8s/unknown0 whitelist','typed ordered42-block targeted unknown-impact request/validator; independent allowance remains separate and does not grant chapter acceptance'],'entrypoints':{'maker':'run256.mjs --execute-authorized','zeroModelMakerPreflight':'run256.mjs --preflight-only','reviewPrepare':'textbook-256-impact.mjs:prepare256ImpactReview','reviewVerify':'textbook-256-impact.mjs:verify256ReviewExecution'},'newModelCalls':0,'remoteModelEvidence':'No new call: requested configuration only, remote execution not claimed.'}
dump(R/'runtime-manifest.json',manifest)
release={'runtimeManifestSha256':sha((R/'runtime-manifest.json').read_bytes()),'runtime':manifest['runtime'],'runtimeFiles':30,'newModelCalls':0}
dump(O/'release.json',release)
dest=P/'audit/runtimes'/name
assert not dest.exists(),'Do not overwrite a frozen runtime'
shutil.copytree(R,dest)
shared=P/'integration/coac244-256-exact-gate-20261028'
assert not shared.exists()
shutil.copytree(O,shared)
print(json.dumps({'runtime':str(dest),'manifest':release['runtimeManifestSha256'],'shared':str(shared),'calls':0}))
