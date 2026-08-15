import { MahjongSoulRecordIdSchema } from "@riichi-coach/contracts";
import { z } from "zod";

// The typed renderer-facing paipu-URL import API. The request carries ONLY
// the share URL — the analysis seat is auto-resolved in the main process
// from the URL's perspective identity joined against the captured record
// metadata. The result crossing IPC is a FIXED safe shape: status (+
// recordId/counts when ready). It never carries record bytes, websocket
// frames, cookies, tokens, account ids, endpoints, perspective ids, raw
// protobuf/audit payloads, or the resolved seat.

export const PAIPU_SHARE_URL_MAX_LENGTH = 512;
export const PAIPU_IMPORT_COUNT_MAX = 1_000_000;

export const PaipuImportResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("analysis_ready"),
    recordId: MahjongSoulRecordIdSchema,
    canonicalEventCount: z.number().int().min(0).max(PAIPU_IMPORT_COUNT_MAX),
    replayDecisionCount: z.number().int().min(0).max(PAIPU_IMPORT_COUNT_MAX),
  }).strict(),
  z.object({ status: z.literal("invalid_url") }).strict(),
  z.object({ status: z.literal("identity_mismatch") }).strict(),
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
  }).strict())
  .returns(z.promise(PaipuImportResultSchema));

export const MahjongSoulPaipuApiSchema = z.object({
  importPaipu: ImportPaipuMethodSchema,
}).strict();

export interface MahjongSoulPaipuApi {
  importPaipu(input: {
    readonly shareUrl: string;
  }): Promise<PaipuImportResult>;
}
