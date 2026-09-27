import argparse
import hashlib
import json
import os
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--checkpoint")
parser.add_argument("--mortal-source")
parser.add_argument("--native-module", required=True)
args = parser.parse_args()
mode = os.environ.get("MORTAL_FAKE_MODE", "success")
expected_native = os.environ.get("MORTAL_FAKE_EXPECT_NATIVE")
if expected_native and os.path.realpath(args.native_module) != os.path.realpath(expected_native):
    sys.exit(9)
start_count_file = os.environ.get("MORTAL_FAKE_START_COUNT_FILE")
if start_count_file:
    with open(start_count_file, "a", encoding="utf-8") as handle:
        handle.write("start\n")
if mode == "slow_start":
    time.sleep(10)
if mode == "exit_before_ready":
    sys.exit(8)
if mode == "bad_ready":
    print("not-json", flush=True)
    sys.exit(0)
print(json.dumps({"ready": True, "protocolVersion": "riichi-local-mortal-jsonl/v1"}, separators=(",", ":")), flush=True)
if mode == "idle_protocol_failure":
    with open(os.environ["MORTAL_FAKE_PID_FILE"], "w", encoding="utf-8") as handle:
        handle.write(str(os.getpid()))
    while not os.path.exists(os.environ["MORTAL_FAKE_RELEASE_FILE"]):
        time.sleep(0.01)
    print("unsolicited-one\nunsolicited-two", flush=True)
    time.sleep(10)
if mode == "closed_stdin":
    os.close(0)
    time.sleep(10)
    sys.exit(0)
for line in sys.stdin:
    request = json.loads(line)
    if request.get("operation") == "legal_actions":
        response = {"protocolVersion": request["protocolVersion"], "requestId": request["requestId"],
            "identity": request["identity"], "status": "ok", "actions": [
                {"runtimeAction": {"index": 0, "variant": None}, "mjaiActionJson": '{"type":"dahai","actor":0,"pai":"1m","tsumogiri":true}'}]}
        if mode == "rule_wrong_request": response["requestId"] = "f"*64
        if mode == "rule_wrong_identity": response["identity"]["revision"] = "f"*40
        if mode == "rule_duplicate": response["actions"] *= 2
        if mode == "rule_extra_score": response["actions"][0]["qValue"] = 1
        if mode == "rule_non_action":
            response.pop("actions")
            response.update(status="non_action", reason="native_cannot_act")
        response["resultId"] = hashlib.sha256(json.dumps(response, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        if mode == "rule_wrong_hash": response["resultId"] = "f"*64
        print(json.dumps(response, separators=(",", ":")), flush=True)
        continue
    if mode == "crash":
        os._exit(7)
    if mode == "timeout":
        time.sleep(10)
        continue
    if mode in ("actual_mismatch", "output_incomplete", "runtime_unavailable"):
        code = {
            "actual_mismatch": "mortal_actual_action_mismatch",
            "output_incomplete": "mortal_output_incomplete",
            "runtime_unavailable": "mortal_runtime_unavailable",
        }[mode]
        print(json.dumps({"protocolVersion": request["protocolVersion"], "requestId": request["requestId"], "status": "error", "code": code}, separators=(",", ":")), flush=True)
        continue
    candidates = [
        {"runtimeAction": row["runtimeAction"], "qValue": float(index + 1)}
        for index, row in enumerate(request["candidates"])
    ]
    if mode == "duplicate":
        candidates[-1] = candidates[0]
    if mode == "missing":
        candidates.pop()
    response = {
        "protocolVersion": request["protocolVersion"],
        "requestId": request["requestId"],
        "identity": request["identity"],
        "decision": request["decision"],
        "status": "ok",
        "candidates": candidates,
        "preferredRuntimeAction": candidates[-1]["runtimeAction"],
    }
    if mode == "extra_field":
        response["debug"] = "forbidden"
    if mode == "unknown_preferred":
        response["preferredRuntimeAction"] = {"index": 45, "variant": None}
    if mode == "extra_prose":
        print("forbidden prose", flush=True)
    if mode == "oversize":
        print("x" * 1048577, flush=True)
    print(json.dumps(response, separators=(",", ":")), flush=True)
    if mode == "trailing_prose":
        print("TRAILING_UNSOLICITED_PROSE", flush=True)
    if mode == "extra_response":
        print(json.dumps(response, separators=(",", ":")), flush=True)
    if mode == "unterminated_oversize":
        sys.stdout.write("x" * 1048577)
        sys.stdout.flush()
