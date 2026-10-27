from pathlib import Path
import json,hashlib,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent
O.mkdir(exist_ok=True);(O/'evidence').mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_bytes())
dump=lambda p,x:Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
hpath=P/'integration/coac249-193208276-reviewed-20261028.json';h=load(hpath)
refs={str(hpath):sha(hpath.read_bytes())};pins={}
for x in h['results']:
 k=x['key'];bp=P/f'audit/supplements/coac249-193208276-20261028/current-binding-{k}.json';b=load(bp)
 refs[str(bp)]=sha(bp.read_bytes())
 for name in ['candidate','source','oldAudit','raw','receipt','request']:
  ref=x[name];p=Path(ref['path']);content=p.read_bytes();assert sha(content)==ref['sha256'];refs[str(p)]=ref['sha256'];(O/'evidence'/f'{k}-{name}.json').write_bytes(content)
 (O/'evidence'/f'{k}-binding.json').write_bytes(bp.read_bytes())
 a=load(x['oldAudit']['path']);c=load(x['candidate']['path']);s=load(x['source']['path'])
 pins[k]={'canonical':x['canonical'],'candidate':x['candidate'],'source':x['source'],'oldAudit':x['oldAudit'],'raw':x['raw'],'receipt':x['receipt'],'request':x['request'],'binding':{'path':str(bp),'sha256':sha(bp.read_bytes())},'expectedOriginalReview':a['modelReview'],'expectedBody':c['body'],'expectedFigures':c['figures'],'expectedSourceBlocks':s['blocks']}
for name,ref in [('parent276',h['parent276Evidence']['parent']),('parentAudit276',h['parent276Evidence']['parentAudit']),('parentRaw276',h['parent276Evidence']['parentRaw'])]:
 p=Path(ref['path']);bb=p.read_bytes();assert sha(bb)==ref['sha256'];refs[str(p)]=ref['sha256'];(O/'evidence'/f'{name}.json').write_bytes(bb)
shutil.copyfile(hpath,O/'evidence/handoff249.json')
dump(O/'pins.json',pins);dump(O/'protected.json',[{'path':p,'sha256':s}for p,s in refs.items()]);(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
print(json.dumps({'chapters':len(pins),'protectedInitial':len(refs),'newModelCalls':0}))
