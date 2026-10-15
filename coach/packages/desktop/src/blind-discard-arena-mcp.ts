import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  ActionRefSchema,
  ArenaCaseRefSchema,
  ArenaOpaqueReferenceSchema,
  ArenaToolBindingSchema,
  type ActionRef,
  EngineIdentitySchema,
  Hand13FactRequestSchema,
  KnownGameFactsSchema,
  TileIdSchema,
  libriichiRuleCanonicalJson,
  type ArenaToolBinding,
  type EngineIdentity,
  type Hand13FactRequest,
  type KnownGameFacts,
} from "@riichi-coach/contracts";
import {
  projectCandidate,
  validateHand13Result,
  type MahjongFactEnginePort,
} from "@riichi-coach/reasoning";
import { z } from "zod";
import type { ArenaRunAliasVault } from "./blind-discard-arena.js";

export type ArenaMcpLimits = Readonly<{
  schemaVersion: "blind-discard-arena-mcp-limits/v1";
  maxToolCallsPerRun: number;
  maxHelperCallsPerRun: number;
  maxActionRefsPerCall: number;
  maxDimensionsPerCall: number;
  maxResultBytes: number;
  helperTimeoutMs: number;
  maxToolCallDurationMs: number;
  maxTotalHelperTimeMs: number;
  maxRunElapsedMs: number;
}>;

export const ARENA_MCP_LIMITS_V1: ArenaMcpLimits = Object.freeze({
  schemaVersion: "blind-discard-arena-mcp-limits/v1" as const,
  maxToolCallsPerRun: 8,
  maxHelperCallsPerRun: 12,
  maxActionRefsPerCall: 3,
  maxDimensionsPerCall: 4,
  maxResultBytes: 16_384,
  helperTimeoutMs: 2_000,
  maxToolCallDurationMs: 10_000,
  maxTotalHelperTimeMs: 20_000,
  maxRunElapsedMs: 300_000,
});

const ArenaMcpLimitsSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-mcp-limits/v1"),
  maxToolCallsPerRun: z.number().int().min(1),
  maxHelperCallsPerRun: z.number().int().min(1),
  maxActionRefsPerCall: z.number().int().min(1),
  maxDimensionsPerCall: z.number().int().min(1),
  maxResultBytes: z.number().int().min(256),
  helperTimeoutMs: z.number().int().min(1),
  maxToolCallDurationMs: z.number().int().min(1),
  maxTotalHelperTimeMs: z.number().int().min(1),
  maxRunElapsedMs: z.number().int().min(1),
}).strict();

export const SupportedDimensionSchema = z.enum([
  "shanten",
  "effective_tiles",
  "remaining_waits",
  "ukeire",
  "dora_count",
]);
export type ArenaMcpSupportedDimension = z.infer<typeof SupportedDimensionSchema>;

const ArenaMcpCallInputObjectSchema = z.object({
  caseRef: ArenaCaseRefSchema,
  actionRefs: z.array(ActionRefSchema).min(1).max(ARENA_MCP_LIMITS_V1.maxActionRefsPerCall),
  dimensions: z.array(z.string().min(1).max(32).regex(/^[a-z][a-z0-9_]{0,31}$/))
    .min(1).max(ARENA_MCP_LIMITS_V1.maxDimensionsPerCall)
    .describe("Supported dimensions: shanten, effective_tiles, remaining_waits, ukeire, dora_count. ukeire returns shanten-reducing tile IDs, unseen copies per tile, and their total; unseen copies are not guaranteed live-wall tiles."),
}).strict();
export const ArenaMcpCallInputSchema = ArenaMcpCallInputObjectSchema.superRefine((input, context) => {
  if (new Set(input.actionRefs).size !== input.actionRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actionRefs"], message: "duplicate_action_ref" });
  }
  if (new Set(input.dimensions).size !== input.dimensions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dimensions"], message: "duplicate_dimension" });
  }
});
export type ArenaMcpCallInput = z.infer<typeof ArenaMcpCallInputSchema>;

