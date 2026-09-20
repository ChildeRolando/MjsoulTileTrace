import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderCredentials, createEnvironmentKeyImporter } from "../src/llm-provider/credentials.js";
import { createOpenAiCoachProvider } from "../src/llm-provider/openai-compatible.js";
import { COACH_REASONING_DRAFT_SCHEMA_VERSION, COACH_REVIEW_PROMPT_VERSION } from "@riichi-coach/contracts";

async function expectNoNetwork(credentials: ReturnType<typeof createProviderCredentials>) {
  const http = vi.fn<typeof fetch>();
  const provider = createOpenAiCoachProvider({ credentials, settings: { baseUrl: "https://llm.example/v1", modelName: "fixture" }, fetchImpl: http });
  expect(await provider.complete({ promptVersion: COACH_REVIEW_PROMPT_VERSION, draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION, prompt: "frozen test prompt", temperature: 0, maxOutputTokens: 10 })).toEqual({ errorCode: "provider_unavailable", transportRetries: 0 });
  expect(http).not.toHaveBeenCalled();
}

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coach-credential-")); roots.push(root);
  const secrets = new Map<string, string>();
  const safeStorage = {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: vi.fn((value: string) => {
      const cipher = `opaque-${secrets.size}`; secrets.set(cipher, value); return Buffer.from(cipher);
    }),
    decryptString: vi.fn((value: Buffer) => {
      const secret = secrets.get(value.toString()); if (!secret) throw Error("secret backend prose"); return secret;
    }),
  };
  let key = "sk-not/base64!._~+=$:punctuation";
  const options = { userData: root, safeStorage, platform: "win32" as const, importer: () => key };
  const credentials = createProviderCredentials(options);
  return { root, safeStorage, options, credentials, replace: (value: string) => { key = value; } };
}
describe("independent provider credential custody", () => {
  it("encrypts arbitrary API keys, restores, replaces and deletes without using the session protector", async () => {
    const f = await fixture();
    for (const key of ["short", "not-base64!@#$%^&*()_+-=:/?", "sk-" + "a".repeat(120)]) {
      f.replace(key); await f.credentials.importCredential();
      expect(await f.credentials.readKey()).toBe(key);
      const files = await readdir(f.root);
      expect(files).toEqual(["coach-provider-credential.json"]);
      const record = await readFile(join(f.root, files[0]!), "utf8");
      expect(record).not.toContain(key);
      expect(Object.keys(JSON.parse(record)).sort()).toEqual(["ciphertext", "providerId", "schemaVersion"]);
      const restarted = createProviderCredentials(f.options);
      expect(await restarted.readKey()).toBe(key);
    }
    await f.credentials.clear();
    expect(await f.credentials.readKey()).toBeNull();
    expect(await createProviderCredentials(f.options).readKey()).toBeNull();
    expect(await readdir(f.root)).toEqual([]);
  });
  it.each(["unavailable", "encrypt", "decrypt", "atomic"])("fails closed on %s and preserves an old record on failed replacement", async (failure) => {
    const f = await fixture(); await f.credentials.importCredential();
    const old = await readFile(join(f.root, "coach-provider-credential.json"), "utf8");
    if (failure === "unavailable") f.safeStorage.isEncryptionAvailable.mockReturnValue(false);
    if (failure === "encrypt") f.safeStorage.encryptString.mockImplementation(() => { throw Error("secret"); });
    if (failure === "decrypt") f.safeStorage.decryptString.mockImplementation(() => { throw Error("secret"); });
    const service = failure === "atomic" ? createProviderCredentials({ ...f.options, rename: async () => { throw Error("secret"); } }) : f.credentials;
    if (failure === "decrypt") expect(await service.readKey()).toBeNull();
    else await expect(service.importCredential()).rejects.toThrow(/^provider_unavailable$/);
    expect(await service.readKey()).toBeNull();
    await expectNoNetwork(service);
    expect(await readFile(join(f.root, "coach-provider-credential.json"), "utf8")).toBe(old);
    expect(await readdir(f.root)).toEqual(["coach-provider-credential.json"]);
  });
  it("consumes the explicit environment slot once and removes plaintext even on invalid input", () => {
    const env = { RIICHI_COACH_API_KEY: "key!" };
    const importer = createEnvironmentKeyImporter(env);
    expect(importer()).toBe("key!"); expect(env).toEqual({}); expect(importer()).toBeUndefined();
  });
  it.each(["not JSON", "{}", JSON.stringify({ schemaVersion: "provider-credential/v1", providerId: "openai-compatible", ciphertext: "bad!" }), JSON.stringify({ schemaVersion: "provider-credential/v1", providerId: "openai-compatible", ciphertext: Buffer.from("corrupt").toString("base64") })])("rejects corrupt records before any HTTP request", async record => {
    const f = await fixture();
    await writeFile(join(f.root, "coach-provider-credential.json"), record);
    await expectNoNetwork(f.credentials);
  });
  it.each(["basic_text", "unknown"])("rejects Linux backend %s without writing a record", async backend => {
    const f = await fixture();
    const service = createProviderCredentials({ ...f.options, platform: "linux", safeStorage: { ...f.safeStorage, getSelectedStorageBackend: () => backend } });
    await expect(service.importCredential()).rejects.toThrow(/^provider_unavailable$/);
    expect(f.safeStorage.encryptString).not.toHaveBeenCalled();
    expect(await readdir(f.root)).toEqual([]); await expectNoNetwork(service);
  });
  it("serializes import and clear so a late importer cannot resurrect a cleared key", async () => {
    const f = await fixture();
    let release!: (value: string) => void;
    const service = createProviderCredentials({ ...f.options, importer: () => new Promise<string>(resolve => { release = resolve; }) });
    const importing = service.importCredential();
    await Promise.resolve();
    const clearing = service.clear();
    release("delayed-key"); await importing; await clearing;
    expect(await readdir(f.root)).toEqual([]); await expectNoNetwork(service);
  });
});
