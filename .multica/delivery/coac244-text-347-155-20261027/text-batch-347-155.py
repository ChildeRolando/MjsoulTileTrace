"""This authorized two-chapter batch only. Existing frozen entries; no retries."""
import copy
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
OUT = Path('.multica/delivery/coac244-text-347-155-20261027')
OUT.mkdir(parents=True, exist_ok=True)
NODE = 'E:/IDE/NodeJS/node.exe'
SLOTS = ROOT / 'parallel/slots.mjs'
OWNER = 'COAC-244 Mika text347155'
TEMPLATE = ROOT / 'web-production/v1/coac269-20261027/frozen-runtime'
AUDITOR = ROOT / 'audit/runtimes/web-b8-transport-diag-20261027'
JOBS = json.loads(Path('short-stage-recovery/text-155-347-exact-patches.json').read_text(encoding='utf-8'))['patches']
for job in JOBS:
    if job['chapterId']=='nemata-jp-chapter-347-1':
        job['registeredParentPath']=job['parentPath']
        job['registeredParentSha256']=job['parentFileSha256']
        job['latestTargetAuditPath']=job['auditPath']
        job['parentPath']='web-production/v1/candidates/modern-yabejp-ja/archive01-section008.display.json'
        job['parentFileSha256']='522447de46fb090753f5a89bf76a50a4cacd4bb729884f872ee764f3e0461911'
        job['auditPath']='audit/web/articles/modern-yabejp-ja/archive01-section008.522447de46fb090753f5a89bf76a50a4cacd4bb729884f872ee764f3e0461911.json'
        job['auditFileSha256']='f10c5c6f3cab0fb7d6d827123e3336febfe1ff9fcfc8c2d0ff39f506c390c8c1'

