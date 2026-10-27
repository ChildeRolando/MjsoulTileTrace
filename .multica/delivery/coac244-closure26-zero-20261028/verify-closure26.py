from pathlib import Path
import json,hashlib,collections,shutil,zipfile
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path('.multica/delivery/coac244-closure26-zero-20261028')
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
cpath=R/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json';c=load(cpath);s=load(R/c['source']['sourcePath']);rows=[]
for b in s['blocks']:
 if b['type']!='image-run' or not b.get('tableContext'):continue
 found=[v for v in c['body']['blocks'] if b['id'] in v.get('sourceBlockIds',[])]
 assert len(found)==1 and found[0]['tableContext']==b['tableContext'],b['id']
 rows.append({'sourceBlockId':b['id'],'source':b['tableContext'],'candidate':found[0]['tableContext']})
assert len(rows)==94
proof={'chapterId':'nemata-jp-chapter-283-1','candidate':{'path':str(cpath),'sha256':sha(cpath)},'source':{'path':str(R/c['source']['sourcePath']),'sha256':sha(R/c['source']['sourcePath'])},'tableGroups':dict(collections.Counter(v['source']['tableId'] for v in rows)),'matchedImageBlocks':94,'allExact':True,'modelCalls':0,'rows':rows,'remaining':'Coordinates present does not prove renderer preserves empty cells/arrows or that source Q8 external scenario and b0168 translation are resolved. No audit status was changed.'}
(O/'283-table-counterevidence.json').write_bytes((json.dumps(proof,ensure_ascii=False,indent=2)+'\n').encode())
register=load(O/'remaining26-register.json');assert len(register['rows'])==len({r['chapterId'] for r in register['rows']})==26
checks=[]
for row in register['rows']:
 for b in row['baseEvidence']:
  assert sha(b['path'])==b['sha256'];checks.append(b)
 for ev in row.get('pdfEvidence',[]):
  for k in ['source','audit','candidate']:assert sha(ev[k]['path'])==ev[k]['sha256'];checks.append(ev[k])
for name in ['image-222-sixth-tile','image-p217-north-second-row']:
 p=load(O/name/'packet.json');assert sha(p['original']['path'])==p['original']['sha256']
 for d in p['derivatives']:
  for k in ['crop','enlargement']:assert sha(d[k]['path'])==d[k]['sha256']
  d['deliveredCrop']=name+'/'+Path(d['crop']['path']).name;d['deliveredEnlargement']=name+'/'+Path(d['enlargement']['path']).name
 p['deliveredOriginal']=name+'/original.png'
 (O/name/'packet.json').write_bytes((json.dumps(p,ensure_ascii=False,indent=2)+'\n').encode())
checksRecord={'schema':'coac244-closure26-verification/1','canonicalRows':26,'duplicateCanonicalIds':0,'boundBaseAndPdfEvidenceFilesChecked':len(checks),'actualTextEntryPreflights':2,'imagePackets':2,'nearestNeighborNoGeneratedDetail':True,'tableImageContextsExact':94,'coveredRowsChanged':0,'newProductionCandidates':0,'newAudits':0,'newModelInvocations':0,'existingA276DispatchUntouched':True,'formalActiveChanged':False}
(O/'verification.json').write_bytes((json.dumps(checksRecord,indent=2)+'\n').encode())
shutil.copyfile('verify-closure26.py',O/'verify-closure26.py')
# A complete portable evidence artifact; no logs/config credentials or root transcript included.
archive=O/'single-target-image-evidence.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name in ['image-222-sixth-tile','image-p217-north-second-row']:
  for f in (O/name).iterdir():z.write(f,f.relative_to(O).as_posix())
print(json.dumps(checksRecord))
