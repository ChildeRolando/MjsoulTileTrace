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


class ExactSourceLoadingTest(unittest.TestCase):
    def test_unverified_bytecode_cannot_replace_checked_source(self):
        import tempfile
        import py_compile
        import os
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"model.py"
            source.write_text('ORIGIN="shadow  "\n')
            stamp=source.stat().st_mtime
            py_compile.compile(str(source),doraise=True)
            source.write_text('ORIGIN="verified"\n')
            os.utime(source,(stamp,stamp))
            saved=sys.modules.get("model")
            try:
                self.assertEqual(runner.load_exact_source("model",str(source)).ORIGIN,"verified")
            finally:
                if saved is None: sys.modules.pop("model",None)
                else: sys.modules["model"]=saved

    def test_native_directory_and_module_cache_cannot_shadow_verified_sources(self):
        import tempfile
        for cached in (False, True):
            with self.subTest(cached=cached), tempfile.TemporaryDirectory() as folder:
                source, native = Path(folder) / "source", Path(folder) / "native"
                source.mkdir(); native.mkdir()
                for directory, origin in ((source, "verified"), (native, "shadow")):
                    (directory / "model.py").write_text('ORIGIN="'+origin+'"\nclass Brain: pass\nclass DQN: pass\n')
                    (directory / "engine.py").write_text('ORIGIN="'+origin+'"\nclass MortalEngine: pass\n')
                saved_path = sys.path[:]
                saved_modules = {name: sys.modules.get(name) for name in ("model","engine","libriichi","libriichi.mjai")}
                class StopLoading(Exception): pass
                torch = sys.modules["torch"]
                torch.device = lambda name: name
                torch.load = lambda *args, **kwargs: (_ for _ in ()).throw(StopLoading())
                try:
                    for name in ("model","engine"):
                        sys.modules.pop(name, None)
                        if cached:
                            module=types.ModuleType(name); module.__file__=str(native/(name+".py")); module.ORIGIN="shadow"
                            module.Brain=module.DQN=module.MortalEngine=object
                            sys.modules[name]=module
                    native_module=types.ModuleType("libriichi"); native_module.__file__=str(native/"libriichi.pyd")
                    sys.modules["libriichi"]=native_module
                    mjai=types.ModuleType("libriichi.mjai"); mjai.Bot=object; sys.modules["libriichi.mjai"]=mjai
                    with self.assertRaises(StopLoading): runner.load_runtime("checkpoint", str(source), native_module.__file__)
                    for name in ("model","engine"):
                        self.assertEqual(sys.modules[name].ORIGIN, "verified")
                        self.assertEqual(Path(sys.modules[name].__file__).resolve(), (source/(name+".py")).resolve())
                finally:
                    sys.path[:]=saved_path
                    for name, module in saved_modules.items():
                        if module is None: sys.modules.pop(name,None)
                        else: sys.modules[name]=module


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
