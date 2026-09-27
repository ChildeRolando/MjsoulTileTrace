import argparse
import hashlib
import importlib
import importlib.util
import json
import os
import sys
from itertools import product

def fail(request_id, code):
    return {"protocolVersion": "riichi-local-mortal-jsonl/v1", "requestId": request_id,
            "status": "error", "code": code}


class CapturingEngine:
    def __init__(self, delegate):
        self.delegate = delegate
        self.name = delegate.name
        self.is_oracle = delegate.is_oracle
        self.version = delegate.version
        self.enable_quick_eval = False
        self.enable_rule_based_agari_guard = False
        self.last = None

    def react_batch(self, obs, masks, invisible_obs):
        result = self.delegate.react_batch(obs, masks, invisible_obs)
        self.last = result
        return result


def load_exact_source(name, source_path):
    # Import the checked file itself, bypassing sys.path and cached names.
    spec = importlib.util.spec_from_file_location(name, os.path.realpath(source_path))
    if spec is None or spec.loader is None:
        raise ValueError("source module identity mismatch")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        # Execute source bytes; an unverified .pyc must not replace the .py
        # whose digest was checked by the managed parent.
        with open(spec.origin, "rb") as handle:
            source = handle.read()
        exec(compile(source, spec.origin, "exec"), module.__dict__)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return module


def load_native(native_module):
    sys.path.insert(0, os.path.dirname(os.path.realpath(native_module)))
    cached_native = sys.modules.get("libriichi")
    native_spec = None if cached_native is not None else importlib.util.find_spec("libriichi")
    native_origin = getattr(cached_native, "__file__", None) if cached_native is not None else getattr(native_spec, "origin", None)
    if native_origin is None or os.path.normcase(os.path.realpath(native_origin)) != os.path.normcase(os.path.realpath(native_module)):
        raise ValueError("native module identity mismatch")
    libriichi = importlib.import_module("libriichi")
    loaded_native = getattr(libriichi, "__file__", None)
    if loaded_native is None or os.path.normcase(os.path.realpath(loaded_native)) != os.path.normcase(os.path.realpath(native_module)):
        raise ValueError("native module identity mismatch")
    return libriichi


def load_runtime(checkpoint, mortal_source, native_module):
    # Rule-only operation never imports Torch or touches the checkpoint.
    import torch
    load_native(native_module)
    sys.path.insert(0, mortal_source)
    model = load_exact_source("model", os.path.join(mortal_source, "model.py"))
    engine = load_exact_source("engine", os.path.join(mortal_source, "engine.py"))
    Brain, DQN, MortalEngine = model.Brain, model.DQN, engine.MortalEngine
    Bot = importlib.import_module("libriichi.mjai").Bot

    state = torch.load(checkpoint, weights_only=True, map_location=torch.device("cpu"))
    cfg = state["config"]
    version = cfg["control"].get("version", 1)
    if version != 4:
        raise ValueError("checkpoint identity mismatch")
    brain = Brain(version=version, conv_channels=cfg["resnet"]["conv_channels"],
                  num_blocks=cfg["resnet"]["num_blocks"]).eval()
    dqn = DQN(version=version).eval()
    brain.load_state_dict(state["mortal"])
    dqn.load_state_dict(state["current_dqn"])
    delegate = MortalEngine(brain, dqn, False, version, device=torch.device("cpu"),
                            stochastic_latent=False, enable_amp=False,
                            enable_quick_eval=False, enable_rule_based_agari_guard=False,
                            boltzmann_epsilon=0, boltzmann_temp=1, name="mortal-hpc")
    return CapturingEngine(delegate), Bot


RULE_PROTOCOL = "riichi-libriichi-rules-jsonl/v1"


def rule_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def rule_digest(value):
    return hashlib.sha256(rule_json(value).encode("utf-8")).hexdigest()


