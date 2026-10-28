import pathlib,json,hashlib,subprocess,zipfile
H=pathlib.Path(__file__).resolve().parent;sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((H/'path-map.json').read_bytes());files=[]
for r in m:
 p=H/r['archivePath'];assert sha(p.read_bytes())==r['sha256'];assert len(str(p))<250;files.append((str(p.relative_to(pathlib.Path.cwd())).replace('\\','/'),r['sha256']))
cmd=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
out,err=cmd.communicate(''.join(':'+p+'\n' for p,_ in files).encode());assert cmd.returncode==0,err
at=0
for p,h in files:
 end=out.index(b'\n',at);head=out[at:end].decode().split();assert head[1]=='blob',head;size=int(head[2]);b=out[end+1:end+1+size];assert sha(b)==h,p;at=end+size+2
assert at==len(out)
assert subprocess.check_output(['git','branch','--show-current'],text=True).strip()=='agent/mika/coac-248'
subprocess.run(['git','merge-base','--is-ancestor','0c7a9a3a44e0f33d7175b633a1633070616d0eb3','HEAD'],check=True)
result={'evidenceFiles':len(files),'allStagedBytesMatchRecordedSha256':True,'allArchiveWindowsPathsBelow250':True,'branch':'agent/mika/coac-248','requiredStartingCommitIsAncestor':True,'modelCalls':0}
(H/'stage-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
with zipfile.ZipFile(H.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for p in H.rglob('*'):
  if p.is_file() and '__pycache__' not in str(p):z.write(p,str(p.relative_to(H)))
print(json.dumps(result))
