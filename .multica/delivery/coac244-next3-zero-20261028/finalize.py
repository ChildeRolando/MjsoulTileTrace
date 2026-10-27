import json,pathlib,hashlib,shutil,copy
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent;S=P/'integration/coac244-next3-zero-20261028'
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(n,x):
 t=json.dumps(x,ensure_ascii=False,indent=2)+'\n';(O/n).write_text(t,encoding='utf-8');(S/n).write_text(t,encoding='utf-8')
u=load(P/'integration/coac250-unified-chapter-register-20261027b.json');byid={r['chapterId']:r for r in u['rows']}
universe=load(O/'remaining-universe.json');assert len(universe['uncovered'])==len([r for r in u['rows'] if not r['covered']])
ptr=load(P/'integration/accepted-preview-current.json');corpusPath=pathlib.Path(ptr['output'])/'textbook-corpus.json';corpus=load(corpusPath)
nav=[x for x in corpus['units'] if x['chapterId']=='79-cn-chapter-001-3'];assert len(nav)==1 and nav[0]['contentRole']=='navigation'
ownership=load(P/'integration/source-block-ownership.json');metadata=[]
for id in ['nemata-jp-chapter-001-64','nemata-jp-chapter-317-51']:
 r=byid[id];owned=[b for b in ownership['blocks'] if b['chapterId']==id];metadata.append(dict(chapterId=id,title=r['title'],covered=r['covered'],pages=sorted({b['page'] for b in owned}),ownedBlocks=len(owned),latestPdfPageStates=r.get('pdfRoute',{}).get('pagesDetail',[]),action='Preserve cover/contents and original author prose, research bibliography and appendix explanation; obtain source evidence for cover tiny text and unresolved marks. Do not label author argument navigation or invent readings. Existing four-page gate deviation is preserved; no repeat from scratch.'))
appendices=[dict(chapterId=r['chapterId'],title=r['title'],covered=r['covered'],coverageRoute=r.get('coverageRoute')) for r in u['rows'] if r['sourceId']=='nemata-jp' and int(r['chapterId'].split('-')[-2])>=318]
universe['frontMatterAndAppendices']=dict(navigationAlreadyPresent=dict(chapterId=nav[0]['chapterId'],unitId=nav[0]['unitId'],blocks=len(nav[0]['blocks']),corpus=bind(corpusPath)),remainingMetadata=metadata,appendixTheoryChapters=appendices,sourceOwnership=bind(P/'integration/source-block-ownership.json'),metadataOldPlan=bind(P/'integration/modern-metadata-four-page-gap-plan.json'),metadataOldPlanStatusIsHistorical=True,scopeWarning='These metadata/appendix rows remain in the current256/303/21212 source universe. Navigation already present is not counted again. Old navigation map has obsolete canonical aliases and is not used to remap current accepted rows.')
save('remaining-universe.json',universe)
selected=universe['selected'];ranking=[]
for id in selected:
 r=byid[id];d=load(O/({'nemata-jp-chapter-100-1':'100','79-cn-chapter-159-9':'159','79-cn-chapter-242-3':'242'}[id]+'-input.json'));assert not r['covered'];assert d['candidate']['sha256']==r['existingCandidate']['sha256'];assert not any(x['chapterId']==id or d['sourceData']['articleId'] in x['chapterId'] for x in corpus['units'])
 ranking.append(dict(chapterId=id,candidate=d['candidate'],source=d['source'],audit=d['audit'],classifiedGap='audit input omission; existing definitions and faithful translation present' if '100-1' in id else 'one public river tile remains unknown in existing independent full review; source image present, no new confirmed translation error',nonSourceNoteIssueCount=len([i for i in d['modelReview']['issues'] if i['severity']!='source-note']),sameShaCalls=[c['call']['callId'] for c in d['calls']],newModelCalls=0))
