import json, hashlib, pathlib, zipfile, subprocess
p=pathlib.Path(__file__).resolve().parent
a=json.loads((p/'archive.json').read_text(encoding='utf-8'))
index_bytes=subprocess.check_output(['git','show','agent/mika/coac-249:artifacts/a249-232-human/files.sha256.json'])
index=json.loads(index_bytes)
(p/'scoped-archive-index.json').write_bytes(index_bytes)
allowed={(r['path'].replace('\\','/').casefold(),r['sha256']) for r in index['inputs']}
for r in a:
    path=r['path'].replace('\\','/')
    related=((path.casefold(),r['sha256']) in allowed or '/coac249-232-human-' in path or '/coac248-jp232-human-' in path or '/coac249-232-human-20261028/' in path or path.endswith('/stage-web-textbook.mjs'))
    if (not related or '/snapshot/' in path or '/human-annotations/' in path) and r.get('copy'):
        target=(p/r.pop('copy')).resolve()
        assert target.parent==p and target.name.startswith('e') and target.name[1:].isdigit()
        target.unlink()
        r.update(archived=False,reason='Dependency verified at original data root; packaging restricted to232 scoped evidence/runtime. Unrelated human exports, images and other chapters are not copied.')
(p/'archive.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
with zipfile.ZipFile(p/'evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(p.iterdir()):
        if f.is_file() and f.name not in ['evidence.zip','package.json']:
            z.write(f,f.name)
b=(p/'evidence.zip').read_bytes()
(p/'package.json').write_text(json.dumps({'file':'evidence.zip','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'newModelCalls':0},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'archiveBindings':len(a),'archived':sum(bool(r.get('copy')) for r in a),'zipBytes':len(b)}))
