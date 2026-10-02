import {
  AnalyzableRecordSummarySchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";
import { z } from "zod";

export const AccountReviewResultSchema = z.object({
  status: z.literal("review_ready"),
  sessionId: z.string().min(1).max(200),
  packageId: z.string().min(1).max(200),
}).strict();
export type AccountReviewResult = z.infer<typeof AccountReviewResultSchema>;
export const parseAccountReviewResult = (value: unknown): AccountReviewResult =>
  Object.freeze(AccountReviewResultSchema.parse(value));

const CatalogMethodSchema = z.function()
  .args()
  .returns(z.promise(z.array(AnalyzableRecordSummarySchema)));

const StartRecordAnalysisMethodSchema = z.function()
  .args(z.string())
  .returns(z.promise(AccountReviewResultSchema));

export const SourceCacheClearResultSchema = z.object({
  status: z.literal("cleared"),
  pendingMaterials: z.number().int().nonnegative(),
}).strict();

const ClearSourceCacheMethodSchema = z.function()
  .args()
  .returns(z.promise(SourceCacheClearResultSchema));

export const MahjongSoulCatalogApiSchema = z.object({
  syncAnalyzableRecords: CatalogMethodSchema,
  listAnalyzableRecords: CatalogMethodSchema,
  startRecordAnalysis: StartRecordAnalysisMethodSchema,
  clearSourceCache: ClearSourceCacheMethodSchema,
}).strict();

export interface MahjongSoulCatalogApi {
  syncAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  listAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  startRecordAnalysis(recordId: string): Promise<AccountReviewResult>;
  clearSourceCache(): Promise<Readonly<{ status: "cleared"; pendingMaterials: number }>>;
}

export function parseAnalyzableRecordSummaries(
  value: unknown,
): AnalyzableRecordSummary[] {
  const parsed = z.array(AnalyzableRecordSummarySchema).parse(value);
  return parsed.map((entry) => Object.freeze(entry));
}
