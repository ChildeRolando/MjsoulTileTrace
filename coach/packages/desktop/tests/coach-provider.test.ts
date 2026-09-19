import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { COACH_REASONING_DRAFT_SCHEMA_VERSION, COACH_REVIEW_PROMPT_VERSION, StructuredAnalysisPackageSchema } from "@riichi-coach/contracts";
import { buildCoachRequest, projectContextGraph, selectReviewDecisions } from "@riichi-coach/reasoning";
import { createProviderCredentialService, environmentCredentialImporter } from "../src/llm-provider/credentials.js";
import { createOpenAiCoachProvider } from "../src/llm-provider/openai.js";
import { createCoachService } from "../src/llm-provider/service.js";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const request = { prompt: "frozen prompt", promptVersion: COACH_REVIEW_PROMPT_VERSION,
  draftSchemaVersion: COACH_REASONING_DRAFT_SCHEMA_VERSION, temperature: 0 as const, maxOutputTokens: 1024 };
const settings = { baseUrl: "https://llm.example/v1", modelName: "test-model" };
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "coach-credential-")); roots.push(root);
  const secrets = new Map<string, string>();
  let serial = 0;
  const storage = {
    isEncryptionAvailable: vi.fn(() => true), getSelectedStorageBackend: () => "gnome_libsecret",
    encryptString: vi.fn((value: string) => { const id = `cipher-${++serial}`; secrets.set(id, value); return Buffer.from(id); }),
    decryptString: vi.fn((value: Buffer) => { const key = secrets.get(value.toString()); if (!key) throw Error("hostile secret"); return key; }),
  };
  let key = "sk-not/base64!:+._- arbitrary";
  const create = (rename?: (from: string, to: string) => Promise<void>) => createProviderCredentialService({
    root, safeStorage: storage, platform: "win32", importer: () => key, ...(rename ? { rename } : {}),
  });
  return { root, storage, create, key, setKey: (value: string) => { key = value; } };
}

