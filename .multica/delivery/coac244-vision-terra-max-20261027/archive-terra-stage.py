from pathlib import Path
import json,hashlib,shutil
ROOT=Path('E:/AgentData/Coach/knowledge/processing');runtime=ROOT/'audit/runtimes/coac244-vision-terra-max-v1-20261027';out=Path('.multica/delivery/coac244-vision-terra-max-20261027');out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((runtime/'runtime-manifest.json').read_text(encoding='utf-8'))
for f in manifest['files']:
 assert sha(runtime/f['path'])==f['sha256'],f['path']
for p in runtime.iterdir():
 if p.is_file():
  target=out/'runtime'/p.name;target.parent.mkdir(exist_ok=True);shutil.copyfile(p,target)
for n in ['build-terra-snapshot.py','finish-terra-snapshot.py','freeze-terra.mjs','verify-terra-request.mjs','terra-request-test.json','sync-terra-owners.py','terra-first-157-instruction.md']:
 shutil.copyfile(n,out/n)
shutil.copyfile(ROOT/'audit/vision-runtime-current.json',out/'vision-runtime-current.json')
sync=json.loads(Path('terra-owner-sync.json').read_text(encoding='utf-8'))
(out/'owner-sync-receipts.json').write_text(json.dumps([{'issueId':i['issueId'],'updated':i.get('updated'),'alreadyPresent':i.get('alreadyPresent'),'revision':i.get('response',{}).get('revision')} for i in sync],indent=2)+'\n',encoding='utf-8')
# Freeze only capability metadata; never copy credentials/config or the model instruction templates.
ticket=json.loads((ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/ticket-intake.json').read_text(encoding='utf-8'))
oldProof={'namespace':'audit/runtimes/coac244-inline-japanese-v2-20261027','unchanged':True,'files':[]}
for record in ticket['runtime']['files']:
 p=Path(ticket['runtime']['runtime'])/record['name']
 assert sha(p)==record['sha256'],p.name
 oldProof['files'].append({'path':p.name,'sha256':sha(p)})
(out/'unchanged-text-snapshot.json').write_text(json.dumps(oldProof,indent=2)+'\n',encoding='utf-8')
(out/'.gitattributes').write_text('* -text\n',encoding='utf-8')
print(json.dumps({'archived':str(out),'manifestSha256':sha(runtime/'runtime-manifest.json'),'verifiedRuntimeFiles':len(manifest['files']),'verifiedOldTextFiles':len(oldProof['files'])}))
