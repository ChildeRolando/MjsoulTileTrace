"""Negative checks for package resolution; all mutations stay in temporary memory/files."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
PACKAGE = Path('E:/AgentWorkspaces/Coach/coac269-pfix-b87a3b3af5d1/package/.multica/delivery/coac248-p217-admitted-20261028')
spec = importlib.util.spec_from_file_location('package_verifier', HERE / 'verify-package.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
assert module.verify(PACKAGE)['renamed'] == 4
results = ['complete package and ZIP: pass']
with tempfile.TemporaryDirectory(prefix='coac269-pkg-') as temp:
    copy = Path(temp) / 'package'
    shutil.copytree(PACKAGE, copy)
    manifest_path = copy / 'path-map.json'
    original = manifest_path.read_bytes()
    for name, mutate in [
        ('missing mapping', lambda m: m['inputs'].pop('parentAudit')),
        ('wrong SHA', lambda m: m['inputs']['parentAudit'].update(sha256='0'*64)),
        ('unsafe traversal', lambda m: m['inputs']['parentAudit'].update(packagePath='../audit.json')),
        ('duplicate path', lambda m: m['inputs']['rev1Audit'].update(packagePath=m['inputs']['parentAudit']['packagePath'])),
    ]:
        data = json.loads(original)
        mutate(data)
        manifest_path.write_text(json.dumps(data), encoding='utf-8')
        try:
            module.verify(copy)
        except (AssertionError, KeyError, FileNotFoundError):
            results.append(name + ': rejected')
        else:
            raise AssertionError(name + ' incorrectly accepted')
    manifest_path.write_bytes(original)
    target = copy / 'evidence/parentAudit/audit.json'
    saved = target.read_bytes()
    target.write_bytes(saved + b' ')
    try:
        module.verify(copy)
    except AssertionError:
        results.append('changed audit bytes: rejected')
    else:
        raise AssertionError('changed audit accepted')
receipt = {'passed': True, 'cases': results, 'modelCalls': 0}
(HERE / 'package-tests.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
print(json.dumps(receipt))
