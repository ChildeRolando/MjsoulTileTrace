"""Protocol projection tests; no weights, torch execution, or native inference."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

sys.dont_write_bytecode = True
sys.modules["torch"] = types.ModuleType("torch")
spec = importlib.util.spec_from_file_location("runner", Path(__file__).parents[1] / "runtime/local_mortal_runtime.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class KanSelectionTest(unittest.TestCase):
    def infer(self, keys, main_best=42, stale=False):
        main_q, kan_q = [0.] * 46, [0.] * 46
        main_q[main_best], kan_q[1] = 9., 7.
        main_mask, kan_mask = [False] * 46, [False] * 46
        for i in [0, 42]:
            main_mask[i] = True
        for i in [0, 1]:
            kan_mask[i] = True
        engine = types.SimpleNamespace(last=([], [kan_q, main_q], [kan_mask, main_mask], []))

        class Bot:
            def __init__(self, engine, actor):
                self.engine = engine

            def react(self, row, can_act):
                if not stale:
                    self.engine.last = ([], [kan_q, main_q], [kan_mask, main_mask], [])
                return "{}"

        request = {"requestId": "test", "protocolVersion": "riichi-local-mortal-jsonl/v1",
                   "decision": {"selfActor": 0}, "identity": {}, "events": [{"json": "{}", "canAct": True}],
                   "candidates": [{"runtimeAction": {"index": i, "variant": v}} for i, v in keys]}
        return runner.infer(request, engine, Bot)

    def test_two_stages_keep_raw_values_and_native_preference(self):
        response = self.infer([(0, None), (42, "kan:0"), (42, "kan:1")])
        self.assertEqual(response["status"], "ok")
        self.assertEqual(response["preferredRuntimeAction"], {"index": 42, "variant": "kan:1"})
        self.assertEqual([(r["qValue"], r.get("kanSelectionQValue")) for r in response["candidates"]],
                         [(0., None), (9., 0.), (9., 7.)])

    def test_main_stage_can_prefer_discard(self):
        response = self.infer([(42, "kan:1"), (0, None), (42, "kan:0")], main_best=0)
        self.assertEqual(response["preferredRuntimeAction"], {"index": 0, "variant": None})

    def test_bad_candidate_sets_fail_without_intersection(self):
        for keys in [[(0,None),(42,None)], [(0,None),(42,"kan:0")],
                     [(0,None),(42,"kan:0"),(42,"kan:2")],
                     [(0,None),(42,"kan:0"),(42,"kan:1"),(42,"kan:1")]]:
            with self.subTest(keys=keys):
                self.assertEqual(self.infer(keys)["code"], "mortal_candidate_mismatch")

    def test_stale_batch_is_never_reused(self):
        self.assertEqual(self.infer([(0,None),(42,"kan:0"),(42,"kan:1")], stale=True)["code"],
                         "mortal_output_incomplete")


if __name__ == "__main__":
    unittest.main()
