import { z } from "zod";
import { LibriichiRuleRequestSchema, LibriichiRuleSuccessSchema, libriichiRuleCanonicalJson } from "./libriichi-rules.js";
import {
  ManagedMortalRuntimeIdentitySchema, LocalMortalRuntimeActionSchema, LocalMortalSafeErrorCodeSchema,
} from "./local-mortal-runtime.js";

/** Explicitly distinct from v1 caller-enumerated inference. */
export const LOCAL_MORTAL_SCORING_PROTOCOL_VERSION = "riichi-local-mortal-scoring-jsonl/v2" as const;
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const LocalMortalScoringRequestSchema = z.object({
  protocolVersion: z.literal(LOCAL_MORTAL_SCORING_PROTOCOL_VERSION),
  operation: z.literal("score_actions"),
  requestId: Sha256,
  identity: ManagedMortalRuntimeIdentitySchema,
  ruleRequest: LibriichiRuleRequestSchema,
  ruleResult: LibriichiRuleSuccessSchema.extend({ actions: LibriichiRuleSuccessSchema.shape.actions.min(2) }),
}).strict().superRefine((request, ctx) => {
  const native = request.ruleRequest.identity;
  if (native.revision !== request.identity.runtimeRevision || native.nativeArtifactSha256 !== request.identity.nativeArtifactSha256 ||
      native.wrapperSha256 !== request.identity.runtimeArtifactSha256 ||
      libriichiRuleCanonicalJson(native) !== libriichiRuleCanonicalJson(request.ruleResult.identity) ||
      request.ruleRequest.requestId !== request.ruleResult.requestId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "mortal_rule_scoring_identity_mismatch" });
  }
});
export type LocalMortalScoringRequest = z.infer<typeof LocalMortalScoringRequestSchema>;

export const LocalMortalScoringSuccessSchema = z.object({
  protocolVersion: z.literal(LOCAL_MORTAL_SCORING_PROTOCOL_VERSION),
  requestId: Sha256,
  identity: ManagedMortalRuntimeIdentitySchema,
  status: z.literal("ok"),
  ruleResultId: Sha256,
  candidates: z.array(z.object({
    runtimeAction: LocalMortalRuntimeActionSchema,
    /** Digest of the exact rule row, including the native MJAI action. */
    ruleActionId: Sha256,
    qValue: z.number().finite(),
    kanSelectionQValue: z.number().finite().optional(),
  }).strict()).min(2).max(46),
  preferredRuntimeAction: LocalMortalRuntimeActionSchema,
}).strict();
export type LocalMortalScoringSuccess = z.infer<typeof LocalMortalScoringSuccessSchema>;
export const LocalMortalScoringResponseSchema = z.discriminatedUnion("status", [
  LocalMortalScoringSuccessSchema,
  z.object({
    protocolVersion: z.literal(LOCAL_MORTAL_SCORING_PROTOCOL_VERSION), requestId: Sha256,
    status: z.literal("error"), code: LocalMortalSafeErrorCodeSchema,
  }).strict(),
]);
export type LocalMortalScoringResponse = z.infer<typeof LocalMortalScoringResponseSchema>;
export interface LocalMortalScoringPort {
  scoreRules(request: LocalMortalScoringRequest): Promise<LocalMortalScoringResponse>;
}
