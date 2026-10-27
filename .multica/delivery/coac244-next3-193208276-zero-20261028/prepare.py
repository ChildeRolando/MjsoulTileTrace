"""Bounded evidence preparation only. No model invocation or candidate/raw writes."""
import copy, hashlib, json, pathlib, shutil
from PIL import Image

P=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
O=pathlib.Path(__file__).resolve().parent
S=P/'integration/coac244-next3-193208276-zero-20261028'
S.mkdir(exist_ok=True)
def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
def sha(b): return hashlib.sha256(b).hexdigest()
def bind(p):
 p=pathlib.Path(p); return dict(path=str(p),sha256=sha(p.read_bytes()),bytes=p.stat().st_size)
def objsha(x): return sha(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode())
def save(n,d):
 (O/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def copyin(p,n): shutil.copy2(p,O/n); return bind(p)

register=P/'integration/coac250-unified-chapter-register-20261027b.json'
u=load(register); remaining=[r for r in u['rows'] if not r['covered']]
selected=['79-cn-chapter-193-4','79-cn-chapter-208-4','79-cn-chapter-276-4']
excluded=['79-cn-chapter-217-4','nemata-jp-chapter-283-1','nemata-jp-chapter-001-64','nemata-jp-chapter-317-51']
assert all(any(r['chapterId']==c for r in remaining) for c in selected)
save('remaining-universe.json',dict(register=bind(register),counts=u['counts'],uncovered=[dict(canonical=r['chapterId'],title=r['title'],units=r['units'],selected=r['chapterId'] in selected,excludedInFlight=r['chapterId'] in excluded) for r in remaining],selected=selected,excluded=excluded,metadataRetained=['nemata-jp-chapter-001-64','nemata-jp-chapter-317-51'],warning='Historical produced-needs-repair is not proof of a current complete lawful candidate. Directory/preface/appendix remain in original denominator.',newModelCalls=0))
ledger=load(P/'audit/calls.jsonl') if False else [json.loads(x) for x in (P/'audit/calls.jsonl').read_text(encoding='utf-8-sig').splitlines() if x.strip()]
protected={}
allpackets=[]
specs=[
 ('193','cv1765377','display','e08cf7cfef4777643809971a71347c587ffe14534873d7cac2be65be42885e5e',[
  ('b0042','right-row2-col2',[298,153,325,175],[270,130,329,196],'右家牌河第2行右列万子；邻左2z，上方红圈5m；仅定位，不预判点数')]),
 ('208','cv1770245','display','0fc086828eb0fb2784e45d60e4a0585af477877c71b2b82630747a87755f6e97',[
  ('b0004','upper-row1-leftmost',[154,101,178,132],[152,73,290,136],'上家牌河靠中央第一排屏幕最左万子，倒置；不要与第二排9p混淆'),
  ('b0006','left-central-2',[111,177,139,201],[81,151,141,296],'左家靠中央列从上数第2张万子A'),
  ('b0006','left-central-5',[111,246,139,270],[81,151,141,296],'左家靠中央列从上数第5张万子B'),
  ('b0006','right-outer-bottom',[326,258,354,281],[295,240,356,284],'右家第二列、最下方2z右侧万子C')]),
 ('276','cv1793434','r2.display','94b2d56a65a3c253fcefd88c59c1f8363c71afeda8b957fd35c20b2ad6040abd',[
  ('b0005','left-4',[145,244,175,267],[143,175,176,314],'左家牌河从上数第4张风牌'),
  ('b0005','left-5',[145,268,175,291],[143,175,176,314],'左家牌河从上数第5张风牌'),
  ('b0005','right-2',[315,201,345,225],[313,174,347,315],'右家牌河从上数第2张风牌'),
  ('b0005','right-5',[315,273,345,297],[313,174,347,315],'右家牌河从上数第5张风牌')])]
for key,article,variant,digest,points in specs:
 canonical=next(c for c in selected if c.split('-')[3]==key)
 cp=P/f'web-production/v1/candidates/79-bilibili-cn/{article}.{variant}.json'
 ap=P/f'audit/web/articles/79-bilibili-cn/{article}.{digest}.json'
 c=load(cp); a=load(ap); sp=P/c['source']['sourcePath']; source=load(sp)
 assert bind(cp)['sha256']==digest==a['production']['sha256']
 assert bind(sp)['sha256']==c['source']['sourceSha256']
 inputs=[]
 for p,n in [(cp,key+'-candidate.json'),(ap,key+'-old-audit.json'),(sp,key+'-source.json')]:
  protected[str(p)]=bind(p); copyin(p,n);inputs.append(dict(role=n,binding=bind(p),copy=n))
 calls=[]
 for call in a['calls']:
  rp=P/f"audit/calls/{call['callId']}.json";raw=load(rp);protected[str(rp)]=bind(rp)
  assert raw['binding']==call['binding'] and raw['binding']['productionSha256']==digest
  assert sha(raw['rawLastMessage'].encode())==call['outputSha256']
  assert json.loads(raw['rawLastMessage'])==raw['output']==a['modelReview']
  assert raw['success'] and raw['exitCode']==0 and not raw['timedOut']
  assert sum(x['callId']==call['callId'] for x in ledger)==1
  copyin(rp,key+'-old-raw.json')
  calls.append(dict(call=call,raw=bind(rp),rawCopy=key+'-old-raw.json',requestExecution=raw.get('requestExecution'),legacyEvidenceBoundary='When requestExecution absent, legacy binding+supplementalInputs+full prompt/output prove recorded source scope, not captured actual argv or remote weights. Do not infer zero image payload from missing requestExecution.'))
 targetids=list(dict.fromkeys(f'79-bilibili-cn:{article}:{b}:figure' for b,*_ in points))
 targets=[f for f in c['figures'] if f['figureId'] in targetids]
 images=[]; assets={}; pts=[]
 for f in targets:
  assert len(f['sourceAssetBindings'])==1
  asset=f['sourceAssetBindings'][0];p=P/asset['path'];assert bind(p)['sha256']==asset['sha256'];protected[str(p)]=bind(p)
  im=Image.open(p).convert('RGBA');name=key+'-'+f['figureId'].split(':')[-2]+'-original'+p.suffix;copyin(p,name)
  entry=dict(figureId=f['figureId'],asset=asset,original=bind(p),copy=name,nativeSize=list(im.size));assets[f['figureId']]=entry
  images.append(str(S/name))
  for b,label,box,nb,loc in points:
   if not f['figureId'].endswith(':'+b+':figure'):continue
   derived=[]
   for role,bbox in [('target',box),('neighbors',nb)]:
    assert 0<=bbox[0]<bbox[2]<=im.width and 0<=bbox[1]<bbox[3]<=im.height
    crop=im.crop(bbox);n=key+'-'+label+'-'+role+'.png';crop.save(O/n)
    assert Image.open(O/n).convert('RGBA').tobytes()==crop.tobytes()
    big=crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST);xn=key+'-'+label+'-'+role+'-x4.png';big.save(O/xn)
    out=Image.open(O/xn).convert('RGBA')
    assert all(out.getpixel((x,y))==crop.getpixel((x//4,y//4)) for y in range(out.height) for x in range(out.width))
    derived.append(dict(role=role,bbox=bbox,copy=n,sha256=sha((O/n).read_bytes()),rgbaSha256=sha(crop.tobytes()),nearest4=xn,nearest4Sha256=sha((O/xn).read_bytes()),resampling='nearest',everyPixelVerified=True))
    images.append(str(S/xn))
   pts.append(dict(id=label,figureId=f['figureId'],location=loc,bbox=box,neighborBBox=nb,derivations=derived,tileReading=None))
 # Repeated neighbor region is only attached once, while every point retains its mapping.
 unique=[];seen=set()
 for p in images:
  h=sha((O/pathlib.Path(p).name).read_bytes())
  if h not in seen:unique.append(p);seen.add(h)
 same=[dict(binding=bind(p),status=load(p)['status'],callIds=[x['callId'] for x in load(p).get('calls',[])]) for p in ap.parent.glob(article+'.'+digest+'*.json')]
 packet=dict(schema='coac244-next-source-impact-packet/1',canonical=canonical,candidate=bind(cp),source=bind(sp),audit=bind(ap),oldStatus=a['status'],sameShaAudits=same,oldCalls=calls,sourceData=source,candidateData=c,oldModelReview=a['modelReview'],targetFigureIds=targetids,targetFigures=targets,points=pts,assets=list(assets.values()),orderedImages=unique,sourceContext=source['blocks'],candidateContext=c['body']['blocks'],contextPolicy='All original ordered source blocks incl tableContext/segments/conditions, and all candidate prose/figures for context; only explicit targetFigureIds/points receive new judgments. No non-target re-review.',classification='actual unresolved source reading / teaching-impact evidence absent; not a missing image file or source text rewrite',existingIndependentLimitedUnknownPermission=False,admissionGranted=False,wholeChapterPassed=False,newModelCalls=0,next=dict(owner='COAC-249 existing audit consumer after explicit new budget; no dispatch now',entry='prepare-requests.mjs -> prepared shared request.json; then existing frozen invokeTextbookCodex and standard audit ledger/raw under existing guard',firstIndependentCalls=1,productionCalls=0,retries=0,failedVoidCount=True,scope='Read listed points if possible; if not, independently distinguish faithful author-argument-with-unknown from unproved tactical replay, stating precise conditions and limits. No forced known reading or automatic pass.',laterMutation='If independent read requires correction, propose separately bounded lawful producer1+target-audit1; these are not included or authorized in the 3-call diagnostic proposal.'))
 save(key+'-packet.json',packet);allpackets.append(packet)

# Bind existing PDF193 supplement instead of pretending missing website characters were repaired.
supp=P/'integration/coac244-scope215-pdf193-20261028/193-reuse-receipt.json'
sd=load(supp);assert sd['parent']['sha256'].startswith('046188e3')
copyin(supp,'193-existing-pdf-supplement.json')
copyin(P/'integration/coac250-193-supplement-coverage-20261028.json','193-existing-integration.json')

# Exact unchanged figure and body inheritance resolves only the two old input-visibility gaps.
parent=P/'web-production/v1/candidates/79-bilibili-cn/cv1793434.display.json'
pa=P/'audit/web/articles/79-bilibili-cn/cv1793434.34cd6f77ec400bacdfaf0e51c20d700e0add78523583949392f7a056f148e3af.json'
rp=P/'audit/calls/4ad05d19-eb5a-48d6-ba09-c673553ec204.json'
for p,n in [(parent,'276-parent-candidate.json'),(pa,'276-parent-audit.json'),(rp,'276-parent-raw.json')]:protected[str(p)]=bind(p);copyin(p,n)
pc=load(parent);pr=load(pa);raw=load(rp);current=allpackets[2]['candidateData']
def verify_inheritance(pc,current,pr,raw):
 assert pc['body']==current['body'],'body_changed'
 assert pr['production']['sha256']==sha(parent.read_bytes()),'parent_binding'
 assert raw['binding']['productionSha256']==pr['production']['sha256'],'raw_parent_binding'
 assert json.loads(raw['rawLastMessage'])==raw['output']==pr['modelReview'],'raw_output_mismatch'
 assert sha(raw['rawLastMessage'].encode())==pr['calls'][0]['outputSha256'],'raw_hash'
 assert raw['success'] and raw['exitCode']==0 and not raw['timedOut'],'raw_failed'
 out=[]
 for b in ['b0014','b0025']:
  fid=f'79-bilibili-cn:cv1793434:{b}:figure';f=next(x for x in pc['figures'] if x['figureId']==fid);g=next(x for x in current['figures'] if x['figureId']==fid)
  assert f==g,'figure_object_changed'
  check=next(x for x in raw['output']['figureChecks'] if x['id']==fid)
  assert check['verdict']=='faithful','parent_not_faithful'
  assert not any(x['targetId']==fid and x['severity']!='source-note' for x in raw['output']['issues']),'parent_blocked'
  for asset in f['sourceAssetBindings']:
   assert bind(P/asset['path'])['sha256']==asset['sha256'],'source_asset_changed'
   assert asset['assetId'] in raw['binding']['originalImageAssetIds'],'parent_image_not_bound'
   assert any(x['sourceSha256']==asset['sha256'] for x in raw['binding']['supplementalInputs']),'parent_image_input_missing'
  out.append(dict(figureId=fid,fullObjectSha256=objsha(f),parentCheck=check,bodyContextSha256=objsha(pc['body']),status='reusable-parent-independent-faithful-check-only',newRawConclusionPreserved='uncertain',wholeChapterPassed=False))
 return out
proof=verify_inheritance(pc,current,pr,raw);checks=[dict(name='real bound parent raw + exact full figures + unchanged full body',passed=True)]
for name in ['changed body','changed figure','changed source binding','removed unknown field','parent output differs','parent not faithful','parent image absent','parent failed']:
 x,y,z,w=copy.deepcopy((pc,current,pr,raw))
 if name=='changed body':y['body']['flowOrder']+='x'
 if name=='changed figure':y['figures'][1]['transcription']+='x'
 if name=='changed source binding':y['figures'][1]['sourceAssetBindings'][0]['sha256']='0'*64
 if name=='removed unknown field':y['figures'][1].pop('unknowns')
 if name=='parent output differs':w['output']['summary']+='x'
 if name=='parent not faithful':z['modelReview']['figureChecks'][1]['verdict']='uncertain'
 if name=='parent image absent':w['binding']['originalImageAssetIds']=[]
 if name=='parent failed':w['success']=False
 try:verify_inheritance(x,y,z,w)
 except (AssertionError,KeyError,StopIteration):checks.append(dict(name='reject '+name,passed=True))
 else:raise AssertionError('negative accepted: '+name)
save('276-inheritance-proof.json',dict(schema='coac244-276-exact-parent-evidence-reuse/1',canonical=selected[2],candidate=allpackets[2]['candidate'],parent=bind(parent),parentAudit=bind(pa),parentRaw=bind(rp),parentCallId=raw['callId'],rawEvidenceBoundary='Legacy independent output, full source binding and ordered supplemental inputs retained. Original process argv not captured; no claim of newly reconstructed transport or remote weights.',bodyExact=True,figures=proof,tests=checks,status='two-evidence-visibility-gaps-supplemented-not-chapter-pass',remaining=[i for i in allpackets[2]['oldModelReview']['issues'] if i['severity']!='source-note' and ':b0005:' in i['targetId']],newModelCalls=0,admissionGranted=False))
save('protected-inputs.json',list(protected.values()))
assert all(bind(p)==v for p,v in protected.items())
save('handoff.json',dict(schema='coac244-next3-zero-193208276/1',newModelCalls=0,newAcceptedChapters=0,canonical=selected,packets=[k+'-packet.json' for k in ['193','208','276']],resolvedEvidenceOnly=['276 b0014/b0025 unchanged full object/body; actual parent independent per-tile raw recovered'],minimumNextBatch=dict(production=0,independentRecognitionAndImpact=3,totalNewCallsMaximum=3,perChapter=1,retry=0,failedVoidCount=True,authorized=False,model='gpt-6.1-terra',reasoningEffort='max',money='unknown; no tariff or remote upstream execution evidence'),notSelected256=dict(canonical='79-cn-chapter-256-18',candidateSha256='56ea08c0868e87628f61a777a35c40a9a8372bddfcca23a7daef6be3a3bdafe2',actualError='b0016 hand tile12 between7s/9s independently read8s; current placeholder remains. Only this transcription token and matching unknown are potential future repair targets, not obsolete base seat error.',remainingUnknown='upper river second row Manzu right of1p; right river central column top Souzu',next='Separate lawful maker1+target-audit1 proposal after 3-chapter stage; no current new call.'),timeout234=dict(canonical='79-cn-chapter-234-12',status='900s timeout; local attempt known, remote upstream execution/fee unknown; no complete output recovered in prior diagnostic',next='Separately inspect original transport/session terminal and ledger before any budget proposal; no blind retry or borrowing old audit quota.'),universe='remaining-universe.json'))
for p in O.iterdir():
 if p.is_file():shutil.copy2(p,S/p.name)
print(json.dumps(dict(selected=selected,remaining=len(remaining),images=[len(x['orderedImages']) for x in allpackets],inheritanceChecks=len(checks),modelCalls=0),ensure_ascii=False))
