import copy,hashlib,json,subprocess,sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path('E:/AgentData/Coach/knowledge/processing');OUT=Path('.multica/delivery/coac244-inline-text-20261027');RUNTIME=ROOT/'audit/runtimes/coac244-inline-japanese-20261027'
STAGE=ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027';STAGE.mkdir(parents=True,exist_ok=True)
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,x): Path(p).parent.mkdir(parents=True,exist_ok=True);Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rows=read('short-stage-recovery/remaining-31-actionable-evidence.json')['rows']
jobs=[read('short-stage-recovery/text-155-347-exact-patches.json')['patches'][0]]
for key in ['162','182','234','157']:
    row=next(r for r in rows if r['chapterId'].split('-')[-2]==key)
    jobs.append({'chapterId':row['chapterId'],'parentPath':row['parent']['path'],'parentFileSha256':row['parent']['sha256'],
      'auditPath':row['auditPath'],'auditFileSha256':row['auditFileSha256'],'source':row['source']})
definitions={'155':[('b0008','大丈夫だ，問題ない！','replace','没关系，没问题！')],
 '162':[('b0004','食いのばし','gloss','吃牌延展'),('b0034','食いのばし','gloss','吃牌延展')],
 '234':[('b0003','ゴットー','gloss','五十'),('b0003','ワンツー','gloss','一二'),('b0003','ワンスリー','gloss','一三')]}
register=read(ROOT/'integration/coac250-unified-chapter-register-20261027b.json');preview=read(ROOT/'integration/accepted-preview-current.json')
for j in jobs:
    key=j['chapterId'].split('-')[-2];parent=read(ROOT/j['parentPath']);notes=read(ROOT/j['auditPath']);source=read(ROOT/j['source']['path'])
    assert sha(ROOT/j['parentPath'])==j['parentFileSha256'] and sha(ROOT/j['auditPath'])==j['auditFileSha256'] and sha(ROOT/j['source']['path'])==j['source']['sha256']
    row=next(r for r in register['rows'] if r['chapterId']==j['chapterId'])
    selected=[x for x in preview['selectedWeb'] if x.get('articleId')==source['articleId'] and x.get('sourceId',x.get('webSourceId'))==source['sourceId']]
    passed=[]
    for p in (ROOT/'audit/web/articles'/source['sourceId']).glob(source['articleId']+'.*.json'):
        a=read(p)
        if a.get('status','').startswith('passed'):
            path=Path(a['production']['path']);path=path if path.is_absolute() else ROOT/path
            if path.exists() and sha(path)==a['production']['sha256']: passed.append(str(p))
    claim=subprocess.run(['node',str(ROOT/'parallel/slots.mjs'),'check-chapter','--chapter',j['chapterId']],capture_output=True,encoding='utf-8')
    proof={'covered':row['covered'],'registerParentMatches':row['existingCandidate']['sha256']==j['parentFileSha256'],
      'selectedWeb':selected,'boundPassedAlternatives':passed,'claim':json.loads(claim.stdout),
      'registerSha256':sha(ROOT/'integration/coac250-unified-chapter-register-20261027b.json'),
      'previewSha256':sha(ROOT/'integration/accepted-preview-current.json')}
    j['exclusion']=proof;j['parentIssues']=notes['modelReview']['issues']
    reuse=parent['provenance'].get('reuseMap');assert reuse and sha(ROOT/reuse['path'])==reuse['sha256']
    original=ROOT/'web-production/v1/coac269-20261027/frozen-runtime/textbook-production-web.mjs'
    args=['node',str(original),'--source',j['source']['path'],'--revision-from',j['parentPath'],'--revision-notes',j['auditPath'],
      '--reuse',reuse['path'],'--variant','coac244inline20261027','--stop-file','STOP','--timeout-ms','900000']
    pre=subprocess.run(args+['--preflight-only'],capture_output=True,encoding='utf-8')
    j['originalEntry']={'exitCode':pre.returncode,'stderr':pre.stderr,'stdout':pre.stdout,'modelCalls':0}
    if key in definitions:
        edits=[{'sourceBlockId':source['sourceId']+':'+source['articleId']+':'+bid,'quotedText':q,'operation':op} for bid,q,op,_ in definitions[key]]
        plan={'schema':'coach-inline-japanese-revision/1','authorizationCommentId':'01a17e4c-8ec2-73f3-8c59-92bb3f8910db',
          'chapterId':j['chapterId'],'bindings':{'parentSha256':j['parentFileSha256'],'notesSha256':j['auditFileSha256'],'sourceSha256':j['source']['sha256']},'edits':edits}
        pp=STAGE/f'plan-{key}.json';write(pp,plan);write(OUT/f'plan-{key}.json',plan)
        j['planPath']=pp.relative_to(ROOT).as_posix();j['planSha256']=sha(pp)
        args[1]=str(RUNTIME/'textbook-production-web.mjs');args+=['--revision-inline-japanese',j['planPath']]
        pre=subprocess.run(args+['--preflight-only'],capture_output=True,encoding='utf-8');j['adaptedEntry']={'exitCode':pre.returncode,'stderr':pre.stderr,'stdout':pre.stdout,'modelCalls':0};j['args']=args
        probe=copy.deepcopy(parent);ids=list(dict.fromkeys(e['sourceBlockId'] for e in edits))
        probe['provenance']['revision']={'parentPath':j['parentPath'],'parentSha256':j['parentFileSha256'],'notesPath':j['auditPath'],'notesSha256':j['auditFileSha256'],
          'figureIds':[],'textBlockIds':ids,'inlineJapanese':{'path':j['planPath'],'sha256':sha(pp),'plan':plan}}
        for bid,q,op,meaning in definitions[key]:
            target=next(b for b in probe['body']['blocks'] if b['sourceBlockIds']==[source['sourceId']+':'+source['articleId']+':'+bid]);target['text']=target['text'].replace(q,meaning if op=='replace' else q+'（'+meaning+'）')
        # Probe lives solely in regression evidence, never in the candidate registry.
        write(OUT/f'probe-{key}-NOT-A-CANDIDATE.json',probe)
    write(OUT/f'preflight-{key}.json',j)
    print(json.dumps({'chapter':j['chapterId'],'covered':row['covered'],'passedAlternatives':len(passed),'claimed':proof['claim'].get('held'),
      'oldEntry':j['originalEntry']['exitCode'],'adapted':j.get('adaptedEntry',{}).get('exitCode')},ensure_ascii=False))
write(OUT/'jobs.json',jobs)
