import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it, vi } from "vitest";
import { type ActionRef, type ArenaCoachSubmission, type LlmTokenUsage } from "@riichi-coach/contracts";
import { ArenaMcpClient, type ArenaMcpAuthorizedCase } from "../src/blind-discard-arena-mcp.js";
import {
  ARENA_RUN_LIMITS_V1,
  createArenaMcpRunnerTool,
  createArenaRagRunnerTool,
  runBlindCoachCase,
  type ArenaRunnerApplicabilityGate,
  type ArenaRunnerTool,
  type ArenaRunEvent,
} from "../src/blind-discard-arena-runner.js";
import { createArenaRagApplicabilityGate } from "../src/blind-discard-arena-rag-applicability.js";
import { ArenaProviderRequestSchema, type ArenaProviderMessage, type ArenaProviderRequest, type ArenaToolCallProvider, type ArenaToolCallProviderResult } from "../src/blind-discard-arena-provider.js";
import { createArenaRagRetriever } from "../src/blind-discard-arena-rag.js";
import { arenaFixtureCanaries, makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";

function toolCall(name: string, args: unknown, outputBytes = 200) {
  return { status: "ready" as const, call: { name, arguments: JSON.stringify(args) }, outputBytes, decisionSummary: "根据可见输入选择下一步操作。" };
}

function finalSubmission(caseRef: string, actionRefs: readonly ActionRef[]): ArenaCoachSubmission {
  return {
    caseRef,
    actionRef: actionRefs[0]!,
    rationale: "This choice follows the visible decision-time observation.",
    evidenceRefs: [],
    sourceRefs: [],
    mainAlternative: {
      actionRef: actionRefs[1]!,
      reasonNotChosen: "The visible observation supports the selected choice more directly.",
    },
    uncertainty: "No additional facts were available.",
  };
}

function offRagTool(caseRef: string): ArenaRunnerTool {
  return createArenaRagRunnerTool({
    caseRef,
    retriever: createArenaRagRetriever({ mode: "off", caseRef }),
  });
}

function immediateSubmissionProvider(caseRef: string, actionRefs: readonly ActionRef[]): ArenaToolCallProvider {
  return {
    descriptor: () => ({ providerId: "test-provider", model: "cleanup-test", protocolVersion: "arena-function-call/v1" }),
    async request() {
      return toolCall("submit_decision", finalSubmission(caseRef, actionRefs));
    },
  };
}

function messagesWithLastToolResult(messages: readonly ArenaProviderMessage[]): string {
  const tools = messages.filter((message) => message.role === "tool");
  return tools.map((message) => message.role === "tool" ? message.content : "").join("\n");
}

const fixturePath = fileURLToPath(new URL("./fixtures/arena-mcp-stdio-server.mjs", import.meta.url));
const coachDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

async function startMcp(authorizedCase: ArenaMcpAuthorizedCase) {
  const context = JSON.stringify({ authorizedCases: [authorizedCase], helper: "fixture", behavior: "normal" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixturePath],
    cwd: coachDir,
    env: { ARENA_MCP_TEST_CONTEXT: context },
    stderr: "pipe",
  });
  const client = new ArenaMcpClient();
  await client.connect(transport);
  return client;
}

function scriptedProvider(input: {
  actionRefs: readonly ActionRef[];
  seenRequests: string[];
  expectedShanten?: number;
}): ArenaToolCallProvider {
  let turn = 0;
  return {
    descriptor: () => ({ providerId: "test-provider", model: "tool-loop-test", protocolVersion: "arena-function-call/v1" }),
    async request(request: ArenaProviderRequest) {
      turn += 1;
      const wire = JSON.stringify(request);
      input.seenRequests.push(wire);
      expect(wire).not.toContain(arenaFixtureCanaries.gameIdCanary);
      expect(wire).not.toContain(arenaFixtureCanaries.recordIdCanary);
      expect(wire).not.toContain("candidate_mismatch");
      if (turn === 1) {
        return toolCall("search_knowledge", {
          query: "复合牌形 共享牌张",
          limit: 1,
        });
      }
      if (turn === 2) {
        const previous = messagesWithLastToolResult(request.messages);
        expect(previous).toContain("共享牌张误当成互不相关的块");
        const observation = JSON.parse(request.messages[1]!.role === "user" ? request.messages[1]!.content.slice("Blind observation JSON:\n".length) : "{}");
        return toolCall("analyze_candidates", {
          caseRef: observation.caseRef,
          actionRefs: [input.actionRefs[0]],
          dimensions: ["shanten"],
        });
      }
      const toolTranscript = messagesWithLastToolResult(request.messages);
      expect(toolTranscript).toContain("arena-ref:v1:");
      expect(toolTranscript).toContain("shanten");
      const observations = request.messages.filter((message) => message.role === "user");
      const observation = JSON.parse(observations[0]!.role === "user" ? observations[0]!.content.slice("Blind observation JSON:\n".length) : "{}");
      const returned = request.messages.filter((message) => message.role === "tool").map((message) => JSON.parse(message.role === "tool" ? message.content : "{}"));
      const knowledge = returned[0].data;
      const helper = returned[1].data;
      const fact = helper.facts[0];
      expect(knowledge.status).toBe("hits");
      expect(knowledge.passages[0].content).toContain("共享牌张");
      const sourceRef = knowledge.sourceRefs[0] as string;
      if (input.expectedShanten !== undefined) expect(fact.value).toBe(input.expectedShanten);
      const submission: ArenaCoachSubmission = {
        caseRef: observation.caseRef,
        actionRef: input.actionRefs[0]!,
        rationale: `The retrieved shape passage warns against treating shared tiles as unrelated blocks; the helper reports ${fact.value} shanten for this offered discard.`,
        evidenceRefs: fact.evidenceRefs,
        sourceRefs: [sourceRef, fact.sourceRef],
        mainAlternative: { actionRef: input.actionRefs[1]!, reasonNotChosen: "It loses the connected extension described by the retrieved passage." },
        uncertainty: "The helper reports shanten and effective tiles, not complete strategic value.",
      };
      return toolCall("submit_decision", submission);
    },
  };
}