describe("main-process coach credentials and transport", () => {
  it("consumes the explicit environment input exactly once", () => {
    const env = { RIICHI_COACH_API_KEY: "arbitrary!@#key" };
    const importer = environmentCredentialImporter(env);
    expect(importer()).toBe("arbitrary!@#key"); expect(importer()).toBeUndefined();
    expect(env).toEqual({});
  });
  it("encrypts arbitrary keys, reads after restart, replaces and deletes independently", async () => {
    const f = await fixture(); const first = f.create();
    expect(await first.importCredential()).toBe(true);
    const serialized = await readFile(join(f.root, "provider-credential.json"), "utf8");
    expect(serialized).not.toContain(f.key);
    expect(Object.keys(JSON.parse(serialized)).sort()).toEqual(["ciphertext", "providerId", "schemaVersion"]);
    const restarted = f.create(); await restarted.initialize();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"decisions":[]}', reasoning_content: "PRIVATE COT" } }] })));
    const provider = createOpenAiCoachProvider({ credentials: restarted, settings: () => settings, fetch });
    expect(await provider.complete(request)).toEqual({ content: '{"decisions":[]}' });
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: `Bearer ${f.key}` });
    f.setKey("replacement@!not32"); expect(await restarted.importCredential()).toBe(true);
    await restarted.clear(); expect(await restarted.isConfigured()).toBe(false);
    expect(await readdir(f.root)).toEqual([]);
    expect(await provider.complete(request)).toEqual({ errorCode: "provider_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["unavailable", "encrypt", "decrypt", "write"])("fails closed on %s without sending", async (failure) => {
    const f = await fixture();
    if (failure === "unavailable") f.storage.isEncryptionAvailable.mockReturnValue(false);
    if (failure === "encrypt") f.storage.encryptString.mockImplementation(() => { throw Error(f.key); });
    const credentials = f.create(failure === "write" ? async () => { throw Error(f.key); } : undefined);
    await credentials.importCredential();
    if (failure === "decrypt") { f.storage.decryptString.mockImplementation(() => { throw Error(f.key); }); await credentials.initialize(); }
    const fetch = vi.fn(); const provider = createOpenAiCoachProvider({ credentials, settings: () => settings, fetch });
    expect(await provider.complete(request)).toEqual({ errorCode: "provider_unavailable" }); expect(fetch).not.toHaveBeenCalled();
    for (const file of await readdir(f.root)) expect(await readFile(join(f.root, file), "utf8")).not.toContain(f.key);
  });
  it("preserves the old ciphertext on failed replacement but blocks use until explicit recovery", async () => {
    const f = await fixture(); await f.create().importCredential();
    const before = await readFile(join(f.root, "provider-credential.json"), "utf8");
    const credentials = f.create(async () => { throw Error("write failed"); }); await credentials.initialize();
    f.setKey("new-key"); expect(await credentials.importCredential()).toBe(false);
    expect(await credentials.isConfigured()).toBe(false);
    expect(await readFile(join(f.root, "provider-credential.json"), "utf8")).toBe(before);
    expect(await readdir(f.root)).toEqual(["provider-credential.json"]);
  });
  it.each(["not-json", '{"schemaVersion":"provider-credential/v1","providerId":"openai-compatible","ciphertext":"!!"}',
    '{"schemaVersion":"provider-credential/v1","providerId":"other","ciphertext":"YQ=="}'])("rejects corrupted records", async (record) => {
    const f = await fixture(); await writeFile(join(f.root, "provider-credential.json"), record);
    const credentials = f.create(); await credentials.initialize();
    const fetch = vi.fn();
    expect(await createOpenAiCoachProvider({ credentials, settings: () => settings, fetch }).complete(request))
      .toEqual({ errorCode: "provider_unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["basic_text", "unknown"])("rejects weak Linux storage %s", async (backend) => {
    const f = await fixture();
    const credentials = createProviderCredentialService({ root: f.root, platform: "linux", importer: () => f.key,
      safeStorage: { ...f.storage, getSelectedStorageBackend: () => backend } });
    expect(await credentials.importCredential()).toBe(false);
    expect(f.storage.encryptString).not.toHaveBeenCalled();
    expect(await readdir(f.root)).toEqual([]);
  });
  it.each([[429, "rate_limited"], [500, "server_error"], [503, "server_error"]] as const)("maps HTTP %s without reflecting response prose", async (status, errorCode) => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(f.key, { status }));
    expect(await createOpenAiCoachProvider({ credentials, settings: () => settings, fetch }).complete(request)).toEqual({ errorCode });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([["ECONNRESET", "network_reset"], ["UND_ERR_SOCKET", "network_reset"], ["ENOTFOUND", "connection_failed"]] as const)("maps %s", async (code, errorCode) => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw Object.assign(Error(f.key), { cause: { code } }); });
    expect(await createOpenAiCoachProvider({ credentials, settings: () => settings, fetch }).complete(request)).toEqual({ errorCode });
  });
  it("bounds a stalled body and aborts the request", async () => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    let signal: AbortSignal | null | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      signal = init?.signal;
      return new Response(new ReadableStream({ start(controller) {
        signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      } }));
    });
    expect(await createOpenAiCoachProvider({ credentials, settings: () => settings, fetch, timeoutMs: 5 }).complete(request))
      .toEqual({ errorCode: "timeout" });
    expect(signal?.aborted).toBe(true);
  });
  it("drops echoed secrets and never follows redirects or forwards provider reasoning", async () => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: f.key, reasoning: f.key } }] })));
    const provider = createOpenAiCoachProvider({ credentials, settings: () => settings, fetch });
    expect(await provider.complete(request)).toEqual({ content: "{}" });
    const init = fetch.mock.calls[0]![1]!;
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ model: settings.modelName, temperature: 0, max_tokens: 1024,
      response_format: { type: "json_object" }, messages: [{ role: "user", content: request.prompt }] });
    expect(init.body).not.toContain(f.key);
  });
  it("serializes import/clear behind in-flight credential use", async () => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const use = credentials.withCredential(async () => { await gate; return "finished"; });
    const clear = credentials.clear(); release();
    expect(await use).toBe("finished"); expect(await clear).toBe(true);
    expect(await credentials.isConfigured()).toBe(false);
  });
});

