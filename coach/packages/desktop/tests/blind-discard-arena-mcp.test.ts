import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it, vi } from "vitest";
import {
  CANONICAL_EVENT_SCHEMA_VERSION,
  LIBRIICHI_RULE_NORMALIZATION_VERSION,
  CanonicalEventStreamSchema,
  LibriichiRuleResponseSchema,
  canonicalActionRef,
  libriichiRuleCanonicalJson,
  type CanonicalEventStream,
  type CanonicalGameEvent,
  type LibriichiRuleIdentity,
  type LibriichiRuleRequest,
  type Tile,
} from "@riichi-coach/contracts";
import {
  JsonlFactEngineClient,
  ManagedFactEngineTransport,
  createLibriichiRuleProjector,
  replayCanonicalStream,
  validateHand13Result,
} from "@riichi-coach/reasoning";
import { createArenaToolBinding, screenArenaDecisions, ArenaRunAliasVault, createArenaBlindRuleRequest } from "../src/blind-discard-arena.js";
import {
  ArenaMcpClient,
  ArenaMcpClientError,
  ARENA_MCP_LIMITS_V1,
  prepareArenaMcpHand13Request,
  type ArenaMcpAuthorizedCase,
} from "../src/blind-discard-arena-mcp.js";
import { createArenaMcpTestEngine } from "./fixtures/arena-mcp-test-helper.mjs";

const spec = readFileSync(
  new URL("../../../docs/specs/2026-10-09-blind-discard-arena.md", import.meta.url),
  "utf8",
);
const gameIdCanary = "gameId-CANARY-blind-arena";

it("the actual Arena CLI MCP server starts and queries the packaged helper", async () => {
  const { authorizedCase } = makeAuthorizedCase();
  const directory = await mkdtemp(resolve(tmpdir(), "arena-mcp-"));
  const configPath = resolve(directory, "authorized-case.json");
  await writeFile(configPath, JSON.stringify({ authorizedCases: [authorizedCase], fault: "none" }));
  const client = new ArenaMcpClient();
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [resolve(coachDir, "bin/blind-discard-arena-mcp-server.mjs"), configPath], stderr: "pipe" }));
    const result = await client.analyzeCandidates({ caseRef: authorizedCase.binding.caseRef,
      actionRefs: [authorizedCase.binding.candidates[0]!.actionRef], dimensions: ["shanten"] });
    expect(result.facts[0]).toMatchObject({ dimension: "shanten", status: "available" });
  } finally { await client.close(); await rm(directory, { recursive: true, force: true }); }
});
const recordIdCanary = "recordId-CANARY-blind-arena";
const ruleIdentity: LibriichiRuleIdentity = {
  implementation: "Equim-chan/Mortal/libriichi",
  revision: "0".repeat(40),
  nativeArtifactSha256: "1".repeat(64),
  wrapperSha256: "2".repeat(64),
  normalizationVersion: LIBRIICHI_RULE_NORMALIZATION_VERSION,
};
const tile = (id: Tile["id"], red = false): Tile => ({ id, red });
const digest = (value: unknown) =>
  createHash("sha256").update(libriichiRuleCanonicalJson(value)).digest("hex");

