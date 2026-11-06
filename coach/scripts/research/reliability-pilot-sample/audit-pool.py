import json,pathlib,collections,hashlib
P=pathlib.Path('E:/AgentData/Coach/llm-provider-reliability-pilot-20261106/sample-preparation');rows=json.loads((P/'sample-freeze.json').read_text(encoding='utf8'))['cases'];checks=[];skips=0
for c in rows:
 blind=json.loads((P/'blind'/c['name']).read_text(encoding='utf8'));raw=json.loads(blind['messages'][1]['content'])['raw'];x=json.loads((P/'screen-cases'/c['caseId']/'math-input.json').read_text(encoding='utf8'))['cases'][0];visible=collections.Counter();usedrefs={}
 def add(tile):assert isinstance(tile,dict) and isinstance(tile['red'],bool);visible[tile['id']]+=1
 for t in raw['self']['concealedTiles']:add(t)
 if raw['self']['currentDraw'] is not None:add(raw['self']['currentDraw']['tile'])
 for t in raw['doraIndicators']:add(t)
 for m in raw['melds']:
  ts=m['tiles'] if m['kind']=='ankan' else [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else [])
  for t in ts:add(t)
  if m['kind']!='ankan':usedrefs[m['calledDiscardEventRef']]=m['meldRef']
 for river in raw['rivers']:
  for discard in river:
   if discard['calledByRef'] is None:add(discard['tile'])
   else:assert usedrefs[discard['sourceRef']]==discard['calledByRef'];skips+=1
 codes=[str(i)+s for s in 'mps' for i in range(1,10)]+[str(i)+'z' for i in range(1,8)];assert all(0<=visible[t]<=4 for t in codes);unseen=[4-visible[t] for t in codes];assert unseen==x['unseen34'];checks.append({'caseIndex':c['index'],'unseenTotal':sum(unseen),'poolMatch':True})
out={'version':'provider-pilot-public-pool-audit/v1','status':'pass','cases':len(checks),'matched':len(checks),'calledRiverEventsExcluded':skips,'checks':checks,'modelCalls':0,'mortalCalls':0};f=P/'public-pool-audit.json';f.open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'cases':len(checks),'calledRiverEventsExcluded':skips,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()}))
