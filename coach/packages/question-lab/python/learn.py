"""SVM boundary fitting. All splits/parameters/explanations are trained without holdout data."""
import hashlib
import itertools
import json
import math
import os
import sys
from collections import Counter
import numpy as np
import sklearn
import scipy
import joblib
import threadpoolctl
from sklearn.metrics import balanced_accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier, export_text

if (np.__version__, scipy.__version__, sklearn.__version__, joblib.__version__, threadpoolctl.__version__) != ("2.2.6", "1.15.3", "1.7.2", "1.5.2", "3.6.0"):
    raise RuntimeError("learning_dependency_identity_mismatch_run_setup")


def rows_for_task(samples, labels, ids):
    rows = []
    for sample in samples:
        label = labels.get(sample["sampleId"])
        if label is None:
            continue
        hypotheses = {h["id"]: h for h in sample["hypotheses"]}
        if any(not hypotheses[i]["applicable"] for i in ids):
            continue
        selected = [set(hypotheses[i]["actionRefs"]) for i in ids]
        if len(ids) == 2 and selected[0] == selected[1]:
            continue
        preferred = set(label["preferredActionRefs"])
        supported = [bool(preferred & refs) for refs in selected]
        if len(ids) == 1:
            target = "supported" if supported[0] else "not_supported"
        else:
            target = ("both" if all(supported) else "a" if supported[0] else "b" if supported[1] else "neither")
        rows.append((sample, target))
    return rows


def score_model(model, x, y):
    predicted = model.predict(x)
    classes = sorted(set(y) | set(predicted))
    return {"count": len(y), "balancedAccuracy": float(balanced_accuracy_score(y, predicted)),
            "macroF1": float(f1_score(y, predicted, average="macro", zero_division=0)),
            "classes": classes, "confusionMatrix": confusion_matrix(y, predicted, labels=classes).tolist()}


def distance(model, x):
    values = np.asarray(model.decision_function(x))
    return np.abs(values) if values.ndim == 1 else np.min(np.abs(values), axis=1)


def serialize_model(model):
    scale, svc = model.steps[0][1], model.steps[1][1]
    return {"mean": scale.mean_.tolist(), "scale": scale.scale_.tolist(), "classes": svc.classes_.tolist(),
            "supportVectors": svc.support_vectors_.tolist(), "dualCoefficients": svc.dual_coef_.tolist(),
            "intercepts": svc.intercept_.tolist(), "supportCounts": svc.n_support_.tolist(),
            "kernel": svc.kernel, "gamma": float(svc._gamma), "C": float(svc.C)}


