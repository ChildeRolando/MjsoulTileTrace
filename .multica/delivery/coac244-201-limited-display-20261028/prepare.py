"""Freeze only exact201 display compatibility; no model invocation or shared pointer writes."""
import hashlib,json,shutil
from pathlib import Path
P=Path('E:/AgentData/Coach/knowledge/processing')
O=Path(__file__).resolve().parent
D=P/'integration/coac244-201-limited-display-20261028'
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(p):return {'path':str(p),'sha256':sha(Path(p).read_bytes())}
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
r=P/'integration/coac249-201-target-impact-reviewed-20261028.json';rr=ref(r)
assert rr['sha256']=='3a37da953a628ba7ab8bc031df939c0f168ca7e623150d7c5c4beba5a0f5a3e7'
receipt=load(r);proposal=P/'integration/coac249-201-display-requirements-20261028.json';inheritance=P/'integration/coac249-201-scope-inheritance-20261028.json'
assert ref(proposal)['sha256']=='e80625a0088ab997f8753853f3ae6a9f752ddb8af4415638a6ac798ac243fef7'
assert ref(inheritance)['sha256']=='0d739b400c4025872070a6968180bec4642f96011467a3705d65c37a94af2258'
origin=P/'integration/coac250-182-limited-display-20261028/stage-base.mjs'
base=origin.read_text(encoding='utf-8-sig');cut=base.index("import {readFile,")
helper="""function display201Segments(block){
 if(block.sourceBlockIds[0]!=='79-bilibili-cn:cv1770179:b0006')return block.sourceSegments;
 if(block.sourceSegments.map(s=>s.text).join('')!==block.sourceText)throw Error('201_source_segments_changed');
 let changed=0;const from='日本がアメリカに戦争を挑むくらい無謀でしょう。',to=from+'（恐怕就像日本向美国挑起战争一样鲁莽吧。）';
 const segments=block.sourceSegments.map(s=>{if(!s.text.includes(from))return s;changed++;return {...s,text:s.text.replace(from,to)};});
 if(changed!==1||segments.map(s=>s.text).join('')!==block.text)throw Error('201_display_segments_derivation');return segments;
}
"""
changed=(helper+base[cut:]).replace('display182Segments(original)','display201Segments(original)').replace('shown182','shown201')
changed=changed.replace('admitted-exact182-source-ambiguity-display','admitted-exact201-five-limit-display').replace("import('./admit.mjs')","import('./admit201.mjs')").replace('strict.verify182Limited','strict.verify201Limited')
assert 'verify182Limited' not in changed and 'display182Segments' not in changed
(O/'stage-base201.mjs').write_text(changed.rstrip()+'\n',encoding='utf-8')
contract={'schema':'coac244-exact201-five-limit-contract/1','canonical':'79-cn-chapter-201-6','candidate':receipt['candidate'],
 'source':receipt['source'],'parent':receipt['parent'],'parentAudit':receipt['parentAudit'],'independentReceipt':rr,'raw':receipt['raw'],
 'scope':'exact201-translation-and-unknown-impact-with-five-editorial-limits','ordinaryWholeArticlePassed':False,
 'limits':receipt['modelReview']['carriedIssue']['requiredDisplayLimitations'],
 'anchor':{'afterSourceBlockId':'79-bilibili-cn:cv1770179:b0005','beforeSourceBlockId':'79-bilibili-cn:cv1770179:b0006'},
 'authorBodyInjection':False,'candidateFileMayChange':False,'noGuessingUnknown':True,'newModelCalls':0,'actualGlobalReadbackRequired':True}
save(O/'contract.json',contract)
files=[rr,ref(proposal),ref(inheritance),receipt['raw'],receipt['plan'],receipt['candidate'],receipt['parent'],receipt['parentAudit'],receipt['source'],receipt['runtime'],
       ref(P/'integration/coac248-182201-20261028/review.mjs'),ref(P/'integration/coac248-182201-20261028/release.json')]
for f in load(receipt['runtime']['path'])['files']:files.append(ref(Path(receipt['runtime']['path']).parent/f['name']))
files.append(ref(origin))
for p in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:
 files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/p))
for name in ['admit201.mjs','stage201.mjs','stage-base201.mjs','contract.json']:files.append({'path':str(D/name),'sha256':sha((O/name).read_bytes())})
manifest={'schema':'coac244-exact201-limited-display-manifest/1','receipt':rr,'proposal':ref(proposal),'inheritance':ref(inheritance),
 'reviewModule':ref(P/'integration/coac248-182201-20261028/review.mjs'),'contract':{'path':str(D/'contract.json'),'sha256':sha((O/'contract.json').read_bytes())},
 'files':files,'stageOrigin':ref(origin),'allowedStageChanges':['only exact201 strict callback/status','source-aligned display segments for actual authorized b0006 Chinese insertion'],
 'newModelCalls':0,'newConsumers':0,'globalAcceptedPointerMayChange':False}
save(O/'manifest.json',manifest)
if D.exists():raise RuntimeError('new namespace already exists; inspect before reuse')
D.mkdir()
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'boundFiles':len(files),'newModelCalls':0,'newConsumers':0}))
