import json,hashlib,shutil,datetime
from pathlib import Path
R=Path('E:/AgentData/Coach/knowledge/processing');O=Path(__file__).parent
H=R/'integration/coac249-reviewed-exact-183236-20261028.json'
def load(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def bind(p):return dict(path=str(Path(p).resolve()),sha256=hashlib.sha256(Path(p).read_bytes()).hexdigest())
def exact(b):
 assert bind(b['path'])['sha256']==b['sha256'],b['path']
 return load(b['path']) if Path(b['path']).suffix=='.json' else Path(b['path']).read_bytes()
assert bind(H)['sha256']=='5f18539ffe7bdda16cbceb5306797209a98fbf1ed711b2da39fd8b966f6ebee5'
h=load(H);supp=exact(h['sourceContextSupplement']);source=exact(supp['source'])
for k in ['html','main']:exact(supp[k])
for block in supp['sourceExcerpts']:assert next(b for b in source['blocks'] if b['id']==block['id'])==block
assert supp['modelCalls']==0 and not supp['auditChanged'] and not supp['candidateChanged']
manifest=exact(h['runtimeManifest']);protected=[]
for f in manifest['files']:
 exact(f);protected.append(dict(path=f['path'],sha256=f['sha256']))
assert len(protected)==18
auditLedger=[json.loads(l) for l in (R/'audit/calls.jsonl').read_text(encoding='utf8').splitlines() if l.strip()]
makerLedger=[json.loads(l) for l in (R/'web-production/v1/calls.jsonl').read_text(encoding='utf8').splitlines() if l.strip()]
rows=[];proofs=[];productionIds=[]
for j in h['chapters']:
 candidate=exact(j['candidate']);audit=exact(j['audit']);raw=exact(j['raw']);call=j['calls'][0]
 assert audit['production']['sha256']==j['candidate']['sha256']==call['binding']['productionSha256']
 assert audit['status']==j['status']=='needs-repair'
 assert audit['modelReview']==j['modelReview']==raw['output']==json.loads(raw['rawLastMessage'])
 assert hashlib.sha256(raw['rawLastMessage'].encode()).hexdigest()==call['outputSha256']
 assert hashlib.sha256(raw['requestPrompt'].encode()).hexdigest()==call['promptSha256']
 assert raw['success'] and raw['exitCode']==0 and not raw['timedOut'] and not raw['outputOverflow']
 assert call['model']=='gpt-6.1-sol' and call['reasoningEffort']=='high'
 assert call['binding']['originalImageAssetIds']==[]
 assert not audit['modelChecks']['passed'] and not audit['effectiveModelChecks']['passed']
 assert all(i['severity']=='uncertain' for i in audit['modelReview']['issues'])
 assert len([c for c in auditLedger if c['callId']==call['callId']])==1
 assert len([c for c in auditLedger if c.get('binding',{}).get('productionSha256')==j['candidate']['sha256']])==1
 src=R/candidate['source']['sourcePath'];assert bind(src)['sha256']==candidate['source']['sourceSha256']
 rev=candidate['provenance']['revision'];exact(dict(path=R/rev['parentPath'],sha256=rev['parentSha256']));exact(dict(path=R/rev['notesPath'],sha256=rev['notesSha256']))
 for c in candidate['provenance']['attempts']:
  rb=R/candidate['provenance']['artifactRoot']/c['rawArtifactPath'];assert bind(rb)['sha256']==c['rawArtifactSha256']
  assert len([x for x in makerLedger if x['callId']==c['callId']])==1
  productionIds.append(c['callId'])
 cid=j['chapterId'];is183='-183-' in cid
 record=dict(chapterId=cid,candidate=j['candidate'],audit=j['audit'],raw=j['raw'],status='needs-repair',verdict='uncertain',callId=call['callId'],model=call['model'],reasoningEffort=call['reasoningEffort'],images=[],usage=call['usage'],durationMs=raw['durationMs'],modelReview=j['modelReview'],modelChecks=j['modelChecks'],effectiveModelChecks=j['effectiveModelChecks'],handoff=bind(H),remainingBatchAllowance=0,fullChapterPassed=False,integrationAllowed=False,sourceContextSupplement=h['sourceContextSupplement'] if is183 else None,blocker=('target-review-context-omits-bound-source-statistics; original one-visible-tile counting ambiguity remains' if is183 else 'original turn-timing interpretation remains unconfirmed despite neutral translation and explicit non-author note'),nextAction=('保留现候选/原uncertain和有原源依据的统计数字。补证已定位b0003/b0007/b0008/b0011/b0012，现审仅见b0016–b0019；未来若另获授权，仅补齐原源上下文作定点审查，原“１枚切れ１枚見え”口径仍须澄清。当前预算0，不自动再审/制作、不零调用升pass。' if is183 else '保留中性正文和非原文校注；先获得同源明确时机证据或用户对早巡/剩余巡数的判读，再决定最小定点核查。校注披露疑点不等于证实教学时机；预算0，不自动再制/再审。'))
 if is183:
  assert all(x not in supp['defaultReviewProjectionIds'] for x in supp['missingStatisticsInOriginalReview'])
  record['sourceStatistics']=[b for b in supp['sourceExcerpts'] if b['id'] in supp['missingStatisticsInOriginalReview']]
  record['actualReviewProjectionIds']=supp['defaultReviewProjectionIds']
  record['rawPromptContainsStatisticSourceIds']={x:x in raw['prompt'] for x in supp['missingStatisticsInOriginalReview']}
 rows.append(record);proofs.append(dict(chapterId=cid,callId=call['callId'],source=bind(src),candidate=j['candidate'],audit=j['audit'],raw=j['raw'],newSemanticReviewPerformedHere=False))
assert len(set(productionIds))==2
oldIds=['629d37ab-fdc9-462f-a29a-061ae3293fb0','abef6c4b-02ff-416f-b61d-1fe821402f1a']
oldBindings=[]
for cid in oldIds:
 matches=[x for x in makerLedger if x['callId']==cid];assert len(matches)==1
 p=R/'web-production/v1'/matches[0]['rawArtifactPath'];assert bind(p)['sha256']==matches[0]['rawArtifactSha256'];oldBindings.append(bind(p))
assert h['lifetimeBatchCalls']==h['batchMaximum']==6 and h['remainingAuditOrProductionAllowance']==0
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt=dict(schema='coac244-record-exact-text-review-return/1',recordedAt=now,handoff=bind(H),sourceContextSupplement=h['sourceContextSupplement'],rows=rows,budget=dict(authorizationCommentId='01a17ed7-c04d-71e7-82eb-57aed9c7b3e1',oldRejectedProductionCalls=oldIds,newProductionCalls=productionIds,firstIndependentAuditCalls=[r['callId'] for r in rows],used=6,maximum=6,remaining=0,automaticRetry=0,newModelCallsThisRun=0),proofs=proofs,protectedRuntimeFiles=protected,oldFailedRaw=oldBindings,passedAdded=0,integrationHandoffMade=False,candidateOrRawOrAuditChanged=False)
# Only two existing remaining rows are extended; coverage and original classifications remain intact.
updated=[]
for filename in ['coac250-uncovered-chapter-continuation-register-20261027b.json','coac244-remaining26-closure-register-20261028.json']:
 p=R/'integration'/filename;before=load(p);after=json.loads(json.dumps(before))
 if not (O/('before-'+filename)).exists():save(O/('before-'+filename),before)
 ids={r['chapterId'] for r in rows}
 for item in rows:
  matches=[r for r in after['rows'] if r['chapterId']==item['chapterId']];assert len(matches)==1
  matches[0]['latestIndependentTextReview']=item
  if filename=='coac244-remaining26-closure-register-20261028.json':
   matches[0]['category']='source-context-gap-and-counting-ambiguity' if '-183-' in item['chapterId'] else 'source-timing-ambiguity'
   matches[0]['nextAction']=item['nextAction']
  else:
   matches[0]['closurePlan']={**matches[0].get('closurePlan',{}),'latestReviewStatus':'needs-repair','latestReviewVerdict':'uncertain','remainingBatchAllowance':0,'nextAction':item['nextAction']}
 for a,b in zip(before['rows'],after['rows']):
  allowed={'latestIndependentTextReview','category','nextAction'} if filename=='coac244-remaining26-closure-register-20261028.json' else {'latestIndependentTextReview','closurePlan'}
  assert {k:v for k,v in a.items() if k not in allowed}=={k:v for k,v in b.items() if k not in allowed}
  if a['chapterId'] not in ids:assert a==b
 save(p,after);updated.append(bind(p))
receipt['updatedRemainingRegisters']=updated
save(O/'registration-receipt.json',receipt)
shutil.copy2(H,O/'original-review-handoff.json');shutil.copy2(h['sourceContextSupplement']['path'],O/'original-source-context-supplement.json')
for j in h['chapters']:
 key='183' if '-183-' in j['chapterId'] else '236'
 shutil.copy2(j['audit']['path'],O/(key+'-original-audit.json'));shutil.copy2(j['raw']['path'],O/(key+'-original-audit-raw.json'))
target=R/'integration/coac244-recorded-exact-183236-review-20261028.json';save(target,receipt)
owner=Path('short-stage-owner-prefix.md');text=owner.read_text(encoding='utf8')
prefix='''## 2026-10-28 183/236首次独审收回：两章uncertain，6/6已用尽（本登记0调用）

249真实交接5f18539ffe7bdda16cbceb5306797209a98fbf1ed711b2da39fd8b966f6ebee5已按完整源/候选/审/raw与调用ledger核验并登记，无通过章、不交250。最新唯一display：nemata-jp-chapter-183-1 973bbc3eb85dedaed18a5b11903b8002b8dffcade1e6d3a3f7bb25cd1684d45a，首审018687de-2b4f-4af5-b82f-f4934c12f974；nemata-jp-chapter-236-1 6193212639b7c8abb42adf64b69759a5d00effc67c1f20d2c9ae681ded121a28，首审7a1363b3-906b-4155-9643-2a3924d3dfd1。两者needs-repair/uncertain，modelChecks/effectiveModelChecks均false，等级不改。

183正文已判忠实完整；统计数字4%/4%/3%/2%确在绑定source.v2的b0007/b0008/b0011/b0012，已附原HTML/main/SHA和b0003统计口径。新审投影仅b0016–b0019，缺统计行，是可见上下文缺口，不是已证明数字错，不能机械删数字。原“１枚切れ１枚見え”口径仍未明，补证不自动消除uncertain。下一步只记录应纳入的已有源块与待澄清口径；本交接不授权任何补审或制作。

236中性正文和非原文校注保持；其它条件/例外已判忠实，“巡目が僅か”仍未明确已进行巡数/剩余巡数。校注披露不能据此确认教学时机，不自行选读法；先补同源语义证据或用户判读。

批次授权01a17ed7-c04d-71e7-82eb-57aed9c7b3e1：原2失败制作+新2制作+本2首次独审=6/6，剩0，0retry，旧失败raw保留，不把余额重复使用。两次独审均sol/high、images=[]：183 13075in/0cache/1153out，39.055秒；236 14300in/0cache/1289out，44.055秒。完整登记 integration/coac244-recorded-exact-183236-review-20261028.json；既有两个剩余register仅扩展对应行latestIndependentTextReview，不改coverage/原回执/正式active。本次一次性wakeup已fire_count1且disabled，无重复唤醒。不得派234或其它章。

'''
if '183/236首次独审收回：两章uncertain，6/6已用尽' not in text:owner.write_text(prefix+text,encoding='utf8')
(O/'.gitattributes').write_text('* -text\n',encoding='utf8')
print(json.dumps(dict(rowsRecorded=len(rows),budgetUsed=6,budgetMaximum=6,remaining=0,newModelCalls=0,passedAdded=0,registration=bind(target))))
