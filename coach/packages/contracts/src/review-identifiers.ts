import { z } from "zod";

// Shared leaf definitions let renderer-safe report schemas use the existing
// identities without loading the full analysis/fact-engine validation graph.
export const DecisionIdSchema = z.string().min(1);
export type DecisionId = z.infer<typeof DecisionIdSchema>;
export const SELECTOR_POLICY_VERSION_V1 = "deterministic-review-selector/v1" as const;
