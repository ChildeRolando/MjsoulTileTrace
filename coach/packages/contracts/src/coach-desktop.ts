import { z } from "zod";
import { ReviewReportSchema } from "./coach.js";

/** Public configuration contains no authentication, query, fragment or userinfo. */
export const CoachProviderConfigSchema = z.object({
  baseUrl: z.string().max(2048).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  }),
  modelName: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
}).strict();
export type CoachProviderConfig = z.infer<typeof CoachProviderConfigSchema>;
export const CoachProviderStatusSchema = z.object({
  configured: z.boolean(),
  settings: CoachProviderConfigSchema.nullable(),
}).strict();
export type CoachProviderStatus = z.infer<typeof CoachProviderStatusSchema>;
export const CoachReportRequestSchema = z.object({ packageId: z.string().min(1).max(200) }).strict();
export type CoachReportRequest = z.infer<typeof CoachReportRequestSchema>;
export const COACH_IPC_CHANNELS = Object.freeze({
  configure: "coach:provider:configure",
  status: "coach:provider:status",
  importCredential: "coach:provider:import-credential",
  clearCredential: "coach:provider:clear-credential",
  generate: "coach:report:generate",
} as const);
export const CoachReportResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), report: ReviewReportSchema }).strict(),
  z.object({ status: z.literal("package_unavailable") }).strict(),
]);
export type CoachReportResult = z.infer<typeof CoachReportResultSchema>;
export interface CoachDesktopApi {
  configure(input: CoachProviderConfig): Promise<CoachProviderStatus>;
  status(): Promise<CoachProviderStatus>;
  importCredential(): Promise<CoachProviderStatus>;
  clearCredential(): Promise<CoachProviderStatus>;
  generate(input: CoachReportRequest): Promise<CoachReportResult>;
}
