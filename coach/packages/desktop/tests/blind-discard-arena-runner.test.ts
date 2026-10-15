import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { ArenaOpaqueReferenceSchema, type ActionRef, type ArenaCoachSubmission } from "@riichi-coach/contracts";
import { z } from "zod";
import { ArenaMcpClient, type ArenaMcpAuthorizedCase } from "../src/blind-discard-arena-mcp.js";
import {
  ARENA_RUN_LIMITS_V1,
  createArenaMcpRunnerTool,
  runBlindCoachCase,
  type ArenaRunnerTool,
} from "../src/blind-discard-arena-runner.js";
import type { ArenaProviderMessage, ArenaProviderRequest, ArenaToolCallProvider } from "../src/blind-discard-arena-provider.js";
import { arenaFixtureCanaries, makeArenaMcpCase } from "./fixtures/arena-mcp-case.js";

const SEARCH_SCHEMA = z.object({
  caseRef: z.string().min(1),
  query: z.string().trim().min(1).max(300),
  limit: z.number().int().min(1).max(3),
}).strict();

const KNOWLEDGE_RESULT_SCHEMA = z.object({
  status: z.literal("local"),
  passages: z.array(z.object({
    content: z.string().min(1).max(1000),
    sourceRef: ArenaOpaqueReferenceSchema,
    location: z.string().min(1).max(120),
  }).strict()).max(3),
  corpusVersion: z.string().min(1).max(80),
  retrieverVersion: z.string().min(1).max(80),
}).strict();

function knowledgeTool(input: { sourceRef: string; queries: string[] }): ArenaRunnerTool {
  return {
    name: "search_knowledge",
    description: "Search the local teaching corpus for a bounded passage relevant to this decision.",
    parameters: {
      type: "object",
      properties: {
        caseRef: { type: "string" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 3 },
      },
      required: ["caseRef", "query", "limit"],
      additionalProperties: false,
    },
    parseInput(raw) { return SEARCH_SCHEMA.parse(raw); },
    async execute(raw, context) {
      const request = SEARCH_SCHEMA.parse(raw);
      if (request.caseRef !== context.caseRef) throw new Error("case_mismatch");
      input.queries.push(request.query);
      return {
        status: "local",
        passages: [{
          content: "For a connected hand, compare the resulting shape after each offered discard; preserve a live extension when other evidence is equal.",
          sourceRef: input.sourceRef,
          location: "seed/shape-basics.md#connected-shapes",
        }],
        corpusVersion: "test-corpus/v1",
        retrieverVersion: "test-local-retriever/v1",
      };
    },
    parseOutput(raw) { return KNOWLEDGE_RESULT_SCHEMA.parse(raw); },
    references(raw) {
      const result = KNOWLEDGE_RESULT_SCHEMA.parse(raw);
      return { evidenceRefs: [], sourceRefs: result.passages.map((passage) => passage.sourceRef) };
    },
  };
}

function toolCall(name: string, args: unknown, outputBytes = 200) {
  return { status: "ready" as const, call: { name, arguments: JSON.stringify(args) }, outputBytes };
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
  sourceRef: string;
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
          caseRef: JSON.parse(request.messages[1]!.role === "user" ? request.messages[1]!.content.slice("Blind observation JSON:\n".length) : "{}").caseRef,
          query: "connected shape discard principle",
          limit: 1,
        });
      }
      if (turn === 2) {
        const previous = messagesWithLastToolResult(request.messages);
        expect(previous).toContain("preserve a live extension");
        const observation = JSON.parse(request.messages[1]!.role === "user" ? request.messages[1]!.content.slice("Blind observation JSON:\n".length) : "{}");
        return toolCall("analyze_candidates", {
          caseRef: observation.caseRef,
          actionRefs: [input.actionRefs[0]],
          dimensions: ["shanten"],
        });
      }
      const toolTranscript = messagesWithLastToolResult(request.messages);
      expect(toolTranscript).toContain(input.sourceRef);
      expect(toolTranscript).toContain("shanten");
      const observations = request.messages.filter((message) => message.role === "user");
      const observation = JSON.parse(observations[0]!.role === "user" ? observations[0]!.content.slice("Blind observation JSON:\n".length) : "{}");
      const returned = request.messages.filter((message) => message.role === "tool").map((message) => JSON.parse(message.role === "tool" ? message.content : "{}"));
      const knowledge = returned[0].data;
      const helper = returned[1].data;
      const fact = helper.facts[0];
      if (input.expectedShanten !== undefined) expect(fact.value).toBe(input.expectedShanten);
      const submission: ArenaCoachSubmission = {
        caseRef: observation.caseRef,
        actionRef: input.actionRefs[0]!,
        rationale: `The local principle says preserve a live extension; the helper reports ${fact.value} shanten for this offered discard.`,
        evidenceRefs: fact.evidenceRefs,
        sourceRefs: [knowledge.passages[0].sourceRef, fact.sourceRef],
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
    const sourceRef = testCase.aliases.reference("test-rag-source/shape-basics");
    const queries: string[] = [];
    const seenRequests: string[] = [];
    const actionRefs = testCase.observation.candidates.map((candidate) => candidate.actionRef);
    const provider = scriptedProvider({ actionRefs, sourceRef, seenRequests });
    const result = await runBlindCoachCase({
      observation: testCase.observation,
      grading: {
        binding: testCase.authorizedCase.binding,
        reference: { status: "unavailable", reason: "mortal_unavailable" },
      },
      provider,
      tools: [mcpTool, knowledgeTool({ sourceRef, queries })],
    });

    expect(result.status).toBe("completed");
    expect(result.attempt.status).toBe("submitted");
    expect(result.providerTurnCount).toBe(3);
    expect(result.toolCallCount).toBe(2);
    expect(result.recoverableToolFailureCount).toBe(0);
    expect(queries).toEqual(["connected shape discard principle"]);
    expect(seenRequests).toHaveLength(3);
    expect(result.events.map((event) => event.type)).toContain("submission_locked");
    expect(result.score.includedCaseCount).toBe(1);
    expect(result.score.failures.labelUnavailable).toBe(1);
    expect(JSON.stringify(result)).not.toContain(arenaFixtureCanaries.gameIdCanary);
    expect(JSON.stringify(result)).not.toContain(arenaFixtureCanaries.recordIdCanary);
    expect(JSON.stringify(result)).not.toContain("hidden chain-of-thought");
  });

  it("retains a failed tool attempt and lets the model continue without inventing a result", async () => {
    const testCase = makeArenaMcpCase();
    const sourceRef = testCase.aliases.reference("test-rag-source/no-result");
    let turn = 0;
    const failingTool: ArenaRunnerTool = {
      ...knowledgeTool({ sourceRef, queries: [] }),
      async execute() { throw new Error("private path or provider prose must not escape"); },
    };
    const provider: ArenaToolCallProvider = {
      descriptor: () => ({ providerId: "test-provider", model: "recovery-test", protocolVersion: "arena-function-call/v1" }),
      async request(request) {
        turn += 1;
        if (turn === 1) return toolCall("search_knowledge", { caseRef: testCase.observation.caseRef, query: "shape", limit: 1 });
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
