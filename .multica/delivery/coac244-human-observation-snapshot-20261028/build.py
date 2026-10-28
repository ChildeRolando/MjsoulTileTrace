"""Build this one captured batch. Reads files only; no service requests or model tools."""
from pathlib import Path
import json,collections,shutil
from observations import load,sha,encoded,histories,classification
O=Path(__file__).resolve().parent;P=Path('E:/AgentData/Coach/knowledge/processing');D=P/'integration/coac244-human-observation-snapshot-20261028';S=D/'snapshot'
dump=lambda p,x:Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
refs={}
def bind(f,expected=None):
    f=Path(f);b=f.read_bytes();h=sha(b)
    if expected:assert h==expected,str(f)
    refs[str(f)]={'path':str(f),'sha256':h,'bytes':len(b)}
    return refs[str(f)]
def checked(ref):bind(ref['path'],ref['sha256']);return load(ref['path'])
x=load(S/'export.raw.json');record_bytes=(S/'events.raw.jsonl').read_bytes();records=[json.loads(b) for b in record_bytes.splitlines() if b.strip()]
assert records[:len(x['events'])]==x['events'],'export must equal independent saved-record prefix'
queues={}
for f in (S/'queues').glob('*.json'):
    if f.name=='queue.json':continue
    h=sha(f.read_bytes());assert h==f.stem;queues[h]=load(f);bind(f)
assert sha((S/'queues/queue.json').read_bytes())==x['queueSha256'];assert queues[x['queueSha256']]==x['queue']
for f in [S/'events.raw.jsonl',S/'export.raw.json',S/'queues/queue.json']:bind(f)
latest,history=histories(x['events'],queues);current={i['id']:i for i in x['queue']['items']}
assert len(current)==len(x['queue']['items'])
for id,e in latest.items():
    if id in current:
        for k in ['id','targetId','imageSha256','originalImages','canonical','position']:assert e[k]==current[id][k],'current queue changed target binding'
plan_path=P/'integration/coac269-311250-zero-preparation-20261028/plan.json';plan=load(plan_path);bind(plan_path)
def receipt(n):
    p=P/'integration'/n;r=load(p);bind(p)
    out={'receipt':bind(p)}
    for k in ['candidate','source','parent','parentAudit','parentRaw','raw','plan']:
        if k in r:checked(r[k]);out[k]=r[k]
    return out
evidence={
 '79-cn-chapter-109-4':receipt('coac249-109-target-impact-reviewed-20261028.json'),
 '79-cn-chapter-167-4':receipt('coac249-167-target-impact-reviewed-20261028.json'),
 '79-cn-chapter-201-6':receipt('coac249-201-target-impact-reviewed-20261028.json'),
 'nemata-jp-chapter-193-1':receipt('coac249-jp193-text-r2-target-reviewed-20261028.json'),
 'nemata-jp-chapter-213-1':receipt('coac249-213-target-impact-reviewed-20261028.json'),
 'nemata-jp-chapter-232-1':receipt('coac249-232-target-impact-reviewed-20261028.json')}
pdf={}
for page in [257,261]:
    a=plan['pdf'+str(page)];pdf[page]={k:a[k] for k in ['source','parent','parentAudit']};pdf[page]['candidate']=pdf[page].pop('parent')
    for f in pdf[page].values():checked(f)
    pdf[page]['completeOrderedContext']=bind(P/f'integration/coac269-311250-zero-preparation-20261028/{page}-context.json')
    audit=load(a['parentAudit']['path'])
    for call in audit.get('calls',[]):
        cid=call.get('callId');f=P/'audit/calls'/f'{cid}.json'
        if f.exists():bind(f)
hist=plan['pdf261']['historicalIndependentCall'];historical=bind(P/'audit/calls'/f"{hist['callId']}.json",hist['sha256']);checked(plan['pdf261']['historicalAdjudication'])
already={'e4d676a874f84120516fb9cabffb01d0','992e21f9926080a86779c0c8ef789753','24a2d288e3e63c5cbb80f7f6e9713a4d','9eeebe25961682b896ba944d95d3b966','c9f0532f18c0e12b568ea5b6c3209335'}
conflicts={
 '84791e37a95dcfa295e38dbf27855039':['人工3m与原5m error/修订提案冲突；与91507699独立3m裁决一致。不得静默将3m改5m或改写旧审。'],
 '1b5f06d972548151f86c1b632681fd92':['目标旧定位为右侧第4/5/6张筒子，人工填7s/8s/9s；备注完整序列的第4/5/6为8m/5s/5s。应澄清目标索引，不能自动按备注改全手牌。'],
 '3722e774b30167a0ec0c09ade18406b1':['人工9p与当前靶审确认7p相冲突；旧队列仍指原unknown。保留两审/人工原位与完整序列，不自动覆盖。']}