def now(): return datetime.now(timezone.utc).isoformat()
def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p, x):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(x, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def slot(*args):
    r = subprocess.run([NODE, str(SLOTS), *args], capture_output=True, encoding='utf-8')
    if r.returncode: raise RuntimeError(r.stdout+r.stderr)
    return json.loads(r.stdout)
def stopped():
    names = ['STOP', 'web-production/v1/STOP', 'model-admission-stop.json']
    state = {n:(ROOT/n).exists() for n in names}
    assert not any(state.values()), state
    return state

def joint(j, own_candidate=None):
    pp=ROOT/'integration/accepted-preview-current.json'
    rp=ROOT/'integration/coac250-unified-chapter-register-20261027b.json'
    p,g=load(pp),load(rp)
    row=next(r for r in g['rows'] if r['chapterId']==j['chapterId'])
    parent=load(ROOT/j['parentPath']); source=parent['source']
    mapping=row['approvedWebCorrespondence']
    assert mapping['articleId']==source['articleId'] and mapping['webSourceId']==source['sourceId'] and mapping['substitutionAllowed']
    assert not row['covered'] and row['existingCandidate']['sha256']==j.get('registeredParentSha256',j['parentFileSha256'])
    assert row['existingCandidate']['sourceBoundCurrent'] and sha(ROOT/j['parentPath'])==j['parentFileSha256']
    selected=[]
    for s in p.get('selectedWeb',[]):
        cp=Path(s['candidatePath'])
        if not cp.is_absolute(): cp=ROOT/cp
        c=load(cp)
        if c['source']['sourceId']==source['sourceId'] and c['source']['articleId']==source['articleId']: selected.append(s)
    assert not selected, 'canonical web source already selected'
    pdf=[s for s in p.get('selectedPdf',{}).get('stages',[]) if j['chapterId'] in s.get('receipt',{}).get('chapterIds',[])]
    assert not pdf, 'canonical PDF chapter already selected'
    passed=[]
    for f in (ROOT/'audit/web/articles'/source['sourceId']).glob(source['articleId']+'.*.json'):
        a=load(f)
        if a.get('status','').startswith('passed') and a.get('source',{}).get('sourceSha256')==source['sourceSha256']:
            cp=Path(a['production']['path'])
            if not cp.is_absolute(): cp=ROOT/cp
            if cp.is_file() and sha(cp)==a['production']['sha256'] and (own_candidate is None or cp.resolve()!=own_candidate.resolve()): passed.append(str(f))
    assert not passed, 'bound passed alternative exists'
    claim=slot('check-chapter','--chapter',j['chapterId'],'--owner',OWNER)
    entries=[f.name for f in (ROOT/'web-production/v1/candidates'/source['sourceId']).glob(source['articleId']+'.*.json')]
    ledger=[]
    for line in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines():
        if not line.strip(): continue
        c=json.loads(line)
        if c.get('sourceId')==source['sourceId'] and c.get('articleId')==source['articleId']: ledger.append(c['callId'])
    return {'at':now(),'chapterId':j['chapterId'],'sourceId':source['sourceId'],'articleId':source['articleId'],
            'registerSha256':sha(rp),'previewSha256':sha(pp),'registerRow':row,'selectedWeb':selected,
            'selectedPdf':pdf,'boundPassedAlternatives':passed,'claim':claim,'existingCandidateNames':sorted(entries),'priorCallIds':ledger}

def prepare(key):
    j=next(j for j in JOBS if key in j['chapterId'])
    parent=load(ROOT/j['parentPath']); notes=load(ROOT/j['auditPath'])
    assert sha(ROOT/j['auditPath'])==j['auditFileSha256'] and notes['production']['sha256']==j['parentFileSha256']
    assert sha(ROOT/j['source']['path'])==j['source']['sha256']
    assert notes['modelReview']['completeArticleCompared']
    assert [i['targetId'] for i in notes['modelReview']['issues'] if i['severity']!='source-note']==[j['targetId']]
    if j.get('registeredParentPath'):
        registered=load(ROOT/j['registeredParentPath'])
        assert sha(ROOT/j['registeredParentPath'])==j['registeredParentSha256']
        assert parent['source']==registered['source']
        assert len(parent['body']['blocks'])==len(registered['body']['blocks'])
        for old,current in zip(parent['body']['blocks'],registered['body']['blocks']):
            probe=copy.deepcopy(old)
            if j['targetId'] in old.get('sourceBlockIds',[]): probe['text']=current['text']
            assert probe==current, 'ancestor differs outside authorized target'
        clean=lambda f:{k:v for k,v in f.items() if k!='presentationAsset'}
        assert list(map(clean,parent['figures']))==list(map(clean,registered['figures']))
    initial=joint(j); stopped()
    key='347' if '347-1' in j['chapterId'] else '155'
    run=ROOT/f'web-production/v1/runs/coac244-text-{key}-20261027'
    if not run.exists(): shutil.copytree(TEMPLATE,run/'frozen-runner')
    assert not (run/'dispatch-started.json').exists(), 'already dispatched; no automatic retry'
    args=[NODE,str(run/'frozen-runner/textbook-production-web.mjs'),'--source',j['source']['path'],
          '--revision-from',j['parentPath'],'--revision-notes',j['auditPath'],
          '--variant','coac244text20261027','--stop-file','STOP','--timeout-ms','900000']
    dep=parent['provenance'].get('dictionary') or parent['provenance'].get('reuseMap')
    assert dep and sha(ROOT/dep['path'])==dep['sha256']
    args += ['--dictionary' if parent['source']['language']=='ja' else '--reuse', dep['path']]
    if key=='347':
        primary=[]
        for article,block_id in [('chapter03-section023','b0003'),('chapter01-section053','b0174')]:
            path=f'web-sources/v1/modern-yabejp-ja/articles/{article}/source.json'
            source=load(ROOT/path)
            block=next(b for b in source['blocks'] if b['id'].endswith(':'+block_id))
            primary.append({'sourcePath':path,'sourceFileSha256':sha(ROOT/path),'url':source['url'],
                            'blocks':[{'sourceBlockId':block['id'],'sourceText':block['text']}]})
        context=run/'term-source-context.json'
        write(context,{'schema':'coach-source-grounded-term-review/1','primaryEvidence':primary})
        write(OUT/'347-term-source-context.json',load(context))
        args+=['--revision-context',context.relative_to(ROOT).as_posix()]
    r=subprocess.run(args+['--preflight-only'],capture_output=True,encoding='utf-8')
    pf={'at':now(),'chapterId':j['chapterId'],'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,
        'modelCalls':0,'args':args,'jointExclusion':initial,'target':j,
        'frozenFiles':[{'name':p.name,'sha256':sha(p)} for p in sorted((run/'frozen-runner').iterdir()) if p.is_file()]}
    write(OUT/f'preflight-{key}.json',pf);write(run/'entry-preflight.json',pf)
    print(json.dumps({'chapter':j['chapterId'],'preflightExit':r.returncode,'modelCalls':0,'error':r.stderr[-1800:]}))
    return j,run,args,pf

def produce(key):
    j,run,args,pf=prepare(key)
    assert pf['exitCode']==0, 'zero-call preflight blocks production'
    assert load(run/'entry-preflight.json')['exitCode']==0
    source=load(ROOT/j['source']['path'])
    output=ROOT/'web-production/v1/candidates'/source['sourceId']/(source['articleId']+'.coac244text20261027.json')
    assert not output.exists()
    slot('claim','--chapter',j['chapterId'],'--candidate-sha',j['parentFileSha256'],'--lane','A','--owner',OWNER)
    acquired=False
    try:
        acquired_record=slot('acquire','--lane','A','--owner',OWNER,'--pid',str(os.getpid()));acquired=True
        exclusion=joint(j); assert exclusion['priorCallIds']==pf['jointExclusion']['priorCallIds']
        assert exclusion['existingCandidateNames']==pf['jointExclusion']['existingCandidateNames']
        stop=stopped()
        write(run/'dispatch-started.json',{'at':now(),'jointExclusion':exclusion,'slot':acquired_record,'stopFiles':stop,'args':args})
        with (run/'production.stdout.json').open('w',encoding='utf-8') as out,(run/'production.stderr.txt').open('w',encoding='utf-8') as err:
            result=subprocess.run(args,stdout=out,stderr=err)
        write(run/'dispatch-finished.json',{'at':now(),'exitCode':result.returncode})
        print(json.dumps({'chapter':j['chapterId'],'exitCode':result.returncode,'candidateProduced':output.exists(),'candidatePath':str(output) if output.exists() else None,'error':(run/'production.stderr.txt').read_text(encoding='utf-8')[-1800:]}))
    finally:
        if acquired: write(run/'slot-released.json',slot('release','--slot',str(ROOT/'parallel/slots/maker-A.json'),'--owner',OWNER))
        write(run/'chapter-released.json',slot('unclaim','--chapter',j['chapterId'],'--owner',OWNER))

if __name__=='__main__':
    if sys.argv[1]=='preflight': prepare(sys.argv[2])
    elif sys.argv[1]=='produce': produce(sys.argv[2])
