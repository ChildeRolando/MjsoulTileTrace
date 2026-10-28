"""Pin only224/232 source/parent/real audit and exact permitted edits. No image inference."""
import hashlib,json,shutil,importlib.util
from pathlib import Path
ROOT=Path('E:/AgentData/Coach/knowledge/processing');HERE=Path(__file__).resolve().parent
BASE=ROOT/'audit/runtimes/coac244-vision-production-schema-v2-20261028'
RT=ROOT/'audit/runtimes/coac269-224232-exact-v1-20261028';STAGE=ROOT/'web-production/v1/runs/coac269-224232-exact-v1-20261028'
UP=ROOT/'integration/coac244-ready109167-zero-20261028'
load=lambda p:json.loads(Path(p).read_bytes());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def bind(p):return {'path':str(p),'sha256':sha(p),'bytes':Path(p).stat().st_size}
def save(p,x):
    with Path(p).open('x',encoding='utf-8',newline='\n') as f:json.dump(x,f,ensure_ascii=False,indent=2);f.write('\n')
assert sha(UP/'files.sha256.json')=='d8e012c8ca1112782678992dab142d91c51a940aa77aa39fb60702ec8dbe6d7b'
for f in load(UP/'files.sha256.json'):assert sha(UP/f['path'])==f['sha256']
ledger=load(ROOT/'integration/coac250-unified-chapter-register-20261027b.json')
spec=importlib.util.spec_from_file_location('gate',ROOT/'web-production/v1/runs/coac244-inline-japanese-20261027/canonical-exclusion-helper.py');gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate);gate.OWNER='COAC-269 224232 limited maker'
jobs={}
for key,article in [('224','chapter04-section005'),('232','chapter04-section012')]:
    row=next(x for x in ledger['rows'] if x['chapterId']==f'nemata-jp-chapter-{key}-1');e=row['existingCandidate']
    parent=ROOT/e['path'];audit=ROOT/e['auditPath'];c=load(parent);a=load(audit);sp=ROOT/c['source']['sourcePath'];s=load(sp)
    assert sha(parent)==e['sha256'] and sha(sp)==c['source']['sourceSha256'] and a['production']['sha256']==sha(parent)
    issue=next(x for x in load(UP/'other-exact-unresolved-targets.json') if x['canonical']==row['chapterId']);assert issue['originalIssues']==a['modelReview']['issues']
    gate.stopped();exclude=gate.joint({'chapterId':row['chapterId'],'parentPath':str(parent),'parentFileSha256':sha(parent)})
    target=c['figures'][0] if key=='232' else next(f for f in c['figures'] if ':b0013:' in f['figureId'])
    texts=[]
    if key=='232':
        for i,before,after in [(1,'确保和牌也无妨','以不改变当前名次的和牌结束比赛也无妨'),(3,'起手牌和摸牌都不错时','起手牌或摸牌有利时')]:
            old=c['body']['blocks'][i];assert old['text'].count(before)==1;texts.append({'sourceBlockId':old['sourceBlockIds'][0],'before':old['text'],'after':old['text'].replace(before,after),'source':s['blocks'][i]})
    old=target['transcription'];rename=lambda x:x.replace('和牌时摸入比例','和牌中自摸所占比例').replace('被摸入率','被他家自摸率')
    chartSeries=['流局率','放铳率','和牌中自摸所占比例','立直棒被没收率','和牌率','被他家自摸率','和牌时一发比例']
    chartHeader='\n逐巡近似读数（按原图纵轴刻度，均为约值；原图未明确标注单位，不补定百分号；unknown表示该点不能可靠辨读，不推算）：\n巡目：1,2,3,4,5,6,7,8,9,10,11,12,13,14,15。\n'
    figureRule={'figureId':target['figureId'],'sourceBlockId':target['sourceBlockIds'][0],'before':old,'mode':'chart-append-seven-by-fifteen' if key=='224' else 'fixed','prefix':rename(old)+chartHeader if key=='224' else None,'expectedAfter':old.replace('4p 4p 2s 4s','4p 4p 3s 4s') if key=='232' else None,'unknowns':list(map(rename,target['unknowns'])) if key=='224' else target['unknowns'],'series':chartSeries if key=='224' else []}
    if key=='232':assert old.count('4p 4p 2s 4s')==1
    visual=c['provenance']['attempts'][-1].get('visualInputs',[]);wanted={x['assetId'] for x in target['sourceAssetBindings']}
    images=[{**bind(ROOT/v['path']),'role':v['role'],'sourceAssetId':v['assetId']} for v in visual if v['assetId'] in wanted]
    if not images:images=[{**bind(ROOT/b['path']),'role':'original','sourceAssetId':b['assetId']} for b in target['sourceAssetBindings']]
    # Only original and already frozen reading views. No generated image or new pixel reading.
    assert any(x['role']=='original' for x in images)
    rawRefs=[bind(ROOT/'audit/calls'/str(call['callId']+'.json')) for call in a['calls']]
    ordered=[{'position':i,'source':[b for b in s['blocks'] if b['id'] in cb['sourceBlockIds']],'candidate':cb,'figure':next((f for f in c['figures'] if f['figureId']==cb.get('figureId')),None)} for i,cb in enumerate(c['body']['blocks'])]
    priorCalls=[x for line in (ROOT/'web-production/v1/calls.jsonl').read_text(encoding='utf-8').splitlines() if line.strip() for x in [json.loads(line)] if x.get('articleId')==article and x.get('sourceId')==c['source']['sourceId']]
    packet={'canonical':row['chapterId'],'article':article,'bindings':{'candidate':bind(parent),'source':bind(sp),'audit':bind(audit),'independentRaws':rawRefs,'productionRaws':[bind(ROOT/'web-production/v1'/x['rawArtifactPath']) for x in c['provenance']['attempts']]},'originalIssues':a['modelReview']['issues'],'orderedContext':ordered,'textWhitelist':texts,'figureRule':figureRule,'images':images,'productionLedger':priorCalls,'upstreamCorrection':issue,'initialExclusion':exclude,'unknownsPreserved':True,'originalUnknowns':target['unknowns']}
    pp=HERE/f'{key}-packet.json';save(pp,packet)
    jobs[key]={'canonical':row['chapterId'],'article':article,'packet':bind(pp),'parent':bind(parent),'source':bind(sp),'parentAudit':bind(audit),'auditor':bind(ROOT/a['auditor']['path']),'textIds':[w['sourceBlockId'] for w in texts],'repairFigureIds':[target['figureId']],'candidatePath':str(ROOT/f'web-production/v1/candidates/modern-yabejp-ja/{article}.coac269b27r1.json')}
    print(json.dumps({'key':key,'bodyBlocks':len(c['body']['blocks']),'figures':len(c['figures']),'images':len(images),'oldAuditCall':[x['callId'] for x in a['calls']],'source':jobs[key]['source']['sha256']}))
