import json,hashlib,collections
from pathlib import Path
P=Path('E:/AgentData/Coach/llm-discard-order-final-form-20261106/target-sample'); rec=json.loads((P/'scan-receipt.json').read_text(encoding='utf8'));frame=json.loads((P/'final-source-frame.json').read_text(encoding='utf8'));inv=json.loads((P/'exclusion-inventory.json').read_text(encoding='utf8'));games=set(inv['games']);hashes=set(inv['hashes']);seenG=set();seenH=set();total=0
assert rec['status']=='shortfall' and rec['publicWindows']==20000 and len(rec['eligible'])==12
for a in rec['eligible']:
 p=P/'qualifying'/(a['caseId']+'.json');b=p.read_bytes();assert hashlib.sha256(b).hexdigest()==a['candidateSha256'];x=json.loads(b);assert x['gameId']==a['gameId'] and x['sourceHash']==a['sourceHash'] and x['gameId'] not in games and x['sourceHash'] not in hashes and x['gameId'] not in seenG and x['sourceHash'] not in seenH;seenG.add(x['gameId']);seenH.add(x['sourceHash']);r=x['result'];assert r['eligible'];o=r['observation'];v=o['visibleState'];assert o['decision']['selfActor']==x['actor'] and o['decision']['windowKind']=='self_turn' and len(v['self']['concealedTiles'])==13 and v['self']['currentDraw'] and len(v['rivers'][x['actor']])<=11 and not any(z['actor']==x['actor'] for z in v['melds']) and all(z['status']=='none' for z in v['riichiStates']);assert len(r['binding']['candidates'])>=2;ids={z['actionRef'] for z in r['binding']['candidates']};assert len(ids)==len(r['binding']['candidates']) and all(z['action']['kind']=='discard' for z in r['binding']['candidates']);assert len(x['witness'])>0
 hand=collections.Counter(t['id'] for t in v['self']['concealedTiles']+[v['self']['currentDraw']['tile']]);hand.subtract(x['edge']);assert all(n>=0 for n in hand.values())
 for witness in x['witness']:
  assert len(witness)==5 and sum(z[0]=='ryanmen' for z in witness)==2 and sum(z[0]=='pair' for z in witness)==1
  assert sum(z[0] in ('sequence','triplet') for z in witness)==2
  actual=collections.Counter(t for _,tiles in witness for t in tiles);assert actual==+hand
  for kind,tiles in witness:
   if kind=='triplet':assert len(tiles)==3 and len(set(tiles))==1
   elif kind=='pair':assert len(tiles)==2 and len(set(tiles))==1
   else:
    assert all(len(t)==2 and t[1] in 'mps' and t[1]==tiles[0][1] for t in tiles);ranks=[int(t[0]) for t in tiles]
    if kind=='sequence':assert len(ranks)==3 and ranks[1:]==[ranks[0]+1,ranks[0]+2] and ranks[0]<=7
    elif kind=='ryanmen':assert len(ranks)==2 and 2<=ranks[0]<=7 and ranks[1]==ranks[0]+1
    else:raise AssertionError('unknown witness block')
 refTile={z['actionRef']:z['action']['tile']['id'] for z in r['binding']['candidates']}
 for pair in r['basicPairs']:
  assert {refTile[z['actionRef']] for z in pair}==set(x['edge'])
  assert len(pair)==2 and all(z['status']=='available' and z['actionRef'] in ids for z in pair) and pair[0]['shanten']==pair[1]['shanten'] and pair[0]['unseenTotal']==pair[1]['unseenTotal'] and pair[0]['doraCount']==pair[1]['doraCount'];total+=1
out={'version':'target-shortfall-structural-audit/v1','status':'pass','completedGames':12,'distinctGames':len(seenG),'distinctSourceHashes':len(seenH),'qualifyingBasicPairs':total,'checks':['candidate file digests','historical identity and content exclusion','distinct game/hash','public closed self turn, river and riichi constraints','native complete discard candidate bindings','witness exact independent multiset and block verification','equal helper shanten/unseen/dora for edge pair'],'limits':'validates retained witness directly; does not independently recalculate helper; not a frozen 60 cohort','modelCalls':0,'scoreCalls':0};(P/'shortfall-audit-v2.json').open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out))
