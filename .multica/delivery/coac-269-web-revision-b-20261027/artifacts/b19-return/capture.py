"""Read-only capture of the two existing independent review results; no model calls."""
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
PIN = '283ff5fd945c7ec5be57e5822a49f657be81d75e'
sha = lambda b: hashlib.sha256(b).hexdigest()
load = lambda p: json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
bindings = []
seen = {}

def capture(path, expected=None, name=None):
    path = pathlib.Path(path)
    if not path.is_absolute():
        path = ROOT / path
    data = path.read_bytes()
    digest = sha(data)
    if expected:
        assert digest == expected, str(path)
    key = str(path.resolve()).lower()
    if key not in seen or (name and name != seen[key]):
        name = name or f'in/{len(bindings):03d}{path.suffix}'
        target = HERE / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        bindings.append(dict(name=name, path=str(path), sha256=digest, bytes=len(data)))
        seen[key] = name
    return load(path) if path.suffix == '.json' else None

def refs(value):
    if isinstance(value, dict):
        if isinstance(value.get('path'), str) and isinstance(value.get('sha256'), str):
            capture(value['path'], value['sha256'])
        for v in value.values():
            refs(v)
    elif isinstance(value, list):
        for v in value:
            refs(v)

total = capture(ROOT/'integration/coac249-283-targets-and-159242-proof-20261028.json',
    'daf6806291fdeab42f0e490acfac072bded84aaae8b01cd228710405383d3894', 'handoff.json')
h = capture(total['chapter283']['result']['path'], total['chapter283']['result']['sha256'], 'result.json')
s = capture(total['chapter283']['scopeInheritance']['path'], total['chapter283']['scopeInheritance']['sha256'], 'inheritance.json')
refs(h)
refs(s)
manifest = load(h['runtime']['path'])
assert len(manifest['files']) == 32
refs(manifest['files'])
register = h['inheritedEvidence']['Q8']['register']
capture(register['path'], register['sha256'], 'remaining-parent.json')
for result in h['results']:
    raw = load(result['raw']['path'])
    refs(raw['requestExecution']['images'])
for name in ['actual-process.json', 'actual-process-2.json', 'actual-request-0.json',
             'actual-request-1.json', 'cli-result-0.json', 'cli-result-1.json',
             'guard-released.json', 'dispatch244.json', 'dispatch250.json', 'dispatch269.json']:
    source = 'artifacts/a249-283-compliance/' + name
    data = subprocess.check_output(['git', 'show', PIN + ':' + source])
    (HERE/name).write_bytes(data)
    bindings.append(dict(name=name, gitCommit=PIN, gitPath=source, sha256=sha(data), bytes=len(data)))
(HERE/'.gitattributes').write_text('* -text whitespace=cr-at-eol\n', encoding='utf-8')
(HERE/'captured.json').write_text(json.dumps(dict(bindings=bindings, newModelCalls=0), indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(capturedFiles=len(bindings), frozenFiles=32, newModelCalls=0)))
