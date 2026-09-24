import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { COACH_IPC_CHANNELS } from "@riichi-coach/contracts";
import { registerCoachIpc } from "../src/coach-ipc.js";
import { createCoachPreloadApi } from "../src/session-api.js";
import type { CoachService } from "../src/llm-provider/service.js";
import { createCoachService } from "../src/llm-provider/service.js";

const packageFixture = JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8"));

const settings = { baseUrl: "https://llm.example/v1", modelName: "fixture" };
const snapshot = {
  schemaVersion: "fixed-review-view/v1" as const, packageId: "package-ref", analysisStatus: "complete" as const,
  outcomeCounts: { analysis_ready: 0, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 },
  selection: { policyVersion: "deterministic-review-selector/v1" as const, selectedCount: 0, items: [] },
  activeReportRefId: null, activeReportStatus: "not_generated" as const,
  explanationCounts: { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 },
};
function fixture() {
  const safe = { configured: true, settings };
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const service: CoachService = {
    status: vi.fn(async () => safe), configure: vi.fn(async () => safe),
    importCredential: vi.fn(async () => safe), clearCredential: vi.fn(async () => ({ configured: false, settings })),
    generate: vi.fn(async () => ({ status: "package_unavailable" as const })),
    openReview: vi.fn(async () => snapshot),
    generateReview: vi.fn(async () => ({ status: "ready" as const, snapshot })),
    cancelGeneration: vi.fn(),
    getReviewDetail: vi.fn(() => { throw new Error("review_unavailable"); }),
    leaveReview: vi.fn(),
    listReviewSessions: vi.fn(() => []),
  };
  const registration = registerCoachIpc({
    trustedSenderId: 7, service,
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); }, removeHandler: channel => { handlers.delete(channel); } },
  });
  const frame = {};
  const event = { sender: { id: 7, mainFrame: frame }, senderFrame: frame };
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => handlers.get(channel)!(event, ...args));
  return { service, registration, handlers, invoke, event, api: createCoachPreloadApi({ invoke }) };
}
describe("coach narrow IPC and preload", () => {
  it("exposes only settings/status, payload-free import/clear, and package-reference generation", async () => {
    const f = fixture();
    expect([...f.handlers.keys()].sort()).toEqual(Object.values(COACH_IPC_CHANNELS).sort());
    expect(Object.keys(f.api).sort()).toEqual(["cancelGeneration", "clearCredential", "configure", "generateReview", "getReviewDetail", "importCredential", "leaveReview", "listReviewSessions", "openReview", "status"]);
    expect(await f.api.configure(settings)).toEqual({ configured: true, settings });
    await f.api.status(); await f.api.importCredential();
    expect(await f.api.clearCredential()).toEqual({ configured: false, settings });
    expect(await f.api.openReview({ packageId: "package-ref" })).toEqual(snapshot);
    expect(await f.api.generateReview({ packageId: "package-ref", operationId: "op-1" })).toEqual({ status: "ready", snapshot });
    expect(f.invoke.mock.calls).toEqual([
      [COACH_IPC_CHANNELS.configure, settings], [COACH_IPC_CHANNELS.status],
      [COACH_IPC_CHANNELS.importCredential], [COACH_IPC_CHANNELS.clearCredential],
      [COACH_IPC_CHANNELS.openReview, { packageId: "package-ref" }],
      [COACH_IPC_CHANNELS.generate, { packageId: "package-ref", operationId: "op-1" }],
    ]);
    f.registration.dispose(); expect(f.handlers.size).toBe(0);
  });
  it("rejects key-bearing envelopes before IPC and rejects direct IPC attempts", async () => {
    const f = fixture();
    const malicious = { ...settings, apiKey: "SECRET" };
    await expect(f.api.configure(malicious)).rejects.toThrow(/^provider_unavailable$/);
    await expect((f.api.importCredential as (...args: unknown[]) => Promise<unknown>)("SECRET")).rejects.toThrow(/^provider_unavailable$/);
    await expect(f.api.generateReview({ packageId: "p", operationId: "op", prompt: "RAW_PROMPT" } as never)).rejects.toThrow(/^provider_unavailable$/);
    expect(f.invoke).not.toHaveBeenCalled();
    await expect(f.handlers.get(COACH_IPC_CHANNELS.configure)!(f.event, malicious)).rejects.toThrow(/^provider_unavailable$/);
    for (const channel of [COACH_IPC_CHANNELS.status, COACH_IPC_CHANNELS.importCredential, COACH_IPC_CHANNELS.clearCredential]) {
      await expect(f.handlers.get(channel)!(f.event, "SECRET")).rejects.toThrow(/^provider_unavailable$/);
    }
    expect(f.service.configure).not.toHaveBeenCalled(); expect(f.service.importCredential).not.toHaveBeenCalled();
  });
  it("rejects foreign senders and subframes before any privileged service call", async () => {
    const f = fixture();
    for (const event of [null, { sender: { id: 8 } }, { ...f.event, senderFrame: {} }]) {
      await expect(f.handlers.get(COACH_IPC_CHANNELS.importCredential)!(event)).rejects.toThrow(/^provider_unavailable$/);
    }
    expect(f.service.importCredential).not.toHaveBeenCalled();
  });
  it("reparses output at BOTH boundaries and replaces hostile errors with a fixed code", async () => {
    const f = fixture();
    vi.mocked(f.service.status).mockResolvedValue({ configured: true, settings, apiKey: "SECRET" } as never);
    await expect(f.api.status()).rejects.toThrow(/^provider_unavailable$/);
    const port = { invoke: vi.fn(async () => ({ configured: true, settings: { ...settings, apiKey: "SECRET" } })) };
    await expect(createCoachPreloadApi(port).status()).rejects.toThrow(/^provider_unavailable$/);
    vi.mocked(f.service.importCredential).mockRejectedValue(Error("SECRET backend prose"));
    await expect(f.api.importCredential()).rejects.toThrow(/^provider_unavailable$/);
    port.invoke.mockResolvedValue({ status: "ready", report: { rawResponse: "SECRET" } } as never);
    await expect(createCoachPreloadApi(port).generateReview({ packageId: "p", operationId: "op" })).rejects.toThrow(/^provider_unavailable$/);
  });
  it.each(["http://llm.example/v1", "https://user:SECRET@llm.example/v1", "https://llm.example/v1?key=SECRET", "https://llm.example/v1#SECRET"])("rejects credential-bearing or insecure endpoints: %s", async baseUrl => {
    const f = fixture(); await expect(f.api.configure({ ...settings, baseUrl })).rejects.toThrow(/^provider_unavailable$/);
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it("enforces first-generation-only through the real IPC/preload/service boundary", async () => {
    const service = createCoachService({
      credentials: { readKey: async () => null, importCredential: async () => undefined, clear: async () => undefined },
      fetchImpl: vi.fn<typeof fetch>(async () => { throw new Error("must not call provider"); }),
      readPackage: async () => packageFixture,
      clock: () => "2026-09-22T00:00:00.000Z",
    });
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const registration = registerCoachIpc({
      trustedSenderId: 17, service,
      ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); }, removeHandler: (channel) => { handlers.delete(channel); } },
    });
    const frame = {};
    const event = { sender: { id: 17, mainFrame: frame }, senderFrame: frame };
    const api = createCoachPreloadApi({ invoke: async (channel, ...args) => handlers.get(channel)!(event, ...args) });
    await api.openReview({ packageId: packageFixture.packageId as string });
    expect((await api.generateReview({ packageId: packageFixture.packageId as string, operationId: "first" })).status).toBe("ready");
    expect(await api.generateReview({ packageId: packageFixture.packageId as string, operationId: "second" })).toEqual({ status: "failed", code: "generation_failed" });
    registration.dispose();
  });
});
