import { afterEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { environmentCredentialImporter } from "../src/llm-provider/credentials.js";

const { whenReady, appendSwitch } = vi.hoisted(() => ({ whenReady: vi.fn(), appendSwitch: vi.fn() }));
vi.mock("electron", () => ({ app: { commandLine: { appendSwitch }, whenReady, on: vi.fn() },
  BrowserWindow: vi.fn(), ipcMain: {}, safeStorage: {}, session: {} }));
const originalArgv = [...process.argv];
afterEach(() => { process.argv = [...originalArgv]; vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

describe("provider key startup isolation", () => {
  it("captures once at importer construction and can discard diagnostic input", () => {
    const env = { RIICHI_COACH_API_KEY: "startup-fixture-secret" };
    const importer = environmentCredentialImporter(env);
    expect(env).toEqual({}); expect(importer()).toBe("startup-fixture-secret"); expect(importer()).toBeUndefined();
    const diagnosticEnv = { RIICHI_COACH_API_KEY: "discarded-secret" };
    const diagnosticImporter = environmentCredentialImporter(diagnosticEnv, true);
    expect(diagnosticEnv).toEqual({}); expect(diagnosticImporter()).toBeUndefined();
  });
  it.each(["--diagnose-mortal-decision", "--diagnose-mortal-full-game", "normal"])(
    "removes inherited key before Electron readiness on %s startup", async (mode) => {
      vi.stubEnv("RIICHI_COACH_API_KEY", "startup-fixture-secret");
      process.argv = mode === "normal" ? [...originalArgv] : [...originalArgv, mode];
      appendSwitch.mockImplementation(() => { expect(process.env.RIICHI_COACH_API_KEY).toBeUndefined(); });
      whenReady.mockImplementation(() => {
        expect(process.env.RIICHI_COACH_API_KEY).toBeUndefined();
        // Same default environment inheritance as ManagedFactEngineTransport.
        const child = spawnSync(process.execPath, ["-e", 'process.stdout.write(String("RIICHI_COACH_API_KEY" in process.env))'], { encoding: "utf8" });
        expect(child.status).toBe(0); expect(child.stdout).toBe("false");
        // Stop before the startup callback: no real account/network/Electron UI.
        return { then: () => ({ catch: () => {} }) };
      });
      await import("../src/electron-entry.js");
      expect(whenReady).toHaveBeenCalledTimes(1);
    },
  );
});
