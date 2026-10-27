import json, hashlib, datetime, os
LIST='.multica/delivery/coac-248-native-inline-correction/unified-repair-list-20261027.json'
S246='_scratch/attach/246-verified.json'
L=json.load(open(LIST,encoding='utf-8'))
S=json.load(open(S246,encoding='utf-8'))
now='2026-10-27T02:15:00.000Z'

# --- p263 resolution -------------------------------------------------------
P263_CAND='E:/AgentData/Coach/knowledge/processing/production/sol-high-field-repair-20261027-p263/candidates/79-cn/page-0263.json'
P263_SHA='4fb2bd6dd485f463498671be4c7e7898e5f24da88390bf7938f47f0450aed61c'
P263_AUDIT='E:/AgentData/Coach/knowledge/processing/audit/pages/79-cn/page-0263.4fb2bd6dd485f463498671be4c7e7898e5f24da88390bf7938f47f0450aed61c.d0782d5041cf.json'
for o in L['objects']:
    if o['objectId']=='79-cn:page:263':
        o['auditPath']=P263_AUDIT
        o['auditStatus']='passed'
        o['currentDisposition']='resolved-passed-awaiting-250-handoff'
        o['resolution']={
          'kind':'deterministic-visible-tile-and-legend-field-correction',
          'scope':'figure 79-cn-p263-r1 transcription only; body, captions, bboxes, assets and provenance unchanged',
          'parent':{'path':'E:/AgentData/Coach/knowledge/processing/production/sol-high-fallback-finite-20261024-schemafix/candidates/79-cn/page-0263.json','sha256':'7fea090b5ca70f172889164cecd3ba8bd40eed5dc3c0af51a9b354cbed272fcc',
                    'audit':o.get('auditPath'),'auditStatus':'needs-repair'},
          'revisionCandidate':{'path':P263_CAND,'sha256':P263_SHA},
          'audit':{'path':P263_AUDIT,'status':'passed','callId':'2feaa474-7288-4ab4-9930-5637b9af023e','usage':{'inputTokens':20560,'cachedInputTokens':0,'outputTokens':4668}},
          'supersededAudits':[{'path':'E:/AgentData/Coach/knowledge/processing/audit/pages/79-cn/page-0263.5d2203d8a6cae557499595de19b7372a5669575245f987c8e452c7ff62be05a6.d0782d5041cf.json','status':'needs-repair','callId':'d70c5af3-add5-4f42-ae4f-c76e4f1c9518','usage':{'inputTokens':20547,'cachedInputTokens':0,'outputTokens':3890}}],
          'sourceCheck':{'verdict':'dora tile is 2s (two bamboo sticks); chi group reads 3s horizontal, 2s, 4s; south river column 1 holds 東,中,白,北,9s,1m; the book uses 5z=白,6z=發,7z=中 on p217/p253/p255/p264/p265 while p263 alone had them swapped',
                         'method':'free source-image read of the R1 crop plus cross-page legend check; no model call'},
          'effectiveStatus':'passed'}
        o['issueCount']=0
        o['reviewErrors']=[]

