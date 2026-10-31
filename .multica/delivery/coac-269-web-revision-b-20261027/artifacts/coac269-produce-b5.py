#!/usr/bin/env python
"""COAC-269 line B batch-5 finite producer on the verified dual-slot entry.

Sequence enforced by this script:
  1. read-only legacy-lock snapshot (never acquired/deleted/rewritten),
  2. FRESH three-source joint exclusion re-run immediately before dispatch (never the 10:38
     preflight, never the claim-time receipt): its own receipt path/sha is recorded and both
     chapters must still be eligible with the claimed parent sha,
  3. acquire maker-B slot, assert no live slot before/after,
  4. at most one bound production revision per claimed chapter, zero retries, stop on any
     failure; the first audit quota is spent by COAC-249, not here,
  5. release the slot and record real model-call intervals.

The legacy production-lane.lock is NOT acquired, deleted or rewritten: under the COAC-244
dual-slot contract the maker-B slot is the capacity record for line B.
"""
import json, hashlib, os, subprocess, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

R = Path('E:/AgentData/Coach/knowledge/processing')
REPO = Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach')
NS = R / 'web-production/v1/coac269-20261027'
FROZEN = NS / 'frozen-runtime' / 'textbook-production-web.mjs'
JOINT_SCRIPT = Path(__file__).resolve().parent / 'coac269-joint-exclusion-precheck-v2.mjs'
GUARD = Path(__file__).resolve().parent / 'coac269-dispatch-guard.mjs'
SLOTS = R / 'parallel' / 'slots.mjs'
SLOT_PATH = R / 'parallel' / 'slots' / 'maker-B.json'
LOCK = R / 'production-lane.lock'
LEDGER = R / 'web-production/v1/calls.jsonl'
AUDIT_CALLS = R / 'audit' / 'calls'
DICT = 'web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json'
VERIFIED = 'audit/web/verified-assets/modern-ch01-s001-exact-42.json'
VARIANT = 'coac269rev1'
BATCH = 'b5'
NODE = 'E:/IDE/NodeJS/node.exe'
OWNER = 'COAC-269 Ticket executor'
now = lambda: datetime.now(timezone.utc).isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()

