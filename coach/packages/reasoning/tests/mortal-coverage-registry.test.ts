import { describe, expect, it } from "vitest";
import {
  MORTAL_COVERAGE_BRANCHES,
  classifyCoverageBranches,
  createMortalCoverageRegistry,
} from "../src/analysis/mortal-coverage-registry.js";

describe("M6-A3 coverage branch classification", () => {
  it("classifies a riichi declaration window", () => {
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "riichi_discard",
      callKind: null,
      candidateActionTypes: ["reach", "dahai"],
    })).toEqual(["riichi_window"]);
  });

  it("requires a reach candidate before calling it a riichi window", () => {
    // actual riichi_discard without a model-scored reach row fails closed in
    // the import; it is not a coverage branch hit.
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "riichi_discard",
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual([]);
  });

  it("classifies a dama window carrying riichi or tsumo candidates", () => {
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["reach", "dahai"],
    })).toEqual(["dama_with_riichi_candidate"]);
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["hora", "dahai"],
    })).toEqual(["dama_with_tsumo_candidate"]);
  });

  it("classifies post-call windows by the call kind", () => {
    expect(classifyCoverageBranches({
      windowKind: "post_call_discard",
      actualActionKind: "discard",
      callKind: "chi",
      candidateActionTypes: ["dahai"],
    })).toEqual(["post_call_chi"]);
    expect(classifyCoverageBranches({
      windowKind: "post_call_discard",
      actualActionKind: "discard",
      callKind: "pon",
      candidateActionTypes: ["dahai"],
    })).toEqual(["post_call_pon"]);
  });

  it("fails a post-call riichi shape closed instead of classifying it", () => {
    // Riichi requires a concealed hand; a post-call window can never carry a
    // riichi actual, and the riichi_window branch is a self-turn fact.
    expect(classifyCoverageBranches({
      windowKind: "post_call_discard",
      actualActionKind: "riichi_discard",
      callKind: "pon",
      candidateActionTypes: ["reach", "dahai"],
    })).toEqual([]);
  });

  it("requires a known call kind before classifying a post-call branch", () => {
    expect(classifyCoverageBranches({
      windowKind: "post_call_discard",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual([]);
  });

  it("classifies the post-riichi same-turn discard", () => {
    expect(classifyCoverageBranches({
      windowKind: "post_riichi_discard",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual(["post_riichi"]);
  });

  it("classifies terminal actuals", () => {
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "tsumo",
      callKind: null,
      candidateActionTypes: ["hora", "dahai"],
    })).toEqual(["self_turn_tsumo_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "ankan",
      callKind: null,
      candidateActionTypes: ["ankan", "dahai"],
    })).toEqual(["self_turn_ankan"]);
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "kakan",
      callKind: null,
      candidateActionTypes: ["kakan", "dahai"],
    })).toEqual(["self_turn_kakan"]);
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "kyuushu_kyuuhai",
      callKind: null,
      candidateActionTypes: ["ryukyoku", "dahai"],
    })).toEqual(["self_turn_kyuushu"]);
  });

  it("fires candidate-driven ankan and kyuushu branches on any actual", () => {
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["dahai", "ankan", "ryukyoku"],
    })).toEqual(["self_turn_ankan", "self_turn_kyuushu"]);
  });

  it("treats an ordinary discard with an ordinary candidate set as covered implicitly", () => {
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: "discard",
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual([]);
    expect(classifyCoverageBranches({
      windowKind: "self_turn",
      actualActionKind: null,
      callKind: null,
      candidateActionTypes: ["dahai"],
    })).toEqual([]);
  });

  // M6-A4.2: the response surface matrix (wave-1 six + wave-2 pass-on-kakan).
  it("classifies response window actuals into the response branches", () => {
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "chi",
      callKind: null,
      candidateActionTypes: ["none", "chi"],
    })).toEqual(["resp_chi_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "pon",
      callKind: null,
      candidateActionTypes: ["none", "pon"],
    })).toEqual(["resp_pon_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "daiminkan",
      callKind: null,
      candidateActionTypes: ["none", "daiminkan"],
    })).toEqual(["resp_daiminkan_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "ron",
      callKind: null,
      candidateActionTypes: ["none", "hora"],
    })).toEqual(["resp_hora_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "discard_response",
      actualActionKind: "pass",
      callKind: null,
      candidateActionTypes: ["none", "chi"],
    })).toEqual(["resp_pass_on_discard"]);
    expect(classifyCoverageBranches({
      windowKind: "kan_response",
      actualActionKind: "ron",
      callKind: null,
      candidateActionTypes: ["none", "hora"],
    })).toEqual(["resp_chankan_actual"]);
    expect(classifyCoverageBranches({
      windowKind: "kan_response",
      actualActionKind: "pass",
      callKind: null,
      candidateActionTypes: ["none"],
    })).toEqual(["resp_pass_on_kakan"]);
  });

  it("keeps response branches fail-closed by default", () => {
    for (const branch of [
      "resp_chi_actual",
      "resp_pon_actual",
      "resp_daiminkan_actual",
      "resp_hora_actual",
      "resp_pass_on_discard",
      "resp_chankan_actual",
      "resp_pass_on_kakan",
    ]) {
      expect(createMortalCoverageRegistry([]).isCovered(branch as never)).toBe(false);
    }
  });
});

describe("M6-A3 coverage registry", () => {
  it("keeps every branch uncovered by default (production fail-closed)", () => {
    for (const branch of MORTAL_COVERAGE_BRANCHES) {
      expect(createMortalCoverageRegistry([]).isCovered(branch)).toBe(false);
    }
  });

  it("lifts only the branches recorded from real E2E hits", () => {
    const registry = createMortalCoverageRegistry(["riichi_window", "self_turn_tsumo_actual"]);
    expect(registry.isCovered("riichi_window")).toBe(true);
    expect(registry.isCovered("self_turn_tsumo_actual")).toBe(true);
    expect(registry.isCovered("post_riichi")).toBe(false);
  });

  it("rejects unknown branch keys at construction", () => {
    expect(() =>
      createMortalCoverageRegistry(["not_a_branch" as never])
    ).toThrow();
  });
});
