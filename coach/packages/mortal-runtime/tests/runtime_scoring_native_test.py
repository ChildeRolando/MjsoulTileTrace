"""Real native replay plus deterministic score injection; not a CPU model spike."""
import os
import sys
import unittest
sys.dont_write_bytecode = True
import runtime_rules_native_test as rules_test
from runtime_rules_native_test import runner, start, draw, accepted


class Scores:
    def __init__(self):
        self.calls = 0

    def react_batch(self, obs, masks, invisible_obs):
        self.calls += 1
        masks = [[bool(v) for v in row] for row in masks]
        values = [[float(i) for i in range(46)] for _ in masks]
        actions = [max((i for i, yes in enumerate(row) if yes), key=lambda i: values[n][i])
                   for n, row in enumerate(masks)]
        return actions, values, masks, [True]*len(masks)


class NativeScoringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.native = runner.load_native(os.environ["COACH_LIBRIICHI_NATIVE_MODULE"])

    def request(self, events=None, **kwargs):
        helper = rules_test.NativeRulesTest()
        helper.native = self.native
        result = helper.query(events or start("19m19p19s1234567z")+[draw("2m")], **kwargs)
        self.assertEqual(result["status"], "ok")
        request = {"protocolVersion": "riichi-local-mortal-scoring-jsonl/v2", "operation": "score_actions",
                   "identity": {"runtimeRevision": "0"*40, "nativeArtifactSha256": "1"*64,
                                "runtimeArtifactSha256": "2"*64},
                   "ruleRequest": helper.last_request, "ruleResult": result}
        request["requestId"] = runner.rule_digest(request)
        return request

    def rehash(self, request):
        request.pop("requestId", None)
        request["requestId"] = runner.rule_digest(request)

    def test_full_scored_set_has_exact_rule_action_binding(self):
        request = self.request()
        engine = Scores()
        response = runner.score_rules(request, self.native, engine)
        self.assertEqual(response["status"], "ok", response)
        self.assertEqual(engine.calls, 1)
        self.assertEqual(response["ruleResultId"], request["ruleResult"]["resultId"])
        self.assertEqual([(r["runtimeAction"]["index"], r["qValue"]) for r in response["candidates"]],
                         [(i, float(i)) for i in [0,1,8,9,17,18,26,27,28,29,30,31,32,33,37,44]])
        self.assertEqual([r["ruleActionId"] for r in response["candidates"]],
                         [runner.rule_digest(r) for r in request["ruleResult"]["actions"]])
        self.assertEqual(response["preferredRuntimeAction"], {"index":44,"variant":None})

    def test_rehashed_payload_swap_is_rejected_before_scoring(self):
        request = self.request()
        rows = request["ruleResult"]["actions"]
        rows[0]["mjaiActionJson"], rows[1]["mjaiActionJson"] = rows[1]["mjaiActionJson"], rows[0]["mjaiActionJson"]
        request["ruleResult"].pop("resultId")
        request["ruleResult"]["resultId"] = runner.rule_digest(request["ruleResult"])
        self.rehash(request)
        engine = Scores()
        response = runner.score_rules(request, self.native, engine)
        self.assertEqual(response["status"], "error", response)
        self.assertEqual(response["code"], "mortal_candidate_mismatch")
        self.assertEqual(engine.calls, 0)

    def test_changed_canonical_input_cannot_reuse_rule_result(self):
        request = self.request()
        request["ruleRequest"]["canonicalStreamIdentity"] = "other"
        self.rehash(request["ruleRequest"])
        self.rehash(request)
        engine = Scores()
        response = runner.score_rules(request, self.native, engine)
        self.assertEqual(response["status"], "error", response)
        self.assertEqual(engine.calls, 0)

    def test_no_model_request_for_single_candidate(self):
        request = self.request(accepted("111222333m456p7z", "8s"), phase="accepted")
        engine = Scores()
        response = runner.score_rules(request, self.native, engine)
        self.assertEqual(response["status"], "error", response)
        self.assertEqual(engine.calls, 0)

    def test_multiple_kans_preserve_two_stage_scores(self):
        request = self.request(start("11112222333m44p")+[draw("3m")])
        response = runner.score_rules(request, self.native, Scores())
        self.assertEqual(response["status"], "ok", response)
        kans = [row for row in response["candidates"] if row["runtimeAction"]["index"] == 42]
        self.assertEqual([(r["runtimeAction"]["variant"],r["qValue"],r["kanSelectionQValue"]) for r in kans],
                         [("kan:0",42.0,0.0),("kan:1",42.0,1.0),("kan:2",42.0,2.0)])

    def test_kan_secondary_score_does_not_change_main_action_tie_break(self):
        class TiedScores(Scores):
            def react_batch(self, obs, masks, invisible_obs):
                actions, values, masks, greedy = super().react_batch(obs, masks, invisible_obs)
                values[-1] = [0.0]*46
                return actions, values, masks, greedy
        request = self.request(start("11112222333m44p")+[draw("3m")])
        response = runner.score_rules(request, self.native, TiedScores())
        self.assertEqual(response["status"], "ok", response)
        self.assertEqual(response["preferredRuntimeAction"], {"index":0,"variant":None})

    def test_rule_configuration_is_used_by_scoring_as_well_as_enumeration(self):
        helper = rules_test.NativeRulesTest()
        events = helper.open_hand("234p678s33m66p")
        for enabled, expected in [(True, [2,10,11,12,14,23,24,25,43]),
                                  (False, [2,10,11,12,14,23,24,25])]:
            with self.subTest(open_tanyao=enabled):
                request = self.request(events, profile={"openTanyao":enabled})
                response = runner.score_rules(request, self.native, Scores())
                self.assertEqual(response["status"], "ok", response)
                self.assertEqual([row["runtimeAction"]["index"] for row in response["candidates"]], expected)


if __name__ == "__main__":
    unittest.main()
