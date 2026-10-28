import json,pathlib,hashlib,zipfile
d=pathlib.Path(__file__).parent
names=['README.md','activate.mjs','publication.mjs','publication.test.mjs','rebuild.mjs','full-readback.mjs','verify-browser.py','start-formal.ps1','rollback.mjs','finish.mjs','package.py','before.json','final.json','publication.json','formal-mcp.json','arena-validation.json','browser.json','rebuild.json','rebuild-after.json','release-inputs.json','historical-template-archive.json']
inventory=[{'path':n,'sha256':hashlib.sha256((d/n).read_bytes()).hexdigest(),'bytes':(d/n).stat().st_size} for n in names]
(d/'inventory.json').write_text(json.dumps({'files':inventory,'bookContentIncluded':False},indent=2)+'\n',encoding='utf8')
with zipfile.ZipFile(d/'formal-v43-activation.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(d/n,n)
print(json.dumps({'files':len(names)+1,'bytes':(d/'formal-v43-activation.zip').stat().st_size,'bookContentIncluded':False}))