# --- COAC-246 merge --------------------------------------------------------
existing={o.get('candidateSha256'):o for o in L['objects'] if o.get('candidateSha256')}
added=[];deduped=[];nonrepair=[]
for c in S['chapters']:
    if c['action']!='repair':
        nonrepair.append({k:c.get(k) for k in ('chapterId','action','sourceId','articleId','candidateSha256','candidatePath','auditStatus','auditSourceStale','units','blocks','pdfPages')})
        continue
    sha=c.get('candidateSha256')
    if sha in existing:
        deduped.append({'objectId':existing[sha]['objectId'],'chapterId':c['chapterId'],'candidateSha256':sha,
                        'sources':[existing[sha].get('origin'),'COAC-246 coverage verification 2026-10-27'],'resolution':'one object'})
        existing[sha]['alsoReportedBy']='COAC-246 coverage verification 2026-10-27'
        existing[sha]['chapterId']=c['chapterId']
        continue
    o={'objectId':'web-chapter:'+c['chapterId'],'kind':'web-article','chapterId':c['chapterId'],
       'sourceId':c.get('sourceId'),'articleId':c.get('articleId'),
       'candidatePath':c.get('candidatePath'),'candidateSha256':sha,
       'auditPath':c.get('auditPath'),'auditStatus':'needs-repair','issueCount':c.get('repairErrors'),
       'unitCount':c.get('units'),'blockCount':c.get('blocks'),'pdfPages':c.get('pdfPages'),
       'currentDisposition':'needs-repair','origin':'COAC-246 coverage verification 2026-10-27','newThisStage':True,
       'auditRecordedAt':c.get('auditRecordedAt'),'auditSourceStale':c.get('auditSourceStale'),
       'diskShaVerified':c.get('diskState')=='match'}
    L['objects'].append(o); added.append(o['objectId']); existing[sha]=o

L['recordedAt']=now
L['refreshedAt']=now
L['countsBeforeThisStage']=L.get('countsCurrent',{})
L['countsCurrent']={
 'needsRepair':sum(1 for o in L['objects'] if o.get('currentDisposition')=='needs-repair'),
 'failedSeparate':len(L.get('failedSeparate',[])),
 'resolvedThisStage':sum(1 for o in L['objects'] if str(o.get('currentDisposition','')).startswith('resolved')),
 'totalTracked':len(L['objects'])+len(L.get('failedSeparate',[])),
}
b={'oldPdfRemaining':sum(1 for o in L['objects'] if o.get('origin')=='COAC-248 old PDF 12' and o.get('currentDisposition')=='needs-repair'),
   'newPdfPages':sum(1 for o in L['objects'] if str(o.get('origin','')).startswith('COAC-247 new PDF return') and o.get('currentDisposition')=='needs-repair'),
   'web':sum(1 for o in L['objects'] if o.get('kind')=='web-article' and o.get('currentDisposition')=='needs-repair'),
   'protectedSupplement':sum(1 for o in L['objects'] if o.get('kind')=='protected-supplement' and o.get('currentDisposition')=='needs-repair'),
   'failed':len(L.get('failedSeparate',[])),
   'metadataFrontMatter':sum(1 for o in L['objects'] if o.get('objectId') in ('nemata-jp:page:1','nemata-jp:page:2','nemata-jp:page:3','nemata-jp:page:317') and o.get('currentDisposition')=='needs-repair')}
L['breakdown']=b
L.setdefault('dedupe',[]).extend(deduped)
L['byOrigin']=dict(L.get('byOrigin',{}))
L['byOrigin']['COAC-246 coverage verification 2026-10-27']=len(added)
L['addedThisRefresh']=added
L['relatedNonRepair']={'note':'COAC-246 chapters that are not 248 repair objects; their actions belong to 249 (audit) and 250 (staging/selection).','chapters':nonrepair}
L['latestRound']={
 'at':now,'objects':['79-cn:page:263'],'productionModelCalls':0,'auditModelCalls':2,
 
 'runtime':'audit/runtimes/native-repair-d0782d5041cfb2',
 'auditorScriptSha256':'d0782d5041cfb26f2ee2d25a30167da303e25e834750a33c9dde14465c512cb1',
 'manifestSha256':'03052928bac4af79b7db51c9cb4cf260f2b8276e2ddbc08dd9c6643321c00258',
 'note':'p263 passed on the third bounded revision after two real independent reviews; 41 COAC-246 web chapters merged by current candidate SHA (41 new + 7 deduped against the existing web 7).'}
json.dump(L,open(LIST,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(json.dumps({'counts':L['countsCurrent'],'breakdown':b,'added':len(added),'deduped':len(deduped),'nonrepair':len(nonrepair)},ensure_ascii=False,indent=1))
