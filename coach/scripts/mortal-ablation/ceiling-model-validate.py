"""Independent three-model closeout. Reads archives only; never invokes a model."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import re
import statistics

spec = importlib.util.spec_from_file_location('ceiling_base_validation', Path(__file__).with_name('ceiling-validate.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
read, digest, close, grade, paired, holm = base.read, base.digest, base.close, base.grade, base.paired, base.holm
MODELS = ('sol', 'deepseek_via_claude', 'terra')
ARMS = ('A', 'B', 'C', 'D', 'V0')


def key_for(phase, case_id, arm, model):
    return phase + '-' + (model + '-' if phase == 'evaluation' and model != 'sol' else '') + case_id + '-' + arm


def total(out, key):
    path = out / 'calls' / (key + '.json')
    value = (read(path)['response'].get('usage') or {}).get('totalTokens') if path.exists() else None
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def summary(recorded, grades):
    n = len(grades)
    matches, valid = sum(g['match'] for g in grades), sum(g['valid'] for g in grades)
    assert recorded['planned'] == n and recorded['matches'] == matches and recorded['submitted'] == valid
    assert close(recorded['rate'], matches / n if n else None)
    assert close(recorded['successRate'], valid / n if n else None)
    assert close(recorded['conditionalRate'], matches / valid if valid else None)


def comparison(recorded, values, treatment, control, token_keys, out):
    computed = paired(values, treatment, control)
    assert recorded['pairs'] == len(values)
    for field in ('estimate', 'low', 'high', 'wins', 'losses', 'p'):
        assert close(computed[field], recorded[field]), (treatment, control, field)
    tokens = [(total(out, t), total(out, c)) for t, c in token_keys]
    tokens = [(t, c) for t, c in tokens if t is not None and c is not None]
    denominator = sum(c for _, c in tokens)
    ratio = sum(t for t, _ in tokens) / denominator if denominator else None
    assert recorded['tokenPairs'] == len(tokens) and close(recorded['tokenRatio'], ratio)
    return computed


def validate(out):
    m, f, d = (read(out / name) for name in ('metrics.json', 'model-freeze.json', 'dataset.json'))
    assert m['version'] == 'ceiling-model-report/v1' and m['complete'] is True
    assert read(out / 'model-freeze-binding.json')['freezeHash'] == digest(f) == m['freezeHash']
    assert read(out / 'model-amendment-approved.json')['totalLimit'] == 6140
    topup = read(out / 'engineering-runtime-amendment-approved.json')
    assert topup['approved'] is True and topup['totalLimit'] == 6141 and topup['additionalEngineeringCalls'] == 1
    assert f['engineeringTopupHash'] == digest(topup)
    single = read(out / 'engineering-single-response-amendment-approved.json')
    assert single['approved'] is True and single['totalLimit'] == 6144 and single['additionalEngineeringCalls'] == 3
    assert f['singleResponseTopupHash'] == digest(single)
    assert sum(f['budgets'].values()) == 6144 and f['budgets']['evaluation'] == 4090 and f['budgets']['smoke'] == 154
    cases = [c for c in d['cases'] if c['split'] == 'evaluation']
    assert len(cases) == 800 and len({c['gameId'] for c in d['cases']}) == 980
    assert len(f['legacyPrimaryKeys']) == 255 and len(f['legacySupplementalKeys']) == 90
    assert not set(f['legacyPrimaryKeys']) & set(f['legacySupplementalKeys'])
    assignment, labels = f['assignment'], {c['id']: read(out / 'private-labels' / (c['id'] + '.json')) for c in cases}
    for q in (1, 2, 3, 4):
        selected = [c for c in cases if assignment[c['id']]['quarter'] == q]
        assert len(selected) == 200 and sum(c['stratum'] == 'random' for c in selected) == 150
        assert all(assignment[c['id']]['model'] == ('sol' if q == 1 else 'terra' if q == 4 else 'deepseek_via_claude') for c in selected)
    recorded_rows = {r['key']: r for r in [*m['rows'], *m['oracleRows'], *m['practicalRows'], *m['stabilityRows'], *m['supplementalRows']]}
    assert len(recorded_rows) == 4790
    expected_models, grades = {}, {}

    def score(c, phase, arm, model, key=None):
        key = key or key_for(phase, c['id'], arm, model)
        expected_models[key] = model
        g = grade(out, c, key, labels[c['id']])
        r = recorded_rows[key]
        assert r['match'] == g['match'] and (r['status'] == 'submitted') == g['valid']
        assert r['status'] != 'not_started'
        regret = None
        if g['valid']:
            raw = json.loads(read(out / 'calls' / (key + '.json'))['response']['call']['arguments'])
            action = next(a for a in labels[c['id']]['boundScores']['actions']
                          if a['actionRef'] == raw['actionRef'] or any(p['actionRef'] == raw['actionRef'] for p in a.get('physicalRealizations', [])))
            regret = labels[c['id']]['boundScores']['preferred']['qValue'] - action['qValue']
        assert close(regret, r['regret'])
        return g

    for c in cases:
        model = assignment[c['id']]['model']
        grades[c['id']] = {a: score(c, 'evaluation', a, model) for a in ARMS}
    primary, secondary, contrasts = [], [], {}
    for model, natural_n, challenge_n in (('sol', 150, 50), ('deepseek_via_claude', 300, 100), ('terra', 150, 50)):
        for stratum, name, n in (('random', 'natural', natural_n), ('challenge', 'challenge', challenge_n)):
            selected = [c for c in cases if assignment[c['id']]['model'] == model and c['stratum'] == stratum]
            assert len(selected) == n
            reported = m['byModel'][model][name]
            for arm in ARMS:
                summary(reported['arms'][arm], [grades[c['id']][arm] for c in selected])
                regrets = [recorded_rows[key_for('evaluation', c['id'], arm, model)]['regret'] for c in selected]
                regrets = sorted(x for x in regrets if x is not None)
                assert close(reported['arms'][arm]['meanRegret'], statistics.mean(regrets) if regrets else None)
                assert close(reported['arms'][arm]['p90Regret'], regrets[math.floor(.9 * len(regrets))] if regrets else None)
            values = [{a: grades[c['id']][a]['match'] for a in ARMS} for c in selected]
            computed = []
            for control, r in zip(('A', 'V0', 'B', 'C'), reported['comparisons']):
                c = comparison(r, values, 'D', control, [(key_for('evaluation', c['id'], 'D', model), key_for('evaluation', c['id'], control, model)) for c in selected], out)
                computed.append(c)
                if name == 'natural':
                    (primary if control == 'A' else secondary).append((c, r))
            contrasts[model + '/' + name] = computed
    for family in (primary, secondary):
        for adjusted, (_, r) in zip(holm([x['p'] for x, _ in family]), family):
            assert close(adjusted, r['adjustedP'])
    oracle_cases = [c for c in cases if c['id'] in d['oracle']]
    practical_cases = [c for c in cases if c['id'] in d['practical']]
    stability_cases = [c for c in cases if c['id'] in d['stability']]
    assert (len(oracle_cases), len(practical_cases), len(stability_cases)) == (200, 100, 50)
    oracle = {c['id']: score(c, 'oracle', 'O', assignment[c['id']]['model']) for c in oracle_cases}
    summary(m['oracle']['summary'], list(oracle.values()))
    for model in MODELS:
        selected = [c for c in oracle_cases if assignment[c['id']]['model'] == model]
        r = m['byModel'][model]['oracle']
        summary(r['summary'], [oracle[c['id']] for c in selected])
        comparison(r['versusD'], [{'O': oracle[c['id']]['match'], 'D': grades[c['id']]['D']['match']} for c in selected],
                   'O', 'D', [(key_for('oracle', c['id'], 'O', model), key_for('evaluation', c['id'], 'D', model)) for c in selected], out)
    practical = {c['id']: {a: score(c, 'practical', a, 'practical') for a in ('A', 'V0', 'D', 'O')} for c in practical_cases}
    for arm in ('A', 'V0', 'D', 'O'):
        summary(m['practical']['arms'][arm], [practical[c['id']][arm] for c in practical_cases])
    comparison(m['practical']['versusA'], [{a: practical[c['id']][a]['match'] for a in ('A', 'D')} for c in practical_cases],
               'D', 'A', [(key_for('practical', c['id'], 'D', 'practical'), key_for('practical', c['id'], 'A', 'practical')) for c in practical_cases], out)
    for model in MODELS:
        selected = [c for c in stability_cases if assignment[c['id']]['model'] == model]
        for arm in ('A', 'D'):
            repeats = [(grades[c['id']][arm], score(c, 'stability', arm, model)) for c in selected]
            valid = [(a, b) for a, b in repeats if a['valid'] and b['valid']]
            same = sum(a['choice'] == b['choice'] for a, b in valid)
            r = m['stability']['byModel'][model][arm]
            assert r['plannedPairs'] == len(selected) and r['bothValid'] == len(valid) and r['sameChoice'] == same
            assert close(r['sameChoiceAllAttempts'], same / len(selected) if selected else None)
            assert close(r['sameChoiceConditional'], same / len(valid) if valid else None)
    case_map = {c['id']: c for c in cases}
    for key in f['legacySupplementalKeys']:
        _, case_id, arm = key.split('-')
        score(case_map[case_id], 'evaluation', arm, 'sol', key)
    selections = [read(out / 'oracle' / (c['id'] + '.json')) for c in oracle_cases]
    assert m['oracle']['selection']['selected'] == sum(s['status'] == 'selected' for s in selections)
    assert m['oracle']['selection']['failed'] == sum(s['status'] == 'failed' for s in selections)
    assert m['oracle']['selection']['emptySelected'] == sum(s['status'] == 'selected' and not s['passages'] for s in selections)
    for c in oracle_cases:
        expected_models['oracle-select-chapters-' + c['id']] = 'sol'
        expected_models['oracle-select-passages-' + c['id']] = 'sol'
    old_freeze = read(out / 'freeze.json')
    pilot = read(Path(old_freeze['engineeringSupplement']['directory']) / 'dataset.json')['cases']
    for i, (model, arm) in enumerate((('deepseek_via_claude', 'A'), ('terra', 'D'), ('deepseek_via_claude', 'D'))):
        expected_models['model-smoke-' + model + '-' + pilot[i]['id'] + '-' + arm] = model
    expected_models['model-smoke-deepseek_via_claude-' + pilot[3]['id'] + '-D'] = 'deepseek_via_claude'
    for i, arm in enumerate(('A', 'C', 'D')):
        expected_models['model-smoke-deepseek_via_claude-' + pilot[i + 4]['id'] + '-' + arm] = 'deepseek_via_claude'
    for key in f.get('engineeringDebugKeys', []):
        expected_models[key] = 'deepseek_via_claude'
    previous, claims, settled, buckets = None, {}, set(), {k: 0 for k in f['budgets']}
    formal_models = {k: 0 for k in MODELS}
    for seq, line in enumerate((out / 'calls.jsonl').read_text(encoding='utf-8').splitlines()):
        row = json.loads(line)
        assert row['seq'] == seq and row['previous'] == previous and digest({k: v for k, v in row.items() if k != 'digest'}) == row['digest']
        previous = row['digest']
        if seq == f['ledgerBaseline']['rows'] - 1:
            assert row['digest'] == f['ledgerBaseline']['head']
        key = row['key']
        if row['type'] == 'claim':
            assert key not in claims
            claims[key] = row
            buckets[row['bucket']] += 1
            model = 'sol' if seq < f['ledgerBaseline']['rows'] else expected_models[key]
            request = read(out / 'requests' / (key + '.json'))
            assert request['model'] == f.get('historicalRequestModels', {}).get(key, f['models'][model])
            assert row['requestDigest'] == digest({'request': request['request'], 'model': request['model']})
            if row['bucket'] == 'evaluation':
                formal_models[model] += 1
            call = read(out / 'calls' / (key + '.json'))
            if model == 'deepseek_via_claude' and call['response']['status'] == 'ready':
                proof = call['transportProof']
                assert proof['forwardedModelRequests'] == 1
                if proof.get('acceptedResponseSource') == 'first_model_response':
                    assert proof['firstResponseComplete'] and proof['firstResponseStopReason'] in ('end_turn', 'tool_use')
                    assert proof['outputToolCalls'] <= 1 and proof['cliStoppedAfterFirstResponse']
                else:
                    assert proof['nativeTurnCount'] == 1 or proof['nativeTurnCount'] == 2 and proof['structuredOutput'] and proof['outputToolCalls'] == 1
                assert proof['observedBackend'].startswith(f['models'][model]['expectedBackendPrefix'])
                assert proof['requestedApiEffort'] == 'high'
                if proof.get('normalization'):
                    assert proof['normalization']['removedField'] == 'call.decisionSummary' and proof['normalization']['argumentsUnchanged']
                    visible = proof['visibleResultText'].strip()
                    fence = re.fullmatch(r'```(?:json)?\s*\n([\s\S]*?)\n```', visible)
                    raw_answer = json.loads(fence.group(1) if fence else visible)
                    assert set(raw_answer) == {'call', 'decisionSummary'} and set(raw_answer['call']) == {'name', 'arguments', 'decisionSummary'}
                    assert raw_answer['call']['arguments'] == json.loads(call['response']['call']['arguments'])
                    assert raw_answer['decisionSummary'] == call['response']['decisionSummary']
                    del raw_answer['call']['decisionSummary']
                    assert raw_answer == json.loads(proof['normalizedVisibleResultText'])
                raw = proof.get('nativeUsage', {})
                if all(k in raw for k in ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens')):
                    usage = call['response']['usage']
                    assert usage['inputTokens'] == raw['input_tokens'] + raw['cache_read_input_tokens'] + raw['cache_creation_input_tokens']
                    assert usage['totalTokens'] == usage['inputTokens'] + raw['output_tokens']
        else:
            assert row['type'] == 'settle' and key in claims and key not in settled
            settled.add(key)
            call = read(out / 'calls' / (key + '.json'))
            assert call['requestDigest'] == claims[key]['requestDigest']
            if 'callDigest' in row['result']:
                assert digest(call) == row['result']['callDigest']
    assert len(claims) == len(settled) <= 6144
    assert all(buckets[k] <= n for k, n in f['budgets'].items())
    assert all(formal_models[k] <= n for k, n in {'sol': 1090, 'deepseek_via_claude': 2000, 'terra': 1000}.items())
    review = out / 'review'
    pages = [review / 'index.html', review / 'knowledge.html', *[review / ('case-' + c['id'] + '.html') for c in cases]]
    for page in pages:
        assert page.is_file()
        for url in re.findall(r'(?:src|href)="([^"]+)"', page.read_text(encoding='utf-8')):
            if url and not url.startswith(('#', 'https:', 'http:', 'data:')):
                assert (page.parent / url.split('#')[0]).exists(), (page.name, url)
    return {'status': 'computed_checks_passed', 'formalCases': 800, 'formalScores': 4000,
            'supplementalScores': 90, 'oracleScores': 200, 'practicalScores': 400, 'stabilityScores': 100,
            'claims': len(claims), 'buckets': buckets, 'formalCallsByModel': formal_models,
            'contrasts': contrasts, 'visualInspectionPerformed': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('--wait-pid', type=int)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    if args.wait_pid:
        base.wait_process(args.wait_pid)
    try:
        result = validate(out)
        text = '# 三模型独立复算\n\n已通过4000次主评分、90次旧补充、O200次、Luna400次、稳定性100次、分模型分母与配对统计、Holm校正、模型/路由/账本绑定及800题页面链接。实际视觉验收仍须另行完成。\n'
    except Exception as error:
        result = {'status': 'not_complete_or_validation_failed', 'error': type(error).__name__ + ': ' + str(error)}
        text = '# 三模型验收尚未通过\n\n' + result['error'] + '\n'
    (out / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (out / 'FINAL-VALIDATION.md').write_text(text, encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    if result['status'] != 'computed_checks_passed':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
