"""Read-only batch accounting; writes evidence copies, never dispatches or changes model artifacts."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json

OUT = Path(__file__).resolve().parent
ROOT = Path('E:/AgentData/Coach/knowledge/processing')
STAGE = ROOT / 'web-production/v1/runs/coac269-exact-183236-v2-20261028'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


source_summary = read(OUT / 'stage-summary.json')
checks = []
manifest = Path(source_summary['runtime']['path'])
assert sha(manifest) == source_summary['runtime']['sha256']
checks.append(source_summary['runtime'])
for ref in read(manifest)['files']:
    assert sha(ref['path']) == ref['sha256']
    checks.append(ref)
contracts = read(OUT / 'exact-text-contracts.json')
old = read(ROOT / 'web-production/v1/runs/coac269-text-183236-20261028/batch-result.json')
assert old['newLocalProductionCalls'] == 2 and old['newIndependentReviewCalls'] == 0
all_audit_calls = [json.loads(line) for line in (ROOT / 'audit/calls.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
current_production, current_audits, chapters = [], [], []
for key in ['183', '236']:
    job = next(j for j in source_summary['jobs'] if j['chapterId'] == 'nemata-jp-chapter-' + key + '-1')
    result = read(OUT / (key + '-result.json'))
    contract = next(j for j in contracts['jobs'] if j['chapterId'] == job['chapterId'])
    run = STAGE / ('chapter-' + key)
    for p in run.iterdir():
        if p.is_file():
            (OUT / (key + '-' + p.name)).write_bytes(p.read_bytes())
    assert read(run / 'slot-released.json')['ok'] and read(run / 'chapter-released.json')['ok']
    for ref in [job['source'], job['parent'], job['parentAudit'], result['raw']]:
        assert sha(ref['path']) == ref['sha256']
        checks.append(ref)
    assert result['auditReady'] and result['exactWhitelistPassed']
    assert sha(result['candidatePath']) == result['candidateSha256'] == sha(OUT / (key + '-candidate.json'))
    assert sha(result['displayPath']) == result['displaySha256'] == sha(OUT / (key + '-display.json'))
    assert sha(OUT / (key + '-production-raw.json')) == result['raw']['sha256']
    raw = read(result['raw']['path'])
    preview = read(run / 'preflight.json')
    assert raw['requestPrompt'] == preview['request']['closedPrompt']
    assert raw['parsedOutput'] == {'translations': [{'sourceBlockId': contract['targetId'], 'text': contract['expectedText']}], 'figures': []}
    assert not raw['visualInputs']
    assert result['calls'][0]['promptSha256'] == preview['requestSha256']
    assert len(result['calls']) == 1
    current_production.extend(result['calls'])
    handoff = OUT / (key + '-handoff-to249.json')
    assert handoff.read_bytes() == (STAGE / ('handoff-' + key + '-to249.json')).read_bytes()
    wakeup = read(OUT / (key + '-wakeup249.json'))
    assert wakeup['agent_id'] == 'b144c077-cadd-4749-a53d-4b9cb98191b8'
    calls = [c for c in all_audit_calls if c.get('binding', {}).get('productionSha256') == result['displaySha256']]
    assert len(calls) <= 1, 'first review allowance is one per display SHA'
    current_audits.extend(calls)
    receipt_path = ROOT / 'audit/web/articles/modern-yabejp-ja' / (contract['articleId'] + '.' + result['displaySha256'] + '.json')
    audit = {'status': 'pending-no-terminal-receipt-observed', 'callsObserved': calls}
    if receipt_path.exists():
        receipt = read(receipt_path)
        assert receipt['production']['sha256'] == result['displaySha256']
        audit.update(status=receipt['status'], receipt={'path': str(receipt_path), 'sha256': sha(receipt_path)},
                     method=receipt.get('method'), issues=receipt.get('modelReview', {}).get('issues'))
        (OUT / (key + '-observed-audit.json')).write_bytes(receipt_path.read_bytes())
    for c in calls:
        path = ROOT / 'audit/calls' / (c['callId'] + '.json')
        assert path.exists()
        (OUT / (key + '-observed-audit-raw.json')).write_bytes(path.read_bytes())
    chapters.append({'chapterId': job['chapterId'], 'candidate': {'path': result['displayPath'], 'sha256': result['displaySha256']},
                     'raw': result['raw'], 'exactWhitelistPassed': True, 'handoff': {'path': str(STAGE / ('handoff-' + key + '-to249.json')), 'sha256': sha(handoff)},
                     'wakeupId': wakeup['id'], 'auditObserved': audit, 'productionCallIds': [c['callId'] for c in result['calls']]})

all_production = old['calls'] + current_production
for c in all_production:
    assert sha(ROOT / 'web-production/v1' / c['rawArtifactPath']) == c['rawArtifactSha256']
known_calls = all_production + current_audits
assert len(all_production) == 4 and len(known_calls) <= 6
at = datetime.now(timezone.utc).isoformat()
summary = {'schema': 'coac269-exact-text-batch-accounting/2', 'at': at, 'authorizationCommentId': '01a17ed7-c04d-71e7-82eb-57aed9c7b3e1',
           'outcome': 'two-exact-production-candidates-handed-to-independent-review', 'runtime': source_summary['runtime'],
           'runtimeByteExactCommit': '8ea8e86efa6c1b3c778b7cbf3efca1da372352fb', 'zeroCallRegressionChecksPassed': 27,
           'priorFailedProductionCalls': 2, 'newProductionCallsThisRun': 2, 'auditCallsDispatchedByThisExecutor': 0,
           'auditCallsObservedAtCollection': len(current_audits), 'lifetimeLocalCallRecordsObserved': len(known_calls),
           'remainingFirstAuditCallsMaximum': 2 - len(current_audits), 'lifetimeBatchMaximum': 6, 'executorAutomaticRetries': 0,
           'upstreamRequestCount': None, 'monetaryCost': None, 'productionModel': 'gpt-6.1-sol', 'productionReasoningEffort': 'high', 'images': 0,
           'newProductionUsage': {k: sum(c['usage'][k] for c in current_production) for k in ['inputTokens', 'cachedInputTokens', 'outputTokens']},
           'lifetimeProductionUsage': {k: sum(c['usage'][k] for c in all_production) for k in ['inputTokens', 'cachedInputTokens', 'outputTokens']},
           'makerBReleased': not (ROOT / 'parallel/slots/maker-B.json').exists(),
           'chapters': chapters, 'priorFailedProductionCallRecords': old['calls'], 'newProductionCallRecords': current_production,
           'independentAuditCallRecordsObserved': current_audits,
           'acceptanceNote': 'Exact production/raw/parent verification and durable handoff do not establish semantic or integration acceptance. Independent uncertain remains blocking; only a real verified pass may go to 250. Audit counts are an observation at collection, not a claim that a queued handoff has run.'}
assert summary['makerBReleased']
for chapter in chapters:
    assert not (ROOT / 'parallel/claims' / (chapter['chapterId'] + '.json')).exists()
write(OUT / 'batch-result.json', summary)
write(STAGE / 'batch-result.json', summary)
write(OUT / 'final-immutable-checks.json', {'at': at, 'checksPassed': len(checks), 'checks': checks})
print(json.dumps({'newProductionCalls': 2, 'newAuditCallsObserved': len(current_audits), 'lifetimeCallsObserved': len(known_calls),
                  'newProductionUsage': summary['newProductionUsage'], 'checks': len(checks)}, ensure_ascii=True))
