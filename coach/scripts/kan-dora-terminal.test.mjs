import { describe, expect, it, vi } from "vitest";
import { LIBRIICHI_RULE_NORMALIZATION_VERSION, MAHJONG_HELPER_COMMIT, FACT_ENGINE_ADAPTER_VERSION,
  FACT_ENGINE_PROTOCOL_VERSION } from "@riichi-coach/contracts";
import { computeCanonicalGameFingerprint } from "@riichi-coach/mortal-source";
import { mapTenhouRecord } from "@riichi-coach/tenhou-source";
import { queryCanonicalLibriichiRules, validateCanonicalEventStream, runMortalFullGameReview,
  buildStructuredAnalysisPackage, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";

// R16's synthetic, physically conserved source probe. No generated source data
// or model answer is used as the expected completeness/validation result.
function kanTerminal(published, terminal = "tsumo", kind = "ankan") {
  const hand = [0, 1, 2, 40, 44, 48, 84, 89, 92, 96, 100, 104, 53];
  const used = new Set([...hand, 3, 54, 55, 108, 112]);
  const stock = Array.from({ length: 136 }, (_, i) => i).filter(i => !used.has(i));
  const hands = [hand, ...Array.from({ length: 3 }, () => stock.splice(0, 13))];
  const prefix = '<mjloggm ver="2.3"><GO type="9"/><UN n0="A" n1="B" n2="C" n3="D"/><TAIKYOKU oya="0"/>' +
    '<INIT seed="0,0,0,0,0,112" ten="250,250,250,250" oya="0" ' +
    hands.map((h, i) => `hai${i}="${h.join(',')}"`).join(' ') + '/>' +
    (kind === "ankan" ? '<T3/><N who="0" m="0"/>' : '<T55/><D55/><U3/><E3/><N who="0" m="769"/>');
  const ending = terminal === "tsumo"
    ? '<T54/><AGARI who="0" fromWho="0" machi="54" ten="30,1500,1" yaku="4,1" sc="250,15,250,-5,250,-5,250,-5" owari="265,0,245,0,245,0,245,0"/>'
    : '<T54/><D54/><AGARI who="1" fromWho="0" machi="54" ten="30,1000,0" yaku="1,1" sc="250,-10,250,10,250,0,250,0" owari="240,0,260,0,250,0,250,0"/>';
  const result = mapTenhouRecord({ raw: prefix + (published ? '<DORA hai="108"/>' : '') + ending + '</mjloggm>',
    gameId: "synthetic-r16-missing-dora", selfActor: 0 });
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("source probe did not map");
  return result.stream;
}

const identity = { implementation: "Equim-chan/Mortal/libriichi", revision: "0".repeat(40),
  nativeArtifactSha256: "1".repeat(64), wrapperSha256: "2".repeat(64),
  normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION };

describe("terminal kan indicator evidence", () => {
  it.each(["tsumo", "ron"])("does not claim complete indicators when an ankan reveal is missing before %s", terminal => {
    const missing = kanTerminal(false, terminal);
    expect(missing.completeness.doraIndicators).toBe("partial");
    expect(missing.events.filter(event => event.type === "dora_revealed")).toEqual([]);
    const complete = kanTerminal(true, terminal);
    expect(complete.completeness.doraIndicators).toBe("complete");
    expect(complete.events.filter(event => event.type === "dora_revealed").map(event => event.indicator))
      .toEqual([{ id: "1z", red: false }]);
    expect(validateCanonicalEventStream(complete)).toEqual({ status: "valid" });
  });

  it.each(["tsumo", "ron"])("rejects a forged complete claim at the terminal boundary: %s", terminal => {
    const stream = kanTerminal(false, terminal);
    stream.completeness.doraIndicators = "complete";
    const win = stream.events.find(event => event.type === "win_declared");
    expect(validateCanonicalEventStream(stream)).toEqual({ status: "invalid", code: "dora_kan_mismatch", eventRef: win.eventId });
  });

  it("blocks every affected rule request instead of reaching model scoring or a singleton exemption", async () => {
    const stream = kanTerminal(false);
    const queryRules = vi.fn(async () => { throw new Error("incomplete source must not reach native rules"); });
    const result = await queryCanonicalLibriichiRules({ stream, identity, port: { queryRules } });
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions.at(-1).actualAction.kind).toBe("tsumo");
    expect(queryRules).not.toHaveBeenCalled();
    expect([...result.rules.values()]).toEqual(result.decisions.map(() => ({ request: null,
      response: { status: "error", code: "rules_input_incomplete" }, actions: [] })));
    const forbidden = vi.fn(async () => { throw new Error("blocked input must not be analyzed"); });
    const engine = { identity: forbidden, analyzeHand13: forbidden, analyzeHandStructure: forbidden,
      analyzeCompletedHand: forbidden, analyzeThreatRisk: forbidden, close: async () => {} };
    const review = await runMortalFullGameReview({ stream, decisions: result.decisions, responseDecisions: [], engine,
      libriichi: { identity, results: result.rules }, report: { reportId: "r16-missing-dora", adapterVersion: "mortal-source/2",
        engine: "Mortal", version: "1.5.10", modelTag: "fixture", playerId: 0,
        gameFingerprint: computeCanonicalGameFingerprint(stream), kyokus: [] } });
    expect(review.status).toBe("coverage_ready");
    expect(review.decisions.map(row => [row.outcome, row.reason, row.singleCandidateProof ?? null]))
      .toEqual([["analysis_blocked", "legal_actions_unproven", null], ["analysis_blocked", "legal_actions_unproven", null]]);
    expect(review.retainedAnalyses).toEqual([]);
    expect(forbidden).not.toHaveBeenCalled();
    const pkg = buildStructuredAnalysisPackage({ stream, decisions: result.decisions, responseDecisions: [], review,
      componentVersions: { packageSchema: "structured-analysis-package/v2", legalActionRules: identity,
        canonicalReplay: "canonical-riichi-events/v2", mapperAdapter: stream.mapperVersion,
        factEngine: { engine: "mahjong-helper", upstreamCommit: MAHJONG_HELPER_COMMIT,
          adapterVersion: FACT_ENGINE_ADAPTER_VERSION, protocolVersion: FACT_ENGINE_PROTOCOL_VERSION },
        factorPipeline: "factor-pipeline/v1", mortalSourceModel: { identity: "Mortal", version: "fixture", modelTag: "fixture",
          evidenceSource: { kind: "remote_report" } } },
      frozenPolicySnapshot: { threshold: 10, unit: "model_selection_score_points", boundary: "greater_than_or_equal_is_detailed",
        policyVersion: "mortal-review/v1", frozenAt: "2026-09-28T00:00:00.000Z" } });
    validateStructuredAnalysisPackage(pkg);
    expect(pkg.legalActionEvidence.results.map(row => row.response))
      .toEqual([{ status: "error", code: "rules_input_incomplete" }, { status: "error", code: "rules_input_incomplete" }]);
  });

  it.each(["tsumo", "ron"])("retains the source distinction between immediate open-kan tsumo and discard: %s", terminal => {
    const stream = kanTerminal(false, terminal, "daiminkan");
    expect(stream.events.some(event => event.type === "daiminkan_called")).toBe(true);
    expect(stream.completeness.doraIndicators).toBe(terminal === "tsumo" ? "complete" : "partial");
    expect(validateCanonicalEventStream(stream)).toEqual({ status: "valid" });
  });
});
