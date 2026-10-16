import {
  LAB_FEATURES, PairObservationSchema, PairTargetSchema,
  type LabSample, type LabLabel, type PairObservation, type PairSvrModel,
} from "@riichi-coach/contracts";
import { digest } from "./config.js";

type Candidate = LabSample["candidates"][number];
export const PAIR_POLICIES = {
  efficiency: [["shanten", "min"], ["ukeire", "max"]],
  dora: [["dora", "max"], ["shanten", "min"], ["ukeire", "max"]],
} as const;
export function orderedRecommendations(
  candidates: Candidate[], order: readonly (readonly ["shanten" | "ukeire" | "dora", "min" | "max"])[],
) {
  let rows = candidates;
  for (const [key, direction] of order) {
    if (rows.some(c => c.metrics[key] === null)) return [];
    const best = (direction === "min" ? Math.min : Math.max)(...rows.map(c => c.metrics[key]!));
    rows = rows.filter(c => c.metrics[key] === best);
  }
  return rows;
}
export const semanticAction = (c: Candidate): string => {
  if (c.action.kind !== "discard") throw new Error("pair_action_not_discard");
  return `${c.action.kind}:${c.action.tile.id}:${Number(c.action.tile.red)}:${c.action.discardMode}`;
};
export function pairObservations(sample: LabSample) {
  const discards = sample.candidates.filter(c => c.action.kind === "discard");
  const reject = (reason: string) => ({ reason, e: [] as Candidate[], d: [] as Candidate[], pairs: [] as PairObservation[] });
  if (discards.length < 2) return reject("too_few_discards");
  if (discards.some(c => c.status !== "ready" || [c.metrics.shanten, c.metrics.ukeire, c.metrics.dora].some(v => v === null)))
    return reject("incomplete_candidate_facts");
  const e = orderedRecommendations(discards, PAIR_POLICIES.efficiency),
    d = orderedRecommendations(discards, PAIR_POLICIES.dora);
  if (!e.length || !d.length || e.some(a => d.some(b => a.actionRef === b.actionRef))) return reject("shared_recommendation");
  const pairs = e.flatMap(a => d.map(b => {
    const x = a.metrics, y = b.metrics;
    const known = x.valueEstimate !== null && y.valueEstimate !== null;
    const features: Record<string, number> = {
      ...Object.fromEntries(LAB_FEATURES.map(k => [k, sample.features[k]!])),
      deltaU: x.ukeire! - y.ukeire!, deltaS: y.shanten! - x.shanten!,
      deltaD: y.dora! - x.dora!, deltaV: known ? y.valueEstimate! - x.valueEstimate! : 0,
      valuePairKnown: Number(known), valueBothZero: Number(known && x.valueEstimate === 0 && y.valueEstimate === 0),
    };
    for (const [side, c] of [["e", a], ["d", b]] as const) {
      const m = c.metrics;
      Object.assign(features, {
        [`${side}Shanten`]: m.shanten!, [`${side}Ukeire`]: m.ukeire!, [`${side}Dora`]: m.dora!,
        [`${side}Value`]: m.valueEstimate ?? 0, [`${side}ValueKnown`]: Number(m.valueEstimate !== null),
        [`${side}Red`]: Number(m.red), [`${side}Tsumogiri`]: Number(c.action.kind === "discard" && c.action.discardMode === "tsumogiri"),
        [`${side}Genbutsu`]: m.genbutsu ?? 0,
      });
      for (let i = 0; i < 34; i++) features[`${side}Tile${i}`] = Number(m.tile34 === i);
    }
    const content = { sampleId: sample.sampleId, eRef: a.actionRef, dRef: b.actionRef, features };
    return PairObservationSchema.parse({
      schemaVersion: "question-lab-pair/v2", pairId: digest(content), ...content,
      groupId: sample.groupId, split: sample.split, eAction: semanticAction(a), dAction: semanticAction(b),
    });
  }));
  return { reason: "strict_conflict", e, d, pairs };
}
export function pairTargets(sample: LabSample, label: LabLabel, sensitiveGap: number) {
  if (sample.sampleId !== label.sampleId) throw new Error("pair_label_sample_mismatch");
  const result = pairObservations(sample), scores = new Map(label.scores.map(s => [s.actionRef, s.qValue]));
  const q = (ref: string) => { const v = scores.get(ref); if (v === undefined) throw new Error("pair_score_missing"); return v; };
  const eMax = result.e.length ? Math.max(...result.e.map(c => q(c.actionRef))) : null;
  const dMax = result.d.length ? Math.max(...result.d.map(c => q(c.actionRef))) : null;
  const eRefs = new Set(result.e.map(c => c.actionRef)), dRefs = new Set(result.d.map(c => c.actionRef));
  const eSupported = label.preferredActionRefs.some(r => eRefs.has(r)), dSupported = label.preferredActionRefs.some(r => dRefs.has(r));
  const side = eSupported && dSupported ? "both" : eSupported ? "efficiency" : dSupported ? "dora" : "third";
  const winningRefs = side === "efficiency" ? eRefs : side === "dora" ? dRefs : new Set<string>();
  const winning = side === "efficiency" ? eMax : side === "dora" ? dMax : null;
  const outside = label.scores.filter(s => !winningRefs.has(s.actionRef));
  const outsideGap = winning !== null && outside.length ? winning - Math.max(...outside.map(s => s.qValue)) : null;
  return {
    targets: result.pairs.map(p => {
      const y = q(p.eRef) - q(p.dRef);
      return PairTargetSchema.parse({ schemaVersion: "question-lab-pair-label/v2", pairId: p.pairId,
        sampleId: sample.sampleId, y, winner: Math.abs(y) <= sensitiveGap ? "sensitive" : y > 0 ? "efficiency" : "dora", exactTie: y === 0 });
    }),
    summary: { sampleId: sample.sampleId, eMax, dMax, setGap: eMax !== null && dMax !== null ? eMax - dMax : null,
      side, outsideGap, preferredActionRefs: label.preferredActionRefs, thirdTied: label.preferredActionRefs.some(r => !eRefs.has(r) && !dRefs.has(r)) },
  };
}
export function predictPair(model: PairSvrModel, features: Record<string, number>) {
  const x = model.features.map((f, i) => (features[f]! - model.mean[i]!) / model.scale[i]!);
  return model.intercept + model.supportVectors.reduce((sum, v, i) => {
    const k = model.kernel === "linear" ? v.reduce((s, a, j) => s + a * x[j]!, 0)
      : Math.exp(-model.gamma * v.reduce((s, a, j) => s + (a - x[j]!) ** 2, 0));
    return sum + k * model.coefficients[i]!;
  }, 0);
}

// Match Python's mean-one sample weights: equal source, then equal state, then pair.
export function pairWeights(rows: { pairId: string; groupId: string; sampleId: string }[]) {
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const states = groups.get(row.groupId) ?? new Map<string, number>();
    states.set(row.sampleId, (states.get(row.sampleId) ?? 0) + 1); groups.set(row.groupId, states);
  }
  return rows.map(row => ({ pairId: row.pairId, weight: rows.length / (groups.size * groups.get(row.groupId)!.size * groups.get(row.groupId)!.get(row.sampleId)!) }));
}
