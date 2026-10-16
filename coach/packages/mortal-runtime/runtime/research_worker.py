"""Rule-only research construction. No torch, model weights, or model labels."""
import argparse
import hashlib
import json
import os
import random
import sys
# Execute the verified source, never an ambient/stale pyc.
import types
_runtime_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "local_mortal_runtime.py")
_runtime = types.ModuleType("lab_verified_runtime")
with open(_runtime_path, "rb") as _source:
    exec(compile(_source.read(), _runtime_path, "exec"), _runtime.__dict__)
load_native, NativeActionSelector = _runtime.load_native, _runtime.NativeActionSelector
rule_json, rule_digest = _runtime.rule_json, _runtime.rule_digest

PROTOCOL = "riichi-lab-construct/v1"


def visible(events, actor):
    rows = []
    for source in events:
        row = dict(source)
        if row["type"] == "start_kyoku":
            row["tehais"] = [hand if i == actor else ["?"] * 13 for i, hand in enumerate(row["tehais"])]
        if row["type"] == "tsumo" and row["actor"] != actor:
            row["pai"] = "?"
        rows.append(row)
    return rows


def construct(request, native):
    error = {"protocolVersion": PROTOCOL, "requestId": request.get("requestId", "0" * 64), "status": "error"}
    if set(request) != {"protocolVersion", "requestId", "identity", "spec", "selfActor", "turn", "maxSteps", "script", "seed"}:
        return dict(error, code="construction_invalid")
    content = {k: v for k, v in request.items() if k != "requestId"}
    with open(__file__, "rb") as handle:
        worker_hash = hashlib.sha256(handle.read()).hexdigest()
    with open(native.__file__, "rb") as handle:
        native_hash = hashlib.sha256(handle.read()).hexdigest()
    with open(_runtime_path, "rb") as handle:
        runtime_hash = hashlib.sha256(handle.read()).hexdigest()
    if (request["protocolVersion"] != PROTOCOL or rule_digest(content) != request["requestId"]
            or request["identity"]["workerSha256"] != worker_hash
            or request["identity"]["native"]["wrapperSha256"] != runtime_hash
            or request["identity"]["native"]["nativeArtifactSha256"] != native_hash):
        return dict(error, code="construction_invalid")
    from libriichi.arena import ResearchBoard
    from libriichi.state import PlayerState
    from libriichi.mjai import Bot
    try:
        board = ResearchBoard(rule_json(request["spec"]))
    except (ValueError, TypeError):
        return dict(error, code="construction_invalid")
    rng = random.Random(request["seed"])
    applied = set()
    state = json.loads(board.snapshot())
    for _ in range(request["maxSteps"]):
        events = state["events"]
        if state["ended"]:
            return dict(error, code="history_unreachable")
        last = events[-1]
        draws = sum(e["type"] == "tsumo" and e["actor"] == request["selfActor"] for e in events)
        scripts = []
        for i, step in enumerate(request["script"]):
            when = step["after"]
            matches = lambda e: e["type"] == when["type"] and ("actor" not in when or e.get("actor") == when["actor"])
            if i not in applied and matches(last) and sum(matches(e) for e in events) == when["occurrence"]:
                scripts.append((i, step["action"]))
        if (last["type"] == "tsumo" and last["actor"] == request["selfActor"] and draws == request["turn"] and not scripts):
            if len(applied) != len(request["script"]):
                return dict(error, code="history_unreachable")
            return {"protocolVersion": PROTOCOL, "requestId": request["requestId"], "identity": request["identity"],
                    "status": "ok", "events": events, "scriptApplied": sorted(applied)}
        if draws > request["turn"]:
            return dict(error, code="history_unreachable")
        actions = [{"type": "none"} for _ in range(4)]
        proposed = []
        for actor, active in enumerate(state["active"]):
            if not active:
                continue
            instructions = [(i, action) for i, action in scripts if action["actor"] == actor]
            if len(instructions) > 1:
                return dict(error, code="construction_invalid")
            if instructions:
                i, action = instructions[0]
                actions[actor] = action
                proposed.append((i, action))
                continue
            rows = visible(events, actor)
            player = PlayerState(actor)
            player.configure_rules(True, True)
            for row in rows:
                player.update(rule_json(row))
            _, mask = player.encode_obs(4, False)
            if bool(mask[45]):
                continue
            options = [i for i in range(37) if bool(mask[i])]
            if not options:
                # A window with no discard/pass cannot be silently skipped.
                return dict(error, code="history_unreachable")
            drawn = player.last_self_tsumo()
            tile_index = None
            if drawn:
                if drawn in ("5mr", "5pr", "5sr"):
                    tile_index = 34 + ["5mr", "5pr", "5sr"].index(drawn)
                elif drawn in ("E", "S", "W", "N", "P", "F", "C"):
                    tile_index = 27 + ["E", "S", "W", "N", "P", "F", "C"].index(drawn)
                else:
                    tile_index = "mps".index(drawn[1]) * 9 + int(drawn[0]) - 1
            index = tile_index if tile_index in options else rng.choice(options)
            selector = NativeActionSelector(index, None)
            bot = Bot(selector, actor)
            bot.configure_rules(True, True)
            reaction = None
            for n, row in enumerate(rows):
                reaction = bot.react(rule_json(row), can_act=n == len(rows) - 1)
            if reaction is None:
                return dict(error, code="history_unreachable")
            action = json.loads(reaction)
            action.pop("meta", None)
            actions[actor] = action
        if any(not state["active"][action["actor"]] for _, action in scripts):
            return dict(error, code="history_unreachable")
        try:
            next_state = json.loads(board.step(rule_json(actions)))
            delta = next_state["events"][len(events):]
            for i, action in proposed:
                def corresponds(event):
                    for key, value in action.items():
                        if key == "consumed":
                            if sorted(event.get(key, [])) != sorted(value):
                                return False
                        elif event.get(key) != value:
                            return False
                    return True
                if action["type"] != "none" and not any(corresponds(event) for event in delta):
                    return dict(error, code="history_unreachable")
                applied.add(i)
            state = next_state
        except (ValueError, RuntimeError):
            return dict(error, code="history_unreachable")
    return dict(error, code="search_exhausted")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--native-module", required=True)
    args = parser.parse_args()
    native = load_native(args.native_module)
    for line in sys.stdin:
        request = {}
        try:
            if len(line) > 1048576:
                raise ValueError("oversized")
            request = json.loads(line)
            result = construct(request, native)
        except Exception:
            result = {"protocolVersion": PROTOCOL, "requestId": request.get("requestId", "0" * 64),
                      "status": "error", "code": "construction_runtime_failed"}
        print(rule_json(result), flush=True)


if __name__ == "__main__":
    main()
