import { describe, expect, it, vi } from "vitest";
import { COACH_IPC_CHANNELS } from "@riichi-coach/contracts";
import { registerCoachIpc } from "../src/coach-ipc.js";
import { createCoachPreloadApi } from "../src/session-api.js";
import type { CoachService } from "../src/llm-provider/service.js";

const settings = { baseUrl: "https://llm.example/v1", modelName: "fixture" };
function fixture() {
  const safe = { configured: true, settings };
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const service: CoachService = {
    status: vi.fn(async () => safe), configure: vi.fn(async () => safe),
    importCredential: vi.fn(async () => safe), clearCredential: vi.fn(async () => ({ configured: false, settings })),
    generate: vi.fn(async () => ({ status: "package_unavailable" as const })),
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
    expect(Object.keys(f.api).sort()).toEqual(["clearCredential", "configure", "generate", "importCredential", "status"]);
    expect(await f.api.configure(settings)).toEqual({ configured: true, settings });
    await f.api.status(); await f.api.importCredential();
    expect(await f.api.clearCredential()).toEqual({ configured: false, settings });
    expect(await f.api.generate({ packageId: "package-ref" })).toEqual({ status: "package_unavailable" });
    expect(f.invoke.mock.calls).toEqual([
      [COACH_IPC_CHANNELS.configure, settings], [COACH_IPC_CHANNELS.status],
      [COACH_IPC_CHANNELS.importCredential], [COACH_IPC_CHANNELS.clearCredential],
      [COACH_IPC_CHANNELS.generate, { packageId: "package-ref" }],
    ]);
    f.registration.dispose(); expect(f.handlers.size).toBe(0);
  });
  it("rejects key-bearing envelopes before IPC and rejects direct IPC attempts", async () => {
    const f = fixture();
    const malicious = { ...settings, apiKey: "SECRET" };
    await expect(f.api.configure(malicious)).rejects.toThrow(/^provider_unavailable$/);
    await expect((f.api.importCredential as (...args: unknown[]) => Promise<unknown>)("SECRET")).rejects.toThrow(/^provider_unavailable$/);
    await expect(f.api.generate({ packageId: "p", prompt: "RAW_PROMPT" } as never)).rejects.toThrow(/^provider_unavailable$/);
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
    await expect(createCoachPreloadApi(port).generate({ packageId: "p" })).rejects.toThrow(/^provider_unavailable$/);
  });
  it.each(["http://llm.example/v1", "https://user:SECRET@llm.example/v1", "https://llm.example/v1?key=SECRET", "https://llm.example/v1#SECRET"])("rejects credential-bearing or insecure endpoints: %s", async baseUrl => {
    const f = fixture(); await expect(f.api.configure({ ...settings, baseUrl })).rejects.toThrow(/^provider_unavailable$/);
    expect(f.invoke).not.toHaveBeenCalled();
  });
});
