import { describe, expect, it } from "vitest";
import { ARENA_RAW_BASELINE, ArenaExperimentConfigSchema } from "@riichi-coach/contracts";
import { assembleArenaExperiment, mapArenaDirectAnswer } from "../src/blind-discard-arena-experiment.js";
import { makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalActionRef, ArenaBlindObservationSchema } from "@riichi-coach/contracts";
import { runBlindCoachCase, recoverInterruptedArenaRun, ArenaCoachRunResultSchema } from "../src/blind-discard-arena-runner.js";
import { createOpenAiArenaToolCallProvider } from "../src/llm-provider/arena-tool-call.js";
import { createCodexArenaToolCallProvider } from "../src/llm-provider/codex-cli.js";
import { arenaContentDigest, projectArenaRawObservation } from "../src/blind-discard-arena-experiment.js";
import { createArenaRagRetriever } from "../src/blind-discard-arena-rag.js";
import { arenaDirectDispatchPlan } from "../src/blind-discard-arena-archive.js";

const selectionFor = (observation: any, mode = "fixed", query = "进张计数") => ({ sourceId: "synthetic-selection-port", version: "fixture/v1", inputDigest: arenaContentDigest(projectArenaRawObservation(observation)), mode, query, fixedQuery: "进张计数" });
const scenarioFor = (observation: any) => ({ sourceId: "synthetic-pattern-port", version: "fixture/v1", inputDigest: arenaContentDigest(projectArenaRawObservation(observation)), requiresHelper: false, content: { matches: [{ patternId: "fixture-pattern", applicableWhen: "synthetic", hint: "夹具模式提示" }] } });

