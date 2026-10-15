import { z } from "zod";
import {
  ArenaBatchScoreSchema,
  ArenaFailureCountsSchema,
  ArenaRagModeSchema,
  ArenaRateSchema,
  LlmTokenUsageSchema,
  ManagedMortalRuntimeIdentitySchema,
  LibriichiRuleIdentitySchema,
} from "@riichi-coach/contracts";
import { ArenaExclusionReasonSchema } from "./blind-discard-arena.js";
import {
  ArenaCoachRunResultSchema,
  ArenaRunTerminalStatusSchema,
  ArenaRunEventSchema,
} from "./blind-discard-arena-runner.js";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const SourceRecordHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const DatasetCaseSchema = z.object({
  canonicalDecisionOrder: z.number().int().nonnegative(),
  candidateCount: z.number().int().min(2).max(46),
  candidateSetDigest: Sha256Schema,
}).strict();
const ExclusionSchema = z.object({
  canonicalDecisionOrder: z.number().int().nonnegative(),
  reason: ArenaExclusionReasonSchema,
}).strict();

export const ArenaArchiveManifestSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-run-manifest/v1"),
  runId: z.string().uuid(),
  startedAt: z.string().datetime(),
  codeSha: z.string().regex(/^[0-9a-f]{40}$/),
  dataset: z.object({
    id: z.literal("blind-discard-smoke-v1"),
    caseSetDigest: Sha256Schema,
    split: z.object({
      unit: z.literal("complete_game"),
      developmentGames: z.number().int().nonnegative(),
      acceptanceGames: z.number().int().nonnegative(),
      status: z.literal("smoke_dev_only"),
    }).strict(),
    source: z.object({
      kind: z.literal("sanitized_mahjong_soul_fixture"),
      fixtureSha256: Sha256Schema,
      sourceRecordHash: SourceRecordHashSchema,
    }).strict(),
    inputCaseCount: z.number().int().nonnegative(),
    selected: z.array(DatasetCaseSchema).max(3),
    excluded: z.array(ExclusionSchema).max(1000),
  }).strict(),
  mortal: z.object({
    runtimeIdentity: ManagedMortalRuntimeIdentitySchema,
    ruleIdentity: LibriichiRuleIdentitySchema,
    runtimeConfigSha256: Sha256Schema,
  }).strict(),
  coach: z.object({
    providerId: z.string().min(1).max(80),
    model: z.string().min(1).max(200),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    protocolVersion: z.string().min(1).max(80),
    promptVersion: z.string().min(1).max(80),
    submissionSchemaVersion: z.literal("blind-discard-arena-submission/v1"),
    credentialStatus: z.enum(["available", "missing", "not_configured"]),
  }).strict(),
  rag: z.object({
    mode: ArenaRagModeSchema,
    corpusVersion: z.string().min(1).max(100).nullable(),
    retrieverVersion: z.string().min(1).max(100),
  }).strict(),
  controlledFault: z.enum(["none", "first-helper-timeout"]),
  budget: z.object({
    maxCases: z.number().int().min(1).max(3),
    limits: ArenaCoachRunResultSchema.shape.limits,
    selectionSeed: z.null(),
    tokenWarningThreshold: z.number().int().positive().safe().optional(),
  }).strict(),
}).strict();
export type ArenaArchiveManifest = z.infer<typeof ArenaArchiveManifestSchema>;

export const ArenaArchiveEventSchema = z.discriminatedUnion("type", [
  z.object({
    schemaVersion: z.literal("blind-discard-arena-archive-event/v1"),
    type: z.literal("dataset_scan"),
    recordedAt: z.string().datetime(),
    datasetId: z.literal("blind-discard-smoke-v1"),
    sourceRecordHash: SourceRecordHashSchema,
    inputCaseCount: z.number().int().nonnegative(),
    selected: z.array(z.object({
      caseOrdinal: z.number().int().nonnegative(),
      ...DatasetCaseSchema.shape,
    }).strict()).max(3),
    excluded: z.array(ExclusionSchema).max(1000),
  }).strict(),
  z.object({
    schemaVersion: z.literal("blind-discard-arena-archive-event/v1"),
    type: z.literal("case_run"),
    recordedAt: z.string().datetime(),
    caseOrdinal: z.number().int().nonnegative(),
    ragMode: ArenaRagModeSchema,
    result: ArenaCoachRunResultSchema,
  }).strict(),
]);
export type ArenaArchiveEvent = z.infer<typeof ArenaArchiveEventSchema>;

