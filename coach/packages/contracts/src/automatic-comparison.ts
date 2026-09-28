import { z } from "zod";
import { ActionRefSchema } from "./comparison.js";
import { ModelEvaluationSchema, type ModelEvaluation } from "./model-evaluation.js";

export const AutomaticComparisonScopeSchema = z.object({
  policyVersion: z.literal("automatic-comparison/top-pair-v1"),
  reason: z.enum(["model_disagreement", "model_agreement"]),
  actionRefs: z.tuple([ActionRefSchema, ActionRefSchema]),
}).strict().superRefine((scope, context) => {
  if (scope.actionRefs[0] === scope.actionRefs[1]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Automatic comparison requires two distinct actions" });
  }
});
export type AutomaticComparisonScope = z.infer<typeof AutomaticComparisonScopeSchema>;

/** Select calculation scope without removing any legal action or model score. */
export function deriveAutomaticComparisonScope(raw: ModelEvaluation): AutomaticComparisonScope {
  const evaluation = ModelEvaluationSchema.parse(raw);
  const ranked = [...evaluation.candidates].sort((left, right) =>
    right.modelSelectionScore - left.modelSelectionScore ||
    (left.actionRef < right.actionRef ? -1 : left.actionRef > right.actionRef ? 1 : 0));
  const agrees = evaluation.preferredActions.includes(evaluation.scoredActualModelActionRef);
  const opponent = agrees
    ? ranked.find(candidate => candidate.actionRef !== evaluation.scoredActualModelActionRef)!
    : ranked[0]!;
  return AutomaticComparisonScopeSchema.parse({
    policyVersion: "automatic-comparison/top-pair-v1",
    reason: agrees ? "model_agreement" : "model_disagreement",
    actionRefs: agrees
      ? [evaluation.actualActionRef, opponent.actionRef]
      : [opponent.actionRef, evaluation.actualActionRef],
  });
}