class NativeActionSelector:
    """Select an already legal index solely to use libriichi's action serializer.

    The zero vectors are the native callback ABI, never inference or evidence.
    No score or metadata from this callback leaves the rule operation.
    """
    name = "libriichi-action-conversion"
    is_oracle = False
    version = 4
    enable_quick_eval = False
    enable_rule_based_agari_guard = False

    def __init__(self, index, kan_tile):
        self.index = index
        self.kan_tile = kan_tile
        self.masks = None

    def react_batch(self, obs, masks, invisible_obs):
        self.masks = [[bool(value) for value in mask] for mask in masks]
        actions = []
        for i, mask in enumerate(self.masks):
            selected = self.index if i == len(masks)-1 else self.kan_tile
            if selected is None:
                selected = next(j for j, enabled in enumerate(mask) if enabled)
            if not mask[selected]:
                raise ValueError("native action selection mismatch")
            actions.append(selected)
        return actions, [[0.0]*46 for _ in masks], masks, [True]*len(masks)


def query_rules(request, native):
    request_id = request["requestId"]
    failure = {"protocolVersion": RULE_PROTOCOL, "requestId": request_id, "status": "error"}
    content = {key: value for key, value in request.items() if key != "requestId"}
    if (request.get("protocolVersion") != RULE_PROTOCOL or request.get("operation") != "legal_actions"
            or rule_digest(content) != request_id
            or rule_digest(request["events"]) != request["eventPrefixSha256"]
            or request["events"][-1]["eventRef"] != request["decision"]["triggerEventRef"]):
        return dict(failure, code="rules_protocol_invalid")
    rules = request["ruleSet"]
    if any(count not in (0, 1) for count in rules["redFives"].values()):
        return dict(failure, code="rules_input_incomplete")
    choices = lambda value: [False, True] if value == "unknown" else [value]
    results = [_query_rule_profile(request, native, open_tanyao, ippatsu)
               for open_tanyao, ippatsu in product(choices(rules["openTanyao"]), choices(rules["ippatsuCancelledByAnkan"]))]
    for result in results:
        if result["status"] == "error":
            return result
    # Unknown configuration is sufficient only when every permitted profile
    # produces the SAME full native result. Never take an action intersection.
    if any(result != results[0] for result in results[1:]):
        return dict(failure, code="rules_input_incomplete")
    return results[0]


def _query_rule_profile(request, native, open_tanyao, ippatsu):
    request_id = request["requestId"]
    failure = {"protocolVersion": RULE_PROTOCOL, "requestId": request_id, "status": "error"}
    PlayerState = importlib.import_module("libriichi.state").PlayerState
    Bot = importlib.import_module("libriichi.mjai").Bot
    actor = request["decision"]["selfActor"]
    state = PlayerState(actor)
    if not hasattr(state, "configure_rules"):
        return dict(failure, code="rules_config_unsupported")
    state.configure_rules(open_tanyao, ippatsu)
    for row in request["events"]:
        state.update(row["json"])
    phase = "accepted" if state.self_riichi_accepted else "declared" if state.self_riichi_declared else "none"
    if phase != request["decision"]["riichiPhase"]:
        return dict(failure, code="rules_input_incomplete")
    result = {"protocolVersion": RULE_PROTOCOL, "requestId": request_id, "identity": request["identity"]}
    if not state.last_cans.can_act:
        if request["decision"]["surface"] != "response":
            return dict(failure, code="rules_input_incomplete")
        result.update(status="non_action", reason="native_cannot_act")
    else:
        _, mask = state.encode_obs(4, False)
        indices = [i for i, enabled in enumerate(mask) if enabled]
        kan_tiles = []
        if state.last_cans.can_ankan or state.last_cans.can_kakan:
            _, kan_mask = state.encode_obs(4, True)
            kan_tiles = [i for i, enabled in enumerate(kan_mask) if enabled]
            if not kan_tiles or any(i > 33 for i in kan_tiles):
                return dict(failure, code="rules_runtime_failed")
        actions = []
        for index in indices:
            for kan_tile in (kan_tiles if index == 42 and kan_tiles else [None]):
                selector = NativeActionSelector(index, kan_tile)
                bot = Bot(selector, actor)
                bot.configure_rules(open_tanyao, ippatsu)
                reaction = None
                for i, row in enumerate(request["events"]):
                    reaction = bot.react(row["json"], can_act=i == len(request["events"])-1)
                if reaction is None or selector.masks is None or selector.masks[-1] != [bool(v) for v in mask]:
                    return dict(failure, code="rules_runtime_failed")
                action = json.loads(reaction)
                action.pop("meta", None)
                # MJAI omits the kind of abortive draw. Index 44 is explicitly
                # the native nine-terminals choice, not a generic round ending.
                if index == 44:
                    action.update(actor=actor, reason="kyuushu_kyuuhai")
                actions.append({"runtimeAction": {"index": index,
                    "variant": "kan:"+str(kan_tile) if index == 42 and len(kan_tiles)>1 else None},
                    "mjaiActionJson": rule_json(action)})
        if not actions:
            return dict(failure, code="rules_runtime_failed")
        result.update(status="ok", actions=actions)
    result["resultId"] = rule_digest(result)
    return result


