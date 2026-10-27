import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path('E:/AgentData/Coach/knowledge/processing')

def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))

def digest(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def resolved(p):
    q = Path(p)
    return q if q.is_absolute() else ROOT / q

def images(items):
    result = []
    for x in items:
        p = resolved(x['path'])
        row = dict(x)
        row['exists'] = p.exists()
        if p.exists():
            row['actualSha256'] = digest(p)
            row['hashMatches'] = row['actualSha256'] == x.get('sha256')
            with Image.open(p) as im:
                row['actualDimensions'] = list(im.size)
                source = resolved(x.get('sourcePath', x['path']))
                if source.exists():
                    with Image.open(source) as original:
                        scale = x.get('scale', 1)
                        expected = original.convert('RGBA').resize((original.width * scale, original.height * scale), Image.Resampling.NEAREST)
                        row['exactFullImageNearestNeighbor'] = expected.size == im.size and expected.tobytes() == im.convert('RGBA').tobytes()
        result.append(row)
    return result

def raw_summary(p):
    d = read(p)
    result = {'path':str(p.relative_to(ROOT)), 'sha256':digest(p), 'keys':list(d)}
    for k in ['callId','usage','exitCode','timedOut','unexpectedTool','transportStatus','failureClass','success','durationMs','startedAt','model','reasoningEffort','requestPromptSha256','cliSha256']:
        if k in d:
            result[k] = d[k]
    result['visualInputs'] = images(d.get('visualInputs', []))
    result['binding'] = d.get('binding')
    if d.get('binding'):
        result['supplementalInputs'] = images(d['binding'].get('supplementalInputs',[]))
        source_path = ROOT / 'web-sources/v1' / d['sourceId'] / 'articles' / d['articleId'] / 'source.json'
        source = read(source_path)
        result['sourceFileHashMatches'] = digest(source_path) == d['binding']['sourceFileSha256']
        original_ids = d['binding'].get('originalImageAssetIds',[])
        result['originalInputs'] = images([{'assetId':a['assetId'],'path':'web-sources/v1/'+a['path'],'sourcePath':'web-sources/v1/'+a['path'],'sha256':a['sha256'],'role':'original','scale':1,'width':a.get('width'),'height':a.get('height')} for a in source['assets'] if a['assetId'] in original_ids])
    result['rawEventTypes'] = [e.get('type') for e in d.get('events', [])]
    result['rawOutputModelFields'] = [{k:e[k] for k in ['model','model_id','provider'] if k in e} for e in d.get('events', []) if any(k in e for k in ['model','model_id','provider'])]
    result['stderr'] = d.get('stderr', '')[:3500]
    result['rawVerdict'] = {k:v for k,v in d.get('parsedOutput', d.get('output',{})).items() if k in ['summary','issues','completeArticleCompared','semanticCompleteness','figureChecks']}
    result['promptBytes'] = len(d.get('requestPrompt','').encode())
    result['promptHasReplacementCharacter'] = '\ufffd' in d.get('requestPrompt','')
    return result

selection = read(ROOT / 'integration/current-web-candidate-selection.json')
report = {'schema':'coac244-vision-chain-file-evidence/1','scope':'081-8,128-14,145-4,205-5 sampled existing calls; no new model calls', 'cases':[], 'production':[]}
for x in selection['candidates']:
    if not any(z in x.get('candidateSha256','') for z in ['d1fc1ea8','c14911aa','07a511d4']):
        continue
    audit_path = resolved(x['auditPath'])
    audit = read(audit_path)
    case = {'selection':x,'candidateHashMatches':digest(resolved(x['candidatePath'])) == x['candidateSha256'], 'auditSha256':digest(audit_path), 'auditStatus':audit['status'], 'method':audit.get('method'), 'verification':audit.get('verification'), 'calls':audit.get('calls'), 'exactReuse':audit.get('exactReuse'), 'auditor':audit.get('auditor'), 'verifiedAssets':audit.get('verifiedAssets'), 'revisionInheritance':audit.get('productionCall',{}).get('revision'), 'modelChecks':audit.get('modelChecks'), 'issues':audit.get('modelReview',{}).get('issues'), 'figureChecks':audit.get('modelReview',{}).get('figureChecks'), 'recovery':{k:v for k,v in audit.items() if 'recover' in k.lower() or 'transport' in k.lower()}}
    case['rawCalls'] = []
    for call in audit.get('calls',[]):
        p = ROOT / 'audit/calls' / (call['callId']+'.json')
        if p.exists():
            case['rawCalls'].append(raw_summary(p))
            case['rawReviewEqualsReceipt'] = read(p).get('output') == audit.get('modelReview')
            if x.get('transportRecovery'):
                case['originalCallHashMatches'] = digest(p) == x['transportRecovery']['originalCall']['sha256']
    report['cases'].append(case)
for call_id in ['64227eb7-60cb-482f-a24b-0f26ce33fa51','21f6e4f9-868e-4bcf-82ad-91d904d95cd6','c1a7d02f-b322-48df-96f9-a80a1ea8a8cf','358f4e70-5660-4e0c-8918-6ad8a4287011']:
    p = ROOT / 'web-production/v1/raw-calls' / (call_id+'.json')
    if p.exists():
        report['production'].append(raw_summary(p))
Path('vision-chain-file-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for c in report['cases']:
    print('CASE',c['selection']['candidateSha256'][:8],c['auditStatus'],'bound',c['candidateHashMatches'],'audit',c['auditSha256'])
    print('METHOD',json.dumps(c['method'],ensure_ascii=True))
    for raw in c['rawCalls']:
        print('AUDIT RAW',raw['callId'],'visuals',len(raw['visualInputs']),'keys',raw['keys'],'verdict',json.dumps(raw['rawVerdict'],ensure_ascii=True)[:1000])
        print('IMAGES',[(x['width'],x['height'],x.get('hashMatches'),x.get('exactFullImageNearestNeighbor')) for x in raw['visualInputs']])
for c in report['production']:
    print('PRODUCTION',c['callId'],'visuals',len(c['visualInputs']),'exit',c.get('exitCode'),'images',[(x['width'],x['height'],x.get('hashMatches'),x.get('exactFullImageNearestNeighbor')) for x in c['visualInputs']])
