"""Independent validation of the authorized Sol/Terra subset; never a full-study verdict."""
import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('ceiling_validation', Path(__file__).with_name('ceiling-validate.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def validate(out):
    read, digest = base.read, base.digest
    f, d, stop = (read(out / name) for name in ('model-freeze.json', 'dataset.json', 'model-route-stop.json'))
    assert f['engineeringRevision'] == 5 and f['routeStopHash'] == digest(stop)
    assert stop['noFurtherDeepSeekRequests'] and stop['stoppedModel'] == 'deepseek_via_claude'
    assert read(out / 'model-freeze-binding.json')['freezeHash'] == digest(f)
    assert sum(f['budgets'].values()) == 6144
    cases = [c for c in d['cases'] if c['split'] == 'evaluation' and f['assignment'][c['id']]['model'] in ('sol', 'terra')]
    assert len(cases) == 400
    submitted, failures = 0, {}
    for c in cases:
        model = f['assignment'][c['id']]['model']
        label = read(out / 'private-labels' / (c['id'] + '.json'))
        for arm in ('A', 'B', 'C', 'D', 'V0'):
            key = 'evaluation-' + ('' if model == 'sol' else 'terra-') + c['id'] + '-' + arm
            run, request, call = (read(out / kind / (key + '.json')) for kind in ('runs', 'requests', 'calls'))
            assert request['model'] == f['models'][model]
            assert call['requestDigest'] == digest({'request': request['request'], 'model': request['model']})
            g = base.grade(out, c, key, label)
            assert run['status'] != 'not_started'
            assert g['valid'] == (run['status'] == 'submitted')
            if g['valid']:
                submitted += 1
            else:
                failures[run['status']] = failures.get(run['status'], 0) + 1
    previous, claims, settled, counts = None, {}, set(), {b: 0 for b in f['budgets']}
    for seq, line in enumerate((out / 'calls.jsonl').read_text(encoding='utf-8').splitlines()):
        row = json.loads(line)
        assert row['seq'] == seq and row['previous'] == previous
        assert row['digest'] == digest({k: v for k, v in row.items() if k != 'digest'})
        previous = row['digest']
        key = row['key']
        if row['type'] == 'claim':
            assert key not in claims
            claims[key] = row
            counts[row['bucket']] += 1
            if seq == stop['ledgerRowsAtStop'] - 1:
                assert row['digest'] == stop['ledgerHeadAtStop']
            if seq >= stop['ledgerRowsAtStop']:
                assert row['bucket'] == 'evaluation' and 'deepseek' not in key
        else:
            assert row['type'] == 'settle' and key in claims and key not in settled
            settled.add(key)
            if 'callDigest' in row['result']:
                assert digest(read(out / 'calls' / (key + '.json'))) == row['result']['callDigest']
    assert len(claims) == len(settled) <= 6144
    assert all(counts[b] <= cap for b, cap in f['budgets'].items())
    assert counts['evaluation'] == 2090 and counts['smoke'] == 152
    assert read(out / 'phases' / 'models-evaluation-ready.json')['planned'] == 2000
    return {'status': 'ready_subset_checked', 'wholeStudyComplete': False, 'models': ['sol', 'terra'],
            'formalCases': 400, 'formalPlanned': 2000, 'submitted': submitted, 'failures': failures,
            'supplementalLegacyCallsPreserved': 90, 'claims': len(claims), 'buckets': counts,
            'deepSeekStopped': True, 'unusedEngineeringSlots': 2}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('--wait-pid', type=int)
    args = parser.parse_args()
    out = Path(args.out)
    if args.wait_pid:
        base.wait_process(args.wait_pid)
    try:
        result = validate(out)
    except Exception as error:
        result = {'status': 'subset_incomplete_or_validation_failed', 'error': type(error).__name__ + ': ' + str(error), 'wholeStudyComplete': False}
    (out / 'ready-subset-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    if result['status'] != 'ready_subset_checked':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
