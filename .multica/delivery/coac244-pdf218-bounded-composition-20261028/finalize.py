import copy,json,pathlib,hashlib,shutil
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent;S=P/'integration/coac244-pdf218-bounded-composition-20261028'
def load(p):return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def bind(p):p=pathlib.Path(p);return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(p,d):pathlib.Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
ip=P/'integration/coac250-pdf217-limited-display-intake-20261028.json';intake=load(ip)
assert bind(ip)['sha256']=='cecd437df94723e31a4a9d0a862f1ba9793faa822acfe6477c9a6a4186780e60'
assert intake['allPassed'] and intake['sourceBlocks']==22 and intake['compiledBlocks']==24 and intake['figures']==4
assert intake['displayLimitations']==7 and intake['exactSourceQuoteMappings']==18 and not intake['ordinaryFullPagePass']
work=pathlib.Path('C:/Users/Roland/multica_workspaces_desktop-api.multica.ai/coach-rolan-2123e9a3b805/coac-250-21b1447b360f/worktree')
rp=work/intake['readback']['path'];assert bind(rp)['sha256']==intake['readback']['sha256'];r=load(rp)
assert r['allPassed'] and r['allSevenLimitsActuallyReadBack'] and r['mandatory217NoteActuallyReadBack'] and r['authorBodyAndFiguresExact']
assert r['allSourceIdsOrderedOnce'] and r['sourceCollisions']==0 and r['rawClaimsUncertain']==5 and r['arena']['exactBody']
assert r['arena']['targetReads']==[dict(offset=0,blocks=24,next=None,bytes=12562,sourceRefs=1)]
assert len(r['images'])==4 and all(x['mcpBytesExact'] for x in r['images'])
selection=P/'integration/specific-web-variant-selection.v29.json';assert bind(selection)['sha256']==intake['selection']['sha256']
u=load(P/'integration/coac250-unified-chapter-register-20261027b.json');ur=next(x for x in u['rows'] if x['chapterId']=='79-cn-chapter-217-4');assert ur['covered']
assert u['counts']['effectiveCoveredOriginalChapters']==238 and u['counts']['effectiveUncoveredOriginalChapters']==18
owner=P/'integration/coac244-remaining26-closure-register-20261028.json';o=load(owner);orr=next(x for x in o['rows'] if x['chapterId']=='79-cn-chapter-217-4');assert orr['covered'] and orr['wholeChapterAcceptedForLimitedDisplay'] and not orr['standardWholePagePassed']
copy_refs=[(ip,'250-final-intake.json'),(rp,'250-real-mcp-arena-readback.json'),(work/'_analysis/coac250-217-display/display-tests.json','250-display-tests.json'),(work/'_analysis/coac250-217-display/persisted-route-verification.json','250-persisted-route-verification.json')]
for p,n in copy_refs:shutil.copy2(p,O/n)
e=load(O/'composition-evidence.json')
for f in e['protectedInputs']:assert bind(f['path'])['sha256']==f['sha256']
e.update(realMcpArenaReadback=dict(owner='COAC-250 existing run01a17f84-6d24-79e1-83a0-21b1447b360f',intake=bind(ip),readback=bind(rp),allSevenLimitsActuallyReadBack=True,mandatory217NoteActuallyReadBack=True,chapterSourceBlocks=22,compiledBlocks=24,figures=4,fullMcp=r['fullMcp'],arena=r['arena']),effectiveChapterCoveredForExactLimitedAuthorDisplay=True,ordinaryFullPage218Passed=False,wholeChapterAcceptedByThisEvidence=False,note='Coverage and limited chapter acceptance are already written by250 from exact complete source scope + independent bounds + real MCP/Arena. This244 proof reuses those results; it does not manufacture an ordinary whole-page pass or alter model uncertain.')
save(O/'composition-evidence.json',e)
next_action='v29已按精确218 df8f2de3限定作者论证+7条原独审非原文限制、217成对注、219已有同SHA限定证据及220既有pass装配；250真实MCP/Arena读全22源块/24展示块/4图通过，原章已covered。5条claim uncertain及实际事实unknown保留，不派新制作/识字/复审，不再列218为未修。普通217/218/219整页pass仍false，正式active未切。'
#250 owns master coverage; it has already updated the main owner and unified register.
# Repair only the stale continuation row, preserving historical issues and every other row/count.
cp=P/'integration/coac250-uncovered-chapter-continuation-register-20261027b.json';before=load(cp);after=copy.deepcopy(before);row=next(x for x in after['rows'] if x['chapterId']=='79-cn-chapter-217-4')
for k in ['blockingIssues','effectivePdfRouteBlockingIssues']:
 if row.get(k):row['historical'+k[0].upper()+k[1:]+'Before218BoundedComposition']=row[k]
 row[k]=[]
