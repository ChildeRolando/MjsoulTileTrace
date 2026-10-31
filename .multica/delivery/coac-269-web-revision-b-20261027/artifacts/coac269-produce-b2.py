#!/usr/bin/env python
"""COAC-269 line B batch-2 finite producer on the verified dual-slot entry.

Holds the maker-B slot (parallel/slots.mjs) for the whole dispatch window, runs at most one
bound production revision per claimed chapter, releases the slot, and writes a receipt.
The legacy production-lane.lock is NOT acquired, deleted or rewritten: under the COAC-244
dual-slot contract the maker-B slot is the capacity record for line B. No retry.
"""
import json, hashlib, os, subprocess, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

R = Path('E:/AgentData/Coach/knowledge/processing')
REPO = Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach')
NS = R / 'web-production/v1/coac269-20261027'
FROZEN = NS / 'frozen-runtime' / 'textbook-production-web.mjs'
SLOTS = R / 'parallel' / 'slots.mjs'
SLOT_PATH = R / 'parallel' / 'slots' / 'maker-B.json'
LOCK = R / 'production-lane.lock'
LEDGER = R / 'web-production/v1/calls.jsonl'
AUDIT_CALLS = R / 'audit' / 'calls'
DICT = 'web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json'
VERIFIED = 'audit/web/verified-assets/modern-ch01-s001-exact-42.json'
VARIANT = 'coac269rev1'
NODE = 'E:/IDE/NodeJS/node.exe'
OWNER = 'COAC-269 Ticket executor'
now = lambda: datetime.now(timezone.utc).isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()

cases = [
    {'chapterId': 'nemata-jp-chapter-246-1', 'articleId': 'chapter06-section002',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/chapter06-section002/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/chapter06-section002.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/chapter06-section002.eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-eb4caf1b93fc906a5a7286419009256337e9f886ce82123091931c8c5e5c4fc4.json'},
    {'chapterId': 'nemata-jp-chapter-237-1', 'articleId': 'chapter04-section016',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/chapter04-section016/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/chapter04-section016.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/chapter04-section016.5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-5c4048adf1b398f2a202dbdd0a1485cdaa539ad2ad4fd80e053dd0f2db17a959.json'},
]

only = sys.argv[1] if len(sys.argv) > 1 else None
if only:
    cases = [c for c in cases if c['chapterId'] == only or c['articleId'] == only]
    if not cases:
        raise SystemExit('unknown chapter selector: ' + only)

# Read-only evidence that the legacy lock is untouched by this batch.
lock_before = {'bytes': LOCK.read_bytes().hex(), 'mtime': datetime.fromtimestamp(LOCK.stat().st_mtime, timezone.utc).isoformat()}

receipt = {'schema': 'coac269-web-revision-production/1', 'batch': 'b2', 'ticket': 'COAC-269', 'line': 'B',
           'startedAt': now(), 'variant': VARIANT, 'model': 'gpt-6.1-sol', 'reasoningEffort': 'high',
           'budget': {'productionCallsAllowed': 2, 'firstAuditCallsAllowed': 2, 'retries': 0},
           'slotEntry': {'mechanism': 'parallel/slots.mjs', 'lane': 'B', 'owner': OWNER, 'path': str(SLOT_PATH)},
           'legacyLock': {'acquired': False, 'before': lock_before,
                          'rule': 'COAC-244 dual-slot contract: old lock is not deleted, rewritten or bypassed; B capacity is maker-B.'},
           'frozenRuntime': {}, 'chapters': []}
for f in ['textbook-production-web.mjs', 'textbook-production-cli.mjs', 'textbook-audit.mjs']:
    p = NS / 'frozen-runtime' / f
    receipt['frozenRuntime'][f] = sha(p.read_bytes())

# Pre-dispatch snapshot of audit-side calls so real model-call overlap can be computed afterwards.
audit_before = {p.stem for p in AUDIT_CALLS.glob('*.json')} if AUDIT_CALLS.exists() else set()

# Acquire the verified maker-B slot. No model dispatch happens without it.
acq = subprocess.run([NODE, str(SLOTS), 'acquire', '--lane', 'B', '--owner', OWNER, '--pid', str(os.getpid())],
                     capture_output=True, text=True, encoding='utf8', timeout=120)
receipt['makerSlot'] = {'acquireExit': acq.returncode, 'acquireStdout': acq.stdout.strip()[:2000], 'acquireStderr': acq.stderr.strip()[:1000],
                        'acquiredAt': now(), 'releasedAt': None, 'released': False}
if acq.returncode != 0:
    receipt['result'] = 'no-slot-no-calls'
    receipt['finishedAt'] = now()
    out = NS / 'receipts' / ('production-b2-no-slot-' + sha(json.dumps(receipt).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt['result'], 'receipt': str(out), 'slot': receipt['makerSlot']}, ensure_ascii=False))
    sys.exit(0)

receipt['makerSlot']['record'] = json.loads(SLOT_PATH.read_text(encoding='utf8'))
try:
    for c in cases:
        rec = {'chapterId': c['chapterId'], 'articleId': c['articleId'], 'state': 'pending'}
        claim = json.loads((R / c['claim']).read_text(encoding='utf8'))
        # exact binding re-check immediately before dispatch
        assert sha((R / c['parent']).read_bytes()) == claim['parentCandidate']['sha256'], 'parent sha drift'
        assert sha((R / c['notes']).read_bytes()) == claim['parentAudit']['sha256'], 'notes sha drift'
        assert sha((R / c['source']).read_bytes()) == claim['source']['sha256'], 'source sha drift'
        out_path = R / 'web-production/v1/candidates/modern-yabejp-ja' / (c['articleId'] + '.' + VARIANT + '.json')
        if out_path.exists():
            rec['state'] = 'refused-existing-output'
            receipt['chapters'].append(rec)
            break
        ledger_before = LEDGER.read_text(encoding='utf8').splitlines() if LEDGER.exists() else []
        args = [NODE, str(FROZEN), '--source', c['source'], '--revision-from', c['parent'],
                '--revision-notes', c['notes'], '--variant', VARIANT, '--dictionary', DICT,
                '--verified-assets', VERIFIED, '--timeout-ms', '480000']
        rec.update({'command': ' '.join(args), 'startedAt': now()})
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
    # Real model-call overlap: compare production intervals against audit-side call intervals
    # that started inside/overlapping this batch window. No agent-level concurrency is claimed.
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
    out = NS / 'receipts' / ('production-b2-' + sha(json.dumps(receipt, sort_keys=True, ensure_ascii=False).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt.get('result'), 'modelCalls': receipt['modelCalls'], 'usage': receipt['usageTotal'],
                      'slot': {k: receipt['makerSlot'].get(k) for k in ('acquireExit', 'releaseExit', 'released', 'acquiredAt', 'releasedAt')},
                      'legacyLock': {k: receipt['legacyLock'].get(k) for k in ('acquired', 'unchanged')},
                      'overlaps': overlaps,
                      'receipt': str(out),
                      'chapters': [{'chapterId': c['chapterId'], 'state': c['state'], 'candidate': c.get('candidate'), 'calls': len(c.get('actualCalls', [])), 'callsDetail': c.get('actualCalls')} for c in receipt['chapters']]}, ensure_ascii=False, indent=2))
