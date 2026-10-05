import { Worker } from "node:worker_threads";
import { z } from "zod";
import { CoachProviderConfigSchema } from "@riichi-coach/contracts";
import {
  COACH_WORKER_PROTOCOL_VERSION,
  CoachWorkerDataSchema,
  CoachWorkerInboundMessageSchema,
  CoachWorkerOutboundMessageSchema,
  parseCoachWorkerMainRequestPayload,
  parseCoachWorkerMainResponsePayload,
  parseCoachWorkerRequestPayload,
  parseCoachWorkerResponsePayload,
  type CoachWorkerData,
  type CoachWorkerMainOperation,
  type CoachWorkerOperation,
} from "./coach-worker-protocol.js";

const READY_TIMEOUT_MS = 15_000;
const MAIN_REQUEST_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 5_000;
const MAX_OUTSTANDING_REQUESTS = 16;
const MAX_OUTSTANDING_GENERATIONS = 2;
const REQUEST_TIMEOUT_MS: Readonly<Record<CoachWorkerOperation, number>> = Object.freeze({
  status: 180_000,
  configure: 180_000,
  importCredential: 180_000,
  clearCredential: 180_000,
  openReview: 600_000,
  generateReview: 600_000,
  cancelGeneration: 180_000,
  getReviewDetail: 180_000,
  leaveReview: 180_000,
  listReviewSessions: 180_000,
  rememberCatalog: 180_000,
  ping: 180_000,
});
const unavailable = () => new Error("provider_unavailable");

export type CoachWorkerTimer = Readonly<{
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}>;

export type CoachWorkerMainBridge = Readonly<{
  readCredentialKey(): Promise<string | null>;
  importCredential(): Promise<void>;
  clearCredential(): Promise<void>;
  saveSettings(settings: z.infer<typeof CoachProviderConfigSchema>): Promise<void>;
}>;

export type CoachWorkerHostOptions = Readonly<{
  workerData: Omit<CoachWorkerData, "protocolVersion">;
  mainBridge: CoachWorkerMainBridge;
  timer?: CoachWorkerTimer;
  /** Private test seam for exercising worker protocol failures. Electron never derives this from IPC. */
  workerEntry?: URL | string;
}>;

type PendingRequest = {
  operation: CoachWorkerOperation;
  deadlineAt: number;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: unknown;
};

export type CoachWorkerHost = Readonly<{
  readonly ready: Promise<void>;
  request(operation: CoachWorkerOperation, payload: unknown): Promise<unknown>;
  close(): Promise<void>;
}>;

