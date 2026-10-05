import type { AnalyzableRecordSummary } from "@riichi-coach/contracts";
import type { CoachService } from "./llm-provider/service.js";
import type { CoachServiceBoundary } from "./coach-ipc.js";
import type { CoachWorkerHost } from "./coach-worker-host.js";

export type CoachWorkerClient = Omit<CoachServiceBoundary, "listReviewSessions"> & Readonly<{
  listReviewSessions: NonNullable<CoachServiceBoundary["listReviewSessions"]>;
  ready(): Promise<void>;
  rememberCatalog(summaries: readonly AnalyzableRecordSummary[]): Promise<void>;
  ping(): Promise<"pong">;
  close(): Promise<void>;
}>;

export function createCoachWorkerClient(host: CoachWorkerHost): CoachWorkerClient {
  const request = <T>(operation: Parameters<CoachWorkerHost["request"]>[0], payload: unknown): Promise<T> =>
    host.request(operation, payload) as Promise<T>;
  return Object.freeze({
    ready: () => host.ready,
    status: () => request<Awaited<ReturnType<CoachService["status"]>>>("status", null),
    configure: (value: unknown) => request<Awaited<ReturnType<CoachService["configure"]>>>("configure", value),
    importCredential: () => request<Awaited<ReturnType<CoachService["importCredential"]>>>("importCredential", null),
    clearCredential: () => request<Awaited<ReturnType<CoachService["clearCredential"]>>>("clearCredential", null),
    openReview: (packageId: string) => request<Awaited<ReturnType<CoachService["openReview"]>>>("openReview", { packageId }),
    generateReview: (packageId: string, operationId: string, decisionId?: string) => request<Awaited<ReturnType<CoachService["generateReview"]>>>(
      "generateReview", { packageId, operationId, ...(decisionId === undefined ? {} : { decisionId }) },
    ),
    cancelGeneration: async (operationId: string) => { await request<null>("cancelGeneration", { operationId }); },
    getReviewDetail: (packageId: string, decisionId: string, activeReportRefId: string | null) => request<Awaited<ReturnType<CoachService["getReviewDetail"]>>>(
      "getReviewDetail", { packageId, decisionId, activeReportRefId },
    ),
    leaveReview: async (packageId: string) => { await request<null>("leaveReview", { packageId }); },
    listReviewSessions: () => request<Awaited<ReturnType<CoachService["listReviewSessions"]>>>("listReviewSessions", null),
    rememberCatalog: async (summaries: readonly AnalyzableRecordSummary[]) => { await request<null>("rememberCatalog", summaries); },
    ping: () => request<"pong">("ping", null),
    close: () => host.close(),
  });
}
