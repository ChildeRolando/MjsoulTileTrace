import pathlib,json,hashlib,subprocess,zipfile
H=pathlib.Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((H/'path-map.json').read_bytes());files=[]
v=json.loads((H/'verification.json').read_bytes());assert v['independentCall']['binding']['scope']=='cn234-b0003-text-only-r1';assert v['independentCall']['scope']=='textbook-cn234-independent-text-r1';assert v['scopeSidecar']['metadataBindingOnly'] is True
for r in m:
 p=H/r['archivePath'];assert sha(p.read_bytes())==r['sha256'];assert len(str(p))<250;files.append((str(p.relative_to(pathlib.Path.cwd())).replace('\\','/'),r['sha256']))
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE);out,err=proc.communicate(''.join(':'+p+'\n' for p,_ in files).encode());assert proc.returncode==0,err
at=0
for p,h in files:
 end=out.index(b'\n',at);head=out[at:end].decode().split();assert head[1]=='blob';size=int(head[2]);assert sha(out[end+1:end+1+size])==h,p;at=end+size+2
assert at==len(out);assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='agent/mika/coac-248';subprocess.run(['git','merge-base','--is-ancestor','fbfca09e1bac8d6018af961f670d82f4695e770e','HEAD'],check=True)
inv='.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json';before=json.loads(subprocess.check_output(['git','show','fbfca09e1bac8d6018af961f670d82f4695e770e:'+inv]));after=json.loads(pathlib.Path(inv).read_bytes());after.pop('cn234IndependentIntake')
for row in after['objects']:
 if row.get('chapterId')=='79-cn-chapter-234-12':row.pop('cn234IndependentIntake');row['currentDisposition']=next(r for r in before['objects'] if r.get('chapterId')=='79-cn-chapter-234-12')['currentDisposition']
assert after==before,'Unrelated inventory scope changed'
r={'evidenceFiles':len(files),'allStagedBlobsMatchOriginalByteSha256':True,'actual234BindingScopeVerified':True,'allNonTargetInventoryObjectsAndOrderPreserved':True,'windowsArchivePathsUnder250':True,'branch':'agent/mika/coac-248','requiredStartingCommitPreserved':'fbfca09e1bac8d6018af961f670d82f4695e770e','newModelCalls':0,'admissionGranted':False};(H/'stage-verification.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8',newline='\n')
with zipfile.ZipFile(H.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in H.rglob('*'):
  if p.is_file():z.write(p,str(p.relative_to(H)))
print(json.dumps(r))