function realPrefixFixture() {
  const events: CanonicalGameEvent[] = [
    { type: "game_started", eventId: `${gameIdCanary}/0/0/0`, sourceRecordRef: `${recordIdCanary}/0` },
    {
      type: "round_started", eventId: `${gameIdCanary}/0/1/0`, sourceRecordRef: `${recordIdCanary}/1`,
      roundOrdinal: 0, roundWind: "E", hand: 1, honba: 0, riichiSticks: 0, dealer: 0,
      scores: [25000, 25000, 25000, 25000], doraIndicator: tile("1s"),
      selfHand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"].map(id => tile(id as Tile["id"])),
      remainingDraws: 70,
    },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/2/0`, sourceRecordRef: `${recordIdCanary}/2`, actor: 0, tile: { visibility: "visible", tile: tile("5p") }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/3/0`, sourceRecordRef: `${recordIdCanary}/3`, actor: 0, tile: tile("5p"), discardMode: "tsumogiri", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/4/0`, sourceRecordRef: `${recordIdCanary}/4`, actor: 1, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/5/0`, sourceRecordRef: `${recordIdCanary}/5`, actor: 1, tile: tile("9s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/6/0`, sourceRecordRef: `${recordIdCanary}/6`, actor: 2, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/7/0`, sourceRecordRef: `${recordIdCanary}/7`, actor: 2, tile: tile("8s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/8/0`, sourceRecordRef: `${recordIdCanary}/8`, actor: 3, tile: { visibility: "hidden" }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/9/0`, sourceRecordRef: `${recordIdCanary}/9`, actor: 3, tile: tile("7s"), discardMode: "tedashi", riichiDeclarationEventRef: null },
    { type: "tile_drawn", eventId: `${gameIdCanary}/0/10/0`, sourceRecordRef: `${recordIdCanary}/10`, actor: 0, tile: { visibility: "visible", tile: tile("6p") }, from: "live_wall" },
    { type: "tile_discarded", eventId: `${gameIdCanary}/0/11/0`, sourceRecordRef: `${recordIdCanary}/11`, actor: 0, tile: tile("6m"), discardMode: "tedashi", riichiDeclarationEventRef: null },
  ];
  const stream: CanonicalEventStream = CanonicalEventStreamSchema.parse({
    schemaVersion: CANONICAL_EVENT_SCHEMA_VERSION,
    mapperVersion: "blind-arena-mcp-test/v1",
    gameId: gameIdCanary,
    sourceKind: "fixture",
    sourceRecordHash: `sha256:${"a".repeat(64)}`,
    playerCount: 4,
    selfActor: 0,
    completeness: {
      eventSequence: "complete", ruleSet: "complete", scores: "complete", doraIndicators: "complete",
      rivers: "complete", calledDiscardMarkers: "complete", melds: "complete", remainingDraws: "complete",
      settlement: "complete", responseOpportunities: "complete",
    },
    ruleSet: {
      length: "south", redFives: { man: 1, pin: 1, sou: 1 }, openTanyao: true,
      atamahane: false, westExtension: "sudden_death", ippatsuCancelledByAnkan: true,
    },
    events,
  });
  const decision = replayCanonicalStream(stream)[1]!;
  const request = createArenaBlindRuleRequest(createLibriichiRuleProjector(stream, ruleIdentity)(decision));
  return { decision, request };
}

function discardRows(request: LibriichiRuleRequest) {
  const actions = [
    { runtimeAction: { index: 0, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "1m", tsumogiri: false }) },
    { runtimeAction: { index: 1, variant: null }, mjaiActionJson: JSON.stringify({ type: "dahai", actor: 0, pai: "2m", tsumogiri: false }) },
  ];
  const content = {
    protocolVersion: request.protocolVersion,
    requestId: request.requestId,
    identity: request.identity,
    status: "ok" as const,
    actions,
  };
  return LibriichiRuleResponseSchema.parse({ ...content, resultId: digest(content) });
}

function makeAuthorizedCase(): {
  authorizedCase: ArenaMcpAuthorizedCase;
} {
  const { decision, request } = realPrefixFixture();
  const selected = screenArenaDecisions([{
    canonicalDecisionOrder: 0,
    decision: { decisionEventRef: decision.decisionEventRef, snapshot: decision.snapshot, facts: decision.facts },
    ruleRequest: request,
    ruleResponse: discardRows(request),
  }]).selected[0]!;
  const aliases = new ArenaRunAliasVault();
  const caseRef = aliases.caseRef(`${selected.snapshot.gameId}\u0000${selected.snapshot.decisionEventRef}`);
  return {
    authorizedCase: {
      binding: createArenaToolBinding({ caseRef, selected }),
      facts: selected.facts,
    },
  };
}

const fixturePath = fileURLToPath(new URL("./fixtures/arena-mcp-stdio-server.mjs", import.meta.url));
const coachDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

