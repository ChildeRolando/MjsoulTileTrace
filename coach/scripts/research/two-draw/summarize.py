import json,pathlib,collections,itertools,hashlib,statistics
p=pathlib.Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/two-draw');source=pathlib.Path('E:/AgentData/Coach/llm-defense-ablation-20261104/sample-preparation-v2');x=json.loads((p/'full-results.json').read_text(encoding='utf8'));sample=json.loads((source/'sample-freeze.json').read_text(encoding='utf8'));rows=0; comparators=0;gainpos=0;bad=[];same1pairs=0;diff1pairs=0;same2pairs=0;diff2pairs=0;group1=group2=0;scene1=set();scene2=set();redpairs=0;redmismatch=0;payloadSizes=[];incremental=[];examples=[];qtargets=0
for scene in x['scenes']:
 assert scene['status']=='available';N=scene['unseenTotal'];smin=scene['sceneMinShanten'];groups=collections.defaultdict(list)
 for c in scene['candidates']:
  rows+=1;groups[(c['baseShanten'],c['basicUkeire'])].append(c)
  for z in c['targets']:assert z['denominator']==N*(N-1) and 0<=z['numerator']<=z['denominator']
  if c['baseShanten']==smin:
   z=c['targets'][0];E=c['basicUkeire'];fixed=E*(2*N-E-1);delta=z['numerator']-fixed;comparators+=1;gainpos+=delta>0
   if delta<0:bad.append((scene['index'],c['actionRef'],delta))
   incremental.append({'index':scene['index'],'actionRef':c['actionRef'],'baseShanten':c['baseShanten'],'basicUkeire':E,'target':z['target'],'unseenTotal':N,'denominator':z['denominator'],'optimizedNumerator':z['numerator'],'frozenHandNumerator':fixed,'gainNumerator':delta})
 for key,items in groups.items():
  if len(items)<2:continue
  qtargets+=1
  for a,b in itertools.combinations(items,2):
   same1pairs+=1
   if a['targets'][0]['numerator']!=b['targets'][0]['numerator']:
    diff1pairs+=1;scene1.add(scene['index'])
    if len(examples)<3:examples.append({'index':scene['index'],'baseShanten':key[0],'basicUkeire':key[1],'target':a['targets'][0]['target'],'denominator':a['targets'][0]['denominator'],'a':{'tile':a['tile'],'numerator':a['targets'][0]['numerator']},'b':{'tile':b['tile'],'numerator':b['targets'][0]['numerator']}})
   if len(a['targets'])==2:
    same2pairs+=1
    if a['targets'][1]['numerator']!=b['targets'][1]['numerator']:diff2pairs+=1;scene2.add(scene['index'])
  if len({z['targets'][0]['numerator'] for z in items})>1:group1+=1
  if len(items[0]['targets'])==2 and len({z['targets'][1]['numerator'] for z in items})>1:group2+=1
 for a,b in itertools.combinations(scene['candidates'],2):
  if a['tile']['id']==b['tile']['id'] and a['tile']['red']!=b['tile']['red']:
   redpairs+=1
   if [(q['target'],q['numerator']) for q in a['targets']]!=[(q['target'],q['numerator']) for q in b['targets']]:redmismatch+=1
 payload={'caseRef':scene['caseRef'],'assumption':'两次自身摸牌；未知池等交换且不放回；不含他家动作、荣和、役种或得点；-1仅完整牌形。','targets':scene['targets'],'candidates':[{'actionRef':r['actionRef'],'baseShanten':r['baseShanten'],'targets':[{'target':z['target'],'numerator':z['numerator'],'denominator':z['denominator']} for z in r['targets']]} for r in scene['candidates']]};payloadSizes.append(len(json.dumps(payload,ensure_ascii=False,separators=(',',':')).encode()))
assert not bad and redmismatch==0 and rows==208
h=lambda q:hashlib.sha256(q.read_bytes()).hexdigest();(p/'adaptivity-check.json').write_text(json.dumps({'version':'two-draw-adaptivity-check/v1','rows':incremental,'negativeGainCount':len(bad)},ensure_ascii=False,indent=2)+'\n',encoding='utf8');out={'version':'two-draw-summary/v1','cases':len(x['scenes']),'candidateRows':rows,'selectedOrder':[s['index'] for s in x['scenes']],'availableCases':sum(s['status']=='available' for s in x['scenes']),'baselineShantenUkeireMismatches':x['mismatches'],'first14Checks':x['counts']['first14Checks'],'first14Mismatch':x['counts']['first14Mismatch'],'counts':x['counts'],'fullElapsedMs':x['elapsedMs'],'redCandidates':sum(r['tile']['red'] for s in x['scenes'] for r in s['candidates']),'sameTileDifferentRedPairs':redpairs,'redStructuralMismatches':redmismatch,'comparatorCandidates':comparators,'comparatorNegativeGain':len(bad),'comparatorPositiveGain':gainpos,'sameBasicGroups':qtargets,'sameBasicCandidatePairs':same1pairs,'firstTargetDifferentPairs':diff1pairs,'firstTargetDifferentGroups':group1,'firstTargetDifferentScenes':len(scene1),'secondTargetEligiblePairs':same2pairs,'secondTargetDifferentPairs':diff2pairs,'secondTargetDifferentGroups':group2,'secondTargetDifferentScenes':len(scene2),'estimatedAdditionalPayloadBytes':{'min':min(payloadSizes),'median':statistics.median(payloadSizes),'max':max(payloadSizes),'scope':'compact illustrative JSON of assumption, absolute targets, candidate references, base shanten and exact numerators/denominators only; not assembled full provider request'},'examples':examples,'fullResultsSha256':h(p/'full-results.json'),'adaptivityCheckSha256':h(p/'adaptivity-check.json')};(p/'summary.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(out,ensure_ascii=False))
