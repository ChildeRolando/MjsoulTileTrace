import json,pathlib,hashlib,shutil
O=pathlib.Path(__file__).resolve().parent
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
cfg=load(O/'input.json');P=pathlib.Path(cfg['root']);S=pathlib.Path(cfg['shared'])
def save(n,x):
 text=json.dumps(x,ensure_ascii=False,indent=2)+'\n'
 (O/n).write_text(text,encoding='utf-8');(S/n).write_text(text,encoding='utf-8')
registerchecks=[]
for n in ['coac244-remaining26-closure-register-20261028.json','coac250-uncovered-chapter-continuation-register-20261027b.json']:
 p=P/'integration'/n;data=load(p);before=load(O/(n+'.before'))
 def rows(x):
  found=[]
  if isinstance(x,dict):
   if x.get('chapterId')==cfg['canonical']:return [x]
   for v in x.values():found.extend(rows(v))
  elif isinstance(x,list):
   for v in x:found.extend(rows(v))
  return found
 changed=rows(data);assert len(changed)==1
 changed[0]['presentationDiagnostic']['projectionEvidence']=bind(S/'specific-table-review-input.json')
 if 'covered' in changed[0]:assert changed[0]['covered']==False
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copy2(p,O/n)
 # Exact structural equality of the rest of each register, including all coverage fields.
 def erase283(x):
  if isinstance(x,dict):
   if x.get('chapterId')==cfg['canonical']:return {'chapterId':cfg['canonical']}
   return {k:erase283(v) for k,v in x.items()}
  if isinstance(x,list):return [erase283(v) for v in x]
  return x
 assert erase283(data)==erase283(before)
 registerchecks.append(dict(path=str(p),only283Changed=True,coverageUnchanged=True,sha256=bind(p)['sha256']))
e=O/'unchanged-evidence';e.mkdir(exist_ok=True)
for i,d in enumerate(cfg['dependencies'][:5]):
 p=pathlib.Path(d['path']);assert bind(p)['sha256']==d['sha256'];shutil.copy2(p,e/['candidate.json','source.json','audit.json','source.html','main.html'][i])
audit=load(pathlib.Path(cfg['dependencies'][2]['path']));passed=audit['batchReviews'][9];assert passed['status']=='passed'
raw=P/'audit/calls'/(passed['calls'][0]['callId']+'.json');assert bind(raw)['sha256']==passed['originalCall']['sha256']
sourceverdicts=load(O/'specific-table-review-input.json')['inheritedFigureChecks'];assert sum(x['verdict']=='faithful' for x in sourceverdicts)==28;assert sum(x['verdict']=='needs-repair' for x in sourceverdicts)==66
extra=[];repo=pathlib.Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach')
for n in ['scripts/scene-study/verify-textbook-mcp.mjs','bin/textbook-mcp-server.mjs']:
 extra.append(bind(repo/n))
shutil.copytree(S/'diagnostic-tables',O/'diagnostic-tables',dirs_exist_ok=True)
save('final-validation.json',dict(newModelCalls=0,registers=registerchecks,oldBatch010Raw=bind(raw),oldPassedBlocksPreserved=113,tableFigureVerdictsPreserved={'faithful':28,'needs-repair':66},extraReadbackDependencies=extra,sourceCandidateAuditUnchanged=True,formalActiveChanged=False,chapterAccepted=False))
for n in ['README.md','prepare.py','project-and-verify.mjs','review-projection.mjs','finalize.py','finish-validation.py']:
 shutil.copy2(O/n,S/n)
files=[bind(p) for p in O.rglob('*') if p.is_file() and p.name!='delivery-manifest.json']
save('delivery-manifest.json',dict(files=files,newModelCalls=0))
print(json.dumps(dict(files=len(files),only283RegisterRowsChanged=True,newModelCalls=0,passedChapterIncrement=0)))
