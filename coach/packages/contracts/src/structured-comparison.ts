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

// M6-A3 (ADR-0001): the actual riichi_discard(tile, mode) and the model's
// tile-less declare_riichi candidate are different-granularity views of the
// same alternative. Their relation survives as this explicit typed
// correspondence — never as an actionRef rewrite of the model row and never
// via actionRef equality. This milestone admits exactly one correspondence
// pair kind: riichi_discard realizes declare_riichi.
export const ActualModelCorrespondenceSchema = z.object({
  actualActionRef: ActionRefSchema,
  scoredModelActionRef: ActionRefSchema,
  relation: z.literal("realizes"),
}).strict();
export type ActualModelCorrespondence = z.infer<
  typeof ActualModelCorrespondenceSchema
>;

export const StructuredComparisonSetSchema = z.object({
  comparisonSetId: z.string().min(1),
  origin: z.enum(["automatic_review", "user_comparison"]),
  decisionLayerRef: DecisionLayerRefSchema,
  decisionWindow: DecisionWindowSchema,
  candidates: z.array(StructuredComparisonCandidateSchema).min(2),
  correspondences: z.array(ActualModelCorrespondenceSchema).max(1).optional(),
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

  // Correspondence integrity: every correspondence must bind the actual
  // candidate to a scored model candidate of the riichi granularity pair,
  // and only such an actual-bound candidate may skip the model origin.
  const actualRefs = actual.map((candidate) => candidate.actionRef);
  const correspondences = comparisonSet.correspondences ?? [];
  const correspondedByRef = new Set(
    correspondences.map((correspondence) => correspondence.actualActionRef),
  );
  correspondences.forEach((correspondence, index) => {
    if (correspondence.actualActionRef === correspondence.scoredModelActionRef) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correspondence must link two distinct action identities",
        path: ["correspondences", index],
      });
      return;
    }
    if (actualRefs.length !== 1 ||
      correspondence.actualActionRef !== actualRefs[0]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correspondence must bind the actual candidate",
        path: ["correspondences", index],
      });
    }
    const actualCandidate = comparisonSet.candidates.find(
      (candidate) => candidate.actionRef === correspondence.actualActionRef,
    );
    if (actualCandidate?.origins.includes("model")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "correspondence must bind an actual without an exact scored ref",
        path: ["correspondences", index],
      });
    }
    const modelCandidate = comparisonSet.candidates.find(
      (candidate) =>
        candidate.actionRef === correspondence.scoredModelActionRef &&
        candidate.origins.includes("model"),
    );
    if (modelCandidate === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "correspondence must point at a scored model candidate",
        path: ["correspondences", index],
      });
    }
    if (
      actualCandidate?.action.kind !== "riichi_discard" ||
      modelCandidate?.action.kind !== "declare_riichi"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "correspondence is limited to a riichi_discard actual realizing a declare_riichi model candidate",
        path: ["correspondences", index],
      });
    }
  });

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
        const boundByCorrespondence =
          candidate.origins.includes("actual") &&
          correspondedByRef.has(candidate.actionRef);
        if (!boundByCorrespondence) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Every automatic-review candidate must come from the model",
            path: ["candidates", index, "origins"],
          });
        }
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

// M6-A3 closing round: the legacy ComparisonSet speaks the M0–A2 language —
// an automatic-review actual that is itself model-scored. A structured set
// carrying an actual-only realization candidate (riichi_discard realizing
// declare_riichi, ADR-0001) is legal but NOT expressible in that language:
// the legacy schema demands a model origin and an exact model score for
// every automatic-review candidate. The conversion therefore reports
// unavailability instead of throwing on a nominally valid input.
export type ToComparisonSetResult =
  | { status: "convertible"; comparisonSet: ComparisonSet }
  | { status: "unavailable"; reason: "actual_not_model_scored" };

export function toComparisonSet(
  rawStructured: StructuredComparisonSet,
): ToComparisonSetResult {
  const structured = StructuredComparisonSetSchema.parse(rawStructured);
  if (
    structured.origin === "automatic_review"
    && structured.candidates.some(
      (candidate) => !candidate.origins.includes("model"),
    )
  ) {
    return { status: "unavailable", reason: "actual_not_model_scored" };
  }
  return {
    status: "convertible",
    comparisonSet: ComparisonSetSchema.parse({
      comparisonSetId: structured.comparisonSetId,
      origin: structured.origin,
      decisionLayerRef: structured.decisionLayerRef,
      candidates: structured.candidates.map(({ actionRef, origins }) => ({
        actionRef,
        origins,
      })),
    }),
  };
}
