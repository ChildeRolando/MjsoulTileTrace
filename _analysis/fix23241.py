from pathlib import Path
import subprocess, json, hashlib
workspace=Path.cwd().resolve()
old=workspace/'_analysis/b232'
new=workspace/'_analysis/j23241'
assert not new.exists()
new.mkdir()
base='c33f52cfe2bad5e99259370fa0ab764df9e62908'
modified=subprocess.check_output(['git','diff','--name-only',base,'--','_analysis/b232']).decode().splitlines()
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','_analysis/b232']).decode().splitlines()
receipt={'reason':'New232v41 packaging directory collided with historical tracked b232 evidence; move only this run changes and restore prior immutable bytes.','base':base,'newDirectory':'_analysis/j23241','restored':[],'moved':[],'newModelCalls':0}
for name in modified+untracked:
    source=(workspace/name).resolve()
    assert source.parent==old
    data=source.read_bytes()
    if source.suffix=='.mjs':data=data.decode('utf-8').replace('_analysis/b232','_analysis/j23241').encode('utf-8')
    if source.name=='merge-baseline.json':
        prior=json.loads(data)
        data=(json.dumps({k:prior[k] for k in ['output','corpusId']},indent=2)+'\n').encode()
    (new/source.name).write_bytes(data)
    receipt['moved'].append({'from':name,'to':str(Path('_analysis/j23241')/source.name),'sha256':hashlib.sha256(data).hexdigest()})
for name in modified:
    data=subprocess.check_output(['git','show',base+':'+name])
    target=(workspace/name).resolve()
    assert target.parent==old
    target.write_bytes(data)
    assert target.read_bytes()==data
    receipt['restored'].append({'path':name,'sha256':hashlib.sha256(data).hexdigest()})
for name in untracked:
    target=(workspace/name).resolve()
    assert target.parent==old
    target.unlink()
assert not subprocess.check_output(['git','diff','--name-only',base,'--','_analysis/b232']).strip()
(new/'history-preservation.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'newDirectory':str(new),'oldFilesRestored':len(modified),'newArtifactsMoved':len(untracked),'oldDirectoryDiffEmpty':True}))
