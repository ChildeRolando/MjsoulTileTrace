import json,pathlib,hashlib,collections,shutil
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');O=pathlib.Path(__file__).resolve().parent
S=P/'integration/coac244-next3-zero-20261028';S.mkdir(exist_ok=False)
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(n,d):
 t=json.dumps(d,ensure_ascii=False,indent=2)+'\n';(O/n).write_text(t,encoding='utf-8');(S/n).write_text(t,encoding='utf-8')
up=P/'integration/coac250-unified-chapter-register-20261027b.json';u=load(up)
selected=['nemata-jp-chapter-100-1','79-cn-chapter-159-9','79-cn-chapter-242-3']
excluded=['nemata-jp-chapter-183-1','nemata-jp-chapter-236-1','79-cn-chapter-217-4','79-cn-chapter-222-5','nemata-jp-chapter-283-1']
rows={r['chapterId']:r for r in u['rows']}
save('remaining-universe.json',dict(register=bind(up),counts=u['counts'],allOriginalCanonicalCount=len(rows),uncovered=[dict(chapterId=r['chapterId'],title=r['title'],covered=r['covered'],verdict=r['verdict'],units=r['units'],selectedForThisZeroStage=r['chapterId'] in selected,excludedAsAcceptedOrInFlight=r['chapterId'] in excluded) for r in u['rows'] if not r['covered']],metadataCanonical=[dict(chapterId=rows[i]['chapterId'],title=rows[i]['title'],covered=rows[i]['covered'],scope='cover/table-of-contents/preface/source-notes/appendix-material retained as original content; do not drop from256 denominator or downgrade prose to navigation') for i in ['nemata-jp-chapter-001-64','nemata-jp-chapter-317-51']],note='232/256 current coverage is partial, not textbook completion. All303 original units and21212 original source blocks remain denominator. Appendix/navigation ownership is checked separately below.',selected=selected,excluded=excluded,newModelCalls=0))
for canonical in selected:
 r=rows[canonical];assert not r['covered'];e=r['existingCandidate'];cp=P/e['path'];c=load(cp);sp=P/c['source']['sourcePath'];s=load(sp);ap=P/e['auditPath'];a=load(ap)
 assert bind(cp)['sha256']==e['sha256'];assert bind(sp)['sha256']==c['source']['sourceSha256'];assert a['production']['sha256']==e['sha256']
 callproof=[]
 for call in a['calls']:
  rawpath=P/'audit/calls'/(call['callId']+'.json');raw=load(rawpath)
  assert raw['binding']==call['binding'];assert raw['binding']['productionSha256']==e['sha256'];assert hashlib.sha256(raw['rawLastMessage'].encode()).hexdigest()==call['outputSha256'];assert raw.get('success',True)
  callproof.append(dict(call=call,raw=bind(rawpath),rawKeys=list(raw),requestImageCount=len(raw.get('requestExecution',{}).get('images',[])) if raw.get('requestExecution') else None,payloadImageAssetIds=call.get('binding',{}).get('originalImageAssetIds',[]),remoteBackend='unverified; recorded request/raw only'))
 rawfiles=[dict(binding=bind(p),status=load(p)['status'],calls=[x['callId'] for x in load(p).get('calls',[])]) for p in ap.parent.glob(s['articleId']+'.'+e['sha256']+'*.json')]
 rec=dict(canonical=canonical,candidate=bind(cp),source=bind(sp),audit=bind(ap),auditStatus=a['status'],method=a['method'],bodyBlocks=len(c['body']['blocks']),figures=len(c['figures']),calls=callproof,sameShaAuditFiles=rawfiles,modelReview=a['modelReview'],newModelCalls=0,sourceData=s,candidateData=c)
 if canonical.endswith('100-1'):
  rec['batchReviews']=a['batchReviews'];rec['productionPlan']=c['provenance']['batches'];save('100-input.json',rec)
  print('100',[(b['group']['batchId'],b['status'],len(b['group']['sourceBlockIds'])) for b in a['batchReviews']])
 else:
  target='b0013:figure' if '159-9' in canonical else 'b0014:figure';f=next(f for f in c['figures'] if f['figureId'].endswith(target));rec['targetFigure']=f;rec['originalImage']=bind(P/f['sourceAssetBindings'][0]['path']);save(('159' if '159-9' in canonical else '242')+'-input.json',rec)
  image=O/(('159' if '159-9' in canonical else '242')+'-original'+pathlib.Path(f['sourceAssetBindings'][0]['path']).suffix);shutil.copy2(P/f['sourceAssetBindings'][0]['path'],image)
  print(canonical,'audit',a['status'],'rawcalls',len(a['calls']),'target',f['figureId'],'image',str(image),'issues',len([i for i in a['modelReview']['issues'] if i['severity']!='source-note']))
(O/'.gitattributes').write_text('* -text\n',encoding='utf-8')
