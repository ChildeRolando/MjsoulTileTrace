import {
  CoachGenerateRequestSchema, CoachProviderSettingsSchema, CoachProviderStatusSchema,
  LlmCoachResultSchema, StructuredAnalysisPackageSchema,
  type CoachDesktopApi, type CoachProviderSettings, type LlmCoachProvider,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  assembleReviewReport, buildCoachRequest, coachRequestOutcomeFromLlmResult,
  projectContextGraph, selectReviewDecisions, validateReviewReport, validateStructuredAnalysisPackage,
} from "@riichi-coach/reasoning";
import type { ProviderCredentialService } from "./credentials.js";
import { createOpenAiCoachProvider } from "./openai.js";

/** COAC-3's narrow composition seam: no session persistence, UI or retry scheduler. */
export function createCoachService(input: {
  credentials: ProviderCredentialService;
  resolvePackage: (packageId: string) => StructuredAnalysisPackage | undefined | Promise<StructuredAnalysisPackage | undefined>;
  provider?: (settings: () => CoachProviderSettings | null) => LlmCoachProvider;
  now?: () => string;
}): CoachDesktopApi {
  let settings: CoachProviderSettings | null = null;
  // A single queue prevents configuration/credential changes halfway through a
  // report (descriptor, request, retry and response belong to the same settings).
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = tail.then(operation); tail = next.catch(() => {}); return next;
  }
  const provider = input.provider?.(() => settings) ?? createOpenAiCoachProvider({ credentials: input.credentials, settings: () => settings });
  const status = async () => CoachProviderStatusSchema.parse({ configured: settings !== null && await input.credentials.isConfigured(), settings });
  return Object.freeze({
    configure: (value: CoachProviderSettings) => exclusive(async () => {
      const parsed = CoachProviderSettingsSchema.safeParse(value);
      if (!parsed.success) throw Error("m6d2_provider_invalid_request");
      const secretInSettings = await input.credentials.withCredential(async (key) => parsed.data.baseUrl.includes(key) || parsed.data.modelName.includes(key));
      if (secretInSettings) throw Error("m6d2_provider_invalid_request");
      settings = parsed.data; return status();
    }),
    getStatus: () => exclusive(status),
    importCredential: () => exclusive(async () => {
      if (!await input.credentials.importCredential()) throw Error("m6d2_provider_storage_unavailable");
      const unsafe = settings && await input.credentials.withCredential(async (key) => settings!.baseUrl.includes(key) || settings!.modelName.includes(key));
      if (unsafe) settings = null;
      return status();
    }),
    clearCredential: () => exclusive(async () => {
      if (!await input.credentials.clear()) throw Error("m6d2_provider_storage_unavailable");
      return status();
    }),
    generate: (value: { packageId: string }) => exclusive(async () => {
      try {
        const { packageId } = CoachGenerateRequestSchema.parse(value);
        const raw = await input.resolvePackage(packageId);
        if (!raw || raw.packageId !== packageId) return { status: "unavailable" as const };
        validateStructuredAnalysisPackage(raw);
        const pkg = StructuredAnalysisPackageSchema.parse(raw);
        const graph = projectContextGraph(pkg);
        const selection = selectReviewDecisions(pkg);
        const request = buildCoachRequest(graph, selection);
        let retries = 0;
        let result = LlmCoachResultSchema.parse({ errorCode: "provider_unavailable" });
        if (request !== null) {
          result = LlmCoachResultSchema.parse(await provider.complete(request));
          if ("errorCode" in result && result.errorCode !== "provider_unavailable") {
            retries = 1;
            result = LlmCoachResultSchema.parse(await provider.complete(request));
          }
        }
        const report = assembleReviewReport({ graph, selection, provider: provider.descriptor(),
          outcome: coachRequestOutcomeFromLlmResult(result, retries), generatedAt: input.now?.() ?? new Date().toISOString() });
        validateReviewReport(report, graph);
        return { status: "ready" as const, report };
      } catch { return { status: "unavailable" as const }; }
    }),
  });
}
