import json,gzip,hashlib,collections
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-conditional-score-full-preflight-20261106');H=lambda b:hashlib.sha256(b).hexdigest();sample=json.loads((P/'sample/sample-freeze.json').read_text(encoding='utf8'));mask=json.loads((P/'applicability-mask.json').read_text(encoding='utf8'));receipt=json.loads((P/'run/receipt.json').read_text(encoding='utf8'));assert mask['sampleSha256']==H((P/'sample/sample-freeze.json').read_bytes()) and len(mask['cases'])==200 and len(sample['cases'])==79;by={c['selectionIndex']:c for c in sample['cases']};rows=[];counts=collections.Counter()
for x in mask['cases']:
 if x['selectionIndex'] is None:row={**x,'moduleStatus':'not_evaluated_outside_public_prefilter'}
 else:
  c=by[x['selectionIndex']];f=P/'run'/f"{c['selectionIndex']:03}-{c['caseId']}-evidence.json.gz";assert c['caseIndex']==x['caseIndex'] and c['caseId']==x['caseId'];
  if not f.exists():row={**x,'moduleStatus':'unavailable_not_started'}
  else:
   b=f.read_bytes();e=json.loads(gzip.decompress(b));assert e['summary']['caseId']==c['caseId'] and len(e['roots'])==len(c['candidates']);statuses=collections.Counter(v['status'] for v in e['roots']);allgood=e['summary']['status']=='complete' and statuses=={'available':len(c['candidates'])};row={**x,'moduleStatus':'available_complete' if allgood else 'unavailable_incomplete','sceneStatus':e['summary']['status'],'candidateStatuses':dict(statuses),'evidenceSha256':H(b)}
 counts[row['moduleStatus']]+=1;rows.append(row)
assert len(rows)==200 and counts['not_evaluated_outside_public_prefilter']==121
out={'version':'conditional-score-final-applicability/v1','sampleSha256':H((P/'sample/sample-freeze.json').read_bytes()),'initialMaskSha256':H((P/'applicability-mask.json').read_bytes()),'runReceiptSha256':H((P/'run/receipt.json').read_bytes()),'counts':dict(counts),'cases':rows,'noModelCalls':True,'noMortalCalls':True,'note':'For future input planning only: unavailable or outside scope requires unchanged baseline; no Arena inputs built.'};f=P/'final-applicability-mask.json';f.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'counts':dict(counts),'sha256':H(f.read_bytes())}))
