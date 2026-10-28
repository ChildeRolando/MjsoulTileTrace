"""Read-only evidence preparation; no model/CLI invocation and no production writes."""
import copy, hashlib, json, shutil
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

P = Path('E:/AgentData/Coach/knowledge/processing')
HERE = Path(__file__).resolve().parent
BASE = HERE.parent/'coac244-recovery-20261028/remaining-canonical-register.json'
CANONICALS = ['79-cn-chapter-109-4','79-cn-chapter-167-4','nemata-jp-chapter-193-1','nemata-jp-chapter-213-1']
READY = CANONICALS[:2]
def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(b): return hashlib.sha256(b).hexdigest()
def digest(x): return sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode())
def write(name,x):
    f=HERE/name; f.parent.mkdir(parents=True,exist_ok=True)
    f.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def ref(p,expected=None):
    p=Path(p); b=p.read_bytes(); h=sha(b)
    assert expected is None or h==expected,(str(p),h,expected)
    return {'path':str(p),'sha256':h,'bytes':len(b)}
def capture(label,p,expected=None):
    r=ref(p,expected); dst=HERE/'evidence'/label;dst.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,dst);r['copy']='evidence/'+label;return r

def main():
    master=load(P/'integration/coac250-unified-chapter-register-20261027b.json')
    pointer=load(P/'integration/accepted-preview-current.json')
    rows=load(BASE)['rows']; summaries=[]; allprotected={}
    ledger=[json.loads(x) for x in (P/'web-production/v1/calls.jsonl').read_text(encoding='utf-8-sig').splitlines() if x.strip()]
    for canonical in CANONICALS:
        row=next(r for r in rows if r['canonical']==canonical)
        cr,ar=row['materials'][:2]; candidate=load(cr['path']); audit=load(ar['path'])
        article=candidate['source']['articleId']; sourcepath=P/candidate['source']['sourcePath'];source=load(sourcepath)
        current=next(r for r in master['rows'] if r['chapterId']==canonical)
        assert current['covered'] is False
        assert current['existingCandidate']['sha256']==cr['sha256']
        assert current['existingCandidate']['sourceBoundCurrent'] is True
        bindings={'candidate':capture(article+'-parent.json',cr['path'],cr['sha256']),
                  'audit':capture(article+'-audit.json',ar['path'],ar['sha256']),
                  'source':capture(article+'-source.json',sourcepath,candidate['source']['sourceSha256'])}
        production=[]
        for a in candidate['provenance']['attempts']:
            production.append(capture(a['callId']+'-producer.json',P/candidate['provenance']['artifactRoot']/a['rawArtifactPath'],a['rawArtifactSha256']))
        reviews=[]
        for call in audit['calls']:
            rr=capture(call['callId']+'-audit-raw.json',P/'audit/calls'/f"{call['callId']}.json")
            raw=load(rr['path'])
            assert raw.get('parsedOutput',raw.get('output'))==audit['modelReview']
            assert json.loads(raw['rawLastMessage'])==audit['modelReview']
            rr.update(callId=call['callId'],model=call['model'],reasoningEffort=call['reasoningEffort'])
            reviews.append(rr)
        bindings.update(productionRaws=production,independentRaws=reviews)
        same_sha_audits=[]
        for af in Path(ar['path']).parent.glob(article+'.'+cr['sha256']+'*.json'):
            aa=load(af)
            same_sha_audits.append({'artifact':ref(af),'status':aa.get('status'),'issues':(aa.get('modelReview') or {}).get('issues'),
                                    'callIds':[cc.get('callId') for cc in aa.get('calls',[])]})
        issues=audit['modelReview']['issues']; selected=canonical in READY
        targetfigs=([f for f in candidate['figures'] if any(b in f['figureId'] for b in ['b0004:','b0006:','b0012:'])]
                    if canonical==READY[0] else [f for f in candidate['figures'] if f['figureId'].endswith(('b0005:figure' if canonical==READY[1] else 'b0080:figure' if '193' in canonical else 'b0032:figure'))])
        images=[]
        for figure in targetfigs:
            for a in figure['sourceAssetBindings']:
                rr=capture(Path(a['path']).name,P/a['path'],a['sha256'])
                with Image.open(rr['path']) as im:rr.update(width=im.width,height=im.height,format=im.format,frames=getattr(im,'n_frames',1))
                rr.update(figureId=figure['figureId'],assetId=a['assetId'],role='original-source-no-invented-detail')
                if not any(x['sha256']==rr['sha256'] for x in images):images.append(rr)
            # Existing producer PNG is only an image-format alias, never a new source version.
            if any(x['format']=='GIF' and x['figureId']==figure['figureId'] for x in images):
                pa=figure['presentationAsset'];rr=capture(Path(pa['path']).name,P/pa['path'],pa['sha256'])
                with Image.open(P/figure['sourceAssetBindings'][0]['path']) as src,Image.open(rr['path']) as out:
                    assert src.n_frames==1 and src.size==out.size
                    assert src.convert('RGBA').tobytes()==out.convert('RGBA').tobytes()
                    rr.update(width=out.width,height=out.height,format='PNG',frames=1,pixelAliasOf=figure['sourceAssetBindings'][0]['sha256'])
                rr.update(figureId=figure['figureId'],role='existing-lossless-single-frame-presentation-alias');images.append(rr)
        changes=[]
        if selected:
            for f in targetfigs:
                before=f['transcription'];after=before
                if canonical==READY[0] and f['figureId'].endswith('b0004:figure'):
                    after=before.replace('手牌从左至右：6m 6m 6m','手牌从左至右：5m 6m 6m',1)
                if canonical==READY[0] and f['figureId'].endswith('b0006:figure'):
                    after=before.replace('手牌从左至右：6m 6m','手牌从左至右：5m 6m',1)
                if canonical==READY[1]:
                    replacements=[('左侧北家牌河，牌面顺时针旋转90度：','左侧北家牌河，除立直宣言牌7p外，牌面顺时针旋转90度：'),
                                  ('第3行：7p 3m 9s。','第3行：7p（相对于北家其他舍牌横置，为立直宣言牌）3m 9s。'),
                                  ('未见摸入、切牌箭头或额外标注的横置牌。','未见摸入、切牌箭头；北家7p为横置的立直宣言牌。')]
                    for old,new in replacements:assert after.count(old)==1;after=after.replace(old,new,1)
                if after!=before:
                    i=candidate['figures'].index(f)
                    changes.append({'pointer':f'/figures/{i}/transcription','figureId':f['figureId'],'sourceBlockId':f['sourceBlockIds'][0],
                                    'before':before,'expectedAfterOnlyIfImageConfirms':after,'beforeSha256':sha(before.encode()),
                                    'expectedAfterSha256':sha(after.encode())})
            assert len(changes)==(2 if canonical==READY[0] else 1)
        ordered=[]
        for i,b in enumerate(candidate['body']['blocks']):
            ids=b['sourceBlockIds']; ordered.append({'position':i,'source':[s for s in source['blocks'] if s['id'] in ids],
                                                     'candidate':b,'figure':next((f for f in candidate['figures'] if f['figureId']==b.get('figureId')),None)})
        textTargets=[i['targetId'] for i in issues if i['severity']=='error' and not i['targetId'].endswith(':figure')]
        packet={'schema':'coac244-next-pair-evidence-proposal/1','canonical':canonical,'article':article,'selectedReadyProposal':selected,
                'status':'ready-for-root-budget-approval' if selected else 'held-for-later-mixed-text-and-figure-scope',
                'authorizationForNewCalls':False,'newCallsThisStage':0,'bindings':bindings,'masterRow':current,
                'productionLedger':[r for r in ledger if r.get('articleId')==article],
                'originalIndependentModelReview':audit['modelReview'],'originalIssues':issues,
                'sameShaAuditInventory':same_sha_audits,
                'reusableParentScope':{'faithfulTextChecks':[z for z in audit['modelReview']['blockChecks'] if z.get('verdict')=='faithful'],
                                       'faithfulFigureChecks':[z for z in audit['modelReview']['figureChecks'] if z.get('verdict')=='faithful'],
                                       'condition':'Only unchanged exact content/ordered context and original source/raw; never relabel original uncertain.'},
                'sameShaIndependentUnknownAllowance':False,
                'unknownImpactDecision':'not independently established; must assess contribution-specific dependencies, never assume non-core',
                'requiredPreservation':'All author conditions, qualifiers, exceptions, sourceSegments/marks/href/tableContext, original image order, unknowns, body and other figures unchanged.',
                'orderedContext':ordered,'contextContentSha256':digest(ordered),'images':images,'whitelist':changes,
                'textErrorsAlsoRequired':textTargets,
                'reviewTargets':{'repairFigureIds':[e['figureId'] for e in changes],
                                 'unknownImpactFigureIds':[f['figureId'] for f in targetfigs if f['unknowns']],
                                 'existingUnknowns':{f['figureId']:f['unknowns'] for f in targetfigs if f['unknowns']},
                                 'notFullArticleReReview':True,'independentImageDecisionRequired':True,
                                 'requirements':['Confirm the exact repaired fact from the attached original image.',
                                                 'Enumerate actual author claims and source block IDs; decide each unknown dependency.',
                                                 'Do not require recovering hidden hands or certify complete probability/optimality facts.',
                                                 'If unknown is acceptable, give explicit required display limitations; if not, name the blocked claim.',
                                                 'Return unresolved uncertain unchanged; no conversion to error/source-note or whole chapter pass.']},
                'proposedBudget':{'maker':1,'independentTargetAndUnknownImpactReview':1,'maximumNewLocalInvocations':2,'retry':0,
                                  'failedVoidCount':True,'model':'gpt-6.1-terra','reasoningEffort':'max',
                                  'moneyCostKnown':False,'upstreamExecutionsObservable':False} if selected else None}
        write(f'packets/{article}.json',packet)
        summaries.append({'canonical':canonical,'packet':f'packets/{article}.json','selected':selected,'sourceSha256':bindings['source']['sha256'],
                          'parentSha256':bindings['candidate']['sha256'],'auditSha256':bindings['audit']['sha256'],
                          'independentCallIds':[r['callId'] for r in reviews],'errors':[i for i in issues if i['severity']=='error'],
                          'uncertain':[i for i in issues if i['severity']=='uncertain'],'sameShaIndependentUnknownAllowance':False})
    # Re-read the actual timeout artifact and ledger, not the historical summary as an API receipt.
    cid='ba432ee3-0d28-42b9-ad34-cde09c97313e'; rawpath=P/f'web-production/v1/raw-calls/{cid}.json'; raw=load(rawpath)
    calls=[x for x in ledger if x.get('articleId')=='cv1780400'];failed=[x for x in calls if x['callId']==cid];assert len(failed)==1
    timeout={'callId':cid,'raw':capture('234-timeout-raw.json',rawpath,'0c73fb1bf6957c0cc44f1b2ec5d705f4cd7152c425f311f28168492b62e47734'),
             'allCurrentLocalArticleLedgerRows':calls,'timedOut':raw['timedOut'],'timeoutMs':raw['timeoutMs'],
             'rawLastMessage':raw['rawLastMessage'],'parsedOutput':raw['parsedOutput'],'usage':raw['usage'],
             'events':raw['events'],'stderr':raw['stderr'],'completeRecoverableOutput':False,'cost':None,
             'boundary':{'failedLocalInvokeCount':1,'logicalThreadCount':1,'reconnectNotices':2,'remoteHTTPRequests':None,'remoteGenerations':None,'remoteCost':None},
             'nextRequest':{'sourceSha256':'7c68b1e68b499637d7ebf6178beb31840f0925cf670a34f21dfd112454c49c57',
                            'parentSha256':'e6424e8c99c01ac0d344af26374e0fc57ee656c5c72f19902010bb1c2618d110',
                            'parentAuditSha256':'87d822baddef33cd01535f7b5b0fd000c8a23d2adc5382170f85af3945f7ac60',
                            'onlyTarget':'79-bilibili-cn:cv1780400:b0003','images':[],'model':'gpt-6.1-sol','reasoningEffort':'high',
                            'maximumNewLocalInvocations':2,'maker':1,'targetReview':1,'retry':0,'approved':False,
                            'prevention':['Reconcile this exact raw/ledger/session terminal state; no resume/retry of the old request.',
                                          'Before claim, compare current register/preview, exact parent/source/audit and new candidate/raw/ledger; STOP on any later result or active claim.',
                                          'Use existing atomic chapter claim and slot, one UUID and request hash, persist raw before validation; after timeout/network loss read back files/ledger before any action.',
                                          'Only gloss the three approved Japanese labels; full Chinese paragraph and conditions into real prompt, all non-target parent checks inherited.',
                                          'Zero automatic retry; a local call limit does not prove an upstream limit. Hard remote single-generation assurance requires acknowledged server request/attempt IDs.']}}
    assert timeout['timedOut'] and timeout['rawLastMessage'] is None and timeout['parsedOutput'] is None and timeout['usage'] is None
    write('234-current-timeout-boundary.json',timeout)
    rest=[]
    for canonical in ['nemata-jp-chapter-224-1','nemata-jp-chapter-232-1','79-cn-chapter-311-18','nemata-jp-chapter-250-1']:
        row=next(r for r in rows if r['canonical']==canonical)
        item={'canonical':canonical,'materials':row['materials'],'originalIssues':row['originalAuditIssuesPreserved'],
              'gap':row.get('gap'),'pdfRoute':row.get('pdfRoute'),'noNewResearchOrCalls':True}
        if canonical=='nemata-jp-chapter-250-1':
            item['latestExactPdfTargets']=[]
            for page in [257,261]:
                audits=[(af,load(af)) for af in (P/'audit/pages/nemata-jp').glob(f'page-{page:04d}.*.json')]
                af,aa=max(audits,key=lambda t:t[1]['recordedAt'])
                item['latestExactPdfTargets'].append({'page':page,'audit':ref(af),'production':ref(aa['production']['path'],aa['production']['sha256']),
                                                     'recordedAt':aa['recordedAt'],'issues':aa['modelReview']['issues'],
                                                     'deterministicChecks':aa['deterministicChecks'],'calls':aa['calls']})
        rest.append(item)
    write('other-exact-unresolved-targets.json',rest)
    write('handoff.json',{'schema':'coac244-next-pair-ready-zero/1','recordedAt':datetime.now(timezone.utc).isoformat(),
                          'authorizationComment':'01a181a7-2d58-7bd0-87fe-71526222935b','ready':summaries[:2],'alternates':summaries[2:],
                          'master':ref(P/'integration/coac250-unified-chapter-register-20261027b.json'),'counts':master['counts'],
                          'pointer':ref(P/'integration/accepted-preview-current.json'),'maximumProposedNewLocalInvocations':4,
                          'moneyCost':None,'upstreamExecutionCount':None,'newCallsThisStage':0,'newDispatches':0,
                          'notAuthorizedOrProduced':True,'excludedExistingDispatch':['79-cn-chapter-182-5','79-cn-chapter-201-6','nemata-jp-chapter-283-1'],
                          'runtimeBoundary':'Evidence/request preflight only. The old error-only revision gate must not be bypassed: mixed uncertain admission and targeted impact receipt require exact parent/source/audit pins before execution; do not reuse the 256-only exception for these chapters.'})
    print(json.dumps({'ready':READY,'allCompared':CANONICALS,'newCalls':0,'maximumProposed':4,'234Recoverable':False},ensure_ascii=False))
if __name__=='__main__':main()
