import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { COACH_IPC_CHANNELS, type CoachDesktopApi } from "@riichi-coach/contracts";
import { registerCoachIpc } from "../src/llm-provider/ipc.js";
import { createCoachPreloadApi } from "../src/preload.js";

const settings = { baseUrl: "https://llm.example/v1", modelName: "test-model" };
const status = { configured: true, settings };
function setup() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const service: CoachDesktopApi = {
    configure: vi.fn(async () => status), getStatus: vi.fn(async () => status),
    importCredential: vi.fn(async () => status), clearCredential: vi.fn(async () => ({ ...status, configured: false })),
    generate: vi.fn(async () => ({ status: "unavailable" as const })),
  };
  const registration = registerCoachIpc({ trustedSenderId: 9, service, ipcMain: {
    handle: (name, handler) => { handlers.set(name, handler); }, removeHandler: (name) => { handlers.delete(name); },
  } });
  const invoke = vi.fn(async (name: string, ...args: unknown[]) => handlers.get(name)!({ sender: { id: 9 } }, ...args));
  return { handlers, service, invoke, api: createCoachPreloadApi({ invoke }), registration };
}
describe("coach main/preload trust boundary", () => {
  it("exposes only settings, status and no-payload credential triggers", async () => {
    const f = setup();
    expect(await f.api.configure(settings)).toEqual(status);
    expect(await f.api.importCredential()).toEqual(status);
    expect(await f.api.clearCredential()).toEqual({ ...status, configured: false });
    expect(f.invoke.mock.calls[1]).toEqual([COACH_IPC_CHANNELS.importCredential]);
    expect(f.invoke.mock.calls[2]).toEqual([COACH_IPC_CHANNELS.clearCredential]);
    expect(await f.api.generate({ packageId: "package" })).toEqual({ status: "unavailable" });
    f.registration.dispose(); expect(f.handlers.size).toBe(0);
  });
  it("rejects credential input before IPC, and again at main", async () => {
    const f = setup();
    for (const field of ["apiKey", "token", "Authorization", "rawPrompt"]) {
      await expect(f.api.configure({ ...settings, [field]: "SENTINEL" })).rejects.toThrow("m6d2_provider_operation_failed");
      await expect(f.handlers.get(COACH_IPC_CHANNELS.configure)!({ sender: { id: 9 } }, { ...settings, [field]: "SENTINEL" }))
        .rejects.toThrow("m6d2_provider_operation_failed");
    }
    for (const channel of [COACH_IPC_CHANNELS.status, COACH_IPC_CHANNELS.importCredential, COACH_IPC_CHANNELS.clearCredential]) {
      await expect(f.handlers.get(channel)!({ sender: { id: 9 } }, "SENTINEL")).rejects.toThrow("m6d2_provider_operation_failed");
    }
    expect(f.invoke).not.toHaveBeenCalled(); expect(f.service.configure).not.toHaveBeenCalled();
    for (const baseUrl of ["http://llm.example", "https://user:secret@llm.example", "https://llm.example/?key=secret", "https://llm.example/#secret"]) {
      await expect(f.api.configure({ ...settings, baseUrl })).rejects.toThrow("m6d2_provider_operation_failed");
    }
  });
  it("rejects untrusted senders, subframes and arbitrary generation objects", async () => {
    const f = setup();
    const configure = f.handlers.get(COACH_IPC_CHANNELS.configure)!;
    await expect(configure({ sender: { id: 10 } }, settings)).rejects.toThrow("m6d2_provider_operation_failed");
    await expect(configure({ sender: { id: 9, mainFrame: {} }, senderFrame: {} }, settings)).rejects.toThrow("m6d2_provider_operation_failed");
    const generate = f.handlers.get(COACH_IPC_CHANNELS.generate)!;
    for (const value of [{ packageId: "id", graph: {} }, { packageId: "id", prompt: "secret" }, { recordId: "id" }, null]) {
      await expect(generate({ sender: { id: 9 } }, value)).rejects.toThrow("m6d2_provider_operation_failed");
    }
    expect(f.service.generate).not.toHaveBeenCalled(); expect(f.service.configure).not.toHaveBeenCalled();
  });
  it("reparses outputs and collapses untrusted errors on both sides", async () => {
    const f = setup();
    vi.mocked(f.service.getStatus).mockResolvedValue({ ...status, apiKey: "SENTINEL" } as never);
    await expect(f.api.getStatus()).rejects.toThrow("m6d2_provider_operation_failed");
    const api = createCoachPreloadApi({ invoke: async () => ({ ...status, ciphertext: "SENTINEL" }) });
    await expect(api.getStatus()).rejects.toThrow("m6d2_provider_operation_failed");
    vi.mocked(f.service.importCredential).mockRejectedValue(Error("SENTINEL host prose"));
    await expect(f.api.importCredential()).rejects.toMatchObject({ message: "m6d2_provider_operation_failed" });
    const unsafeReport = createCoachPreloadApi({ invoke: async () => ({ status: "ready", report: { prompt: "SENTINEL" } }) });
    await expect(unsafeReport.generate({ packageId: "id" })).rejects.toThrow("m6d2_provider_operation_failed");
  });
  it("the built sandbox preload needs only Electron and reparses provider DTOs", async () => {
    const code = await readFile(new URL("../dist/preload.bundle.cjs", import.meta.url), "utf8");
    const exposed = new Map<string, CoachDesktopApi>();
    const calls: unknown[][] = [];
    runInNewContext(code, { module: { exports: {} }, exports: {}, URL, console,
      require(name: string) {
        expect(name).toBe("electron");
        return { contextBridge: { exposeInMainWorld: (name: string, value: CoachDesktopApi) => exposed.set(name, value) },
          ipcRenderer: { invoke: async (...args: unknown[]) => { calls.push(args); return status; } } };
      },
    });
    const api = exposed.get("riichiCoachProvider")!;
    expect(await api.importCredential()).toEqual(status);
    expect(calls).toEqual([[COACH_IPC_CHANNELS.importCredential]]);
    await expect(api.configure({ ...settings, apiKey: "secret" } as never)).rejects.toThrow("m6d2_provider_operation_failed");
  });
});
