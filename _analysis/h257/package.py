import json, hashlib, pathlib, shutil, zipfile
p=pathlib.Path(__file__).resolve().parent
root=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
owner=json.loads((root/'integration/coac269-human257261-consumed-20261028.json').read_text(encoding='utf-8'))
a=json.loads((p/'archive.json').read_text(encoding='utf-8'))
extra=[owner['p261']['originalAdjudication'],owner['p261']['verification']['independentEvidence'],owner['p261']['verification']['candidate'],owner['p257']['verification']['candidate'],owner['p257']['rawMachine'],owner['p257']['originalIndependentRaw']]
extra.extend([{'path':str(root/'integration/coac244-311-source-gap-20261028'/name),'sha256':sha} for name,sha in [('minimal-gap-map.json','3f64c9a720b2c83cdd9f4e0caebefaaf2365137543e1249b59b57a8ef5ebe82c'),('source-readback.json','4d774701f59fe5db838c0bbe8e9ad8700c2c9655d01df2ffff2fe5268cd51efb')]])
for r in extra:
    data=pathlib.Path(r['path']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==r['sha256']
    if any(x['path']==r['path'] for x in a): continue
    name=f'e{len(a):03}'
    (p/name).write_bytes(data)
    a.append({'path':r['path'],'sha256':r['sha256'],'bytes':len(data),'copy':name})
(p/'archive.json').write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with zipfile.ZipFile(p/'evidence.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(p.iterdir()):
        if f.is_file() and f.name not in ['evidence.zip','package.json']:
            z.write(f,f.name)
b=(p/'evidence.zip').read_bytes()
(p/'package.json').write_text(json.dumps({'file':'evidence.zip','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'newModelCalls':0},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'archiveFiles':len(a),'zipBytes':len(b)}))