def infer(request, engine, bot_type):
    engine.last = None
    bot = bot_type(engine, request["decision"]["selfActor"])
    reaction = None
    for row in request["events"]:
        reaction = bot.react(row["json"], can_act=row["canAct"])
    if reaction is None or engine.last is None:
        return fail(request["requestId"], "mortal_output_incomplete")
    actions, q_values, masks, _ = engine.last
    q = q_values[-1]
    mask = masks[-1]
    legal = [i for i, enabled in enumerate(mask) if enabled]
    expected = [(item["runtimeAction"]["index"], item["runtimeAction"]["variant"]) for item in request["candidates"]]
    kan_tiles = [i for i, enabled in enumerate(masks[-2]) if enabled] if 42 in legal and len(masks) == 2 else []
    multiple_kans = len(kan_tiles) > 1
    if any(tile > 33 for tile in kan_tiles):
        return fail(request["requestId"], "mortal_candidate_mismatch")
    keys = []
    for i in legal:
        keys.extend([(42, "kan:" + str(tile)) for tile in kan_tiles] if i == 42 and multiple_kans else [(i, None)])
    if len(set(expected)) != len(expected) or set(keys) != set(expected):
        return fail(request["requestId"], "mortal_candidate_mismatch")
    candidates = []
    for i, variant in keys:
        candidate = {"runtimeAction": {"index": i, "variant": variant}, "qValue": q[i]}
        if variant is not None:
            candidate["kanSelectionQValue"] = q_values[-2][int(variant[4:])]
        candidates.append(candidate)
    preferred = max(legal, key=lambda i: q[i])
    preferred_variant = "kan:" + str(max(kan_tiles, key=lambda i: q_values[-2][i])) if preferred == 42 and multiple_kans else None
    return {
        "protocolVersion": request["protocolVersion"], "requestId": request["requestId"],
        "identity": request["identity"], "decision": request["decision"], "status": "ok",
        "candidates": candidates,
        "preferredRuntimeAction": {"index": preferred, "variant": preferred_variant},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--mortal-source", required=True)
    parser.add_argument("--native-module", required=True)
    args = parser.parse_args()
    native = load_native(args.native_module)
    engine, bot_type = None, None
    print(json.dumps({"ready": True, "protocolVersion": "riichi-local-mortal-jsonl/v1"}, separators=(",", ":")), flush=True)
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            if request.get("operation") == "legal_actions":
                response = query_rules(request, native)
            else:
                if engine is None:
                    engine, bot_type = load_runtime(args.checkpoint, args.mortal_source, args.native_module)
                response = infer(request, engine, bot_type)
        except Exception:
            request_id = request.get("requestId", "invalid") if isinstance(request, dict) else "invalid"
            response = ({"protocolVersion": RULE_PROTOCOL, "requestId": request_id, "status": "error", "code": "rules_runtime_failed"}
                        if isinstance(request, dict) and request.get("operation") == "legal_actions"
                        else fail(request_id, "mortal_protocol_invalid"))
        print(json.dumps(response, separators=(",", ":"), allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
