import { z } from "zod";
import { LAB_FEATURES } from "./question-lab.js";

const Sha = z.string().regex(/^[a-f0-9]{64}$/);
const Finite = z.number().finite();
export const PAIR_DELTAS = ["deltaU", "deltaS", "deltaD", "deltaV"] as const;
export const PAIR_FEATURES = [
  ...LAB_FEATURES, ...PAIR_DELTAS, "valuePairKnown", "valueBothZero",
  ...["e", "d"].flatMap(s => [
    ...["Shanten", "Ukeire", "Dora", "Value", "ValueKnown", "Red", "Tsumogiri", "Genbutsu"].map(k => `${s}${k}`),
    ...Array.from({ length: 34 }, (_, i) => `${s}Tile${i}`),
  ]),
] as const;
export const PairStudyConfigSchema = z.object({
  schemaVersion: z.literal("question-lab-pairs-config/v2"),
  name: z.string().min(1).max(120).default("牌效率与保宝配对研究"),
  seed: z.number().int().min(0).max(0xffffffff).default(20261020),
  initialCount: z.number().int().min(2).max(10000).default(1000),
  budget: z.object({
    maxAttempts: z.number().int().min(1).max(1000000).default(40000),
    timeLimitSeconds: z.number().int().min(10).max(10800).default(3600),
    reserveSeconds: z.number().int().min(0).default(300),
    concurrency: z.number().int().min(1).max(2).default(2),
    refinementRounds: z.number().int().min(0).max(3).default(3),
    refinementCount: z.number().int().min(2).max(1000).default(200),
  }).strict().default({}),
  learning: z.object({
    sensitiveGap: Finite.nonnegative().default(0.01),
    robustGap: Finite.positive().default(0.05),
    boundaryGap: Finite.positive().default(0.05),
    maxTrainPairs: z.number().int().min(10).max(6000).default(6000),
  }).strict().default({}),
  scans: z.object({
    anchorCount: z.number().int().min(0).max(24).default(24),
    variantsPerAnchor: z.number().int().min(0).max(48).default(48),
    threats: z.boolean().default(true),
  }).strict().default({}),
  developmentArchives: z.array(z.string().min(1)).max(32).default([]),
}).strict().superRefine((c, ctx) => {
  if (c.budget.reserveSeconds >= c.budget.timeLimitSeconds)
    ctx.addIssue({ code: "custom", message: "reserve must be less than total budget" });
  if (c.learning.robustGap < c.learning.sensitiveGap)
    ctx.addIssue({ code: "custom", message: "robust gap must cover the sensitive band" });
  if (c.initialCount % 2 || c.budget.refinementCount % 2 || c.scans.anchorCount % 2)
    ctx.addIssue({ code: "custom", message: "strata and acquisition quotas require even counts" });
});
export type PairStudyConfig = z.infer<typeof PairStudyConfigSchema>;
export const PairObservationSchema = z.object({
  schemaVersion: z.literal("question-lab-pair/v2"),
  pairId: Sha, sampleId: Sha, groupId: Sha,
  split: z.enum(["train", "test"]),
  eRef: z.string().min(1), dRef: z.string().min(1),
  eAction: z.string().min(1), dAction: z.string().min(1),
  features: z.record(Finite),
}).strict().superRefine((p, ctx) => {
  if (Object.keys(p.features).sort().join() !== [...PAIR_FEATURES].sort().join())
    ctx.addIssue({ code: "custom", message: "pair feature whitelist mismatch" });
  if (p.eRef === p.dRef || p.features.deltaS! < 0 || p.features.deltaD! <= 0 ||
      (p.features.deltaS === 0 && p.features.deltaU! <= 0))
    ctx.addIssue({ code: "custom", message: "pair does not express a strict tradeoff" });
});
export type PairObservation = z.infer<typeof PairObservationSchema>;
export const PairTargetSchema = z.object({
  schemaVersion: z.literal("question-lab-pair-label/v2"),
  pairId: Sha, sampleId: Sha, y: Finite,
  winner: z.enum(["efficiency", "dora", "sensitive"]), exactTie: z.boolean(),
}).strict();
export type PairTarget = z.infer<typeof PairTargetSchema>;
export const PairSvrModelSchema = z.object({
  schemaVersion: z.literal("question-lab-svr/v2"),
  features: z.array(z.string()).min(1).max(PAIR_FEATURES.length),
  mean: z.array(Finite), scale: z.array(Finite.positive()),
  supportVectors: z.array(z.array(Finite)).max(6000),
  coefficients: z.array(Finite).max(6000), intercept: Finite,
  kernel: z.enum(["linear", "rbf"]), gamma: Finite.nonnegative(),
  C: Finite.positive(), epsilon: Finite.nonnegative(),
}).strict().superRefine((m, ctx) => {
  if (new Set(m.features).size !== m.features.length ||
    m.features.some(f => !(PAIR_FEATURES as readonly string[]).includes(f)) ||
    m.mean.length !== m.features.length || m.scale.length !== m.features.length ||
    m.supportVectors.length !== m.coefficients.length ||
    m.supportVectors.some(v => v.length !== m.features.length))
    ctx.addIssue({ code: "custom", message: "SVR dimensions or features mismatch" });
});
export type PairSvrModel = z.infer<typeof PairSvrModelSchema>;
export const PairScanCoordinateSchema = z.object({
  schemaVersion: z.literal("question-lab-scan/v2"),
  id: Sha, anchorId: Sha,
  axis: z.enum(["availability", "dora", "scores", "turn", "joint", "threat"]),
  values: z.record(z.union([z.number().int(), z.string()])),
  phase: z.enum(["scan", "threat"]),
}).strict();
export type PairScanCoordinate = z.infer<typeof PairScanCoordinateSchema>;
const RegressionMetrics = z.object({
  count: z.number().int().nonnegative(), mae: Finite.nonnegative(), rmse: Finite.nonnegative(),
  signAccuracy: Finite.min(0).max(1), exactTies: z.number().int().nonnegative(), sensitive: z.number().int().nonnegative(),
  confusion: z.array(z.array(z.number().int().nonnegative())).length(3),
  calibration: z.array(z.object({ count: z.number().int(), predicted: Finite, actual: Finite }).strict()),
}).strict();
export const PairFitResultSchema = z.object({
  schemaVersion: z.literal("question-lab-fit/v2"), evaluated: z.boolean(),
  producer: z.object({ python: z.string(), sklearn: z.string() }).strict(),
  trainingPairIds: z.array(Sha).max(6000),
  models: z.record(z.object({
    status: z.enum(["fitted", "insufficient_evidence"]), reason: z.string().optional(),
    model: PairSvrModelSchema.optional(),
    cv: z.array(z.object({ kernel: z.enum(["linear", "rbf"]), C: Finite, epsilon: Finite, mae: Finite.nonnegative() }).strict()).optional(),
    train: RegressionMetrics.optional(), test: RegressionMetrics.optional(),
    oof: z.array(z.object({ pairId: Sha, predicted: Finite }).strict()).optional(),
    predictions: z.array(z.object({ pairId: Sha, predicted: Finite }).strict()).optional(),
    explanation: z.object({ tree: z.string(), trainingFidelityMae: Finite, testFidelityMae: Finite.optional(),
      standardizedWeights: z.array(Finite).optional(), constantFeatures: z.array(z.string()) }).strict().optional(),
  }).strict()),
}).strict().superRefine((r, ctx) => {
  if (new Set(r.trainingPairIds).size !== r.trainingPairIds.length)
    ctx.addIssue({ code: "custom", message: "duplicate training pairs" });
  for (const model of Object.values(r.models)) {
    if (model.status === "fitted" && (!model.model || !model.cv || !model.train || !model.oof || !model.explanation))
      ctx.addIssue({ code: "custom", message: "incomplete fitted SVR result" });
    if (model.oof && (model.oof.length !== r.trainingPairIds.length || new Set(model.oof.map(p => p.pairId)).size !== model.oof.length || model.oof.some(p => !r.trainingPairIds.includes(p.pairId))))
      ctx.addIssue({ code: "custom", message: "OOF predictions must cover each training pair exactly once" });
    if (!r.evaluated && (model.test || model.predictions || model.explanation?.testFidelityMae !== undefined))
      ctx.addIssue({ code: "custom", message: "holdout results before evaluation" });
  }
});
export type PairFitResult = z.infer<typeof PairFitResultSchema>;
