import pathlib,json,hashlib,subprocess,zipfile
H=pathlib.Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest();m=json.loads((H/'path-map.json').read_bytes());files=[]
for r in m:
 p=H/r['archivePath'];assert sha(p.read_bytes())==r['sha256'];assert len(str(p))<250;files.append((str(p.relative_to(pathlib.Path.cwd())).replace('\\','/'),r['sha256']))
proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE);out,err=proc.communicate(''.join(':'+p+'\n' for p,_ in files).encode());assert proc.returncode==0,err
at=0
for p,h in files:
 end=out.index(b'\n',at);head=out[at:end].decode().split();assert head[1]=='blob';size=int(head[2]);assert sha(out[end+1:end+1+size])==h,p;at=end+size+2
assert at==len(out);assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='agent/mika/coac-248';subprocess.run(['git','merge-base','--is-ancestor','276d1a645f994b752d3effb592aa5faa529fd9b0','HEAD'],check=True)
r={'evidenceFiles':len(files),'allStagedBlobsMatchOriginalByteSha256':True,'windowsArchivePathsUnder250':True,'branch':'agent/mika/coac-248','requiredStartingCommitPreserved':'276d1a645f994b752d3effb592aa5faa529fd9b0','newModelCalls':0,'admissionGranted':False};(H/'stage-verification.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8',newline='\n')
with zipfile.ZipFile(H.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in H.rglob('*'):
  if p.is_file():z.write(p,str(p.relative_to(H)))
print(json.dumps(r))
