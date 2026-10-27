import json,hashlib,shutil
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing')
O=Path('.multica/delivery/coac244-scope215-pdf193-20261028');O.mkdir(parents=True,exist_ok=True)
S=R/'integration/coac244-scope215-pdf193-20261028';S.mkdir(exist_ok=True)
def load(p):return json.loads(Path(p).read_text(encoding='utf8'))
def bind(p):
 p=Path(p);return dict(path=str(p.resolve()),sha256=hashlib.sha256(p.read_bytes()).hexdigest())
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
base=R/'audit/runtimes/coac244-vision-terra-max-v1-20261027'
runtime=S/'verification-runtime';runtime.mkdir(exist_ok=True)
deps=[]
for p in base.iterdir():
 if p.is_file() and p.suffix in ('.mjs','.py','.json'):
  b=p.read_bytes()
  if p.name=='textbook-audit.mjs':
   old=b'async function verifyPdfAuditEvidence(processingRoot, candidatePath) {'
   assert b.count(old)==1
   b=b.replace(old,b'export async function verifyPdfAuditEvidence(processingRoot, candidatePath) {')
  (runtime/p.name).write_bytes(b)
  deps.append(dict(name=p.name,parent=bind(p),current=bind(runtime/p.name)))
save(S/'verification-runtime-manifest.json',dict(schema='coac244-evidence-only-verifier/1',parent=bind(base/'runtime-manifest.json'),files=deps,modification='Only export existing complete production/source/raw/independent audit evidence verifier; no verdict or gate changes; never invoke model.'))
selection=load(R/'integration/current-candidate-selection.json')
rows=[x for x in selection['pages'] if x['sourceId']=='79-cn' and x['page'] in (193,215,216)]
parent=R/'production/sol-high-fallback-finite-20261024-schemafix/candidates/79-cn/page-0217.json'
audits=sorted((R/'audit/pages/79-cn').glob('page-0217.73410520b240c15305d220c0aa472bb0f53392255dd0167b78d8a4627aac0add.*.json'))
audits=[p for p in audits if load(p)['status']=='needs-repair']
assert len(audits)==1
config=dict(schema='coac244-scope215-and-source193/1',root=str(R),shared=str(S),runtime=str(runtime),runtimeManifest=bind(S/'verification-runtime-manifest.json'),chapterId='79-cn-chapter-215-4',chapterMap=bind(R/'integration/chapter-map.navigation-v3.json'),ownership=bind(R/'integration/source-block-ownership.json'),sourceInventory=bind(R/'source-inventory.json'),selected=rows,p217=dict(candidate=bind(parent),audit=bind(audits[0]),sourceBlockIds=['79-cn-p217-b1','79-cn-p217-b3']),p193=load('.multica/delivery/coac244-closure26-zero-20261028/193-recovered-source.json'),modelCalls=0)
save(S/'config.json',config);save(O/'config.json',config)
save(O/'verification-runtime-manifest.json',load(S/'verification-runtime-manifest.json'))
for p in runtime.iterdir():
 if p.is_file():
  d=O/'verification-runtime';d.mkdir(exist_ok=True);shutil.copy2(p,d/p.name)
(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
print(json.dumps(dict(shared=str(S),runtime=str(runtime),selectedPages=[x['page'] for x in rows],dependencies=len(deps))))