/** Live observation only. Final case_run events remain the scoring/statistics owner. */
export const ArenaCaseTraceSchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-case-trace/v1"),
  caseOrdinal: z.number().int().min(0).max(2),
  event: ArenaRunEventSchema,
}).strict();
export function parseArenaCaseTrace(text: string) {
  if (Buffer.byteLength(text, "utf8") > 8 * 1024 * 1024) throw new Error("arena_trace_too_large");
  // A polling reader can observe the last append before its newline is written.
  const complete = text.slice(0, text.lastIndexOf("\n") + 1).trim();
  if (!complete) return [];
  const rows = complete.split("\n");
  if (rows.length > 192) throw new Error("arena_trace_too_large");
  return rows.map(row => ArenaCaseTraceSchema.parse(JSON.parse(row)));
}

const RUN_STATUSES = [
  "completed", "invalid_submission", "provider_unavailable", "provider_error",
  "timeout", "cancelled", "tool_failure", "budget_exhausted", "label_binding_failure",
] as const;
const RunStatusCountsSchema = z.object(Object.fromEntries(
  RUN_STATUSES.map((status) => [status, z.number().int().nonnegative()]),
) as Record<(typeof RUN_STATUSES)[number], z.ZodNumber>).strict();

const TokenTotalsSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("not_called"),
    providerTurnCount: z.literal(0),
  }).strict(),
  z.object({
    status: z.literal("reported"),
    tokens: LlmTokenUsageSchema,
    providerTurnCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    status: z.literal("unknown"),
    reportedPartial: LlmTokenUsageSchema.optional(),
    providerTurnCount: z.number().int().nonnegative(),
    unreportedRunCount: z.number().int().nonnegative(),
  }).strict(),
]);

export const ArenaArchiveSummarySchema = z.object({
  schemaVersion: z.literal("blind-discard-arena-run-summary/v1"),
  runId: z.string().uuid(),
  datasetId: z.literal("blind-discard-smoke-v1"),
  datasetCaseSetDigest: Sha256Schema,
  ragMode: ArenaRagModeSchema,
  inputCaseCount: z.number().int().nonnegative(),
  selectedCaseCount: z.number().int().nonnegative(),
  excludedCaseCount: z.number().int().nonnegative(),
  exclusionCounts: z.record(ArenaExclusionReasonSchema, z.number().int().nonnegative()),
  recordedRunCount: z.number().int().nonnegative(),
  unrunCaseCount: z.number().int().nonnegative(),
  terminalStatuses: RunStatusCountsSchema,
  failures: ArenaFailureCountsSchema,
  score: z.object({
    includedCaseCount: z.number().int().nonnegative(),
    matchedCaseCount: z.number().int().nonnegative(),
    labelAvailableCaseCount: z.number().int().nonnegative(),
    primaryMatchRate: ArenaRateSchema,
    conditionalMatchRate: ArenaRateSchema,
  }).strict(),
  evidence: z.object({
    helperQueries: z.number().int().nonnegative(),
    helperSuccesses: z.number().int().nonnegative(),
    helperFailures: z.number().int().nonnegative(),
    ragQueries: z.number().int().nonnegative(),
    ragHits: z.number().int().nonnegative(),
    ragDisabled: z.number().int().nonnegative(),
    mechanicalCitationCheck: z.literal("runner_validated_observed_references"),
    expertQualityReview: z.literal("not_performed"),
  }).strict(),
  elapsedMs: z.number().int().nonnegative(),
  providerTurnCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  toolFailureCount: z.number().int().nonnegative(),
  tokenUsage: TokenTotalsSchema,
}).strict();
export type ArenaArchiveSummary = z.infer<typeof ArenaArchiveSummarySchema>;

