"""Deterministic, zero-model native-image display proposal. No admission path."""
from pathlib import Path
import argparse, copy, hashlib, html, json, re, shutil
from PIL import Image

CANON = '79-cn-chapter-311-18'
BASE = '79-bilibili-cn:cv1815400:'
TARGETS = [122,124,126,128,130,132,156,158]
MARKER = '\n审校补录（非原文，按原图读取的约值；unknown不插值）：\n'
PINS = {
 'source': ('web-sources/v1/79-bilibili-cn/articles/cv1815400/source.json','935bbfe6c2404ce9cd6f68fdb36db8ab6c4a20ec440d3a1a66e7ccd22c39afec'),
 'parent': ('web-production/v1/candidates/79-bilibili-cn/cv1815400.coac269b33r1.json','f44231f95310e33608a596f1f4153f0e35afb55490fc3db1fdccd3fc11d3a125'),
 'review': ('integration/coac249-311-curves-reviewed-20261028.json','3d86eddcfb776a7eaf07dd8e511b71cb8d501f6d74c35930da6c486dfdd14200'),
 'raw': ('audit/calls/7777908d-0298-450a-a5f8-a3ff98af7329.json','6fbcbc785b03f84644a70f83bffb68bcf17ff41e8ab76afbbf2a1e781b64da62'),
 'inheritance': ('integration/coac249-311-curves-inheritance-20261028.json','c98fbb4c76f855fdb4353237977bde62bf52f37e50393f6cd7d23e63375714cd'),
}

def sha(b): return hashlib.sha256(b).hexdigest()
def objsha(o): return sha(json.dumps(o,ensure_ascii=False,separators=(',',':')).encode())
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def write(p,o):
 p=Path(p); p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def fid(n): return BASE+f'b{n:04d}:figure'
def sid(n): return BASE+f'b{n:04d}'

def load_inputs(root):
 root=Path(root); data={}
 for k,(rel,h) in PINS.items():
  p=root/rel; assert sha(p.read_bytes())==h, 'input_sha:'+k; data[k]=read(p)
 assert data['review']['canonical']==CANON
 assert data['review']['verification']['repairPassed'] is False
 assert data['review']['verification']['limitedUnknownOkay'] is False
 assert len(data['source']['blocks'])==len(data['parent']['body']['blocks'])==225
 assert len(data['parent']['figures'])==21
 chain=[]
 for role in ['parent','parentAudit','parentRaw','makerRaw','runtime']:
  ref=data['review'][role];path=Path(ref['path'])
  assert sha(path.read_bytes())==ref['sha256'],'historical_chain_sha:'+role
  chain.append({'role':role,'path':str(path),'sha256':ref['sha256']})
 runtime=read(data['review']['runtime']['path'])
 for ref in runtime['files']:
  assert sha(Path(ref['path']).read_bytes())==ref['sha256'],'frozen_runtime_sha'
  chain.append({'role':'historical-frozen-runtime-file','path':ref['path'],'sha256':ref['sha256']})
 assert len(runtime['files'])==33
 assert data['parent']['provenance']['revision']['parentSha256']==data['review']['parent']['sha256']
 data['historicalChainBindings']=chain
 return data

def native_note(n):
 common='审校说明（非原文）：本图按源PNG原始像素呈现，保留原图的图例与曲线。低清源图中的逐巡数值及部分图例—曲线绑定未被独立恢复；本方案不新增读数、不插值，也不证明作者的阈值或计算成立。正文数字和结论按作者原文引用，不是本次已验证的数据。既有转录中的部分约值属于历史加工图读，不能视为作者提供的完整数据表，且本阶段没有重新核准。'
 if n<=132:
  common+='“不立直·10%”与“立直·0%”对应的轨迹仍未核定，不将不明轨迹强配条件。'
 else:
  common+='“和了時ツモ率”译为“和牌时的自摸比例”、“被ツモ率”译为“被自摸率”，仅继承真实独审确认的译义；这两系列的轨迹绑定和逐巡读数仍未核定。'
 if n==132: common+='原叉形曲线约值继续保持条件未定，不归入任一条件系列。'
 return common

