import pathlib,json,hashlib,shutil,zipfile
O=pathlib.Path(__file__).resolve().parent;P=pathlib.Path('E:/AgentData/Coach/knowledge/processing');S=P/'integration/coac244-next3-zero-20261028'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
binding=load(O/'100-runtime-binding.json');assert sha(O/'context100.mjs')==binding['helperSha256']
manifest=load(O/'verification-runtime/runtime-manifest.json');assert sha(O/'verification-runtime/runtime-manifest.json')==binding['manifestSha256']
for f in manifest['files']:assert sha(O/'verification-runtime'/f['path'])==f['sha256'];assert sha(S/'verification-runtime'/f['path'])==f['sha256']
for k in ['100','159','242']:
 d=load(O/(k+'-input.json'))
 for b in [d['candidate'],d['source'],d['audit']]+[x['raw'] for x in d['calls']]:assert sha(pathlib.Path(b['path']))==b['sha256']
assert len(load(O/'100-context-v2.json')['tests'])==13;assert len(load(O/'sidecar-tests.json')['checks'])==9
for k in ['159','242']:
 d=load(O/(k+'-point-packet.json'));assert d['newModelCalls']==0 and d['newImageDetailGenerated']==False;assert d['targetFigure']['unknowns']
for n in ['README.md','context100.mjs','validate-sidecar.mjs','handoff-100-to249.md','handoff-images-to248.md','handoff-wakeups.json','finish.py']:
 shutil.copy2(O/n,S/n)
files=[{'relativePath':str(p.relative_to(O)).replace('\\','/'),'sha256':sha(p),'bytes':p.stat().st_size} for p in O.rglob('*') if p.is_file() and p.name!='delivery-manifest.json']
delivery={'schema':'coac244-next3-zero-delivery/1','files':files,'newModelCalls':0,'newAcceptedChapters':0,'contextConstructionChecks':13,'sidecarRawGateChecks':9,'sourceCropPixelChecks':4,'nearest4PixelChecks':4,'allSourceCandidateAuditRawUnchanged':True,'sourceUniverse':'256chapters/303units/21212blocks','remainingAtPreparation':24,'coveredAtPreparation':232,'onlySelected3RegisterRowsUpdated':True,'formalActiveChanged':False}
(O/'delivery-manifest.json').write_text(json.dumps(delivery,indent=2)+'\n',encoding='utf-8');shutil.copy2(O/'delivery-manifest.json',S/'delivery-manifest.json')
print(json.dumps({'files':len(files),'checks':30,'newModelCalls':0,'acceptedChapters':0}))