const ArenaMcpErrorCodeSchema = z.enum([
  "invalid_request",
  "case_not_authorized",
  "action_not_offered",
  "helper_busy",
  "helper_timeout",
  "helper_error",
  "helper_budget_exhausted",
  "tool_budget_exhausted",
  "run_deadline_exceeded",
  "result_too_large",
]);
export type ArenaMcpErrorCode = z.infer<typeof ArenaMcpErrorCodeSchema>;

const ArenaMcpProducerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("helper"), identity: EngineIdentitySchema }).strict(),
  z.object({ kind: z.literal("adapter"), name: z.literal("blind-discard-arena-mcp"), version: z.literal("1.0.0") }).strict(),
]);

const ArenaMcpFactSchema = z.object({
  caseRef: ArenaCaseRefSchema,
  actionRef: ActionRefSchema,
  dimension: z.string().min(1).max(32),
  status: z.enum(["available", "unavailable", "unsupported"]),
  value: z.unknown().optional(),
  unit: z.string().min(1).max(40).optional(),
  sourceRef: ArenaOpaqueReferenceSchema,
  evidenceRefs: z.array(ArenaOpaqueReferenceSchema).max(1),
  producer: ArenaMcpProducerSchema,
  reason: z.enum([
    "unsupported_dimension",
    "insufficient_decision_facts",
    "helper_missing_visibility",
  ]).optional(),
}).strict().superRefine((fact, context) => {
  if (fact.status === "available" && (fact.value === undefined || fact.unit === undefined || fact.reason !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available_fact_requires_value_and_unit" });
  }
  if (fact.status !== "available" && (fact.value !== undefined || fact.unit !== undefined || fact.reason === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "unavailable_fact_requires_reason" });
  }
});

export const ArenaMcpResultSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-mcp-result/v1"),
  caseRef: ArenaCaseRefSchema,
  facts: z.array(ArenaMcpFactSchema).min(1).max(
    ARENA_MCP_LIMITS_V1.maxActionRefsPerCall * ARENA_MCP_LIMITS_V1.maxDimensionsPerCall,
  ),
}).strict();
export type ArenaMcpResult = z.infer<typeof ArenaMcpResultSchema>;

const ArenaMcpErrorSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-mcp-error/v1"),
  status: z.literal("error"),
  code: ArenaMcpErrorCodeSchema,
}).strict();

export type ArenaMcpAuthorizedCase = Readonly<{
  binding: ArenaToolBinding;
  /** Trusted internal pre-action facts; never serialized to the MCP client. */
  facts: KnownGameFacts;
}>;

export type ArenaMcpServerOptions = Readonly<{
  authorizedCases: readonly ArenaMcpAuthorizedCase[];
  engine: MahjongFactEnginePort;
  aliases: ArenaRunAliasVault;
  /** Immediate transport shutdown for managed clients whose close() queues behind active requests. */
  disposeHelper: () => Promise<void>;
  /** Test hooks may lower limits. Runtime callers cannot raise the versioned defaults. */
  limits?: Partial<ArenaMcpLimits>;
}>;

type ParsedAuthorizedCase = Readonly<{
  binding: ArenaToolBinding;
  facts: KnownGameFacts;
  actions: ReadonlyMap<string, ArenaToolBinding["candidates"][number]["action"]>;
}>;

class ArenaMcpFault extends Error {
  constructor(readonly code: ArenaMcpErrorCode) {
    super(code);
  }
}

function resolveLimits(raw: Partial<ArenaMcpLimits> | undefined): ArenaMcpLimits {
  const limits = ArenaMcpLimitsSchema.parse({ ...ARENA_MCP_LIMITS_V1, ...raw });
  for (const key of Object.keys(ARENA_MCP_LIMITS_V1) as Array<keyof ArenaMcpLimits>) {
    if (key === "schemaVersion") continue;
    if (limits[key] > ARENA_MCP_LIMITS_V1[key]) throw new Error("arena_mcp_limit_exceeds_v1_maximum");
  }
  return limits;
}

