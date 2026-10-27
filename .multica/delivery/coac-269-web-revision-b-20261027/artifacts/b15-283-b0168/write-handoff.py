from pathlib import Path
import hashlib
import json

ROOT = Path('E:/AgentData/Coach/knowledge/processing')
OUT = Path(__file__).resolve().parent
STAGE = ROOT / 'web-production/v1/runs/coac269-283-b0168-20261028'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
load = lambda p: json.loads(Path(p).read_text(encoding='utf-8-sig'))
bind = lambda p: {'path': str(p), 'sha256': sha(p), 'bytes': Path(p).stat().st_size}
for name in ['slot-released.json', 'chapter-released.json', 'dispatch-started.json', 'dispatch-finished.json', 'parent-preflight.json']:
    (OUT / name).write_bytes((STAGE / name).read_bytes())
contract = load(OUT / 'b0168-contract.json')
result = load(OUT / 'production-result.json')
check = load(OUT / 'selfcheck.json')
assert check['passed'] and result['newProductionCalls'] == 1
review = ROOT / 'audit/runtimes/coac269-283-b0168-review-v1-20261028'
handoff = {
    'schema': 'coac269-b0168-first-target-audit-handoff/1',
    'authorizationComment': '01a17f08-ea29-7998-9b93-505223235e4e',
    'ownerIssue': '01a17cae-06e4-7b30-a93f-3a030d1ae63f',
    'targetAuditIssue': '01a17471-1595-79d5-bdfa-6feaa65172c0',
    'chapterId': contract['chapterId'], 'targetId': contract['targetId'],
    'candidate': bind(Path(result['candidatePath'])), 'source': contract['source'],
    'parent': contract['parent'], 'parentAudit': contract['notes'],
    'productionCall': result['calls'][0], 'selfcheck': bind(OUT / 'selfcheck.json'),
    'revisionTargets': bind(STAGE / 'revision-targets.json'),
    'semanticEvidence244Commit': '4376e441ec31c9beed05bb1c6fcfa7333fd139f5',
    'semanticPacket': bind(ROOT / 'integration/coac244-283-projection-20261028/semantic-target-packets.json'),
    'onlyPermittedDiff': {'before': contract['before'], 'after': contract['expected']},
    'unchanged': {'otherBlocks': 1194, 'figures': 524, 'flowOrder': True, 'sourceAndOriginalRaw': True},
    'firstReview': {
        'runtimeManifest': bind(review / 'b0168-review-runtime-manifest.json'),
        'entry': str(review / 'textbook-audit-web.mjs'), 'function': 'auditWebCandidate',
        'verifier': 'verifyAuditForWebCandidate', 'retryFailed': False,
        'zeroCallRequestBoundary': bind(OUT / 'review-request-boundary.json'),
        'targetTextIds': [contract['targetId']], 'targetFigureIds': [],
        'images': check['reviewContext']['preparedImages'], 'model': 'gpt-6.1-terra', 'reasoningEffort': 'max',
        'completeQ12SourceAndChineseBlocks': 45,
        'existingGuardRequired': True, 'separateConsumerForbidden': True,
        'beforeInvoke': 'Recompute every manifest/input/image SHA, compare the actual reviewer request prompt/schema/images to the boundary, resolve official CLI to terra/max; verify ledger/raw/dispatch/in-flight deduplication and STOP/admission. If any mismatch, no call.',
        'afterInvoke': 'Keep real requestExecution model/effort/args/images, session/response events, raw SHA, audit SHA, usage/cache/duration. No silent fallback. Preserve failed/uncertain output; no retry.',
    },
    'budget': {'maximumTotalNewCalls': 2, 'productionUsed': 1, 'independentFirstAuditUsedHere': 0, 'independentFirstAuditRemaining': 1, 'automaticRetry': 0, 'failedAndVoidCount': True, 'monetaryCost': None, 'upstreamExecutionCount': None},
    'inheritedBatch010': check['batch010Reuse'],
    'deferredOriginalIssues': load(STAGE / 'revision-targets.json')['deferred'],
    'acceptanceBoundary': 'Target-only checkpoint may pass while full article remains needs-repair because all 16 non-target original findings remain. Send exact target checkpoint/raw evidence to existing 244/250 aggregation; never claim whole chapter accepted or overwrite unrelated branches.',
    'excluded': ['all other target blocks', 'Q8', 'six tables', '1195-block full review', 're-review passed batch010', 'new production', '183/236/234'],
}
target = ROOT / 'integration/coac269-283-b0168-handoff-249-20261028.json'
payload = (json.dumps(handoff, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
target.write_bytes(payload)
(OUT / 'handoff-249.json').write_bytes(payload)
print(json.dumps(bind(target)))
