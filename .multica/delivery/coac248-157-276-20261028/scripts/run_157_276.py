"""Two explicitly authorized chapters, one existing-runner call per chapter."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
LOCAL = Path(__file__).resolve().parent.parent
NODE = 'E:/IDE/NodeJS/node.exe'
OWNER = 'COAC-248 Mika'
SLOTS = ROOT / 'parallel/slots.mjs'
JOBS = {'157-11': {'chapter': '79-cn-chapter-157-11', 'article': 'cv1751276', 'sha': '30679ab106ecb7f8df1d30aeea265878e0488c2aa3c09e04fed58629114549de', 'calls': ['e5848e7f-7ba8-4756-9ad0-4ef57c576987'], 'notes': 'audit/web/articles/79-bilibili-cn/cv1751276.30679ab106ecb7f8df1d30aeea265878e0488c2aa3c09e04fed58629114549de.retry-1792948857228-d69c915c.json', 'readings': ['Current GPT coordinator viewed all five bound x4 PNGs in this run. All targeted tiles show two columns of three bamboo: b0005 hand8, b0007 hand7, b0009 hand5, b0011 hand8 and b0013 hand8 are6s. Not inherited from prior controller claims. Parent audit has actual7 originalImageAssetIds and completed raw.'], 'variant': 'r1'}, '276-4': {'chapter': '79-cn-chapter-276-4', 'article': 'cv1793434', 'sha': '34cd6f77ec400bacdfaf0e51c20d700e0add78523583949392f7a056f148e3af', 'calls': ['a6c7d0e3-668c-4fce-b260-1dfcf167a68c', 'bb90022e-1fda-4eb3-8f71-779df2bdd169', '2375640c-3a8d-45e7-9601-4b810fe87e80'], 'notes': 'audit/web/articles/79-bilibili-cn/cv1793434.34cd6f77ec400bacdfaf0e51c20d700e0add78523583949392f7a056f148e3af.json', 'readings': ['Current GPT coordinator viewed bound x2 source: upper discard row fourth tile is inverted9m. Old2375640c raw has turn.failed, no completed turn, null output/message/usage; cannot recover. One new production retry explicitly authorized by current trigger.'], 'variant': 'r2'}}

def now(): return datetime.now(timezone.utc).isoformat()
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p, v): Path(p).write_text(json.dumps(v, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def slot(*a):
    r = subprocess.run([NODE, str(SLOTS), *a], capture_output=True, encoding='utf-8')
    if r.returncode: raise RuntimeError(r.stdout+r.stderr)
    return json.loads(r.stdout)
def gates():
    out = {p: (ROOT/p).exists() for p in ['STOP','web-production/v1/STOP','model-admission-stop.json']}
    assert not any(out.values()), out
    return out

def joint(j):
    """Fresh three-source canonical exclusion immediately before each dispatch."""
    pp=ROOT/'integration/accepted-preview-current.json'
    gp=ROOT/'integration/coac250-unified-chapter-register-20261027b.json'
    p,g=load(pp),load(gp)
    row=next(x for x in g['rows'] if x['chapterId']==j['chapter'])
    assert row['approvedWebCorrespondence']['articleId']==j['article'] and row['sourceId']=='79-cn'
    assert not row['covered'] and row['verdict']!='covered-effective', 'covered canonical chapter'
    assert row['existingCandidate']['sha256']==j['sha'] and row['existingCandidate']['sourceBoundCurrent']
    web=[x for x in p.get('selectedWeb',[]) if j['article']+'.' in x.get('candidatePath','')]
    pdf=[x for x in p.get('selectedPdf',{}).get('stages',[]) if j['chapter'] in x.get('receipt',{}).get('chapterIds',[])]
    assert not web and not pdf, 'selected canonical chapter'
    source_sha=load(ROOT/j['parent'])['source']['sourceSha256']
    passed=[]
    for f in (ROOT/'audit/web/articles/79-bilibili-cn').glob(j['article']+'.*.json'):
        a=load(f)
        if a.get('status','').startswith('passed') and a.get('source',{}).get('sourceSha256')==source_sha:
            cp=Path(a['production']['path'])
            if not cp.is_absolute(): cp=ROOT/cp
            if cp.is_file() and sha(cp)==a['production']['sha256']: passed.append({'path':str(f),'sha256':sha(f)})
    assert not passed, 'passed current-source replacement exists'
    existing=[f.name for f in (ROOT/'web-production/v1/candidates/79-bilibili-cn').glob(j['article']+'*.json')]
    assert sorted(existing)==sorted([j['article']+'.json',j['article']+'.display.json']), 'candidate already in progress'
    calls=[json.loads(l) for l in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if l.strip()]
    calls=[x for x in calls if x.get('articleId')==j['article']]
    assert [x['callId'] for x in calls]==j['calls'], 'new/in-flight attempt exists'
    return {'at':now(),'activePreview':p['output'],'pointerSha256':sha(pp),'registerSha256':sha(gp),
            'registerRow':row,'selectedWeb':web,'selectedPdf':pdf,'boundPassedReceipts':passed,'priorCallIds':j['calls'],'existingCandidates':existing}

def main(key):
    assert key != '276-4', 'Unlaunched image call paused by owner17:43 instruction; bind COAC-244 verified terra/max snapshot before resuming this explicitly authorized retry.'
    j=JOBS[key].copy()
    j['parent']=f"web-production/v1/candidates/79-bilibili-cn/{j['article']}.display.json"
    # Exact bound parent notes supplied in JOBS, including157 retry receipt.
    parent=load(ROOT/j['parent']); notes=load(ROOT/j['notes'])
    assert sha(ROOT/j['parent'])==j['sha'] and notes['production']['sha256']==j['sha']
    assert notes['status']=='needs-repair' and notes['modelReview']['completeArticleCompared']
    targets=[x['targetId'] for x in notes['modelReview']['issues'] if x['severity']=='error']
    assert len(targets)==(5 if key=='157-11' else 1)
    source=parent['source']['sourcePath']
    assert sha(ROOT/source)==parent['source']['sourceSha256']
    assert sha(ROOT/parent['provenance']['reuseMap']['path'])==parent['provenance']['reuseMap']['sha256']
    parent_raw=[]
    for a in parent['provenance']['attempts']:
        raw=ROOT/parent['provenance']['artifactRoot']/a['rawArtifactPath']
        assert sha(raw)==a['rawArtifactSha256']
        parent_raw.append({'callId':a['callId'],'path':str(raw),'sha256':sha(raw)})
    joint(j); gates(); slot('check-chapter','--chapter',j['chapter'],'--owner',OWNER)
    run=ROOT/f"web-production/v1/runs/coac248-web-{key}-{j['variant']}-20261028"
    assert not run.exists(), 'already attempted; inspect instead of retrying'
    template=ROOT/'web-production/v1/runs/coac248-web-227-246-20261027/frozen-runner'
    shutil.copytree(template,run/'frozen-runner')
    # Reuse the existing frozen classifier that already recognizes both exact
    # completed HTTPS fallback diagnostics; do not edit the old run or raw.
    if key in JOBS:
        helper=ROOT/'audit/runtimes/web-b8-transport-diag-20261027/textbook-production-cli.mjs'
        assert sha(helper)=='ff04388dc5bca14a290ec1e4e1868907063c5bc349d9c1a058f7bfec75e1486a'
        shutil.copyfile(helper,run/'frozen-runner/textbook-production-cli.mjs')
    assert (run/'frozen-runner/textbook-production-web-visual.py').is_file()
    cmd=[NODE,str(run/'frozen-runner/textbook-production-web.mjs'),'--source',source,'--revision-from',j['parent'],
         '--revision-notes',j['notes'],'--reuse',parent['provenance']['reuseMap']['path'],'--variant',j['variant'],'--stop-file','STOP','--timeout-ms','900000']
    r=subprocess.run(cmd+['--preflight-only'],capture_output=True,encoding='utf-8')
    write(run/'entry-preflight.json',{'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    assert r.returncode==0,r.stderr
    pf=json.loads(r.stdout); assert pf['modelCalls']==0 and pf['pendingFigureRuns']==len(targets)
    inspected=[]
    for f in parent['figures']:
        if f['figureId'] not in targets: continue
        for b in f['sourceAssetBindings']:
            assert sha(ROOT/b['path'])==b['sha256']
            scale=4 if key=='157-11' else 2
            z=f"web-production/v1/reading-views/28fabbcb7d66073c5c66f9829ffeb960108c8ae39abdc7638c500cc2c9e64528/{b['sha256']}.x{scale}.png"
            inspected.append({'figureId':f['figureId'],'sourceBinding':b,'inspectedZoom':z,'zoomSha256':sha(ROOT/z)})
    preflight={'schema':'coac248-bounded-figure-preflight/1','at':now(),'chapter':j['chapter'],'article':j['article'],
               'parentPath':j['parent'],'parentSha256':j['sha'],'parentAuditPath':j['notes'],'parentAuditSha256':sha(ROOT/j['notes']),
               'sourcePath':source,'sourceSha256':sha(ROOT/source),'targets':targets,'parentRaw':parent_raw,'sourceReadings':j['readings'],
               'inspectedAssets':inspected,'entryPreflight':pf,'modelCalls':0,
               'frozenFiles':[{'name':f.name,'sha256':sha(f)} for f in sorted((run/'frozen-runner').iterdir()) if f.is_file()]}
    write(run/'preflight.json',preflight); write(LOCAL/f'source-check-web{key}-20261028.json',preflight)
    slot('claim','--chapter',j['chapter'],'--candidate-sha',j['sha'],'--lane','A','--owner',OWNER)
    acquired=False
    try:
        acquisition=slot('acquire','--lane','A','--owner',OWNER,'--pid',str(os.getpid())); acquired=True
        latest=joint(j); stop=gates(); check=slot('check-chapter','--chapter',j['chapter'],'--owner',OWNER)
        write(run/'dispatch-started.json',{'at':now(),'jointExclusion':latest,'slot':acquisition,'stopFiles':stop,'chapter':check,'argv':cmd})
        with (run/'production.stdout.json').open('w',encoding='utf-8') as out,(run/'production.stderr.txt').open('w',encoding='utf-8') as err:
            r=subprocess.run(cmd,stdout=out,stderr=err)
        write(run/'dispatch-finished.json',{'at':now(),'exitCode':r.returncode})
        print((run/'production.stdout.json').read_text(encoding='utf-8'))
        if r.returncode: print((run/'production.stderr.txt').read_text(encoding='utf-8'),file=sys.stderr)
        return r.returncode
    finally:
        if acquired: write(run/'slot-released.json',{'at':now(),'release':slot('release','--slot',str(ROOT/'parallel/slots/maker-A.json'),'--owner',OWNER)})
        write(run/'chapter-released.json',slot('unclaim','--chapter',j['chapter'],'--owner',OWNER))

if __name__=='__main__': sys.exit(main(sys.argv[1]))
