import { z } from "zod";

export const ActionRefSchema = z.string().min(1).brand<"ActionRef">();
export type ActionRef = z.infer<typeof ActionRefSchema>;

export const DecisionLayerRefSchema = z.string().min(1)
  .brand<"DecisionLayerRef">();
export type DecisionLayerRef = z.infer<typeof DecisionLayerRefSchema>;

export const CandidateOriginSchema = z.enum(["model", "actual", "user"]);
export type CandidateOrigin = z.infer<typeof CandidateOriginSchema>;

const CandidateOriginsSchema = z.array(CandidateOriginSchema).min(1)
  .superRefine((origins, context) => {
    if (new Set(origins).size !== origins.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate origins must be unique",
      });
    }
  });

export const ComparisonCandidateSchema = z.object({
  actionRef: ActionRefSchema,
  origins: CandidateOriginsSchema,
}).strict();
export type ComparisonCandidate = z.infer<typeof ComparisonCandidateSchema>;

// M0 comparison view. For `automatic_review` this schema assumes the A2-era
// language: every candidate — including the actual — is directly model-scored.
// M6-A3's realization semantics (an actual-only riichi_discard realizing a
// tile-less declare_riichi, recorded as a typed correspondence in
// StructuredComparisonSet) is intentionally NOT expressible here; use the
// structured schema directly for those sets (toComparisonSet reports
// unavailability instead of converting them).
export const ComparisonSetSchema = z.object({
  comparisonSetId: z.string().min(1),
  origin: z.enum(["automatic_review", "user_comparison"]),
  decisionLayerRef: DecisionLayerRefSchema,
  candidates: z.array(ComparisonCandidateSchema).min(2),
}).strict().superRefine((comparisonSet, context) => {
  const actionRefs = comparisonSet.candidates.map(
    (candidate) => candidate.actionRef,
  );
  if (new Set(actionRefs).size !== actionRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Comparison candidates must have unique action references",
      path: ["candidates"],
    });
  }
  const actualCandidates = comparisonSet.candidates.filter(
    (candidate) => candidate.origins.includes("actual"),
  );
  if (actualCandidates.length > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A comparison set may contain at most one actual action",
      path: ["candidates"],
    });
  }
  if (comparisonSet.origin === "automatic_review") {
    if (actualCandidates.length !== 1) {
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
});
export type ComparisonSet = z.infer<typeof ComparisonSetSchema>;
