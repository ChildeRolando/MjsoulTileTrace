import pathlib,json,hashlib,zipfile
d=pathlib.Path(__file__).parent
names=['README.md','isolate-ascii-separators.py','test-separators.py','verify-invariants.py','verify-browser.py','apply.mjs','application.json','invariants.json','browser.json','builder.after.mjs','package.py']
inventory=[{'path':n,'sha256':hashlib.sha256((d/n).read_bytes()).hexdigest(),'bytes':(d/n).stat().st_size} for n in names]
(d/'inventory.json').write_text(json.dumps({'files':inventory,'bookContentIncluded':False},indent=2)+'\n',encoding='utf8')
with zipfile.ZipFile(d/'separator-layout.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(d/n,n)
print(json.dumps({'files':len(names)+1,'zipBytes':(d/'separator-layout.zip').stat().st_size,'bookContentIncluded':False}))
