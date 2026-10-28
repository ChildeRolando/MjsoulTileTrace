"""Fixed311/257/261 preparation only. No model, slot, dispatch, candidate or admission writer."""
import argparse,copy,hashlib,json,subprocess
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing'); HERE=Path(__file__).resolve().parent
HUMAN=ROOT.parent/'human-annotations'; REPO=HERE.parents[4]
load=lambda p:json.loads(Path(p).read_bytes())
digest=lambda b:hashlib.sha256(b).hexdigest()
objsha=lambda o:digest(json.dumps(o,ensure_ascii=False,separators=(',',':')).encode())
def bind(p):
    p=Path(p); return {'path':str(p),'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size}
def put(name,o): (HERE/name).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def apply_exact_draft(parent,edits):
    draft=copy.deepcopy(parent)
    for e in edits:
        keys=e['path'].strip('/').split('/'); target=draft
        for k in keys[:-1]: target=target[int(k)] if isinstance(target,list) else target[k]
        k=int(keys[-1]) if isinstance(target,list) else keys[-1]
        assert target[k]==e['before']; target[k]=copy.deepcopy(e['proposedAfter'])
    return draft
PINS={
 '311':('web-production/v1/candidates/79-bilibili-cn/cv1815400.display.json','5d74d3836050c55996dee84fc35c6df4b82228c79674e9ff93065eb7aee20d97','audit/web/articles/79-bilibili-cn/cv1815400.5d74d3836050c55996dee84fc35c6df4b82228c79674e9ff93065eb7aee20d97.json','12f0f3a74c5261077907d0d9218bacf1177173c64a1e2c1ceeff9eed6729e77a'),
 '257':('production/sol-high-fallback-inline-20261026/candidates/nemata-jp/page-0257.json','6283c24943ac239fad731dd356b7c2da4097ecb9b48bcd9b652a242a8919ee88','audit/pages/nemata-jp/page-0257.6283c24943ac239fad731dd356b7c2da4097ecb9b48bcd9b652a242a8919ee88.6baa4a7e1404.json','82b49d1750bc01c1c0bdee87ccd6190a78c7e0645fd7d738f802fb7b8b712144'),
 '261':('production/sol-high-field-repair18-20261027-p261/candidates/nemata-jp/page-0261.json','376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359','audit/pages/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.7076217daf84.json','4ab382b1a427ca266b8aa8148eed21800be971534627f69c04379e8f83e41b06')}
def read_job(key):
    cp,cs,ap,ash=PINS[key]; c=load(ROOT/cp); a=load(ROOT/ap)
    assert bind(ROOT/cp)['sha256']==cs and bind(ROOT/ap)['sha256']==ash
    assert a['production']['sha256']==cs and a['status']=='needs-repair'
    sp=ROOT/('web-sources/v1/79-bilibili-cn/articles/cv1815400/source.json' if key=='311' else 'nemata-jp/pages/'+key+'.json')
    s=load(sp); expected=c['source']['sourceSha256' if key=='311' else 'pageDataSha256']; assert bind(sp)['sha256']==expected
    assert a['source']==c['source']; refs=[bind(ROOT/cp),bind(ROOT/ap),bind(sp)]; calls=[]
    ledger=[json.loads(x) for x in (ROOT/'audit/calls.jsonl').read_text(encoding='utf-8').splitlines() if x]
    for call in a['calls']:
        rp=ROOT/'audit/calls'/(call['callId']+'.json'); raw=load(rp); refs.append(bind(rp))
        assert [x for x in ledger if x['callId']==call['callId']]==[call]
        output=raw.get('output',raw.get('structuredOutput')); assert output==a['modelReview']==json.loads(raw['rawLastMessage'])
        assert raw['success'] and raw['exitCode']==0 and not raw['timedOut']
        calls.append({'phase':'independent-parent-audit','record':call,'raw':bind(rp),'durationMs':raw.get('durationMs')})
    # The production attempt is bound to its own artifactRoot/run, never the current run's namespace.
    for call in c['provenance']['attempts']:
        base=ROOT/(c['provenance']['artifactRoot'] if key=='311' else 'production/'+('sol-high-fallback-inline-20261026' if key=='257' else 'sol-high-field-repair18-20261027-p261'))
        rp=base/call['rawArtifactPath']; raw=load(rp); assert bind(rp)['sha256']==call['rawArtifactSha256']; refs.append(bind(rp))
        pl=[json.loads(x) for x in (base/'calls.jsonl').read_text(encoding='utf-8').splitlines() if x]; assert [x for x in pl if x['callId']==call['callId']]==[call]
        calls.append({'phase':'parent-production','record':call,'raw':bind(rp)})
    return c,a,s,refs,calls
def check_plan(plan):
    assert plan['paidCallsAuthorizedThisPhase']==0 and plan['dispatchAllowed'] is False
    assert plan['acquireMakerSlot'] is False and plan['createConsumer'] is False
    assert plan['unknownPolicy']=='human-only-for-unresolved-tiles; retain-unreadable-chart-points; no-inference'
    assert plan['futureVisionConfig']=={'model':'gpt-6.1-terra','reasoningEffort':'max','policy':'coac244-vision-production-schema-v2-20261028'}
    assert plan['reuse']['pages']==11 and plan['reuse']['sourceBlocks']==837
    assert plan['pdf261']['oldB4AlreadySolved'] is True
    assert plan['pdf261']['requiresBoundHumanAnswerBeforeApply'] is True
    assert plan['pdf261']['applyCurrentUserDesired5mWithoutAnotherModelGuess'] is True
    assert plan['pdf261']['historical3mAdjudicationPreserved'] is True
    assert len(plan['pdf257']['publicTilePositions'])==9
    assert plan['pdf257']['inferHiddenHandsOrUnflippedIndicators'] is False
    assert plan['web311']['preserveBodyBlocks']==225
    assert len(plan['web311']['conditionalPointIds'])==144
    assert plan['web311']['rawIssuesMustRemain']==['uncertain']*7+['error']*2+['source-note']
    assert plan['web311']['assignAmbiguousCrossCurveToCondition'] is False
    assert plan['web311']['sourceNoteOnlyAttachmentNumbering'] is True
    assert plan['futureCallsAreProposalNotBudget'] is True
def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    if args.check:
        plan=load(HERE/'plan.json'); check_plan(plan)
        for f in load(HERE/'inputs.json')['immutable']: assert bind(f['path'])['sha256']==f['sha256'],f['path']
        for f in load(HERE/'files.json'): assert bind(HERE/f['path'])['sha256']==f['sha256'],f['path']
        print(json.dumps({'passed':True,'newModelCalls':0,'newDispatches':0,'immutableInputs':len(load(HERE/'inputs.json')['immutable']),'packFiles':len(load(HERE/'files.json'))})); return
    jobs={k:read_job(k) for k in PINS}; refs=[b for j in jobs.values() for b in j[3]]
    runtime=ROOT/'audit/runtimes/coac269-109167-exact-v1-20261028/runtime-manifest.json'
    refs.append(bind(runtime)); assert refs[-1]['sha256']=='814df700d298188dea14d20fd84ac818d1ded9a706e370bc7a1714141ad6a7a9'
    for f in load(runtime)['files']:
        refs.append(bind(f['path'])); assert refs[-1]['sha256']==f['sha256']
    # Snapshot only this phase's selected human targets; the live queue/events are never modified.
    qb=(HUMAN/'queue.json').read_bytes(); eb=(HUMAN/'events.jsonl').read_bytes(); q=json.loads(qb)
    selected=[x for x in q['items'] if x['canonical'] in ['79-cn-chapter-311-18','nemata-jp-chapter-250-1']]
    events=[json.loads(x) for x in eb.decode('utf-8').splitlines() if x]; answers=[x for x in events if x['canonical'] in ['79-cn-chapter-311-18','nemata-jp-chapter-250-1']]
    put('human-state.json',{'queueObservedSha256':digest(qb),'queueGeneratedAt':q['generatedAt'],'eventLogObservedSha256':digest(eb),'selectedItems':selected,'selectedEvents':answers,'liveStateChanged':False})
    c,a,s,_,_=jobs['311']; source_by={b['id']:b for b in s['blocks']}
    ordered=[]
    for pos,b in enumerate(c['body']['blocks']):
        ordered.append({'position':pos,'source':[source_by[i] for i in b['sourceBlockIds']],'candidate':b,'figures':[f for f in c['figures'] if set(f['sourceBlockIds'])&set(b['sourceBlockIds'])]})
    assert len(ordered)==225
    # Full originals, not just target excerpts, define the ordered future review context.
    put('311-context.json',{'source':jobs['311'][3][2],'candidate':jobs['311'][3][0],'orderedContext':ordered,'allFigures':c['figures'],'originalModelReview':a['modelReview'],'targetScopeOnly':True})
    for f in c['figures']:
        for b in f['sourceAssetBindings']: refs.append(bind(ROOT/b['path'])); assert refs[-1]['sha256']==b['sha256']
    chart_blocks=['b0122','b0124','b0126','b0128','b0130','b0132','b0156','b0158']
    cells=[]; charts=[]; exact=[]
    for n in chart_blocks:
        i=next(i for i,f in enumerate(c['figures']) if f['figureId'].endswith(':'+n+':figure')); f=c['figures'][i]
        series=['不立直·10%','立直·0%'] if n<'b0150' else ['和牌时的自摸比例','被自摸率']; turns=list(range(2,15,2)) if n<'b0150' else list(range(1,16))
        ids=[f['figureId']+'/'+name+'/turn-'+str(turn) for name in series for turn in turns]; cells+=ids
        charts.append({'figureId':f['figureId'],'parentFullFigureSha256':objsha(f),'sourceAssets':f['sourceAssetBindings'],'originalTranscription':f['transcription'],'originalUnknowns':f['unknowns'],'allowedLeafPaths':['/figures/'+str(i)+'/transcription','/figures/'+str(i)+'/unknowns'],'series':series,'turns':turns,'pointIds':ids,'values':None,'pointReadingsAuthorizedNow':False,'retainOtherSeriesVerbatim':True,'requireApproximateLabel':True,'preserveAxesUnitsTitleThresholdsAndMarkers':True,'unknownConditionBindingMustStayUnknown':n=='b0132'})
        if n in ['b0156','b0158']:
            for field in ['transcription','unknowns']:
                before=f[field]; after=before.replace('和牌时摸入率','和牌时的自摸比例').replace('被摸入率','被自摸率') if isinstance(before,str) else [t.replace('和牌时摸入率','和牌时的自摸比例').replace('被摸入率','被自摸率') for t in before]
                exact.append({'path':'/figures/'+str(i)+'/'+field,'before':before,'proposedAfter':after,'kind':'confirmed-translation-only; unreadable-data-remains-unknown'})
    i=next(i for i,f in enumerate(c['figures']) if ':b0154:' in f['figureId']); f=c['figures'][i]
    exact.append({'path':'/figures/'+str(i)+'/unknowns','before':f['unknowns'],'proposedAfter':f['unknowns']+['原图仅见12张牌，未显示的第13张及完整一向听构型未知，不能据此核定完整手牌。'],'kind':'explicit-source-limitation; not-an-inferred-13th-tile'})
    # Snapshot exactly the other eleven real passed/source-current pages, not a fresh full-chapter audit.
    reuse=[]
    for page in range(250,263):
        if page in [257,261]:continue
        sp=ROOT/'nemata-jp/pages'/f'{page}.json'; source=load(sp); sh=bind(sp)['sha256']; candidates=[]
        for ap in (ROOT/'audit/pages/nemata-jp').glob(f'page-{page:04d}.*.json'):
            aa=load(ap)
            if aa['status']=='passed' and aa['source']['pageDataSha256']==sh and Path(aa['production']['path']).exists() and bind(aa['production']['path'])['sha256']==aa['production']['sha256']: candidates.append((aa.get('recordedAt',''),ap,aa))
        assert candidates,page
        _,ap,aa=max(candidates,key=lambda x:x[0]); cp=Path(aa['production']['path']); cc=load(cp); assert cc['source']['pageDataSha256']==sh
        rr=[bind(sp),bind(cp),bind(ap)]
        for call in aa['calls']:
            rp=ROOT/'audit/calls'/(call['callId']+'.json'); raw=load(rp); assert raw.get('output',raw.get('structuredOutput'))==aa['modelReview']==json.loads(raw['rawLastMessage']); assert raw['success']; rr.append(bind(rp))
        refs+=rr; reuse.append({'page':page,'sourceBlocks':len(source['blocks']),'source':rr[0],'candidate':rr[1],'audit':rr[2],'raws':rr[3:],'auditStatus':'passed','newCalls':0})
    assert len(reuse)==11 and sum(x['sourceBlocks'] for x in reuse)==837
    put('reuse-pages.json',reuse)
    for key in ['257','261']:
        cc,aa,ss,_,_=jobs[key]
        images=[]
        for f in cc['figures']:
            for path,sh in [(f['croppedImagePath'],f['croppedImageSha256'])]+[('assets/'+v+'.png',v) for v in f['sourceImageSha256s']]:
                bb=bind(ROOT/path); assert bb['sha256']==sh; refs.append(bb); images.append(bb)
        neighbor=[]
        for page in [int(key)-1,int(key)+1]:
            pp=ROOT/'nemata-jp/pages'/f'{page}.json'; refs.append(bind(pp)); neighbor.append({'source':refs[-1],'page':load(pp)})
        context={'source':jobs[key][3][2],'candidate':jobs[key][3][0],'sourceBlocksInOriginalOrder':ss['blocks'],'candidateBodyInVisualOrder':cc['body'],'allFiguresInOriginalOrder':cc['figures'],'imageCoverage':cc['imageCoverage'],'originalIndependentModelReview':aa['modelReview'],'adjacentSourcePagesContextOnly':neighbor,'images':images,'reviewOnlyTargets':['nemata-jp-p257-r1'] if key=='257' else ['nemata-jp-p261-r50','nemata-jp-p261-b33']}
        put(key+'-context.json',context)
    cc,aa,ss,_,_=jobs['261']; i=next(i for i,f in enumerate(cc['figures']) if f['figureId']=='nemata-jp-p261-r50'); f=cc['figures'][i]
    edits=[{'path':f'/figures/{i}/transcription','before':f['transcription'],'proposedAfter':'摸入牌：5m，普通五万，非赤五；竖置。'},{'path':f'/figures/{i}/caption','before':f['caption'],'proposedAfter':'5m'}]
    for bi,b in enumerate(cc['body']['blocks']):
        for ti,t in enumerate(b.get('inlineContent',[])):
            if t.get('figureId')=='nemata-jp-p261-r50':
                edits.append({'path':f'/body/blocks/{bi}/inlineContent/{ti}/text','before':t['text'],'proposedAfter':'5m'})
                assert b['text'].count('若摸入3m')==1
                edits.append({'path':f'/body/blocks/{bi}/text','before':b['text'],'proposedAfter':b['text'].replace('若摸入3m','若摸入5m')})
    b4=next(b for b in cc['body']['blocks'] if 'nemata-jp-p261-b4' in b['sourceBlockIds']); r8=next(j for j,t in enumerate(b4['inlineContent']) if t.get('figureId')=='nemata-jp-p261-r8'); assert b4['inlineContent'][r8+1]['text']=='和'
    correction=cc['provenance']['sourceFieldCorrection']; assert correction['newProductionModelCalls']==0
    oldp=ROOT/correction['parentPath']; olda=ROOT/correction['notesPath']; oldraw=ROOT/correction['originalProductionRaw']['path']
    for path,expected in [(oldp,correction['parentSha256']),(olda,correction['notesSha256']),(oldraw,correction['originalProductionRaw']['sha256'])]:
        refs.append(bind(path)); assert refs[-1]['sha256']==expected
    oldaudit=load(olda); oldcalls=[]
    for call in oldaudit['calls']:
        rp=ROOT/'audit/calls'/(call['callId']+'.json'); raw=load(rp); refs.append(bind(rp)); assert raw['structuredOutput']==oldaudit['modelReview']==json.loads(raw['rawLastMessage']); oldcalls.append({'phase':'older-b4-audit-already-resolved','record':call,'raw':bind(rp)})
    adjp=ROOT/'audit/adjudications/nemata-jp/page-0261.376c71a39de29653b0ba59c947d777832aa2af3623885cf1f8f451b9f29cf359.source-3m-adjudication.json'; adj=load(adjp); refs.append(bind(adjp)); arp=ROOT/'audit/calls'/(adj['modelAdjudication']['callId']+'.json'); refs.append(bind(arp)); assert refs[-1]['sha256']==adj['modelAdjudication']['sha256']
    p257positions=['上方第1张','上方第6张','上方第17张','左方第16张','右方第1张','右方第2张','右方第7张','右方第13张','右方第14张']
    plan={'schema':'coac269-fixed311250-preparation/1','authorizationComment':'01a181e7-f366-7187-9a4d-4f0a70eaba7a','paidCallsAuthorizedThisPhase':0,'dispatchAllowed':False,'acquireMakerSlot':False,'createConsumer':False,'unknownPolicy':'human-only-for-unresolved-tiles; retain-unreadable-chart-points; no-inference','futureVisionConfig':{'model':'gpt-6.1-terra','reasoningEffort':'max','policy':'coac244-vision-production-schema-v2-20261028'},'futureCallsAreProposalNotBudget':True,
      'web311':{'canonical':'79-cn-chapter-311-18','parent':jobs['311'][3][0],'source':jobs['311'][3][2],'parentAudit':jobs['311'][3][1],'preserveBodyBlocks':225,'preserveFigures':len(c['figures']),'charts':charts,'exactDraftEdits':exact,'conditionalPointIds':cells,'rawIssuesMustRemain':[x['severity'] for x in a['modelReview']['issues']],'assignAmbiguousCrossCurveToCondition':False,'sourceNoteOnlyAttachmentNumbering':True,'attachmentNumberMapping':{'original':list(range(1,22)),'magnified':list(range(22,43)),'notSemanticBlocker':True},'noOtherFigureOrBodyEdits':True,'futureRequest':'311-context.json','entryReadiness':'blocked: fixed mixed error+uncertain exact adapter not yet declared/frozen for this tuple; do not reuse109/167 or256 exceptions'},
      'pdf257':{'canonical':'nemata-jp-chapter-250-1','parent':jobs['257'][3][0],'source':jobs['257'][3][2],'parentAudit':jobs['257'][3][1],'target':'nemata-jp-p257-r1','sourceImageBlocks':['nemata-jp-p257-b3','nemata-jp-p257-b4'],'publicTilePositions':p257positions,'allowedFieldsAfterBoundHumanAnswers':['r1.transcription:only-nine-named-public-tiles','r1.unknowns:only-explicitly-answered-positions'],'inferHiddenHandsOrUnflippedIndicators':False,'futureRequest':'257-context.json','entryReadiness':'human answer required; no paid OCR retry'},
      'pdf261':{'canonical':'nemata-jp-chapter-250-1','parent':jobs['261'][3][0],'source':jobs['261'][3][2],'parentAudit':jobs['261'][3][1],'target':'nemata-jp-p261-r50','sourceImageBlock':'nemata-jp-p261-b92','affectedSourceTextBlock':'nemata-jp-p261-b33','exactConditionalEdits':edits,'oldB4AlreadySolved':True,'b4ParentSha256':objsha(b4),'b4MustStayByteIdentical':True,'requiresBoundHumanAnswerBeforeApply':True,'applyCurrentUserDesired5mWithoutAnotherModelGuess':True,'historical3mAdjudicationPreserved':True,'historicalAdjudication':bind(adjp),'historicalIndependentCall':adj['modelAdjudication'],'conflictStatus':'latest instruction and parent audit require5m; historical independent source adjudication says3m; retain both, human queue target84791e37a95dcfa295e38dbf27855039 not answered in this observation; no inferred verdict','futureRequest':'261-context.json','entryReadiness':'conditional five-man draft only; no candidate created'},
      'reuse':{'pages':11,'sourceBlocks':837,'manifest':'reuse-pages.json','noNewAuditOrProduction':True},
      'minimalFutureSequence':[{'scope':'311','proposal':'one bounded maker for permitted figure leaves only, then249 one combined target+unknown-impact review with225 ordered blocks; unreadable144 cells remain explicit unknown','callsProposed':2},{'scope':'PDF261','proposal':'after exact human/source binding and authorized budget, one bounded figure+derived-inline repair then249 one target/affected-Q17 review; keep solvedb4; no charge to adjudicate3m/5m again','callsProposed':2},{'scope':'PDF257','proposal':'wait for human answers to the nine public river positions, bind each to original sourceSHA/event; if lawful declared deterministic human-derived import exists use it and one249 target/impact review; otherwise propose one maker+one target review after authorization','callsProposed':'1 or2 after human answers;0 while pending'}],
      'beforeAnyFutureDispatch':['explicit new per-scope budget; failed/void counted; zero automatic retry','current accepted/dispatch/ledger/claim dedup immediately before call','fresh244 exact tuple adapter and manifest; real closedPrompt/schema/images equality','failclosed non-target body,figures,unknowns,sourceSegments and original conditions','normal maker-B acquisition only when ready; foreground collect; normal release; stop on capacity/quota']}
    check_plan(plan); put('plan.json',plan)
    # Draft patches are exercised in memory only; no derived candidate/provenance is emitted.
    mutation_checks=[]
    for key,ed in [('311',exact),('261',edits)]:
        parent=jobs[key][0]; expected=apply_exact_draft(parent,ed)
        def validate(probe): assert probe==expected
        validate(copy.deepcopy(expected))
        for name,mutate in [('non-target-punctuation',lambda p:p['body']['blocks'][0].update(text=p['body']['blocks'][0]['text']+'。')),('unknown-removed',lambda p:p['figures'][0].update(unknowns=['invented'])),('image-reordered',lambda p:p['figures'].reverse())]:
            probe=copy.deepcopy(expected); mutate(probe)
            try: validate(probe)
            except AssertionError: mutation_checks.append({'scope':key,'name':name,'rejected':True})
            else: raise AssertionError(name)
    put('draft-patch-checks.json',{'candidateWritten':False,'exactDraftsApplyInMemory':True,'negativeChecks':mutation_checks,'conditionalCurvesNotFilled':True})
    put('human-targets.json',{'schema':'coac269-existing-human-page-targets/1','queueUpdated':False,
      'existingPageTargets':[{'queueId':x['id'],'targetId':x['targetId'],'figureId':x['figureId'],'position':x['position'],'sourceImages':x['originalImages'],'evidence':x['evidence'],'humanAnswerObserved':any(e['id']==x['id'] for e in answers)} for x in selected],
      'pdf257':{'orderedPublicPositions':p257positions,'requiredAnswerFields':['exact displayed tile code or explicit unreadable','red-five state where observable','source image SHA and original queue target/event ID'],'doNotAskToInfer':['three opponents concealed hands','unflipped dora/ura indicators','called-from player not marked in image']},
      'pdf261':{'position':'p261-b92 / r50 before 引きならダマ満テンパイで四暗への手変わりもあります','requiredAnswerFields':['3m or5m or unreadable from exact original image','red-five status if5m','actual human event bound to source image f502bc2382ccc4076a54928cec3588aa60096ff42b7f221abba1e074ad7045a9'],'currentUserDesiredRepair':'5m; do not repeat paid model adjudication','oldB4NotAnAnnotationTask':True},
      'web311':{'sourceIncompleteHand':{'figureId':f'{c["source"]["sourceId"]}:{c["source"]["articleId"]}:b0154:figure','visibleTiles':'2m 3m 9m 9m 9m 4p 5p 6s 7s 8s 9s 2z','only12Visible':True,'doNotAskHumanToGuess13th':True,'needMoreCompleteSourceBeforeAnyCompleteHandClaim':True},'chartPointsForOptionalHumanEvidence':[{'figureId':x['figureId'],'series':x['series'],'turns':x['turns'],'pointIds':x['pointIds'],'sourceAssets':x['sourceAssets'],'answerRequirement':'condition+marker identity and approximate value or explicit unknown; no interpolation'} for x in charts],'newTileQuestionsAddedToLiveQueue':0}})
    negatives=[]
    for name,edit in [('dispatch',lambda p:p.update(dispatchAllowed=True)),('paid-budget',lambda p:p.update(paidCallsAuthorizedThisPhase=1)),('slot-hold',lambda p:p.update(acquireMakerSlot=True)),('replace-provider-model',lambda p:p['futureVisionConfig'].update(model='gpt-6.1-sol')),('re-audit837',lambda p:p['reuse'].update(pages=13)),('redo-solved-b4',lambda p:p['pdf261'].update(oldB4AlreadySolved=False)),('ignore-conflicting-evidence',lambda p:p['pdf261'].update(historical3mAdjudicationPreserved=False)),('auto-decide-r50',lambda p:p['pdf261'].update(requiresBoundHumanAnswerBeforeApply=False)),('infer-hidden-hand',lambda p:p['pdf257'].update(inferHiddenHandsOrUnflippedIndicators=True)),('assign-ambiguous-curve',lambda p:p['web311'].update(assignAmbiguousCrossCurveToCondition=True)),('rewrite-body',lambda p:p['web311'].update(preserveBodyBlocks=224))]:
        probe=copy.deepcopy(plan); edit(probe)
        try:check_plan(probe)
        except AssertionError:negatives.append({'name':name,'rejected':True})
        else:raise AssertionError(name)
    # All original inputs stay byte-identical. Mutable coordination files are observations only.
    immutable=list({b['path']:b for b in refs}.values()); [bind(b['path'])['sha256']==b['sha256'] or (_ for _ in ()).throw(AssertionError(b['path'])) for b in immutable]
    put('inputs.json',{'immutable':immutable,'noOriginalWrites':True})
    put('call-account.json',{'existingCalls':{k:j[4] for k,j in jobs.items()},'historical261OlderB4Audit':oldcalls,'historical261Adjudication':adj['modelAdjudication'],'pdf261CurrentRepairIsDeclaredDeterministic':True,'pdf261B4CorrectionNewMakerCalls':0,'pdf261OriginalMakerRaw':correction['originalProductionRaw'],'newCalls':0,'newDispatches':0,'fee':None,'upstreamExecutionCount':None})
    put('checks.json',{'passed':True,'negativeChecks':negatives,'exactDraftMutationChecks':mutation_checks,'newModelCalls':0,'sourceAndParentPinsVerified':True,'rawAndUniqueLedgerVerified':True,'humanEventsAtObservation':len(answers),'immutableInputsRehashed':len(immutable),'reusePages':11,'reuseSourceBlocks':837,'wholeChapterPassed':False,'candidateCreated':False,'slotsAcquired':0})
    paths=[]
    for p in HERE.iterdir():
        if not p.is_file() or p.name=='files.json':continue
        assert len(str(p))<240
        paths.append({'path':p.name,'sha256':bind(p)['sha256'],'windowsLength':len(str(p))})
    put('files.json',paths)
    print(json.dumps({'prepared':True,'newCalls':0,'immutableInputs':len(immutable),'negativeChecks':len(negatives),'reusePages':11,'reuseSourceBlocks':837,'longestWindowsPath':max(x['windowsLength'] for x in paths)}))
if __name__=='__main__':main()