cases = [
    {'chapterId': 'nemata-jp-chapter-142-1', 'articleId': 'chapter01-section054',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section054/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section054.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/chapter01-section054.264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e.retry-1792969500839-d3667291.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-b5-nemata-jp-chapter-142-1-264116a9f0d98a22e3d5ae6218adf35a677aecc154c6f4bbad4982240c11b04e.json'},
    {'chapterId': 'nemata-jp-chapter-127-1', 'articleId': 'chapter01-section047',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/chapter01-section047/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/chapter01-section047.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/chapter01-section047.0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc.retry-1792965844463-86544923.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-b5-nemata-jp-chapter-127-1-0dcafc25b6ad5686171ab4a90472ee7fdc69a651ed9be98c8a5a411646e551dc.json'},
]

only = sys.argv[1] if len(sys.argv) > 1 else None
if only:
    cases = [c for c in cases if c['chapterId'] == only or c['articleId'] == only]
    if not cases:
        raise SystemExit('unknown chapter selector: ' + only)

lock_before = {'bytes': LOCK.read_bytes().hex(), 'mtime': datetime.fromtimestamp(LOCK.stat().st_mtime, timezone.utc).isoformat()}

receipt = {'schema': 'coac269-web-revision-production/1', 'batch': 'b5', 'ticket': 'COAC-269', 'line': 'B',
           'startedAt': now(), 'variant': VARIANT, 'model': 'gpt-6.1-sol', 'reasoningEffort': 'high',
           'budget': {'productionCallsAllowedPerChapter': 1, 'firstAuditCallsAllowedPerChapter': 1, 'retries': 0,
                      'spentBy249NotHere': 'first independent audit per candidate sha'},
           'slotEntry': {'mechanism': 'parallel/slots.mjs', 'lane': 'B', 'owner': OWNER, 'path': str(SLOT_PATH)},
           'legacyLock': {'acquired': False, 'before': lock_before,
                          'rule': 'COAC-244 dual-slot contract: old lock is not deleted, rewritten or bypassed; B capacity is maker-B.'},
           'frozenRuntime': {}, 'chapters': []}
for f in ['textbook-production-web.mjs', 'textbook-production-cli.mjs', 'textbook-audit.mjs']:
    p = NS / 'frozen-runtime' / f
    receipt['frozenRuntime'][f] = sha(p.read_bytes())

audit_before = {p.stem for p in AUDIT_CALLS.glob('*.json')} if AUDIT_CALLS.exists() else set()


def joint_run(tag):
    """Re-run the three-source joint exclusion and return its receipt. Zero model calls."""
    z = subprocess.run([NODE, str(JOINT_SCRIPT)], capture_output=True, text=True, encoding='utf8', timeout=180)
    if z.returncode != 0:
        raise SystemExit('joint_exclusion_failed:' + z.stderr[-2000:])
    j = json.loads(z.stdout)
    jp = R / j['receipt']
    return {'tag': tag, 'path': str(jp.relative_to(R)).replace('\\', '/'), 'sha256': sha(jp.read_bytes()),
            'recordedAt': json.loads(jp.read_text(encoding='utf8'))['recordedAt'],
            'eligible': [e['chapterId'] for e in j['eligible']], 'controlsOk': j['controlsOk']}


def dispatch_guard(c):
    """Per-dispatch gate (review fixes R1+R3).

    Every model dispatch gets its OWN fresh three-source joint exclusion and its own shared-claim
    ownership check (parallel/claims/<chapterId>.json, the record line A reads). Another lane's
    claim, a new passed receipt, a pointer move, a stale receipt or a claim bound to a different
    parent sha refuses the dispatch with zero calls. Zero model calls here.
    """
    claim = json.loads((R / c['claim']).read_text(encoding='utf8'))
    case = {'batch': BATCH, 'chapterId': c['chapterId'], 'articleId': c['articleId'],
            'parentSha256': claim['parentCandidate']['sha256'],
            'outputPath': 'web-production/v1/candidates/modern-yabejp-ja/' + c['articleId'] + '.' + VARIANT + '.json',
            'ticketClaimPath': c['claim']}
    case_path = NS / 'preflight' / ('dispatch-case-' + BATCH + '-' + c['chapterId'] + '.json')
    case_path.write_text(json.dumps(case, ensure_ascii=False, indent=2) + chr(10), encoding='utf8')
    z = subprocess.run([NODE, str(GUARD), '--case', str(case_path)],
                       capture_output=True, text=True, encoding='utf8', timeout=300)
    try:
        g = json.loads(z.stdout)
    except Exception:
        return {'ok': False, 'reasons': ['guard_output_unparsable'], 'exitCode': z.returncode,
                'stdoutTail': z.stdout[-2000:], 'stderrTail': z.stderr[-2000:]}
    g['exitCode'] = z.returncode
    return g


# Fresh joint exclusion immediately before dispatch; the claim-time and 10:38 receipts are not reused.
joint = joint_run('pre-slot-capacity')
receipt['preSlotJointExclusion'] = joint
for c in cases:
    if c['chapterId'] not in joint['eligible']:
        receipt['result'] = 'aborted-not-eligible'
        receipt['finishedAt'] = now()
        out = NS / 'receipts' / ('production-b5-not-eligible-' + sha(json.dumps(receipt).encode())[:16] + '.json')
        out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps({'result': receipt['result'], 'joint': joint, 'receipt': str(out)}, ensure_ascii=False))
        sys.exit(1)

acq = subprocess.run([NODE, str(SLOTS), 'acquire', '--lane', 'B', '--owner', OWNER, '--pid', str(os.getpid())],
                     capture_output=True, text=True, encoding='utf8', timeout=120)
receipt['makerSlot'] = {'acquireExit': acq.returncode, 'acquireStdout': acq.stdout.strip()[:2000], 'acquireStderr': acq.stderr.strip()[:1000],
                        'acquiredAt': now(), 'releasedAt': None, 'released': False}
if acq.returncode != 0:
    receipt['result'] = 'no-slot-no-calls'
    receipt['finishedAt'] = now()
    out = NS / 'receipts' / ('production-b5-no-slot-' + sha(json.dumps(receipt).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt['result'], 'receipt': str(out), 'slot': receipt['makerSlot']}, ensure_ascii=False))
    sys.exit(0)