function parseAuthorizedCase(raw: ArenaMcpAuthorizedCase): ParsedAuthorizedCase {
  const binding = ArenaToolBindingSchema.parse(raw.binding);
  const facts = KnownGameFactsSchema.parse(raw.facts);
  const snapshot = binding.decisionSnapshot;
  const snapshotCurrentDraw = snapshot.privateState.currentDraw === null
    ? null
    : { tile: snapshot.privateState.currentDraw.tile, eventRef: snapshot.privateState.currentDraw.eventRef };
  if (facts.decisionEventRef !== snapshot.decisionEventRef ||
      facts.actor !== snapshot.selfActor ||
      facts.decisionWindow.triggerEventRef !== snapshot.decisionEventRef ||
      facts.roundWind !== snapshot.publicState.roundWind ||
      libriichiRuleCanonicalJson(facts.concealedTiles) !== libriichiRuleCanonicalJson(snapshot.privateState.concealedTiles) ||
      libriichiRuleCanonicalJson(facts.currentDraw) !== libriichiRuleCanonicalJson(snapshotCurrentDraw)) {
    throw new Error("arena_mcp_case_facts_not_bound_to_snapshot");
  }
  const actions = new Map<string, ArenaToolBinding["candidates"][number]["action"]>();
  for (const candidate of binding.candidates) {
    actions.set(candidate.actionRef, candidate.action);
    for (const realization of candidate.physicalRealizations) actions.set(realization.actionRef, realization.action);
  }
  return { binding, facts, actions };
}

function hashArenaRequest(input: {
  caseRef: string;
  actionRef: string;
  projectedStateHash: string;
}): string {
  return createHash("sha256").update(libriichiRuleCanonicalJson({
    schemaVersion: "blind-discard-arena-mcp-request/v1",
    caseRef: input.caseRef,
    actionRef: input.actionRef,
    projectedStateHash: input.projectedStateHash,
  })).digest("hex");
}

/** Build the same existing hand13 helper request used by the direct projector, with run-local IDs only. */
export function prepareArenaMcpHand13Request(input: {
  authorizedCase: ArenaMcpAuthorizedCase;
  actionRef: ActionRef;
}): Hand13FactRequest | null {
  const authorizedCase = parseAuthorizedCase(input.authorizedCase);
  const action = authorizedCase.actions.get(input.actionRef);
  if (!action) return null;
  const projection = projectCandidate({
    actionRef: input.actionRef,
    action,
    origins: ["model"],
  }, authorizedCase.facts);
  if (projection.status !== "ready" || projection.hand13Request === undefined) return null;
  const stateHash = hashArenaRequest({
    caseRef: authorizedCase.binding.caseRef,
    actionRef: input.actionRef,
    projectedStateHash: projection.hand13Request.stateHash,
  });
  return Hand13FactRequestSchema.parse({
    ...projection.hand13Request,
    requestId: `arena-mcp:${stateHash}`,
    stateHash,
    calculationMode: "efficiency-v1",
  });
}

function factReference(
  aliases: ArenaRunAliasVault,
  caseRef: string,
  actionRef: ActionRef,
  dimension: string,
): string {
  return aliases.reference(`arena-mcp-fact/v1\u0000${caseRef}\u0000${actionRef}\u0000${dimension}`);
}

function makeAdapterFact(input: {
  caseRef: string;
  actionRef: ActionRef;
  dimension: string;
  status: "unavailable" | "unsupported";
  reason: "unsupported_dimension" | "insufficient_decision_facts";
  sourceRef: string;
}): z.infer<typeof ArenaMcpFactSchema> {
  return {
    ...input,
    evidenceRefs: [],
    producer: { kind: "adapter", name: "blind-discard-arena-mcp", version: "1.0.0" },
  };
}

