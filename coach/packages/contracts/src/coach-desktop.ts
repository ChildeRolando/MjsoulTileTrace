import { z } from "zod";
import { ReviewReportSchema } from "./coach.js";

export const COACH_IPC_CHANNELS = Object.freeze({
  configure: "coach:provider:configure",
  status: "coach:provider:status",
  importCredential: "coach:provider:import-credential",
  clearCredential: "coach:provider:clear-credential",
  generate: "coach:report:generate",
});

/** URLs are non-secret endpoint settings; embedded auth/query/fragment is forbidden. */
export const CoachProviderSettingsSchema = z.object({
  baseUrl: z.string().min(1).max(2048).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }),
  modelName: z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
}).strict();
export type CoachProviderSettings = z.infer<typeof CoachProviderSettingsSchema>;
export const CoachProviderStatusSchema = z.object({
  configured: z.boolean(),
  settings: CoachProviderSettingsSchema.nullable(),
}).strict();
export type CoachProviderStatus = z.infer<typeof CoachProviderStatusSchema>;
export const CoachGenerateRequestSchema = z.object({ packageId: z.string().min(1).max(256) }).strict();
// v1's producer emits empty edge payloads. The graph contract deliberately
// leaves them opaque, so the renderer boundary closes that otherwise-open sink.
export const RendererReviewReportSchema = ReviewReportSchema.superRefine((report, context) => {
  for (const edge of report.reasoningOverlay.edges) {
    if (edge.payload === null || typeof edge.payload !== "object" || Array.isArray(edge.payload)
      || Object.keys(edge.payload).length !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "m6d2_provider_unsafe_report" });
    }
  }
});
export const CoachGenerateResultSchema = z.union([
  z.object({ status: z.literal("ready"), report: RendererReviewReportSchema }).strict(),
  z.object({ status: z.literal("unavailable") }).strict(),
]);
export type CoachGenerateResult = z.infer<typeof CoachGenerateResultSchema>;
export interface CoachDesktopApi {
  configure(input: CoachProviderSettings): Promise<CoachProviderStatus>;
  getStatus(): Promise<CoachProviderStatus>;
  importCredential(): Promise<CoachProviderStatus>;
  clearCredential(): Promise<CoachProviderStatus>;
  generate(input: z.infer<typeof CoachGenerateRequestSchema>): Promise<CoachGenerateResult>;
}
