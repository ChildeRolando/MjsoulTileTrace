import { describe, it, expect } from "vitest";
import { LAB_FEATURES, PairObservationSchema, PairStudyConfigSchema, type LabSample, type LabLabel } from "@riichi-coach/contracts";
import { pairObservations, pairTargets, pairWeights } from "../src/pair-features.js";
import { compareFlips, pairCaseDecoration } from "../src/pair-report.js";
import { pairAcquisition } from "../src/pair-study.js";

function sample(rows: number[][]): LabSample {
  return { sampleId: "a".repeat(64), groupId: "b".repeat(64), split: "train",
    features: Object.fromEntries(LAB_FEATURES.map(k => [k, 0])),
    candidates: rows.map(([s, u, d, v], i) => ({ actionRef: `r${i}`, status: "ready", result: null,
      action: { kind: "discard", tile: { id: `${i + 1}m`, red: false }, discardMode: "tedashi" },
      metrics: { shanten: s, ukeire: u, dora: d, valueEstimate: v === -1 ? null : v, genbutsu: 0, tile34: i, red: false, kind: "discard" } })),
  } as unknown as LabSample;
}
function label(s: LabSample, q: number[]): LabLabel {
  const max = Math.max(...q);
  return { sampleId: s.sampleId, scores: q.map((qValue, i) => ({ actionRef: `r${i}`, qValue })),
    preferredActionRefs: q.flatMap((value, i) => value === max ? [`r${i}`] : []),
  } as unknown as LabLabel;
}
describe("strict hypothesis competition and continuous pair labels", () => {
  it("does not starve exploration when every proposed boundary point is rejected", () => {
    let exploration = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      if (pairAcquisition(attempt, 0, exploration, 8, true) === "exploration") exploration++;
    }
    expect(exploration).toBe(4);
    expect(pairAcquisition(0, 0, 0, 8, false)).toBe("exploration");
    expect(pairAcquisition(0, 4, 1, 8, true)).toBe("exploration");
    expect(pairAcquisition(1, 1, 4, 8, true)).toBe("boundary");
  });
  it("gives equal total weight to sources and their states irrespective of pair multiplicity", () => {
    const rows = [{ pairId: "1", groupId: "a", sampleId: "x" }, { pairId: "2", groupId: "a", sampleId: "x" },
      { pairId: "3", groupId: "a", sampleId: "y" }, { pairId: "4", groupId: "b", sampleId: "z" }];
    expect(pairWeights(rows).map(r => r.weight)).toEqual([.5, .5, 1, 2]);
  });
  it("rejects overlap even when recommendation sets differ, and fails closed on missing facts", () => {
    expect(pairObservations(sample([[1, 15, 1, 0], [1, 12, 1, 0]])).reason).toBe("shared_recommendation");
    const s = sample([[1, 15, 0, 0], [1, 12, 1, 0]]);
    s.candidates[1]!.metrics.ukeire = null;
    expect(pairObservations(s).reason).toBe("incomplete_candidate_facts");
  });
  it("ranks dora then shanten then ukeire, keeping all fact ties without looking at Q", () => {
    const s = sample([[1, 17, 0, 1000], [1, 10, 1, 3000], [1, 10, 1, 4000], [2, 40, 1, 6000]]);
    const p = pairObservations(s);
    expect(p.e.map(c => c.actionRef)).toEqual(["r0"]);
    expect(p.d.map(c => c.actionRef)).toEqual(["r1", "r2"]);
    expect(p.pairs).toHaveLength(2);
    expect(p.pairs[0]!.features).toMatchObject({ deltaU: 7, deltaS: 0, deltaD: 1, deltaV: 2000 });
    const before = structuredClone(p.pairs);
    const first = pairTargets(s, label(s, [3, 1, 3, 0]), .01);
    expect(first.targets.map(t => t.y)).toEqual([2, 0]);
    expect(first.summary.setGap).toBe(0);
    const decoration = pairCaseDecoration(s, label(s, [3, 1, 3, 0]), .01);
    expect(decoration.summary).toBe("两侧并列");
    expect(decoration.body).toContain("2.00000");
    expect(decoration.body).toContain("0.00000");
    expect(decoration.body!.match(/<tr>/g)).toHaveLength(3); // header plus every E×D pair
    pairTargets(s, label(s, [-7, 3, 4, 8]), .01);
    expect(pairObservations(s).pairs).toEqual(before);
    expect(() => PairObservationSchema.parse({ ...p.pairs[0], features: { ...p.pairs[0]!.features, q: 2 } })).toThrow();
  });
  it("represents unknown versus double-zero estimates, cross-shanten differences, and third choices", () => {
    const s = sample([[1, 12, 0, -1], [2, 40, 1, 0], [3, 50, 0, 0]]);
    expect(pairObservations(s).pairs[0]!.features).toMatchObject({ deltaU: -28, deltaS: 1, deltaV: 0, valuePairKnown: 0, valueBothZero: 0 });
    s.candidates[0]!.metrics.valueEstimate = 0;
    expect(pairObservations(s).pairs[0]!.features.valueBothZero).toBe(1);
    const t = pairTargets(s, label(s, [0, .001, 2]), .01);
    expect(t.targets[0]!.winner).toBe("sensitive"); expect(t.summary.side).toBe("third");
  });
  it("does not call relative Q reversal a final-side flip while a third choice wins", () => {
    const a = sample([[1, 17, 0, 0], [1, 10, 1, 0], [2, 40, 0, 0]]), b = structuredClone(a);
    b.sampleId = "c".repeat(64);
    const config = PairStudyConfigSchema.parse({ schemaVersion: "question-lab-pairs-config/v2" });
    const labels = new Map([[a.sampleId, label(a, [1, 0, 3])], [b.sampleId, label(b, [0, 1, 3])]]);
    expect(compareFlips({ config, labels }, a, b)).toMatchObject({ pairFlips: 1, finalSideFlip: false, status: "第三选择胜出" });
    labels.set(a.sampleId, label(a, [1, 0, -1])); labels.set(b.sampleId, label(b, [0, 1, -1]));
    expect(compareFlips({ config, labels }, a, b).finalSideFlip).toBe(true);
  });
});