describe("Arena raw baseline", () => {
  it("projects only raw visible fields and a global output schema", () => {
    const { observation } = makeArenaMcpCase({ includeRawEventOrder: true });
    const assembled = assembleArenaExperiment({ observation, config: ARENA_RAW_BASELINE });
    const text = JSON.stringify(assembled.messages);
    for (const forbidden of ["furiten", "ippatsu", "candidates", "actionRef", "supportedCapabilities", "shanten", "genbutsu", "rationale", "evidenceRefs"]) expect(text).not.toContain(forbidden);
    expect(assembled.modules.raw.self.concealedTiles).toEqual(observation.visibleState.self.concealedTiles);
    expect(assembled.modules.raw.rivers).toHaveLength(4);
    expect(assembled.modules.raw.eventOrder).toEqual([...observation.visibleState.rivers.flatMap(r => r.map(d => d.sourceRef)), observation.visibleState.self.currentDraw!.sourceRef]);
    expect(assembled.tools).toEqual([]);
    expect(assembled.outputSchema.required).toEqual(["tile", "red"]);
    expect(JSON.stringify(assembled.outputSchema)).not.toContain(observation.candidates[0]!.actionRef);
  });
  it("rejects real module dependency violations instead of enabling helper", () => {
    expect(ArenaExperimentConfigSchema.safeParse({ ...ARENA_RAW_BASELINE, helperFacts: true }).success).toBe(false);
    expect(ArenaExperimentConfigSchema.safeParse({ ...ARENA_RAW_BASELINE, callableTools: ["analyze_candidates"] }).success).toBe(false);
    expect(ArenaExperimentConfigSchema.safeParse({ ...ARENA_RAW_BASELINE, teaching: "off", materialRouting: "scenario" }).success).toBe(false);
  });
  it("maps tile/red only against the complete legal set; malformed answers remain invalid", () => {
    const { observation } = makeArenaMcpCase();
    expect(mapArenaDirectAnswer({ tile: "1m", red: false }, observation)).toMatchObject({ status: "valid", submission: { actionRef: observation.candidates[0]!.actionRef, format: "tile-red/v1" } });
    for (const raw of [null, {}, "", { tile: "9z", red: false }, { tile: "9s", red: false }, { tile: "1m", red: true }, { tile: "1m", red: false, rationale: "repair" }]) expect(mapArenaDirectAnswer(raw, observation).status).toBe("invalid");
  });
  it("distinguishes red fives and uses the existing canonical draw/hand equivalence", () => {
    const { observation } = makeArenaMcpCase();
    const candidates = [false, true].map(red => {
      const action = { kind: "discard" as const, tile: { id: "5p" as const, red }, discardMode: "tedashi" as const };
      return { actionRef: canonicalActionRef(action), tile: action.tile, discardMode: action.discardMode };
    });
    const red = ArenaBlindObservationSchema.parse({ ...observation, candidates });
    for (const flag of [false, true]) expect(mapArenaDirectAnswer({ tile: "5p", red: flag }, red)).toMatchObject({ status: "valid", submission: { actionRef: candidates[Number(flag)]!.actionRef } });
    const equivalent = ArenaBlindObservationSchema.parse({ ...observation, candidates: candidates.map(c => ({ ...c, discardMode: "tsumogiri", actionRef: canonicalActionRef({ kind: "discard", tile: c.tile, discardMode: "tsumogiri" }) })) });
    expect(mapArenaDirectAnswer({ tile: "5p", red: true }, equivalent)).toMatchObject({ status: "valid", submission: { actionRef: equivalent.candidates[1]!.actionRef } });
    // Multiple canonical classes with the same tile must never be resolved by score or order.
    expect(mapArenaDirectAnswer({ tile: "5p", red: false }, { ...red, candidates: [...red.candidates, equivalent.candidates[0]!] }).status).toBe("invalid");
  });
  it("changes only enabled content and keeps fixed material independent of the scenario prompt", async () => {
    const { observation, aliases } = makeArenaMcpCase();
    const base = assembleArenaExperiment({ observation, config: ARENA_RAW_BASELINE });
    const candidates = assembleArenaExperiment({ observation, config: { ...ARENA_RAW_BASELINE, legalCandidates: true } });
    expect(candidates.messages[0]).toEqual(base.messages[0]);
    expect(candidates.modules.raw).toEqual(base.modules.raw);
    expect(candidates.modules.legalCandidates).toEqual(observation.candidates);
    const retriever = createArenaRagRetriever({ mode: "local", caseRef: observation.caseRef, aliases });
    const config = { ...ARENA_RAW_BASELINE, teaching: "on" as const };
    const material = await retriever.query({ query: selectionFor(observation).query, limit: 3 });
    const off = assembleArenaExperiment({ observation, config, material, selection: selectionFor(observation) });
    const on = assembleArenaExperiment({ observation, config: { ...config, scenarioHint: true }, material, selection: selectionFor(observation), scenario: scenarioFor(observation) });
    expect(on.modules.material).toEqual(off.modules.material);
    expect(on.routing).toEqual(off.routing);
    expect(on.modules.raw).toEqual(off.modules.raw);
    expect(on.messages[0]).toEqual(off.messages[0]);
    const comparison = assembleArenaExperiment({ observation, config: { ...ARENA_RAW_BASELINE, comparison: true } });
    expect(comparison.modules).toEqual(base.modules);
    expect(comparison.messages[0]).not.toEqual(base.messages[0]);
    const explain = assembleArenaExperiment({ observation, config: { ...ARENA_RAW_BASELINE, explanation: true } });
    expect(explain.outputSchema.required).toContain("rationale");
    expect(base.outputSchema.required).not.toContain("rationale");
    const packet = scenarioFor(observation);
    const frozen = assembleArenaExperiment({ observation, config: { ...ARENA_RAW_BASELINE, scenarioHint: true }, scenario: packet });
    packet.content.matches[0]!.hint = "mutated-after-freeze";
    expect(JSON.stringify(frozen.modules)).not.toContain("mutated-after-freeze");
    expect(() => assembleArenaExperiment({ observation, config: ARENA_RAW_BASELINE, material })).toThrow("arena_module_material_mismatch");
    expect(() => assembleArenaExperiment({ observation, config: { ...ARENA_RAW_BASELINE, helperFacts: true, legalCandidates: true } })).toThrow("arena_module_helper_mismatch");
  });
  it("routes material on raw public scenario data and records whether actual passages differ", async () => {
    const { observation, aliases } = makeArenaMcpCase();
    const scenario = structuredClone(observation);
    const ref = scenario.visibleState.rivers[1]![0]!.sourceRef;
    scenario.visibleState.riichiStates[1] = { actor: 1, status: "accepted", declarationEventRef: ref, acceptanceEventRef: ref, ippatsuAlive: false };
    const config = { ...ARENA_RAW_BASELINE, teaching: "on" as const, materialRouting: "scenario" as const };
    const retriever = createArenaRagRetriever({ mode: "local", caseRef: observation.caseRef, aliases });
    const aQuery = "进张计数", bQuery = "复合牌形";
    expect(aQuery).not.toBe(bQuery);
    const a = assembleArenaExperiment({ observation, config, material: await retriever.query({ query: aQuery, limit: 3 }), selection: selectionFor(observation, "scenario", aQuery) });
    const b = assembleArenaExperiment({ observation: scenario, config, material: await retriever.query({ query: bQuery, limit: 3 }), materialBaseline: a.modules.material, selection: selectionFor(scenario, "scenario", bQuery) });
    expect(a.modules.material?.passages.length).toBeGreaterThan(0);
    expect(a.routing?.passageDigest).not.toBe(b.routing?.passageDigest);
    expect(a.routing?.changedFromFixed).toBe(false); expect(b.routing?.changedFromFixed).toBe(true);
    const fixed = { ...config, materialRouting: "fixed" as const };
    expect(selectionFor(observation).query).toBe(selectionFor(scenario).query);
    // A route that returns identical material is recorded as identical, not a successful intervention.
    const same = assembleArenaExperiment({ observation, config: { ...fixed, scenarioHint: true }, material: a.modules.material, selection: selectionFor(observation), scenario: scenarioFor(observation) });
    expect(same.routing?.passageDigest).toBe(a.routing?.passageDigest);
  });
  it("isolates helper data from raw state and rejects cross-case facts", () => {
    const { observation } = makeArenaMcpCase();
    const helper = { schemaVersion: "blind-discard-arena-mcp-result/v1", caseRef: observation.caseRef, facts: [{
      caseRef: observation.caseRef, actionRef: observation.candidates[0]!.actionRef, dimension: "shanten", status: "available", value: 2, unit: "shanten",
      sourceRef: observation.visibleState.rivers[0]![0]!.sourceRef, evidenceRefs: [], producer: { kind: "adapter", name: "blind-discard-arena-mcp", version: "1.0.0" },
    }] };
    const config = { ...ARENA_RAW_BASELINE, legalCandidates: true, helperFacts: true };
    const withHelper = assembleArenaExperiment({ observation, config, helper });
    const without = assembleArenaExperiment({ observation, config: { ...config, helperFacts: false } });
    expect(withHelper.modules.raw).toEqual(without.modules.raw);
    expect(withHelper.modules.legalCandidates).toEqual(without.modules.legalCandidates);
    expect(withHelper.modules.helper).toEqual(helper);
    expect(() => assembleArenaExperiment({ observation, config: ARENA_RAW_BASELINE, helper })).toThrow("arena_module_helper_mismatch");
    expect(() => assembleArenaExperiment({ observation, config, helper: { ...helper, facts: helper.facts.map(f => ({ ...f, caseRef: "arena-case:v1:00000000-0000-4000-8000-000000000999" })) } })).toThrow("arena_module_helper_binding_mismatch");
  });
  it("preserves raw meld/riichi/dora/score coordinates while discarding derived state", () => {
    const { observation } = makeArenaMcpCase();
    const ref = observation.visibleState.rivers[0]![0]!.sourceRef;
    const state = structuredClone(observation);
    state.rawEventOrder = [ref];
    state.visibleState.scores = [12000, 27000, 36000, 25000];
    state.visibleState.honba = 2; state.visibleState.riichiSticks = 3;
    state.visibleState.doraIndicators = [{ id: "5p", red: true }, { id: "6s", red: false }];
    state.visibleState.melds = [{ actor: 2, kind: "pon", targetActor: 1, calledTile: { id: "7z", red: false }, consumedTiles: [{ id: "7z", red: false }, { id: "7z", red: false }], meldRef: ref, createdEventRef: ref, latestEventRef: ref, calledDiscardEventRef: ref }];
    state.visibleState.riichiStates[3] = { actor: 3, status: "declared", declarationEventRef: ref, acceptanceEventRef: null, ippatsuAlive: true };
    const raw = assembleArenaExperiment({ observation: state, config: ARENA_RAW_BASELINE }).modules.raw;
    expect(raw.melds).toEqual(state.visibleState.melds);
    expect(raw.riichiStates[3]).toEqual({ actor: 3, status: "declared", declarationEventRef: ref, acceptanceEventRef: null });
    expect(raw.doraIndicators).toEqual(state.visibleState.doraIndicators);
    expect(raw.scores).toEqual(state.visibleState.scores); expect(raw.honba).toBe(2); expect(raw.riichiSticks).toBe(3);
    expect(raw.eventOrder).toEqual([ref]);
    expect(raw.self).not.toHaveProperty("furiten"); expect(raw.riichiStates[3]).not.toHaveProperty("ippatsuAlive");
  });
  it("captures a real loopback HTTP request through the existing provider, locks direct JSON once and reopens it", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase({ includeRawEventOrder: true });
    let calls = 0, captured: Record<string, any> = {};
    const server = createServer(async (request, response) => {
      calls++;
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      captured = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      expect(request.url).toBe("/v1/chat/completions");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"tile":"1m","red":false}' } }], usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("address_invalid");
      const provider = createOpenAiArenaToolCallProvider({ settings: { baseUrl: "https://synthetic.test/v1", modelName: "synthetic-local" }, credentials: { readKey: async () => "synthetic-not-a-credential" }, fetchImpl: async (url, init) => { expect(String(url)).toBe("https://synthetic.test/v1/chat/completions"); return fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, init); } });
      const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, provider, tools: [], experiment: ARENA_RAW_BASELINE });
      expect(calls).toBe(1);
      expect(run.status).toBe("completed"); expect(run.toolCallCount).toBe(0); expect(run.providerTurnCount).toBe(1);
      expect(run.attempt).toMatchObject({ status: "submitted", submission: { format: "tile-red/v1", tile: "1m", red: false } });
      expect(ArenaCoachRunResultSchema.parse(JSON.parse(JSON.stringify(run)))).toEqual(run);
      expect(captured).not.toHaveProperty("tools"); expect(captured).not.toHaveProperty("tool_choice");
      expect(captured.response_format.json_schema.schema.required).toEqual(["tile", "red"]);
      expect(captured.response_format.json_schema.schema.properties.tile.enum).toHaveLength(34);
      const text = JSON.stringify(captured);
      for (const forbidden of ["actionRef", "furiten", "shanten", "genbutsu", "rationale", "decisionSummary", "search_knowledge", "analyze_candidates", "gameId-CANARY", "recordId-CANARY"]) expect(text).not.toContain(forbidden);
      const audit = run.events.find(e => e.type === "request_audit");
      expect(audit?.type === "request_audit" && audit.audit.request).toEqual(captured);
      expect(audit?.type === "request_audit" && audit.audit.digest).toBe(createHash("sha256").update(JSON.stringify(captured)).digest("hex"));
      const preview = run.events.find(e => e.type === "request_prepared");
      expect(preview?.type === "request_prepared" && preview.request.messages).toEqual(captured.messages);
      if (process.env.RIICHI_ARENA_CAPTURE) {
        await mkdir(dirname(process.env.RIICHI_ARENA_CAPTURE), { recursive: true });
        await writeFile(process.env.RIICHI_ARENA_CAPTURE, JSON.stringify({ realModelCalls: 0, request: captured, audit, run, assemblyDigest: arenaContentDigest(captured), versions: { node: process.versions.node, adapter: "arena-openai/v2" } }, null, 2));
      }
      const interruptedEvents = run.events.filter(e => e.type !== "run_terminal" && e.type !== "submission_locked" && e.type !== "provider_turn");
      const trace = run.events.map(event => ({ schemaVersion: "blind-discard-arena-case-trace/v1" as const, caseOrdinal: 0, event }));
      const plan = arenaDirectDispatchPlan({ caseCount: 3, maxActualRequests: 2, trace, completedOrdinals: [] });
      expect(plan).toEqual({ reservedRequestCount: 1, interrupted: [0], pending: [1], deferredByCap: [2] });
      expect(arenaDirectDispatchPlan({ caseCount: 3, maxActualRequests: 2, trace, completedOrdinals: [0] }).pending).toEqual([1]);
      expect(arenaDirectDispatchPlan({ caseCount: 3, maxActualRequests: 1, trace, completedOrdinals: [0] }).pending).toEqual([]);
      expect(() => arenaDirectDispatchPlan({ caseCount: 3, maxActualRequests: 3, trace: [...trace, ...trace], completedOrdinals: [] })).toThrow("arena_dispatch_journal_invalid");
      const recovered = recoverInterruptedArenaRun({ events: interruptedEvents, binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } });
      expect(recovered.status).toBe("cancelled"); expect(recovered.providerTurnCount).toBe(1); expect(recovered.providerUsage.status).toBe("unknown"); expect(calls).toBe(1);
      const completed = recoverInterruptedArenaRun({ events: run.events, binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } });
      expect(completed.attempt).toEqual(run.attempt); expect(calls).toBe(1);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it.each(["", "{}", "broken JSON", '{"tile":"9s","red":false}', '{"tile":"1m","red":false,"rationale":"extra"}'])("never repairs or re-asks invalid direct output %j", async content => {
    const { observation, authorizedCase } = makeArenaMcpCase(); let calls = 0;
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: ARENA_RAW_BASELINE,
      provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async () => { calls++; return { status: "final", content, outputBytes: Buffer.byteLength(content) }; } } });
    expect(run.events).toContainEqual({ type: "provider_final", content, parseStatus: "invalid" });
    expect(run.status).toBe("invalid_submission"); expect(run.score.failures.invalidSubmission).toBe(1); expect(calls).toBe(1);
  });
  it("refuses an unverified real request boundary before spawn rather than charging a raw baseline", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase();
    const provider = createCodexArenaToolCallProvider({ modelName: "gpt-6.1-terra", reasoningEffort: "high",
      processPort: { findExecutable: () => { throw new Error("must_not_spawn"); } } as any });
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, provider, tools: [], experiment: ARENA_RAW_BASELINE });
    expect(run.status).toBe("provider_unavailable");
    expect(run.events).toContainEqual(expect.objectContaining({ type: "provider_turn", failureCode: "request_boundary_unverified" }));
    expect(run.events).toContainEqual(expect.objectContaining({ type: "request_audit", audit: expect.objectContaining({ visibility: "unobservable" }) }));
  });
  it.each(["error", "timeout"])("accounts for module preparation %s without sending an incomplete prompt", async mode => {
    const { observation, authorizedCase } = makeArenaMcpCase(); let calls = 0;
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      tools: [], experiment: { ...ARENA_RAW_BASELINE, teaching: "on" }, limits: { maxToolCallDurationMs: 10 },
      prepareModules: async ({ signal }) => {
        if (mode === "error") throw new Error("private source path must not escape");
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      },
      provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async () => { calls++; return { status: "provider_error" }; } } });
    expect(calls).toBe(0); expect(run.status).toBe("tool_failure"); expect(run.score.failures.toolFailure).toBe(1);
    expect(run.providerTurnCount).toBe(0); expect(JSON.stringify(run)).not.toContain("private source path");
    expect(run.events.some(e => e.type === "request_prepared")).toBe(false);
  });
  it("refuses dispatch when the durable request journal fails", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase(); let calls = 0;
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: ARENA_RAW_BASELINE,
      onEvent: event => { if (event.type === "request_prepared") throw new Error("disk_unavailable"); },
      provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async () => { calls++; return { status: "provider_error" }; } } });
    expect(calls).toBe(0); expect(run.status).toBe("budget_exhausted");
  });
  it("retains frozen config when the event budget cannot even fit run_started", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase(); let calls = 0;
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: ARENA_RAW_BASELINE, limits: { maxRunEventBytes: 1 },
      provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async () => { calls++; return { status: "provider_error" }; } } });
    expect(calls).toBe(0); expect(run.status).toBe("budget_exhausted"); expect(run.experiment).toEqual(ARENA_RAW_BASELINE);
  });
  it("injects actual versioned pattern output through a raw-only source port", async () => {
    const { observation, authorizedCase } = makeArenaMcpCase(); let sent: any;
    const run = await runBlindCoachCase({ observation, grading: { binding: authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } }, tools: [], experiment: { ...ARENA_RAW_BASELINE, scenarioHint: true },
      prepareModules: async context => {
        expect(context).not.toHaveProperty("observation"); expect(context).not.toHaveProperty("facts"); expect(context.candidates).toEqual([]);
        expect(context.raw.self).not.toHaveProperty("furiten");
        return { scenario: { sourceId: "real-module-port-fixture", version: "test/v2", requiresHelper: false, inputDigest: arenaContentDigest(context.raw), content: { matches: ["explicit-fixture-output"] } } };
      },
      provider: { descriptor: () => ({ providerId: "synthetic", model: "local", protocolVersion: "arena-function-call/v1" }), request: async request => { sent = request; return { status: "final", content: '{"tile":"1m","red":false}', outputBytes: 25 }; } } });
    expect(run.status).toBe("completed");
    expect(JSON.stringify(sent)).toContain("explicit-fixture-output"); expect(JSON.stringify(sent)).not.toContain("furiten");
    const start = run.events.find(event => event.type === "run_started");
    expect(start?.experiment?.sources?.scenario).toMatchObject({ sourceId: "real-module-port-fixture", version: "test/v2" });
  });
});
