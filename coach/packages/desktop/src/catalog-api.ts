import {
  AnalyzableRecordSummarySchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";
import { z } from "zod";

// Operational status only: no account, record payload, credentials or model facts.
export const RecordAnalysisProgressSchema = z.object({
  stage: z.enum(["idle", "fetching", "replaying", "rules", "scoring", "facts", "packaging", "saving", "complete", "failed"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
}).strict().refine(value => value.total === null || value.completed <= value.total);
export type RecordAnalysisProgress = z.infer<typeof RecordAnalysisProgressSchema>;

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
  getRecordAnalysisProgress: z.function().args().returns(z.promise(RecordAnalysisProgressSchema)),
  clearSourceCache: ClearSourceCacheMethodSchema,
}).strict();

export interface MahjongSoulCatalogApi {
  syncAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  listAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  startRecordAnalysis(recordId: string): Promise<AccountReviewResult>;
  getRecordAnalysisProgress(): Promise<RecordAnalysisProgress>;
  clearSourceCache(): Promise<Readonly<{ status: "cleared"; pendingMaterials: number }>>;
}

export function parseAnalyzableRecordSummaries(
  value: unknown,
): AnalyzableRecordSummary[] {
  const parsed = z.array(AnalyzableRecordSummarySchema).parse(value);
  return parsed.map((entry) => Object.freeze(entry));
}
