"""Archive the completed, bounded 347/155 stage. No model invocations."""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path('.multica/delivery/coac244-text-347-155-20261027')
if (OUT/'batch-result.json').exists():
    raise SystemExit('completed stage archive exists; refuse to rewrite timestamp or handoff digest')
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p, obj):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

passed = read(OUT/'347-verified-pass.json')
assert passed['status'] == 'passed'
for key in ('candidate', 'audit'):
    assert sha(passed[key+'Path']) == passed[key+'Sha256']
production = ROOT/'web-production/v1/raw-calls/b8e3bd21-b7ae-4f09-a15b-345b1bba167a.json'
review = ROOT/'audit/calls/cfc3e7a6-ca0e-417c-8157-3b126ae55d1b.json'
copies = {
    '347-candidate.display.json': Path(passed['candidatePath']),
    '347-audit.json': Path(passed['auditPath']),
    '347-production-raw.json': production,
    '347-audit-raw.json': review,
}
run = ROOT/'web-production/v1/runs/coac244-text-347-20261027'
for name in ('dispatch-started.json','dispatch-finished.json','slot-released.json','chapter-released.json'):
    copies['347-'+name] = run/name
for name, source in copies.items():
    shutil.copyfile(source, OUT/name)
    assert sha(source) == sha(OUT/name)

prod = read(production)
review_receipt = passed['calls'][0]
prod_usage = prod.get('usage') or prod.get('result',{}).get('usage')
assert prod_usage == {'inputTokens':13090,'cachedInputTokens':0,'outputTokens':459}
assert review_receipt['usage'] == {'inputTokens':16481,'cachedInputTokens':0,'outputTokens':449}
result = {
    'schema':'coach-coac244-bounded-text-stage/1',
    'recordedAt':datetime.now(timezone.utc).isoformat(),
    'authorizationCommentId':'01a17e29-722d-7553-80a6-6a91f6da3f77',
    'budget':{'maximumNewCalls':4,'actualNewCalls':2,'productionCalls':1,
              'independentFirstReviewCalls':1,'failedOrVoidNewCalls':0,'automaticRetries':0,
              'unusedCalls':2,'unusedCallsReallocated':False,
              'usage':{'inputTokens':29571,'cachedInputTokens':0,'outputTokens':908},
              'currencyCharge':'not exposed by call receipts; no invented price'},
    'passed':[passed],
    'blocked':[{'chapterId':'79-cn-chapter-155-4','newCalls':0,'newCandidate':None,
                'targetId':'79-bilibili-cn:cv1751265:b0008',
                'parentSha256':'20f4b2fcb544f458312f2c5bb11ab90096d5198c42c19400f73534b287402f4f',
                'error':'web_revision_is_not_isolated_figure_repair',
                'reason':'Existing zh-CN entry accepts figure-only repairs, while existing audit requires Chinese text verbatim. The Japanese quote translation has no existing lawful text repair route.',
                'nextMinimum':'Explicit owner decision and bounded entry support for translating only this Japanese quote, then at most one real production and one independent review; not executed in this stage.'}],
    'production':{'callId':'b8e3bd21-b7ae-4f09-a15b-345b1bba167a',
                  'rawPath':str(production),'rawSha256':sha(production),
                  'usage':prod_usage},
    'review':review_receipt,
    'scope':{'onlyChangedTextId':'modern-yabejp-ja:archive01-section008:b0066',
             'bodyBlocks':66,'figures':27,'otherBodyAndSemanticFigureFieldsUnchanged':True,
             'reviewMethod':passed['method'],
             'imageReviewThisStage':False,
             'unchangedScope':'Reuses authenticated full parent independent audit; pixel equality is a presentation integrity check, not a new semantic review.'},
    'handoff':{'issueId':'01a17471-25e6-7731-a529-3df99acf3d42',
               'status':'ready-for-incremental-integration','actualIntegrated':False,
               'formalActiveChanged':False,'newModelCallsAuthorizedForIntegration':0},
    'artifacts':[{'name':name,'sha256':sha(OUT/name),'sourcePath':str(source)} for name, source in copies.items()],
}
write(OUT/'batch-result.json',result)
handoff = ROOT/'integration/coac244-reviewed-text347-155-20261027.json'
write(handoff,result)
shutil.copyfile(handoff,OUT/'handoff-250.json')
print(json.dumps({'passed':1,'blocked':1,'actualCalls':2,'productionRawKeys':list(prod),
                  'productionUsage':prod_usage,'handoffPath':str(handoff),'handoffSha256':sha(handoff)}))