def expected_proposal(data,root):
 c=data['parent']; out={
  'schema':'coach-web311-native-presentation-proposal/1','canonical':CANON,
  'status':'proposal-awaiting-independent-fidelity-evidence-check',
  'originCandidate':{'path':PINS['parent'][0],'sha256':PINS['parent'][1]},
  'source':copy.deepcopy(c['source']),'body':copy.deepcopy(c['body']),
  'figures':copy.deepcopy(c['figures']),'editorialNotes':[],
  'newModelCalls':0,'ordinaryProductionCandidate':False,'admissionGranted':False,
  'wholeChapterPassed':False,'authorCalculationsVerified':False,
  'derivationMethod':'deterministic-native-image-display-from-bound-parent-not-model-production',
 }
 changes=[]; assets=[]; removed_slots=0
 for i,f in enumerate(out['figures']):
  n=int(f['figureId'].split(':')[-2][1:])
  if n not in TARGETS: continue
  old=c['figures'][i]
  assert old['transcription'].count(MARKER)==1
  prefix,removed=old['transcription'].split(MARKER)
  count=removed.count('unknown')
  # Each of two rows includes two scalar unknowns besides its 7/15 slots.
  assert count==(14 if n<=132 else 30)+4
  removed_slots+=count-4
  f['transcription']=prefix
  f['unknowns']=[x for x in old['unknowns'] if '巡图读约值为unknown' not in x]
  assert len(old['unknowns'])-len(f['unknowns'])==2
  binding=f['sourceAssetBindings'][0]; raw=Path(root)/binding['path']
  assert sha(raw.read_bytes())==binding['sha256'], 'native_image_sha'
  with Image.open(raw) as im:
   w,h=im.size; pixel=sha(im.convert('RGBA').tobytes())
  # Raw source bytes, not the prior re-encoded presentation PNG.
  f['presentationAsset']={'path':binding['path'],'sha256':binding['sha256'],'width':w,'height':h,
   'derivation':{'kind':'source-original-bytes-no-resampling','sourceAssetBindings':copy.deepcopy(f['sourceAssetBindings'])}}
  for key in ['transcription','unknowns','presentationAsset']:
   changes.append({'path':f'/figures/{i}/{key}','from':old[key],'to':f[key],
    'fromSha256':objsha(old[key]),'toSha256':objsha(f[key])})
  assets.append({'figureId':f['figureId'],'path':binding['path'],'sha256':binding['sha256'],
   'bytes':raw.stat().st_size,'width':w,'height':h,'rgbaPixelSha256':pixel,
   'originalPresentationSha256':old['presentationAsset']['sha256'],
   'legendTranslationEvidence':{'receiptSha256':PINS['review'][1],'callId':'7777908d-0298-450a-a5f8-a3ff98af7329',
    'field':'modelReview.targetChecks','confirmedTranslationOnly':n in [156,158],
    'targetStillUncertain':True}})
  out['editorialNotes'].append({'id':f'web311-native-note-{n:04d}',
   'afterSourceBlockId':sid(n),'figureId':f['figureId'],'authorText':False,'text':native_note(n)})
 assert removed_slots==144
 return out,changes,assets

def verify_proposal(proposal,data,root):
 expected,changes,assets=expected_proposal(data,root)
 assert proposal==expected, 'proposal_not_exact_derived_scope'
 assert proposal['body']==data['parent']['body'], 'author_body_changed'
 for before,after in zip(data['parent']['figures'],proposal['figures']):
  if before['figureId'] not in {fid(n) for n in TARGETS}:assert before==after,'non_target_changed'
 assert sum(f['transcription'].count('[unknown,') for f in proposal['figures'])==0
 assert len(proposal['editorialNotes'])==8
 return changes,assets