nexts=dict(schema='coac244-next-three-zero-stage-handoff/1',selected=ranking,excludedExistingWork=universe['excluded'],registerBaseline=u['counts'],budget=dict(thisStageNewModelCalls=0,proposedNextIndependentCalls=3,chapter100=1,chapter159=1,chapter242=1,producerCallsNow=0,retry=0,failedVoidCount=True,conditionalLaterImageCorrections=dict(chapter159=dict(maker=1,audit=1),chapter242=dict(maker=1,audit=1),maximumAdditional=4,notAuthorized=True),allConditionalPhasesMaximumFutureCalls=7,monetaryPrice='unknown; no chargeable API request executed'),chapter100=dict(input='100-context-v2.json',helper='context100.mjs',runtime=load(O/'100-runtime-binding.json'),targetOriginalGroup='chapter01-section035-batch-002',targetBlocks=68,completeDefinitionContext=39,inheritedPassedBlocks=243,images=[],model='gpt-6.1-sol',effort='high',sourceAndCandidateChanged=False,requiredExecution='Original audit guard/admission and budget authorization first. Use exported request constructor, preserve original plan/raw, bind new scope/context proof into the real standard ledger/raw. verifyRecordedContext100Call must validate actual new raw; recordContext100Supplement writes a separate immutable sidecar only after genuine independent pass. stageWebTextbook may consume verifyContext100Supplement callback; old full audit remains needs-repair. No existing raw qualifies as a supplement.'),chapter159=dict(input='159-point-packet.json',target='79-bilibili-cn:cv1751292:b0013:figure',bbox=[298,126,324,161],newPointReview=False,oldUnknownPreserved=True),chapter242=dict(input='242-point-packet.json',target='79-bilibili-cn:cv1780438:b0014:figure',bbox=[177,144,202,177],newPointReview=False,oldUnknownPreserved=True),notSelected=dict(chapter208='two figures/four unidentified public tiles; more point gaps than159/242',chapter193='PDF two-sentence supplement already delivered as separate source version; unknown b0042 and mixed-source full chapter assembly still need additional steps. Do not repeat delivered supplement or call it full pass.'),metadata=universe['frontMatterAndAppendices'])
save('handoff.json',nexts)
for n in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=P/'integration'/n;data=load(path);before=copy.deepcopy(data);touched=[]
 def visit(x):
  if isinstance(x,list):
   for v in x:visit(v)
  elif isinstance(x,dict):
   if x.get('chapterId') in selected:
    id=x['chapterId'];touched.append(id);x['nextThreeZeroStage']={'handoff':bind(S/'handoff.json'),'newModelCalls':0,'candidateUnchanged':True,'reviewStatusUnchanged':True}
    action='A/B定义完整b0001–39及候选已补新投影，目标原batch002的68块；243已pass块复用。原计划/raw不动，13离线检查通过。建议新独立补上下文审1、无制作/无图；真实新raw+ledger通过限定sidecar验证才可交250，当前0调用未pass。' if '100-1' in id else '单一公开舍牌unknown保持；原图/坐标/邻牌/完整中文上下文与逐像素裁剪+x4已打包。原同SHA独审与非目标faithful证据可复用；先建议独立点+教学影响审1，不重制全章、不主控归非核心。若需改未知另议maker1+审1，当前0模型不改候选。'
    if 'nextAction' in x:x['nextAction']=action
    if 'closurePlan' in x:x['closurePlan']['nextAction']=action
    return
   for v in x.values():visit(v)
 visit(data);assert sorted(touched)==sorted(selected)
 def strip(x):
  if isinstance(x,dict):
   if x.get('chapterId') in selected:return {'chapterId':x['chapterId'],'covered':x.get('covered')}
   return {k:strip(v) for k,v in x.items()}
  if isinstance(x,list):return [strip(v) for v in x]
  return x
 assert strip(data)==strip(before)
 (O/(n+'.before')).write_text(json.dumps(before,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copy2(path,O/n)
for key in ['100','159','242']:
 d=load(O/(key+'-input.json'))
 for b in [d['source'],d['candidate'],d['audit']]+[x['raw'] for x in d['calls']]:assert bind(pathlib.Path(b['path']))==b
save('final-checks.json',dict(newModelCalls=0,sourceCandidateAuditRawUnchanged=True,onlyThreeRegisterRowsChanged=True,coverageUnchanged=True,frontMatterAndAppendicesIncluded=True,sourceGeometryChecks=4,nearestNeighborEveryPixelChecks=4,context100RequestChecks=13,metadataPlanTreatedAsHistorical=True))
for n in ['context100.mjs','freeze100.mjs','images.py','prepare.py','finalize.py']:
 shutil.copy2(O/n,S/n)
print(json.dumps(dict(currentCoverage=u['counts']['effectiveCoveredOriginalChapters'],remaining=len(universe['uncovered']),selected=selected,newModelCalls=0,proposedNextCalls=3)))
