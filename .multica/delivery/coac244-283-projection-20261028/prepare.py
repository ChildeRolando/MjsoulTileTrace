import json,pathlib,hashlib,collections,shutil
from bs4 import BeautifulSoup
P=pathlib.Path('E:/AgentData/Coach/knowledge/processing')
O=pathlib.Path(__file__).resolve().parent
S=P/'integration/coac244-283-projection-20261028'
S.mkdir(exist_ok=False)
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def bind(p):return dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)
def save(n,x):
 text=json.dumps(x,ensure_ascii=False,indent=2)+'\n'
 (O/n).write_text(text,encoding='utf-8');(S/n).write_text(text,encoding='utf-8')
cp=P/'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise003.rev1.json'
sp=P/'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise003/source.v3.json'
ap=P/'audit/web/articles/modern-yabejp-ja/chapter06-exercise003.dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899.json'
c,s,a=map(load,[cp,sp,ap]); assert bind(cp)['sha256']=='dea1ba2453139b1ce13725be3bb195e85133a80c3a744db0166a247ca79f5899'
html=P/'web-sources/v1'/s['html']['path'];main=P/'web-sources/v1'/s['main']['path']
assert bind(html)['sha256']==s['html']['sha256'];assert bind(main)['sha256']==s['main']['sha256']
soup=BeautifulSoup(main.read_text(encoding='utf-8'),'html.parser')
actual=soup.find_all('table'); assert len(actual)==len(s['tables'])==6
html_checks=[]
for t,h in zip(s['tables'],actual):
 rows=h.find_all('tr');assert len(rows)==len(t['rows'])
 for sr,hr in zip(t['rows'],rows):
  cells=hr.find_all(['td','th'],recursive=False);assert len(cells)==len(sr['cells'])
  for sc,hc in zip(sr['cells'],cells):
   assert hc.get_text()==sc['rawText'];assert hc.get('rowspan','1')==sc['rowspan'];assert hc.get('colspan','1')==sc['colspan']
 html_checks.append(dict(tableId=t['tableId'],cells=sum(len(r['cells']) for r in t['rows']),empty=sum(x['empty'] for r in t['rows'] for x in r['cells']),arrows=[dict(row=x['row'],column=x['column'],text=x['rawText'],sourceBlockIds=x['sourceBlockIds']) for r in t['rows'] for x in r['cells'] if '↓' in x['rawText']]))
tableids={i for t in s['tables'] for i in t['sourceBlockIds']}
byid={b['id']:b for b in s['blocks']}
blocks=[b for b in c['body']['blocks'] if any(i in tableids for i in b['sourceBlockIds'])]
assert all(set(b['sourceBlockIds'])<=tableids for b in blocks)
figures=[f for f in c['figures'] if set(f['sourceBlockIds'])&tableids]
assert len(figures)==94
for b in blocks:
 assert len(b['sourceBlockIds'])==1
 assert b.get('tableContext')==byid[b['sourceBlockIds'][0]].get('tableContext')
deps=[bind(p) for p in [cp,sp,ap,html,main]]
for f in figures:
 asset=f.get('presentationAsset') or (f['sourceAssetBindings'][0] if len(f['sourceAssetBindings'])==1 else None)
 assert asset,'unbound multi-image table cell'
 b=bind(P/asset['path']);assert b['sha256']==asset['sha256'];deps.append(b)
ptr=P/'integration/accepted-preview-current.json';pointer=load(ptr);corpus=load(pathlib.Path(pointer['output'])/'textbook-corpus.json')
assert not any('exercise003' in u['chapterId'] or u['chapterId']=='nemata-jp-chapter-283-1' for u in corpus['units'])
accepted=[dict(batchId=b['group']['batchId'],status=b['status'],sourceBlockIds=b['group']['sourceBlockIds'],unitIds=b['group']['unitIds'],calls=[dict(callId=x['callId'],outputSha256=x['outputSha256']) for x in b['calls']],checkpoint=b.get('checkpoint')) for b in a['batchReviews'] if b['status']=='passed']
assert len(accepted)==1 and len(accepted[0]['sourceBlockIds'])==113
issues=a['modelReview']['issues']
targets=[]
for lo,hi,name in [(93,114,'Q8-external-scenario'),(151,196,'Q12-b0168-condition')]:
 ids={f'modern-yabejp-ja:chapter06-exercise003:b{i:04}' for i in range(lo,hi)}
 targets.append(dict(name=name,sourceBlocks=[b for b in s['blocks'] if b['id'] in ids],candidateBlocks=[b for b in c['body']['blocks'] if set(b['sourceBlockIds'])&ids],candidateFigures=[f for f in c['figures'] if set(f['sourceBlockIds'])&ids],oldIssues=[i for i in issues if i.get('targetId','').endswith('b0099' if lo==93 else 'b0168')]))
save('input.json',dict(root=str(P),shared=str(S),source=s,tableCandidateBlocks=blocks,tableCandidateFigures=figures,dependencies=deps,canonical='nemata-jp-chapter-283-1',diagnosticOnly=True))
save('source-table-html-proof.json',dict(html=bind(html),main=bind(main),source=bind(sp),tables=html_checks,allLiteralCellTextAndSpansExact=True))
save('semantic-target-packets.json',dict(candidate=bind(cp),source=bind(sp),oldAudit=bind(ap),targets=targets,newModelCalls=0,notAuthorizationForCalls=True))
save('coverage-evidence.json',dict(canonical='nemata-jp-chapter-283-1',acceptedPreviewPointer=bind(ptr),previewCorpusId=corpus['corpusId'],canonicalPresentInPreview=False,acceptedChapter=False,sameCandidatePassedBatchReuse=accepted,oldBlockVerdicts=dict(collections.Counter(x['verdict'] for x in a['modelReview']['blockChecks'])),oldIssueTargets=issues,batchStatuses=[dict(batchId=b['group']['batchId'],status=b['status'],calls=[x['callId'] for x in b['calls']]) for b in a['batchReviews']],note='1093 faithful block checks are not 1093 independently accepted complete arguments. Reuse passed batch010 113 blocks; no whole1195 re-review.'))
print(json.dumps(dict(shared=str(S),tables=6,cells=sum(t['cells'] for t in html_checks),empty=sum(t['empty'] for t in html_checks),arrows=sum(len(t['arrows']) for t in html_checks),figures=len(figures),acceptedBatchBlocks=113)))
