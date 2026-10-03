import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCoachSettingsStore } from "../src/llm-provider/settings-store.js";
import { createCoachService } from "../src/llm-provider/service.js";

describe("public Coach settings persistence", () => {
  it("restores the chosen model across restart without storing credentials or prompts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "coach-settings-"));
    try {
      const store = createCoachSettingsStore(directory);
      expect(store.load()).toBeNull();
      const settings = { providerId: "codex-cli" as const, modelName: "gpt-6-luna" as const, reasoningEffort: "max" as const };
      const credentials = { readKey: vi.fn(async () => null), importCredential: async () => undefined, clear: async () => undefined };
      const service = createCoachService({ credentials, fetchImpl: vi.fn(), readPackage: vi.fn(), saveSettings: value => store.save(value), codexAvailable: async () => true });
      expect(await service.configure(settings)).toEqual({ configured: true, settings });
      expect(JSON.parse(readFileSync(join(directory, "coach-provider-settings-v1.json"), "utf8"))).toEqual(settings);
      const restarted = createCoachService({ credentials, fetchImpl: vi.fn(), readPackage: vi.fn(), initialSettings: createCoachSettingsStore(directory).load()!, codexAvailable: async () => true });
      expect(await restarted.status()).toEqual({ configured: true, settings });
      expect(credentials.readKey).not.toHaveBeenCalled();
      for (const invalid of [{ ...settings, token: "secret" }, { baseUrl: "https://user:secret@example.org", modelName: "m" }]) {
        writeFileSync(join(directory, "coach-provider-settings-v1.json"), JSON.stringify(invalid));
        expect(store.load()).toBeNull();
      }
      writeFileSync(join(directory, "coach-provider-settings-v1.json"), " ".repeat(4097));
      expect(store.load()).toBeNull();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("preserves live settings when saving a replacement fails", async () => {
    const settings = { baseUrl: "https://example.org/v1", modelName: "m" };
    const saveSettings = vi.fn(async () => { throw new Error("private_path_or_token"); });
    const service = createCoachService({ initialSettings: settings, saveSettings, credentials: { readKey: async () => "key", importCredential: async () => undefined, clear: async () => undefined }, fetchImpl: vi.fn(), readPackage: vi.fn() });
    await expect(service.configure({ providerId: "codex-cli", modelName: "gpt-6-luna", reasoningEffort: "max" })).rejects.toThrow("provider_unavailable");
    expect(await service.status()).toEqual({ configured: true, settings });
  });
});
