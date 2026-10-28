"""Validate an evidence input against immutable pins and the latest saved event; never apply it."""
from pathlib import Path
import argparse,json
from observations import load,sha,verify_for_use
O=Path(__file__).resolve().parent
def verify(item,candidate_sha,application_input=False):
    m=load(O/'manifest.json')
    for f in m['files']:
        p=O/f['path'];assert sha(p.read_bytes())==f['sha256'],'package changed: '+f['path']
    for f in load(O/'input-bindings.json')['files']:assert sha(Path(f['path']).read_bytes())==f['sha256'],'source/parent/image/evidence changed: '+f['path']
    # Reading the live append-only file cannot edit a user's in-flight browser form.
    live=Path('E:/AgentData/Coach/knowledge/human-annotations/events.jsonl').read_bytes()
    assert not live or live.endswith(b'\n'),'incomplete append: retry a new read, never accept a partial last event'
    events=[json.loads(b) for b in live.splitlines() if b.strip()]
    return verify_for_use(load(O/'human-evidence.json'),item,candidate_sha,events,application_input=application_input)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('item');p.add_argument('candidate_sha');p.add_argument('--application-input',action='store_true');a=p.parse_args()
    print(json.dumps(verify(a.item,a.candidate_sha,a.application_input),ensure_ascii=False))
