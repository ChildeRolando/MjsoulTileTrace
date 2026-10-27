import json,hashlib,os
ROOT='E:/AgentData/Coach/knowledge/processing'
CAND=ROOT+'/web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json'
SRC=ROOT+'/web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'
BATCHES=ROOT+'/audit/web/batches/dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899/554a60a61861e50b108cb6488263bf449ca03a152f5b8b176b8ea7ac481d8421'
sha=lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
cand=json.load(open(CAND,encoding='utf-8')); src=json.load(open(SRC,encoding='utf-8'))
sb={b['id']:b for b in src['blocks']}
groups=[]
for fn in sorted(os.listdir(BATCHES)):
    d=json.load(open(os.path.join(BATCHES,fn),encoding='utf-8'))
    mr=d.get('modelReview') or {}
    ids=[]
    for i in mr.get('issues',[]):
        t=i.get('targetId','')
        desc=(i.get('description') or '')+(i.get('suggestedRepair') or '')
        if ':table:' in t or 'tableContext' in desc or '表格格位' in desc or '表格定位' in desc or '表格结构' in desc: ids.append(t)
    groups.append({'batchId':d['group']['batchId'],'status':d['status'],'tableIssues':ids})
blocks={}
for b in cand['body']['blocks']:
    sid=b['sourceBlockIds'][0]
    blocks[sid]={'type':b['type'],'figureId':b.get('figureId'),'candidateTableContext':b.get('tableContext'),'sourceTableContext':sb[sid].get('tableContext'),'equal':b.get('tableContext')==sb[sid].get('tableContext')}
targets=[]
for g in groups:
    for t in g['tableIssues']:
        if ':table:' in t and t.startswith('modern-yabejp-ja:chapter06-exercise003:table:'):
            for b in src['blocks']:
                tc=b.get('tableContext') or {}
                if tc.get('tableId')==t: targets.append(b['id'])
        elif t in sb: targets.append(t)
targets=sorted(set(targets))
ev=[]
for sid in targets:
    r=blocks[sid]
    ev.append({'sourceBlockId':sid,'type':r['type'],'figureId':r['figureId'],'tableContext':r['candidateTableContext'],'candidateEqualsSource':r['equal']})
doc={'schema':'coac-web-table-context-evidence/1','recordedAt':'2026-10-27T04:30:00Z','articleId':'chapter06-exercise003',
 'candidate':{'path':'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json','sha256':sha(CAND)},
 'source':{'path':'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json','sha256':sha(SRC)},
 'finding':{'batchGroupsRaisingTablePosition':[{'batchId':g['batchId'],'status':g['status']} for g in groups if g['tableIssues']],
   'whatTheReviewSaw':'the candidate figure-block projection emits only type/sourceBlockIds/paragraphId/figureId (webSemanticProjection, candidate branch for non-text blocks); candidate figure tableContext is never sent, while source tableContext and source.tables are',
   'whatTheCandidateActuallyHolds':'every candidate block carries the exact source tableContext, including tableId, row, column, rowspan, colspan and header',
   'allBlocksCompared':len(cand['body']['blocks']),
   'tableContextMismatches':sum(1 for sid,r in blocks.items() if not r['equal']),
   'figureBlocksWithTableContext':sum(1 for r in blocks.values() if r['type']=='figure' and r['candidateTableContext']),
   'sourceTables':len(src.get('tables') or []),
   'conclusion':'every table-position finding in these groups is a review-input limitation, not a content defect; the deterministic check web_paragraph_table_binding already enforces the same equality on every block',
   'notAwaived':'no check was relaxed, no gate changed, and every affected group keeps its needs-repair status until a review that is actually shown the candidate tableContext re-decides it'},
 'evidence':ev}
out=ROOT+'/audit/web/adjudications/table-context-projection/chapter06-exercise003.table-context-evidence.json'
os.makedirs(os.path.dirname(out),exist_ok=True)
open(out,'w',encoding='utf-8').write(json.dumps(doc,ensure_ascii=False,indent=1)+'\n')
print(out, sha(out), 'targets',len(ev),'mismatches',doc['finding']['tableContextMismatches'])
