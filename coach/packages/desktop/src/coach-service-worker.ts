import { parentPort, workerData } from "node:worker_threads";
import { CoachProviderConfigSchema } from "@riichi-coach/contracts";
import {
  COACH_WORKER_PROTOCOL_VERSION,
  CoachWorkerDataSchema,
  CoachWorkerInboundMessageSchema,
  parseCoachWorkerMainRequestPayload,
  parseCoachWorkerMainResponsePayload,
  parseCoachWorkerRequestPayload,
  parseCoachWorkerResponsePayload,
  type CoachWorkerMainOperation,
  type CoachWorkerOperation,
} from "./coach-worker-protocol.js";
import { createReviewSessionLabelStore } from "./review-session-labels.js";
import { createCoachService, createPackageReferenceReader } from "./llm-provider/service.js";
import { createReviewSessionRepository } from "./review-session-repository.js";

const unavailable = () => new Error("provider_unavailable");
const MAIN_REQUEST_TIMEOUT_MS = 25_000;
const MAX_ACTIVE_REQUESTS = 16;

type MainPending = {
  operation: CoachWorkerMainOperation;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

async function runWorker(): Promise<void> {
  if (parentPort === null) throw unavailable();
  const port = parentPort;
  const data = CoachWorkerDataSchema.parse(workerData);
  const mainPending = new Map<number, MainPending>();
  const expiredMainRequests = new Set<number>();
  const activeRequests = new Map<number, {
    operation: CoachWorkerOperation;
    payload: unknown;
    task: Promise<void>;
  }>();
  let nextMainId = 1;
  let service: ReturnType<typeof createCoachService> | null = null;
  let repository: ReturnType<typeof createReviewSessionRepository> | null = null;
  let labels: ReturnType<typeof createReviewSessionLabelStore> | null = null;
  let closing = false;

  const mainCall = async (operation: CoachWorkerMainOperation, rawPayload: unknown): Promise<unknown> => {
    const payload = parseCoachWorkerMainRequestPayload(operation, rawPayload);
    if (closing || nextMainId >= Number.MAX_SAFE_INTEGER) throw unavailable();
    const id = nextMainId++;
    return await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        mainPending.delete(id);
        expiredMainRequests.add(id);
        if (expiredMainRequests.size > 256) expiredMainRequests.delete(expiredMainRequests.values().next().value!);
        reject(unavailable());
      }, MAIN_REQUEST_TIMEOUT_MS);
      mainPending.set(id, { operation, resolve, reject, timeout });
      try { port.postMessage({ type: "main-request", id, operation, payload }); }
      catch {
        clearTimeout(timeout);
        mainPending.delete(id);
        reject(unavailable());
      }
    });
  };

  const respond = (id: number, ok: true, payload: unknown): void => {
    port.postMessage({ type: "response", id, ok, payload });
  };
  const failResponse = (id: number): void => {
    try { port.postMessage({ type: "response", id, ok: false, code: "provider_unavailable" }); }
    catch { /* Host exit/error handling rejects every outstanding call. */ }
  };

  const dispatch = async (operation: CoachWorkerOperation, payload: unknown): Promise<unknown> => {
    if (service === null || labels === null) throw unavailable();
    switch (operation) {
      case "status": return await service.status();
      case "configure": return await service.configure(CoachProviderConfigSchema.parse(payload));
      case "importCredential": return await service.importCredential();
      case "clearCredential": return await service.clearCredential();
      case "openReview": {
        const snapshot = await service.openReview((payload as { packageId: string }).packageId);
        setImmediate(() => {
          try { repository?.reclaimUnusedStorage(); } catch { /* Optional background compaction never changes the review result. */ }
        });
        return snapshot;
      }
      case "generateReview": {
        const request = payload as { packageId: string; operationId: string; decisionId?: string };
        return await service.generateReview(request.packageId, request.operationId, request.decisionId);
      }
      case "cancelGeneration":
        service.cancelGeneration((payload as { operationId: string }).operationId);
        return null;
      case "getReviewDetail": {
        const request = payload as { packageId: string; decisionId: string; activeReportRefId: string | null };
        return await service.getReviewDetail(request.packageId, request.decisionId, request.activeReportRefId);
      }
      case "leaveReview":
        service.leaveReview((payload as { packageId: string }).packageId);
        return null;
      case "listReviewSessions": return await service.listReviewSessions?.() ?? [];
      case "rememberCatalog":
        labels.rememberCatalog(payload as Parameters<typeof labels.rememberCatalog>[0]);
        return null;
      case "ping": return "pong";
    }
  };

  const processRequest = async (id: number, operation: CoachWorkerOperation, rawPayload: unknown): Promise<void> => {
    try {
      const payload = parseCoachWorkerRequestPayload(operation, rawPayload);
      const result = await dispatch(operation, payload);
      respond(id, true, parseCoachWorkerResponsePayload(operation, result));
    } catch {
      failResponse(id);
    }
  };

  const close = async (id: number): Promise<void> => {
    if (closing) { failResponse(id); return; }
    closing = true;
    for (const request of activeRequests.values()) {
      if (request.operation === "generateReview") {
        try { service?.cancelGeneration((request.payload as { operationId: string }).operationId); }
        catch { /* The durable repository still closes after outstanding calls settle. */ }
      }
    }
    await Promise.allSettled([...activeRequests.values()].map((request) => request.task));
    for (const item of mainPending.values()) {
      clearTimeout(item.timeout);
      item.reject(unavailable());
    }
    mainPending.clear();
    try { labels?.close(); } finally { labels = null; }
    try { repository?.close(); } finally { repository = null; }
    port.postMessage({ type: "closed", id });
    port.close();
  };

  port.on("message", (raw: unknown) => {
    const parsed = CoachWorkerInboundMessageSchema.safeParse(raw);
    if (!parsed.success) {
      try { port.postMessage({ type: "fatal", code: "provider_unavailable" }); } catch { /* Host already exiting. */ }
      closing = true;
      void closeResources();
      return;
    }
    const message = parsed.data;
    if (message.type === "main-response") {
      const pending = mainPending.get(message.id);
      if (pending === undefined) {
        if (expiredMainRequests.delete(message.id)) return;
        try { port.postMessage({ type: "fatal", code: "provider_unavailable" }); } catch { /* Host already exiting. */ }
        return;
      }
      clearTimeout(pending.timeout);
      mainPending.delete(message.id);
      if (!message.ok) { pending.reject(unavailable()); return; }
      try { pending.resolve(parseCoachWorkerMainResponsePayload(pending.operation, message.payload)); }
      catch { pending.reject(unavailable()); }
      return;
    }
    if (message.type === "close") { void close(message.id); return; }
    if (message.type !== "request" || closing) { failResponse(message.id); return; }
    if (activeRequests.size >= MAX_ACTIVE_REQUESTS) { failResponse(message.id); return; }
    if (activeRequests.has(message.id)) {
      try { port.postMessage({ type: "fatal", code: "provider_unavailable" }); } catch { /* Host already exiting. */ }
      return;
    }
    const task = processRequest(message.id, message.operation, message.payload)
      .finally(() => { activeRequests.delete(message.id); });
    activeRequests.set(message.id, { operation: message.operation, payload: message.payload, task });
  });

  async function closeResources(): Promise<void> {
    for (const item of mainPending.values()) {
      clearTimeout(item.timeout);
      item.reject(unavailable());
    }
    mainPending.clear();
    try { labels?.close(); } catch { /* Startup cleanup only. */ }
    labels = null;
    try { repository?.close(); } catch { /* Startup cleanup only. */ }
    repository = null;
    try { port.close(); } catch { /* Port may already be closed. */ }
  }

  try {
    repository = createReviewSessionRepository({ root: data.reviewRoot });
    labels = createReviewSessionLabelStore({ root: data.reviewRoot });
    labels.rememberCatalog(data.initialCatalog);
    let providerFactory: Parameters<typeof createCoachService>[0]["providerFactory"];
    if (data.goldenTestMode && process.env.RIICHI_MVP_GOLDEN_TEST === "1") {
      const fixture = await import("./electron-mvp-golden-fixture.js");
      providerFactory = fixture.createGoldenProvider;
    }
    const credentials = {
      readKey: async () => await mainCall("credentials.readKey", null) as string | null,
      importCredential: async () => { await mainCall("credentials.importCredential", null); },
      clear: async () => { await mainCall("credentials.clear", null); },
    };
    service = createCoachService({
      credentials,
      fetchImpl: globalThis.fetch,
      readPackage: createPackageReferenceReader(data.userData),
      reviewRepository: repository,
      recordLabels: labels,
      initialSettings: data.initialSettings,
      saveSettings: async (settings) => { await mainCall("settings.save", settings); },
      ...(providerFactory === undefined ? {} : {
        providerFactory,
        clock: () => "2026-10-01T00:00:00.000Z",
      }),
    });
    port.postMessage({ type: "ready", protocolVersion: COACH_WORKER_PROTOCOL_VERSION });
  } catch {
    try { port.postMessage({ type: "fatal", code: "provider_unavailable" }); } catch { /* Host already exiting. */ }
    await closeResources();
  }
}

void runWorker().catch(() => {
  try { parentPort?.postMessage({ type: "fatal", code: "provider_unavailable" }); } catch { /* Host already exiting. */ }
  parentPort?.close();
});
