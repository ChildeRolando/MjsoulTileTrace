import os,json,hashlib,re
from pathlib import Path
B=Path('E:/AgentData/Coach');P=B/'llm-provider-reliability-pilot-20261106/sample-preparation';T=B/'llm-discard-order-final-form-20261106/target-sample';sha=lambda b:hashlib.sha256(b).hexdigest();framepath=T/'final-source-frame.json'; fb=framepath.read_bytes();assert sha(fb)=='52ed8fa0bddff479fc19a294e60dd1337d8a730c77b1e9e5fd0213687f66d2e7';frame=json.loads(fb);cand=frame['candidates'];ids={x['gameId'] for x in cand};hashes={x['sourceHash'] for x in cand};exposedG=set();exposedH=set();sources=[]
for d in sorted(B.iterdir()):
 if not d.is_dir() or not (d.name.startswith(('student-','llm-','scene-','encoder-','ceiling-','sealed-')) or d.name=='auto-research-90-20261104'):continue
 if d.name=='llm-provider-reliability-pilot-20261106':continue
 for base,dirs,files in os.walk(d):
  dirs[:]=sorted(x for x in dirs if x not in ('node_modules','blind','private','private-scoring','features','intents','requests','knowledge','qualifying','synthetic-e2e','synthetic-e2e-before-riichi-declared','fake-study'))
  for n in sorted(files):
   if not n.endswith(('.json','.jsonl')) or not any(s in n for s in ('sample-freeze','screening','prior-index','history-freeze','source-exposures','historical-exclusions','research-read-exclusions')):continue
   p=Path(base)/n;b=p.read_bytes();s=b.decode('utf-8-sig');tokens=set(re.findall(r'rc1_[0-9a-f]{64}|(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])',s));g=tokens&ids;h=tokens&hashes;exposedG.update(g);exposedH.update(h);sources.append({'path':p.as_posix(),'sha256':sha(b),'candidateGameHits':sorted(g),'candidateHashHits':sorted(h)})
# The previous audits bind earlier full exclusions. Mark each exposed game/hash as a pair using the established frame.
for c in cand:
 if c['gameId'] in exposedG or c['sourceHash'] in exposedH:exposedG.add(c['gameId']);exposedH.add(c['sourceHash'])
remaining=[c for c in cand if c['gameId'] not in exposedG and c['sourceHash'] not in exposedH];inventory={'version':'provider-pilot-exclusion-inventory/v1','priorFrameSha256':sha(fb),'priorExclusionInventorySha256':frame['exclusionInventorySha256'],'priorCoverageAuditSha256':frame['coverageAuditSha256'],'sources':sources,'exposedGames':sorted(exposedG),'exposedHashes':sorted(exposedH),'modelCalls':0,'mortalCalls':0};ib=json.dumps(inventory,ensure_ascii=False,separators=(',',':')).encode();(P/'exclusion-inventory.json').open('xb').write(ib)
seed='2026110609';ranked=sorted(({**c,'rank':sha((seed+'|game|'+c['gameId']+':'+c['sourceHash']).encode())} for c in remaining),key=lambda x:(x['rank'],x['gameId']));out={'version':'provider-pilot-source-frame/v1','seed':seed,'priorFrameSha256':sha(fb),'exclusionInventorySha256':sha(ib),'algorithm':'sha256(seed|game|gameId:sourceHash) ascending','candidates':ranked};ob=json.dumps(out,ensure_ascii=False,separators=(',',':')).encode();(P/'source-frame.json').open('xb').write(ob);print(json.dumps({'priorCandidates':len(cand),'exposed':len(exposedG),'remaining':len(ranked),'inventoriedFiles':len(sources),'inventorySha256':sha(ib),'frameSha256':sha(ob)}))