assert not RT.exists() and not STAGE.exists();RT.mkdir();STAGE.mkdir()
for f in load(BASE/'runtime-manifest.json')['files']:
    assert sha(BASE/f['path'])==f['sha256'];shutil.copyfile(BASE/f['path'],RT/f['path'])
for key in jobs:
    dst=RT/f'{key}-packet.json';shutil.copyfile(jobs[key]['packet']['path'],dst);jobs[key]['packet']=bind(dst)
contract={'schema':'coac269-exact-224232-only/1','authorizationComment':'01a181c4-730d-7821-8325-b8bc9e48a7cc','packageManifest':bind(UP/'files.sha256.json'),'baseManifest':bind(BASE/'runtime-manifest.json'),'jobs':jobs,'maximumMakerPerChapter':1,'maximumIndependentPerChapter':1,'retry':0}
save(RT/'pair-contract.json',contract);shutil.copyfile(RT/'pair-contract.json',HERE/'contract.json');shutil.copyfile(HERE/'pair.mjs',RT/'pair.mjs')
manifest={'schema':'coac269-exact224232-runtime/1','files':[bind(p) for p in sorted(RT.iterdir()) if p.is_file()]};save(RT/'runtime-manifest.json',manifest);save(HERE/'runtime.json',manifest);save(HERE/'pins.json',{'runtime':bind(RT/'runtime-manifest.json'),'runtimeFiles':len(manifest['files']),'packageManifest':contract['packageManifest'],'modelCalls':0})
(HERE/'.gitattributes').write_bytes(b'* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol\n')