function makeHelperFact(input: {
  caseRef: string;
  actionRef: ActionRef;
  dimension: ArenaMcpSupportedDimension;
  result: ReturnType<typeof validateHand13Result>;
  identity: EngineIdentity;
  aliases: ArenaRunAliasVault;
}): z.infer<typeof ArenaMcpFactSchema> {
  const { result, dimension } = input;
  const sourceRef = factReference(input.aliases, input.caseRef, input.actionRef, dimension);
  const base = {
    caseRef: input.caseRef,
    actionRef: input.actionRef,
    dimension,
    sourceRef,
    evidenceRefs: [sourceRef],
    producer: { kind: "helper" as const, identity: input.identity },
  };
  switch (dimension) {
    case "shanten":
      return { ...base, status: "available", value: result.shanten, unit: "shanten" };
    case "effective_tiles":
      return { ...base, status: "available", value: result.effectiveTile34, unit: "tile34_index" };
    case "remaining_waits":
      return result.waitsRemainingStatus === "calculated"
        ? { ...base, status: "available", value: { status: "calculated", counts: result.waitsRemaining }, unit: "tile34_remaining_copies" }
        : { ...base, status: "unavailable", reason: "helper_missing_visibility" };
    case "ukeire": {
      if (result.waitsRemainingStatus !== "calculated") {
        return { ...base, status: "unavailable", reason: "helper_missing_visibility" };
      }
      const counts = new Map(result.waitsRemaining.map(row => [row.tile34, row.count]));
      if (counts.size !== result.effectiveTile34.length || result.effectiveTile34.some(tile => !counts.has(tile))) {
        throw new Error("arena_ukeire_helper_result_incomplete");
      }
      return { ...base, status: "available", unit: "unseen_tile_copies", value: {
        shanten: result.shanten,
        effectiveTileTypeCount: result.effectiveTile34.length,
        nonExhaustedTileTypeCount: result.waitsRemaining.filter(row => row.count > 0).length,
        totalRemainingCopies: result.waitsRemaining.reduce((total, row) => total + row.count, 0),
        tiles: result.waitsRemaining.map(row => ({ tile34: row.tile34, tileId: TileIdSchema.options[row.tile34], remainingCopies: row.count })),
        countBasis: "unseen_copies_not_wall_count",
      } };
    }
    case "dora_count":
      return result.doraCountStatus === "calculated" && result.doraCount !== null
        ? { ...base, status: "available", value: result.doraCount, unit: "dora_count" }
        : { ...base, status: "unavailable", reason: "helper_missing_visibility" };
  }
}

