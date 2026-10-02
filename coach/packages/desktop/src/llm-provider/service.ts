import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CoachProviderConfigSchema, CoachProviderStatusSchema, CoachReportRequestSchema, StructuredAnalysisPackageSchema,
  type CoachProviderConfig, type CoachReportResult,
  type ReviewSelectionResult, type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import type { ProviderCredentials } from "./credentials.js";
import { createOpenAiCoachProvider } from "./openai-compatible.js";
import { createFixedReviewController } from "../fixed-review-controller.js";
import type { ReviewSessionRepository } from "../review-session-repository.js";

/** Main-only read-back adapter. A renderer supplies identity, never a file path.
 * Package production/catalog UI remain upstream/M7 work; missing references fail closed. */
export function createPackageReferenceReader(userData: string) {
  return async (packageId: string): Promise<unknown> => {
    const name = createHash("sha256").update(packageId).digest("hex");
    return JSON.parse(await readFile(join(userData, "analysis-packages", `${name}.json`), "utf8"));
  };
}

export function createCoachService(input: {
  credentials: ProviderCredentials;
  fetchImpl: typeof fetch;
  readPackage: (packageId: string) => Promise<unknown>;
  clock?: () => string;
  reviewRepository?: ReviewSessionRepository;
}) {
  let settings: CoachProviderConfig | null = null;
  // A credential mutation drains the active generation before returning. No
  // old-key retry or plaintext holder can outlive a completed clear/replace.
  let queue: Promise<unknown> = Promise.resolve();
  const queuedGenerations = new Map<string, { packageId: string; cancelled: boolean }>();
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation); queue = result.catch(() => undefined); return result;
  };
  const status = async () => CoachProviderStatusSchema.parse({
    configured: settings !== null && (await input.credentials.readKey()) !== null,
    settings,
  });
  const generateArtifact = async (pkg: StructuredAnalysisPackage, selection: ReviewSelectionResult) => {
    const configuredSettings = settings;
    const graph = projectContextGraph(pkg);
    const provider = createOpenAiCoachProvider({ settings: configuredSettings, credentials: input.credentials, fetchImpl: input.fetchImpl });
    return generateReviewReport(graph, selection, provider, input.clock?.());
  };
  const reviewController = createFixedReviewController({
    readPackage: input.readPackage,
    generateReport: generateArtifact,
    ...(input.reviewRepository === undefined ? {} : { repository: input.reviewRepository }),
  });
  return Object.freeze({
    status,
    configure: (value: unknown) => exclusive(async () => {
      try { settings = CoachProviderConfigSchema.parse(value); return await status(); }
      catch { throw new Error("provider_unavailable"); }
    }),
    importCredential: () => exclusive(async () => { await input.credentials.importCredential(); return status(); }),
    clearCredential: () => exclusive(async () => { await input.credentials.clear(); return status(); }),
    generate: (value: unknown): Promise<CoachReportResult> => exclusive(async () => {
      try {
        const { packageId } = CoachReportRequestSchema.parse(value);
        const raw = await input.readPackage(packageId);
        validateStructuredAnalysisPackage(raw);
        const pkg = StructuredAnalysisPackageSchema.parse(raw);
        if (pkg.packageId !== packageId) return { status: "package_unavailable" };
        const selection = selectReviewDecisions(pkg);
        const report = await generateArtifact(pkg, selection);
        return { status: "ready", report };
      } catch { return { status: "package_unavailable" }; }
    }),
    openReview: (packageId: string) => reviewController.openReview(packageId),
    generateReview: (packageId: string, operationId: string) => {
      if (queuedGenerations.has(operationId)) return Promise.resolve({ status: "failed" as const, code: "generation_failed" as const });
      const token = { packageId, cancelled: false };
      queuedGenerations.set(operationId, token);
      return exclusive(async () => {
        try {
          if (token.cancelled) return { status: "failed" as const, code: "operation_cancelled" as const };
          return await reviewController.generateReview(packageId, operationId);
        } finally {
          queuedGenerations.delete(operationId);
        }
      });
    },
    cancelGeneration: (operationId: string) => {
      const token = queuedGenerations.get(operationId);
      if (token !== undefined) token.cancelled = true;
      reviewController.cancelGeneration(operationId);
    },
    getReviewDetail: (packageId: string, decisionId: string, activeReportRefId: string | null) =>
      reviewController.getReviewDetail(packageId, decisionId, activeReportRefId),
    leaveReview: (packageId: string) => {
      for (const token of queuedGenerations.values()) if (token.packageId === packageId) token.cancelled = true;
      reviewController.leaveReview(packageId);
    },
    listReviewSessions: () => input.reviewRepository?.listSessions() ?? [],
  });
}
export type CoachService = ReturnType<typeof createCoachService>;
