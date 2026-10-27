import json,hashlib
from pathlib import Path
from PIL import Image
root=Path('E:/AgentData/Coach/knowledge/processing')
packet=root/'integration/coac244-next3-193208276-zero-20261028'
handoff=json.loads((root/'integration/coac249-193208276-reviewed-20261028.json').read_text(encoding='utf-8'))
checks=[]
for item in handoff['results']:
    req=json.loads(Path(item['request']['path']).read_text(encoding='utf-8'))
    projection=json.loads(req['prompt'][req['prompt'].index('{'):])
    for pt in projection['points']:
        asset=next(x['asset'] for x in projection['assets'] if x['figureId']==pt['figureId'])
        original=root/asset['path']
        assert hashlib.sha256(original.read_bytes()).hexdigest()==asset['sha256']
        with Image.open(original) as im: rgba=im.convert('RGBA')
        for deriv in pt['derivations']:
            crop=rgba.crop(tuple(deriv['bbox']))
            actual=packet/deriv['copy'];scaled=packet/deriv['nearest4']
            assert hashlib.sha256(actual.read_bytes()).hexdigest()==deriv['sha256']
            assert hashlib.sha256(scaled.read_bytes()).hexdigest()==deriv['nearest4Sha256']
            with Image.open(actual) as im:assert im.convert('RGBA').tobytes()==crop.tobytes()
            with Image.open(scaled) as im:assert im.convert('RGBA').tobytes()==crop.resize((crop.width*4,crop.height*4),Image.Resampling.NEAREST).tobytes()
        checks.append(dict(key=item['key'],pointId=pt['id'],bbox=pt['bbox'],targetAndNeighborAndNearest4Exact=True))
Path('_analysis/n3/pixels.json').write_text(json.dumps(dict(passed=True,points=checks,newImagesGenerated=0,newModels=0),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(passed=True,points=len(checks),models=0)))
