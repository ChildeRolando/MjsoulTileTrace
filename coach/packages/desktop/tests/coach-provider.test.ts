import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  StructuredAnalysisPackageSchema, SELECTOR_POLICY_VERSION_V1, type ReviewSelectionResult,
} from "@riichi-coach/contracts";
import { buildCoachRequest, buildGraphContextSlice, projectContextGraph, validateReviewReport, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { createOpenAiCoachProvider } from "../src/llm-provider/openai-compatible.js";
import { generateReviewReport } from "../src/llm-provider/generate.js";
import { createCoachService } from "../src/llm-provider/service.js";

// Snapshot from the M6-C/D1 canned fixture with the two model preferences
// swapped, so the production selector selects the disagreement. This is an
// assembled package, never a hand-authored relaxed schema.
const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8")));
validateStructuredAnalysisPackage(pkg);
const graph = projectContextGraph(pkg);
const decisionId = pkg.decisions[0]!.decisionId;
const selection: ReviewSelectionResult = {
  policyVersion: SELECTOR_POLICY_VERSION_V1, analysisPackageId: pkg.packageId,
  analysisPackageStatus: pkg.record.status,
  selected: [{ decisionId, rank: 1, selectionReason: "model_disagreement_above_threshold" }],
};
const slice = buildGraphContextSlice(graph, selection);
const request = buildCoachRequest(slice);
const settings = { baseUrl: "https://llm.example/v1", modelName: "fixture-model" };
const KEY = "sk-arbitrary!._~+=$:key";
const now = "2026-08-24T12:00:00.000Z";
function draft() {
  const action = slice.nodes.find(n => n.nodeKind === "CandidateAction")!;
  const premise = slice.nodes.find(n => n.nodeKind === "KnownGameFact")!;
  return { decisions: [{ decisionId, judgment: { localId: "j1", recommendation: (action.payload as { actionRef: string }).actionRef, confidence: "medium", premiseRefs: [premise.nodeId] } }] };
}
function response(content = JSON.stringify(draft())) {
  return new Response(JSON.stringify({ choices: [{ message: { content, reasoning_content: "PRIVATE_COT" } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }, extra: KEY }));
}
function provider(fetchImpl: typeof fetch, readKey: () => Promise<string | null> = async () => KEY, timeoutMs = 1000) {
  return createOpenAiCoachProvider({ settings, credentials: { readKey }, fetchImpl, timeoutMs });
}
describe("main-process OpenAI-compatible provider and narrow generation seam", () => {
  it("sends frozen prompt plus slice, with the key only in Authorization, and returns a grounded hash-only report", async () => {
    const http = vi.fn<typeof fetch>(async () => response());
    const p = provider(http);
    const report = await generateReviewReport(graph, selection, p, now);
    expect(report.generationStatus).toBe("complete");
    expect(() => validateReviewReport(report, graph)).not.toThrow();
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = http.mock.calls[0]!;
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
    expect(JSON.parse(init!.body as string)).toEqual({ model: settings.modelName, messages: [{ role: "user", content: request.prompt }], temperature: 0, max_tokens: 8192, response_format: { type: "json_object" }, stream: false });
    expect(init!.body).not.toContain(KEY);
    for (const forbidden of [KEY, "PRIVATE_COT", request.prompt, JSON.stringify(draft())]) expect(JSON.stringify(report)).not.toContain(forbidden);
    expect(report.audit).toMatchObject({ transportRetries: 0, usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 } });
    expect(report.audit.outputHash).toBe(`sha256:${createHash("sha256").update(JSON.stringify(draft())).digest("hex")}`);
    expect(await generateReviewReport(graph, selection, p, now)).toEqual(report);
  });
  it.each([undefined, null, false, 12, "invalid", [], { prompt_tokens: "invalid" }, { completion_tokens: -1 }].map(usage => ({ usage })))("keeps valid content when optional usage is $usage", async ({ usage }) => {
    const http = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(draft()) } }], usage,
    })));
    const report = await generateReviewReport(graph, selection, provider(http), now);
    expect(report.generationStatus).toBe("complete");
    expect(report.audit.transportRetries).toBe(0);
    expect(report.audit.usage).toBeUndefined();
    expect(http).toHaveBeenCalledTimes(1);
  });
  it.each([
    [429, "rate_limited"], [500, "server_error"], [503, "server_error"], [401, "connection_failed"],
  ] as const)("maps HTTP %s and retries exactly once", async (status, code) => {
    const http = vi.fn<typeof fetch>(async () => new Response(KEY, { status }));
    expect(await provider(http).complete(request)).toEqual({ errorCode: code });
    http.mockClear();
    const report = await generateReviewReport(graph, selection, provider(http), now);
    expect(http).toHaveBeenCalledTimes(2);
    expect(report.decisionEntries[0]?.explanationStatus).toBe("request_failed");
    expect(report.audit.transportRetries).toBe(1);
    expect(JSON.stringify(report)).not.toContain(KEY);
  });
  it.each([["ECONNRESET", "network_reset"], ["ENOTFOUND", "connection_failed"], ["ETIMEDOUT", "timeout"]] as const)("maps %s without exposing exceptions", async (code, expected) => {
    const http = vi.fn<typeof fetch>(async () => { throw Object.assign(Error(KEY), { cause: { code } }); });
    expect(await provider(http).complete(request)).toEqual({ errorCode: expected });
  });
  it("bounds even an uncooperative HTTP stub and aborts on timeout", async () => {
    const http = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const report = await generateReviewReport(graph, selection, provider(http, async () => KEY, 5), now);
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(report.decisionEntries[0]?.explanationStatus).toBe("request_failed");
  });
  it("recovers from one transport failure and records the actual retry count", async () => {
    const http = vi.fn<typeof fetch>().mockRejectedValueOnce(Error(KEY)).mockImplementation(async () => response());
    const report = await generateReviewReport(graph, selection, provider(http), now);
    expect(http).toHaveBeenCalledTimes(2); expect(report.generationStatus).toBe("complete");
    expect(report.audit.transportRetries).toBe(1);
  });
  it.each(["broken JSON", JSON.stringify({ ...draft(), chain_of_thought: "PRIVATE_COT" }), JSON.stringify({ decisions: [{ ...draft().decisions[0], judgment: { ...draft().decisions[0]!.judgment, premiseRefs: ["hostile-ref"] } }] }), KEY])("does not retry invalid or ungrounded content", async (content) => {
    const http = vi.fn<typeof fetch>(async () => response(content));
    const report = await generateReviewReport(graph, selection, provider(http), now);
    expect(http).toHaveBeenCalledTimes(1);
    expect(report.decisionEntries[0]?.explanationStatus).toBe("invalid_output");
    expect(report.reasoningOverlay).toEqual({ nodes: [], edges: [] });
    expect(report.audit.outputHash).toBe(`sha256:${createHash("sha256").update(content).digest("hex")}`);
    expect(JSON.stringify(report)).not.toContain("hostile-ref");
    expect(JSON.stringify(report)).not.toContain(KEY);
  });
  it("sends no request for missing credentials, invalid config or empty selection", async () => {
    const http = vi.fn<typeof fetch>(async () => response());
    for (const p of [provider(http, async () => null), createOpenAiCoachProvider({ settings: null, credentials: { readKey: async () => KEY }, fetchImpl: http })]) {
      const report = await generateReviewReport(graph, selection, p, now);
      expect(report.decisionEntries[0]?.explanationStatus).toBe("provider_unavailable");
      expect(report.audit.transportRetries).toBe(0);
    }
    const report = await generateReviewReport(graph, { ...selection, selected: [] }, provider(http), now);
    expect(report.generationStatus).toBe("evidence_only"); expect(report.decisionEntries).toEqual([]);
    expect(http).not.toHaveBeenCalled();
  });
  it("blocks JSON-escaped credential and full-prompt reflections inside otherwise legal draft text", async () => {
    for (const statement of [KEY, request.prompt]) {
      const content = JSON.stringify({ decisions: [{ ...draft().decisions[0], inferences: [{ localId: "i", statement, premiseRefs: [] }] }] });
      const escaped = content.replaceAll("s", "\\u0073");
      const http = vi.fn<typeof fetch>(async () => response(escaped));
      const report = await generateReviewReport(graph, selection, provider(http), now);
      expect(report.decisionEntries[0]?.explanationStatus).toBe("invalid_output");
      expect(report.audit.outputHash).toBe(`sha256:${createHash("sha256").update(escaped).digest("hex")}`);
      expect(report.audit.transportRetries).toBe(0);
      expect(http).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(report)).not.toContain(statement);
    }
  });
  it("locks prompt bytes and omits non-allowlisted payload fields", () => {
    expect(buildCoachRequest(JSON.parse(JSON.stringify(slice)))).toEqual(request);
    expect(request.prompt).not.toContain("frozenAt");
    const extended = structuredClone(graph);
    (extended.nodes[0]!.payload as Record<string, unknown>).privateAudit = "OUTSIDE_ALLOWLIST";
    expect(buildCoachRequest(buildGraphContextSlice(extended, selection))).toEqual(request);
  });
  it("keeps rejected output hashes local to concurrent completions and subsequent valid output", async () => {
    const contents = [`first reflection ${KEY}`, `second reflection ${KEY}`];
    const http = vi.fn<typeof fetch>()
      .mockImplementationOnce(async () => response(contents[0]))
      .mockImplementationOnce(async () => response(contents[1]))
      .mockImplementation(async () => response());
    const p = provider(http);
    const reports = await Promise.all(contents.map(() => generateReviewReport(graph, selection, p, now)));
    reports.forEach((report, index) => {
      expect(report.audit.outputHash).toBe(`sha256:${createHash("sha256").update(contents[index]!).digest("hex")}`);
      expect(report.decisionEntries[0]?.explanationStatus).toBe("invalid_output");
      expect(JSON.stringify(report)).not.toContain(KEY);
    });
    const valid = await generateReviewReport(graph, selection, p, now);
    expect(valid.generationStatus).toBe("complete");
    expect(valid.audit.outputHash).toBe(`sha256:${createHash("sha256").update(JSON.stringify(draft())).digest("hex")}`);
    expect(http).toHaveBeenCalledTimes(3);
  });
  it("production service validates identity and runs the real selector, provider and report validator", async () => {
    const http = vi.fn<typeof fetch>(async () => response());
    const service = createCoachService({ credentials: { readKey: async () => KEY, importCredential: async () => undefined, clear: async () => undefined }, fetchImpl: http, readPackage: async () => pkg, clock: () => now });
    await service.configure(settings);
    const result = await service.generate({ packageId: pkg.packageId });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.report.selectedDecisionIds).toEqual([decisionId]);
      expect(result.report.generationStatus).toBe("complete");
    }
    expect(await service.generate({ packageId: "wrong" })).toEqual({ status: "package_unavailable" });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("drains an in-flight generation before a credential clear completes", async () => {
    let resolveHttp!: (value: Response) => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const http = vi.fn<typeof fetch>(() => { started(); return new Promise(resolve => { resolveHttp = resolve; }); });
    const clear = vi.fn(async () => undefined);
    const service = createCoachService({ credentials: { readKey: async () => KEY, importCredential: async () => undefined, clear }, fetchImpl: http, readPackage: async () => pkg });
    await service.configure(settings);
    const generation = service.generate({ packageId: pkg.packageId }); await entered;
    const clearing = service.clearCredential();
    await Promise.resolve(); expect(clear).not.toHaveBeenCalled();
    resolveHttp(response()); await generation; await clearing;
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
