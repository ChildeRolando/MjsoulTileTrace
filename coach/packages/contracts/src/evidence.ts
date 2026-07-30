import { z } from "zod";
import { ActionIdSchema } from "./tiles.js";

export const AxisSchema = z.enum([
  "efficiency",
  "value",
  "defense",
  "placement",
  "option_value",
]);
export type Axis = z.infer<typeof AxisSchema>;

export const ProvenanceSchema = z.enum([
  "raw_model",
  "raw_replay",
  "deterministic",
  "derived_heuristic",
  "calibrated_statistic",
  "teaching_rule",
  "unknown",
]);

export const FactorEvidenceSchema = z.object({
  factorId: z.string().min(1),
  axis: AxisSchema,
  dimension: z.string().min(1),
  subjectAction: ActionIdSchema,
  comparisonAction: ActionIdSchema,
  direction: z.enum(["supports_subject", "supports_comparison", "neutral"]),
  magnitude: z.object({
    kind: z.enum(["ordinal", "count", "points", "probability"]),
    value: z.union([z.string(), z.number()]),
  }),
  statement: z.string().min(1),
  provenance: ProvenanceSchema,
  confidence: z.enum(["certain", "high", "medium", "low", "unknown"]),
  evidenceIds: z.array(z.string()).min(1),
  actors: z.array(z.number().int().min(0).max(3)).min(1).max(4).optional(),
  limitations: z.array(z.string()).min(1),
  calibration: z.object({
    dataset: z.string().min(1),
    modelVersion: z.string().min(1),
    population: z.string().min(1),
    metric: z.string().min(1),
  }).optional(),
}).superRefine((factor, context) => {
  if (factor.provenance === "derived_heuristic" && factor.confidence === "certain") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Derived heuristics cannot have certain confidence",
      path: ["confidence"],
    });
  }
  if (
    factor.provenance === "unknown" &&
    (
      factor.direction !== "neutral" ||
      factor.confidence !== "unknown" ||
      factor.magnitude.value === "decisive"
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unknown evidence cannot express a directional decisive claim",
      path: ["provenance"],
    });
  }
  if (
    factor.magnitude.kind === "probability" &&
    factor.provenance !== "calibrated_statistic"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Probability magnitudes require calibrated statistics",
      path: ["magnitude", "kind"],
    });
  }
  if (factor.provenance === "calibrated_statistic" && !factor.calibration) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Calibrated statistics require dataset and metric metadata",
      path: ["calibration"],
    });
  }
});
export type FactorEvidence = z.infer<typeof FactorEvidenceSchema>;

export const CoverageEntrySchema = z.object({
  axis: AxisSchema,
  dimension: z.string(),
  status: z.enum([
    "implemented",
    "heuristic",
    "unsupported",
    "blocked_by_missing_data",
  ]),
  reason: z.string(),
});
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;
