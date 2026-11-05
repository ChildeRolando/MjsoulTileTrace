import json,subprocess
from pathlib import Path
src=Path('scripts/research/discard-order-targets/continue-sample.py').read_text(encoding='utf8');env={'__file__':str(Path('scripts/research/discard-order-targets/continue-sample.py').resolve())};exec(src.split('oldpath=')[0],env);P=env['P'];item=env['frame']['candidates'][173];reader=subprocess.Popen(['node','scripts/research/discard-order-targets/read-one.mjs'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,encoding='utf8');reader.stdin.write(json.dumps(item)+'\n');reader.stdin.flush();data=json.loads(reader.stdout.readline())['raw'];reader.stdin.close();reader.wait();hands=[[],[],[],[]];meld=[0]*4;rivers=[0]*4;riichi=[False]*4;roundord=-1;count=0
for ordinal,line in enumerate(data.splitlines()):
 e=json.loads(line);typ=e.get('type');a=e.get('actor')
 if typ=='start_kyoku':roundord+=1;wind=e['bakaze'];hands=[list(z) for z in e['tehais']];meld=[0]*4;rivers=[0]*4;riichi=[False]*4
 elif typ=='tsumo':
  count+=1;hands[a].append(e['pai'])
  if count==613:
   assert wind=='W' and not meld[a] and rivers[a]<=11 and not any(riichi);w=env['shapes'](hands[a]);assert w
   out={**item,'ordinal':ordinal,'roundOrdinal':roundord,'actor':a,'edge':w[0][0]};(P/'west-failing-window.json').open('x',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'roundWind':wind,'actor':a,'roundOrdinal':roundord,'ordinal':ordinal,'windowInGame':count,'edge':w[0][0]}));break
 elif typ=='dahai':hands[a].remove(e['pai']);rivers[a]+=1
 elif typ=='reach':riichi[a]=True
 elif typ in ('chi','pon','daiminkan','ankan'):
  for v in e['consumed']:hands[a].remove(v)
  meld[a]+=1
 elif typ=='kakan':hands[a].remove(e['pai'])
else:raise RuntimeError('failed_window_not_found')
