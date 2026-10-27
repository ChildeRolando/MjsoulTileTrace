"""Create a packaging-only commit from the 248 parent using a private Git index.

Does not check out a branch, change HEAD/index, update a ref, or push.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
STAGE = Path('E:/AgentWorkspaces/Coach/coac269-pfix-b87a3b3af5d1')
PACKAGE = STAGE / 'package/.multica/delivery/coac248-p217-admitted-20261028'
PREFIX = '.multica/delivery/coac248-p217-admitted-20261028/'
BASE = '8baacd3d6b689189d4ab94722535652f4969f786'
env = dict(os.environ)
index = STAGE / 'private-index'
assert not (HERE / 'commit248.json').exists(), 'commit already prepared; do not duplicate'
env['GIT_INDEX_FILE'] = str(index)
git = lambda *args, data=None: subprocess.check_output(['git', *args], input=data, env=env)
assert git('branch', '--show-current').decode().strip() == 'agent/ticket/coac-269'
assert git('rev-parse', 'agent/mika/coac-248').decode().strip() == BASE
git('read-tree', BASE)
old = {}
for row in git('ls-tree', '-r', '-z', BASE, '--', PREFIX.rstrip('/')).split(b'\0'):
    if not row:
        continue
    meta, path = row.split(b'\t')
    mode, _, blob = meta.decode().split()
    old[path.decode()] = (mode, blob)
new = {PREFIX + p.relative_to(PACKAGE).as_posix(): p for p in PACKAGE.rglob('*') if p.is_file()}
renames = json.loads((HERE / 'repack-result.json').read_text())['renames']
assert set(old) - set(new) == {PREFIX + name for name in renames}
for path in set(old) - set(new):
    git('update-index', '--force-remove', '--', path)
for path, file in new.items():
    blob = git('hash-object', '-w', '--stdin', data=file.read_bytes()).decode().strip()
    if path not in old or old[path][1] != blob:
        git('update-index', '--add', '--cacheinfo', old.get(path, ('100644', None))[0], blob, path)
tree = git('write-tree').decode().strip()
changes = git('diff-tree', '--no-commit-id', '--name-only', '-r', BASE, tree).decode().splitlines()
allowed = {PREFIX + name for name in ['.gitattributes', 'README.md', 'evidence-bundle.zip', 'path-map.json', 'verify-package.py']}
allowed |= {PREFIX + name for pair in renames.items() for name in pair}
assert set(changes) == allowed, changes
message = b'[COAC-248] Shorten PDF217 delivery audit paths without changing evidence\n'
commit = git('commit-tree', tree, '-p', BASE, data=message).decode().strip()
result = {'parent': BASE, 'commit': commit, 'tree': tree, 'changedPaths': changes,
          'HEADUnchanged': git('rev-parse', 'HEAD').decode().strip(), 'privateIndex': str(index), 'modelCalls': 0}
(HERE / 'commit248.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result))
