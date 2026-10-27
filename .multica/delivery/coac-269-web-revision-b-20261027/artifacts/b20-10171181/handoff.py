from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path('E:/AgentData/Coach/knowledge/processing')
HERE=Path(__file__).resolve().parent
STAGE=ROOT/'web-production/v1/runs/coac269-283-10171181-20261028'
RUN=ROOT/'audit/runtimes/coac269-283-10171181-v1-20261028'
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'))
bind=lambda p:{'path':str(p),'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()}
check=load(HERE/'selfcheck.json');assert check['passed']
c=load(HERE/'contract.json');r=load(HERE/'result.json')
for name in ['selfcheck.json','review-requests.json','inherited-evidence.json','preflight.json','slot-released.json','claim-released.json']:
    shutil.copyfile(HERE/name,STAGE/name)
for name in ['textbook-production-web.mjs','textbook-audit-web.mjs','exact-request.mjs']:
    shutil.copyfile(RUN/name,HERE/name)
h={'schema':'coac269-283-10171181-first-target-audit/1','authorizationComment':c['authorizationComment'],'chapterId':'nemata-jp-chapter-283-1','candidate':r['candidate'],'parent':c['parent'],'parentAudit':c['notes'],'originalFullParentAudit':c['baseNotes'],'source':c['source'],'targets':[{'id':t['id'],'before':t['before'],'expected':t['expected'],'group':t['group']['batchId'],'questionRange':t['questionRange'],'images':len(t['images'])} for t in c['targets']],
   'runtime':bind(RUN/'runtime-manifest.json'),'entry':str(RUN/'textbook-audit-web.mjs'),'function':'auditWebCandidate','targetVerifier':'verifyGroupRevisionAudit','wholeArticleVerifier':'verifyAuditForWebCandidate (expected to refuse a needs-repair aggregate)',
   'reviewBoundary':bind(STAGE/'review-requests.json'),'selfcheck':bind(STAGE/'selfcheck.json'),'inheritedEvidence':bind(STAGE/'inherited-evidence.json'),'productionCalls':r['calls'],
   'budget':{'maximumNewCalls':4,'productionUsed':2,'firstAuditUsedHere':0,'remainingFirstAuditMaximum':2,'oneFirstAuditPerGroup':True,'retry':0,'failedVoidIncluded':True,'fee':None,'upstreamExecutionCount':None},
   'inheritance':'One candidate extends the actual 00074d1c parent; b0168/b0396/b0962, six-table scope and Q8 scope remain byte-identical. Inherit their exact independent evidence and mandatory limits; do not rewrite old aggregate/raw severities.',
   'auditBoundary':'Only group009/b1017 and group011/b1181, each one text target with11/15 original PNGs. Same frozen schema-v2 CLI resolves actual image payload to terra/max. No figure targets. All other1193 blocks/524 figures/tableContext stay inherited. Compare actual prompt/schema/images with published boundary, preserving image order/hash; path separator aliases only, transport uses published strings.',
   'callCollection':'Use the existing audit guard/STOP/admission. Read all same-SHA raw/ledger/checkpoints/in-flight markers first; do not duplicate, retry failed/void or add a consumer. Preserve real requestExecution/argv/session/events/usage/cache/duration/raw/checkpoint. Whole-article needs-repair exception after receipt is written is not transport failure: collect via verifyGroupRevisionAudit, retain both outcomes, never rerun to turn it green.',
   'nextAction':'249 independently audits this exact candidate, at most one first call per target group. Return full checkpoint/raw results to269 and existing244/250 issue aggregation. Target passes never authorize integrating the needs-repair whole chapter; do not overwrite another branch or switch active.',
   'excluded':['b0396 re-review','b0962 re-review','b0168 re-review','Q8 re-review','six-table re-review','batch010113blocks re-review','other targets','other chapter production','whole1195block review']}
p=ROOT/'integration/coac269-283-10171181-handoff-249-20261028.json'
text=json.dumps(h,ensure_ascii=False,indent=2)+'\n';p.write_text(text,encoding='utf-8',newline='\n');(HERE/'handoff-249.json').write_bytes(p.read_bytes())
print(json.dumps(bind(p)))
