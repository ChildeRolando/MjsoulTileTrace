import json,pathlib
D=pathlib.Path('E:/AgentData/Coach/llm-information-increment-preflight-20261106/conditional-value');x=json.loads((D/'inventory-inputs.json').read_text(encoding='utf8'));w=json.loads((D/'witnesses.json').read_text(encoding='utf8'));by={z['caseIndex']:z for z in x['cases']};rows=[r for r in w['rows'] if r['enumeration'] not in ('unsupported_own_meld','unsupported_self_riichi_or_unknown','unknown_wind_or_dealer','unknown_baseline')]
def doratile(t):
 if t<27:return (t//9)*9+(t%9+1)%9
 if t<=30:return 27+(t-27+1)%4
 return 31+(t-31+1)%3
for r in rows:
 c=by[r['caseIndex']];cand=next(z for z in c['candidates'] if z['actionRef']==r['actionRef']);h=c['hand37'][:];h[cand['variant']]-=1;cnt=sum(h[34:]);
 for t in c['doraIndicators']:
  d=doratile(t);cnt+=h[d]+(h[34+d//9] if d<27 and d%9==4 else 0)
 assert cand['basic']['doraCount']==cnt
print('selected supported baseline dora parity PASS',len(rows))