function textResult(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

function errorResult(code: ArenaMcpErrorCode) {
  return textResult({
    schemaVersion: "blind-discard-arena-mcp-error/v1",
    status: "error",
    code,
  }, true);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutCode: ArenaMcpErrorCode = "helper_timeout",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ArenaMcpFault(timeoutCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createArenaMcpServer(options: ArenaMcpServerOptions) {
  const limits = resolveLimits(options.limits);
  const cases = new Map<string, ParsedAuthorizedCase>();
  for (const raw of options.authorizedCases) {
    const parsed = parseAuthorizedCase(raw);
    if (cases.has(parsed.binding.caseRef)) throw new Error("arena_mcp_duplicate_authorized_case");
    cases.set(parsed.binding.caseRef, parsed);
  }

  const server = new McpServer({ name: "blind-discard-arena-helper", version: "1.0.0" }, {
    maxToolInputElements: 16,
  });
  const startedAt = Date.now();
  let toolCallCount = 0;
  let helperCallCount = 0;
  let totalHelperTimeMs = 0;
  let identityPromise: Promise<EngineIdentity> | null = null;
  let helperClosed: Promise<void> | null = null;
  let serverClosed: Promise<void> | null = null;
  let stdioDisconnectHandler: (() => void) | null = null;
  let runDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  let activeCall = false;
  let helperTimedOut = false;

  const closeHelper = (): Promise<void> => {
    helperClosed ??= options.disposeHelper();
    return helperClosed;
  };
  const closeServer = (): Promise<void> => {
    serverClosed ??= (async () => {
      if (runDeadlineTimer !== null) {
        clearTimeout(runDeadlineTimer);
        runDeadlineTimer = null;
      }
      if (stdioDisconnectHandler !== null) {
        process.stdin.off("end", stdioDisconnectHandler);
        process.stdin.off("close", stdioDisconnectHandler);
        stdioDisconnectHandler = null;
      }
      try {
        await server.close();
      } finally {
        await closeHelper();
      }
    })();
    return serverClosed;
  };
  server.server.onclose = () => {
    void closeHelper().catch(() => undefined);
  };
  runDeadlineTimer = setTimeout(() => {
    void closeServer().catch(() => undefined);
  }, limits.maxRunElapsedMs);
  runDeadlineTimer.unref();

  const callHelper = async <T>(operation: () => Promise<T>, toolDeadline: number): Promise<T> => {
    if (helperTimedOut) throw new ArenaMcpFault("helper_timeout");
    if (helperCallCount >= limits.maxHelperCallsPerRun || totalHelperTimeMs >= limits.maxTotalHelperTimeMs) {
      throw new ArenaMcpFault("helper_budget_exhausted");
    }
    const remainingBudget = limits.maxTotalHelperTimeMs - totalHelperTimeMs;
    const remainingToolTime = toolDeadline - Date.now();
    const remainingRunTime = startedAt + limits.maxRunElapsedMs - Date.now();
    if (remainingToolTime <= 0) throw new ArenaMcpFault("helper_timeout");
    if (remainingRunTime <= 0) throw new ArenaMcpFault("run_deadline_exceeded");
    let timeoutMs = limits.helperTimeoutMs;
    let timeoutCode: ArenaMcpErrorCode = "helper_timeout";
    if (remainingBudget < timeoutMs) {
      timeoutMs = remainingBudget;
      timeoutCode = "helper_budget_exhausted";
    }
    if (remainingToolTime < timeoutMs) {
      timeoutMs = remainingToolTime;
      timeoutCode = "helper_timeout";
    }
    if (remainingRunTime < timeoutMs) {
      timeoutMs = remainingRunTime;
      timeoutCode = "run_deadline_exceeded";
    }
    helperCallCount += 1;
    const started = Date.now();
    try {
      return await withTimeout(operation(), timeoutMs, timeoutCode);
    } catch (error) {
      if (error instanceof ArenaMcpFault && [
        "helper_timeout",
        "helper_budget_exhausted",
        "run_deadline_exceeded",
      ].includes(error.code)) {
        helperTimedOut = true;
        void closeHelper().catch(() => undefined);
      }
      throw error;
    } finally {
      totalHelperTimeMs += Date.now() - started;
    }
  };

  const getHelperIdentity = async (deadline: number): Promise<EngineIdentity> => {
    identityPromise ??= callHelper(() => options.engine.identity(), deadline)
      .then((identity) => EngineIdentitySchema.parse(identity));
    return await identityPromise;
  };

  server.registerTool("analyze_candidates", {
    title: "Analyze selected discard candidates",
    description: ARENA_MCP_TOOL_DESCRIPTION,
    inputSchema: ArenaMcpCallInputObjectSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (rawInput) => {
    toolCallCount += 1;
    if (toolCallCount > limits.maxToolCallsPerRun) return errorResult("tool_budget_exhausted");
    if (Date.now() - startedAt > limits.maxRunElapsedMs) return errorResult("run_deadline_exceeded");
    if (activeCall) return errorResult("helper_busy");
    activeCall = true;
    try {
      const request = ArenaMcpCallInputSchema.parse(rawInput);
      if (request.actionRefs.length > limits.maxActionRefsPerCall ||
          request.dimensions.length > limits.maxDimensionsPerCall) {
        return errorResult("invalid_request");
      }
      const authorizedCase = cases.get(request.caseRef);
      if (authorizedCase === undefined) return errorResult("case_not_authorized");
      const actionMap = authorizedCase.actions;
      if (request.actionRefs.some((actionRef) => !actionMap.has(actionRef))) {
        return errorResult("action_not_offered");
      }

      const deadline = Date.now() + limits.maxToolCallDurationMs;
      const facts: z.infer<typeof ArenaMcpFactSchema>[] = [];
      for (const actionRef of request.actionRefs) {
        const dimensions = request.dimensions;
        const supported = dimensions.filter((dimension): dimension is ArenaMcpSupportedDimension =>
          SupportedDimensionSchema.safeParse(dimension).success,
        );
        for (const dimension of dimensions) {
          if (!SupportedDimensionSchema.safeParse(dimension).success) {
            const sourceRef = factReference(options.aliases, request.caseRef, actionRef, dimension);
            facts.push(makeAdapterFact({
              caseRef: request.caseRef,
              actionRef,
              dimension,
              status: "unsupported",
              reason: "unsupported_dimension",
              sourceRef,
            }));
          }
        }
        if (supported.length === 0) continue;

        const helperRequest = prepareArenaMcpHand13Request({
          authorizedCase: { binding: authorizedCase.binding, facts: authorizedCase.facts },
          actionRef,
        });
        if (helperRequest === null) {
          for (const dimension of supported) {
            const sourceRef = factReference(options.aliases, request.caseRef, actionRef, dimension);
            facts.push(makeAdapterFact({
              caseRef: request.caseRef,
              actionRef,
              dimension,
              status: "unavailable",
              reason: "insufficient_decision_facts",
              sourceRef,
            }));
          }
          continue;
        }

        if (Date.now() >= deadline) throw new ArenaMcpFault("helper_timeout");
        const identity = await getHelperIdentity(deadline);
        const result = await callHelper(() => options.engine.analyzeHand13(helperRequest), deadline);
        const validated = validateHand13Result(helperRequest, result);
        if (libriichiRuleCanonicalJson(validated.identity) !== libriichiRuleCanonicalJson(identity)) {
          throw new ArenaMcpFault("helper_error");
        }
        for (const dimension of supported) {
          facts.push(makeHelperFact({
            caseRef: request.caseRef,
            actionRef,
            dimension,
            result: validated,
            identity,
            aliases: options.aliases,
          }));
        }
        if (Date.now() > deadline) throw new ArenaMcpFault("helper_timeout");
      }

      const response = ArenaMcpResultSchema.parse({
        schemaVersion: "blind-discard-arena-mcp-result/v1",
        caseRef: request.caseRef,
        facts,
      });
      if (Buffer.byteLength(JSON.stringify(response), "utf8") > limits.maxResultBytes) {
        return errorResult("result_too_large");
      }
      return textResult(response);
    } catch (error) {
      const code = error instanceof ArenaMcpFault
        ? error.code
        : "helper_error";
      return errorResult(code);
    } finally {
      activeCall = false;
    }
  });

  return {
    server,
    limits,
    close: closeServer,
    async connectStdio(): Promise<void> {
      const onDisconnect = () => { void closeServer().catch(() => undefined); };
      stdioDisconnectHandler = onDisconnect;
      process.stdin.once("end", onDisconnect);
      process.stdin.once("close", onDisconnect);
      try {
        await server.connect(new StdioServerTransport());
      } catch (error) {
        process.stdin.off("end", onDisconnect);
        process.stdin.off("close", onDisconnect);
        stdioDisconnectHandler = null;
        throw error;
      }
    },
  };
}

export class ArenaMcpClientError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super(code, options);
    this.name = "ArenaMcpClientError";
  }
}

export class ArenaMcpClient {
  readonly #client = new Client({ name: "blind-discard-arena-runner", version: "1.0.0" });
  #connected = false;
  #transport: Transport | null = null;
  #childPid: number | null = null;

  async connect(transport: Transport): Promise<void> {
    if (this.#connected) throw new ArenaMcpClientError("client_already_connected");
    try {
      await this.#client.connect(transport, { timeout: 10_000 });
      this.#connected = true;
      this.#transport = transport;
      const processTransport = transport as Transport & { pid?: number | null };
      this.#childPid = typeof processTransport.pid === "number" ? processTransport.pid : null;
    } catch (error) {
      throw new ArenaMcpClientError("mcp_connection_failed", { cause: error });
    }
  }

  async analyzeCandidates(raw: unknown, options: { signal?: AbortSignal } = {}): Promise<ArenaMcpResult> {
    if (!this.#connected) throw new ArenaMcpClientError("client_not_connected");
    const request = ArenaMcpCallInputSchema.parse(raw);
    let result;
    try {
      result = await this.#client.callTool({
        name: "analyze_candidates",
        arguments: request,
      }, CallToolResultSchema, options.signal === undefined ? undefined : { signal: options.signal });
    } catch (error) {
      throw new ArenaMcpClientError("mcp_call_failed", { cause: error });
    }
    const envelope = z.object({
      content: z.array(z.unknown()).optional(),
      isError: z.boolean().optional(),
    }).passthrough().safeParse(result);
    if (!envelope.success || envelope.data.content === undefined) {
      throw new ArenaMcpClientError("mcp_response_invalid");
    }
    const text = envelope.data.content.filter((content): content is { type: "text"; text: string } =>
      typeof content === "object" && content !== null &&
      "type" in content && content.type === "text" &&
      "text" in content && typeof content.text === "string",
    );
    if (text.length !== 1) throw new ArenaMcpClientError("mcp_response_invalid");
    let decoded: unknown;
    try {
      decoded = JSON.parse(text[0]!.text) as unknown;
    } catch (error) {
      throw new ArenaMcpClientError("mcp_response_invalid", { cause: error });
    }
    if (envelope.data.isError === true) {
      const fault = ArenaMcpErrorSchema.safeParse(decoded);
      throw new ArenaMcpClientError(fault.success ? fault.data.code : "mcp_call_failed");
    }
    const response = ArenaMcpResultSchema.safeParse(decoded);
    if (!response.success || response.data.caseRef !== request.caseRef) {
      throw new ArenaMcpClientError("mcp_response_invalid");
    }
    const requested = new Set(request.actionRefs.flatMap((actionRef) =>
      request.dimensions.map((dimension) => `${actionRef}\u0000${dimension}`),
    ));
    if (response.data.facts.length !== requested.size || response.data.facts.some((fact) => {
      const key = `${fact.actionRef}\u0000${fact.dimension}`;
      if (!requested.delete(key)) return true;
      return false;
    }) || requested.size !== 0) {
      throw new ArenaMcpClientError("mcp_response_binding_invalid");
    }
    return response.data;
  }

  async listTools(): Promise<readonly Readonly<{
    name: string;
    description?: string;
    inputSchema: Readonly<Record<string, unknown>>;
  }>[]> {
    if (!this.#connected) throw new ArenaMcpClientError("client_not_connected");
    try {
      const response = await this.#client.listTools();
      return response.tools.map((tool) => {
        if (tool.inputSchema === null || typeof tool.inputSchema !== "object" || Array.isArray(tool.inputSchema)) {
          throw new ArenaMcpClientError("mcp_tool_schema_invalid");
        }
        return {
          name: tool.name,
          ...(tool.description === undefined ? {} : { description: tool.description }),
          inputSchema: tool.inputSchema as Readonly<Record<string, unknown>>,
        };
      });
    } catch (error) {
      throw new ArenaMcpClientError("mcp_list_tools_failed", { cause: error });
    }
  }

  async close(): Promise<void> {
    if (!this.#connected) return;
    this.#connected = false;
    try {
      await this.#client.close();
    } finally {
      this.#transport = null;
      this.#childPid = null;
    }
  }

  /** Immediately stop the owned stdio child when graceful MCP shutdown exceeds the run budget. */
  forceClose(): void {
    this.#connected = false;
    const transport = this.#transport;
    if (transport === null) return;

    if (this.#childPid !== null) {
      try {
        process.kill(this.#childPid, "SIGKILL");
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
        if (code !== "ESRCH") throw new ArenaMcpClientError("mcp_force_close_failed", { cause: error });
      }
    }

    try {
      void transport.close().then(
        () => {
          if (this.#transport === transport) {
            this.#transport = null;
            this.#childPid = null;
          }
        },
        () => {
          if (this.#transport === transport) {
            this.#transport = null;
            this.#childPid = null;
          }
        },
      );
    } catch (error) {
      this.#transport = null;
      this.#childPid = null;
      throw new ArenaMcpClientError("mcp_force_close_failed", { cause: error });
    }
  }
}

export const ARENA_MCP_TOOL_DESCRIPTION = "Return requested hand facts for a small set of discard actionRefs in an authorized frozen case. Supports shanten, effective_tiles, remaining_waits, ukeire, dora_count. Request ukeire for improving tile IDs, remaining unseen copies per tile, and their total. No record, file, score, or arbitrary calculation access is available.";
