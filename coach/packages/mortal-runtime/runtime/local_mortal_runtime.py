import argparse
import importlib
import json
import os
import sys

import torch


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


def load_runtime(checkpoint, mortal_source, native_module):
    sys.path.insert(0, mortal_source)
    sys.path.insert(0, os.path.dirname(os.path.realpath(native_module)))
    from model import Brain, DQN
    from engine import MortalEngine
    libriichi = importlib.import_module("libriichi")
    loaded_native = getattr(libriichi, "__file__", None)
    if loaded_native is None or os.path.normcase(os.path.realpath(loaded_native)) != os.path.normcase(os.path.realpath(native_module)):
        raise ValueError("native module identity mismatch")
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


def infer(request, engine, bot_type):
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
    expected = sorted(item["runtimeAction"]["index"] for item in request["candidates"])
    if len(set(expected)) != len(expected) or legal != expected:
        return fail(request["requestId"], "mortal_candidate_mismatch")
    candidates = [{"runtimeAction": {"index": i, "variant": None}, "qValue": q[i]} for i in legal]
    preferred = max(legal, key=lambda i: q[i])
    return {
        "protocolVersion": request["protocolVersion"], "requestId": request["requestId"],
        "identity": request["identity"], "decision": request["decision"], "status": "ok",
        "candidates": candidates,
        "preferredRuntimeAction": {"index": preferred, "variant": None},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--mortal-source", required=True)
    parser.add_argument("--native-module", required=True)
    args = parser.parse_args()
    engine, bot_type = load_runtime(args.checkpoint, args.mortal_source, args.native_module)
    print(json.dumps({"ready": True, "protocolVersion": "riichi-local-mortal-jsonl/v1"}, separators=(",", ":")), flush=True)
    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            response = infer(request, engine, bot_type)
        except Exception:
            request_id = request.get("requestId", "invalid") if isinstance(request, dict) else "invalid"
            response = fail(request_id, "mortal_protocol_invalid")
        print(json.dumps(response, separators=(",", ":"), allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
