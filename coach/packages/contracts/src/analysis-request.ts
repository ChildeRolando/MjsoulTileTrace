import { z } from "zod";
import {
  ComparisonAnalysisFrameSchema,
  ConceptualFrameSchema,
} from "./analysis-frame.js";
import { ComparisonSetSchema } from "./comparison.js";
import { ModelEvaluationSchema } from "./model-evaluation.js";

export const ComparisonAnalysisRequestSchema = z.object({
  kind: z.literal("comparison_request"),
  requestId: z.string().min(1),
  frame: ComparisonAnalysisFrameSchema,
  comparisonSet: ComparisonSetSchema,
  modelEvaluation: ModelEvaluationSchema.optional(),
}).strict();

export const ConceptualAnalysisRequestSchema = z.object({
  kind: z.literal("conceptual_request"),
  requestId: z.string().min(1),
  frame: ConceptualFrameSchema,
}).strict();

export const AnalysisRequestSchema = z.discriminatedUnion("kind", [
  ComparisonAnalysisRequestSchema,
  ConceptualAnalysisRequestSchema,
]).superRefine((request, context) => {
  if (request.kind !== "comparison_request") {
    return;
  }
  if (
    request.comparisonSet.origin === "automatic_review" &&
    request.modelEvaluation === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Automatic review requires complete model evidence",
      path: ["modelEvaluation"],
    });
    return;
  }
  if (request.modelEvaluation === undefined) {
    return;
  }
  if (
    request.modelEvaluation.comparisonSetId !==
      request.comparisonSet.comparisonSetId ||
    request.modelEvaluation.decisionLayerRef !==
      request.comparisonSet.decisionLayerRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model evidence must bind to this comparison and decision layer",
      path: ["modelEvaluation"],
    });
  }
  const comparisonActions = new Set(
    request.comparisonSet.candidates.map(
      (candidate) => candidate.actionRef,
    ),
  );
  request.modelEvaluation.candidates.forEach((candidate, index) => {
    if (!comparisonActions.has(candidate.actionRef)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every model-scored action must belong to the comparison set",
        path: ["modelEvaluation", "candidates", index, "actionRef"],
      });
    }
  });
  const scoredActions = new Set(
    request.modelEvaluation.candidates.map(
      (candidate) => candidate.actionRef,
    ),
  );
  if (
    request.comparisonSet.origin === "automatic_review" &&
    (
      scoredActions.size !== comparisonActions.size ||
      [...comparisonActions].some(
        (actionRef) => !scoredActions.has(actionRef),
      )
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Automatic review requires exact model score coverage",
      path: ["modelEvaluation", "candidates"],
    });
  }
  const actualCandidate = request.comparisonSet.candidates.find(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (
    actualCandidate === undefined ||
    actualCandidate.actionRef !== request.modelEvaluation.actualActionRef
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Model actual action must match the comparison actual action",
      path: ["modelEvaluation", "actualActionRef"],
    });
  }
});
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;