async function startMcp(input: {
  authorizedCase: ArenaMcpAuthorizedCase;
  helper?: "fixture" | "packaged";
  behavior?: "normal" | "error" | "timeout";
  limits?: Partial<typeof ARENA_MCP_LIMITS_V1>;
}) {
  const context = JSON.stringify({
    authorizedCases: [input.authorizedCase],
    helper: input.helper ?? "fixture",
    behavior: input.behavior ?? "normal",
    limits: input.limits,
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixturePath],
    cwd: coachDir,
    env: { ARENA_MCP_TEST_CONTEXT: context },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  const client = new ArenaMcpClient();
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}

async function waitForHelperClose(readStderr: () => string): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (readStderr().includes("ARENA_TEST_HELPER_CLOSED")) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  return readStderr().includes("ARENA_TEST_HELPER_CLOSED");
}

describe("Blind Discard Arena MCP adapter", () => {
  it("keeps opaque references behind the runner/helper/grader boundary", () => {
    expect(spec).toContain("每次 run 的 opaque evidence/source ref");
    expect(spec).toContain("canonical/source identity 必须先经私有 alias map 映射，不能直接透传");
    expect(spec).toContain("不得出现在 Coach-visible DTO、MCP/RAG 输出或工具错误信息中");
    expect(spec).toContain("实际 MCP stdio 协议");
  });

  it("uses a real stdio MCP client/server, returns requested helper facts, and denies unbound access", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const { client, stderr } = await startMcp({
      authorizedCase,
      limits: { maxResultBytes: 1_000 },
    });
    try {
      const tools = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["analyze_candidates"]);
      expect(tools[0]?.description).toContain("No record, file, score");

      const actionRef = authorizedCase.binding.candidates[0]!.actionRef;
      const request = prepareArenaMcpHand13Request({ authorizedCase, actionRef });
      expect(request).not.toBeNull();
      const direct = createArenaMcpTestEngine();
      const directResult = validateHand13Result(request!, await direct.engine.analyzeHand13(request!));
      const result = await client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [actionRef],
        dimensions: ["shanten"],
      });
      const fact = result.facts[0]!;
      expect(fact).toMatchObject({
        caseRef: authorizedCase.binding.caseRef,
        actionRef,
        dimension: "shanten",
        status: "available",
        value: directResult.shanten,
        unit: "shanten",
        producer: { kind: "helper", identity: directResult.identity },
      });
      expect(fact.sourceRef).toMatch(/^arena-ref:v1:/);
      expect(fact.evidenceRefs).toEqual([fact.sourceRef]);
      expect(JSON.stringify(result)).not.toContain(gameIdCanary);
      expect(JSON.stringify(result)).not.toContain(recordIdCanary);

      const unsupported = await client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [actionRef],
        dimensions: ["file_read"],
      });
      expect(unsupported.facts[0]).toMatchObject({
        status: "unsupported",
        reason: "unsupported_dimension",
      });

      const unauthorizedCase = new ArenaRunAliasVault().caseRef("not-authorized");
      await expect(client.analyzeCandidates({
        caseRef: unauthorizedCase,
        actionRefs: [actionRef],
        dimensions: ["shanten"],
      })).rejects.toMatchObject({ code: "case_not_authorized" } satisfies Partial<ArenaMcpClientError>);

      const illegalAction = canonicalActionRef({ kind: "discard", tile: tile("3m"), discardMode: "tedashi" });
      await expect(client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [illegalAction],
        dimensions: ["shanten"],
      })).rejects.toMatchObject({ code: "action_not_offered" } satisfies Partial<ArenaMcpClientError>);

      await expect(client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [actionRef],
        dimensions: ["../arbitrary-record.json"],
      })).rejects.toThrow();
      await expect(client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [actionRef, actionRef],
        dimensions: ["shanten"],
      })).rejects.toThrow();

      await expect(client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: authorizedCase.binding.candidates.map((candidate) => candidate.actionRef),
        dimensions: ["shanten", "effective_tiles", "remaining_waits", "dora_count"],
      })).rejects.toMatchObject({ code: "result_too_large" } satisfies Partial<ArenaMcpClientError>);

    } finally {
      await client.close();
      expect(await waitForHelperClose(stderr), stderr()).toBe(true);
    }
  }, 15_000);

  it("force closes its owned stdio child when graceful cleanup is abandoned", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const { client, transport } = await startMcp({ authorizedCase });
    const childPid = transport.pid;
    if (childPid === null) throw new Error("arena_test_mcp_child_pid_missing");

    client.forceClose();

    await expect(client.listTools()).rejects.toThrow("client_not_connected");
    await vi.waitFor(() => {
      let stillRunning = true;
      try {
        process.kill(childPid, 0);
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code === "ESRCH") stillRunning = false;
        else throw error;
      }
      expect(stillRunning).toBe(false);
    }, { timeout: 1000, interval: 10 });
  });

  it("matches the packaged helper direct result through the real stdio MCP protocol", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const actionRef = authorizedCase.binding.candidates[0]!.actionRef;
    const request = prepareArenaMcpHand13Request({ authorizedCase, actionRef });
    expect(request).not.toBeNull();

    const direct = new JsonlFactEngineClient(
      new ManagedFactEngineTransport(resolve(coachDir, "resources")),
    );
    const server = await startMcp({ authorizedCase, helper: "packaged" });
    try {
      const directIdentity = await direct.identity();
      const directResult = validateHand13Result(request!, await direct.analyzeHand13(request!));
      const result = await server.client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [actionRef],
        dimensions: ["shanten"],
      });
      expect(result.facts).toHaveLength(1);
      expect(result.facts[0]).toMatchObject({
        actionRef,
        dimension: "shanten",
        status: "available",
        value: directResult.shanten,
        unit: "shanten",
        producer: { kind: "helper", identity: directIdentity },
      });
    } finally {
      await server.client.close();
      expect(await waitForHelperClose(server.stderr), server.stderr()).toBe(true);
      await direct.close();
    }
  }, 15_000);

  it("enforces caller-lowered candidate and dimension limits", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const server = await startMcp({
      authorizedCase,
      limits: { maxActionRefsPerCall: 1, maxDimensionsPerCall: 1 },
    });
    try {
      await expect(server.client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: authorizedCase.binding.candidates.map((candidate) => candidate.actionRef),
        dimensions: ["shanten"],
      })).rejects.toMatchObject({ code: "invalid_request" } satisfies Partial<ArenaMcpClientError>);
      await expect(server.client.analyzeCandidates({
        caseRef: authorizedCase.binding.caseRef,
        actionRefs: [authorizedCase.binding.candidates[0]!.actionRef],
        dimensions: ["shanten", "dora_count"],
      })).rejects.toMatchObject({ code: "invalid_request" } satisfies Partial<ArenaMcpClientError>);
    } finally {
      await server.client.close();
      expect(await waitForHelperClose(server.stderr), server.stderr()).toBe(true);
    }
  }, 10_000);

  it("enforces per-run tool, helper-call, and cumulative-time budgets", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const request = {
      caseRef: authorizedCase.binding.caseRef,
      actionRefs: [authorizedCase.binding.candidates[0]!.actionRef],
      dimensions: ["shanten"],
    };

    const toolLimited = await startMcp({ authorizedCase, limits: { maxToolCallsPerRun: 1 } });
    try {
      await toolLimited.client.analyzeCandidates(request);
      await expect(toolLimited.client.analyzeCandidates(request))
        .rejects.toMatchObject({ code: "tool_budget_exhausted" } satisfies Partial<ArenaMcpClientError>);
    } finally {
      await toolLimited.client.close();
      expect(await waitForHelperClose(toolLimited.stderr), toolLimited.stderr()).toBe(true);
    }

    const helperLimited = await startMcp({
      authorizedCase,
      limits: { maxHelperCallsPerRun: 1 },
    });
    try {
      await expect(helperLimited.client.analyzeCandidates(request))
        .rejects.toMatchObject({ code: "helper_budget_exhausted" } satisfies Partial<ArenaMcpClientError>);
    } finally {
      await helperLimited.client.close();
      expect(await waitForHelperClose(helperLimited.stderr), helperLimited.stderr()).toBe(true);
    }

    const timeLimited = await startMcp({
      authorizedCase,
      behavior: "timeout",
      limits: { maxTotalHelperTimeMs: 50, helperTimeoutMs: 1_000, maxToolCallDurationMs: 2_000 },
    });
    try {
      await expect(timeLimited.client.analyzeCandidates(request))
        .rejects.toMatchObject({ code: "helper_budget_exhausted" } satisfies Partial<ArenaMcpClientError>);
    } finally {
      await timeLimited.client.close();
      expect(await waitForHelperClose(timeLimited.stderr), timeLimited.stderr()).toBe(true);
    }
  }, 15_000);

  it("converts helper failure and timeout to bounded MCP errors", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const actionRef = authorizedCase.binding.candidates[0]!.actionRef;
    for (const behavior of ["error", "timeout"] as const) {
      const server = await startMcp({
        authorizedCase,
        behavior,
        limits: { helperTimeoutMs: 50, maxToolCallDurationMs: 250 },
      });
      try {
        await expect(server.client.analyzeCandidates({
          caseRef: authorizedCase.binding.caseRef,
          actionRefs: [actionRef],
          dimensions: ["shanten"],
        })).rejects.toMatchObject({
          code: behavior === "error" ? "helper_error" : "helper_timeout",
        } satisfies Partial<ArenaMcpClientError>);
        expect(server.stderr()).not.toContain(gameIdCanary);
      } finally {
        await server.client.close();
        expect(await waitForHelperClose(server.stderr), server.stderr()).toBe(true);
      }
    }
  }, 15_000);

  it("rejects raw file/path fields and exposes no score or record tool", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [fixturePath],
      cwd: coachDir,
      env: {
        ARENA_MCP_TEST_CONTEXT: JSON.stringify({ authorizedCases: [authorizedCase], behavior: "normal" }),
      },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    const client = new Client({ name: "arena-mcp-security-test", version: "1.0.0" });
    await client.connect(transport);
    try {
      const actionRef = authorizedCase.binding.candidates[0]!.actionRef;
      const pathAttempt = await client.callTool({
        name: "analyze_candidates",
        arguments: {
          caseRef: authorizedCase.binding.caseRef,
          actionRefs: [actionRef],
          dimensions: ["shanten"],
          path: "C:/private/full-record.json",
        },
      });
      expect(pathAttempt.isError).toBe(true);
      expect(JSON.stringify(pathAttempt)).not.toContain("private/full-record.json");
      const recordAttempt = await client.callTool({
        name: "read_record",
        arguments: { caseRef: authorizedCase.binding.caseRef, recordId: recordIdCanary },
      });
      expect(recordAttempt.isError).toBe(true);
      const scoreAttempt = await client.callTool({
        name: "get_mortal_score",
        arguments: { caseRef: authorizedCase.binding.caseRef, actionRef },
      });
      expect(scoreAttempt.isError).toBe(true);
    } finally {
      await client.close();
      expect(await waitForHelperClose(() => stderr)).toBe(true);
    }
  }, 10_000);

  it("closes the bound helper when the stdio client disconnects during a call", async () => {
    const { authorizedCase } = makeAuthorizedCase();
    const server = await startMcp({
      authorizedCase,
      behavior: "timeout",
      limits: { helperTimeoutMs: 1_000, maxToolCallDurationMs: 2_000 },
    });
    const pending = server.client.analyzeCandidates({
      caseRef: authorizedCase.binding.caseRef,
      actionRefs: [authorizedCase.binding.candidates[0]!.actionRef],
      dimensions: ["shanten"],
    });
    void pending.catch(() => undefined);
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    await server.client.close();
    expect(await waitForHelperClose(server.stderr)).toBe(true);
  }, 10_000);
});
