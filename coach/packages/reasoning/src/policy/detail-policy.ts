import {
  DetailPolicySnapshotSchema,
  ModelEvaluationSchema,
  type DetailPolicySnapshot,
  type ModelEvaluation,
} from "@riichi-coach/contracts";

export const DEFAULT_ERROR_DETAIL_THRESHOLD = 10;

export function freezeDetailPolicy(input: {
  threshold?: number;
  policyVersion: string;
  frozenAt: string;
}): DetailPolicySnapshot {
  return DetailPolicySnapshotSchema.parse({
    threshold: input.threshold ?? DEFAULT_ERROR_DETAIL_THRESHOLD,
    unit: "model_selection_score_points",
    boundary: "greater_than_or_equal_is_detailed",
    policyVersion: input.policyVersion,
    frozenAt: input.frozenAt,
  });
}

export function classifyModelEvaluationDetail(
  rawEvaluation: ModelEvaluation,
): "not_error" | "concise" | "detailed" {
  const evaluation = ModelEvaluationSchema.parse(rawEvaluation);
  if (
    evaluation.preferredActions.includes(evaluation.actualActionRef)
  ) {
    return "not_error";
  }
  return evaluation.errorGap >= evaluation.detailPolicy.threshold
    ? "detailed"
    : "concise";
}
