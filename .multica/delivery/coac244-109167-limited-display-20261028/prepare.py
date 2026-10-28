"""Freeze two fixed bounded-display scopes; copies original evidence without altering it."""
import hashlib,json,shutil
from pathlib import Path
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent
D=P/'integration/coac244-109167-limited-display-20261028'
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
def ref(p):return {'path':str(p),'sha256':sha(Path(p).read_bytes())}
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert not D.exists(),'namespace exists; inspect before reusing'
origin=P/'integration/coac244-201-limited-display-20261028/stage-base201.mjs'
base=origin.read_text(encoding='utf-8-sig');cut=base.index('import {readFile,')
changed=('function displayExactSegments(block){return block.sourceSegments;}\n'+base[cut:]).replace('display201Segments(original)','displayExactSegments(original)').replace('shown201','shownExact')
changed=changed.replace('admitted-exact201-five-limit-display','admitted-exact109167-editorial-display').replace("import('./admit201.mjs')","import('./admit.mjs')").replace('strict.verify201Limited','strict.verifyLimited')
(O/'stage-base.mjs').write_text(changed.rstrip()+'\n',encoding='utf-8')
jobs={};files=[ref(origin)];receipts={'109':'67421d448b13f720947ca5472d7a0dfba1ee95e2f710f79ec1d5e86703baa986','167':'e291ebb02ed244689be9a7060659d4214d267189eb62e868c6747b7db9b027fe'}
for key in ['109','167']:
 rr=ref(P/f'integration/coac249-{key}-target-impact-reviewed-20261028.json');assert rr['sha256']==receipts[key];r=load(rr['path'])
 q=ref(P/f'integration/coac249-{key}-display-requirements-20261028.json');proposal=load(q['path'])
 ir=ref(P/f'integration/coac249-{key}-scope-inheritance-20261028.json');inh=load(ir['path']);figure=proposal['figureBindings'][0]
 anchor='79-bilibili-cn:'+('cv1729038:b0012' if key=='109' else 'cv1754620:b0005')
 jobs[key]={'canonical':r['canonical'],'candidate':r['candidate'],'source':r['source'],'parent':r['parent'],'parentAudit':r['parentAudit'],'receipt':rr,'proposal':q,'inheritance':ir,
 'fullFigureSha256':figure['fullFigureSha256'],'unknownFigure':figure['figureId'],'unknowns':figure['unknowns'],'limits':proposal['requiredDisplayLimitations'],
 'repairFigureIds':[x['figureId'] for x in r['modelReview']['repairChecks']],'impactSourceBlockIds':r['modelReview']['unknownImpacts'][0]['sourceBlockIds'],
 'exactChanges':inh['exactChanges'],'anchor':{'afterSourceBlockId':anchor,'beforeSourceBlockId':anchor[:-4]+('0013' if key=='109' else '0006')}}
 files.extend([rr,q,ir,r['raw'],r['plan'],r['candidate'],r['parent'],r['parentAudit'],r['source'],r['runtime'],r['handoff'],r['productionProof']['raw']])
 for f in load(r['runtime']['path'])['files']:files.append(f)
 paircontract=load(Path(r['runtime']['path']).parent/'pair-contract.json')
 files.extend([paircontract['packageManifest'],paircontract['baseManifest']])
 for f in load(paircontract['packageManifest']['path']):files.append(ref(P/'integration/coac244-ready109167-zero-20261028'/f['path']))
 for x in load(r['plan']['path'])['images']:files.append(ref(x))
contract={'schema':'coac244-exact109167-bounded-display/1','jobs':jobs,'originalStrictFalseMustRemain':True,'ordinaryWholeArticlePassed':False,'newModelCalls':0,'globalReadbackRequired':True}
save(O/'contract.json',contract)
for name in ['admit.mjs','stage.mjs','stage-base.mjs','contract.json']:files.append({'path':str(D/name),'sha256':sha((O/name).read_bytes())})
for p in ['scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','textbook-processing/publish-textbooks.mjs','textbook-processing/stage-web-tables.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-definition-boundaries.mjs','textbook-processing/stage-web-image.py']:files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')/p))
files=list({x['path'].replace('\\','/').lower():x for x in files}.values())
save(O/'manifest.json',{'schema':'coac244-exact109167-display-manifest/1','contract':{'path':str(D/'contract.json'),'sha256':sha((O/'contract.json').read_bytes())},
 'reviewModule':ref(P/'audit/runtimes/coac269-109167-exact-v1-20261028/pair.mjs'),'files':files,'newCalls':0,'originalStrictFalsePreserved':True,'globalPointerMayChange':False})
D.mkdir()
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'boundFiles':len(files),'shared':str(D),'newCalls':0}))
