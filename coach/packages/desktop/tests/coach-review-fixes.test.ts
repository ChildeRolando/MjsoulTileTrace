import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StructuredAnalysisPackageSchema } from "@riichi-coach/contracts";
import { projectContextGraph, selectReviewDecisions } from "@riichi-coach/reasoning";
import { createRecordAnalysisStore } from "../src/record-analysis-store.js";
import { createProviderCredentialService } from "../src/llm-provider/credentials.js";
import { createOpenAiCoachProvider } from "../src/llm-provider/openai.js";
import { createCoachService } from "../src/llm-provider/service.js";
import { registerCoachIpc } from "../src/llm-provider/ipc.js";
import { createCoachPreloadApi } from "../src/preload.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const secret = "review-fixture-secret!";
const settings = { baseUrl: "https://llm.example/v1", modelName: "test-model" };
const hash = (content: string) => `sha256:${createHash("sha256").update(content).digest("hex")}`;

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "coach-review-fixes-")); roots.push(root);
  const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(await readFile(new URL("./fixtures/coach-analysis-package.json", import.meta.url), "utf8")));
  const packageFile = join(root, "analysis.json"); await writeFile(packageFile, JSON.stringify(pkg));
  const store = createRecordAnalysisStore({ mapRecord: vi.fn(), replay: vi.fn() });
  const credentials = createProviderCredentialService({ root: join(root, "credentials"), platform: "win32", importer: () => secret,
    safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "unknown",
      encryptString: () => Buffer.from("sealed-fixture"), decryptString: () => secret } });
  await credentials.importCredential();
  const fetch = vi.fn<typeof globalThis.fetch>();
  const service = createCoachService({ credentials, resolvePackage: (id) => store.getAnalysisPackage(id),
    provider: (settings) => createOpenAiCoachProvider({ credentials, settings, fetch }) });
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  registerCoachIpc({ service, trustedSenderId: 9, ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); },
    removeHandler: (channel) => { handlers.delete(channel); } } });
  const api = createCoachPreloadApi({ invoke: (channel, ...args) => handlers.get(channel)!({ sender: { id: 9 } }, ...args) });
  await api.configure(settings);
  const respond = (content: string) => fetch.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content, reasoning_content: "PRIVATE ENVELOPE COT" } }] })));
  return { root, pkg, packageFile, store, fetch, api, respond };
}

describe("review fixes: production package loader and original output audit", () => {
  it("loads a main-process package file and generates through registered IPC without a test-only store write", async () => {
    const f = await setup();
    expect(await f.api.generate({ packageId: f.pkg.packageId })).toEqual({ status: "unavailable" });
    expect(await f.store.loadAnalysisPackageFile(f.packageFile)).toBe(f.pkg.packageId);
    const graph = projectContextGraph(f.pkg);
    const content = JSON.stringify({ decisions: [{ decisionId: selectReviewDecisions(f.pkg).selected[0]!.decisionId,
      judgment: { localId: "j", recommendation: (graph.nodes.find((node) => node.nodeKind === "CandidateAction")!.payload as { actionRef: string }).actionRef,
        confidence: "high", premiseRefs: [graph.nodes.find((node) => node.nodeKind === "KnownGameFact")!.nodeId] } }] }, null, 2);
    f.respond(content);
    const result = await f.api.generate({ packageId: f.pkg.packageId });
    expect(result.status).toBe("ready"); if (result.status !== "ready") return;
    expect(result.report.generationStatus).toBe("complete");
    expect(result.report.audit.outputHash).toBe(hash(content));
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("PRIVATE ENVELOPE COT");
    expect(JSON.stringify(result)).not.toContain(secret);
    // Renderer can supply neither package data nor a path to the loader.
    await expect(f.api.generate({ packageId: f.pkg.packageId, packageFile: f.packageFile } as never)).rejects.toThrow("m6d2_provider_operation_failed");
  });
  it.each(["not json", JSON.stringify({ packageId: "forged", apiKey: secret })])("rejects invalid file input before store/network use", async (content) => {
    const f = await setup(); await writeFile(f.packageFile, content);
    expect(await f.store.loadAnalysisPackageFile(f.packageFile)).toBeUndefined();
    expect(await f.store.loadAnalysisPackageFile(join(f.root, "missing.json"))).toBeUndefined();
    expect(await f.store.loadAnalysisPackageFile(f.root)).toBeUndefined();
    expect(await f.api.generate({ packageId: f.pkg.packageId })).toEqual({ status: "unavailable" });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("rejects a structurally valid package whose identity has been tampered with", async () => {
    const f = await setup(); await writeFile(f.packageFile, JSON.stringify({ ...f.pkg, packageId: "forged" }));
    expect(await f.store.loadAnalysisPackageFile(f.packageFile)).toBeUndefined();
    expect(f.store.getAnalysisPackage("forged")).toBeUndefined(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['{ "decisions" : [] }', 'rejected original A', 'rejected original B', '{"decisions":[],"reasoning":"PRIVATE RAW COT"}'])(
    "hashes original content bytes without persisting rejected text: %s", async (content) => {
      const f = await setup(); await f.store.loadAnalysisPackageFile(f.packageFile); f.respond(content);
      const result = await f.api.generate({ packageId: f.pkg.packageId });
      expect(result.status).toBe("ready"); if (result.status !== "ready") return;
      expect(result.report.audit.outputHash).toBe(hash(content));
      expect(result.report.generationStatus).toBe("evidence_only");
      expect(result.report.audit.transportRetries).toBe(0); expect(f.fetch).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("PRIVATE RAW COT");
      expect(JSON.stringify(result)).not.toContain("rejected original");
    },
  );
  it("hashes an escaped credential echo but rejects its entire otherwise valid draft", async () => {
    const f = await setup(); await f.store.loadAnalysisPackageFile(f.packageFile);
    const graph = projectContextGraph(f.pkg);
    const draft = { decisions: [{ decisionId: selectReviewDecisions(f.pkg).selected[0]!.decisionId,
      judgment: { localId: "j", recommendation: (graph.nodes.find((node) => node.nodeKind === "CandidateAction")!.payload as { actionRef: string }).actionRef,
        confidence: "high", premiseRefs: [graph.nodes.find((node) => node.nodeKind === "KnownGameFact")!.nodeId] },
      inferences: [{ localId: "i", statement: secret, premiseRefs: [graph.nodes.find((node) => node.nodeKind === "KnownGameFact")!.nodeId] }] }] };
    const content = JSON.stringify(draft).replace(secret, [...secret].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).join(""));
    f.respond(content); const result = await f.api.generate({ packageId: f.pkg.packageId });
    expect(result.status).toBe("ready"); if (result.status !== "ready") return;
    expect(result.report.audit.outputHash).toBe(hash(content));
    expect(result.report.decisionEntries[0]?.explanationStatus).toBe("invalid_output");
    expect(result.report.reasoningOverlay.nodes).toEqual([]); expect(JSON.stringify(result)).not.toContain(secret);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});
