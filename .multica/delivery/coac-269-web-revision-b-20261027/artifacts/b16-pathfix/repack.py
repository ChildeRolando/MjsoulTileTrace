"""Only repackage an exported 248 delivery tree; never execute its build/finalize scripts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

OUT = Path(__file__).resolve().parent
STAGE = Path('E:/AgentWorkspaces/Coach/coac269-pfix-b87a3b3af5d1')
PACKAGE = STAGE / 'package/.multica/delivery/coac248-p217-admitted-20261028'
PREFIX = 'integration/coac248-p217-admitted-20261028'
ORIGINAL = '8baacd3d6b689189d4ab94722535652f4969f786'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))

assert not (PACKAGE / 'path-map.json').exists(), 'do not repack twice'
admission = load(PACKAGE / 'native-inline-field-corrections.p217.root-acceptance.json')
archive_prefix = '.multica/delivery/coac248-p217-admitted-20261028/'
original_files = {}
for row in subprocess.check_output(['git','ls-tree','-r','-z',ORIGINAL,'--',archive_prefix.rstrip('/')]).split(b'\0'):
    if row:
        meta,path = row.split(b'\t')
        original_files[path.decode().removeprefix(archive_prefix)] = subprocess.check_output(['git','cat-file','blob',meta.decode().split()[2]])
rename = {}
inputs = {}
source_checks = []
for key, binding in admission['inputs'].items():
    old = binding['path'].removeprefix(PREFIX + '/')
    new = f'evidence/{key}/audit.json' if key in ['parentAudit', 'rev1Audit', 'rev2Audit', 'rev3Audit'] else old
    raw = original_files[old]
    assert sha(raw) == binding['sha256']
    source_path = Path(binding['originalPath'])
    if source_path.exists():
        assert sha(source_path.read_bytes()) == binding['sha256']
        source_checks.append({'id': key, 'verifiedFrom': str(source_path)})
    else:
        # The original revision-chain path was in an already removed Multica worktree.
        # Its admitted processing-root copy retains the exact original bytes/hash.
        source_copy = Path('E:/AgentData/Coach/knowledge/processing') / binding['path']
        assert sha(source_copy.read_bytes()) == binding['sha256']
        source_checks.append({'id': key, 'verifiedFrom': str(source_copy), 'originalEphemeralPathMissing': True})
    inputs[key] = {'processingPath': binding['path'], 'originalPath': binding['originalPath'],
                   'originalPackagePath': old, 'packagePath': new,
                   'sha256': binding['sha256'], 'bytes': len(raw)}
    if old != new:
        target = PACKAGE / new
        assert target.resolve().is_relative_to(PACKAGE.resolve())
        if target.exists():
            assert target.read_bytes() == raw and not (PACKAGE / old).exists()
        else:
            (PACKAGE / old).rename(target)
        rename[old] = new
assert len(rename) == 4

manifest = {'schema': 'coac248-p217-delivery-path-map/1',
            'originalCommit': ORIGINAL, 'processingPrefix': PREFIX,
            'originalArchiveSha256': sha(original_files['evidence-bundle.zip']),
            'scope': 'Delivery paths only. Immutable JSON references retain original processing paths; resolve package copies using inputs[*].packagePath.',
            'inputs': inputs,
            'unchangedFiles': [{'path': rename.get(path, path), 'sha256': sha(raw)} for path, raw in sorted(original_files.items()) if path not in ['.gitattributes', 'README.md', 'evidence-bundle.zip']]}
(PACKAGE / '.gitattributes').write_text('* -text whitespace=cr-at-eol\n*.py text eol=lf\n*.mjs text eol=lf\n', encoding='utf-8', newline='\n')
(PACKAGE / 'path-map.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
shutil.copyfile(OUT / 'verify-package.py', PACKAGE / 'verify-package.py')
readme = (PACKAGE / 'README.md').read_text(encoding='utf-8')
readme += '''

Delivery path repair (COAC-269, zero model calls): four historical audit copies now use
`evidence/{parentAudit,rev1Audit,rev2Audit,rev3Audit}/audit.json` so Windows Multica
worktrees can check out this branch without long-path configuration changes.
`path-map.json` maps every one of the 29 input bindings to its package path, full original
processing path and SHA256. The ZIP uses the same short paths and includes the map.
Original JSON references still identify the immutable processing-root evidence; when
reading a package copy, resolve them through `inputs[*].packagePath` in this map.
Candidate, raw, audit, admission, runtime, build/finalize scripts and all their hashes
are unchanged. Do not rerun build/finalize to repair packaging; those historical scripts
also write processing data. No files in the processing root were changed by this repair.

Read-only package check (no processing root or model needed):

```powershell
python ./verify-package.py
```
'''
(PACKAGE / 'README.md').write_text(readme, encoding='utf-8', newline='\n')
# Keep the original ZIP byte-for-byte in owned staging, outside the delivered tree.
(STAGE / 'original-bundle.zip').write_bytes(original_files['evidence-bundle.zip'])
with zipfile.ZipFile(STAGE / 'original-bundle.zip') as oldzip, zipfile.ZipFile(PACKAGE / 'evidence-bundle.zip', 'w', zipfile.ZIP_DEFLATED) as newzip:
    for info in oldzip.infolist():
        name = rename.get(info.filename, info.filename)
        payload = (PACKAGE / name).read_bytes() if name in ['README.md', '.gitattributes'] else oldzip.read(info.filename)
        newzip.writestr(name, payload)
    for name in ['path-map.json', 'verify-package.py']:
        newzip.writestr(name, (PACKAGE / name).read_bytes())

for old, new in rename.items():
    assert sha(original_files[old]) == sha((PACKAGE / new).read_bytes())
for name, raw in original_files.items():
    if name not in rename and name not in ['.gitattributes', 'README.md', 'evidence-bundle.zip']:
        assert (PACKAGE / name).read_bytes() == raw
with zipfile.ZipFile(STAGE / 'original-bundle.zip') as oldzip, zipfile.ZipFile(PACKAGE / 'evidence-bundle.zip') as newzip:
    for name in oldzip.namelist():
        if name not in ['README.md', '.gitattributes']:
            assert oldzip.read(name) == newzip.read(rename.get(name, name))
receipt = {'modelCalls': 0, 'originalCommit': ORIGINAL, 'renames': rename,
           'originalInputHashesPreserved': 29, 'immutableSourceFilesChanged': False,
           'originalSourceChecks': source_checks,
           'candidateSha256': sha((PACKAGE / 'page-0217.rev6.json').read_bytes()),
           'originalArchiveSha256': sha(original_files['evidence-bundle.zip']),
           'newArchiveSha256': sha((PACKAGE / 'evidence-bundle.zip').read_bytes()),
           'manifestSha256': sha((PACKAGE / 'path-map.json').read_bytes())}
(OUT / 'repack-result.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
print(json.dumps(receipt))
