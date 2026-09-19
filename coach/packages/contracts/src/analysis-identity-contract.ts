import { z } from "zod";

// Shared primitives, extracted without changing their public exports or shape.
// ReviewReport/selection DTO parsing must not pull the analysis producer's
// Node crypto dependency into Electron's sandboxed preload bundle.
export const DecisionIdSchema = z.string().min(1);
export type DecisionId = z.infer<typeof DecisionIdSchema>;
export const RecordAnalysisStatusSchema = z.enum([
  "complete", "degraded", "integrity_failed",
]);
export type RecordAnalysisStatus = z.infer<typeof RecordAnalysisStatusSchema>;
