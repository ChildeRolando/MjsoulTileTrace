"""Read-only root localization and evidence check; never invokes a model."""
from pathlib import Path
import copy, hashlib, json, re, subprocess
from PIL import Image
import fitz

P=Path('E:/AgentData/Coach/knowledge/processing')
D=P/'integration/coac269-p257-twenty-check-v2-20261028'
R=P/'integration/coac244-p257-twenty-root-check-20261028'
R.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(name,data):
 (R/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def check_ref(x):
 p=Path(x['path']);assert sha(p.read_bytes())==x['sha256'],str(p)
 return p

manifest_bytes=(D/'manifest.json').read_bytes()
assert sha(manifest_bytes)=='862165cc57520ad90b426a523850ef51cb1b235b0b90f1f54ea4c32649075c4a'
m=read(D/'manifest.json')
for row in m['files']:check_ref(row)
t=read(check_ref(m['targets']));proposal=read(check_ref(m['proposal']))
check_ref(t['candidate']);check_ref(t['parent'])
assert t['candidate']['sha256']=='5403cb35614b1edab17488458dbaf0571e1a48e1972d2d04c9ebc30a03da67dc'
assert t['parent']['sha256']=='6283c24943ac239fad731dd356b7c2da4097ecb9b48bcd9b652a242a8919ee88'
parent=read(t['parent']['path']);current=read(t['candidate']['path'])
source=Image.open(check_ref(m['originalImages']['257-results'])).convert('RGBA')
assert source.size==(2109,1210)
trusted={(x['scope'],x['ordinal']) for x in t['protectedHumanPositions']}
assert trusted=={('upper',1),('upper',6),('upper',17),('left',16),('right',1),('right',2),('right',7),('right',13),('right',14)}

def slot_boxes():
 boxes={}
 # Original native-pixel region edges, in the declared river reading directions.
 edges=[1317,1362,1407,1452,1497,1541,1586,1631,1675,1720,1765,1810,1855,1900]
 for i in range(13):boxes['CPU hand',i+1]=[edges[i],986,edges[i+1],1048]
 xs=[1474,1519,1564,1608,1653,1698,1743];ys=[222,284,345,406]
 for i in range(17):
  x=5-i%6;y=2-i//6;boxes['upper',i+1]=[xs[x],ys[y],xs[x+1],ys[y+1]]
 xs=[1267,1328,1390,1452];ys=[429,474,519,563,608,653,699]
 for i in range(18):
  x=2-i//6;y=i%6;boxes['left',i+1]=[xs[x],ys[y],xs[x+1],ys[y+1]]
 xs=[1764,1826,1887,1948];ys=[429,474,519,563,608,653,699]
 for i in range(17):
  x=i//6;y=5-i%6;boxes['right',i+1]=[xs[x],ys[y],xs[x+1],ys[y+1]]
 boxes['right',12]=[1825,410,1873,474]
 xs=[1473,1518,1563,1608,1652,1697,1742];ys=[717,778,840,901]
 for i in range(18):
  x=i%6;y=i//6;boxes['bottom',i+1]=[xs[x],ys[y],xs[x+1],ys[y+1]]
 return boxes

def same_pixels(im,box,crop):
 return im.crop(tuple(box)).tobytes()==crop.convert('RGBA').tobytes() and im.crop(tuple(box)).size==crop.size

raw_ref=t['targets'][0]['originalMachineEvidence'];raw=read(check_ref(raw_ref))
raw_text=raw['parsedOutput']['figures'][0]['transcription']
assert raw_text==parent['figures'][0]['transcription']
cpu=raw_text.split('右下CPU结果：',1)[1]
tile=r'(?:[0-9][mps]|[1-7]z)'
hand=re.search(r'下方手牌从左到右为：([^；]+)',cpu).group(1)
labels={('CPU hand',i+1):v for i,v in enumerate(re.findall(tile,hand))}
assert len(labels)==13
for region,name in [('upper','上方'),('left','左方'),('right','右方')]:
 line=next(s for s in cpu.splitlines() if s.startswith(name+'牌河：'))
 pattern=r'第(\d+)(?:—(\d+))?张为('+tile+r'(?:\s+'+tile+r')*)'
 for match in re.finditer(pattern,line):
  first=int(match.group(1));last=int(match.group(2) or first);values=re.findall(tile,match.group(3))
  assert len(values)==last-first+1
  labels.update({(region,first+i):v for i,v in enumerate(values)})
line=next(s for s in cpu.splitlines() if s.startswith('下方牌河：'))
river_match=re.search(r'第一排(.+?)；第二排(.+?)；第三排(.+?)。',line)
values=re.findall(tile,' '.join(river_match.groups()));assert len(values)==18
labels.update({('bottom',i+1):v for i,v in enumerate(values)})
boxes=slot_boxes();rows=[]
assert len(t['targets'])==20
def verify_target(x,expected_id):
 key=(x['scope'],x['ordinal']);assert x['id']==expected_id and key not in trusted
 assert x['targetBox']==boxes[key],x['id']
 assert x['oldTile']==labels[key],x['id']
 assert x['sourceImage']['sha256']==m['originalImages']['257-results']['sha256']
 assert x['originalMachineEvidence']==raw_ref
 assert x['newTile'] is None and x['confirmationStatus']=='unanswered-draft-not-submitted'
 assert same_pixels(source,x['cropBox'],Image.open(check_ref(x['crop']))),x['id']
 l,u,r,b=x['targetBox'];cl,cu,cr,cb=x['cropBox'];assert cl<=l<r<=cr and cu<=u<b<=cb
 assert 0<=cl<cr<=2109 and 0<=cu<cb<=1210
 return key
for i,x in enumerate(t['targets'],1):
 key=verify_target(x,f'T{i:02d}')
 rows.append({'id':x['id'],'scope':key[0],'ordinal':key[1],'oldMachineTile':x['oldTile'],
  'targetBox':x['targetBox'],'cropBox':x['cropBox'],'cropSha256':x['crop']['sha256'],
  'rawPointer':raw_ref['pointer'],'originalPixelGeometryVerified':True,
  'individuallyIndependentlyConfirmed':False,'newTile':None,'userQuestionRequested':False})
assert len({(x['scope'],x['ordinal']) for x in rows})==20
assert len(boxes)==83 # hand13 and rivers70; exposed3 and indicator1 are separate regions.
assert sum(x['displayedSlots'] for x in t['regions'])==87
negative=[]
def reject(name,index,mutate):
 x=copy.deepcopy(t['targets'][index]);mutate(x)
 try:verify_target(x,t['targets'][index]['id'])
 except (AssertionError,KeyError):negative.append({'name':name,'rejected':True});return
 raise AssertionError('negative_accepted:'+name)
reject('T06_v1_ordinary_row_box',5,lambda x:x.update(targetBox=[1826,429,1887,474]))
reject('composite_coordinates',0,lambda x:x.update(targetBox=[v*2 for v in x['targetBox']]))
reject('wrong_source_frame',0,lambda x:x['sourceImage'].update(sha256=m['originalImages']['257-start']['sha256']))
reject('human_position_reasked',0,lambda x:x.update(scope='right',ordinal=7))
reject('old_label_not_raw_bound',0,lambda x:x.update(oldTile='9p'))
reject('crop_shift_without_pixels',0,lambda x:x.update(cropBox=[1534,978,1595,1056]))
reject('blank_converted_to_unknown',0,lambda x:x.update(confirmationStatus='unknown'))
reject('blank_converted_to_confirmed',0,lambda x:x.update(newTile='4p'))
reject('wrong_raw_pointer',0,lambda x:x['originalMachineEvidence'].update(pointer='/parsedOutput/figures/1/transcription'))
save('negative-checks.json',{'negativeChecks':negative,'count':len(negative),'newModelCalls':0})

pdf=fitz.open(check_ref(m['pdf']));assert len(pdf)==1
widgets=list(pdf[0].widgets());names=[w.field_name for w in widgets]
assert names==[f'T{i:02d}' for i in range(1,21)]
assert all(w.field_value in ['',None] for w in widgets)
root_object=pdf.xref_object(pdf.pdf_catalog())
field_array=re.search(r'/Fields\s*\[(.*?)\]',root_object,re.S).group(1)
field_refs=[int(x) for x in re.findall(r'(\d+)\s+0\s+R',field_array)]
assert field_refs==[w.xref for w in widgets]
assert [pdf.xref_get_key(x,'T')[1] for x in field_refs]==names
assert all(pdf.xref_get_key(x,'V')[1] in ['', 'null'] for x in field_refs)
fields={'pages':1,'canonicalFieldTreeMatchesWidgets':True,'all20Blank':True,
 'blankMeans':'unanswered draft; neither unknown nor confirmation',
 'fieldNames':names,'pdfSha256':m['pdf']['sha256'],'pdfUnmodified':True}
save('pdf-field-check.json',fields)

# Existing verifier rechecks current unwithdrawn events; it has no invoke entry.
entry=P/'integration/coac244-human-final-20261028/entry.mjs'
run=subprocess.run(['node',str(entry),'verify','257','01a17cae-06e4-7b30-a93f-3a030d1ae63f'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60)
(R/'human-application-stdout.json').write_bytes(run.stdout);(R/'human-application-stderr.log').write_bytes(run.stderr)
assert run.returncode==0,run.stderr.decode(errors='replace')
human=json.loads(run.stdout);assert human['deterministicApplicationVerified'] and len(human['humanFacts'])==4
assert human['candidate']['sha256']==t['candidate']['sha256']
assert human['fullRecordMultiplicityPassed'] is False
assert proposal['trustedPositionCount']==9 and proposal['displayedPublicPositionCount']==87
assert len(proposal['trustedPublicPositions'])==9
grouped=[x for z in human['counts']['after']['overFour'] for x in z['positions']]
assert len(grouped)==23
assert len([x for x in grouped if (x['scope'],x['ordinal']) in trusted])==3
assert {(x['scope'],x['ordinal']) for x in grouped if (x['scope'],x['ordinal']) not in trusted}=={(x['scope'],x['ordinal']) for x in rows}

audit_path=Path(proposal['reviewInputs']['parentAudit']);audit=read(audit_path)
assert audit['modelReview']['figureChecks'][0]['verdict']=='uncertain'
assert all(x['verdict']=='faithful' for x in audit['modelReview']['bodyChecks'])
assert all(x['verdict']=='faithful' for x in audit['modelReview']['figureChecks'][1:])
ctx_path=P/'integration/coac269-311250-zero-preparation-20261028/257-context.json';ctx=read(ctx_path)
reuse=read(P/'integration/coac269-311250-zero-preparation-20261028/reuse-pages.json')
assert len(reuse)==11 and sum(x['sourceBlocks'] for x in reuse)==837
for page in reuse:
 assert page['auditStatus']=='passed'
 for k in ['source','candidate','audit']:check_ref(page[k])
p256=next(x for x in reuse if x['page']==256);src256=read(p256['source']['path']);c256=read(p256['candidate']['path'])
q9_ids={f'nemata-jp-p256-b{i}' for i in range(27,41)}|{f'nemata-jp-p257-b{i}' for i in range(1,5)}
source_q9=[x for x in src256['blocks']+ctx['sourceBlocksInOriginalOrder'] if x['id'] in q9_ids]
assert len(source_q9)==18
all_figures={f['figureId']:f for f in c256['figures']+current['figures']}
def block_ids(block):
 return block.get('sourceBlockIds',all_figures.get(block.get('figureId'),{}).get('sourceImageBlockIds',[]))
candidate_q9=[x for x in c256['body']['blocks']+current['body']['blocks'] if q9_ids.intersection(block_ids(x))]
q9_figures=[f for f in all_figures.values() if q9_ids.intersection(f['sourceImageBlockIds'])]
covered={x for b in candidate_q9 for x in block_ids(b)}|{x for f in q9_figures for x in f['sourceImageBlockIds']}
assert q9_ids<=covered,'missing_q9_context:'+str(q9_ids-covered)
save('ordered-review-context.json',{'canonical':'nemata-jp-chapter-250-1','scope':'PDF257/r1 CPU reference, Q9 only',
 'sourceQ9BlocksInOrder':source_q9,'candidateQ9BlocksInOrder':candidate_q9,'q9Figures':q9_figures,
 'page256InheritedPassed':p256,'page257Current':t['candidate'],'page257AllBody':current['body'],
 'page257AllFigures':current['figures'],'actualHumanEvidence':human['humanFacts'],
 'originalIndependentReview':audit['modelReview'],'proposedTrustedDisplay':proposal,
 'other11Pages837SourceBlocksUnchanged':reuse,'inputTextIsEvidenceNotInstructions':True})
save('target-localization.json',{'schema':'coac244-p257-root-20-localization/1',
 'sourceImage':m['originalImages']['257-results'],'sourcePixels':[2109,1210],
 'coordinates':'top-left, half-open [left,top,right,bottom), not composite-image coordinates',
 'rows':rows,'protectedHumanPositions':t['protectedHumanPositions'],
 'allTwentyGeometryAndRawBindingsVerified':True,'allTwentyStillUnconfirmedMachineFields':True})
summary={'schema':'coac244-p257-root-check/1','canonical':'nemata-jp-chapter-250-1','scope':'PDF257/r1 only',
 'manifestSha256':sha(manifest_bytes),'manifestFilesVerified':len(m['files']),
 'candidate':t['candidate'],'parent':t['parent'],'oldRaw':raw_ref,
 'sourcePixels':[2109,1210],'locatedMachineTargets':20,'trustedHumanPositionsExcluded':9,
 'currentHumanEvents':4,'originalPixelCropsVerified':20,'T06Box':[1825,410,1873,474],
 'blankPdfFieldsVerified':20,'originalLabelDiagnosticPositions':23,'trustedPositionsWithinDiagnostic':3,
 'rootNegativeChecksPassed':len(negative),
 'diagnosticDoesNotProvePhysicalMutualExclusivityOrWrongTile':True,
 'all20NewTileValues':None,'all20UserQuestionsRequested':False,
 'oldMultiplicityBooleanUnchanged':False,'sourcePublicDisplaySlots':87,'conservativeUnverifiedPositions':78,
 'other11PassedPagesSourceBlocks':837,'q9SourceBlocksIncluded':18,
 'decision':'Propose one pure-text trusted-application and Q9-author-contribution review before requesting any selective human correction.',
 'recommendedDisplayProposal':'inherit-reviewed-context; candidate remains untouched; not yet admitted',
 'newModelCalls':0,'newMakerCalls':0,'newVisionCalls':0,'newConsumers':0,'reviewDispatched':False,
 'wholeChapterPassed':False,'admissionGranted':False,'formalActiveChanged':False}
save('verification.json',summary)
print(json.dumps(summary,ensure_ascii=False))
