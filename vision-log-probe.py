import json, collections, hashlib, re
from pathlib import Path

out = {'schema':'coac244-host-vision-log-evidence/1','logs':[],'runtimeRuns':[]}
for label in ['p257','081','b8','b9']:
    path = Path('platform-'+label+'.json')
    if not path.exists() or not path.stat().st_size:
        continue
    data=json.loads(path.read_text(encoding='utf-8-sig'))
    uses={x.get('call_id'):x for x in data if x['type']=='tool_use'}
    summary={'label':label,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'events':len(data),'first':data[0]['created_at'],'last':data[-1]['created_at'],'throughSeq':data[-1]['seq'],'types':dict(collections.Counter(x['type'] for x in data)),'toolCounts':dict(collections.Counter(x['tool'] for x in uses.values())),'imageResults':[],'pixelTools':[],'visualClaims':[],'scriptsAndCalls':[]}
    for x in data:
        if x['type']=='tool_result':
            payload=x.get('output',x.get('content',''))
            if isinstance(payload,str):
                try:payload=json.loads(payload)
                except (ValueError,TypeError):pass
            blocks=payload if isinstance(payload,list) else []
            image_blocks=[b for b in blocks if isinstance(b,dict) and b.get('type')=='image']
            clipped = isinstance(payload,str) and payload.startswith('[{"type":"image","source":{"type":"base64"')
            if clipped:
                image_blocks=[{'type':'image','source':{'type':'base64','data':''}}]
            if image_blocks:
                use=uses.get(x.get('call_id'),{})
                summary['imageResults'].append({'seq':x['seq'],'at':x['created_at'],'tool':use.get('tool'),'input':use.get('input'),'platformOutputClipped':clipped,'loggedOutputLength':len(x.get('output','')),'blocks':[{'type':b['type'],'sourceType':b.get('source',{}).get('type'),'mediaType':b.get('source',{}).get('media_type'),'base64Length':len(b.get('source',{}).get('data','')) if not clipped else None} for b in image_blocks]})
        if x['type']=='tool_use':
            s=json.dumps(x.get('input',{}),ensure_ascii=False)
            if any(t in s.lower() for t in ['corrcoef','correlation','digit-half','pixel','像素']):
                summary['pixelTools'].append({'seq':x['seq'],'at':x['created_at'],'input':s[:2600]})
            if any(t in s for t in ['textbook-production-web.mjs','textbook-audit-web','production-b','_produce','audit.mjs','dispatch','round-20261027T1245']):
                summary['scriptsAndCalls'].append({'seq':x['seq'],'at':x['created_at'],'input':s[:1800]})
        if x['type'] in ['text','thinking']:
            s=x.get('content','')
            if any(t in s for t in ['我自己','我看','我复读','6x','8x','目视','0 模型','0模型','visual','visually','I can see','I see']):
                summary['visualClaims'].append({'seq':x['seq'],'at':x['created_at'],'text':s[:3500]})
    out['logs'].append(summary)
    print(label,'events',len(data),'tools',summary['toolCounts'],'image_results',len(summary['imageResults']),'pixel_tools',len(summary['pixelTools']),'claims',len(summary['visualClaims']))
    print('IMAGE EXAMPLES',json.dumps(summary['imageResults'][:2],ensure_ascii=True))
    print('CLAIMS',json.dumps(summary['visualClaims'][-3:],ensure_ascii=True)[:4300])
for label in ['244','249','248','269']:
    p=Path('platform-'+label+'.json')
    if not p.exists() or not p.stat().st_size:continue
    for x in json.loads(p.read_text(encoding='utf-8-sig')):
        if x.get('started_at','') and x['started_at']>='2026-10-27T11:00:00Z':
            out['runtimeRuns'].append({'issue':label,**{k:x.get(k) for k in ['id','agent_id','runtime_id','created_at','started_at','completed_at','status','work_dir','usage']}})
Path('vision-host-log-evidence.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