notes={
 '90973b44a042e717e1bfa5b347a7aa78':'人工主要目标?m=9m；备注另指出邻位2m被记为3m，属额外具体观察，需另建该位置白名单，不由备注扩大当前修改范围。',
 '0dd6a87e7ffde2557b3d09ba11e745be':'仅保存中间张横置观察；“指向左家”保留为人工说法，不能自动升级为鸣牌来源证明。'}
positions={
 'fa50e1c25728194fcbbb2fec9841b592':[('CPU右河',7)],
 '69395d14b0bb8aed53bfa51b0850ddcb':[('CPU上河',1),('CPU上河',6),('CPU上河',17)],
 '19124d6cc326a5bc70fd54b4086fa20c':[('CPU右河',1),('CPU右河',2),('CPU右河',13),('CPU右河',14)],
 'ba273dc871055c6f06083a007a390ac1':[('CPU左河',16)]}
rows=[]
for id,event in latest.items():
    item=next(i for i in queues[event['queueSha256']]['items'] if i['id']==id)
    images=[]
    for f in [{'path':item['imagePath'],'sha256':item['imageSha256']},*item['originalImages']]:images.append(bind(P/f['path'],f['sha256']))
    ev=pdf[item['page']] if item['page'] in pdf else evidence[item['canonical']]
    src=load(ev['source']['path']);assert all(f['sha256'] in json.dumps(src) for f in item['originalImages']),'image must belong to bound source'
    candidate=load(ev['candidate']['path']);figure=next(f for f in candidate['figures'] if f['figureId']==item['figureId']);figure_index=candidate['figures'].index(figure)
    saved=event['result']['status'];disposition='already-applied-reuse' if id in already else 'conflict-needs-adjudication' if id in conflicts else 'ready-observation' if saved=='answered' else saved
    row={'itemId':id,'canonical':item['canonical'],'page':item['page'],'targetId':item['targetId'],'figureId':item['figureId'],'position':item['position'],
      'imageSha256':item['imageSha256'],'originalImages':item['originalImages'],'regionBBox':item['regionBBox'],'bbox':item['bbox'],'imageBindings':images,
      'queueSha256AtSave':event['queueSha256'],'inCurrentServedQueue':id in current,'retiredFromCurrentQueue':id not in current,
      'savedStatus':saved,'classification':classification(event),'result':event['result'],'timestamp':event['timestamp'],'revision':event['revision'],
      'latestEventSha256':sha(encoded(event)),'historyCount':len(history[id]),'history':[{'revision':e['revision'],'timestamp':e['timestamp'],'eventSha256':sha(encoded(e)),'savedStatus':e['result']['status']} for e in history[id]],
      'currentEvidence':ev,'eligibleHumanEvidence':saved=='answered','disposition':disposition,'conflicts':conflicts.get(id,[]),'additionalObservationNote':notes.get(id),
      'weight':'user-saved-visual-observation; not a model verdict or whole-chapter acceptance','freeTextIsExecutable':False,'applicationPermit':False,'wholeChapterPassed':False}
    row['currentTargetBinding']={'fullFigureSha256':sha(encoded(figure)),'hashEncoding':'UTF8 canonical sorted JSON','transcriptionField':f'/figures/{figure_index}/transcription',
       'unknownsField':f'/figures/{figure_index}/unknowns','preserveBodySha256':sha(encoded(candidate['body'])),
       'matchedUnknownIndices':[i for i,t in enumerate(figure['unknowns']) if t==item['position']],
       'coordinateSpace':'original PDF page coordinates; no pixel conversion inferred' if item['regionBBox'] else 'textual source-image position only',
       'noCandidateMutationThisPhase':True}
    if id in positions:
        assert len(positions[id])==len(event['result']['tiles'])
        row['precisePublicTileClaims']=[{'river':river,'ordinal':ordinal,'tile':tile} for (river,ordinal),tile in zip(positions[id],event['result']['tiles'])]
    rows.append(row)
unfilled=[{k:i[k] for k in ['id','canonical','page','targetId','imageSha256','position']}|{'classification':'unfilled','eligibleHumanEvidence':False} for i in current.values() if i['id'] not in latest]
counts={'servedItems':len(current),'savedHistoryEvents':len(x['events']),'savedLatestItems':len(rows),'savedCurrentItems':sum(r['inCurrentServedQueue'] for r in rows),'retiredSavedItems':sum(r['retiredFromCurrentQueue'] for r in rows),
        'unfilledCurrentItems':len(unfilled),'classifications':dict(collections.Counter(r['classification'] for r in rows)),'dispositions':dict(collections.Counter(r['disposition'] for r in rows)),
        'unclear':sum(r['savedStatus']=='unclear' for r in rows),'missing':sum(r['savedStatus']=='missing' for r in rows),'skipped':sum(r['savedStatus']=='skipped' for r in rows),'withdrawn':sum(r['savedStatus']=='withdrawn' for r in rows)}
