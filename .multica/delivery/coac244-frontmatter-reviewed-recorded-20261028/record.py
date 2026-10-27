"""Zero-model intake only. Never applies proposals to candidates or changes audit verdicts."""
import copy,hashlib,json,pathlib,shutil,subprocess,datetime
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent;S=P/'integration/coac244-frontmatter-reviewed-recorded-20261028';S.mkdir(exist_ok=True)
protected={}
def sha(b):return hashlib.sha256(b).hexdigest()
def objsha(x):return sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode())
def bind(p):p=pathlib.Path(p);return dict(path=str(p),sha256=sha(p.read_bytes()),bytes=p.stat().st_size)
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def get(ref):
 p=P/ref['path'];b=bind(p);assert b['sha256']==ref['sha256'],str(p);protected[str(p)]=b;return load(p)
def save(n,x):(O/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
hp=P/'integration/coac249-frontmatter-targets-reviewed-20261028.json';sp=P/'integration/coac249-frontmatter-targets-summary-20261028.json'
h=get(dict(path=str(hp),sha256='a2336fbd04681778175b28738b0e23bb014b7243339b1601dd3cd5546766f9f0'))
s=get(dict(path=str(sp),sha256='ef3d1de1c750a027fc5c420990649976110d057b7f28c95dad67feb548aa9efa'))
assert h['newModelCalls']==2 and h['newProductionCalls']==h['retry']==h['remaining']==0
assert not h['wholeChapterAccepted'] and not h['standardWholePagePassed']
source_handoff=get(s['sourceHandoff']);get(s['verification']);runtime=get(s['runtime']);rt=pathlib.Path(s['runtime']['path']).parent
assert s['runtime']['sha256']=='a5cff9c38466a76030b5269ac4367f07695fa3ddb43fb4cbf374069fa852125c'
for f in runtime['files']:
 p=rt/f['path'];b=bind(p);assert b['sha256']==f['sha256'];protected[str(p)]=b
pkg=pathlib.Path(s['sourceHandoff']['path']).parent;manifest=load(pkg/'files.sha256.json');protected[str(pkg/'files.sha256.json')]=bind(pkg/'files.sha256.json')
for f in manifest['files']:
 p=(pkg/f['path']).resolve();assert p.is_relative_to(pkg.resolve());b=bind(p);assert b['sha256']==f['sha256'] and b['bytes']==f['bytes'];protected[str(p)]=b
source_check=subprocess.run(['python',str(pkg/'verify_evidence.py')],capture_output=True,text=True,check=True);save('existing-source-verifier.json',json.loads(source_check.stdout))
ledger=[json.loads(x) for x in (P/'audit/calls.jsonl').read_text(encoding='utf-8-sig').splitlines() if x.strip()]
calls=[];candidates={}
for i,part in enumerate(['first','second']):
 r=h[part];rr=get(r['receipt']);assert {k:v for k,v in r.items() if k!='receipt'}==rr
 raw=get(r['raw']);request_path=P/f'audit/supplements/coac249-frontmatter-targets-20261028/request-{i}.json';q=get(dict(path=str(request_path),sha256=r['request']['sha256']))
 assert raw['success'] and raw['exitCode']==0 and not raw['timedOut'] and not raw['outputOverflow']
 assert json.loads(raw['rawLastMessage'])==raw['output']==r['modelReview']
 assert raw['prompt']==q['prompt'] and raw['schema']==q['schema']
 assert raw['requestPrompt'].endswith(q['prompt']) and sha(raw['requestPrompt'].encode())==raw['requestPromptSha256']
 assert raw['callId']==r['call']['callId'] and raw['usage']==r['call']['usage']
 assert len([x for x in ledger if x['callId']==raw['callId']])==1 and next(x for x in ledger if x['callId']==raw['callId'])==r['call']
 assert r['status']=='needs-repair' and r['checks']['passed']==True and not r['admissionGranted'] and not r['wholeChapterAccepted']
 assert raw['output']['scopeConclusion']=='needs-exact-repair' and not raw['output']['wholePagePassClaimed'] and raw['output']['completeTargetScopeCompared']
 ex=raw['requestExecution'];assert ex['model']=='gpt-6.1-terra' and ex['reasoningEffort']=='max';assert len(ex['images'])==[19,7][i]
 assert [x['path'] for x in ex['images']]==q['images'];args=ex['args'];assert [args[j+1] for j,x in enumerate(args) if x=='-i']==q['images'];assert args[args.index('--model')+1]=='gpt-6.1-terra' and 'model_reasoning_effort="max"' in args
 for image in ex['images']:
  p=pathlib.Path(image['path']);b=bind(p);assert b['sha256']==image['sha256'] and b['bytes']==image['bytes'];protected[str(p)]=b
 for ref in r['candidates']:candidates[ref['sha256']]=get(ref)
 calls.append(dict(callId=raw['callId'],receipt=r['receipt'],raw=r['raw'],request=dict(path=str(request_path),sha256=bind(request_path)['sha256']),model=ex['model'],effort=ex['reasoningEffort'],images=len(ex['images']),usage=raw['usage'],durationMs=raw['durationMs'],mechanicalChecksPassed=r['checks']['passed'],semanticConclusion=raw['output']['scopeConclusion'],status=r['status'],admissionGranted=False))
 for name,ref in [(f'receipt-{i}.json',r['receipt']),(f'raw-{i}.json',r['raw'])]:shutil.copy2(ref['path'],O/name)
 assert r['oldWholePageReviewsUnchanged']
assert h['second']['priorSameImageReceipt']==h['first']['receipt']
assert s['sameImage']['status']=='unknown' and s['sameImage']['secondReusesFirst']
assert s['sameImage']['sha256']=='275de30a14f23f51d30e29b86baeec0fefd137d45e091ff0717f0b41c5da05d6'
assert s['inherited']==dict(sourceBlocksMapped=226,oldFaithfulTextChecks=158,oldFaithfulFigureChecks=56,chineseTocBlocks=18,noReReview=True,crossPageBookReviewPreserved=['nemata-jp-p2-b61','nemata-jp-p3-b23'])
def pointer(d,path):
 for token in path.split('/')[1:]:d=d[int(token)] if isinstance(d,list) else d[token.replace('~1','/').replace('~0','~')]
 return d
field_groups={}
for m in s['repairFieldMappings']:
 c=candidates[m['candidate']['sha256']];before=pointer(c,m['jsonPointer']);assert before==m['before'] and objsha(before)==m['beforeJsonSha256'];assert m['applied']==False
 field_groups.setdefault((m['candidate']['sha256'],m['jsonPointer']),[]).append(m)
assert len(s['repairFieldMappings'])==17 and len(field_groups)==13
# Retain overlapping model proposals verbatim. They are not an executable merged patch.
save('exact-field-evidence.json',dict(schema='coac244-frontmatter-unapplied-field-evidence/1',evidenceRows=17,uniquePinnedFields=13,overlapsAreNotMergedPatch=True,groups=[dict(candidateSha256=k[0],jsonPointer=k[1],proposals=v) for k,v in field_groups.items()],newModelCalls=0,candidateWrites=0))
cover317=s['sameImage']['secondCoverMapping'];assert cover317['reusePriorSameImageRuling'];assert not cover317['currentAscriptionMatchesRuling']
assert len(cover317['exactCandidateRepairs'])==2
f317=candidates[h['second']['candidates'][0]['sha256']]['figures'][5];assert f317['figureId']=='nemata-jp-p317-r6';assert s['sameImage']['sha256'] in f317['sourceImageSha256s']
p1=candidates[h['first']['candidates'][0]['sha256']]['figures'][3];assert p1['figureId']=='nemata-jp-p1-r4';assert s['sameImage']['sha256'] in p1['sourceImageSha256s']
triples=[m for m in s['repairFieldMappings'] if m['targetId']=='nemata-jp-p317-b5'];assert [m['jsonPointer'] for m in triples]==['/body/blocks/4/text','/body/blocks/4/inlineContent/0/text','/body/blocks/4/rawSlotText'];assert len({m['before'] for m in triples})==len({m['proposedAfter'] for m in triples})==1
assert '以暂定版形式公开' in triples[0]['proposedAfter'] and '新战术论' in triples[0]['proposedAfter'] and '结构或URL可能发生变更' in triples[0]['proposedAfter']
limited=s['limitedEvidenceOnly'];assert limited['figureId']=='nemata-jp-p2-r11' and limited['currentVerdict']=='faithful-with-unknown';assert len(limited['requiredLimits'])==3
assert sum(x['nonCoreToNearbyAuthorText'] for x in s['perFigure'])==5
per001=[x for x in s['perFigure'] if x['status']=='needs-repair'];assert len(per001)==4
logical001=[dict(targetId=x['figureId'],classification='independent-confirmed-non-core-but-current-transcription-needs-exact-repair',requiredUnknowns=x['unknowns'],mandatoryLimits=x['mandatoryLimits'],sourceReceipt=h['first']['receipt'],applied=False,independentSameImage=s['sameImage'] if x['figureId']=='nemata-jp-p1-r4' else None) for x in per001]
logical317=[dict(targetId='nemata-jp-p317-b5',classification='independent-confirmed-provisional-edition-translation-error',fieldMappings=triples,sourceReceipt=h['second']['receipt'],applied=False),dict(targetId='nemata-jp-p317-r6',classification='same-image-unknown-reuse-plus-current-ascription-repair',sourceReceipt=h['second']['receipt'],sameImageRuling=cover317,applied=False)]
for goal in logical001+logical317:
 independent=[i for part in ['first','second'] for i in h[part]['modelReview']['issues'] if i['targetId']==goal['targetId']]
 primary=next(i for i in independent if i['severity']=='error');goal.update(severity=primary['severity'],description=primary['description'],sourceEvidence=primary['evidence'],originalIndependentIssues=independent)
save('logical-repair-register.json',dict(schema='coac244-frontmatter-two-canonical-exact-targets/1',chapters=[dict(canonical='nemata-jp-chapter-001-64',candidates=h['first']['candidates'],remainingLogicalTargets=logical001,unchangedLimitedEvidence=limited),dict(canonical='nemata-jp-chapter-317-51',candidates=h['second']['candidates'],remainingLogicalTargets=logical317)],sixCoverUnknownsIndependentlyNonCore=True,currentRepairTargets=6,sourceCoverageDoesNotMeanSemanticPass=True,candidateWrites=0,newModelCalls=0,standardWholePagePassed=False,wholeChapterAccepted=False))
next001='两包独审已完成，不再待识字/付费复审。001仅p1-r4/p2-r15/p3-r1/p3-r3四图撤未经支持的确定微字/署名并补unknown，沿246现有合法精确修订路径保留父稿/原raw/158文字及非目标图；p2-r11当前faithful-with-unknown证据复用，保留微字/英文尾部/微牌unknown及书评书目正文。共享275de30a署名完整unknown，不选任何旧拼写。当前候选尚未完成合法修订/准入，整章不pass。此批独审2/2余0、制作0，禁止另识字或收费重审。'
next317='317仅b5三真实字段text/inlineContent[0].text/rawSlotText同步将暂时公开改为以暂定版形式公开，保留新战术论标题及结构/URL变更提示；r6复用同图275de30a独立裁决，撤两个署名备选/确定假名，署名、假名、宣传/January微字完整unknown。246沿已有合法精确修订入口保留其它31文本/21图及原raw，250只登记限定证据不放行四页；当前无新制作/复审/识字授权，不伪造整页pass。'
updates={source_handoff['chapters'][0]:(logical001,next001),source_handoff['chapters'][1]:(logical317,next317)}
evidence=dict(fullResults=bind(hp),summary=bind(sp),logicalRepairs=str(S/'logical-repair-register.json'),exactFieldEvidence=str(S/'exact-field-evidence.json'),limitedP2R11=limited,sameImageRuling=dict(sha256=s['sameImage']['sha256'],status='unknown',firstReceipt=h['first']['receipt'],secondReusesFirst=True),calls=calls,budget=dict(used=2,maximum=2,remaining=0,production=0,retry=0,failedVoid=0),wholeChapterAccepted=False,newModelCallsDuring244=0)
before_rows=[];after_rows=[]
for filename in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=P/'integration'/filename;before=load(path);after=copy.deepcopy(before)
 for row in after['rows']:
  if row['chapterId'] not in updates:continue
  goals,nxt=updates[row['chapterId']];prior=next(x for x in before['rows'] if x['chapterId']==row['chapterId']);before_rows.append(dict(register=filename,row=copy.deepcopy(prior)))
  row['historicalBeforeFrontmatterTargetReview']={k:copy.deepcopy(row.get(k)) for k in ['blockingIssues','nextAction','category','closurePlan']}
  row.update(blockingIssues=goals,effectiveFrontmatterRepairTargets=goals,frontmatterIndependentTargetEvidence=evidence,nextAction=nxt,wholeChapterPassed=False,sourceCoverageCompleteIsNotSemanticAcceptance=True)
  if filename.startswith('coac244-'):
   assert not row['covered'];row['category']='exact-frontmatter-repair-after-independent-noncore-unknown-ruling';row['modelCallsThisStage']=0
  if 'closurePlan'in row:row['closurePlan'].update(category='exact-frontmatter-repair-after-independent-noncore-unknown-ruling',nextAction=nxt,evidenceRegister=str(S/'logical-repair-register.json'),modelCallsThisStage=0)
  after_rows.append(dict(register=filename,row=copy.deepcopy(row)))
 for a,b in zip(before['rows'],after['rows']):
  if a['chapterId'] not in updates:assert a==b
 assert {k:v for k,v in before.items() if k!='rows'}=={k:v for k,v in after.items() if k!='rows'}
 assert load(path)==before;path.write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
save('register-selected-rows.before.json',before_rows);save('register-selected-rows.after.json',after_rows)
for p,ref in protected.items():assert bind(p)==ref,p
save('verification.json',dict(schema='coac244-frontmatter-zero-model-intake/1',calls=calls,packageFiles=len(manifest['files']),runtimeFiles=len(runtime['files']),protectedInputsUnchanged=len(protected),protectedInputs=list(protected.values()),sourceBlocks=226,inheritedFaithfulTexts=158,inheritedOtherFigures=56,chineseTocBlocks=18,rawFieldMappings=17,uniqueCandidateFields=13,logicalRepairs=6,limitedP2R11=limited,originalReceiptsRemainNeedsRepair=True,newModelCalls=0,newProductionCalls=0,newCandidates=0,newConsumers=0,oldRawOrModelVerdictsChanged=False,coverageCountsChanged=False,standardWholePagePassed=False,wholeChapterAccepted=False))
save('handoff.json',dict(schema='coac244-frontmatter-target-intake-recorded/1',canonical=list(updates),evidence=evidence,owner='COAC-246 existing same-stage run01a17f90-d809-763d-bb25-7b426d1523a9',integrationOwner='COAC-250 existing issue, no new consumer',next={k:v[1] for k,v in updates.items()},newModelCalls=0,newCandidates=0,newConsumerOrWakeup=False,formalActiveChanged=False))
for n,p in [('249-results.json',hp),('249-summary.json',sp)]:shutil.copy2(p,O/n)
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
print(json.dumps(dict(protectedUnchanged=len(protected),packageFiles=len(manifest['files']),runtimeFiles=len(runtime['files']),logicalRepairs=6,uniqueFields=13,callsUsed=2,newCalls=0),ensure_ascii=False))
