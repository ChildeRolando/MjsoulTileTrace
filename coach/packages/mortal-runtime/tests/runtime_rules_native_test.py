"""Real libriichi capability regressions. Explicit native path; no checkpoint.

Run with the verified runtime Python and COACH_LIBRIICHI_NATIVE_MODULE set.
The normal protocol tests do not substitute for this native capability run.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("rules_runner", Path(__file__).parents[1] / "runtime/local_mortal_runtime.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def tiles(text):
    return [d+s if s != "z" else "ESWNPFC"[int(d)-1]
            for digits, s in re.findall(r"([1-9]+)([mpsz])", text) for d in digits]


def start(text, dealer=0):
    return [{"type": "start_game"}, {"type": "start_kyoku", "bakaze": "E", "kyoku": 1,
        "honba": 0, "kyotaku": 0, "oya": dealer, "scores": [25000]*4, "dora_marker": "8p",
        "tehais": [tiles(text)]+[["?"]*13]*3}]


def draw(tile, actor=0):
    return {"type": "tsumo", "actor": actor, "pai": tile}


def discard(tile, actor=0):
    return {"type": "dahai", "actor": actor, "pai": tile, "tsumogiri": True}


def accepted(text, tile):
    events = start(text) + [draw("9s"), {"type": "reach", "actor": 0}, discard("9s"), {"type": "reach_accepted", "actor": 0}]
    for actor, tile_other in [(1, "S"), (2, "W"), (3, "N")]:
        events += [draw("?", actor), discard(tile_other, actor)]
    return events + [draw(tile)]


class NativeRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.native = runner.load_native(os.environ["COACH_LIBRIICHI_NATIVE_MODULE"])

    def query(self, events, phase="none", window="self_turn", profile=None):
        prefix = [{"eventRef": str(i), "json": json.dumps(e, separators=(",", ":"))} for i, e in enumerate(events)]
        request = {"protocolVersion": "riichi-libriichi-rules-jsonl/v2", "operation": "legal_actions",
            "identity": {"implementation": "Equim-chan/Mortal/libriichi", "revision": "0"*40,
                "nativeArtifactSha256": "1"*64, "wrapperSha256": "2"*64, "normalizationVersion": "libriichi-actions/v2"},
            "canonicalStreamIdentity": "native-capability-regression",
            "eventPrefixSha256": runner.rule_digest(prefix),
            "decision": {"decisionId": str(len(events)-1), "triggerEventRef": str(len(events)-1), "selfActor": 0,
                "surface": "response" if window.endswith("response") else "self", "windowKind": window, "roundOrdinal": 0, "riichiPhase": phase},
            "ruleSet": {"length": "south", "redFives": {"man": 1, "pin": 1, "sou": 1}, "openTanyao": True,
                "atamahane": False, "westExtension": "sudden_death", "ippatsuCancelledByAnkan": True}, "events": prefix}
        if profile is not None: request["ruleSet"].update(profile)
        request["requestId"] = runner.rule_digest(request)
        self.last_request = request
        result = runner.query_rules(request, self.native)
        self.assertEqual(result["requestId"], request["requestId"])
        self.assertNotIn("torch", sys.modules)
        self.assertNotIn("model", sys.modules)
        return result

    def actions(self, events, **kwargs):
        result = self.query(events, **kwargs)
        self.assertEqual(result["status"], "ok", result)
        return { (row["runtimeAction"]["index"], row["runtimeAction"]["variant"]): json.loads(row["mjaiActionJson"])
                 for row in result["actions"] }

    def test_kyuushu_and_all_discards_and_riichi_are_retained(self):
        actions = self.actions(start("19m19p19s1234567z") + [draw("2m")])
        self.assertEqual(set(actions), {(i, None) for i in [0,1,8,9,17,18,26,27,28,29,30,31,32,33,37,44]})
        self.assertEqual(actions[44,None], {"type": "ryukyoku", "actor": 0, "reason": "kyuushu_kyuuhai"})
        self.assertEqual(actions[1,None]["tsumogiri"], True)
        self.assertEqual(actions[0,None]["tsumogiri"], False)
        self.assertTrue(all("meta" not in action for action in actions.values()))

    def test_accepted_multi_decomposition_kan_and_forced_discard(self):
        actions = self.actions(accepted("111222333m456p7z", "1m"), phase="accepted")
        self.assertEqual(set(actions), {(0,None),(42,None)})
        self.assertEqual(actions[42,None], {"type":"ankan","actor":0,"consumed":["1m"]*4})
        forced = self.actions(accepted("111222333m456p7z", "8s"), phase="accepted")
        self.assertEqual(set(forced), {(25,None)})

    def test_declared_discard_preserves_draw_mode(self):
        actions = self.actions(start("123456m123p123s1z") + [draw("S"), {"type":"reach","actor":0}],
                               phase="declared", window="post_riichi_discard")
        self.assertEqual(set(actions), {(27,None),(28,None)})
        self.assertEqual(actions[27,None]["tsumogiri"], False)
        self.assertEqual(actions[28,None]["tsumogiri"], True)

    def test_same_tile_discard_has_explicit_native_physical_alias(self):
        for phase in ["none", "declared", "accepted"]:
            with self.subTest(phase=phase):
                events = (accepted("111222333m456p7z", "1m") if phase == "accepted"
                          else start("111222333m456p7z") + [draw("1m")])
                if phase == "declared": events += [{"type":"reach", "actor":0}]
                result = self.query(events, phase=phase,
                                    window="post_riichi_discard" if phase == "declared" else "self_turn")
                self.assertEqual(result["status"], "ok")
                row = next(row for row in result["actions"] if row["runtimeAction"]["index"] == 0)
                self.assertEqual(json.loads(row["mjaiActionJson"]),
                                 {"type":"dahai","actor":0,"pai":"1m","tsumogiri":True})
                expected = [] if phase == "accepted" else [
                    {"type":"dahai","actor":0,"pai":"1m","tsumogiri":False}]
                self.assertEqual([json.loads(alias) for alias in row.get("physicalAliases", [])], expected)

    def test_discard_alias_respects_exact_red_tile_and_available_copies(self):
        for drawn, expect_alias in [("5mr", False), ("5m", True)]:
            with self.subTest(drawn=drawn):
                events = start("55m123p123s456s11z")
                events[1]["tehais"][0][0] = "5mr" if drawn == "5m" else "5m"
                result = self.query(events + [draw(drawn)])
                self.assertEqual(result["status"], "ok")
                row = next(row for row in result["actions"]
                           if json.loads(row["mjaiActionJson"]).get("pai") == drawn)
                self.assertEqual(len(row.get("physicalAliases", [])), int(expect_alias))

        result = self.query(start("19m19p19s1234567z") + [draw("2m")])
        self.assertTrue(all(not row.get("physicalAliases") for row in result["actions"]))

    def test_multiple_self_kans_have_native_tile_selection(self):
        actions = self.actions(start("11112222333m44p") + [draw("3m")])
        self.assertEqual({key for key in actions if key[0]==42}, {(42,"kan:0"),(42,"kan:1"),(42,"kan:2")})
        for key in [(42,"kan:0"),(42,"kan:1"),(42,"kan:2")]:
            self.assertEqual(actions[key]["consumed"], [str(int(key[1][4:])+1)+"m"]*4)
        self.assertIn((43,None), actions)

    def test_red_five_kan_uses_native_consumption(self):
        events = start("555m123p123s456s1z")
        events[1]["tehais"][0][0] = "5mr"
        actions = self.actions(events + [draw("5m")])
        self.assertEqual(actions[42,None]["consumed"], ["5mr","5m","5m","5m"])

    def test_no_action_is_explicit_and_not_a_singleton(self):
        result = self.query(start("123456m123p123s1z", 1) + [draw("?",1),discard("C",1)], window="discard_response")
        self.assertEqual(result["status"], "non_action")
        self.assertNotIn("actions", result)

    def test_response_chi_pon_daiminkan_and_post_call(self):
        events = start("34m123456p789s11z", 3) + [draw("?",3), discard("2m",3)]
        actions = self.actions(events, window="discard_response")
        self.assertEqual(set(actions), {(38,None),(45,None)})
        self.assertEqual(actions[38,None], {"type":"chi","actor":0,"target":3,"pai":"2m","consumed":["3m","4m"]})
        post_call = self.actions(events + [actions[38,None]], window="post_call_discard")
        self.assertEqual(set(post_call), {(i,None) for i in [9,10,11,12,13,14,24,25,26,27]})
        for hand, expected in [("55m123456p789s11z", {41,45}), ("555m123456p789s1z", {41,42,45})]:
            with self.subTest(hand=hand):
                events = start(hand, 1)
                events[1]["tehais"][0][0] = "5mr"
                result = self.actions(events+[draw("?",1),discard("5m",1)], window="discard_response")
                self.assertEqual(set(result), {(i,None) for i in expected})
                self.assertEqual(result[41,None]["consumed"], ["5mr","5m"])
                if 42 in expected: self.assertEqual(result[42,None]["consumed"], ["5mr","5m","5m"])

    def test_kakan_and_passed_ron_history(self):
        events = start("77z123m456p789s11z",1) + [draw("?",1), discard("C",1),
            {"type":"pon","actor":0,"target":1,"pai":"C","consumed":["C","C"]},
            {"type":"dahai","actor":0,"pai":"E","tsumogiri":False}]
        for actor, tile in [(1,"S"),(2,"W"),(3,"N")]: events += [draw("?",actor), discard(tile,actor)]
        actions = self.actions(events+[draw("C")])
        self.assertEqual(actions[42,None], {"type":"kakan","actor":0,"pai":"C","consumed":["C"]*3})
        events = start("111456m222p333s1z",1)+[draw("?",1),discard("E",1)]
        self.assertEqual(set(self.actions(events,window="discard_response")), {(43,None),(45,None)})
        # Updating the next opponent action records the unclaimed ron in the
        # native state. No synthetic pass action or local furiten solver.
        self.assertEqual(self.query(events+[draw("?",2),discard("E",2)],window="discard_response")["status"],"non_action")

    def open_hand(self, concealed):
        events = start("46m"+concealed+"1z",3)+[draw("?",3),discard("5m",3),
            {"type":"chi","actor":0,"target":3,"pai":"5m","consumed":["4m","6m"]},
            {"type":"dahai","actor":0,"pai":"E","tsumogiri":False}]
        for actor, tile in [(1,"S"),(2,"W"),(3,"N")]: events += [draw("?",actor),discard(tile,actor)]
        return events+[draw("3m")]

    def test_R14_independent_sanankou_with_open_tanyao_false_or_unknown(self):
        for enabled in [True, False, "unknown"]:
            with self.subTest(open_tanyao=enabled):
                actions=self.actions(self.open_hand("222p777s33m66p"),profile={"openTanyao":enabled})
                self.assertEqual(set(actions),{(i,None) for i in [2,10,14,24,43]})

    def test_open_tanyao_only_requires_the_rule_and_unknown_is_not_a_singleton(self):
        events=self.open_hand("234p678s33m66p")
        self.assertIn((43,None),self.actions(events,profile={"openTanyao":True}))
        self.assertNotIn((43,None),self.actions(events,profile={"openTanyao":False}))
        self.assertEqual(self.query(events,profile={"openTanyao":"unknown"})["code"],"rules_input_incomplete")

    def test_no_red_profile_does_not_invent_red_tiles_in_kans(self):
        actions=self.actions(start("555m123p123s456s1z")+[draw("5m")],profile={"redFives":{"man":0,"pin":0,"sou":0}})
        self.assertEqual(actions[42,None]["consumed"],["5m"]*4)


if __name__ == "__main__":
    unittest.main()