packet={'schema':'coac244-bound-human-observation-snapshot/1','exportedAt':x['exportedAt'],'capture':load(O/'capture.json'),'snapshotLocalRoot':str(S),'queueSha256':x['queueSha256'],
        'counts':counts,'observations':rows,'unfilled':unfilled,'notFinalBatch':True,'newModelCalls':0,'newProductionCalls':0,'newConsumers':0,'wholeChapterPassed':False,'applicationPermit':False,
        'consumptionRule':'Recheck the latest persisted event, exact candidate/source/target/image hashes and position before use; never execute note/orientation text. Human confirmed values are observation inputs, not another OCR guessing task.'}
dump(O/'human-evidence.json',packet)
web311=plan['web311'];charts=[{'figureId':c['figureId'],'allowedLeafPaths':c['allowedLeafPaths'],'pointIds':c['pointIds'],'sourceAssets':c['sourceAssets']} for c in web311['charts']]
for f in [web311['source'],web311['parent'],web311['parentAudit']]:checked(f)
priority={'schema':'coac244-human-priority-closure-proposal/1','232':{'canonical':'nemata-jp-chapter-232-1','candidate':evidence['nemata-jp-chapter-232-1']['candidate'],'readyItem':'4ce1c71647c8da4352eb117e5d2f1094','humanTile':'9m','alreadyFixedHand':['3s','4s','6s','7s','8s'],
 'minimumEdit':'仅b0005 figure右河第二张unknown→9m及对应unknown项；保留现有3s和所有文字/原图/条件；其它计数/身份unknown不补。',
 'reviewScope':'完整14有序块/3图作上下文，只核人工9m正确应用及作者名次/打白/条件论证，继承原两文本faithful；不再识9m。','proposalOnlyBudget':{'maker':0,'targetApplicationAndArgumentReview':1,'retry':0}},
 '257':{'canonical':'nemata-jp-chapter-250-1','candidate':pdf[257]['candidate'],'readyItems':list(positions),'publicTilesCovered':9,'minimumEdit':'仅r1九个指定公开牌位转录与相应unknown子串；记录左河第16张用户“立直宣言牌”标注，不自动扩推其它方向、来源玩家或隐藏牌。','reviewScope':'完整257有序正文、四幅原截图、九项位置映射、全部牌河方向定义；仅核应用与论证，另外11页837源块已有passed复用。','proposalOnlyBudget':{'maker':0,'targetApplicationAndArgumentReview':1,'retry':0}},
 '261':{'canonical':'nemata-jp-chapter-250-1','candidate':pdf[261]['candidate'],'humanTile':'3m','humanItem':'84791e37a95dcfa295e38dbf27855039','historicalIndependent3m':historical,'conflictingAudit':pdf[261]['parentAudit'],
 'minimumEdit':'当前r50/caption/inline本来3m；不按过期5m提案改。先0call在原owner保留人工3m+旧独立3m及旧5m error，形成明确精确冲突归属/消费合同；不主控改旧审。','reviewScope':'如仍需独审，仅核b33有序条件及3m应用，不再猜牌；未授权新call。','proposalOnlyBudget':{'maker':0,'ocr':0,'argumentReviewMaximumIfRequired':1,'retry':0}},
 '311':{'canonical':'79-cn-chapter-311-18','candidate':web311['parent'],'source':web311['source'],'parentAudit':web311['parentAudit'],'queueItems':0,'savedHumanObservations':0,'charts':charts,
 'minimumRemaining':'八张曲线图144个计划读数槽及模糊曲线归属，人工牌面快照没有数值证据；保留原unknown，不插值或自动分配条件。按原269准备包逐图处理，当前0call。','distinctFromAcceptedPdf311':'nemata-jp-chapter-309-1/PDF311-r5仅损坏图标unknown，未填且非本中文章，不能串用。'},
 'notFinalBatch':True,'noNewBudgetAuthorized':True,'candidateOrRawOrAnnotationsChanged':False}
dump(O/'priority-paths.json',priority)
dump(O/'input-bindings.json',{'files':list(refs.values()),'exportEventsEqualSavedFilePrefix':True,'liveFilesReadOnly':True})
for f in O.iterdir():
    if f.is_file():shutil.copyfile(f,D/f.name)
print(json.dumps(counts,ensure_ascii=False))
