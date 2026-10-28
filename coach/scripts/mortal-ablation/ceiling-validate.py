"""Independent, local-only closeout checks. Never calls a model or changes an attempt."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def digest(value):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def wait_process(pid):
    if os.name == "nt":
        # os.kill(pid, 0) is unsafe on Windows. Wait on the original process handle.
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.WaitForSingleObject.restype = wintypes.DWORD
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x00100000, False, pid)
        if handle:
            try:
                while kernel.WaitForSingleObject(handle, 30000) == 258:
                    pass
            finally:
                kernel.CloseHandle(handle)
    else:
        while True:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(30)


def interval(differences):
    if len(differences) < 2:
        return None, None
    state = 0x521728
    samples = []
    for _ in range(2000):
        total = 0
        for _ in differences:
            state = (state ^ (state << 13)) & 0xFFFFFFFF
            state = (state ^ (state >> 17)) & 0xFFFFFFFF
            state = (state ^ (state << 5)) & 0xFFFFFFFF
            total += differences[(state * len(differences)) // 2**32]
        samples.append(total / len(differences))
    samples.sort()
    return samples[50], samples[1950]


def paired(values, treatment, control):
    differences = [v[treatment] - v[control] for v in values]
    wins = sum(x > 0 for x in differences)
    losses = sum(x < 0 for x in differences)
    n = wins + losses
    p = min(1.0, 2 * sum(math.comb(n, k) for k in range(min(wins, losses) + 1)) / 2**n)
    low, high = interval(differences)
    return {"estimate": sum(differences) / len(differences), "low": low,
            "high": high, "wins": wins, "losses": losses, "p": p}


def holm(ps):
    result = [0] * len(ps)
    previous = 0
    for rank, i in enumerate(sorted(range(len(ps)), key=lambda j: ps[j])):
        previous = max(previous, min(1, ps[i] * (len(ps) - rank)))
        result[i] = previous
    return result


def close(a, b):
    return a is None and b is None or a is not None and b is not None and abs(a - b) < 1e-10


def permissions(observation, body):
    state = observation["visibleState"]
    own = state["self"]
    initial = [own.get("currentDraw", {}).get("sourceRef")] if own.get("currentDraw") else []
    for river in state["rivers"]:
        for discard in river:
            initial.extend(discard.get(k) for k in ("sourceRef", "riichiDeclarationRef", "calledByRef"))
    for meld in state["melds"]:
        initial.extend(meld.get(k) for k in ("createdEventRef", "latestEventRef", "calledDiscardEventRef", "upgradedPonEventRef"))
    for riichi in state["riichiStates"]:
        initial.extend(riichi.get(k) for k in ("declarationEventRef", "acceptanceEventRef"))
    initial = set(x for x in initial if x is not None)
    evidence = initial | set(own["evidenceRefs"]) | set(own["meldRefs"])
    evidence.update(m["meldRef"] for m in state["melds"])
    for component in own["furiten"].values():
        evidence.update(component["evidenceIds"])
    evidence.update(body["citationPermissions"]["evidenceRefs"])
    return evidence, initial | set(body["citationPermissions"]["sourceRefs"])


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def grade(out, case, key, label):
    call_path = out / "calls" / (key + ".json")
    if not call_path.exists():
        return {"match": 0, "choice": None, "valid": False}
    call = read(call_path)
    response = call["response"]
    if response["status"] != "ready" or response["call"]["name"] != "submit_decision":
        return {"match": 0, "choice": None, "valid": False}
    try:
        submission = json.loads(response["call"]["arguments"])
    except (ValueError, TypeError):
        return {"match": 0, "choice": None, "valid": False}
    if not isinstance(submission, dict):
        return {"match": 0, "choice": None, "valid": False}
    obs = case["observation"]
    body = json.loads(read(out / "requests" / (key + ".json"))["request"]["messages"][1]["content"])
    evidence, sources = permissions(obs, body)
    offered = {c["actionRef"] for c in obs["candidates"]}
    valid = (set(submission) == {"caseRef", "actionRef", "rationale", "evidenceRefs", "sourceRefs", "mainAlternative", "uncertainty"}
             and submission["caseRef"] == obs["caseRef"]
             and isinstance(submission["actionRef"], str) and submission["actionRef"] in offered)
    for field, limit, required in (("rationale", 2000, True), ("uncertainty", 1000, False)):
        value = submission.get(field)
        valid = valid and isinstance(value, str) and utf16_length(value.strip()) <= limit and (not required or bool(value.strip()))
    for field, allowed in (("evidenceRefs", evidence), ("sourceRefs", sources)):
        refs = submission.get(field)
        valid = valid and isinstance(refs, list) and len(refs) <= 64 and all(isinstance(x, str) for x in refs)
        if valid:
            valid = len(set(refs)) == len(refs) and set(refs) <= allowed
    alternative = submission.get("mainAlternative")
    if alternative is not None:
        valid = valid and isinstance(alternative, dict) and set(alternative) == {"actionRef", "reasonNotChosen"}
        if valid:
            valid = (isinstance(alternative["actionRef"], str) and alternative["actionRef"] in offered and alternative["actionRef"] != submission["actionRef"]
                     and isinstance(alternative["reasonNotChosen"], str) and bool(alternative["reasonNotChosen"].strip())
                     and utf16_length(alternative["reasonNotChosen"].strip()) <= 500)
    if not valid:
        return {"match": 0, "choice": None, "valid": False}
    groups = {}
    for i, candidate in enumerate(case["binding"]["candidates"]):
        for realization in candidate["physicalRealizations"]:
            groups[realization["actionRef"]] = i
    preferred = label["reference"]["label"]["actionRef"]
    assert label["reference"]["label"]["caseRef"] == obs["caseRef"] and preferred in groups
    choice = groups[submission["actionRef"]]
    return {"match": int(choice == groups[preferred]), "choice": choice, "valid": True}


def validate(out):
    metrics = read(out / "metrics.json")
    assert metrics["complete"] is True
    dataset = read(out / "dataset.json")
    freeze = read(out / "freeze.json")
    assert len(dataset["cases"]) == 980
    cases = [c for c in dataset["cases"] if c["split"] == "evaluation"]
    assert len(cases) == 800 and len({c["gameId"] for c in dataset["cases"]}) == 980
    labels = {c["id"]: read(out / "private-labels" / (c["id"] + ".json")) for c in cases}
    arms = ("A", "B", "C", "D", "V0")
    grades = {}
    for c in cases:
        grades[c["id"]] = {a: grade(out, c, "evaluation-" + c["id"] + "-" + a, labels[c["id"]]) for a in arms}
    comparisons = {}
    for stratum, name, n in (("random", "natural", 600), ("challenge", "challenge", 200)):
        selected = [c for c in cases if c["stratum"] == stratum]
        assert len(selected) == n
        for a in arms:
            matches = sum(grades[c["id"]][a]["match"] for c in selected)
            recorded = metrics[name]["arms"][a]
            assert recorded["planned"] == n and recorded["matches"] == matches
            assert close(recorded["rate"], matches / n)
        values = [{a: grades[c["id"]][a]["match"] for a in arms} for c in selected]
        contrasts = [paired(values, "D", a) for a in ("A", "V0", "B", "C")]
        adjusted = holm([c["p"] for c in contrasts[1:]])
        for i, (computed, recorded) in enumerate(zip(contrasts, metrics[name]["comparisons"])):
            for field in ("estimate", "low", "high", "p"):
                assert close(computed[field], recorded[field]), (name, i, field)
            if i:
                assert close(adjusted[i - 1], recorded["adjustedP"])
        comparisons[name] = contrasts
    previous, claims, settled = None, {}, set()
    buckets = {k: 0 for k in freeze["budgets"]}
    for seq, line in enumerate((out / "calls.jsonl").read_text(encoding="utf-8").splitlines()):
        row = json.loads(line)
        body = {k: v for k, v in row.items() if k != "digest"}
        assert row["seq"] == seq and row["previous"] == previous and row["digest"] == digest(body)
        previous = row["digest"]
        key = row["key"]
        if row["type"] == "claim":
            assert key not in claims
            claims[key] = row
            buckets[row["bucket"]] += 1
            request = read(out / "requests" / (key + ".json"))
            assert digest({"request": request["request"], "model": request["model"]}) == row["requestDigest"]
            expected_model = freeze["models"]["practical" if row["bucket"] == "practical" else "strong"]
            assert request["model"] == expected_model
        else:
            assert row["type"] == "settle" and key in claims and key not in settled
            settled.add(key)
            call = read(out / "calls" / (key + ".json"))
            assert call["requestDigest"] == claims[key]["requestDigest"]
            if "callDigest" in row["result"]:
                assert digest(call) == row["result"]["callDigest"]
    assert len(claims) <= sum(freeze["budgets"].values()) and len(settled) == len(claims)
    assert all(buckets[k] <= freeze["budgets"][k] for k in buckets)
    stability = {}
    for arm in ("A", "D"):
        selected = [c for c in cases if c["id"] in dataset["stability"]]
        assert len(selected) == 50
        pairs = [(grades[c["id"]][arm], grade(out, c, "stability-" + c["id"] + "-" + arm, labels[c["id"]])) for c in selected]
        both_valid = [(a, b) for a, b in pairs if a["valid"] and b["valid"]]
        same = sum(a["choice"] == b["choice"] for a, b in both_valid)
        stability[arm] = {"plannedPairs": 50, "bothValid": len(both_valid), "sameChoice": same,
                          "sameChoiceAllAttempts": same / 50,
                          "sameChoiceConditional": same / len(both_valid) if both_valid else None,
                          "repeatMinusFirstAgreement": sum(b["match"] - a["match"] for a, b in pairs) / 50}
    review = out / "review"
    assert (review / "index.html").is_file() and (review / "knowledge.html").is_file()
    pages = [review / ("case-" + c["id"] + ".html") for c in cases]
    assert all(p.is_file() for p in pages)
    for page in [review / "index.html", review / "knowledge.html", *pages]:
        for url in re.findall(r'(?:src|href)="([^"]+)"', page.read_text(encoding="utf-8")):
            if not url or url.startswith(("#", "https:", "http:", "data:")):
                continue
            assert (page.parent / url.split("#")[0]).exists(), (page.name, url)
    return {"status": "computed_checks_passed", "formalCases": 800, "formalScores": 4000,
            "claims": len(claims), "buckets": buckets, "comparisons": comparisons,
            "stability": stability, "casePages": len(pages), "visualInspectionPerformed": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("out", nargs="?", default="E:/AgentData/Coach/scene-pattern-ceiling-20261028")
    parser.add_argument("--wait-pid", type=int)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        r = paired([{"D": 1, "A": 0}, {"D": 1, "A": 0}, {"D": 0, "A": 0}, {"D": 0, "A": 1}], "D", "A")
        assert r["estimate"] == .25 and r["low"] == -.5 and r["high"] == 1 and r["p"] == 1
        assert holm([.01, .04, .03]) == [.03, .06, .06]
        print("independent paired-statistics self-test passed")
        return
    out = Path(args.out).resolve()
    if args.wait_pid:
        wait_process(args.wait_pid)
    try:
        assert (out / "archive-manifest.json").exists(), "Pipeline has not produced a final archive"
        result = validate(out)
        text = "# 独立统计复算与文件检查\n\n已通过：4000次正式评分、自然/挑战分层、配对区间、精确检验、Holm校正、调用账本与上限、800个逐题页面链接。\n\n稳定性复验见 validation.json；未挑选重复答案中的最优者。页面像素布局未在此脚本中做人工视觉验收。\n"
    except Exception as error:
        message = type(error).__name__ + ": " + str(error)
        result = {"status": "not_complete_or_validation_failed", "error": message}
        text = "# 收口检查尚未通过\n\n" + message + "\n\n请核对当前运行日志和原始档案；此状态不构成有效性结论。\n"
    (out / "validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "FINAL-VALIDATION.md").write_text(text, encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] != "computed_checks_passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
