"""Freeze a review-only Q12 image-context entry; never mutate the dispatched runtime."""
from pathlib import Path
import hashlib
import json
import shutil
import difflib

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
BASE = ROOT / 'audit/runtimes/coac269-283-b0168-exact-v1-20261028'
DEST = ROOT / 'audit/runtimes/coac269-283-b0168-review-v1-20261028'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
manifest = BASE / 'b0168-runtime-manifest.json'
assert sha(manifest) == 'b1adb8d85258c8518f1f4df731debe48c20b180241fce8e9f56d7592433d55f4'
for f in load(manifest)['files']:
    assert sha(f['path']) == f['sha256']
assert not DEST.exists(), 'immutable review snapshot already exists'
shutil.copytree(BASE, DEST)
auditor = DEST / 'textbook-audit-web.mjs'
old = auditor.read_text(encoding='utf-8')
needle = ' const s={...source,blocks:selectedBlocks,assets:source.assets.filter(a=>groupAssetIds.has(a.assetId)&&!knownAssetIds.includes(a.assetId)),tables:'
replacement = ''' // Q12 b0168-only context: attach the unchanged original North-dora and 4s images.
 const q12Exact=source.sourceId==='modern-yabejp-ja'&&source.articleId==='chapter06-exercise003'&&candidate.source.sourceSha256==='8e7eff57a85e84fb963209117689b07fec5efd9b5d7ee81c12f1fd3a44b497de'&&revision.parentSha256==='dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899'&&revision.notesSha256==='749e242c54019cb6b855a03e6df4fe465bed86e1cf50d7869be548a3b0144d40'&&group.batchId==='chapter06-exercise003-batch-002'&&JSON.stringify(revision.textBlockIds)===JSON.stringify(['modern-yabejp-ja:chapter06-exercise003:b0168'])&&(revision.figureIds??[]).length===0;
 const contextAssets=new Set(q12Exact?selectedBlocks.filter(b=>['modern-yabejp-ja:chapter06-exercise003:b0153','modern-yabejp-ja:chapter06-exercise003:b0169'].includes(b.id)).flatMap(b=>b.images??[]).map(i=>i.assetId):[]);
 if(q12Exact&&contextAssets.size!==2)throw Error('b0168_original_image_context_missing');
 const s={...source,blocks:selectedBlocks,assets:source.assets.filter(a=>groupAssetIds.has(a.assetId)&&(!knownAssetIds.includes(a.assetId)||contextAssets.has(a.assetId))),tables:'''
assert old.count(needle) == 1
new = old.replace(needle, replacement)
auditor.write_text(new, encoding='utf-8', newline='\n')
(OUT / 'review-context.patch').write_text(''.join(difflib.unified_diff(old.splitlines(True), new.splitlines(True), fromfile='production-frozen/textbook-audit-web.mjs', tofile='review-frozen/textbook-audit-web.mjs')), encoding='utf-8')
official = ROOT / 'audit/runtimes/coac244-vision-terra-max-v1-20261027/textbook-audit-web.mjs'
(OUT / 'deferred-identity.patch').write_text(''.join(difflib.unified_diff(official.read_text(encoding='utf-8').splitlines(True), old.splitlines(True), fromfile='244-vision/textbook-audit-web.mjs', tofile='production-frozen/textbook-audit-web.mjs')), encoding='utf-8')
files = [{'name': p.name, 'path': str(p), 'sha256': sha(p)} for p in sorted(DEST.iterdir()) if p.is_file() and p.name not in ['runtime-manifest.json','b0168-runtime-manifest.json']]
review = {'schema': 'coac269-b0168-review-context-runtime/1', 'productionManifest': {'path': str(manifest), 'sha256': sha(manifest)}, 'visionPolicyManifest': load(manifest)['base'], 'authorizationComment': '01a17f08-ea29-7998-9b93-505223235e4e', 'modelRoutingUnchanged': True, 'changes': ['two original Q12 images retained as context despite unchanged-parent asset inheritance; exact source/parent/audit/target binding only'], 'files': files}
path = DEST / 'b0168-review-runtime-manifest.json'
path.write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(OUT / 'review-runtime-manifest.json').write_bytes(path.read_bytes())
print(json.dumps({'manifestPath': str(path), 'manifestSha256': sha(path), 'modelCalls': 0}))
