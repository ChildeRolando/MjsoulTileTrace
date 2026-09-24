import argparse
import json
import os
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument("--checkpoint")
parser.add_argument("--mortal-source")
parser.parse_args()
mode = os.environ.get("MORTAL_FAKE_MODE", "success")
if mode == "bad_ready":
    print("not-json", flush=True)
    sys.exit(0)
print(json.dumps({"ready": True, "protocolVersion": "riichi-local-mortal-jsonl/v1"}, separators=(",", ":")), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if mode == "crash":
        sys.exit(7)
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
