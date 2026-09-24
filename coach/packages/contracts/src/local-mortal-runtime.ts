import { z } from "zod";

export const LOCAL_MORTAL_PROTOCOL_VERSION = "riichi-local-mortal-jsonl/v1" as const;
export const LOCAL_MORTAL_ADAPTER_VERSION = "local-mortal-adapter/v1" as const;
export const MANAGED_MORTAL_RUNTIME_MANIFEST_VERSION =
  "managed-mortal-runtime-manifest/v1" as const;

export const LocalMortalSafeErrorCodeSchema = z.enum([
  "mortal_runtime_unavailable",
  "mortal_runtime_identity_mismatch",
  "mortal_checkpoint_identity_mismatch",
  "mortal_runtime_crash",
  "mortal_runtime_timeout",
  "mortal_protocol_invalid",
  "mortal_candidate_mismatch",
  "mortal_actual_action_mismatch",
  "mortal_output_incomplete",
]);
export type LocalMortalSafeErrorCode = z.infer<typeof LocalMortalSafeErrorCodeSchema>;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const ManagedMortalRuntimeIdentitySchema = z.object({
  runtimeImplementation: z.literal("Equim-chan/Mortal"),
  runtimeRevision: z.string().regex(/^[a-f0-9]{40}$/),
  runtimeVersion: z.literal("Mortal V4"),
  runtimeArtifactSha256: Sha256Schema,
  checkpointRepository: z.literal("Yuchen1457/mortal-582500"),
  checkpointRevision: z.string().regex(/^[a-f0-9]{40}$/),
  checkpointModelTag: z.literal("mortal-hpc@582500"),
  checkpointFileSha256: Sha256Schema,
  protocolVersion: z.literal(LOCAL_MORTAL_PROTOCOL_VERSION),
  adapterVersion: z.literal(LOCAL_MORTAL_ADAPTER_VERSION),
}).strict();
export type ManagedMortalRuntimeIdentity = z.infer<typeof ManagedMortalRuntimeIdentitySchema>;

export const ManagedMortalRuntimeManifestSchema = z.object({
  manifestVersion: z.literal(MANAGED_MORTAL_RUNTIME_MANIFEST_VERSION),
  identity: ManagedMortalRuntimeIdentitySchema,
  runtimeEntrypoint: z.literal("runtime/local_mortal_runtime.py"),
  checkpointFile: z.literal("mortal_582500.pth"),
  geometry: z.object({
    observation: z.tuple([z.literal(1012), z.literal(34)]),
    legalActionSpace: z.literal(46),
    outputWidth: z.literal(47),
  }).strict(),
  inference: z.object({
    device: z.literal("cpu"),
    mode: z.literal("eval"),
    greedy: z.literal(true),
    temperature: z.literal(1),
    amp: z.literal(false),
  }).strict(),
  licenses: z.object({
    runtime: z.literal("AGPL-3.0-or-later"),
    checkpoint: z.literal("AGPL-3.0"),
    redistribution: z.literal("verify_at_m8"),
  }).strict(),
}).strict();
export type ManagedMortalRuntimeManifest = z.infer<typeof ManagedMortalRuntimeManifestSchema>;

export const LocalMortalDecisionIdentitySchema = z.object({
  decisionId: z.string().min(1),
  surface: z.enum(["self", "response"]),
  windowKind: z.enum([
    "self_turn", "discard_response", "kan_response",
    "post_call_discard", "post_riichi_discard",
  ]),
  triggerEventRef: z.string().min(1),
  selfActor: z.number().int().min(0).max(3),
}).strict();

export const LocalMortalRuntimeActionSchema = z.object({
  index: z.number().int().min(0).max(45),
  variant: z.string().min(1).max(32).nullable(),
}).strict();

const MjaiProjectionEventSchema = z.object({
  eventRef: z.string().min(1),
  json: z.string().min(2).max(4096),
  canAct: z.boolean(),
}).strict();

export const LocalMortalCandidateBindingSchema = z.object({
  actionRef: z.string().min(1),
  runtimeAction: LocalMortalRuntimeActionSchema,
  mjaiActionJson: z.string().min(2).max(2048),
}).strict();
export type LocalMortalCandidateBinding = z.infer<typeof LocalMortalCandidateBindingSchema>;

export const LocalMortalInferenceRequestSchema = z.object({
  protocolVersion: z.literal(LOCAL_MORTAL_PROTOCOL_VERSION),
  requestId: z.string().min(1),
  identity: ManagedMortalRuntimeIdentitySchema,
  recordId: z.string().min(1),
  canonicalStreamIdentity: z.string().min(1),
  decision: LocalMortalDecisionIdentitySchema,
  events: z.array(MjaiProjectionEventSchema).min(1).max(4096),
  candidates: z.array(LocalMortalCandidateBindingSchema).min(2).max(46),
  actualActionRef: z.string().min(1),
}).strict();
export type LocalMortalInferenceRequest = z.infer<typeof LocalMortalInferenceRequestSchema>;

export const LocalMortalInferenceSuccessSchema = z.object({
  protocolVersion: z.literal(LOCAL_MORTAL_PROTOCOL_VERSION),
  requestId: z.string().min(1),
  identity: ManagedMortalRuntimeIdentitySchema,
  decision: LocalMortalDecisionIdentitySchema,
  status: z.literal("ok"),
  candidates: z.array(z.object({
    runtimeAction: LocalMortalRuntimeActionSchema,
    qValue: z.number().finite(),
  }).strict()).min(2).max(46),
  preferredRuntimeAction: LocalMortalRuntimeActionSchema,
}).strict();
export type LocalMortalInferenceSuccess = z.infer<typeof LocalMortalInferenceSuccessSchema>;

export const LocalMortalInferenceFailureSchema = z.object({
  protocolVersion: z.literal(LOCAL_MORTAL_PROTOCOL_VERSION),
  requestId: z.string().min(1),
  status: z.literal("error"),
  code: LocalMortalSafeErrorCodeSchema,
}).strict();

export const LocalMortalInferenceResponseSchema = z.discriminatedUnion("status", [
  LocalMortalInferenceSuccessSchema,
  LocalMortalInferenceFailureSchema,
]);
export type LocalMortalInferenceResponse = z.infer<typeof LocalMortalInferenceResponseSchema>;

export function managedLocalMortalEngineVersion(
  identity: ManagedMortalRuntimeIdentity,
): string {
  return [
    "managed-local-mortal/v1",
    identity.runtimeRevision,
    identity.runtimeArtifactSha256,
    identity.checkpointRevision,
    identity.checkpointFileSha256,
  ].join(":");
}
