import pathlib,json,hashlib,shutil
O=pathlib.Path(__file__).resolve().parent
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
old=P/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((old/'runtime-manifest.json').read_text(encoding='utf-8-sig'))
assert sha(old/'runtime-manifest.json')=='a5cff9c38466a76030b5269ac4367f07695fa3ddb43fb4cbf374069fa852125c'
for d in m['files']:assert sha(old/d['path'])==d['sha256']
dest=O/'runtime';shutil.copytree(old,dest)
for n in ['runtime-manifest.json','verification-dependencies.json']:(dest/n).unlink()
evidence=['coac249-reviewed183-stat-context-v3-20261028.json','coac249-236-fidelity-diagnosis-20261028.json','coac249-222-targeted-contract-gap-20261028.json']
for n in evidence:shutil.copy2(P/'integration'/n,O/n)
(O/'.gitattributes').write_text('* -text\n',encoding='utf-8')
(O/'old-runtime-binding.json').write_text(json.dumps({'path':str(old),'manifestSha256':sha(old/'runtime-manifest.json'),'files':m['files']},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'oldFilesVerified':len(m['files']),'newRuntime':str(dest)}))