describe("Blind Discard Arena runner", () => {
  it("keeps large observed citation sets constrained and still rejects source/evidence mixups", async () => {
    const testCase = makeArenaMcpCase();
    const sourceRefs = Array.from({ length: 130 }, (_, i) => testCase.aliases.reference(`source-only-${i}`));
    let turn = 0;
    const result = await runBlindCoachCase({ observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: { descriptor: () => ({ providerId: "test-provider", model: "citation-test", protocolVersion: "arena-function-call/v1" }),
        async request(request) {
          turn += 1;
          if (turn === 1) return toolCall("search_knowledge", { query: "牌效", limit: 1 });
          const final = request.tools.find(tool => tool.function.name === "submit_decision")!;
          const properties = final.function.parameters.properties as Record<string, { items: { enum?: string[] } }>;
          expect(properties.sourceRefs!.items.enum).toEqual(expect.arrayContaining(sourceRefs));
          expect(properties.evidenceRefs!.items.enum).not.toContain(sourceRefs[129]);
          const submission = finalSubmission(testCase.observation.caseRef, testCase.observation.candidates.map(row => row.actionRef));
          // A reference returned as a source is not automatically evidence.
          return toolCall("submit_decision", { ...submission, evidenceRefs: [sourceRefs[129]], sourceRefs: [sourceRefs[129]] });
        } },
      tools: [{ ...offRagTool(testCase.observation.caseRef),
        async execute() { return { sourceRefs }; }, parseOutput: raw => raw,
        references: () => ({ evidenceRefs: [], sourceRefs }) }],
    });
    expect(result.status).toBe("invalid_submission");
    expect(result.providerTurnCount).toBe(2);
    expect(result.events).toContainEqual({ type: "submission_rejected", reason: "reference_not_observed" });
    expect(result.events.some(row => row.type === "submission_locked")).toBe(false);
  });

  it("advertises empty citation arrays when the observation contains no references", async () => {
    const testCase = makeArenaMcpCase();
    const observation = structuredClone(testCase.observation);
    observation.visibleState.self.currentDraw = null;
    observation.visibleState.self.evidenceRefs = [];
    observation.visibleState.self.meldRefs = [];
    observation.visibleState.rivers = [[], [], [], []];
    observation.visibleState.melds = [];
    for (const state of observation.visibleState.riichiStates) { state.declarationEventRef = null; state.acceptanceEventRef = null; }
    for (const state of Object.values(observation.visibleState.self.furiten)) state.evidenceIds = [];
    const result = await runBlindCoachCase({ observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: { descriptor: () => ({ providerId: "test-provider", model: "empty-citation-test", protocolVersion: "arena-function-call/v1" }),
        async request(request) {
          const final = request.tools.find(tool => tool.function.name === "submit_decision")!;
          expect(final.function.parameters).toMatchObject({ properties: { evidenceRefs: { maxItems: 0 }, sourceRefs: { maxItems: 0 } } });
          return toolCall("submit_decision", finalSubmission(observation.caseRef, observation.candidates.map(row => row.actionRef)));
        } }, tools: [] });
    expect(result.status).toBe("completed");
  });

  it("preserves reported tokens and a bounded diagnostic code on a failed model call", async () => {
    const testCase = makeArenaMcpCase();
    const result = await runBlindCoachCase({ observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: { descriptor: () => ({ providerId: "test-provider", model: "failure-test", protocolVersion: "arena-function-call/v1" }),
        async request() { return { status: "provider_error", failureCode: "invalid_model_response", usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 } }; } },
      tools: [offRagTool(testCase.observation.caseRef)] });
    expect(result.status).toBe("provider_error");
    expect(result.providerUsage).toMatchObject({ status: "reported", tokens: { totalTokens: 13 }, providerTurnCount: 1 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: "provider_turn", failureCode: "invalid_model_response", usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 } }));
  });
  it("lets the model choose local retrieval and real stdio MCP queries before locking and grading", async () => {
    const testCase = makeArenaMcpCase();
    const client = await startMcp(testCase.authorizedCase);
    const mcpTool = await createArenaMcpRunnerTool({ client, caseRef: testCase.observation.caseRef });
    const retriever = createArenaRagRetriever({
      mode: "local",
      caseRef: testCase.observation.caseRef,
      aliases: testCase.aliases,
    });
    const ragTool = createArenaRagRunnerTool({ retriever, caseRef: testCase.observation.caseRef });
    const seenRequests: string[] = [];
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const provider = scriptedProvider({ actionRefs, seenRequests });
    const observed: ArenaRunEvent[] = [];
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: {
        binding: testCase.authorizedCase.binding,
        reference: { status: "unavailable", reason: "mortal_unavailable" },
      },
      provider,
      tools: [mcpTool, ragTool],
      onEvent(event) { observed.push(structuredClone(event)); if (event.type === "provider_turn") event.decisionSummary = "observer mutation"; },
    });

    expect(observed).toEqual(result.events);
    expect(observed[0]).toMatchObject({ type: "run_started", observation: testCase.observation });
    expect(observed.find(event => event.type === "provider_turn")).toMatchObject({ decisionSummary: "根据可见输入选择下一步操作。" });
    expect(observed.filter(event => event.type === "tool_call" || event.type === "tool_result").every(event => "elapsedMs" in event && typeof event.elapsedMs === "number")).toBe(true);
    expect(JSON.stringify(observed)).not.toContain(arenaFixtureCanaries.gameIdCanary);
    expect(JSON.stringify(observed)).not.toContain(arenaFixtureCanaries.recordIdCanary);
    expect(result.status).toBe("completed");
    expect(result.attempt.status).toBe("submitted");
    expect(result.providerTurnCount).toBe(3);
    expect(result.toolCallCount).toBe(2);
    expect(result.recoverableToolFailureCount).toBe(0);
    expect(result.events.filter((event) => event.type === "tool_call").map((event) => event.toolName))
      .toEqual(["search_knowledge", "analyze_candidates"]);
    expect(result.events.find((event) => event.type === "tool_call" && event.toolName === "search_knowledge"))
      .toMatchObject({ request: { query: "复合牌形 共享牌张", limit: 1 } });
    expect(seenRequests).toHaveLength(3);
    expect(result.events.map((event) => event.type)).toContain("submission_locked");
    expect(result.score.includedCaseCount).toBe(1);
    expect(result.score.failures.labelUnavailable).toBe(1);
    expect(JSON.stringify(result)).not.toContain(arenaFixtureCanaries.gameIdCanary);
    expect(JSON.stringify(result)).not.toContain(arenaFixtureCanaries.recordIdCanary);
    expect(JSON.stringify(result)).not.toContain("hidden chain-of-thought");
    expect(JSON.stringify(result)).not.toContain("course.lesson.0006");
    expect(JSON.stringify(result)).not.toContain("course/lessons/");
  });

  it("retains a failed tool attempt and lets the model continue without inventing a result", async () => {
    const testCase = makeArenaMcpCase();
    const baseTool = createArenaRagRunnerTool({
      caseRef: testCase.observation.caseRef,
      retriever: createArenaRagRetriever({
        mode: "local",
        caseRef: testCase.observation.caseRef,
        aliases: testCase.aliases,
      }),
    });
    let turn = 0;
    const failingTool: ArenaRunnerTool = {
      ...baseTool,
      async execute() { throw new Error("private path or provider prose must not escape"); },
    };
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "recovery-test", protocolVersion: "arena-function-call/v1" }),
      async request(request) {
        turn += 1;
        if (turn === 1) return toolCall("search_knowledge", { query: "shape", limit: 1 });
        expect(messagesWithLastToolResult(request.messages)).toContain('"code":"tool_failed"');
        const submission: ArenaCoachSubmission = {
          caseRef: testCase.observation.caseRef,
          actionRef: testCase.observation.candidates[0]!.actionRef,
          rationale: "No retrieval result was available, so this choice uses only the visible observation.",
          evidenceRefs: [],
          sourceRefs: [],
          mainAlternative: { actionRef: testCase.observation.candidates[1]!.actionRef, reasonNotChosen: "The visible observation supports the selected candidate more directly." },
          uncertainty: "The local knowledge search failed.",
        };
        return toolCall("submit_decision", submission);
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [failingTool],
    });

    expect(result.status).toBe("completed");
    expect(result.toolFailureCount).toBe(1);
    expect(result.recoverableToolFailureCount).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "tool_result", status: "error", code: "tool_failed" }));
    expect(JSON.stringify(result)).not.toContain("private path or provider prose");
  });

  it("records an MCP disconnect as a sanitized failed query and continues without a fabricated result", async () => {
    const testCase = makeArenaMcpCase();
    const client = await startMcp(testCase.authorizedCase);
    const mcpTool = await createArenaMcpRunnerTool({ client, caseRef: testCase.observation.caseRef });
    await client.close();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    let turn = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "mcp-disconnect-test", protocolVersion: "arena-function-call/v1" }),
      async request(request) {
        turn += 1;
        if (turn === 1) {
          return toolCall("analyze_candidates", {
            caseRef: testCase.observation.caseRef,
            actionRefs: [actionRefs[0]],
            dimensions: ["shanten"],
          });
        }
        expect(messagesWithLastToolResult(request.messages)).toContain('"code":"tool_failed"');
        return toolCall("submit_decision", finalSubmission(testCase.observation.caseRef, actionRefs));
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [mcpTool],
    });

    expect(result.status).toBe("completed");
    expect(result.toolFailureCount).toBe(1);
    expect(result.recoverableToolFailureCount).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_call",
      toolName: "analyze_candidates",
      request: expect.objectContaining({ actionRefs: [actionRefs[0]] }),
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_result",
      toolName: "analyze_candidates",
      status: "error",
      code: "tool_failed",
    }));
    expect(JSON.stringify(result)).not.toContain("mcp_call_failed");
  });

  it("binds off-mode retrieval to the case without loading the corpus", async () => {
    const testCase = makeArenaMcpCase();
    const loadCorpus = vi.fn(async () => {
      throw new Error("off_mode_must_not_load_the_corpus");
    });
    const ragTool = createArenaRagRunnerTool({
      caseRef: testCase.observation.caseRef,
      retriever: createArenaRagRetriever({
        mode: "off",
        caseRef: testCase.observation.caseRef,
        loadCorpus,
      }),
    });
    const parsed = ragTool.parseInput({ query: "shape flexibility", limit: 2 });
    const output = await ragTool.execute(parsed, {
      caseRef: testCase.observation.caseRef,
      signal: new AbortController().signal,
    });
    const result = ragTool.parseOutput(output) as { status: string; caseRef: string };

    expect(loadCorpus).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "disabled", caseRef: testCase.observation.caseRef });
    expect(ragTool.references(result)).toEqual({ evidenceRefs: [], sourceRefs: [] });
    expect(() => ragTool.parseInput({ query: "shape flexibility", limit: 2, caseRef: testCase.observation.caseRef })).toThrow();
  });

  it("records a timed out tool call and can finish with an honest submission", async () => {
    const testCase = makeArenaMcpCase();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const baseTool = offRagTool(testCase.observation.caseRef);
    const slowTool: ArenaRunnerTool = {
      ...baseTool,
      async execute(_input, context) {
        return await new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("tool operation stopped")), { once: true });
        });
      },
    };
    let turn = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "tool-timeout-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        turn += 1;
        return turn === 1
          ? toolCall("search_knowledge", { query: "shape", limit: 1 })
          : toolCall("submit_decision", finalSubmission(testCase.observation.caseRef, actionRefs));
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [slowTool],
      limits: { maxToolCallDurationMs: 1 },
    });

    expect(result.status).toBe("completed");
    expect(result.toolFailureCount).toBe(1);
    expect(result.recoverableToolFailureCount).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_result",
      toolName: "search_knowledge",
      status: "error",
      code: "tool_timeout",
    }));
  });

  it("bounds cleanup after a tool timeout and continues after force disposal", async () => {
    const testCase = makeArenaMcpCase();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    let turn = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "cleanup-timeout-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        turn += 1;
        return turn === 1
          ? toolCall("search_knowledge", { query: "shape", limit: 1 })
          : toolCall("submit_decision", finalSubmission(testCase.observation.caseRef, actionRefs));
      },
    };
    const forceDispose = vi.fn();
    const stuckDisposer: ArenaRunnerTool = {
      ...offRagTool(testCase.observation.caseRef),
      async execute(_input, context) {
        return await new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("tool operation stopped")), { once: true });
        });
      },
      async dispose() {
        await new Promise<void>(() => undefined);
      },
      forceDispose,
    };

    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [stuckDisposer],
      limits: { maxToolCallDurationMs: 20, maxRunElapsedMs: 5000 },
    });

    expect(result.status).toBe("completed");
    expect(result.toolFailureCount).toBe(1);
    expect(result.elapsedMs).toBeLessThan(1000);
    expect(forceDispose).toHaveBeenCalledTimes(1);
  });

  it("preserves a cancelled tool request and terminal status", async () => {
    const testCase = makeArenaMcpCase();
    const controller = new AbortController();
    let signalToolStarted!: () => void;
    const toolStarted = new Promise<void>((resolve) => { signalToolStarted = resolve; });
    const abortWhenStarted = toolStarted.then(() => controller.abort());
    const slowTool: ArenaRunnerTool = {
      ...offRagTool(testCase.observation.caseRef),
      async execute(_input, context) {
        signalToolStarted();
        return await new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("tool operation stopped")), { once: true });
        });
      },
    };
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "tool-cancel-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        return toolCall("search_knowledge", { query: "shape", limit: 1 });
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [slowTool],
      signal: controller.signal,
    });
    await abortWhenStarted;

    expect(result.status).toBe("cancelled");
    expect(result.attempt.status).toBe("cancelled");
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_call",
      toolName: "search_knowledge",
      request: { query: "shape", limit: 1 },
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_result",
      toolName: "search_knowledge",
      status: "error",
      code: "run_cancelled",
    }));
    expect(result.score.failures.cancelled).toBe(1);
  });

  it("keeps slow tool cleanup inside the run deadline and force disposes on timeout", async () => {
    const testCase = makeArenaMcpCase();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const forceDispose = vi.fn();
    const slowDisposer: ArenaRunnerTool = {
      ...offRagTool(testCase.observation.caseRef),
      async dispose() {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
      },
      forceDispose,
    };

    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: immediateSubmissionProvider(testCase.observation.caseRef, actionRefs),
      tools: [slowDisposer],
      limits: { maxRunElapsedMs: 30 },
    });

    expect(result.status).toBe("timeout");
    expect(result.attempt.status).toBe("timeout");
    expect(result.score.failures.timeout).toBe(1);
    expect(forceDispose).toHaveBeenCalledTimes(1);
  });

  it("returns on the run deadline when a disposer never settles", async () => {
    const testCase = makeArenaMcpCase();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const forceDispose = vi.fn();
    const stuckDisposer: ArenaRunnerTool = {
      ...offRagTool(testCase.observation.caseRef),
      async dispose() {
        await new Promise<void>(() => undefined);
      },
      forceDispose,
    };

    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: immediateSubmissionProvider(testCase.observation.caseRef, actionRefs),
      tools: [stuckDisposer],
      limits: { maxRunElapsedMs: 30 },
    });

    expect(result.status).toBe("timeout");
    expect(result.attempt.status).toBe("timeout");
    expect(result.score.failures.timeout).toBe(1);
    expect(forceDispose).toHaveBeenCalledTimes(1);
  });

  it("locks timeout when cleanup reaches the run deadline before the clock does", async () => {
    vi.useFakeTimers();
    try {
      const testCase = makeArenaMcpCase();
      const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
      let now = 1_000;
      let signalDisposeStarted!: () => void;
      const disposeStarted = new Promise<void>((resolve) => { signalDisposeStarted = resolve; });
      const forceDispose = vi.fn();
      const stuckDisposer: ArenaRunnerTool = {
        ...offRagTool(testCase.observation.caseRef),
        async dispose() {
          signalDisposeStarted();
          await new Promise<void>(() => undefined);
        },
        forceDispose,
      };
      const provider: ArenaToolCallProvider = {
        descriptor: () => ({ providerId: "test-provider", model: "cleanup-deadline-test", protocolVersion: "arena-function-call/v1" }),
        async request() {
          now += 1;
          return toolCall("submit_decision", finalSubmission(testCase.observation.caseRef, actionRefs));
        },
      };
      const run = runBlindCoachCase({
        observation: testCase.observation,
        grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
        provider,
        tools: [stuckDisposer],
        clock: () => now,
        limits: { maxRunElapsedMs: 30 },
      });

      await disposeStarted;
      await vi.advanceTimersByTimeAsync(29);
      const result = await run;

      expect(result.status).toBe("timeout");
      expect(result.attempt.status).toBe("timeout");
      expect(result.score.failures.timeout).toBe(1);
      expect(forceDispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels cleanup waits and force disposes when the caller aborts", async () => {
    const testCase = makeArenaMcpCase();
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const controller = new AbortController();
    const forceDispose = vi.fn();
    let signalDisposeStarted!: () => void;
    const disposeStarted = new Promise<void>((resolve) => { signalDisposeStarted = resolve; });
    const cancellableDisposer: ArenaRunnerTool = {
      ...offRagTool(testCase.observation.caseRef),
      async dispose(signal) {
        signalDisposeStarted();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("cleanup_cancelled")), { once: true });
        });
      },
      forceDispose,
    };

    const run = runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: immediateSubmissionProvider(testCase.observation.caseRef, actionRefs),
      tools: [cancellableDisposer],
      signal: controller.signal,
      limits: { maxRunElapsedMs: 1000 },
    });
    await disposeStarted;
    controller.abort();
    const result = await run;

    expect(result.status).toBe("cancelled");
    expect(result.attempt.status).toBe("cancelled");
    expect(result.score.failures.cancelled).toBe(1);
    expect(forceDispose).toHaveBeenCalledTimes(1);
  });

  it("classifies context, elapsed-time, and provider-turn exhaustion in the scorer denominator", async () => {
    const testCase = makeArenaMcpCase();
    let providerCalls = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "limits-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        providerCalls += 1;
        return toolCall("search_knowledge", { query: "shape", limit: 1 });
      },
    };
    const grading = {
      binding: testCase.authorizedCase.binding,
      reference: { status: "unavailable" as const, reason: "mortal_unavailable" as const },
    };
    const contextLimited = await runBlindCoachCase({
      observation: testCase.observation,
      grading,
      provider,
      tools: [],
      limits: { maxContextInputBytes: 1 },
    });
    expect(contextLimited.status).toBe("budget_exhausted");
    expect(contextLimited.attempt.status).toBe("budget_exhausted");
    expect(contextLimited.score.failures.budgetExhausted).toBe(1);
    expect(providerCalls).toBe(0);

    const eventLimited = await runBlindCoachCase({
      observation: testCase.observation,
      grading,
      provider,
      tools: [],
      limits: { maxRunEventBytes: 1 },
    });
    expect(eventLimited.status).toBe("budget_exhausted");
    expect(eventLimited.attempt.status).toBe("budget_exhausted");
    expect(eventLimited.score.failures.budgetExhausted).toBe(1);
    expect(providerCalls).toBe(0);

    let now = Date.now();
    const timedOut = await runBlindCoachCase({
      observation: testCase.observation,
      grading,
      provider,
      tools: [],
      limits: { maxRunElapsedMs: 1 },
      clock: () => { now += 2; return now; },
    });
    expect(timedOut.status).toBe("timeout");
    expect(timedOut.attempt.status).toBe("timeout");
    expect(timedOut.score.failures.timeout).toBe(1);
    expect(providerCalls).toBe(0);

    const oneTurn = await runBlindCoachCase({
      observation: testCase.observation,
      grading,
      provider,
      tools: [offRagTool(testCase.observation.caseRef)],
      limits: { maxProviderTurns: 1 },
    });
    expect(oneTurn.status).toBe("budget_exhausted");
    expect(oneTurn.attempt.status).toBe("budget_exhausted");
    expect(oneTurn.providerTurnCount).toBe(1);
    expect(oneTurn.toolCallCount).toBe(1);
    expect(oneTurn.score.failures.budgetExhausted).toBe(1);
  });

  it("stops before a tool over the per-run call budget", async () => {
    const testCase = makeArenaMcpCase();
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "tool-budget-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        return toolCall("search_knowledge", { query: "shape", limit: 1 });
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [offRagTool(testCase.observation.caseRef)],
      limits: { maxToolCalls: 1 },
    });

    expect(result.status).toBe("budget_exhausted");
    expect(result.attempt.status).toBe("budget_exhausted");
    expect(result.toolCallCount).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "tool_result",
      toolName: "search_knowledge",
      code: "tool_budget_exhausted",
    }));
  });

  it("stops at the configured provider output budget and keeps the attempt in the scorer denominator", async () => {
    const testCase = makeArenaMcpCase();
    let calls = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "budget-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        calls += 1;
        return toolCall("submit_decision", {
          caseRef: testCase.observation.caseRef,
          actionRef: testCase.observation.candidates[0]!.actionRef,
          rationale: "A small rationale.", evidenceRefs: [], sourceRefs: [], mainAlternative: null, uncertainty: "Unknown.",
        }, 101);
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [],
      limits: { maxProviderOutputBytesPerTurn: 100 },
    });

    expect(calls).toBe(1);
    expect(result.status).toBe("budget_exhausted");
    expect(result.attempt.status).toBe("budget_exhausted");
    expect(result.score.includedCaseCount).toBe(1);
    expect(result.score.failures.budgetExhausted).toBe(1);
  });

  it("rejects provider-reported output tokens above the per-turn budget", async () => {
    const testCase = makeArenaMcpCase();
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "token-budget-test", protocolVersion: "arena-function-call/v1" }),
      async request() {
        return {
          ...toolCall("submit_decision", finalSubmission(
            testCase.observation.caseRef,
            testCase.observation.candidates.map((candidate) => candidate.actionRef),
          )),
          usage: { outputTokens: 2 },
        };
      },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [],
      limits: { maxProviderOutputTokens: 1 },
    });

    expect(result.status).toBe("budget_exhausted");
    expect(result.attempt.status).toBe("budget_exhausted");
    expect(result.score.failures.budgetExhausted).toBe(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "provider_turn",
      result: "token_budget_exhausted",
      usage: { outputTokens: 2 },
    }));
    expect(result.providerUsage).toMatchObject({ status: "reported", tokens: { outputTokens: 2 } });
  });

  it("records pre-cancellation without calling the provider and keeps usage unknown", async () => {
    const testCase = makeArenaMcpCase();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "cancel-test", protocolVersion: "arena-function-call/v1" }),
      async request() { calls += 1; return toolCall("submit_decision", {}); },
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider,
      tools: [],
      signal: controller.signal,
    });

    expect(calls).toBe(0);
    expect(result.status).toBe("cancelled");
    expect(result.attempt.status).toBe("cancelled");
    expect(result.providerUsage).toMatchObject({ status: "unknown", providerTurnCount: 0, unreportedTurnCount: 0 });
    expect(ARENA_RUN_LIMITS_V1.schemaVersion).toBe("blind-discard-arena-run-limits/v1");
  });
});

