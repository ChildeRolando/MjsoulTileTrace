"""Validate source preservation and reject out-of-scope display changes."""
from pathlib import Path
import argparse, copy, json
from html.parser import HTMLParser
import build

class DOM(HTMLParser):
 def __init__(self): super().__init__(); self.sources=[];self.notes=[];self.images=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'data-source-id' in a:self.sources.append(a['data-source-id'])
  if 'data-editorial-id' in a:self.notes.append(a)
  if tag=='img':self.images.append(a)

def check(root,out):
 root=Path(root);out=Path(out);data=build.load_inputs(root)
 p=build.read(out/'presentation-proposal.json');build.verify_proposal(p,data,root)
 tests=[]
 def reject(name,mutate):
  bad=copy.deepcopy(p);mutate(bad)
  try:build.verify_proposal(bad,data,root)
  except (AssertionError,KeyError,ValueError):tests.append({'name':name,'rejected':True});return
  raise AssertionError('mutation_accepted:'+name)
 reject('remove_author_condition',lambda x:x['body']['blocks'][120].update(text='六图条件省略'))
 reject('change_author_threshold',lambda x:x['body']['blocks'][160].update(text='已独立验证22%'))
 reject('reorder_author_context',lambda x:x['body']['blocks'].reverse())
 reject('remove_source_position',lambda x:x['body']['blocks'].pop())
 reject('alter_non_target_figure',lambda x:x['figures'][0].update(caption='改写'))
 target=next(i for i,f in enumerate(p['figures']) if f['figureId']==build.fid(122))
 reject('restore_artificial_grid',lambda x:x['figures'][target].update(transcription=data['parent']['figures'][target]['transcription']))
 reject('add_numeric_reading',lambda x:x['figures'][target].update(transcription=x['figures'][target]['transcription']+'\n新增第4巡2000'))
 reject('invent_curve_binding',lambda x:x['figures'][target].update(unknowns=[]))
 reject('change_original_image_sha',lambda x:x['figures'][target]['presentationAsset'].update(sha256='0'*64))
 reject('replace_with_resampled_image',lambda x:x['figures'][target]['presentationAsset'].update(width=1294))
 reject('missing_editorial_limit',lambda x:x['editorialNotes'].pop())
 reject('pretend_editorial_is_author',lambda x:x['editorialNotes'][0].update(authorText=True))
 reject('move_note_to_other_graph',lambda x:x['editorialNotes'][0].update(afterSourceBlockId=build.sid(124)))
 reject('certify_author_calculation',lambda x:x.update(authorCalculationsVerified=True))
 reject('forge_admission',lambda x:x.update(admissionGranted=True))
 reject('forge_whole_chapter_pass',lambda x:x.update(wholeChapterPassed=True))
 reject('forge_model_production',lambda x:x.update(ordinaryProductionCandidate=True))
 reject('change_parent_sha',lambda x:x['originCandidate'].update(sha256='0'*64))
 dom=DOM();markup=(out/'native-preview.html').read_text(encoding='utf-8');dom.feed(markup)
 assert dom.sources==[b['sourceBlockIds'][0] for b in p['body']['blocks']]
 assert len(dom.images)==21 and len(dom.notes)==8
 assert all(n['data-author-text']=='false' for n in dom.notes)
 native={i['figureId']:i for i in build.read(out/'native-image-proof.json')['targetImages']}
 for f,img in zip(p['figures'],dom.images):
  original=root/f['presentationAsset']['path'];rendered=out/img['src']
  assert original.read_bytes()==rendered.read_bytes(),'rendered_image_byte_change'
  assert int(img['width'])==f['presentationAsset']['width']
  assert int(img['height'])==f['presentationAsset']['height']
  if f['figureId'] in native:assert build.sha(rendered.read_bytes())==native[f['figureId']]['sha256']
 # Deterministically reverse only declared leaf edits and recover the exact parent object.
 restored={'body':copy.deepcopy(p['body']),'figures':copy.deepcopy(p['figures'])}
 diff=build.read(out/'derivation.json')
 assert len(diff['changes'])==24
 for d in diff['changes']:
  _,_,i,key=d['path'].split('/');assert key in ['transcription','unknowns','presentationAsset']
  assert restored['figures'][int(i)][key]==d['to'];restored['figures'][int(i)][key]=d['from']
 assert restored=={'body':data['parent']['body'],'figures':data['parent']['figures']}
 result=build.read(out/'verification.json')
 result.update({'negativeChecks':tests,'negativeCheckCount':len(tests),'rendered225SourceAnchorsVerified':True,
  'all21RenderedImageBytesVerified':True,'exactDeclaredParentObjectRestoration':True,
  'htmlSourceAndEditorialStructureVerified':True,'browserReadbackCompleted':False})
 build.write(out/'checks.json',result)
 print(json.dumps({k:v for k,v in result.items() if k!='negativeChecks'},ensure_ascii=False))
 return result

if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--root',required=True);a.add_argument('--out',required=True)
 p=a.parse_args();check(p.root,p.out)
