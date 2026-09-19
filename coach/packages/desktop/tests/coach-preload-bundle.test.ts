import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("actual sandboxed coach preload bundle", () => {
  it("runs with electron as its only external and reparses credential-bearing DTOs", async () => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL("../src/preload-entry.ts", import.meta.url))],
      bundle: true, format: "cjs", platform: "node", external: ["electron"], write: false,
    });
    const exposed = new Map<string, Record<string, (...args: unknown[]) => Promise<unknown>>>();
    const invoke = vi.fn(async () => ({ configured: false, settings: null }));
    const requireModule = vi.fn((name: string) => {
      if (name !== "electron") throw Error(`sandbox cannot load ${name}`);
      return { contextBridge: { exposeInMainWorld: (key: string, api: never) => exposed.set(key, api) }, ipcRenderer: { invoke } };
    });
    runInNewContext(bundle.outputFiles[0]!.text, { require: requireModule, module: { exports: {} }, URL });
    expect(requireModule.mock.calls).toEqual([["electron"]]);
    const api = exposed.get("riichiCoachProvider")!;
    expect(await api.status!()).toEqual({ configured: false, settings: null });
    invoke.mockResolvedValue({ configured: true, settings: null, apiKey: "SECRET" } as never);
    await expect(api.status!()).rejects.toThrow("provider_unavailable");
    invoke.mockClear();
    await expect(api.importCredential!("SECRET")).rejects.toThrow("provider_unavailable");
    expect(invoke).not.toHaveBeenCalled();
  });
});
