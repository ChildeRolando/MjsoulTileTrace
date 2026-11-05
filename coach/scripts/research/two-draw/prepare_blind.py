"""Build fixed blind/basic-only two-draw input. No private/scoring/model archives read."""
import hashlib,json,pathlib,urllib.parse,sys
src=pathlib.Path('E:/AgentData/Coach/llm-defense-ablation-20261104/sample-preparation-v2'); basics=pathlib.Path('E:/AgentData/Coach/llm-defense-module-20261104/new200/basic');out=pathlib.Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/two-draw');out.mkdir(parents=True,exist_ok=True)
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();s=src/'sample-freeze.json';assert h(s)=='47bbe56e72e9afec2ce3819c1fd9531d6d8f697c1609a113bc51ed24f7fdb59d';cases=json.loads(s.read_text(encoding='utf8'))['cases']; chosen=sorted(enumerate(cases),key=lambda t:(hashlib.sha256(('2026110601\0'+t[1]['caseId']).encode()).digest(),t[1]['caseId']))[:20]
def tileid(t):
 if not isinstance(t,dict) or set(t)!={'id','red'} or type(t['red']) is not bool:raise ValueError('tile_unknown')
 v=t['id'];n=int(v[0]);kind=v[1];assert kind in 'mpsz' and 1<=n<=(7 if kind=='z' else 9);assert not t['red'] or (kind in 'mps' and n==5)
 return 'mpsz'.index(kind)*9+n-1
def meldtiles(m):
 if m['kind']=='ankan':return m['tiles']
 if m['kind'] not in ('chi','pon','daiminkan','kakan'):raise ValueError('unknown_meld_kind')
 return [m['calledTile']]+m['consumedTiles']+([m['addedTile']] if m['kind']=='kakan' else [])
rows=[]
for i,c in chosen:
 name=f'{i:03}-{c["caseId"]}.json';bp=src/'blind'/name;ap=basics/name;blind=json.loads(bp.read_text(encoding='utf8'));basic=json.loads(ap.read_text(encoding='utf8'));raw=json.loads(blind['messages'][1]['content'])['raw'];assert blind['caseId']==c['caseId'] and basic['caseRef']==blind['caseRef']; own=raw['selfActor'];selfm=[m for m in raw['melds'] if m['actor']==own];assert len(raw['rivers'])==4 and len(raw['riichiStates'])==4
 hand=raw['self']['concealedTiles']+[raw['self']['currentDraw']['tile']]; assert len(hand)==14-3*len(selfm)
 used=[0]*34
 def add(t):used[tileid(t)]+=1
 for t in hand:add(t)
 for t in raw['doraIndicators']:add(t)
 for m in raw['melds']:
  for t in meldtiles(m):add(t)
 called={m['calledDiscardEventRef'] for m in raw['melds'] if m['kind']!='ankan'}
 for river in raw['rivers']:
  for r in river:
   if r['calledByRef'] is None:add(r['tile'])
   else:assert r['sourceRef'] in called
 assert all(0<=x<=4 for x in used);unseen=[4-x for x in used]
 roots=[]
 for x in basic['candidates']:
  action=json.loads(urllib.parse.unquote(x['actionRef'][len('action:v1:'):]))
  assert action[0]=='discard' and len(action)==3 and action[2] in ('tedashi','tsumogiri');tile={'id':action[1][0],'red':action[1][1]};assert tile in hand;ti=tileid(tile)
  if action[2]=='tsumogiri':assert tile==raw['self']['currentDraw']['tile']
  roots.append({'actionRef':x['actionRef'],'tile':tile,'tile34':ti,'discardMode':action[2],'basic':x})
 native=sorted((34+'mps'.index(x['tile']['id'][1]) if x['tile']['red'] else x['tile34']) for x in roots);assert native==sorted(c['nativeLegalIndices']), (i,native,c['nativeLegalIndices'])
 counts=[0]*34
 for t in hand:counts[tileid(t)]+=1
 ownmeld=[0]*34
 for m in selfm:
  for t in meldtiles(m):ownmeld[tileid(t)]+=1
 riichi=raw['riichiStates'][own];assert riichi['actor']==own
 rows.append({'index':i,'caseId':c['caseId'],'caseRef':blind['caseRef'],'blindSha256':h(bp),'basicSha256':h(ap),'ownRiichi':riichi['status'],'ownMeldCount':len(selfm),'rootHand34':counts,'ownMeldTiles34':ownmeld,'unseen34':unseen,'candidates':roots})
path=out/'blind-inputs.json';path.write_text(json.dumps({'version':'two-draw-blind-input/v1','seed':'2026110601','cases':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'selected':[x['index'] for x in rows],'cases':len(rows),'candidates':sum(len(x['candidates']) for x in rows),'blindInputsSha256':h(path)}))
