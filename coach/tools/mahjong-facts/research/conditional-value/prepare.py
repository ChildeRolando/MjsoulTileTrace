"""Blind/basic-only reproducible input inventory; no labels, answers, helper calls."""
import pathlib,json,hashlib,urllib.parse,collections
R=pathlib.Path('E:/AgentData/Coach');A=R/'llm-information-increment-preflight-20261106/conditional-value';S=R/'llm-defense-ablation-20261104/sample-preparation-v2';B=R/'llm-defense-module-20261104/new200';read=lambda p:json.loads(p.read_text(encoding='utf8'));H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def idx(tile):
 n=int(tile[0]);s=tile[1];return {'m':0,'p':9,'s':18,'z':27}[s]+n-1
def variant(t):
 i=idx(t['id']);return 34+i//9 if t.get('red') else i
def main():
 sample=read(S/'sample-freeze.json');projection=read(S/'projection-receipt.json');pre=read(B/'preflight.json');assert H(S/'sample-freeze.json')=='47bbe56e72e9afec2ce3819c1fd9531d6d8f697c1609a113bc51ed24f7fdb59d';chosen=read(A/'selected20.json');selected={z['caseIndex'] for z in chosen['cases']};assert len(selected)==20
 out=[]
 for i,c in enumerate(sample['cases']):
  name=f"{i:03d}-{c['caseId']}.json";bp=S/'blind'/name;pp=B/'basic'/name;assert H(bp)==projection['results'][i]['blindSha256'] and H(pp)==pre['results'][i]['basicSha256'];blind=read(bp);basic=read(pp);raw=json.loads(blind['messages'][1]['content'])['raw'];assert basic['caseRef']==blind['caseRef'];actor=raw['selfActor'];my=raw['self'];hand=my['concealedTiles']+([my['currentDraw']['tile']] if my['currentDraw'] is not None else []);visible=[]
  visible.extend(hand)
  for river in raw['rivers']:
   for d in river:
    if d['calledByRef'] is None:visible.append(d['tile'])
  for m in raw['melds']:
   if m['kind']=='ankan':visible.extend(m['tiles'])
   elif m['kind'] in ('chi','pon','daiminkan','kakan'):
    visible.append(m['calledTile']);visible.extend(m['consumedTiles']);
    if m['kind']=='kakan':visible.append(m['addedTile'])
   else:raise ValueError('unsupported public meld '+m['kind'])
  visible.extend(raw['doraIndicators']);rules=raw['ruleSet'];red=rules['redFives'];unseen=[4]*34+[red['man'],red['pin'],red['sou']]
  for z in range(3):unseen[4+9*z]-=unseen[34+z]
  for t in visible:
   q=variant(t);unseen[q]-=1
  assert min(unseen)>=0,(i,min(unseen));h=[0]*37
  for t in hand:h[variant(t)]+=1
  expected=set(c['nativeLegalIndices']);actual=set();cands=[]
  for item in basic['candidates']:
   ref=item['actionRef'];a=json.loads(urllib.parse.unquote(ref.removeprefix('action:v1:')));assert a[0]=='discard' and len(a)==3;t={'id':a[1][0],'red':a[1][1]};q=variant(t);assert h[q]>0;actual.add(q);cands.append({'actionRef':ref,'variant':q,'basic':item})
  assert expected==actual and len(cands)==len(expected)==len(actual)
  ownmeld=[m for m in raw['melds'] if m['actor']==actor];status=next(z['status'] for z in raw['riichiStates'] if z['actor']==actor)
  out.append({'caseIndex':i,'caseId':c['caseId'],'caseRef':blind['caseRef'],'selected':i in selected,'blindSha256':H(bp),'basicSha256':H(pp),'hand37':h,'unseen37':unseen,'ownMeldCount':len(ownmeld),'riichiStatus':status,'roundWind':raw['roundWind'],'selfWind':raw['seatWinds'][actor],'dealer':raw['dealer']==actor,'doraIndicators':[idx(t['id']) for t in raw['doraIndicators']],'honba':raw['honba'],'riichiSticks':raw['riichiSticks'],'candidates':cands})
 assert len(out)==200 and sum(len(x['candidates']) for x in out if x['selected'])<=280
 A.mkdir(parents=True,exist_ok=True);(A/'inventory-inputs.json').write_text(json.dumps({'version':'conditional-value-blind-inventory/v1','sampleSha256':H(S/'sample-freeze.json'),'cases':out},ensure_ascii=False,indent=2)+'\n',encoding='utf8');print('200 blind/basic rows',len(out),'selected candidates',sum(len(x['candidates']) for x in out if x['selected']))
if __name__=='__main__':main()