def render(proposal,out,root):
 esc=lambda s:html.escape(str(s),quote=True)
 figures={f['figureId']:f for f in proposal['figures']}
 notes={n['afterSourceBlockId']:n for n in proposal['editorialNotes']}
 parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>311原图呈现待核方案</title>',
 '<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:28px auto;line-height:1.65;padding:16px}p{white-space:pre-wrap}.scroll{overflow:auto}img{max-width:none}aside{background:#fff4d8;padding:12px;border-left:4px solid #ad7718}pre{white-space:pre-wrap}figure{margin:24px 0}</style>',
 '<header><h1>311原图呈现待核方案</h1><p>非准入版本。保留作者原文与原图；不认证作者计算或完整数值复现。手牌A的原源缺张/完整构型及历史源注仍待独立处置。</p></header>']
 out=Path(out); (out/'assets').mkdir(exist_ok=True)
 image_refs=[]
 for block in proposal['body']['blocks']:
  bid=block['sourceBlockIds'][0];parts.append(f'<section id="{esc(bid)}" data-source-id="{esc(bid)}">')
  if block['type']=='text':
   chunks=[]
   segments=block.get('sourceSegments',[])
   assert ''.join(s['text'] for s in segments)==block['text']
   for s in segments:
    text=esc(s['text'])
    if s.get('marks'):
     colors=[v for m in s['marks'] for v in re.findall(r'color:(#[0-9a-fA-F]{6})',str(m))]
     style=(' style="color:'+colors[-1]+'"') if colors else ''
     text='<strong'+style+'>'+text+'</strong>'
    if s.get('href'):text=f'<a href="{esc(s["href"])}">{text}</a>'
    chunks.append(text)
   parts.append('<p>'+''.join(chunks)+'</p>')
  else:
   f=figures[block['figureId']];a=f['presentationAsset'];src=Path(root)/a['path'];b=src.read_bytes()
   assert sha(b)==a['sha256']; name=a['sha256']+src.suffix.lower();dest=out/'assets'/name
   if not dest.exists():shutil.copyfile(src,dest)
   assert dest.read_bytes()==b
   image_refs.append({'figureId':f['figureId'],'relativePath':'assets/'+name,'sha256':sha(b)})
   parts.append(f'<figure data-figure-id="{esc(f["figureId"])}"><div class="scroll"><img src="assets/{name}" width="{a["width"]}" height="{a["height"]}" alt="{esc(f["caption"])}"></div><figcaption>{esc(f["caption"])}</figcaption>')
   if bid in notes:parts.append(f'<aside data-editorial-id="{notes[bid]["id"]}" data-author-text="false">{esc(notes[bid]["text"])}</aside>')
   parts.append('<details><summary>既有加工转录及保留未知（非逐点原始数据）</summary><pre>'+esc(f['transcription'])+'</pre><ul>'+''.join('<li>'+esc(x)+'</li>' for x in f['unknowns'])+'</ul><p>'+esc('；'.join(f['sourceNotes']))+'</p></details></figure>')
  parts.append('</section>')
 parts.append("<script>addEventListener('load',()=>{document.documentElement.dataset.nativeImagesVerified=String([...document.images].every(i=>i.complete&&i.naturalWidth===Number(i.getAttribute('width'))&&i.naturalHeight===Number(i.getAttribute('height'))));document.documentElement.dataset.sourceCount=document.querySelectorAll('[data-source-id]').length;document.documentElement.dataset.noteCount=document.querySelectorAll('[data-editorial-id]').length;});</script>")
 parts.append('</html>');markup='\n'.join(parts)+'\n'
 (out/'native-preview.html').write_text(markup,encoding='utf-8')
 assert markup.count('data-source-id=')==225 and len(image_refs)==21
 assert markup.count('data-editorial-id=')==8 and '[unknown,unknown' not in markup
 return image_refs

