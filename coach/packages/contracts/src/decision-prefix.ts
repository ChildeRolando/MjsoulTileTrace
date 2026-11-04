import { z } from "zod";

/** Trusted source-adapter attestation; hashes bind data, not adapter honesty. */
export const DecisionPrefixEvidenceSchema = z.object({
  version: z.literal("decision-prefix-evidence/v1"),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  streamHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePrefixHash: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalPrefixHash: z.string().regex(/^[a-f0-9]{64}$/),
  roundStartRef: z.string().min(1), triggerRef: z.string().min(1),
  roundStartOrdinal: z.number().int().nonnegative(), triggerOrdinal: z.number().int().nonnegative(),
  positions: z.array(z.object({ ordinal: z.number().int().nonnegative(), eventRef: z.string().min(1) }).strict()).min(1),
  actor: z.number().int().min(0).max(3),
  initialScores: z.tuple([z.number().int(),z.number().int(),z.number().int(),z.number().int()]),
  initialRiichiSticks: z.number().int().nonnegative(),
}).strict();
export type DecisionPrefixEvidence = z.infer<typeof DecisionPrefixEvidenceSchema>;
