"""Read-only packaging guard: actual Windows path margin and immutable evidence identities."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

def main():
    p=argparse.ArgumentParser();p.add_argument('--tree');p.add_argument('--checkout-root');a=p.parse_args()
    repo=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
    root=a.checkout_root or str(repo)
    git=lambda *args:subprocess.check_output(['git',*args],cwd=repo)
    tree={}
    for row in git('ls-tree','-r','-z',a.tree or 'HEAD').split(b'\0'):
        if row:
            meta,name=row.split(b'\t');tree[name.decode('utf-8')]=meta.decode().split()[2]
    paths=set(tree)
    if not a.tree:
        for prefix in ['_analysis','.multica/delivery']:
            for folder,dirs,files in os.walk(repo/prefix,followlinks=False):
                paths.update((Path(folder)/n).relative_to(repo).as_posix() for n in files)
    lengths=sorted([(len((root+'/'+n).encode('utf-16-le'))//2,n) for n in paths],reverse=True)
    assert lengths[0][0]<240,('checkout_path_length',lengths[:8])
    read=lambda n:git('cat-file','blob',tree[n]) if a.tree else (repo/n).read_bytes()
    sha=lambda b:hashlib.sha256(b).hexdigest()
    m=json.loads(read('_analysis/path250/manifest.json'))
    assert m['schema']=='coac250-packaging-path-map/1'
    assert len(m['renames'])==16
    for r in m['renames']:
        original=git('cat-file','blob',r['originalGitBlobId']);now=read(r['path'])
        assert now==original and sha(now)==r['sha256'] and len(now)==r['bytes'],r['path']
        assert r['oldPath'] not in tree
    aliases=m['assetAliases'];inverse={v:k for k,v in aliases.items()}
    def undo(v):
        if isinstance(v,dict):return {k:undo(x) for k,x in v.items()}
        if isinstance(v,list):return [undo(x) for x in v]
        return inverse.get(v,v) if isinstance(v,str) else v
    renamed={r['oldPath']:r['path'] for r in m['renames']}
    modified={e['path']:e for e in m['wrapperEdits']}
    for e in m['wrapperEdits']:
        old=git('cat-file','blob',e['originalGitBlobId']);now=read(e['path'])
        assert sha(old)==e['originalSha256'] and sha(now)==e['sha256']
        if e['kind']=='relative-image-reference-json':assert undo(json.loads(now))==json.loads(old)
        elif e['kind']=='relative-image-reference-html':
            for new,prior in inverse.items():
                for attr in ['src','href']:now=now.replace((attr+'="'+new+'"').encode(),(attr+'="'+prior+'"').encode())
            assert now==old
        elif e['kind']=='packaging-owner-note':assert now.startswith(old)
        elif e['kind']=='local-package-hash-index':
            before=json.loads(old);after=json.loads(now);assert len(before)==len(after)
            for b,c in zip(before,after):
                assert c['path']==renamed.get(b['path'],b['path'])
                assert sha(read(c['path']))==c['sha256'],c['path']
                if c['path'] not in modified:assert b['sha256']==c['sha256']
        else:raise AssertionError(e['kind'])
    refs=0
    for n in tree:
        if not n.startswith('_analysis/coac250-217-display/') or Path(n).name not in ['knowledge.html','textbook-bodies.json','textbook-corpus.json']:continue
        text=read(n).decode('utf-8')
        found=re.findall(r'assets/(?:full-[a-f0-9]{64}|a\d{2})\.png',text)
        for asset in found:
            path=(Path(n).parent/asset).as_posix();assert path in tree,(n,asset);refs+=1
    assert refs>0
    before={}
    for row in git('ls-tree','-r','-z',m['sourceCommit']).split(b'\0'):
        if row:meta,name=row.split(b'\t');before[name.decode()]=meta.decode().split()[2]
    allowed=set(renamed)|set(renamed.values())|set(modified)|{'_analysis/path250/manifest.json','_analysis/path250/verify.py','_analysis/path250/README.md','_analysis/path250/.gitattributes'}
    changed={n for n in set(before)|set(tree) if before.get(n)!=tree.get(n)}
    # Later commits may add unrelated files; this assertion is for the packaging commit itself.
    if a.tree:assert changed==allowed,changed^allowed
    print(json.dumps({'passed':True,'trackedFiles':len(tree),'pathsChecked':len(paths),'maximumFullPathUtf16Characters':lengths[0][0],
                      'longestPaths':lengths[:5],'renamedFilesByteIdentical':16,'wrapperEditsVerified':len(modified),
                      'localImageReferencesVerified':refs,'limitExclusive':240,'modelCalls':0}))

if __name__=='__main__':main()