// Snapshot of the existing D1 single-decision canonical fixture with the two
// canned model scores swapped (9m=.8, actual 5p=.2), produced through the same
// unchanged M6-C builder. It is revalidated by the production service.
async function packageFixture() {
  return StructuredAnalysisPackageSchema.parse(JSON.parse(await readFile(new URL("./fixtures/coach-analysis-package.json", import.meta.url), "utf8")));
}
describe("COAC-3 narrow generation seam", () => {
  it.each(["timeout", "rate_limited", "server_error", "network_reset", "connection_failed"] as const)("retries %s exactly once, then assembles evidence-only", async (errorCode) => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    const pkg = await packageFixture(); const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      if (errorCode === "timeout") throw new DOMException("secret", "AbortError");
      if (errorCode === "network_reset") throw Object.assign(Error("secret"), { code: "ECONNRESET" });
      if (errorCode === "connection_failed") throw Error("secret");
      return new Response("hostile prose", { status: errorCode === "rate_limited" ? 429 : 503 });
    });
    const service = createCoachService({ credentials, resolvePackage: () => pkg,
      provider: (settings) => createOpenAiCoachProvider({ credentials, settings, fetch }) });
    await service.configure(settings);
    const result = await service.generate({ packageId: pkg.packageId });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("ready"); if (result.status !== "ready") return;
    expect(result.report.audit.transportRetries).toBe(1);
    expect(result.report.decisionEntries.every((row) => row.explanationStatus === "request_failed")).toBe(true);
    expect(result.report.reasoningOverlay.nodes).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("hostile prose");
  });
  it("retries to success once; semantic failures are never retried; hashes only survive", async () => {
    const f = await fixture(); const credentials = f.create(); await credentials.importCredential();
    const pkg = await packageFixture(); const graph = projectContextGraph(pkg);
    const selection = selectReviewDecisions(pkg); expect(selection.selected).toHaveLength(1);
    const decisionId = selection.selected[0]!.decisionId;
    const candidate = graph.nodes.find((node) => node.nodeKind === "CandidateAction")!;
    const premise = graph.nodes.find((node) => node.nodeKind === "KnownGameFact")!;
    const content = JSON.stringify({ decisions: [{ decisionId, judgment: { localId: "j", recommendation: (candidate.payload as { actionRef: string }).actionRef,
      confidence: "high", premiseRefs: [premise.nodeId] } }] });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response("private", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content, reasoning_content: "PRIVATE COT" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"decisions":[],"reasoning":"PRIVATE COT"}' } }] })));
    const store = createRecordAnalysisStore({ mapRecord: vi.fn(), replay: vi.fn() }); store.putAnalysisPackage(pkg);
    const service = createCoachService({ credentials, resolvePackage: (id) => store.getAnalysisPackage(id),
      provider: (settings) => createOpenAiCoachProvider({ credentials, settings, fetch }), now: () => "2026-08-24T00:00:00.000Z" });
    await service.configure(settings);
    const result = await service.generate({ packageId: pkg.packageId });
    expect(result.status).toBe("ready"); if (result.status !== "ready") return;
    expect(result.report.generationStatus).toBe("complete"); expect(result.report.audit.transportRetries).toBe(1);
    const invalid = await service.generate({ packageId: pkg.packageId });
    expect(invalid.status).toBe("ready"); if (invalid.status !== "ready") return;
    expect(invalid.report.decisionEntries[0]?.explanationStatus).toBe("invalid_output");
    expect(invalid.report.audit.transportRetries).toBe(0); expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify([result, invalid])).not.toContain("PRIVATE COT");
    expect(JSON.stringify(result)).not.toContain("GraphContextSlice:");
    expect(store.getAnalysisPackage(pkg.packageId)).toEqual(pkg);
  });
  it("unconfigured and missing package paths send no request", async () => {
    const f = await fixture(); const pkg = await packageFixture(); const fetch = vi.fn(); const credentials = f.create();
    const service = createCoachService({ credentials, resolvePackage: (id) => id === pkg.packageId ? pkg : undefined,
      provider: (settings) => createOpenAiCoachProvider({ credentials, settings, fetch }) });
    await service.configure(settings);
    const result = await service.generate({ packageId: pkg.packageId });
    expect(result.status).toBe("ready"); if (result.status !== "ready") return;
    expect(result.report.decisionEntries[0]?.explanationStatus).toBe("provider_unavailable");
    expect(await service.generate({ packageId: "missing" })).toEqual({ status: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("prompt bytes are stable and empty selection has no request", async () => {
    const pkg = await packageFixture(); const graph = projectContextGraph(pkg); const selection = selectReviewDecisions(pkg);
    const request = buildCoachRequest(graph, selection)!;
    expect(createHash("sha256").update(request.prompt).digest("hex"))
      .toBe("f8af7edde653545a2f9b92227ca3a430aa046051c84e22ce8aaf80f13b32993b");
    expect(buildCoachRequest(structuredClone(graph), structuredClone(selection))).toEqual(request);
    expect(buildCoachRequest(graph, { ...selection, selected: [] })).toBeNull();
    const payload = JSON.parse(request.prompt.split("GraphContextSlice:\n")[1]!);
    expect(payload.selectedDecisionIds).toEqual(selection.selected.map((row) => row.decisionId));
    expect(request.prompt).not.toContain("frozenAt");
  });
});
