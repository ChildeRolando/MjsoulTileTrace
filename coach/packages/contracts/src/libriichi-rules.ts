import { z } from "zod";
import { RuleSetV2Schema } from "./event-stream.js";
import { LocalMortalDecisionIdentitySchema, LocalMortalRuntimeActionSchema } from "./local-mortal-runtime.js";

/** Rules are a separately versioned operation, not a model response or score. */
export const LIBRIICHI_RULE_PROTOCOL_VERSION = "riichi-libriichi-rules-jsonl/v1" as const;
export const LIBRIICHI_RULE_NORMALIZATION_VERSION = "libriichi-actions/v1" as const;
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const LibriichiRuleIdentitySchema = z.object({
  implementation: z.literal("Equim-chan/Mortal/libriichi"),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  nativeArtifactSha256: Sha256,
  wrapperSha256: Sha256,
  normalizationVersion: z.literal(LIBRIICHI_RULE_NORMALIZATION_VERSION),
}).strict();
export type LibriichiRuleIdentity = z.infer<typeof LibriichiRuleIdentitySchema>;

export const LibriichiRuleRequestSchema = z.object({
  protocolVersion: z.literal(LIBRIICHI_RULE_PROTOCOL_VERSION),
  operation: z.literal("legal_actions"),
  requestId: Sha256,
  identity: LibriichiRuleIdentitySchema,
  canonicalStreamIdentity: z.string().min(1),
  eventPrefixSha256: Sha256,
  decision: LocalMortalDecisionIdentitySchema.extend({
    roundOrdinal: z.number().int().nonnegative(),
    riichiPhase: z.enum(["none", "declared", "accepted"]),
  }).strict(),
  ruleSet: RuleSetV2Schema,
  events: z.array(z.object({
    eventRef: z.string().min(1),
    json: z.string().min(2).max(4096),
  }).strict()).min(1).max(4096),
}).strict();
export type LibriichiRuleRequest = z.infer<typeof LibriichiRuleRequestSchema>;

export const LibriichiRuleActionSchema = z.object({
  runtimeAction: LocalMortalRuntimeActionSchema,
  mjaiActionJson: z.string().min(2).max(2048),
}).strict();
const ResultBinding = z.object({
  protocolVersion: z.literal(LIBRIICHI_RULE_PROTOCOL_VERSION),
  requestId: Sha256,
  identity: LibriichiRuleIdentitySchema,
});
export const LibriichiRuleSuccessSchema = ResultBinding.extend({
  status: z.literal("ok"),
  resultId: Sha256,
  actions: z.array(LibriichiRuleActionSchema).min(1).max(46),
}).strict();
export const LibriichiRuleNonActionSchema = ResultBinding.extend({
  status: z.literal("non_action"),
  resultId: Sha256,
  reason: z.literal("native_cannot_act"),
}).strict();
export const LibriichiRuleFailureSchema = z.object({
  protocolVersion: z.literal(LIBRIICHI_RULE_PROTOCOL_VERSION),
  requestId: Sha256,
  status: z.literal("error"),
  code: z.enum(["rules_protocol_invalid", "rules_input_incomplete", "rules_config_unsupported", "rules_runtime_failed"]),
}).strict();
export const LibriichiRuleResponseSchema = z.discriminatedUnion("status", [
  LibriichiRuleSuccessSchema, LibriichiRuleNonActionSchema, LibriichiRuleFailureSchema,
]);
export type LibriichiRuleResponse = z.infer<typeof LibriichiRuleResponseSchema>;
export type LibriichiRuleSuccess = z.infer<typeof LibriichiRuleSuccessSchema>;

/** A successful singleton result, not a local hand-shape argument. */
export const LibriichiSingleCandidateProofSchema = z.object({
  shape: z.literal("libriichi_single_candidate"),
  proofVersion: z.literal("libriichi-single-candidate/v1"),
  candidateCount: z.literal(1),
  ruleRequestId: Sha256,
  ruleResultId: Sha256,
  actionRef: z.string().min(1),
}).strict();
export type LibriichiSingleCandidateProof = z.infer<typeof LibriichiSingleCandidateProofSchema>;

/** Local projection/transport failures have no successful rule result. */
export const LibriichiLocalFailureSchema = z.object({
  status: z.literal("error"),
  code: z.enum(["rules_input_incomplete", "rules_runtime_failed", "rules_action_mapping_invalid"]),
}).strict();
/** Preserve input and native response; normalized actions are re-derived on read. */
export const LibriichiPackageEvidenceSchema = z.object({
  identity: LibriichiRuleIdentitySchema,
  results: z.array(z.object({
    decisionId: z.string().min(1),
    request: LibriichiRuleRequestSchema.nullable(),
    response: z.union([LibriichiRuleResponseSchema, LibriichiLocalFailureSchema]),
  }).strict()).min(1),
}).strict();
export type LibriichiPackageEvidence = z.infer<typeof LibriichiPackageEvidenceSchema>;

export interface LibriichiRulePort {
  queryRules(request: LibriichiRuleRequest): Promise<LibriichiRuleResponse>;
}

/** Stable JSON shared with the native wrapper's sort_keys encoding. */
export function libriichiRuleCanonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (typeof item !== "object" || item === null) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, normalize(child)]));
  };
  return JSON.stringify(normalize(value));
}