receipt['makerSlot']['record'] = json.loads(SLOT_PATH.read_text(encoding='utf8'))
try:
    for c in cases:
        rec = {'chapterId': c['chapterId'], 'articleId': c['articleId'], 'state': 'pending'}
        claim = json.loads((R / c['claim']).read_text(encoding='utf8'))
        assert claim['chapterId'] == c['chapterId'], 'claim chapter drift'
        assert claim['claimKey'] == c['chapterId'] + ':' + claim['parentCandidate']['sha256'], 'claim key drift'
        assert sha((R / c['parent']).read_bytes()) == claim['parentCandidate']['sha256'], 'parent sha drift'
        assert sha((R / c['notes']).read_bytes()) == claim['parentAudit']['sha256'], 'notes sha drift'
        assert sha((R / c['source']).read_bytes()) == claim['source']['sha256'], 'source sha drift'
        assert claim['selectionProof']['absenceOfPassedCandidate'] is True, 'passed-candidate proof missing'
        out_path = R / 'web-production/v1/candidates/modern-yabejp-ja' / (c['articleId'] + '.' + VARIANT + '.json')
        if out_path.exists():
            rec['state'] = 'refused-existing-output'
            receipt['chapters'].append(rec)
            break
        ledger_before = LEDGER.read_text(encoding='utf8').splitlines() if LEDGER.exists() else []
        args = [NODE, str(FROZEN), '--source', c['source'], '--revision-from', c['parent'],
                '--revision-notes', c['notes'], '--variant', VARIANT, '--dictionary', DICT,
                '--verified-assets', VERIFIED, '--timeout-ms', '480000']
        # R3: fresh joint exclusion + shared-claim ownership for THIS dispatch, zero calls on drift.
        guard = dispatch_guard(c)
        rec['dispatchGuard'] = guard
        if not guard.get('ok'):
            rec['state'] = 'refused-dispatch-guard'
            rec['refusedAt'] = now()
            receipt['chapters'].append(rec)
            break
        rec.update({'command': ' '.join(args), 'startedAt': now(),
                    'jointExclusionAtDispatch': guard.get('joint'),
                    'sharedClaimAtDispatch': guard.get('sharedClaim')})
        started = time.monotonic()
        z = subprocess.run(args, cwd=str(REPO), capture_output=True, text=True, encoding='utf8', timeout=560)
        rec['durationSeconds'] = round(time.monotonic() - started, 1)
        rec['exitCode'] = z.returncode
        rec['stdoutTail'] = z.stdout[-3000:]
        rec['stderrTail'] = z.stderr[-3000:]
        ledger_after = LEDGER.read_text(encoding='utf8').splitlines() if LEDGER.exists() else []
        new_rows = []
        for line in ledger_after[len(ledger_before):]:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except Exception:
                continue
            if row.get('articleId') == c['articleId']:
                new_rows.append({k: row.get(k) for k in ['callId', 'startedAt', 'durationMs', 'success', 'usage', 'failureClass', 'transportStatus', 'rawArtifactPath', 'rawArtifactSha256', 'promptSha256', 'semanticPromptSha256', 'targets', 'revision']})
        rec['actualCalls'] = new_rows
        if z.returncode == 0 and out_path.exists():
            rec['state'] = 'produced-awaiting-independent-audit'
            rec['candidate'] = {'path': str(out_path.relative_to(R)).replace('\\', '/'), 'sha256': sha(out_path.read_bytes())}
        else:
            rec['state'] = 'failed-preserved'
        rec['finishedAt'] = now()
        receipt['chapters'].append(rec)
        if rec['state'] != 'produced-awaiting-independent-audit':
            break
        hb = subprocess.run([NODE, str(SLOTS), 'heartbeat', '--slot', str(SLOT_PATH), '--owner', OWNER],
                            capture_output=True, text=True, encoding='utf8', timeout=60)
        receipt.setdefault('heartbeats', []).append({'at': now(), 'exit': hb.returncode})
    states = [c['state'] for c in receipt['chapters']]
    receipt['result'] = 'produced' if states and all(s == 'produced-awaiting-independent-audit' for s in states) and len(states) == len(cases) else ('partial' if 'produced-awaiting-independent-audit' in states else 'failed-no-candidate')