row.update(effectiveOriginalChapterCovered=True,currentRepairRoute='accepted-pdf217220-exact-limited-author-display-v29',nextAction=next_action,wholeChapterPassed=False,wholeChapterAcceptedForLimitedDisplay=True,standardWholePagePassed=False,pdf218BoundedCompositionEvidence=dict(path=str(S/'composition-evidence.json'),sha256=bind(O/'composition-evidence.json')['sha256']),pdf217BoundedDisplayIntake=bind(ip),retained218Uncertain=e['uncertainClaimsUnchanged'])
row['closurePlan'].update(category='covered-exact-limited-pdf-author-display',nextAction=next_action,modelCallsThisStage=0,evidenceRegister=str(S/'composition-evidence.json'))
for a,b in zip(before['rows'],after['rows']):
 if a['chapterId']!='79-cn-chapter-217-4':assert a==b
assert {k:v for k,v in before.items() if k!='rows'}=={k:v for k,v in after.items() if k!='rows'}
shutil.copy2(cp,O/'continuation.before.json');assert load(cp)==before;save(cp,after);shutil.copy2(cp,O/'continuation.after.json')
save(O/'register-update.json',dict(canonical='79-cn-chapter-217-4',mainOwnerAlreadyUpdatedBy250=bind(owner),unifiedAlreadyUpdatedBy250=bind(P/'integration/coac250-unified-chapter-register-20261027b.json'),continuationAfter=bind(cp),onlyRowChanged='79-cn-chapter-217-4',masterCountsChangedBy244=False,rawVerdictsChanged=False))
save(O/'handoff.json',dict(schema='coac244-pdf218-bounded-composition-recorded/1',canonical='79-cn-chapter-217-4',candidate=e['candidate'],composition=bind(O/'composition-evidence.json'),sharedComposition=str(S/'composition-evidence.json'),intake=bind(ip),realReadback=bind(rp),coverage=intake['coverage'],remainingOriginalChapters=18,standardWholePage218Passed=False,originalReceiptStatus='needs-repair',uncertainClaims=5,displayLimits=7,sourceQuoteMappings=18,ownedSourceBlocks=22,compiledBlocks=24,figures=4,checks244=22,checks250=intake['negativeDisplayTests'],newModelCalls=0,newProductionCalls=0,newConsumers=0,noNewWakeup=True,formalActiveChanged=False,next='复用250已经完成的v29集成/真实MCP-Arena读回；无需重复启动或等待218。其它18章依各自既有票继续。'))
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
files=[dict(path=p.name,sha256=bind(p)['sha256'],bytes=p.stat().st_size) for p in sorted(O.iterdir()) if p.is_file() and p.name!='manifest.json']
save(O/'manifest.json',dict(schema='coac244-pdf218-evidence-manifest/1',files=files,newModelCalls=0));shutil.copy2(O/'manifest.json',S/'manifest.json')
print(json.dumps(dict(coverage=intake['coverage'],remaining=18,newModelCalls=0,rawStatus='needs-repair',limitsActuallyReadBack=7,protectedInputs=len(e['protectedInputs'])),ensure_ascii=False))
