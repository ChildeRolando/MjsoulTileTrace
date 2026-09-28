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
        actions = { (row["runtimeAction"]["index"], row["runtimeAction"]["variant"]): json.loads(row["mjaiActionJson"])
                    for row in result["actions"] }
        self.assertEqual(len(actions),len(result["actions"]),"duplicate runtime action identity")
        return actions

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
            for reverse in [False,True]:
                with self.subTest(hand=hand,reverse=reverse):
                    events = start(hand, 1)
                    events[1]["tehais"][0][0] = "5mr"
                    if reverse: events[1]["tehais"][0].reverse()
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

    def three_pons(self, tail):
        events = start("556677z" + tail + "789p", 3)
        for actor, pai, drop in [(3,"P","7p"),(1,"F","8p"),(1,"C","9p")]:
            events += [draw("?",actor),discard(pai,actor),
                {"type":"pon","actor":0,"target":actor,"pai":pai,"consumed":[pai,pai]},
                {"type":"dahai","actor":0,"pai":drop,"tsumogiri":False}]
        return events

    def test_R12_chi_requires_a_non_kuikae_followup_discard(self):
        for tail, expected in [("1123m",{43,45}),("1923m",{40,45})]:
            with self.subTest(tail=tail):
                events = self.three_pons(tail)
                for actor,pai in [(1,"8s"),(2,"7s"),(3,"4m")]:
                    events += [draw("?",actor),discard(pai,actor)]
                result = self.query(events,window="discard_response")
                self.assertEqual(result["status"],"ok")
                self.assertEqual({r["runtimeAction"]["index"] for r in result["actions"]},expected)
                if 40 in expected:
                    chi = next(json.loads(r["mjaiActionJson"]) for r in result["actions"] if r["runtimeAction"]["index"] == 40)
                    self.assertEqual(chi["consumed"],["2m","3m"])
                    followup = self.actions(events+[chi],window="post_call_discard")
                    self.assertEqual(set(followup),{(8,None)})

    def test_R13_post_call_singleton_and_two_discards(self):
        for tail, expected in [("99s",{26}),("89s",{25,26})]:
            with self.subTest(tail=tail):
                events=start("556677z22m123p"+tail,3)
                for actor,pai,drop in [(3,"P","1p"),(1,"F","2p"),(1,"C","3p")]:
                    events += [draw("?",actor),discard(pai,actor),
                        {"type":"pon","actor":0,"target":actor,"pai":pai,"consumed":[pai,pai]},
                        {"type":"dahai","actor":0,"pai":drop,"tsumogiri":False}]
                events += [draw("?",1),discard("2m",1),
                    {"type":"pon","actor":0,"target":1,"pai":"2m","consumed":["2m","2m"]}]
                self.assertEqual(set(self.actions(events,window="post_call_discard")),{(i,None) for i in expected})

    def opponent_kans(self, hand, count):
        events=start(hand,1)+[draw("?",1)]
        for pai in ["S","W","N","F"][:count]:
            events += [{"type":"ankan","actor":1,"consumed":[pai]*4},
                {"type":"dora","dora_marker":"9p"},draw("?",1)]
        return events

    def test_R12_four_kans_remove_daiminkan_but_keep_pon(self):
        for count,expected in [(3,{41,42,45}),(4,{41,45})]:
            with self.subTest(count=count):
                actions=self.actions(self.opponent_kans("555z123m123p123s1z",count)+[discard("P",1)],window="discard_response")
                self.assertEqual(set(actions),{(i,None) for i in expected})

    def test_R12_self_four_kan_limit_preserves_discard(self):
        events=self.opponent_kans("111222333m456p7z",4)+[discard("8s",1)]
        for actor,pai in [(2,"7s"),(3,"6s")]: events += [draw("?",actor),discard(pai,actor)]
        actions=self.actions(events+[draw("1m")])
        self.assertEqual(set(actions),{(i,None) for i in [0,1,2,12,13,14,33,37]})

    def test_R10_riichi_wait_using_triplet_forbids_ankan_and_keeps_tsumo(self):
        actions=self.actions(accepted("33312456m123p11z","3m"),phase="accepted")
        self.assertEqual(set(actions),{(2,None),(43,None)})

    def test_accepted_honor_kan_and_unrelated_quad(self):
        actions=self.actions(accepted("555z123m123p123s1z","P"),phase="accepted")
        self.assertEqual(set(actions),{(31,None),(42,None)})
        self.assertEqual(actions[42,None]["consumed"],["P"]*4)
        # A quad already in the locked hand is not the just-drawn fourth tile.
        unrelated=self.actions(accepted("111123m456p789s1z","9p"),phase="accepted")
        self.assertEqual(set(unrelated),{(17,None)})

    def test_accepted_winning_draw_keeps_both_choices(self):
        actions=self.actions(accepted("123456789m123p5p","5p"),phase="accepted")
        self.assertEqual(set(actions),{(13,None),(43,None)})

    def test_post_ankan_keeps_riichi_and_rinshan_tsumo(self):
        events=start("555z123m123p12s11z")+[draw("P"),
            {"type":"ankan","actor":0,"consumed":["P"]*4},
            {"type":"dora","dora_marker":"9p"},draw("3s")]
        actions=self.actions(events)
        self.assertEqual(set(actions),{(i,None) for i in [0,1,2,9,10,11,18,19,20,27,37,43]})

    def test_R12_ankan_and_kakan_have_separate_native_selection(self):
        events=start("111155z123p456s7z",3)+[draw("?",3),discard("P",3),
            {"type":"pon","actor":0,"target":3,"pai":"P","consumed":["P","P"]},
            {"type":"dahai","actor":0,"pai":"6s","tsumogiri":False}]
        for actor,pai in [(1,"S"),(2,"W"),(3,"N")]: events += [draw("?",actor),discard(pai,actor)]
        actions=self.actions(events+[draw("P")])
        self.assertEqual(set(actions),{(i,None) for i in [9,10,11,21,22,27,31,33]}|{(42,"kan:27"),(42,"kan:31")})
        self.assertEqual(actions[42,"kan:27"],{"type":"ankan","actor":0,"consumed":["E"]*4})
        self.assertEqual(actions[42,"kan:31"],{"type":"kakan","actor":0,"pai":"P","consumed":["P"]*3})

    def test_R12_pon_discard_clears_temporary_furiten(self):
        for passed in [False,True]:
            with self.subTest(passed=passed):
                events=start("55z11223m123p123s",1)+[draw("?",1),discard("3m" if passed else "8p",1),
                    draw("?",2),discard("P",2),
                    {"type":"pon","actor":0,"target":2,"pai":"P","consumed":["P","P"]},
                    {"type":"dahai","actor":0,"pai":"1m","tsumogiri":False},draw("?",1),discard("2m",1)]
                self.assertEqual(set(self.actions(events,window="discard_response")),{(41,None),(43,None),(45,None)})

    def last_draw(self, hand, final, dealer, riichi=False):
        events=start(hand,dealer)
        bag=[pai for pai in tiles("123456789m123456789p123456789s1234567z") for _ in range(4)]
        for pai in tiles(hand)+["8p",final]: bag.remove(pai)
        for turn in range(70):
            actor=(dealer+turn)%4
            # Keep the final wait out of self rivers. All tiles come from a
            # physical four-copy bag, including the initial indicator.
            pos=next(i for i,pai in enumerate(bag) if actor!=0 or pai!=final)
            pai=final if turn==69 else bag.pop(pos)
            events.append(draw(pai if actor==0 else "?",actor))
            if turn==69: return events,pai,actor
            if riichi and turn==1:
                events.append({"type":"reach","actor":0})
            events.append(discard(pai,actor))
            if riichi and turn==1:
                events.append({"type":"reach_accepted","actor":0})
        raise AssertionError("unreachable")

    def test_last_draw_forbids_ankan_including_accepted_riichi(self):
        for phase in ["none","accepted"]:
            with self.subTest(phase=phase):
                events,_,_=self.last_draw("111222333m456p7z","1m",3,phase=="accepted")
                actions=self.actions(events,phase=phase)
                expected={0} if phase=="accepted" else {0,1,2,12,13,14,33}
                self.assertEqual(set(actions),{(i,None) for i in expected})

    def test_last_discard_removes_calls_but_preserves_ron(self):
        for hand,final,expected in [("55534p123m123s12z","5p",set()),("111456m222p333s1z","E",{43,45})]:
            with self.subTest(hand=hand):
                events,pai,actor=self.last_draw(hand,final,2)
                result=self.query(events+[discard(pai,actor)],window="discard_response")
                if expected:
                    self.assertEqual(result["status"],"ok")
                    self.assertEqual({r["runtimeAction"]["index"] for r in result["actions"]},expected)
                else:
                    self.assertEqual(result["status"],"non_action")

    def test_concealed_kan_ends_nine_terminals_for_both_players(self):
        for actor in [0,1]:
            with self.subTest(actor=actor):
                events=start("555z19m19p19s1234z",actor)+[draw("P" if actor==0 else "?",actor),
                    {"type":"ankan","actor":actor,"consumed":["P" if actor==0 else "F"]*4},
                    {"type":"dora","dora_marker":"9p"}]
                if actor==1:
                    events += [draw("?",1),discard("C",1)]
                    for other,pai in [(2,"2p"),(3,"3p")]: events += [draw("?",other),discard(pai,other)]
                actions=self.actions(events+[draw("2m")])
                expected={0,1,8,9,17,18,26,27,28,29,30}|({31} if actor==1 else set())
                self.assertEqual(set(actions),{(i,None) for i in expected})

    def test_red_chi_consumption_is_native_and_hand_order_independent(self):
        for mixed in [False,True]:
            for reverse in [False,True]:
                with self.subTest(mixed=mixed,reverse=reverse):
                    events=start("35s123456m123p11z",3)
                    events[1]["tehais"][0][1]="5sr"
                    if mixed: events[1]["tehais"][0][-1]="5s"
                    if reverse: events[1]["tehais"][0].reverse()
                    actions=self.actions(events+[draw("?",3),discard("4s",3)],window="discard_response")
                    self.assertEqual(set(actions),{(39,None),(45,None)})
                    self.assertEqual(actions[39,None]["consumed"],["3s","5sr"])

    def test_temporary_furiten_clears_on_draw_but_riichi_furiten_persists(self):
        for riichi in [False,True]:
            with self.subTest(riichi=riichi):
                events=start("111456m222p333s1z")+[draw("9s")]
                if riichi: events.append({"type":"reach","actor":0})
                events.append(discard("9s"))
                if riichi: events.append({"type":"reach_accepted","actor":0})
                phase="accepted" if riichi else "none"
                events += [draw("?",1),discard("E",1)]
                self.assertEqual(set(self.actions(events,phase=phase,window="discard_response")),{(43,None),(45,None)})
                events += [draw("?",2),discard("E",2)]
                self.assertEqual(self.query(events,phase=phase,window="discard_response")["status"],"non_action")
                events += [draw("?",3),discard("C",3),draw("9p"),discard("9p"),draw("?",1),discard("E",1)]
                result=self.query(events,phase=phase,window="discard_response")
                if riichi:
                    self.assertEqual(result["status"],"non_action")
                else:
                    self.assertEqual({r["runtimeAction"]["index"] for r in result["actions"]},{43,45})

    def test_last_draw_forbids_kakan_with_the_pon_history_present(self):
        hand="55z123m123p123s11z"
        events=start(hand)+[draw("9s"),discard("9s"),draw("?",1),discard("P",1),
            {"type":"pon","actor":0,"target":1,"pai":"P","consumed":["P","P"]},
            {"type":"dahai","actor":0,"pai":"E","tsumogiri":False}]
        bag=[pai for pai in tiles("123456789m123456789p123456789s1234567z") for _ in range(4)]
        for pai in tiles(hand)+["8p","9s","P","P"]: bag.remove(pai)
        for turn in range(68):
            actor=(turn+1)%4
            pai="P" if turn==67 else bag.pop(0)
            events.append(draw(pai if actor==0 else "?",actor))
            if turn!=67: events.append(discard(pai,actor))
        self.assertEqual(set(self.actions(events)),{(i,None) for i in [0,1,2,9,10,11,18,19,20,27,31]})

    def test_native_complete_hand_families_replace_local_shape_prefilter(self):
        for hand,drawn,winning in [
            ("123456789m1234p","4p",True),
            ("123m789p123s5557z","C",True),
            ("1112345678999m","5m",True),
            ("113355m2244p668s","8s",True),
            ("11113355m2244p6s","6s",False),  # A quad is not two chiitoitsu pairs.
            ("19m19p19s1234567z","1m",True),
            ("19m19p19s123466z1m","1m",False),
            ("1112233445566z","C",False),
            ("123456789m1234p","7s",False),
            ("8899m1123456p78s","9s",False),
            ("123456789m123p5s","7s",False),
        ]:
            with self.subTest(hand=hand,drawn=drawn):
                actions=self.actions(start(hand)+[draw(drawn)])
                self.assertEqual((43,None) in actions,winning)


    def test_multiple_chi_combinations_and_mixed_response_set(self):
        for hand,expected in [("123456789m3446p",{39,40,45}),("123456789m3455p",{40,41,43,45})]:
            with self.subTest(hand=hand):
                result=self.actions(start(hand,3)+[draw("?",3),discard("5p",3)],window="discard_response")
                self.assertEqual(set(result),{(i,None) for i in expected})
                if 39 in expected: self.assertEqual(result[39,None]["consumed"],["4p","6p"])
                self.assertEqual(result[40,None]["consumed"],["3p","4p"])

    def test_own_discard_of_another_wait_blocks_ron(self):
        events=start("123m123p12345s11z")+[draw("3s"),discard("3s"),draw("?",1),discard("6s",1)]
        result=self.query(events,window="discard_response")
        self.assertEqual(result["status"],"non_action")
        self.assertNotIn("actions",result)

    def test_open_no_yaku_tsumo_requires_real_last_draw_or_rinshan_history(self):
        hand="44m123p123s12s55p9s"
        prefix=start(hand,1)+[draw("?",1),discard("C",1),draw("?",2),discard("4m",2),
            {"type":"pon","actor":0,"target":2,"pai":"4m","consumed":["4m","4m"]},
            {"type":"dahai","actor":0,"pai":"9s","tsumogiri":False}]
        normal=list(prefix)
        for actor,pai in [(1,"S"),(2,"W"),(3,"N")]: normal += [draw("?",actor),discard(pai,actor)]
        discards={9,10,11,13,18,19,20}
        self.assertEqual(set(self.actions(normal+[draw("3s")])),{(i,None) for i in discards})
        sea=list(prefix)
        bag=[pai for pai in tiles("123456789m123456789p123456789s1234567z") for _ in range(4)]
        for pai in tiles(hand)+["8p","C","4m","3s"]: bag.remove(pai)
        for turn in range(68):
            actor=(1+turn)%4
            pai="3s" if turn==67 else bag.pop(0)
            sea.append(draw(pai if actor==0 else "?",actor))
            if turn!=67: sea.append(discard(pai,actor))
        self.assertEqual(set(self.actions(sea)),{(i,None) for i in discards|{43}})
        rinshan=start("222244m123p12s55p",3)+[draw("?",3),discard("4m",3),
            {"type":"pon","actor":0,"target":3,"pai":"4m","consumed":["4m","4m"]},
            {"type":"dahai","actor":0,"pai":"5p","tsumogiri":False}]
        for actor,pai in [(1,"S"),(2,"W"),(3,"N")]: rinshan += [draw("?",actor),discard(pai,actor)]
        rinshan += [draw("5p"),{"type":"ankan","actor":0,"consumed":["2m"]*4},
            {"type":"dora","dora_marker":"9p"},draw("3s")]
        self.assertEqual(set(self.actions(rinshan)),{(i,None) for i in discards|{43}})


if __name__ == "__main__":
    unittest.main()
