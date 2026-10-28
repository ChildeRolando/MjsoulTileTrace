import pathlib,json,zipfile,hashlib
d=pathlib.Path('_analysis/p25043')
names=['README.md','.gitattributes','route.mjs','prepare.mjs','owner-check.mjs','integrate.mjs','readback.mjs','rebuild.mjs','publish.mjs','book-map.mjs','verify-final.mjs','finish.mjs','usage.py','package.py','builder.after.mjs','variants.after.json','pre.json','tests.json','owner-check.json','assembly.json','validated.json','readback.json','rebuild.json','rebuild-readback.json','book-map.json','usage.json','repository-checks.json','final-checks.json','publication.json','final.json']
inventory=[{'path':n,'sha256':hashlib.sha256((d/n).read_bytes()).hexdigest(),'bytes':(d/n).stat().st_size} for n in names]
(d/'inventory.json').write_text(json.dumps({'files':inventory,'fullSourceRawImagesIncluded':False},indent=2)+'\n',encoding='utf8')
with zipfile.ZipFile(d/'preview-acceptance.zip','w',zipfile.ZIP_DEFLATED) as z:
 for n in names+['inventory.json']:z.write(d/n,n)
print(json.dumps({'files':len(names)+1,'bytes':(d/'preview-acceptance.zip').stat().st_size,'fullBookContentIncluded':False}))
