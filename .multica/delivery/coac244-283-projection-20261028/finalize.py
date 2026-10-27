import json,pathlib,hashlib,shutil,copy
from bs4 import BeautifulSoup
O=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(n,x):
 text=json.dumps(x,ensure_ascii=False,indent=2)+'\n'
 (O/n).write_text(text,encoding='utf-8');(S/n).write_text(text,encoding='utf-8')
cfg=load(O/'input.json');P=pathlib.Path(cfg['root']);S=pathlib.Path(cfg['shared']);stage=S/'diagnostic-tables'
s=cfg['source'];c=load(pathlib.Path(cfg['dependencies'][0]['path']));a=load(pathlib.Path(cfg['dependencies'][2]['path']))
pack=load(O/'semantic-target-packets.json');targets=[]
for lo,hi,name,target in [(93,114,'Q8-external-scenario','b0099'),(151,196,'Q12-b0168-condition','b0168')]:
 ids={f'modern-yabejp-ja:chapter06-exercise003:b{i:04}' for i in range(lo,hi)}
 figs=[f for f in c['figures'] if set(f['sourceBlockIds'])&ids]
 assets={b['path']:b['sha256'] for f in figs for b in f['sourceAssetBindings']}
 deps=[bind(P/p) for p in assets]
 assert all(d['sha256']==assets[str(pathlib.Path(d['path']).relative_to(P)).replace('\\','/')] for d in deps)
 targets.append(dict(name=name,completeQuestionSourceBlockRange=[f'b{lo:04}',f'b{hi-1:04}'],sourceBlocks=[b for b in s['blocks'] if b['id'] in ids],candidateBlocks=[b for b in c['body']['blocks'] if set(b['sourceBlockIds'])&ids],candidateFigures=figs,imageDependencies=deps,oldIssues=[i for i in a['modelReview']['issues'] if i.get('targetId','').endswith(target)]))
pack['targets']=targets;save('semantic-target-packets.json',pack)
bs=load(stage/'textbook-bodies.json')['chapters'][0]['blocks']
html=BeautifulSoup((stage/'knowledge.html').read_text(encoding='utf-8'),'html.parser')
tables=html.select('table.source-table');assert len(tables)==6
for st,ht in zip(s['tables'],tables):
 assert ht['data-table-id']==st['tableId']
 for row in st['rows']:
  for cell in row['cells']:
   hc=ht.select(f'[data-table-row="{cell["row"]}"][data-table-column="{cell["column"]}"]');assert len(hc)==1
   assert hc[0].name==('th' if cell['header'] else 'td')
   if cell['empty']:assert '（原表空白单元格）' in hc[0].get_text()
   if cell['rawText']=='↓':assert '↓' in hc[0].get_text()
save('html-render-check.json',dict(tables=6,cells=248,empty=117,arrows=13,allPositionsExact=True,method='Parse actual generated knowledge.html table DOM; not a browser screenshot or live Arena UI inspection.',html=bind(stage/'knowledge.html'),modelCalls=0))
for n in ['mcp-validation.json','mcp-read-example.json','mcp-config.json','mcp-build.json']:
 shutil.copy2(stage/n,O/n)
assert load(stage/'mcp-validation.json')['exactImageCount']==94
v=load(O/'verification.json');v['mcpExactReadback']=True;v['mcpImageShaChecks']=94;v['htmlCellGeometryExact']=True;save('verification.json',v)
changes=[]
for d in cfg['dependencies']:
 now=bind(pathlib.Path(d['path']));assert now['sha256']==d['sha256'];changes.append(now)
save('immutability-final.json',dict(allSourceCandidateAuditAnd94ImageBindingsUnchanged=True,dependencies=changes,newModelCalls=0))
nextsteps=dict(canonical=cfg['canonical'],newCallsThisStage=0,acceptedChapter=False,displayClosure='248 actual cells /117 source-empty slots /13 arrows /94 exact images survive HTML DOM, MCP and Arena tool read; navigation-only diagnostic, not a chapter-pass.',presentationReview=dict(target='six table geometries and candidate figure tableContext omission only',input='specific-table-review-input.json',producerCalls=0,independentReviewCalls=1,retry=0,totalRequestedNewCalls=1,condition='only after authorization; table-target contract must consume explicit v3; preserve all other old errors/uncertain; no synthetic pass.'),conditionRepair=dict(target='modern-yabejp-ja:chapter06-exercise003:b0168',before='摸到后再改为③即可，（由于摸入宝牌',proposedOnlyNotProduced='摸到后再改为③即可，（由于摸入宝牌或',unchanged='all other1194 body blocks, figures, source and old raw; keep sourceImages b0153 北 /b0169 四索 and entire Q12 b0151–b0195 in review',oldEvidence='same-SHA audit error b0168, not uncertain',makerCalls=1,independentAuditCalls=1,retry=0,totalRequestedNewCalls=2),q8=dict(target='modern-yabejp-ja:chapter06-exercise003:b0099',status='uncertain retained',sourceRange='b0093–b0113',missing='Referenced 2007-03 original scenario image/full transcription: visible 1s/2s counts, full exposed meld composition, exact four-player scores; current source gives west player behind and east chi8m at turn6 only.',url='http://www.ma-jan.or.jp/jan-up/nanikiru0703q.php',localSearch='web-sources/v1 JSON contains only source.json and source.v3.json anchor references, no stored target response found; not a claim that the external source no longer exists.',next='0-model obtain/bind original referenced source first; do not spend audit on anchor-only packet.',conditionalFirstIndependentReviewCalls=1,notAuthorizedNow=True),otherOldIssuesPreserved=[i for i in a['modelReview']['issues'] if i.get('targetId','').endswith(('b0396','b0962','b1017','b1181','b0785:figure','b0947:figure'))],nextFiniteBatchRequestedTotal=3,monetaryCost='unknown; no price estimate or paid request executed',noChapterCoverageIncrement=True)
save('next-actions.json',nextsteps)
for n in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 path=P/'integration'/n;before=path.read_bytes();data=load(path)
 def update(x):
  if isinstance(x,dict):
   if x.get('chapterId')==cfg['canonical']:
    x['presentationDiagnostic']=dict(receipt=bind(S/'verification.json'),projectionEvidence=bind(S/'specific-table-review-input.json'),nextActions=bind(S/'next-actions.json'),status='presentation-verified-semantic-review-not-upgraded',newModelCalls=0)
    text='6表248格/117空白/13箭头/94图已在真实MCP/Arena保留；旧4次请求漏94个候选figure坐标，显式v3补证包已备。已pass batch010 b1022–b1134共113块复用。Q8先0调用找外链原场况；b0168精确或条件须合法maker1+独审1；表格专项独审1另列，建议下批合计3call、0retry，当前0call且covered不变。其余旧语义/图争议不变。'
    if 'nextAction' in x:x['nextAction']=text
    if 'closurePlan' in x:x['closurePlan']['nextAction']=text
    return
   for v in x.values():update(v)
  elif isinstance(x,list):
   for v in x:update(v)
 update(data)
 (O/(n+'.before')).write_bytes(before)
 path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 shutil.copy2(path,O/n)
save('stage-files.json',dict(files=[bind(p) for p in stage.rglob('*') if p.is_file()],newModelCalls=0))
print(json.dumps(dict(displayClosed=True,chapterAccepted=False,newCalls=0,proposedNextCalls=3,remainingSemanticTargets=['b0099','b0168','b0396','b0785:figure','b0947:figure','b0962','b1017','b1181'])))