except Exception as e:
    receipt['result'] = 'error'
    receipt['error'] = repr(e)
finally:
    rel = subprocess.run([NODE, str(SLOTS), 'release', '--slot', str(SLOT_PATH), '--owner', OWNER],
                         capture_output=True, text=True, encoding='utf8', timeout=60)
    receipt['makerSlot'].update({'releaseExit': rel.returncode, 'releaseStdout': rel.stdout.strip()[:1000],
                                 'releaseStderr': rel.stderr.strip()[:500], 'releasedAt': now(),
                                 'released': rel.returncode == 0})
    lock_after = {'bytes': LOCK.read_bytes().hex(), 'mtime': datetime.fromtimestamp(LOCK.stat().st_mtime, timezone.utc).isoformat()}
    receipt['legacyLock'].update({'after': lock_after, 'unchanged': lock_after == lock_before})
    receipt['finishedAt'] = now()
    receipt['modelCalls'] = sum(len(c.get('actualCalls', [])) for c in receipt['chapters'])
    receipt['usageTotal'] = {}
    for c in receipt['chapters']:
        for call in c.get('actualCalls', []):
            for k, v in (call.get('usage') or {}).items():
                if isinstance(v, int):
                    receipt['usageTotal'][k] = receipt['usageTotal'].get(k, 0) + v

    def ts(s):
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    prod = []
    for c in receipt['chapters']:
        for call in c.get('actualCalls', []):
            if call.get('startedAt') and call.get('durationMs') is not None:
                s = ts(call['startedAt']); e = s + timedelta(milliseconds=call['durationMs'])
                prod.append({'callId': call['callId'], 'articleId': c['articleId'], 'start': s.isoformat(), 'end': e.isoformat()})
    aud = []
    if AUDIT_CALLS.exists():
        for p in AUDIT_CALLS.glob('*.json'):
            try:
                d = json.loads(p.read_text(encoding='utf8'))
            except Exception:
                continue
            if not d.get('startedAt') or d.get('durationMs') is None:
                continue
            s = ts(d['startedAt']); e = s + timedelta(milliseconds=d['durationMs'])
            aud.append({'callId': d.get('callId'), 'articleId': d.get('articleId'), 'scope': d.get('scope'), 'start': s.isoformat(), 'end': e.isoformat(), 'new': p.stem not in audit_before})
    overlaps = []
    for a in prod:
        for b in aud:
            s1, e1, s2, e2 = ts(a['start']), ts(a['end']), ts(b['start']), ts(b['end'])
            if s1 < e2 and s2 < e1:
                overlaps.append({'production': a['callId'], 'productionArticle': a['articleId'],
                                 'audit': b['callId'], 'auditArticle': b['articleId'], 'auditScope': b['scope'],
                                 'overlapStart': max(s1, s2).isoformat(), 'overlapEnd': min(e1, e2).isoformat(),
                                 'overlapSeconds': round((min(e1, e2) - max(s1, s2)).total_seconds(), 1), 'auditCallStartedThisRun': b['new']})
    receipt['realModelCallOverlap'] = {'productionCalls': prod, 'overlaps': overlaps}
    out = NS / 'receipts' / ('production-b5-' + sha(json.dumps(receipt, sort_keys=True, ensure_ascii=False).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt.get('result'), 'modelCalls': receipt['modelCalls'], 'usage': receipt['usageTotal'],
                      'joint': joint, 'slot': {k: receipt['makerSlot'].get(k) for k in ('acquireExit', 'releaseExit', 'released', 'acquiredAt', 'releasedAt')},
                      'legacyLock': {k: receipt['legacyLock'].get(k) for k in ('acquired', 'unchanged')},
                      'overlaps': overlaps, 'receipt': str(out),
                      'chapters': [{'chapterId': c['chapterId'], 'state': c['state'], 'candidate': c.get('candidate'), 'calls': len(c.get('actualCalls', [])), 'callsDetail': c.get('actualCalls')} for c in receipt['chapters']]}, ensure_ascii=False, indent=2))
