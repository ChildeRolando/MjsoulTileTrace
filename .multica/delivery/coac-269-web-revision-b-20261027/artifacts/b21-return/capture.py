"""Read-only capture of the two existing independent review results; no model calls."""
import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = pathlib.Path('E:/AgentData/Coach/knowledge/processing')
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

h = capture(ROOT/'integration/coac249-283-10171181-reviewed-20261028.json',
    '6b466c5f6ec7552960fd321f74c4016fd51f62c802437e4ca7657623ca80cf1f', 'result.json')
s = capture(ROOT/'integration/coac249-283-10171181-scope-inheritance-20261028.json',
    'a5765f56d01f99f16a54819a0c2ff674e2828a861acf234e8cc1d148336efae9', 'inheritance.json')
producer = capture(h['handoff']['path'], h['handoff']['sha256'], 'producer-handoff.json')
refs(producer)
refs(h)
refs(s)
manifest = load(h['runtime']['path'])
assert len(manifest['files']) == 32
refs(manifest['files'])
capture(ROOT/'integration/coac250-283-396962-effective-issues-20261028.json',
    '6d122aa508b6eb57a4122472c52bd96ee78e1b54ec8d1299ac77c0aa1e688617', 'remaining-parent.json')
for result in h['results']:
    raw = load(result['raw']['path'])
    refs(raw['requestExecution']['images'])
(HERE/'.gitattributes').write_text('* -text whitespace=cr-at-eol\n', encoding='utf-8')
(HERE/'captured.json').write_text(json.dumps(dict(bindings=bindings, newModelCalls=0), indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(capturedFiles=len(bindings), frozenFiles=32, newModelCalls=0)))
