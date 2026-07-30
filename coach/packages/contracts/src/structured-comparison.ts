import { z } from "zod";
import {
  ActionRefSchema,
  CandidateOriginSchema,
  ComparisonSetSchema,
  DecisionLayerRefSchema,
  type ComparisonSet,
} from "./comparison.js";
import {
  DecisionWindowSchema,
  RiichiActionSchema,
  actionWindowConflictCodes,
} from "./actions.js";
import { canonicalActionRef } from "./action-codec.js";

const StructuredCandidateOriginsSchema = z.array(CandidateOriginSchema).min(1)
  .superRefine((origins, context) => {
    if (new Set(origins).size !== origins.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Structured candidate origins must be unique",
      });
    }
  });

export const StructuredComparisonCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  action: RiichiActionSchema,
  origins: StructuredCandidateOriginsSchema,
}).strict().superRefine((candidate, context) => {
  if (candidate.actionRef !== canonicalActionRef(candidate.action)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ActionRef must equal the contracts canonical codec result",
      path: ["actionRef"],
    });
  }
});
export type StructuredComparisonCandidate = z.infer<
  typeof StructuredComparisonCandidateSchema
>;

export const StructuredComparisonSetSchema = z.object({
  comparisonSetId: z.string().min(1),
  origin: z.enum(["automatic_review", "user_comparison"]),
  decisionLayerRef: DecisionLayerRefSchema,
  decisionWindow: DecisionWindowSchema,
  candidates: z.array(StructuredComparisonCandidateSchema).min(2),
}).strict().superRefine((comparisonSet, context) => {
  const refs = comparisonSet.candidates.map((candidate) => candidate.actionRef);
  if (new Set(refs).size !== refs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Comparison candidates must contain unique structured actions",
      path: ["candidates"],
    });
  }
  const actual = comparisonSet.candidates.filter(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (actual.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A structured comparison may contain at most one actual action",
      path: ["candidates"],
    });
  }
  if (comparisonSet.origin === "automatic_review") {
    if (actual.length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Automatic review requires exactly one actual action",
        path: ["candidates"],
      });
    }
    comparisonSet.candidates.forEach((candidate, index) => {
      if (!candidate.origins.includes("model")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every automatic-review candidate must come from the model",
          path: ["candidates", index, "origins"],
        });
      }
    });
  }
  comparisonSet.candidates.forEach((candidate, index) => {
    const conflicts = actionWindowConflictCodes(
      candidate.action,
      comparisonSet.decisionWindow,
    );
    for (const conflict of conflicts) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: conflict,
        path: ["candidates", index, "action"],
      });
    }
  });
});
export type StructuredComparisonSet = z.infer<
  typeof StructuredComparisonSetSchema
>;

export function toComparisonSet(
  rawStructured: StructuredComparisonSet,
): ComparisonSet {
  const structured = StructuredComparisonSetSchema.parse(rawStructured);
  return ComparisonSetSchema.parse({
    comparisonSetId: structured.comparisonSetId,
    origin: structured.origin,
    decisionLayerRef: structured.decisionLayerRef,
    candidates: structured.candidates.map(({ actionRef, origins }) => ({
      actionRef,
      origins,
    })),
  });
}
