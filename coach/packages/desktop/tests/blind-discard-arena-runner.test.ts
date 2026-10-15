import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it, vi } from "vitest";
import { type ActionRef, type ArenaCoachSubmission } from "@riichi-coach/contracts";
import { ArenaMcpClient, type ArenaMcpAuthorizedCase } from "../src/blind-discard-arena-mcp.js";
import {
  ARENA_RUN_LIMITS_V1,
  createArenaMcpRunnerTool,
  createArenaRagRunnerTool,
  runBlindCoachCase,
  type ArenaRunnerTool,
  type ArenaRunEvent,
} from "../src/blind-discard-arena-runner.js";
import type { ArenaProviderMessage, ArenaProviderRequest, ArenaToolCallProvider } from "../src/blind-discard-arena-provider.js";
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
