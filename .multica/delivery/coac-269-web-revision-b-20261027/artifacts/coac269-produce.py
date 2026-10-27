#!/usr/bin/env python
"""COAC-269 line B finite producer: acquire the existing single maker lane lock, run at most
one bound production revision per claimed chapter, release, and write a receipt. No retry."""
import json, hashlib, os, subprocess, sys, time, msvcrt
from datetime import datetime, timezone
from pathlib import Path

R = Path('E:/AgentData/Coach/knowledge/processing')
REPO = Path('E:/AgentWorkspaces/Coach/mortal-rag-ablation/coach')
NS = R / 'web-production/v1/coac269-20261027'
FROZEN = NS / 'frozen-runtime' / 'textbook-production-web.mjs'
LOCK = R / 'production-lane.lock'
LEDGER = R / 'web-production/v1/calls.jsonl'
DICT = 'web-production/v1/dictionaries/modern-accepted-tiles-c33800d79e603fff8d31dfccb7cf26b648f8f9765af7ec01e8beb0f10805ed2a.json'
VERIFIED = 'audit/web/verified-assets/modern-ch01-s001-exact-42.json'
VARIANT = 'coac269rev1'
NODE = 'E:/IDE/NodeJS/node.exe'
now = lambda: datetime.now(timezone.utc).isoformat()
sha = lambda b: hashlib.sha256(b).hexdigest()

cases = [
    {'chapterId': 'nemata-jp-chapter-338-1', 'articleId': 'archive01-section006',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/archive01-section006/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/archive01-section006.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/archive01-section006.04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-04ab76405f88fa1df61d68c2047cf3cb344b8db8644f193c520fee805b83c427.json'},
    {'chapterId': 'nemata-jp-chapter-273-1', 'articleId': 'chapter06-exercise002-02',
     'source': 'web-sources/v1/modern-yabejp-ja/articles/chapter06-exercise002-02/source.json',
     'parent': 'web-production/v1/candidates/modern-yabejp-ja/chapter06-exercise002-02.display.json',
     'notes': 'audit/web/articles/modern-yabejp-ja/chapter06-exercise002-02.c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json',
     'claim': 'web-production/v1/coac269-20261027/claims/claim-c57c30e4ffddb9ea661295364ee46739438c2c17a4f4c772e5df0b8391c7576b.json'},
]

only = sys.argv[1] if len(sys.argv) > 1 else None
if only:
    cases = [c for c in cases if c['chapterId'] == only or c['articleId'] == only]
    if not cases:
        raise SystemExit('unknown chapter selector: ' + only)

receipt = {'schema': 'coac269-web-revision-production/1', 'ticket': 'COAC-269', 'line': 'B',
           'startedAt': now(), 'variant': VARIANT, 'model': 'gpt-6.1-sol', 'reasoningEffort': 'high',
           'budget': {'productionCallsAllowed': 2, 'firstAuditCallsAllowed': 2, 'retries': 0},
           'frozenRuntime': {}, 'chapters': []}
for f in ['textbook-production-web.mjs', 'textbook-production-cli.mjs', 'textbook-audit.mjs']:
    p = NS / 'frozen-runtime' / f
    receipt['frozenRuntime'][f] = sha(p.read_bytes())

# Respect the existing single maker lane: no dispatch without holding the lock.
lock_f = open(LOCK, 'a+b')
lock_f.seek(0, 2)
if lock_f.tell() == 0:
    lock_f.write(b'0'); lock_f.flush()
lock_f.seek(0)
wait_started = time.monotonic()
acquired = False
last_err = None
while time.monotonic() - wait_started < 240:
    try:
        msvcrt.locking(lock_f.fileno(), msvcrt.LK_NBLCK, 1)
        acquired = True
        break
    except OSError as e:
        last_err = str(e)
        time.sleep(3)
receipt['makerLane'] = {'lockPath': str(LOCK), 'acquired': acquired, 'waitedSeconds': round(time.monotonic() - wait_started, 1), 'lastError': last_err}
if not acquired:
    receipt['result'] = 'no-slot-lock-busy-no-calls'
    receipt['finishedAt'] = now()
    out = NS / 'receipts' / ('production-busy-' + sha(json.dumps(receipt).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt['result'], 'receipt': str(out)}))
    sys.exit(0)

try:
    for c in cases:
        rec = {'chapterId': c['chapterId'], 'articleId': c['articleId'], 'state': 'pending'}
        # exact binding re-check immediately before dispatch
        assert sha((R / c['parent']).read_bytes()) == json.loads((R / c['claim']).read_text(encoding='utf8'))['parentCandidate']['sha256']
        assert sha((R / c['notes']).read_bytes()) == json.loads((R / c['claim']).read_text(encoding='utf8'))['parentAudit']['sha256']
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
                new_rows.append({k: row.get(k) for k in ['callId', 'success', 'usage', 'durationMs', 'failureClass', 'transportStatus', 'rawArtifactPath', 'rawArtifactSha256', 'promptSha256', 'semanticPromptSha256', 'targets', 'revision']})
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
    states = [c['state'] for c in receipt['chapters']]
    receipt['result'] = 'produced' if states and all(s == 'produced-awaiting-independent-audit' for s in states) and len(states) == len(cases) else ('partial' if 'produced-awaiting-independent-audit' in states else 'failed-no-candidate')
except Exception as e:
    receipt['result'] = 'error'
    receipt['error'] = repr(e)
finally:
    try:
        lock_f.seek(0); msvcrt.locking(lock_f.fileno(), msvcrt.LK_UNLCK, 1)
    except OSError as e:
        receipt['makerLane']['unlockError'] = str(e)
    lock_f.close()
    receipt['makerLane']['releasedAt'] = now()
    receipt['finishedAt'] = now()
    receipt['modelCalls'] = sum(len(c.get('actualCalls', [])) for c in receipt['chapters'])
    receipt['usageTotal'] = {}
    for c in receipt['chapters']:
        for call in c.get('actualCalls', []):
            for k, v in (call.get('usage') or {}).items():
                if isinstance(v, int):
                    receipt['usageTotal'][k] = receipt['usageTotal'].get(k, 0) + v
    out = NS / 'receipts' / ('production-' + sha(json.dumps(receipt, sort_keys=True, ensure_ascii=False).encode())[:16] + '.json')
    out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'result': receipt['result'], 'modelCalls': receipt['modelCalls'], 'usage': receipt['usageTotal'], 'receipt': str(out), 'chapters': [{'chapterId': c['chapterId'], 'state': c['state'], 'candidate': c.get('candidate'), 'calls': len(c.get('actualCalls', []))} for c in receipt['chapters']]}, ensure_ascii=False))
