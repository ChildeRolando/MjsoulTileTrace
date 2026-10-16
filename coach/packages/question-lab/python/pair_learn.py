"""Grouped SVR; row selection, scaling, selection and explanation never fit holdout."""
import hashlib
import math
import sys
from collections import defaultdict
import numpy as np
import sklearn
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor, export_text


def key(value):
    return hashlib.sha256(value.encode()).hexdigest()


def select_rows(rows, limit):
    # Round-robin by source then state: no state is lost while capacity permits.
    groups = defaultdict(lambda: defaultdict(list))
    for row in rows:
        groups[row['groupId']][row['sampleId']].append(row)
    states_by_group = []
    for gid in sorted(groups, key=key):
        states_by_group.append([sorted(groups[gid][sid], key=lambda r: key(r['pairId'])) for sid in sorted(groups[gid], key=key)])
    states = [group[i] for i in range(max(map(len, states_by_group), default=0)) for group in states_by_group if i < len(group)]
    result = []
    for depth in range(max(map(len, states), default=0)):
        for state in states:
            if depth < len(state):
                result.append(state[depth])
                if len(result) == limit:
                    return result
    return result


def weights(rows):
    groups = defaultdict(lambda: defaultdict(int))
    for r in rows:
        groups[r['groupId']][r['sampleId']] += 1
    w = np.array([1 / (len(groups[r['groupId']]) * groups[r['groupId']][r['sampleId']]) for r in rows])
    return w / w.mean() if len(w) else w


def metrics(rows, predicted, gap):
    y = np.array([r['y'] for r in rows]); w = weights(rows)
    error = predicted - y
    actual = np.where(y > gap, 2, np.where(y < -gap, 0, 1))
    observed = np.where(predicted > gap, 2, np.where(predicted < -gap, 0, 1))
    confusion = [[int(np.sum((actual == i) & (observed == j))) for j in range(3)] for i in range(3)]
    calibration = []
    for indices in np.array_split(np.argsort(predicted), min(10, len(rows))):
        calibration.append({'count': len(indices), 'predicted': float(np.average(predicted[indices], weights=w[indices])),
                            'actual': float(np.average(y[indices], weights=w[indices]))})
    return {'count': len(rows), 'mae': float(np.average(np.abs(error), weights=w)),
            'rmse': float(np.sqrt(np.average(error**2, weights=w))),
            'signAccuracy': float(np.average(actual == observed, weights=w)), 'confusion': confusion,
            'exactTies': int(np.sum(y == 0)), 'sensitive': int(np.sum(np.abs(y) <= gap)), 'calibration': calibration}


def fitted(rows, features, settings):
    x = np.array([[r['features'][f] for f in features] for r in rows]); y = np.array([r['y'] for r in rows])
    w = weights(rows)
    scaler = StandardScaler().fit(x, sample_weight=w)
    model = SVR(kernel=settings['kernel'], C=settings['C'], epsilon=settings['epsilon'], gamma='scale', cache_size=128)
    model.fit(scaler.transform(x), y, sample_weight=w)
    return scaler, model


def predict(pair, rows, features):
    scaler, model = pair
    return model.predict(scaler.transform([[r['features'][f] for f in features] for r in rows]))


def fit_pairs(request):
    rows = request['rows']
    if any(set(r['features']) != set(request['allFeatures']) or not math.isfinite(r['y']) for r in rows):
        raise ValueError('pair_feature_authority_invalid')
    train = [r for r in rows if r['split'] == 'train']; test = [r for r in rows if r['split'] == 'test']
    if set(r['groupId'] for r in train) & set(r['groupId'] for r in test):
        raise ValueError('pair_group_leakage')
    chosen = select_rows(train, request['options']['maxTrainPairs'])
    result = {'schemaVersion': 'question-lab-fit/v2', 'evaluated': request['evaluate'],
              'producer': {'python': sys.version.split()[0], 'sklearn': sklearn.__version__},
              'trainingPairIds': [r['pairId'] for r in chosen], 'models': {}}
    groups = [r['groupId'] for r in chosen]
    for name, features in request['featureSets'].items():
        if len(set(groups)) < 5 or len(chosen) < 10:
            result['models'][name] = {'status': 'insufficient_evidence', 'reason': 'requires_five_groups_and_ten_pairs'}
            continue
        folds = list(GroupKFold(3, shuffle=True, random_state=19).split(chosen, groups=groups))
        candidates = []
        for kernel in ('linear', 'rbf'):
            for c in (.1, 1., 10.):
                for epsilon in (.01, .05):
                    candidate = {'kernel': kernel, 'C': c, 'epsilon': epsilon}
                    errors = []; fold_groups = []
                    for a, b in folds:
                        fitting = [chosen[i] for i in a]; validation = [chosen[i] for i in b]
                        model = fitted(fitting, features, candidate)
                        errors.append(metrics(validation, predict(model, validation, features), request['options']['sensitiveGap'])['mae'])
                        fold_groups.append(len(set(r['groupId'] for r in validation)))
                    candidates.append(dict(candidate, mae=float(np.average(errors, weights=fold_groups))))
        best = min(candidates, key=lambda c: c['mae'])
        linear = min((c for c in candidates if c['kernel'] == 'linear'), key=lambda c: c['mae'])
        if linear['mae'] <= best['mae'] + .01:
            best = linear
        oof = []
        for a, b in folds:
            model = fitted([chosen[i] for i in a], features, best)
            validation = [chosen[i] for i in b]
            oof.extend({'pairId': r['pairId'], 'predicted': float(p)} for r, p in zip(validation, predict(model, validation, features)))
        scaler, model = fitted(chosen, features, best)
        x = np.array([[r['features'][f] for f in features] for r in train]); prediction = model.predict(scaler.transform(x))
        tree = DecisionTreeRegressor(max_depth=3, min_samples_leaf=max(3, len(chosen)//50), random_state=19)
        # The explanation also uses the bounded, group-weighted training set.
        xc = np.array([[r['features'][f] for f in features] for r in chosen])
        tree.fit(xc, model.predict(scaler.transform(xc)), sample_weight=weights(chosen))
        explanation = {'tree': export_text(tree, feature_names=features),
                       'trainingFidelityMae': float(np.average(np.abs(tree.predict(x)-prediction), weights=weights(train))),
                       'constantFeatures': [f for f, variance in zip(features, scaler.var_) if variance == 0]}
        if model.kernel == 'linear':
            explanation['standardizedWeights'] = model.coef_[0].tolist()
        serialized = {'schemaVersion': 'question-lab-svr/v2', 'features': features,
                      'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist(),
                      'supportVectors': model.support_vectors_.tolist(), 'coefficients': model.dual_coef_[0].tolist(),
                      'intercept': float(model.intercept_[0]), 'kernel': model.kernel, 'gamma': float(model._gamma),
                      'C': model.C, 'epsilon': model.epsilon}
        entry = {'status': 'fitted', 'model': serialized, 'cv': candidates, 'oof': oof,
                 'train': metrics(train, prediction, request['options']['sensitiveGap']), 'explanation': explanation}
        if request['evaluate'] and test:
            xt = np.array([[r['features'][f] for f in features] for r in test]); pt = model.predict(scaler.transform(xt))
            entry['test'] = metrics(test, pt, request['options']['sensitiveGap'])
            entry['predictions'] = [{'pairId': r['pairId'], 'predicted': float(p)} for r, p in zip(test, pt)]
            explanation['testFidelityMae'] = float(np.average(np.abs(tree.predict(xt)-pt), weights=weights(test)))
        result['models'][name] = entry
    return result
