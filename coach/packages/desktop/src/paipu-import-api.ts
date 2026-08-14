import { MahjongSoulRecordIdSchema } from "@riichi-coach/contracts";
import { z } from "zod";

// The typed renderer-facing paipu-URL import API. The result crossing IPC is
// a FIXED safe shape: status (+ recordId/selfActor/counts when ready). It
// never carries record bytes, websocket frames, cookies, tokens, account
// ids, endpoints, or raw protobuf/audit payloads.

export const PAIPU_SHARE_URL_MAX_LENGTH = 512;
export const PAIPU_IMPORT_COUNT_MAX = 1_000_000;

export const PaipuImportResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("analysis_ready"),
    recordId: MahjongSoulRecordIdSchema,
    selfActor: z.number().int().min(0).max(3),
    canonicalEventCount: z.number().int().min(0).max(PAIPU_IMPORT_COUNT_MAX),
    replayDecisionCount: z.number().int().min(0).max(PAIPU_IMPORT_COUNT_MAX),
  }).strict(),
  z.object({ status: z.literal("invalid_url") }).strict(),
  z.object({ status: z.literal("invalid_self_actor") }).strict(),
  z.object({ status: z.literal("no_capture") }).strict(),
  z.object({ status: z.literal("unsupported_semantics") }).strict(),
  z.object({ status: z.literal("analysis_failed") }).strict(),
]);
export type PaipuImportResult = z.infer<typeof PaipuImportResultSchema>;

export function parsePaipuImportResult(value: unknown): PaipuImportResult {
  const parsed = PaipuImportResultSchema.parse(value);
  return Object.freeze({ ...parsed }) as PaipuImportResult;
}

const ImportPaipuMethodSchema = z.function()
  .args(z.object({
    shareUrl: z.string().min(1).max(PAIPU_SHARE_URL_MAX_LENGTH),
    selfActor: z.number().int().min(0).max(3),
  }).strict())
  .returns(z.promise(PaipuImportResultSchema));

export const MahjongSoulPaipuApiSchema = z.object({
  importPaipu: ImportPaipuMethodSchema,
}).strict();

export interface MahjongSoulPaipuApi {
  importPaipu(input: {
    readonly shareUrl: string;
    readonly selfActor: 0 | 1 | 2 | 3;
  }): Promise<PaipuImportResult>;
}
