"""Prepare the explicitly requested source-image attachment without committing book assets."""
import ast, hashlib, json, subprocess, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
load = lambda p: json.loads(Path(p).read_bytes())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
packet = load(HERE / 'packet.json')
root = Path(packet['path'])
for name in ('build.py', 'verify.py', 'package.py'):
    ast.parse((HERE / name).read_text(encoding='utf-8'))
result = subprocess.run(['multica', 'issue', 'wakeup', 'get',
    '01a1746d-cf4a-7ecc-9fae-3d4c2b55c39f', '01a1825a-2e3c-7dc5-9005-67025d9150ea',
    '--output', 'json'], capture_output=True, check=True)
wake = json.loads(result.stdout)
assert wake['filter_task_id'] == '01a1824d-ee2e-72db-90b2-8b79a057bdea'
assert wake['mode'] == 'once' and wake['agent_id'] == 'b144c077-cadd-4749-a53d-4b9cb98191b8'
assert wake['instruction'].strip() == (HERE / 'root-handoff.md').read_text(encoding='utf-8').strip()
receipt = {k: wake.get(k) for k in ('id','issue_id','agent_id','kind','mode','filter_task_id',
    'enabled','fire_count','last_task_id','last_task_status','created_at','last_error')}
receipt['instructionSha256'] = sha(HERE / 'root-handoff.md')
receipt['delivery'] = 'Existing root owner intake after its already-queued run; no independent review dispatch'
(HERE / 'root-delivery.json').write_bytes((json.dumps(receipt, ensure_ascii=False, indent=2) + '\n').encode())
archive = Path.cwd() / 'pdf257-20-target-source-check.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as out:
    for p in sorted(root.rglob('*')):
        if p.is_file():
            out.write(p, p.relative_to(root).as_posix())
    out.write(HERE / 'root-handoff.md', 'README-root-review.md')
    out.write(HERE / 'verification.json', 'verification.json')
with zipfile.ZipFile(archive) as inp:
    assert inp.testzip() is None
    assert len([n for n in inp.namelist() if n.startswith('crops/')]) == 20
    for p in sorted(root.rglob('*')):
        if p.is_file():
            assert hashlib.sha256(inp.read(p.relative_to(root).as_posix())).hexdigest() == sha(p)
delivery = {'pdf': packet['pdf'], 'zip': {'filename': archive.name,'sha256': sha(archive),'bytes': archive.stat().st_size},
    'zipByteVerified': True, 'newModelCalls': 0, 'rootWakeup': receipt['id'],
    'rootReviewComplete': False, 'candidateModified': False, 'admissionGranted': False}
(HERE / 'delivery.json').write_bytes((json.dumps(delivery, ensure_ascii=False, indent=2) + '\n').encode())
print(json.dumps(delivery))
