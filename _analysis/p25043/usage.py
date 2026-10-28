import json,pathlib,hashlib,collections
root=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
baseline=root/'integration/full-coverage-and-usage.json'
base=json.loads(baseline.read_text(encoding='utf8')); calls={}; duplicates=0; conflicts=[]
def add(row,evidence):
 global duplicates
 identity=row.get('identity',row)
 cid=row.get('callId')
 key=cid or 'legacy:'+hashlib.sha256(json.dumps({k:identity.get(k) for k in ['model','startedAt','sourceId','page','attempt','outputSha256']},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
 usage=row.get('usage'); success=row.get('success',identity.get('success'))
 item={'callId':cid,'identityKey':key,'usage':usage,'success':success,'model':row.get('model'),'failure':row.get('failure'),'evidence':evidence,'timedOut':row.get('timedOut',False)}
 if key in calls:
  duplicates+=1; old=calls[key]
  if old['usage'] is not None and usage is not None and old['usage']!=usage: conflicts.append(key)
  if usage is not None or old['usage'] is None: calls[key]=item
 else: calls[key]=item
for i,row in enumerate(base['calls']):add(row,{'path':str(baseline),'index':i})
paths={root/'audit/calls.jsonl',root/'production/calls.jsonl',root/'web-production/v1/calls.jsonl'}
paths.update((root/'production').glob('*/calls.jsonl'))
paths.update((root/'production').glob('*/*/calls.jsonl'))
paths.update((root/'web-production').glob('*/calls.jsonl'))
bindings=[]
for path in sorted(paths):
 if not path.exists():continue
 blob=path.read_bytes();bindings.append({'path':str(path),'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob)})
 for i,line in enumerate(blob.decode('utf-8-sig').splitlines()):
  if line.strip():add(json.loads(line),{'path':str(path),'line':i+1})
totals={k:{'knownSum':sum((x['usage'] or {}).get(k,0) or 0 for x in calls.values()),'unknownCalls':sum((x['usage'] or {}).get(k) is None for x in calls.values())} for k in ['inputTokens','cachedInputTokens','outputTokens']}
result={'schema':'coac250-observed-call-accounting/1','newCallsThisIntegration':0,'uniqueObservedIdentities':len(calls),'duplicateRecordsIgnored':duplicates,'usageConflicts':sorted(set(conflicts)),'legacyFingerprints':sum(x['callId'] is None for x in calls.values()),'recordedSuccess':sum(x['success'] is True for x in calls.values()),'recordedUnsuccessful':sum(x['success'] is False for x in calls.values()),'successUnknown':sum(x['success'] is None for x in calls.values()),'totals':totals,'ledgerBindings':bindings,'baseline':{'path':str(baseline),'sha256':hashlib.sha256(baseline.read_bytes()).hexdigest()},'fee':'unknown','upstreamExecutions':'unknown','remoteWeights':'unknown','completeProviderBillingClaimed':False,'note':'Observed retained ledgers plus earlier accounting snapshot, deduplicated by actual callId; no-id records retain explicit legacy fingerprint. Failed/void and missing usage are retained. This is a bounded observed-accounting report, not a claim that unrecorded remote executions or fees are known.'}
assert not conflicts, sorted(set(conflicts))
pathlib.Path('_analysis/p25043/usage.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:result[k] for k in ['uniqueObservedIdentities','duplicateRecordsIgnored','recordedUnsuccessful','totals','fee','newCallsThisIntegration']}))
