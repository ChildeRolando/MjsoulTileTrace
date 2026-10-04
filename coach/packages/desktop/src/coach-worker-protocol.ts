import { z } from "zod";
import {
  AnalyzableRecordSummarySchema,
  CoachProviderConfigSchema,
  CoachProviderStatusSchema,
  FixedReviewCancelRequestSchema,
  FixedReviewDetailRequestSchema,
  FixedReviewDetailSchema,
  FixedReviewGenerateRequestSchema,
  FixedReviewLeaveRequestSchema,
  FixedReviewOpenRequestSchema,
  FixedReviewOperationResultSchema,
  FixedReviewSnapshotSchema,
  ReviewSessionListSchema,
} from "@riichi-coach/contracts";

export const COACH_WORKER_PROTOCOL_VERSION = 1 as const;

const EmptySchema = z.null();
const CatalogSchema = z.array(AnalyzableRecordSummarySchema).max(500);

export const CoachWorkerRequestPayloadSchemas = {
  status: EmptySchema,
  configure: CoachProviderConfigSchema,
  importCredential: EmptySchema,
  clearCredential: EmptySchema,
  openReview: FixedReviewOpenRequestSchema,
  generateReview: FixedReviewGenerateRequestSchema,
  cancelGeneration: FixedReviewCancelRequestSchema,
  getReviewDetail: FixedReviewDetailRequestSchema,
  leaveReview: FixedReviewLeaveRequestSchema,
  listReviewSessions: EmptySchema,
  rememberCatalog: CatalogSchema,
  ping: EmptySchema,
} as const;

export const CoachWorkerResponsePayloadSchemas = {
  status: CoachProviderStatusSchema,
  configure: CoachProviderStatusSchema,
  importCredential: CoachProviderStatusSchema,
  clearCredential: CoachProviderStatusSchema,
  openReview: FixedReviewSnapshotSchema,
  generateReview: FixedReviewOperationResultSchema,
  cancelGeneration: EmptySchema,
  getReviewDetail: FixedReviewDetailSchema,
  leaveReview: EmptySchema,
  listReviewSessions: ReviewSessionListSchema,
  rememberCatalog: EmptySchema,
  ping: z.literal("pong"),
} as const;

export type CoachWorkerOperation = keyof typeof CoachWorkerRequestPayloadSchemas;

export function parseCoachWorkerRequestPayload(operation: string, payload: unknown): unknown {
  if (!Object.hasOwn(CoachWorkerRequestPayloadSchemas, operation)) throw new Error("provider_unavailable");
  return CoachWorkerRequestPayloadSchemas[operation as CoachWorkerOperation].parse(payload);
}

export function parseCoachWorkerResponsePayload(operation: string, payload: unknown): unknown {
  if (!Object.hasOwn(CoachWorkerResponsePayloadSchemas, operation)) throw new Error("provider_unavailable");
  return CoachWorkerResponsePayloadSchemas[operation as CoachWorkerOperation].parse(payload);
}

export const CoachWorkerDataSchema = z.object({
  protocolVersion: z.literal(COACH_WORKER_PROTOCOL_VERSION),
  userData: z.string().min(1).max(32_768),
  reviewRoot: z.string().min(1).max(32_768),
  initialSettings: CoachProviderConfigSchema,
  initialCatalog: CatalogSchema,
  goldenTestMode: z.boolean(),
}).strict();

export const CoachWorkerBootstrapSchema = z.object({
  type: z.literal("ready"),
  protocolVersion: z.literal(COACH_WORKER_PROTOCOL_VERSION),
}).strict();

export const CoachWorkerOperationSchema = z.enum(Object.keys(CoachWorkerRequestPayloadSchemas) as [CoachWorkerOperation, ...CoachWorkerOperation[]]);

const MessageIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ProviderUnavailableSchema = z.literal("provider_unavailable");

export const CoachWorkerInboundMessageSchema = z.union([
  z.object({ type: z.literal("request"), id: MessageIdSchema, operation: CoachWorkerOperationSchema, payload: z.unknown() }).strict(),
  z.object({ type: z.literal("main-response"), id: MessageIdSchema, ok: z.literal(true), payload: z.unknown() }).strict(),
  z.object({ type: z.literal("main-response"), id: MessageIdSchema, ok: z.literal(false), code: ProviderUnavailableSchema }).strict(),
  z.object({ type: z.literal("close"), id: MessageIdSchema }).strict(),
]);

export const CoachWorkerOutboundMessageSchema = z.union([
  CoachWorkerBootstrapSchema,
  z.object({ type: z.literal("response"), id: MessageIdSchema, ok: z.literal(true), payload: z.unknown() }).strict(),
  z.object({ type: z.literal("response"), id: MessageIdSchema, ok: z.literal(false), code: ProviderUnavailableSchema }).strict(),
  z.object({
    type: z.literal("main-request"), id: MessageIdSchema,
    operation: z.enum(["credentials.readKey", "credentials.importCredential", "credentials.clear", "settings.save"]),
    payload: z.unknown(),
  }).strict(),
  z.object({ type: z.literal("fatal"), code: ProviderUnavailableSchema }).strict(),
  z.object({ type: z.literal("closed"), id: MessageIdSchema }).strict(),
]);

export const CoachWorkerMainRequestPayloadSchemas = {
  "credentials.readKey": EmptySchema,
  "credentials.importCredential": EmptySchema,
  "credentials.clear": EmptySchema,
  "settings.save": CoachProviderConfigSchema,
} as const;

export const CoachWorkerMainResponsePayloadSchemas = {
  "credentials.readKey": z.string().max(8192).nullable(),
  "credentials.importCredential": EmptySchema,
  "credentials.clear": EmptySchema,
  "settings.save": EmptySchema,
} as const;

export type CoachWorkerMainOperation = keyof typeof CoachWorkerMainRequestPayloadSchemas;

export function parseCoachWorkerMainRequestPayload(operation: string, payload: unknown): unknown {
  if (!Object.hasOwn(CoachWorkerMainRequestPayloadSchemas, operation)) throw new Error("provider_unavailable");
  return CoachWorkerMainRequestPayloadSchemas[operation as CoachWorkerMainOperation].parse(payload);
}

export function parseCoachWorkerMainResponsePayload(operation: string, payload: unknown): unknown {
  if (!Object.hasOwn(CoachWorkerMainResponsePayloadSchemas, operation)) throw new Error("provider_unavailable");
  return CoachWorkerMainResponsePayloadSchemas[operation as CoachWorkerMainOperation].parse(payload);
}

export type CoachWorkerData = z.infer<typeof CoachWorkerDataSchema>;
