"""Read-only comparison of the bound JPEG originals and already-reviewed PNGs."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path('E:/AgentData/Coach/knowledge/processing')
out = Path('_analysis/coac250-246')
pre = json.loads((out / 'preconsume.json').read_text(encoding='utf-8'))
candidate = json.loads(Path(pre['candidate']['path']).read_text(encoding='utf-8'))
results = []
for figure in candidate['figures']:
    assert len(figure['sourceAssetBindings']) == 1
    source = figure['sourceAssetBindings'][0]
    presentation = figure['presentationAsset']
    assert presentation['derivation']['kind'] == 'single-source-image-rgba-to-png'
    assert presentation['derivation']['sourceAssetBindings'] == figure['sourceAssetBindings']
    source_bytes = (root / source['path']).read_bytes()
    png_bytes = (root / presentation['path']).read_bytes()
    assert hashlib.sha256(source_bytes).hexdigest() == source['sha256']
    assert hashlib.sha256(png_bytes).hexdigest() == presentation['sha256']
    with Image.open(root / source['path']) as original, Image.open(root / presentation['path']) as png:
        assert original.format == 'JPEG' and png.format == 'PNG'
        assert getattr(original, 'n_frames', 1) == getattr(png, 'n_frames', 1) == 1
        original.load()
        png.load()
        assert original.size == png.size
        rgba = original.convert('RGBA').tobytes()
        assert rgba == png.convert('RGBA').tobytes()
        results.append({
            'figureId': figure['figureId'],
            'sourcePath': source['path'],
            'sourceSha256': source['sha256'],
            'sourceMime': 'image/jpeg',
            'presentationPath': presentation['path'],
            'presentationSha256': presentation['sha256'],
            'presentationMime': 'image/png',
            'width': original.width,
            'height': original.height,
            'rgbaSha256': hashlib.sha256(rgba).hexdigest(),
            'exactRgba': True,
            'reusedReviewedPresentationBytes': True,
            'newImageWrites': 0,
        })
assert len(results) == 5
(out / 'presentation-pixels.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='')
print(json.dumps({'passed': True, 'exactJpegPngPairs': len(results), 'imageEdits': 0, 'modelCalls': 0}))
