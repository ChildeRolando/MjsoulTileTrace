"""Preserve Git blob bytes where git archive applied checkout EOL conversion.

Only touches this run's exported staging package, before a ref has been changed.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
STAGE = Path('E:/AgentWorkspaces/Coach/coac269-pfix-b87a3b3af5d1')
PACKAGE = STAGE / 'package/.multica/delivery/coac248-p217-admitted-20261028'
PREFIX = '.multica/delivery/coac248-p217-admitted-20261028/'
BASE = '8baacd3d6b689189d4ab94722535652f4969f786'
sha = lambda b: hashlib.sha256(b).hexdigest()
assert subprocess.check_output(['git','rev-parse','agent/mika/coac-248']).decode().strip() == BASE
manifest_path = PACKAGE / 'path-map.json'
manifest = json.loads(manifest_path.read_text())
reverse = {x['packagePath']: x['originalPackagePath'] for x in manifest['inputs'].values()}
corrected = []
blobs = {}
for row in subprocess.check_output(['git','ls-tree','-r','-z',BASE,'--',PREFIX.rstrip('/')]).split(b'\0'):
    if row:
        meta,path = row.split(b'\t')
        blobs[path.decode()] = meta.decode().split()[2]
for item in manifest['unchangedFiles']:
    name = item['path']
    original = PREFIX + reverse.get(name, name)
    blob = subprocess.check_output(['git','cat-file','blob',blobs[original]])
    path = PACKAGE / name
    if path.read_bytes() != blob:
        corrected.append(name)
        path.write_bytes(blob)
    item['sha256'] = sha(blob)
assert set(corrected) <= {'.gitattributes','instruction249.md','tests.log'}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
archive_path = PACKAGE / 'evidence-bundle.zip'
with zipfile.ZipFile(archive_path) as archive:
    entries = [(i.filename, archive.read(i.filename)) for i in archive.infolist()]
with zipfile.ZipFile(archive_path,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,raw in entries:
        archive.writestr(name,manifest_path.read_bytes() if name=='path-map.json' else raw)
result = json.loads((HERE/'repack-result.json').read_text())
result['manifestSha256'] = sha(manifest_path.read_bytes())
result['newArchiveSha256'] = sha(archive_path.read_bytes())
result['archiveExportTextConversionCorrectedBeforeCommit'] = corrected
(HERE/'repack-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'restoredOriginalGitBlobBytes':corrected,'modelCalls':0}))