it("passes an 8192 token budget through the runner and provider contract without leaking grading data", async () => {
  const c = makeArenaMcpCase();
  const provider = immediateSubmissionProvider(c.observation.caseRef, c.observation.candidates.map(r => r.actionRef));
  const result = await runBlindCoachCase({ observation: c.observation,
    grading: { binding: c.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
    limits: { maxProviderOutputTokens: 8192 }, tools: [],
    provider: { ...provider, async request(request, signal) {
      expect(ArenaProviderRequestSchema.parse(request).maxOutputTokens).toBe(8192);
      expect(JSON.stringify(request)).not.toContain('qValue');
      return provider.request(request, signal);
    } },
  });
  expect(result.status).toBe("completed");
});

describe("Blind Discard Arena runner applicability gate", () => {
  const gatePassages = [
    {
      id: "retained", sourceId: "doc-a", sourceTitle: "复合牌形摘要",
      documentLocation: "Fixture / A", localSourcePath: "test/fixtures/a", attributedReferences: [],
      rightsBasis: "Synthetic test-only content.", topics: ["tile-efficiency" as const],
      applicableWhen: ["general-discard-choice" as const],
      content: "复合牌形：共享牌张不应被当作互不相关的两块。",
    },
    {
      id: "dropped", sourceId: "doc-b", sourceTitle: "复合牌形摘要二",
      documentLocation: "Fixture / B", localSourcePath: "test/fixtures/b", attributedReferences: [],
      rightsBasis: "Synthetic test-only content.", topics: ["tile-efficiency" as const],
      applicableWhen: ["general-discard-choice" as const],
      content: "复合牌形：副露后的牌形价值需要重新评估。",
    },
  ];
  const corpus = () => ({ corpusVersion: "runner-gate-test/v1", passages: gatePassages });
  const query = "复合牌形 共享牌张";

  function passageRef(aliases: ReturnType<typeof makeArenaMcpCase>["aliases"], sourceId: string, id: string) {
    return aliases.reference(`blind-discard-arena-rag/v1\u0000${sourceId}\u0000${id}`);
  }

  function selectorProvider(input: { dropSecond: boolean }): ArenaToolCallProvider {
    return {
      descriptor: () => ({ providerId: "selector-test", model: "selector-model", protocolVersion: "arena-function-call/v1" }),
      async request(request) {
        const userMessage = request.messages[1];
        if (userMessage?.role !== "user") throw new Error("gate_user_message_missing");
        const payload = JSON.parse(userMessage.content.slice("Applicability input JSON:\n".length)) as {
          caseRef: string;
          retrievalDigest: string;
          facts: { visibleState: { self: { meldRefs: unknown } } };
          passages: { sourceRef: string }[];
        };
        const verdicts = payload.passages.map((passage, index) => index === 1 && input.dropSecond
          ? {
            sourceRef: passage.sourceRef, verdict: "irrelevant",
            reason: "该片段讲的是副露后的牌形价值，与当前门清决策语境不符。",
            basis: "context-mismatch",
            premises: [{ kind: "fact", path: "visibleState.self.meldRefs", observedValue: payload.facts.visibleState.self.meldRefs }],
          }
          : {
            sourceRef: passage.sourceRef, verdict: "relevant",
            reason: "该片段讲的正是当前要比较的复合牌形维度。", premises: [],
          });
        const args = JSON.stringify({
          schemaVersion: "blind-discard-arena-rag-applicability-verdicts/v1",
          caseRef: payload.caseRef,
          retrievalDigest: payload.retrievalDigest,
          verdicts,
        });
        return {
          status: "ready" as const,
          call: { name: "submit_applicability_verdicts", arguments: args },
          outputBytes: Buffer.byteLength(args, "utf8"),
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        };
      },
    };
  }

  /**
   * Bounded selector that only answers once the run signal aborts, optionally
   * after a short delay, so the runner must keep a late-settling outcome.
   */
  function settlingSelector(input: {
    usage?: LlmTokenUsage;
    settleDelayMs: number;
    onFirstRequest?: () => void;
  }): ArenaToolCallProvider {
    return {
      descriptor: () => ({ providerId: "selector-test", model: "selector-model", protocolVersion: "arena-function-call/v1" }),
      async request(_request: ArenaProviderRequest, signal: AbortSignal) {
        return await new Promise<ArenaToolCallProviderResult>((resolve) => {
          const settle = () => resolve({
            status: "cancelled" as const,
            ...(input.usage === undefined ? {} : { usage: input.usage }),
          });
          if (signal.aborted) { queueMicrotask(settle); return; }
          signal.addEventListener("abort", () => {
            if (input.settleDelayMs === 0) settle();
            else setTimeout(settle, input.settleDelayMs);
          }, { once: true });
          input.onFirstRequest?.();
        });
      },
    };
  }

  function citingProvider(input: {
    caseRef: string;
    actionRefs: readonly ActionRef[];
    refs: readonly string[];
    citeDropped: boolean;
  }): ArenaToolCallProvider {
    let turn = 0;
    return {
      descriptor: () => ({ providerId: "test-provider", model: "gate-loop-test", protocolVersion: "arena-function-call/v1" }),
      async request(request) {
        turn += 1;
        if (turn === 1) return toolCall("search_knowledge", { query, limit: 2 });
        const toolMessages = request.messages.filter((message) => message.role === "tool");
        const lastMessage = toolMessages[toolMessages.length - 1];
        const last = JSON.parse(lastMessage?.role === "tool" ? lastMessage.content : "{}") as {
          data: { sourceRefs: string[] };
        };
        const retained = last.data.sourceRefs;
        const cite = input.citeDropped
          ? input.refs.find((ref) => !retained.includes(ref))
          : retained[0];
        expect(cite).toBeDefined();
        return toolCall("submit_decision", {
          caseRef: input.caseRef,
          actionRef: input.actionRefs[0],
          rationale: "该选择依据检索到的复合牌形资料与可见事实。",
          evidenceRefs: [],
          sourceRefs: [cite],
          mainAlternative: { actionRef: input.actionRefs[1], reasonNotChosen: "该候选损失了资料描述的连接形。" },
          uncertainty: "资料只覆盖牌效维度。",
        });
      },
    };
  }

  function ragTool(input: {
    testCase: ReturnType<typeof makeArenaMcpCase>;
    gate?: ArenaRunnerApplicabilityGate;
  }): ArenaRunnerTool {
    const retriever = createArenaRagRetriever({
      mode: "local",
      caseRef: input.testCase.observation.caseRef,
      aliases: input.testCase.aliases,
      loadCorpus: async () => corpus(),
    });
    return createArenaRagRunnerTool({
      retriever,
      caseRef: input.testCase.observation.caseRef,
      ...(input.gate === undefined ? {} : { applicabilityGate: input.gate }),
    });
  }

  it("hands only retained passages to the model and records the reflection audit trail", async () => {
    const testCase = makeArenaMcpCase();
    const refs = [passageRef(testCase.aliases, "doc-a", "retained"), passageRef(testCase.aliases, "doc-b", "dropped")];
    const gate = createArenaRagApplicabilityGate({
      provider: selectorProvider({ dropSecond: true }),
      caseRef: testCase.observation.caseRef,
    });
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: citingProvider({
        caseRef: testCase.observation.caseRef,
        actionRefs: testCase.observation.candidates.map((candidate) => candidate.actionRef),
        refs,
        citeDropped: true,
      }),
      tools: [ragTool({ testCase, gate })],
    });

    expect(result.status).toBe("invalid_submission");
    expect(result.events.some((event) => event.type === "submission_rejected" && event.reason === "reference_not_observed")).toBe(true);

    const toolResult = result.events.find((event) => event.type === "tool_result" && event.toolName === "search_knowledge");
    if (toolResult?.type !== "tool_result") throw new Error("missing_tool_result");
    expect(toolResult.reflection).toMatchObject({
      gateId: "blind-discard-arena-rag-applicability",
      gateVersion: "applicability-v1",
      status: "applied",
      failureCode: null,
      candidateCount: 2,
      retainedCount: 1,
      droppedCount: 1,
      usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
    });
    expect(toolResult.reflection?.receiptDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(toolResult.result)).not.toContain(refs[1]!);

    const started = result.events.find((event) => event.type === "run_started");
    if (started?.type !== "run_started") throw new Error("missing_run_started");
    expect(started.applicability).toMatchObject({
      gateVersion: "applicability-v1",
      promptVersion: "arena-rag-applicability-method/v1",
      selectorProviderId: "selector-test",
      selectorModel: "selector-model",
    });
    expect(result.applicability).toMatchObject({
      callCount: 1, appliedCount: 1, degradedCount: 0, failedCount: 0, skippedCount: 0,
      retainedPassageCount: 1, droppedPassageCount: 1,
      usage: { status: "reported" },
    });
  });

  it("keeps every passage and cannot claim success when reflection degrades", async () => {
    const testCase = makeArenaMcpCase();
    const refs = [passageRef(testCase.aliases, "doc-a", "retained"), passageRef(testCase.aliases, "doc-b", "dropped")];
    const gate = createArenaRagApplicabilityGate({
      provider: {
        descriptor: () => ({ providerId: "selector-test", model: "selector-model", protocolVersion: "arena-function-call/v1" }),
        async request() { return { status: "provider_error" as const }; },
      },
      caseRef: testCase.observation.caseRef,
    });
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: citingProvider({
        caseRef: testCase.observation.caseRef,
        actionRefs: testCase.observation.candidates.map((candidate) => candidate.actionRef),
        refs,
        citeDropped: false,
      }),
      tools: [ragTool({ testCase, gate })],
    });

    expect(result.status).toBe("completed");
    const toolResult = result.events.find((event) => event.type === "tool_result" && event.toolName === "search_knowledge");
    if (toolResult?.type !== "tool_result") throw new Error("missing_tool_result");
    expect(toolResult.reflection).toMatchObject({ status: "degraded", failureCode: "provider_error", retainedCount: 2, droppedCount: 0 });
    expect(result.applicability).toMatchObject({
      callCount: 1, appliedCount: 0, degradedCount: 1, usage: { status: "unknown" },
    });
    const submission = result.events.find((event) => event.type === "submission_locked");
    if (submission?.type !== "submission_locked") throw new Error("missing_submission");
    expect(submission.submission.sourceRefs).toEqual([refs[0]]);
  });

  it("leaves events and results untouched when no gate is configured", async () => {
    const testCase = makeArenaMcpCase();
    const refs = [passageRef(testCase.aliases, "doc-a", "retained"), passageRef(testCase.aliases, "doc-b", "dropped")];
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: citingProvider({
        caseRef: testCase.observation.caseRef,
        actionRefs: testCase.observation.candidates.map((candidate) => candidate.actionRef),
        refs,
        citeDropped: false,
      }),
      tools: [ragTool({ testCase })],
    });

    expect(result.status).toBe("completed");
    expect(result.applicability).toBeUndefined();
    const started = result.events.find((event) => event.type === "run_started");
    if (started?.type !== "run_started") throw new Error("missing_run_started");
    expect(started.applicability).toBeUndefined();
    for (const event of result.events) {
      if (event.type === "tool_result") expect(event.reflection).toBeUndefined();
    }
  });

  it("records an unsettled reflection as an orphan tool failure instead of success", async () => {
    const testCase = makeArenaMcpCase();
    const gate: ArenaRunnerApplicabilityGate = {
      descriptor: {
        gateId: "blind-discard-arena-rag-applicability",
        gateVersion: "applicability-v1",
        promptVersion: "arena-rag-applicability-method/v1",
      },
      apply: () => new Promise(() => undefined),
    };
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: citingProvider({
        caseRef: testCase.observation.caseRef,
        actionRefs: testCase.observation.candidates.map((candidate) => candidate.actionRef),
        refs: [passageRef(testCase.aliases, "doc-a", "retained"), passageRef(testCase.aliases, "doc-b", "dropped")],
        citeDropped: false,
      }),
      limits: { maxRunElapsedMs: 150 },
      tools: [ragTool({ testCase, gate })],
    });

    expect(result.status).toBe("tool_failure");
    const toolResult = result.events.find((event) => event.type === "tool_result" && event.toolName === "search_knowledge");
    if (toolResult?.type !== "tool_result") throw new Error("missing_tool_result");
    expect(toolResult).toMatchObject({ status: "error", code: "orphan_call" });
    expect(toolResult.reflection).toBeUndefined();
    expect(result.applicability).toMatchObject({ callCount: 1, appliedCount: 0, usage: { status: "unknown" } });
  });

  it.each([
    {
      label: "caller cancellation with reported usage",
      terminal: "cancelled" as const, code: "run_cancelled" as const, settleDelayMs: 5,
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } as LlmTokenUsage,
    },
    {
      label: "caller cancellation without reported usage",
      terminal: "cancelled" as const, code: "run_cancelled" as const, settleDelayMs: 5,
      usage: undefined,
    },
    {
      label: "run timeout with reported usage",
      terminal: "timeout" as const, code: "run_timeout" as const, settleDelayMs: 0,
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } as LlmTokenUsage,
    },
    {
      label: "run timeout without reported usage",
      terminal: "timeout" as const, code: "run_timeout" as const, settleDelayMs: 0,
      usage: undefined,
    },
  ])("records a reflection that settles after $label, without delivering it to the model", async (variant) => {
    const testCase = makeArenaMcpCase();
    const refs = [passageRef(testCase.aliases, "doc-a", "retained"), passageRef(testCase.aliases, "doc-b", "dropped")];
    const controller = new AbortController();
    const gate = createArenaRagApplicabilityGate({
      provider: settlingSelector({
        ...(variant.usage === undefined ? {} : { usage: variant.usage }),
        settleDelayMs: variant.settleDelayMs,
        // Cancel only once the selector is actually in flight.
        ...(variant.terminal === "cancelled" ? { onFirstRequest: () => controller.abort() } : {}),
      }),
      caseRef: testCase.observation.caseRef,
    });
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: { binding: testCase.authorizedCase.binding, reference: { status: "unavailable", reason: "mortal_unavailable" } },
      provider: citingProvider({
        caseRef: testCase.observation.caseRef,
        actionRefs: testCase.observation.candidates.map((candidate) => candidate.actionRef),
        refs,
        citeDropped: false,
      }),
      ...(variant.terminal === "timeout" ? { limits: { maxRunElapsedMs: 150 } } : { signal: controller.signal }),
      tools: [ragTool({ testCase, gate })],
    });

    expect(result.status).toBe(variant.terminal);
    const toolResult = result.events.find((event) => event.type === "tool_result" && event.toolName === "search_knowledge");
    if (toolResult?.type !== "tool_result") throw new Error("missing_tool_result");
    // The aborted tool call still records the real selector call and its usage,
    // but the generator never receives a tool result or the reflected passages.
    expect(toolResult).toMatchObject({ status: "error", code: variant.code });
    expect(toolResult.result).toBeUndefined();
    expect(toolResult.reflection).toMatchObject({
      status: "degraded", failureCode: "cancelled",
      candidateCount: 2, retainedCount: 2, droppedCount: 0,
      usage: variant.usage ?? null,
    });
    expect(result.applicability).toMatchObject({
      callCount: 1, appliedCount: 0, degradedCount: 1, failedCount: 0, skippedCount: 0,
      usage: { status: variant.usage === undefined ? "unknown" : "reported" },
    });
    const lastEvent = result.events[result.events.length - 1];
    expect(lastEvent?.type).toBe("run_terminal");
  });
});