/** Reported input already includes cached input. Unknown use remains a lower bound. */
export function arenaTokenBudget(summaries: readonly unknown[], warningThreshold = 100_000_000) {
  if (!Number.isSafeInteger(warningThreshold) || warningThreshold < 1) throw new Error("arena_budget_invalid");
  let knownTotalTokens = 0;
  let unknownRunCount = 0;
  for (const raw of summaries) {
    const parsed = ArenaArchiveSummarySchema.safeParse(raw);
    if (!parsed.success) { unknownRunCount++; continue; }
    const usage = parsed.data.tokenUsage;
    if (usage.status === "not_called") continue;
    const tokens = usage.status === "reported" ? usage.tokens : usage.reportedPartial;
    const total = tokens?.totalTokens ?? (tokens?.inputTokens !== undefined && tokens.outputTokens !== undefined
      ? tokens.inputTokens + tokens.outputTokens : undefined);
    if (total !== undefined) knownTotalTokens += total;
    if (usage.status === "unknown" || total === undefined) unknownRunCount++;
    if (!Number.isSafeInteger(knownTotalTokens)) throw new Error("arena_token_total_overflow");
  }
  return { scope: "archives_in_this_workspace", warningThreshold, knownTotalTokens, unknownRunCount,
    warning: knownTotalTokens >= warningThreshold };
}

function makeRate(numerator: number, denominator: number): z.infer<typeof ArenaRateSchema> {
  return denominator === 0
    ? { status: "not_available", numerator: 0, denominator: 0, value: null }
    : { status: "available", numerator, denominator, value: numerator / denominator };
}

function addTokenFields(target: Record<string, number>, value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      target[key] = (target[key] ?? 0) + count;
    }
  }
}

/** Parse one bounded JSON object per line; inspection never initializes a provider or tool. */
export function parseArenaArchiveEvents(jsonl: string): ArenaArchiveEvent[] {
  const rows = jsonl.split(/\r?\n/u).filter((line) => line.length > 0);
  if (rows.length === 0 || rows.length > 128) throw new Error("arena_archive_events_invalid");
  return rows.map((line) => {
    let value: unknown;
    try { value = JSON.parse(line) as unknown; } catch { throw new Error("arena_archive_events_invalid"); }
    return ArenaArchiveEventSchema.parse(value);
  });
}

