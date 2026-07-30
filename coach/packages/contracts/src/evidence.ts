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
  limitations: z.array(z.string()),
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
