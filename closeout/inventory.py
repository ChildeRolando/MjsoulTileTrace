"""Read-only bounded inventory of this textbook construction site."""
import os, json, subprocess, time, stat
from pathlib import Path

OUT=Path(__file__).parent
BASE=Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805')
ISSUES={'244','246','247','248','249','250','269','270'}
def size(path):
    total=count=0; links=[]; errors=[]
    for root,dirs,files in os.walk(path,followlinks=False):
        for name in list(dirs):
            p=Path(root)/name
            if p.is_symlink() or (p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT):
                links.append(str(p)); dirs.remove(name)
        for name in files:
            try:
                p=Path(root)/name
                if not p.is_symlink(): total+=p.stat().st_size; count+=1
            except OSError as e: errors.append(str(e))
    return {'bytes':total,'files':count,'links':links,'errors':errors}
def git(path,*args):
    r=subprocess.run(['git','-C',str(path),*args],capture_output=True,text=True,encoding='utf-8',errors='replace')
    return {'exit':r.returncode,'out':r.stdout.strip(),'error':r.stderr.strip()}
rows=[]
for p in sorted(BASE.iterdir()):
    bits=p.name.split('-')
    if not p.is_dir() or len(bits)<3 or bits[0]!='coac' or bits[1] not in ISSUES: continue
    row={'path':str(p),'issue':'COAC-'+bits[1],'children':{}}
    for c in p.iterdir():
        if c.is_dir(): row['children'][c.name]=size(c)
    if (p/'worktree/.git').exists():
        row['git']={key:git(p/'worktree',*args) for key,args in {
            'head':['rev-parse','HEAD'],'branch':['branch','--show-current'],
            'status':['status','--porcelain=v1','--untracked-files=all'],
            'ignored':['ls-files','--others','--ignored','--exclude-standard'],
            'unpushed':['rev-list','HEAD','--not','--remotes']}.items()}
    rows.append(row)
    if len(rows)%50==0: print('inventoried',len(rows),flush=True)
(OUT/'runtime-inventory.json').write_text(json.dumps({'at':time.time(),'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'directories':len(rows),'bytes':sum(v['bytes'] for r in rows for v in r['children'].values()),'children':{n:sum(r['children'].get(n,{}).get('bytes',0) for r in rows) for n in sorted({n for r in rows for n in r['children']})}},indent=2))