export function createCoachWorkerHost(input: CoachWorkerHostOptions): CoachWorkerHost {
  const workerData = CoachWorkerDataSchema.parse({
    ...input.workerData,
    protocolVersion: COACH_WORKER_PROTOCOL_VERSION,
  });
  const worker = new Worker(input.workerEntry ?? new URL("./coach-service-worker.js", import.meta.url), {
    workerData,
  });
  let readySettled = false;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let nextId = 1;
  let failed = false;
  let stopping = false;
  let outstandingRequests = 0;
  let outstandingGenerations = 0;
  let closeId: number | null = null;
  let closeResolve: (() => void) | null = null;
  let closeReject: ((error: Error) => void) | null = null;
  let closeTimer: unknown = null;
  const pending = new Map<number, PendingRequest>();
  const activeMainRequests = new Set<number>();
  const timer: CoachWorkerTimer = input.timer ?? {
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    now: () => performance.now(),
  };
  let readyTimer: unknown = timer.setTimeout(() => fail(unavailable()), READY_TIMEOUT_MS);

  const settleReady = (error?: Error): void => {
    if (readySettled) return;
    readySettled = true;
    if (readyTimer !== null) timer.clearTimeout(readyTimer);
    readyTimer = null;
    if (error === undefined) readyResolve();
    else readyReject(error);
  };

  const fail = (error: Error, terminate = true): void => {
    if (failed) return;
    failed = true;
    settleReady(error);
    for (const item of pending.values()) {
      timer.clearTimeout(item.timeout);
      item.reject(error);
    }
    pending.clear();
    activeMainRequests.clear();
    if (closeTimer !== null) timer.clearTimeout(closeTimer);
    closeTimer = null;
    closeReject?.(error);
    closeResolve = null;
    closeReject = null;
    if (terminate) void worker.terminate().catch(() => undefined);
  };

  const allocateId = (): number => {
    if (nextId >= Number.MAX_SAFE_INTEGER) throw unavailable();
    return nextId++;
  };

  const postMainResponse = (
    id: number,
    operation: CoachWorkerMainOperation,
    callback: () => Promise<unknown>,
  ): void => {
    if (activeMainRequests.has(id)) { fail(unavailable()); return; }
    activeMainRequests.add(id);
    const timeout = timer.setTimeout(() => {
      activeMainRequests.delete(id);
      try { worker.postMessage({ type: "main-response", id, ok: false, code: "provider_unavailable" }); }
      catch { fail(unavailable()); }
    }, MAIN_REQUEST_TIMEOUT_MS);
    void (async () => {
      try {
        const result = await callback();
        const payload = parseCoachWorkerMainResponsePayload(operation, result);
        timer.clearTimeout(timeout);
        if (!activeMainRequests.delete(id) || failed) return;
        worker.postMessage({ type: "main-response", id, ok: true, payload });
      } catch {
        timer.clearTimeout(timeout);
        if (!activeMainRequests.delete(id) || failed) return;
        try { worker.postMessage({ type: "main-response", id, ok: false, code: "provider_unavailable" }); }
        catch { fail(unavailable()); }
      }
    })();
  };

  worker.on("message", (raw: unknown) => {
    const parsed = CoachWorkerOutboundMessageSchema.safeParse(raw);
    if (!parsed.success) { fail(unavailable()); return; }
    const message = parsed.data;
    if (message.type === "ready") {
      if (readySettled || stopping) { fail(unavailable()); return; }
      settleReady();
      return;
    }
    if (!readySettled || failed) { fail(unavailable()); return; }
    if (message.type === "fatal") { fail(unavailable()); return; }
    if (message.type === "main-request") {
      let payload: unknown;
      try { payload = parseCoachWorkerMainRequestPayload(message.operation, message.payload); }
      catch { fail(unavailable()); return; }
      const callbacks: Record<CoachWorkerMainOperation, () => Promise<unknown>> = {
        "credentials.readKey": () => input.mainBridge.readCredentialKey(),
        "credentials.importCredential": async () => { await input.mainBridge.importCredential(); return null; },
        "credentials.clear": async () => { await input.mainBridge.clearCredential(); return null; },
        "settings.save": async () => {
          await input.mainBridge.saveSettings(CoachProviderConfigSchema.parse(payload));
          return null;
        },
      };
      postMainResponse(message.id, message.operation, callbacks[message.operation]);
      return;
    }
    if (message.type === "closed") {
      if (!stopping || closeId !== message.id) { fail(unavailable()); return; }
      if (closeTimer !== null) timer.clearTimeout(closeTimer);
      closeTimer = null;
      closeResolve?.();
      closeResolve = null;
      closeReject = null;
      return;
    }
    if (message.type === "response") {
      const request = pending.get(message.id);
      if (request === undefined) { fail(unavailable()); return; }
      timer.clearTimeout(request.timeout);
      pending.delete(message.id);
      if (!message.ok) { request.reject(unavailable()); return; }
      try {
        request.resolve(parseCoachWorkerResponsePayload(request.operation, message.payload));
      } catch {
        request.reject(unavailable());
        fail(unavailable());
      }
    }
  });
  worker.on("messageerror", () => fail(unavailable()));
  worker.on("error", () => fail(unavailable()));
  worker.on("exit", (code) => {
    if (stopping && closeResolve === null && closeReject === null) {
      // The worker completed its close handshake before exiting.
      failed = true;
      return;
    }
    fail(unavailable(), false);
    if (code === 0 && !stopping) return;
  });

  return Object.freeze({
    ready,
    async request(operation, rawPayload) {
      const payload = parseCoachWorkerRequestPayload(operation, rawPayload);
      if (failed || stopping || outstandingRequests >= MAX_OUTSTANDING_REQUESTS
        || (operation === "generateReview" && outstandingGenerations >= MAX_OUTSTANDING_GENERATIONS)) throw unavailable();
      outstandingRequests += 1;
      if (operation === "generateReview") outstandingGenerations += 1;
      try {
        await ready;
        if (failed || stopping) throw unavailable();
        const id = allocateId();
        return await new Promise<unknown>((resolve, reject) => {
          const now = timer.now();
          const activeLongOperationDeadline = [...pending.values()]
            .filter((request) => request.operation === "openReview" || request.operation === "generateReview")
            .reduce((deadline, request) => Math.max(deadline, request.deadlineAt), 0);
          const deadlineAt = Math.max(now + REQUEST_TIMEOUT_MS[operation], activeLongOperationDeadline);
          const timeout = timer.setTimeout(() => {
            pending.delete(id);
            const error = unavailable();
            reject(error);
            fail(error);
          }, Math.max(0, deadlineAt - now));
          pending.set(id, { operation, deadlineAt, resolve, reject, timeout });
          try { worker.postMessage({ type: "request", id, operation, payload }); }
          catch { fail(unavailable()); }
        });
      } finally {
        outstandingRequests -= 1;
        if (operation === "generateReview") outstandingGenerations -= 1;
      }
    },
    async close() {
      if (stopping) {
        if (closeResolve === null && closeReject === null) return;
        return await new Promise<void>((resolve, reject) => {
          const previousResolve = closeResolve;
          const previousReject = closeReject;
          closeResolve = () => { previousResolve?.(); resolve(); };
          closeReject = (error) => { previousReject?.(error); reject(error); };
        });
      }
      await ready;
      if (failed) return;
      stopping = true;
      const id = allocateId();
      closeId = id;
      return await new Promise<void>((resolve, reject) => {
        closeResolve = resolve;
        closeReject = reject;
        closeTimer = timer.setTimeout(() => fail(unavailable()), CLOSE_TIMEOUT_MS);
        try { worker.postMessage({ type: "close", id }); }
        catch { fail(unavailable()); }
      });
    },
  });
}
