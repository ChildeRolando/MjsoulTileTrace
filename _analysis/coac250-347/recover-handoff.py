"""Recover upstream committed handoff bytes without switching branches or model calls."""
import hashlib, json, os, subprocess
from pathlib import Path
out = Path('_analysis/coac250-347')
commit = 'e61a3a8af63505e82afc106c4cf9f074c89d05fe'
prefix = '.multica/delivery/coac244-text-347-155-20261027/'
files = {}
for name in ('handoff-250.json', 'handoff-250.md', '250-wakeup-receipt.json'):
    data = subprocess.check_output(['git', 'show', commit+':'+prefix+name])
    (out/('upstream-'+name)).write_bytes(data)
    files[name] = hashlib.sha256(data).hexdigest()
actual = Path('E:/AgentData/Coach/knowledge/processing/integration/coac244-reviewed-text347-155-20261027.json').read_bytes()
assert actual == (out/'upstream-handoff-250.json').read_bytes()
assert files['handoff-250.json'] == '9394aca872a7a8b712198ef3e141915e4a4bde5fa7fc5172edb97cb5e00172b8'
env = dict(os.environ)
for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'): env.pop(key, None)
issue = json.loads(subprocess.check_output(['multica', 'issue', 'get', '01a17471-25e6-7731-a529-3df99acf3d42', '--output', 'json'], env=env))
description = issue['description']
assert files['handoff-250.json'] in description
(out/'issue-description-readback.json').write_text(json.dumps({'issueId':issue['id'],'revision':issue['revision'],'status':issue['status'],'description':description},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
proof = {'upstreamCommit':commit,'files':files,'currentDataBytesEqualCommittedHandoff':True,'issueRevision':issue['revision'],'currentIssueBindsCorrectedSha':True,'initialTriggerSha':'764263dbcdb6ccbfae4792d3e5a57702c4cb44eedd3b208c0da9d45abb072a5a','correctedSha':files['handoff-250.json'],'reason':'Upstream archive repackaged timestamp; explicit upstream correction and current issue bind the corrected SHA. Candidate/source/audit/raw bindings require independent verification; initial handoff bytes were not reconstructed.'}
(out/'handoff-correction-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(proof))