/** Recompute all displayed metrics exclusively from the manifest and archived events. */
export function summarizeArenaArchive(input: {
  manifest: unknown;
  events: readonly unknown[];
}): ArenaArchiveSummary {
  const manifest = ArenaArchiveManifestSchema.parse(input.manifest);
  const events = input.events.map((event) => ArenaArchiveEventSchema.parse(event));
  if (events.length === 0 || events[0]?.type !== "dataset_scan" || events.slice(1).some((event) => event.type !== "case_run")) {
    throw new Error("arena_archive_event_order_invalid");
  }
  const scan = events[0];
  if (scan.type !== "dataset_scan" || scan.datasetId !== manifest.dataset.id ||
      scan.sourceRecordHash !== manifest.dataset.source.sourceRecordHash ||
      scan.inputCaseCount !== manifest.dataset.inputCaseCount ||
      scan.selected.length !== manifest.dataset.selected.length ||
      scan.excluded.length !== manifest.dataset.excluded.length) {
    throw new Error("arena_archive_manifest_event_mismatch");
  }
  const runs = events.slice(1);
  const ragMode = runs[0]?.type === "case_run" ? runs[0].ragMode : manifest.rag.mode;
  if (ragMode !== manifest.rag.mode || runs.some((event) => event.type !== "case_run" || event.ragMode !== ragMode)) {
    throw new Error("arena_archive_rag_mode_mismatch");
  }
  const selectedOrdinals = new Set(scan.selected.map((item) => item.caseOrdinal));
  const runOrdinals = runs.flatMap((event) => event.type === "case_run" ? [event.caseOrdinal] : []);
  if (runOrdinals.some((ordinal) => !selectedOrdinals.has(ordinal)) || new Set(runOrdinals).size !== runOrdinals.length) {
    throw new Error("arena_archive_case_run_binding_invalid");
  }

  const exclusionCounts = Object.fromEntries(
    ArenaExclusionReasonSchema.options.map((reason) => [reason, 0]),
  ) as Record<z.infer<typeof ArenaExclusionReasonSchema>, number>;
  for (const excluded of scan.excluded) exclusionCounts[excluded.reason] += 1;
  const terminalStatuses = Object.fromEntries(RUN_STATUSES.map((status) => [status, 0])) as Record<(typeof RUN_STATUSES)[number], number>;
  const failures = {
    invalidSubmission: 0, missingSubmission: 0, providerUnavailable: 0, providerError: 0,
    timeout: 0, cancelled: 0, toolFailure: 0, budgetExhausted: 0,
    labelUnavailable: 0, labelBindingFailure: 0,
  };
  const conditional = { numerator: 0, denominator: 0 };
  const tokenTotals: Record<string, number> = {};
  let knownTokenRunCount = 0;
  let unreportedRunCount = 0;
  let providerTurnCount = 0;
  let toolCallCount = 0;
  let toolFailureCount = 0;
  let elapsedMs = 0;
  let includedCaseCount = 0;
  let matchedCaseCount = 0;
  let labelAvailableCaseCount = 0;
  let helperQueries = 0;
  let helperSuccesses = 0;
  let helperFailures = 0;
  let ragQueries = 0;
  let ragHits = 0;
  let ragDisabled = 0;

  for (const event of runs) {
    if (event.type !== "case_run") continue;
    const result = event.result;
    terminalStatuses[result.status] += 1;
    for (const key of Object.keys(failures) as Array<keyof typeof failures>) {
      failures[key] += result.score.failures[key];
    }
    includedCaseCount += result.score.includedCaseCount;
    matchedCaseCount += result.score.matchedCaseCount;
    labelAvailableCaseCount += result.score.labelAvailableCaseCount;
    if (result.score.conditionalMatchRate.status === "available") {
      conditional.numerator += result.score.conditionalMatchRate.numerator;
      conditional.denominator += result.score.conditionalMatchRate.denominator;
    }
    elapsedMs += result.elapsedMs;
    providerTurnCount += result.providerTurnCount;
    toolCallCount += result.toolCallCount;
    toolFailureCount += result.toolFailureCount;
    for (const runEvent of result.events) {
      if (runEvent.type === "tool_call" && runEvent.toolName === "analyze_candidates") helperQueries += 1;
      if (runEvent.type === "tool_result" && runEvent.toolName === "analyze_candidates") {
        if (runEvent.status === "ok") helperSuccesses += 1;
        else helperFailures += 1;
      }
      if (runEvent.type === "tool_call" && runEvent.toolName === "search_knowledge") ragQueries += 1;
      if (runEvent.type === "tool_result" && runEvent.toolName === "search_knowledge" && runEvent.status === "ok") {
        const resultData = runEvent.result as { status?: unknown } | undefined;
        if (resultData?.status === "hits") ragHits += 1;
        if (resultData?.status === "disabled") ragDisabled += 1;
      }
    }
    if (result.providerUsage.status === "reported") {
      addTokenFields(tokenTotals, result.providerUsage.tokens);
      knownTokenRunCount += 1;
    } else {
      if (result.providerUsage.reportedPartial !== undefined) addTokenFields(tokenTotals, result.providerUsage.reportedPartial);
      unreportedRunCount += 1;
    }
  }

  const score = {
    includedCaseCount,
    matchedCaseCount,
    labelAvailableCaseCount,
    primaryMatchRate: makeRate(matchedCaseCount, includedCaseCount),
    conditionalMatchRate: makeRate(conditional.numerator, conditional.denominator),
  };
  let tokenUsage: z.infer<typeof TokenTotalsSchema>;
  if (providerTurnCount === 0) {
    tokenUsage = { status: "not_called", providerTurnCount: 0 };
  } else if (unreportedRunCount > 0) {
    tokenUsage = {
      status: "unknown",
      ...(Object.keys(tokenTotals).length === 0 ? {} : { reportedPartial: LlmTokenUsageSchema.parse(tokenTotals) }),
      providerTurnCount,
      unreportedRunCount,
    };
  } else {
    tokenUsage = {
      status: "reported",
      tokens: LlmTokenUsageSchema.parse(tokenTotals),
      providerTurnCount,
    };
  }

  return ArenaArchiveSummarySchema.parse({
    schemaVersion: "blind-discard-arena-run-summary/v1",
    runId: manifest.runId,
    datasetId: manifest.dataset.id,
    datasetCaseSetDigest: manifest.dataset.caseSetDigest,
    ragMode,
    inputCaseCount: scan.inputCaseCount,
    selectedCaseCount: scan.selected.length,
    excludedCaseCount: scan.excluded.length,
    exclusionCounts,
    recordedRunCount: runs.length,
    unrunCaseCount: Math.max(0, scan.selected.length - runs.length),
    terminalStatuses,
    failures,
    score,
    evidence: {
      helperQueries, helperSuccesses, helperFailures, ragQueries, ragHits, ragDisabled,
      mechanicalCitationCheck: "runner_validated_observed_references",
      expertQualityReview: "not_performed",
    },
    elapsedMs,
    providerTurnCount,
    toolCallCount,
    toolFailureCount,
    tokenUsage,
  });
}
