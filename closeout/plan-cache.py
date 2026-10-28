"""Prepare a recoverable cache-only plan; leave sessions/config/logs untouched."""
import json, os
from pathlib import Path
from datetime import datetime, timezone
here=Path(__file__).parent
base=Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805')
keep={'coac-244-3e7a6961844a','coac-250-667fda1dfd34'}
parts=json.loads((here/'runtime-parts.json').read_text(encoding='utf-8'))
plan=[]
for r in parts:
    home=Path(r['path']); owner=home.parent.name
    if owner in keep: continue
    assert home.parent.parent==base
    for name in ['cache','skills']:
        s=r['parts'].get(name)
        if not s or not s['bytes'] or s['errors'] or s['links']: continue
        p=home/name
        if not p.is_dir(): continue
        plan.append({'path':str(p),'ownerIssue':'COAC-'+owner.split('-')[1],
          'bytes':s['bytes'],'files':s['files'],
          'reason':'Completed textbook runtime: regenerable tool/plugin metadata cache or copied installed skills; unique sessions, databases, credentials and task history retained.',
          'git':'outside worktree; no Git changes removed','recoverable':'Windows Recycle Bin only'})
out={'at':datetime.now(timezone.utc).isoformat(),'requiresFormalReleaseAcceptance':True,'activeRuntimeDirectoriesRetained':sorted(keep),'entries':plan,'logicalBytes':sum(x['bytes'] for x in plan)}
(here/'cache-plan.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'directories':len(plan),'logicalBytes':out['logicalBytes']}))