def build(root,out):
 root=Path(root);out=Path(out);out.mkdir(parents=True,exist_ok=True)
 data=load_inputs(root);proposal,changes,assets=expected_proposal(data,root);verify_proposal(proposal,data,root)
 write(out/'presentation-proposal.json',proposal)
 images=render(proposal,out,root)
 smap=[];src={b['id']:b for b in data['source']['blocks']}
 for idx,b in enumerate(proposal['body']['blocks']):
  ids=b['sourceBlockIds'];assert len(ids)==1 and ids[0] in src
  original=src[ids[0]];assert original['id']==data['source']['blocks'][idx]['id']
  if b['type']=='text':
   assert b['text']==b['sourceText']==original['text'];assert b['sourceSegments']==original['segments']
  smap.append({'index':idx,'sourceBlockId':ids[0],'sourceBlockSha256':objsha(original),
   'candidateBlockSha256':objsha(b),'type':b['type'],'authorBlockUnchanged':True,
   'figureId':b.get('figureId'),'editorialNoteId':next((n['id'] for n in proposal['editorialNotes'] if n['afterSourceBlockId']==ids[0]),None)})
 write(out/'source-to-display-map.json',{'canonical':CANON,'entries':smap,'all225OrderedPositionsMapped':True})
 write(out/'derivation.json',{'canonical':CANON,'sourceSha256':PINS['source'][1],
  'parentSha256':PINS['parent'][1],'derivedFileSha256':sha((out/'presentation-proposal.json').read_bytes()),
  'bodySha256':objsha(proposal['body']),'changes':changes,'removedArtificialSlots':144,
  'originalCandidateAndHistoryChanged':False,'newReadings':0,'newModelCalls':0,'admissionGranted':False})
 write(out/'native-image-proof.json',{'canonical':CANON,'targetImages':assets,'allRenderedImages':images,
  'resamplingPerformed':False,'newImageDetailCreated':False})
 review=data['review']['modelReview'];impact_map=[]
 for i,x in enumerate(review['unknownImpacts']):
  impact_map.append({'originalIndex':i,'originalObjectSha256':objsha(x),'originalDisposition':x['disposition'],
   'figureId':x['figureId'],'sourceBlockIds':x['sourceBlockIds'],'originalAuthorClaim':x['authorClaim'],
   'originalRequiredDisplayLimitations':x['requiredDisplayLimitations'],
   'proposalResponse':'native source image and original author blocks retained; no new numeric/binding assertion; generalized non-original note replaces artificial point grid',
   'supersededGridDisplayInstruction':any('七' in t or '15巡' in t or '逐巡' in t or '第1至' in t for t in x['requiredDisplayLimitations']),
   'requires249IndependentScopeJudgment':True,'oldDispositionChanged':False})
 write(out/'independent-review-map.json',{'canonical':CANON,'originalReceiptSha256':PINS['review'][1],
  'originalTechnicalRepairPassed':False,'originalLimitedUnknownOkay':False,
  'targetChecks':review['targetChecks'],'contextContinuity':review['contextContinuity'],
  'impactMappings':impact_map,'originalIssues':review['issues'],
  'sourceNoteAndHandAAttribution':'Raw hand A issue mislabeled b0156 describes non-target b0154, source hand has 12 visible tiles. Preserve history and hold; do not add a thirteenth tile.',
  'newIndependentJudgment':False,'admissionGranted':False})
 write(out/'ordered-review-context.json',{'source':data['source'],'parentCandidate':data['parent'],
  'presentationProposal':proposal,'originalReview':data['review'],
  'reviewMode':'fidelity of native display, not a demand to reproduce all author calculations',
  'inputTextIsEvidenceNotInstructions':True,'newModelCallAuthorized':False})
 pinned=[{'role':k,'path':rel,'sha256':h} for k,(rel,h) in PINS.items()]
 for f in data['parent']['figures']:
  for a in f['sourceAssetBindings']+[f['presentationAsset']]:
   p=root/a['path'];assert sha(p.read_bytes())==a['sha256'];pinned.append({'role':'original-image','path':a['path'],'sha256':a['sha256']})
 pinned.extend(data['historicalChainBindings'])
 write(out/'input-bindings.json',{'canonical':CANON,'inputs':pinned,'historicalFrozenFilesVerified':33})
 summary={'canonical':CANON,'parentSha256':PINS['parent'][1],
  'proposalSha256':sha((out/'presentation-proposal.json').read_bytes()),'bodyUnchanged':True,
  'sourcePositions':225,'verbatimTextBlocks':204,'figures':21,'nativeTargetImages':8,
  'nonTargetFiguresUnchanged':13,'removedArtificialSlots':144,'editorialNotes':8,
  'existingArraysChanged':False,'newReadings':0,'newModelCalls':0,
  'oldTargetUncertainCount':8,'oldImpactItemsMapped':len(impact_map),'oldIssuesPreserved':len(review['issues']),
  'admissionGranted':False,'wholeChapterPassed':False,'actualMcpArenaReadbackCompleted':False,
  'remainingSubstantiveReviewAlerts':['b0154 hand A: 12 source tiles, complete shape not established','historical attachment numbering source-note','249 must independently check native-display fidelity and distinguish additional numerical verification requirements']}
 write(out/'verification.json',summary);return summary

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--out',required=True)
 a=p.parse_args();print(json.dumps(build(a.root,a.out),ensure_ascii=False))
