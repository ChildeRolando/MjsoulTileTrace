import {
  AnalyzableRecordSummarySchema,
  type AnalyzableRecordSummary,
} from "@riichi-coach/contracts";
import { z } from "zod";

// Operational status only: no account, record payload, credentials or model facts.
const ProgressFields = z.object({
  stage: z.enum(["idle", "fetching", "replaying", "rules", "scoring", "facts", "packaging", "saving", "complete", "failed"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
}).strict();
export const RecordAnalysisProgressSchema = ProgressFields.refine(value => value.total === null || value.completed <= value.total);
export type RecordAnalysisProgress = z.infer<typeof RecordAnalysisProgressSchema>;

export const RECORD_ANALYSIS_STAGES = ["fetching", "replaying", "rules", "scoring", "facts", "packaging", "saving"] as const;
export const RecordAnalysisStepSchema = z.object({
  stage: z.enum(RECORD_ANALYSIS_STAGES),
  status: z.enum(["waiting", "running", "complete", "skipped", "failed"]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative().nullable(),
  elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.total === null || value.completed <= value.total);
export const RecordAnalysisSnapshotSchema = ProgressFields.extend({
  steps: z.array(RecordAnalysisStepSchema).length(RECORD_ANALYSIS_STAGES.length),
  elapsedMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  estimatedTotalMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  remainingMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  estimateSource: z.enum(["learning", "history", "current_rate"]),
}).strict().superRefine((value, context) => {
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.total !== null && value.completed > value.total) invalid("Invalid current count");
  if (value.steps.some((step, index) => step.stage !== RECORD_ANALYSIS_STAGES[index])) invalid("Invalid phase order");
  const running = value.steps.filter(step => step.status === "running");
  const current = value.steps.find(step => step.stage === value.stage);
  if (current !== undefined && (running.length !== 1 || current.status !== "running"
    || current.completed !== value.completed || current.total !== value.total)) invalid("Invalid active phase");
  if (current === undefined && running.length !== 0) invalid("Terminal phase still running");
  if ((value.estimatedTotalMs === null) !== (value.remainingMs === null)) invalid("Incomplete estimate");
  if (value.estimatedTotalMs !== null && value.estimatedTotalMs !== value.elapsedMs + value.remainingMs!) invalid("Estimate does not reconcile");
  if (value.estimateSource === "learning" && value.estimatedTotalMs !== null) invalid("Missing estimate basis");
});
export type RecordAnalysisSnapshot = z.infer<typeof RecordAnalysisSnapshotSchema>;

export function createIdleRecordAnalysisSnapshot(): RecordAnalysisSnapshot {
  return {
    stage: "idle", completed: 0, total: null, elapsedMs: 0,
    estimatedTotalMs: null, remainingMs: null, estimateSource: "learning",
    steps: RECORD_ANALYSIS_STAGES.map(stage => ({ stage, status: "waiting", completed: 0, total: null, elapsedMs: 0 })),
  };
}

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
  getRecordAnalysisProgress: z.function().args().returns(z.promise(RecordAnalysisSnapshotSchema)),
  clearSourceCache: ClearSourceCacheMethodSchema,
}).strict();

export interface MahjongSoulCatalogApi {
  syncAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  listAnalyzableRecords(): Promise<AnalyzableRecordSummary[]>;
  startRecordAnalysis(recordId: string): Promise<AccountReviewResult>;
  getRecordAnalysisProgress(): Promise<RecordAnalysisSnapshot>;
  clearSourceCache(): Promise<Readonly<{ status: "cleared"; pendingMaterials: number }>>;
}

export function parseAnalyzableRecordSummaries(
  value: unknown,
): AnalyzableRecordSummary[] {
  const parsed = z.array(AnalyzableRecordSummarySchema).parse(value);
  return parsed.map((entry) => Object.freeze(entry));
}
