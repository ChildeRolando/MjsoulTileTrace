import json,pathlib,collections,itertools
p=pathlib.Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/two-draw');inp=json.loads((p/'blind-inputs.json').read_text(encoding='utf8'));res=json.loads((p/'full-results.json').read_text(encoding='utf8'));src={s['index']:s for s in inp['cases']};summary={};pairs=diff1=diff2=0;scenes1=set();scenes2=set();ex=[]
for s in res['scenes']:
 originals={c['actionRef']:c['basic'] for c in src[s['index']]['candidates']};groups=collections.defaultdict(list)
 for c in s['candidates']:
  b=originals[c['actionRef']];key=json.dumps({k:b.get(k) for k in ['status','shanten','effectiveTiles','unseenTotal','doraCount']},sort_keys=True,separators=(',',':'));groups[key].append(c)
 for group in groups.values():
  for a,b in itertools.combinations(group,2):
   pairs+=1
   if a['targets'][0]['numerator']!=b['targets'][0]['numerator']:
    diff1+=1;scenes1.add(s['index']);
    if len(ex)<3:ex.append({'index':s['index'],'a':a['tile'],'b':b['tile'],'basicShanten':a['baseShanten'],'basicUkeire':a['basicUkeire'],'target':a['targets'][0]['target'],'numerators':[a['targets'][0]['numerator'],b['targets'][0]['numerator']],'denominator':a['targets'][0]['denominator']})
   if len(a['targets'])>1 and a['targets'][1]['numerator']!=b['targets'][1]['numerator']:diff2+=1;scenes2.add(s['index'])
summary={'version':'two-draw-same-full-basic-differences/v1','basicEquivalenceFields':['status','shanten','effectiveTiles including per-tile unseen','unseenTotal','doraCount'],'pairs':pairs,'firstTargetDifferentPairs':diff1,'firstTargetDifferentScenes':len(scenes1),'secondTargetDifferentPairs':diff2,'secondTargetDifferentScenes':len(scenes2),'examples':ex,'scope':'structural equality of per-candidate archived basic content excluding actionRef; not a proof of decision usefulness'};(p/'same-full-basic.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(summary,ensure_ascii=False))