def fit_task(rows, features, options, evaluate):
    train = [(s, y) for s, y in rows if s["split"] == "train"]
    test = [(s, y) for s, y in rows if s["split"] == "test"]
    counts = Counter(y for _, y in train)
    groups = [s["groupId"] for s, _ in train]
    base = {"trainCount": len(train), "testCount": len(test), "classCounts": dict(counts),
            "trainGroups": len(set(groups)), "featureNames": features}
    if len(counts) < 2 or min(counts.values(), default=0) < options["minClassSamples"] or len(set(groups)) < options["minGroups"]:
        return dict(base, status="insufficient_evidence")
    if min(counts.values()) < 3:
        return dict(base, status="insufficient_evidence", reason="grouped_cv_requires_three_per_class")
    x = np.asarray([[s["features"][f] for f in features] for s, _ in train], dtype=np.float64)
    y = np.asarray([y for _, y in train])
    folds = list(StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=19).split(x, y, groups))
    if any(set(y[a]) != set(y) or not len(b) for a, b in folds):
        return dict(base, status="insufficient_evidence", reason="grouped_folds_missing_class")
    candidates = []
    for kernel in ("linear", "rbf"):
        for c in (0.1, 1.0, 10.0):
            scores = []
            for a, b in folds:
                model = make_pipeline(StandardScaler(), SVC(kernel=kernel, C=c, gamma="scale", class_weight="balanced", decision_function_shape="ovo", cache_size=128))
                model.fit(x[a], y[a])
                scores.append(float(balanced_accuracy_score(y[b], model.predict(x[b]))))
            candidates.append({"kernel": kernel, "C": c, "score": float(np.mean(scores))})
    best = max(candidates, key=lambda p: p["score"])
    linear = max((p for p in candidates if p["kernel"] == "linear"), key=lambda p: p["score"])
    if linear["score"] >= best["score"] - 0.01:
        best = linear
    model = make_pipeline(StandardScaler(), SVC(kernel=best["kernel"], C=best["C"], gamma="scale", class_weight="balanced", decision_function_shape="ovo", cache_size=128))
    model.fit(x, y)
    # Explanation uses only training predictions. Test labels cannot choose or fit it.
    tree = DecisionTreeClassifier(max_depth=3, min_samples_leaf=max(3, len(train) // 50), random_state=19)
    tree.fit(x, model.predict(x))
    fidelity = float(np.mean(tree.predict(x) == model.predict(x)))
    near = distance(model, x)
    predicted = model.predict(x)
    order = np.argsort(near)
    representative = [train[int(i)][0]["sampleId"] for i in order[:12]]
    scaled = model.steps[0][1].transform(x)
    pairs = []
    for i in order[:12]:
        if predicted[i] != y[i]:
            continue
        others = [j for j in range(len(train)) if y[j] != y[i] and groups[j] != groups[i] and predicted[j] != predicted[i] and predicted[j] == y[j]]
        if not others:
            continue
        j = min(others, key=lambda j: float(np.linalg.norm(scaled[i] - scaled[j])))
        pairs.append({"a": train[int(i)][0]["sampleId"], "b": train[j][0]["sampleId"], "distance": float(np.linalg.norm(scaled[i] - scaled[j]))})
    result = dict(base, status="fitted", selected=best, crossValidation=candidates, model=serialize_model(model),
                  explanation={"kind": "linear_weights" if best["kernel"] == "linear" else "tree_surrogate", "tree": export_text(tree, feature_names=features),
                               "trainingFidelity": fidelity, "maxDepth": 3, "representatives": representative, "boundaryPairs": pairs,
                               "interpretation": "observable_model_preference_not_causal_or_internal_reason"},
                  marginReference=float(np.quantile(near, 0.25)))
    if best["kernel"] == "linear":
        result["explanation"]["standardizedWeights"] = model.steps[1][1].coef_.tolist()
        result["explanation"]["classOrder"] = model.steps[1][1].classes_.tolist()
    if evaluate:
        if test:
            xt = np.asarray([[s["features"][f] for f in features] for s, _ in test])
            yt = [y for _, y in test]
            result["holdout"] = score_model(model, xt, yt)
            result["explanation"]["holdoutFidelity"] = float(np.mean(tree.predict(xt) == model.predict(xt)))
            result["counterexamples"] = [s["sampleId"] for (s, actual), predicted in zip(test, model.predict(xt)) if actual != predicted][:20]
        else:
            result["holdout"] = {"status": "insufficient_evidence", "count": 0}
    return result


def evaluate_serialized(model, x):
    """Exact libsvm OVO decisions for bounded search ranking, never probability."""
    x = (np.asarray(x, dtype=float) - model["mean"]) / model["scale"]
    sv = np.asarray(model["supportVectors"])
    if model["kernel"] == "linear":
        kernels = x @ sv.T
    else:
        kernels = np.exp(-model["gamma"] * np.sum((x[:, None, :] - sv[None, :, :]) ** 2, axis=2))
    coefficients = np.asarray(model["dualCoefficients"])
    starts = np.r_[0, np.cumsum(model["supportCounts"])]
    decisions = []
    k = 0
    for i in range(len(starts) - 1):
        for j in range(i + 1, len(starts) - 1):
            value = kernels[:, starts[i]:starts[i+1]] @ coefficients[j-1, starts[i]:starts[i+1]]
            value += kernels[:, starts[j]:starts[j+1]] @ coefficients[i, starts[j]:starts[j+1]]
            decisions.append(value + model["intercepts"][k])
            k += 1
    return np.min(np.abs(np.asarray(decisions).T), axis=1)


def fit(request):
    samples = request["samples"]
    labels = {r["sampleId"]: r for r in request["labels"]}
    ids = [h["id"] for h in request["hypotheses"]]
    tasks = {}
    for task in [(i,) for i in ids] + list(itertools.combinations(ids, 2)):
        fitted = fit_task(rows_for_task(samples, labels, task), request["options"]["features"], request["options"], request["evaluate"])
        if fitted["status"] == "fitted":
            fitted["explanation"]["focusFeatures"] = sorted({f for h in request["hypotheses"] if h["id"] in task for f in h.get("explain", [])})
        tasks["+".join(task)] = fitted
    combinations = Counter("+".join(h["id"] for h in s["hypotheses"] if h["applicable"] and set(h["actionRefs"]) & set(labels[s["sampleId"]]["preferredActionRefs"])) for s in samples if s["sampleId"] in labels and (request["evaluate"] or s["split"] == "train"))
    return {"schemaVersion": "question-lab-boundaries/v1", "status": "fitted" if any(t["status"] == "fitted" for t in tasks.values()) else "insufficient_evidence",
            "producer": {"python": sys.version.split()[0], "numpy": np.__version__, "scikitLearn": sklearn.__version__},
            "evaluated": request["evaluate"], "tasks": tasks, "supportedCombinations": dict(combinations)}


def main():
    request = json.load(sys.stdin)
    if request["operation"] == "fit":
        result = fit(request)
    elif request["operation"] == "rank":
        scores = []
        for sample in request["samples"]:
            values = []
            for task in request["boundaries"]["tasks"].values():
                if task["status"] == "fitted":
                    margin = float(evaluate_serialized(task["model"], [[sample["features"][f] for f in task["featureNames"]]])[0])
                    values.append(margin / max(task["marginReference"], 1e-6))
            scores.append({"sampleId": sample["sampleId"], "marginRatio": min(values) if values else None})
        result = {"scores": scores}
    else:
        raise ValueError("unsupported learning operation")
    json.dump(result, sys.stdout, ensure_ascii=False, allow_nan=False)


if __name__ == "__main__":
    main()
