"""Prepare an idle250 packaging-only commit through a private index. No checkout/ref update."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
BASE='f1435b192a5ce02935b5145b6cb19f9b2a5ed2b3'
BRANCH='agent/mika/coac-250'
STAGE=Path('E:/AgentWorkspaces/Coach/coac269-pfix250-4952d30c33cd-v4')
PREFIX='_analysis/path250/'
ROOT=str(Path.cwd()).replace('coac-269-4952d30c33cd','coac-250-d4f39be097e0')
sha=lambda b:hashlib.sha256(b).hexdigest()
git=lambda *a,data=None:subprocess.check_output(['git',*a],input=data)
assert git('branch','--show-current').decode().strip()=='agent/ticket/coac-269'
assert git('rev-parse',BRANCH).decode().strip()==BASE
assert not STAGE.exists() and not (HERE/'commit250.json').exists()
STAGE.mkdir()
tree={}
for row in git('ls-tree','-r','-z',BASE).split(b'\0'):
    if row:
        meta,name=row.split(b'\t');mode,kind,oid=meta.decode().split();assert kind=='blob'
        tree[name.decode('utf-8')]=(mode,oid)
blob=lambda path:git('cat-file','blob',tree[path][1])
images=sorted({Path(n).name for n in tree if n.startswith('_analysis/coac250-217-display/') and '/assets/full-' in n})
assert len(images)==4
assets={f'assets/{name}':f'assets/a{i+1:02d}.png' for i,name in enumerate(images)}
renames={}
for n in tree:
    if n.startswith('_analysis/coac250-217-display/') and '/assets/full-' in n:
        renames[n]=n.rsplit('/',1)[0]+'/'+Path(assets['assets/'+Path(n).name]).name
    elif n.startswith('_analysis/coac250-217/upstream/evidence/') and 'Audit/' in n and Path(n).name.startswith('page-0217.'):
        renames[n]=n.rsplit('/',1)[0]+'/audit.json'
assert len(renames)==16 and len(set(renames.values()))==16
assert not set(renames.values())&set(tree)
changes={}
entries=[]
for old,new in renames.items():
    data=blob(old);changes[new]=data
    entries.append({'oldPath':old,'path':new,'originalGitBlobId':tree[old][1],'sha256':sha(data),'bytes':len(data)})

def mapped(x):
    if isinstance(x,dict):return {k:mapped(v) for k,v in x.items()}
    if isinstance(x,list):return [mapped(v) for v in x]
    return assets.get(x,x) if isinstance(x,str) else x

edits=[]
def change(path,data,kind):
    before=blob(path)
    if before!=data:
        changes[path]=data;edits.append({'path':path,'kind':kind,'originalGitBlobId':tree[path][1],'originalSha256':sha(before),'sha256':sha(data)})

for path in tree:
    if not path.startswith('_analysis/coac250-217-display/'):continue
    if Path(path).name not in ['knowledge.html','textbook-bodies.json','textbook-corpus.json','pdf-stage-receipt.json','stage-receipt.json','stage-receipt.final.json']:continue
    before=blob(path)
    if path.endswith('.json'):
        old=json.loads(before);new=mapped(old)
        if old!=new:change(path,(json.dumps(new,ensure_ascii=False,indent=2)+'\n').encode(),'relative-image-reference-json')
    else:
        new=before
        for old,target in assets.items():
            for attr in ['src','href']:new=new.replace((attr+'="'+old+'"').encode(),(attr+'="'+target+'"').encode())
        change(path,new,'relative-image-reference-html')
readme='_analysis/coac250-217-display/README.md'
note='''
Packaging repair (COAC-269): local assets use a01.png–a04.png; all12 copies retain original image bytes.
The4 archived upstream audit copies use audit.json without changing their bytes. See
`../path250/manifest.json` for every original repository path, Git blob and full SHA256.
Only local relative image references and this package's archive index changed. Absolute data-root
paths, original source/audit receipts and body hashes remain historical provenance; the alias map
restores the original compiled objects exactly. These wrappers are not new candidates or receipts.
Run `python _analysis/path250/verify.py` at repository root before packaging/committing future
delivery/_analysis evidence. It checks every tracked path plus new files in both packaging trees,
using the actual managed Windows root and a strict full-path limit below240 UTF16 characters.
No v29 rebuild, model call, source/raw/candidate/active change or global configuration change.
'''
change(readme,blob(readme)+note.encode(),'packaging-owner-note')
archive='_analysis/coac250-217-display/archive-shas.json'
index=json.loads(blob(archive));assert not any(x['path']==archive for x in index)
for item in index:
    old=item['path'];item['path']=renames.get(old,old)
    if item['path'] in changes:item['sha256']=sha(changes[item['path']])
change(archive,(json.dumps(index,ensure_ascii=False,indent=2)+'\n').encode(),'local-package-hash-index')
newpaths=(set(tree)-set(renames))|set(changes)|{PREFIX+'manifest.json',PREFIX+'verify.py',PREFIX+'README.md',PREFIX+'.gitattributes'}
lengths=sorted([(len((ROOT+'/'+n).encode('utf-16-le'))//2,n) for n in newpaths],reverse=True)
oldlengths=sorted([(len((ROOT+'/'+n).encode('utf-16-le'))//2,n) for n in tree],reverse=True)
assert lengths[0][0]<240,lengths[:8]
manifest={'schema':'coac250-packaging-path-map/1','sourceCommit':BASE,'branch':BRANCH,'failedRun':'01a17f90-dd76-7202-b0b2-d4f39be097e0',
          'checkoutRoot':ROOT,'limitExclusiveUtf16':240,'oldTrackedFiles':len(tree),'newTrackedFiles':len(newpaths),
          'oldMaximumUtf16':oldlengths[0][0],'maximumUtf16':lengths[0][0],'renames':entries,'wrapperEdits':edits,
          'assetAliases':assets,'modelCalls':0,'dataRootTouched':False,'v29Rebuilt':False}
changes[PREFIX+'manifest.json']=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
changes[PREFIX+'verify.py']=(HERE/'verify-package.py').read_bytes()
changes[PREFIX+'.gitattributes']=b'* -text whitespace=cr-at-eol\n'
changes[PREFIX+'README.md']=b'''Packaging-only fix for250's never-started checkout failure.
All16 moved files retain their Git blob IDs/bytes (12 image copies,4 audit copies).
manifest.json maps old paths/full SHA to short aliases and records local presentation wrapper edits.
Raw/candidates/source/audit provenance, production scripts and live v29 data were not modified.
Use: python _analysis/path250/verify.py [--checkout-root <future-managed-worktree-root>].
The guard covers the entire tracked tree and all new delivery/_analysis files, limit <240 UTF16.
It also checks original/new bytes, inverse image aliases, archive index and every local image URL.
Original reference bytes remain recoverable by manifest.sourceCommit and originalGitBlobId.
'''
env=dict(os.environ,GIT_INDEX_FILE=str(STAGE/'private-index'))
private=lambda *a,data=None:subprocess.check_output(['git',*a],input=data,env=env)
private('read-tree',BASE)
for old in renames:private('update-index','--force-remove','--',old)
for path,data in changes.items():
    oid=git('hash-object','-w','--stdin',data=data).decode().strip()
    private('update-index','--add','--cacheinfo',tree.get(path,('100644',None))[0],oid,path)
newtree=private('write-tree').decode().strip()
actual=set(git('diff-tree','--no-commit-id','--name-only','-r',BASE,newtree).decode().splitlines())
assert actual==set(renames)|set(changes)
assert all(n.startswith(('_analysis/coac250-217/','_analysis/coac250-217-display/',PREFIX)) for n in actual)
commit=git('commit-tree',newtree,'-p',BASE,data=b'[COAC-250] Shorten archived packaging paths and verify full Windows checkout bounds\n').decode().strip()
result={'parent':BASE,'commit':commit,'tree':newtree,'branch':BRANCH,'changedPaths':sorted(actual),'renamedFiles':len(renames),
        'wrapperEdits':len(edits),'manifestSha256':sha(changes[PREFIX+'manifest.json']),'maximumUtf16':lengths[0][0],
        'HEADUnchanged':git('rev-parse','HEAD').decode().strip(),'modelCalls':0,'stage':str(STAGE)}
(HERE/'manifest250.json').write_bytes(changes[PREFIX+'manifest.json'])
(HERE/'commit250.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:result[k] for k in ['parent','commit','renamedFiles','wrapperEdits','maximumUtf16','HEADUnchanged','modelCalls']}))
