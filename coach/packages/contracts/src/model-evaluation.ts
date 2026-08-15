import { z } from "zod";
import {
  ActionRefSchema,
  DecisionLayerRefSchema,
} from "./comparison.js";
import { PreferenceSetSchema } from "./preference.js";

const SCORE_TOLERANCE = 1e-9;

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SCORE_TOLERANCE;
}

export const RawModelValueSchema = z.object({
  metric: z.enum(["probability", "logit", "q_value"]),
  value: z.number().finite(),
}).strict();
export type RawModelValue = z.infer<typeof RawModelValueSchema>;

const RawModelValuesSchema = z.array(RawModelValueSchema).min(1)
  .superRefine((values, context) => {
    const metrics = values.map((value) => value.metric);
    if (new Set(metrics).size !== metrics.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Raw model metrics must be unique per candidate",
      });
    }
  });

export const ModelCandidateScoreSchema = z.object({
  actionRef: ActionRefSchema,
  rawValues: RawModelValuesSchema,
  modelSelectionScore: z.number().finite().min(0).max(100),
}).strict();
export type ModelCandidateScore = z.infer<typeof ModelCandidateScoreSchema>;

export const ModelScoreMethodSchema = z.enum([
  "mortal_probability_x100",
  "akagi_softmax_x100",
]);
export type ModelScoreMethod = z.infer<typeof ModelScoreMethodSchema>;

export const DetailPolicySnapshotSchema = z.object({
  threshold: z.number().finite().min(0).max(100),
  unit: z.literal("model_selection_score_points"),
  boundary: z.literal("greater_than_or_equal_is_detailed"),
  policyVersion: z.string().min(1),
  frozenAt: z.string().datetime(),
}).strict();
export type DetailPolicySnapshot = z.infer<
  typeof DetailPolicySnapshotSchema
>;

function metricValue(
  candidate: ModelCandidateScore,
  metric: string,
): number | undefined {
  return candidate.rawValues.find((value) => value.metric === metric)?.value;
}

export const ModelEvaluationSchema = z.object({
  evaluationId: z.string().min(1),
  comparisonSetId: z.string().min(1),
  decisionLayerRef: DecisionLayerRefSchema,
  engineId: z.enum(["mortal", "akagi_native"]),
  engineVersion: z.string().min(1),
  adapterVersion: z.string().min(1),
  scoreMethod: ModelScoreMethodSchema,
  detailPolicy: DetailPolicySnapshotSchema,
  candidates: z.array(ModelCandidateScoreSchema).min(2),
  preferredActions: PreferenceSetSchema,
  actualActionRef: ActionRefSchema,
  // M6-A3: the actual may realize a scored model alternative of a different
  // granularity (riichi_discard realizes declare_riichi). The Mortal score
  // carrier and the error-gap baseline are this scored alternative — the
  // actualActionRef itself needs no model score of its own.
  scoredActualModelActionRef: ActionRefSchema,
  errorGap: z.number().finite().min(0).max(100),
  modelReason: z.literal("unknown"),
}).strict().superRefine((evaluation, context) => {
  const actionRefs = evaluation.candidates.map(
    (candidate) => candidate.actionRef,
  );
  if (new Set(actionRefs).size !== actionRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model candidate scores must have unique action references",
      path: ["candidates"],
    });
  }

  if (!actionRefs.includes(evaluation.scoredActualModelActionRef)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Scored actual model action must have a model score",
      path: ["scoredActualModelActionRef"],
    });
  }

  if (
    (evaluation.engineId === "mortal" &&
      evaluation.scoreMethod !== "mortal_probability_x100") ||
    (evaluation.engineId === "akagi_native" &&
      evaluation.scoreMethod !== "akagi_softmax_x100")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Score method must match the declared engine",
      path: ["scoreMethod"],
    });
  }

  let canonicalScores: number[] | undefined;
  if (evaluation.scoreMethod === "mortal_probability_x100") {
    evaluation.candidates.forEach((candidate, index) => {
      if (candidate.rawValues.some((value) => value.metric === "logit")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mortal evidence cannot contain Akagi logits",
          path: ["candidates", index, "rawValues"],
        });
      }
      const probability = metricValue(candidate, "probability");
      if (
        probability === undefined ||
        probability < 0 ||
        probability > 1 ||
        !approximatelyEqual(
          candidate.modelSelectionScore,
          probability * 100,
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mortal selection score must equal probability times 100",
          path: ["candidates", index],
        });
      }
    });
    const scores = evaluation.candidates.map((candidate) => {
      const probability = metricValue(candidate, "probability");
      return probability !== undefined &&
        probability >= 0 &&
        probability <= 1
        ? probability * 100
        : undefined;
    });
    if (scores.every((score) => score !== undefined)) {
      canonicalScores = scores as number[];
    }
  } else {
    evaluation.candidates.forEach((candidate, index) => {
      if (
        candidate.rawValues.some(
          (value) => value.metric === "probability",
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Akagi evidence cannot contain Mortal probabilities",
          path: ["candidates", index, "rawValues"],
        });
      }
    });
    const logits = evaluation.candidates.map(
      (candidate) => metricValue(candidate, "logit"),
    );
    if (logits.some((logit) => logit === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every Akagi candidate requires a raw logit",
        path: ["candidates"],
      });
      return;
    }
    const numericLogits = logits as number[];
    const maxLogit = Math.max(...numericLogits);
    const exponentials = numericLogits.map(
      (logit) => Math.exp(logit - maxLogit),
    );
    const denominator = exponentials.reduce(
      (total, value) => total + value,
      0,
    );
    canonicalScores = exponentials.map(
      (value) => value / denominator * 100,
    );
    evaluation.candidates.forEach((candidate, index) => {
      const expected = canonicalScores![index]!;
      if (!approximatelyEqual(candidate.modelSelectionScore, expected)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Akagi selection score must equal stable softmax times 100",
          path: ["candidates", index],
        });
      }
    });
  }

  if (canonicalScores === undefined) {
    return;
  }
  const highestScore = Math.max(...canonicalScores);
  const expectedPreferred = new Set(
    evaluation.candidates
      .filter((_, index) => canonicalScores![index] === highestScore)
      .map((candidate) => candidate.actionRef),
  );
  const declaredPreferred = new Set(evaluation.preferredActions);
  if (
    expectedPreferred.size !== declaredPreferred.size ||
    [...expectedPreferred].some(
      (actionRef) => !declaredPreferred.has(actionRef),
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Preferred actions must equal every highest-scored action",
      path: ["preferredActions"],
    });
  }

  const actualIndex = actionRefs.indexOf(
    evaluation.scoredActualModelActionRef,
  );
  if (actualIndex !== -1) {
    const expectedGap = highestScore - canonicalScores[actualIndex]!;
    if (
      (expectedGap === 0 && evaluation.errorGap !== 0) ||
      (expectedGap !== 0 &&
        !approximatelyEqual(evaluation.errorGap, expectedGap))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Error gap must equal highest score minus actual score",
        path: ["errorGap"],
      });
    }
    if (
      (expectedGap >= evaluation.detailPolicy.threshold) !==
        (evaluation.errorGap >= evaluation.detailPolicy.threshold)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Error gap must stay on the canonical side of the detail threshold",
        path: ["errorGap"],
      });
    }
  }
});
export type ModelEvaluation = z.infer<typeof ModelEvaluationSchema>;
