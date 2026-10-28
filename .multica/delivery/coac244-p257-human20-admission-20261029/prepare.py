"""Freeze exact PDF257 composition; no production, review, annotation or global writes."""
from pathlib import Path
import json,hashlib,shutil
P=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).resolve().parent;D=P/'integration/coac244-p257-human20-admission-20261029'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
ref=lambda p:{'path':str(p),'sha256':sha(Path(p).read_bytes())}
rref=ref(P/'integration/coac249-p257-human20-reviewed-20261028.json');r=load(rref['path']);q=ref(P/'integration/coac249-p257-human20-display-scope-20261028.json');proof=ref(P/'integration/coac249-p257-human20-inheritance-20261028.json')
human=ref(P/'integration/coac269-p257-human20-20261028/entry.mjs');closed=ref(P/'audit/runtimes/coac244-vision-production-schema-v2-20261028/textbook-production-cli.mjs');standard=ref(P/'audit/runtimes/coac269-109167-exact-v1-20261028/textbook-audit.mjs')
inventory=ref(P/'source-inventory.json');chapterMap=ref(P/'integration/chapter-map.navigation-v3.json');library=ref(Path('E:/AgentData/Coach/knowledge/review/knowledge-index.json'))
files=[rref,q,proof,human,closed,standard,inventory,chapterMap,library,ref(P/'integration/coac249-p257-human20-owner-handoff-20261028.md')]
files.extend(load(proof['path'])['refs'])
for k in ['candidate','source','parent','parentAudit','packetManifest','runtime','raw','plan','publishedRequest']:files.append(r[k])
packet=load(r['packetManifest']['path']);files.extend(packet['files']);files.extend(packet['inputBindings'])
rt=load(r['runtime']['path'])
for f in rt['files']:
 f=dict(f);f['path']=str(Path(r['runtime']['path']).parent/f['path']);files.append(f)
ap=r['applicationEvidence'];pages=[{'page':257,'candidate':r['candidate']},{'page':261,'candidate':ap['source261']}]+ap['reuse']
src=next(x for x in load(inventory['path'])['sources'] if x['sourceId']=='nemata-jp')
for row in pages:
 files.append(row['candidate']);page=next(x for x in src['pages'] if x['page']==row['page']);files.append(ref(P/page['pageData']))
 c=load(row['candidate']['path'])
 for f in c['figures']:files.append({'path':str(P/f['croppedImagePath']),'sha256':f['croppedImageSha256']})
 for b in load(P/page['pageData'])['blocks']:
  if b['type']=='image' and row['page']==257:files.append({'path':str(P/b['asset']),'sha256':b['imageSha256']})
repo=Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts')
publisher=(repo/'textbook-processing/publish-textbooks.mjs').read_text(encoding='utf-8-sig')
segment=publisher[publisher.index('export async function assembleApprovedPdfPages'):publisher.index('/** Fail before changing the live library')]
exceptions=[]
for row in pages:
 if row['page'] not in [253,258]:continue
 f=next(x for x in load(row['candidate']['path'])['figures'] if x['figureId']==('nemata-jp-p253-r17' if row['page']==253 else 'nemata-jp-p258-r7'))
 exceptions.append({'page':row['page'],'figureId':f['figureId'],'transcriptionSha256':sha(f['transcription'].encode()),'croppedImageSha256':f['croppedImageSha256']})
guard="const inheritedKnownSourceLimit=allowInheritedSourceLimit(p,f);\n   if(!f.transcription?.trim()||f.transcription.length>3500||(!inheritedKnownSourceLimit&&/无法辨认|无法识别|待补|待核对|若干[万筒饼索]|接上段/.test(f.transcription)))throw Error('publish_unresolved_figure');"
old="if(!f.transcription?.trim()||f.transcription.length>3500||/无法辨认|无法识别|待补|待核对|若干[万筒饼索]|接上段/.test(f.transcription))throw Error('publish_unresolved_figure');"
assert segment.count(old)==1;segment=segment.replace(old,guard)
header="""// Private existing assembler: only two exact inherited passed source-limit strings are exempted from the lexical word ban.
import {readFile,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {TextbookIdSchema} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/node_modules/@riichi-coach/contracts/dist/index.js';
import {mapSourceBlocks,splitExactText} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/publish-textbooks.mjs';
import {splitInlineParagraph} from 'file:///E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/scripts/textbook-processing/stage-inline-chunks.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=(s,p,id)=>`${s}:${p}:${id}`;
async function contained(root,path){const base=await realpath(root),full=await realpath(resolve(base,path)),rel=relative(base,full);if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep))throw Error('publish_path_outside_root');return full;}
function mappedOwner(ownership,sourceId,page,ids){if(!ids?.length)throw Error('publish_missing_source_blocks');const owners=ids.map(id=>ownership.get(key(sourceId,page,id)));if(owners.some(x=>!x)||owners.some(x=>x.unit.id!==owners[0].unit.id))throw Error('publish_paragraph_crosses_argument_boundary');return owners[0];}
"""
(O/'assembly.mjs').write_bytes((header+'const EXCEPTIONS='+json.dumps(exceptions,ensure_ascii=False,separators=(',',':'))+';\n'+"export function allowInheritedSourceLimit(p,f){return EXCEPTIONS.some(e=>p.sourceId==='nemata-jp'&&p.page.page===e.page&&p.audit.status==='passed'&&f.figureId===e.figureId&&sha(f.transcription)===e.transcriptionSha256&&f.croppedImageSha256===e.croppedImageSha256);}\n"+segment).encode())
files.append(ref(Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach/node_modules/@riichi-coach/contracts/dist/index.js')))
for n in ['textbook-processing/publish-textbooks.mjs','textbook-processing/stage-inline-chunks.mjs','textbook-processing/stage-pdf-inline-layout.mjs','scene-study/compile-textbook-corpus.mjs','scene-study/textbook-review.mjs','scene-study/textbook-review.css','scene-study/textbook-review-client.js']:files.append(ref(repo/n))
files=list({str(Path(f['path'])).replace('\\','/').lower():f for f in files}.values())
for f in files:assert sha(Path(f['path']).read_bytes())==f['sha256'],f['path']
for n in ['admit.mjs','stage.mjs','assembly.mjs']:files.append({'path':str(D/n),'sha256':sha((O/n).read_bytes())})
m={'schema':'coac244-p257-human20-exact-stage-frozen/1','receipt':rref,'scope':q,'proof':proof,'humanApplicationModule':human,'closedPromptModule':closed,'standardModule':standard,'sourceLibrary':library,'inventory':inventory,'chapterMap':chapterMap,'files':files,'newModelCalls':0}
(O/'manifest.json').write_bytes((json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode());D.mkdir(exist_ok=True)
for f in O.iterdir():
 if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps({'package':str(D),'bindings':len(files),'newModelCalls':0}))
