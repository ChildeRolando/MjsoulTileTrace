import { describe, expect, it } from "vitest";
import {
  canonicalActionRef,
  type ArenaCaseRef,
} from "@riichi-coach/contracts";
import { ARENA_RUN_LIMITS_V1 } from "../src/blind-discard-arena-runner.js";
import {
  arenaMortalTopTen, visibleArenaMortalDetails,
  ArenaArchiveEventSchema,
  ArenaArchiveManifestSchema,
  parseArenaArchiveEvents,
  summarizeArenaArchive,
  arenaTokenBudget,
  parseArenaCaseTrace,
} from "../src/blind-discard-arena-archive.js";

const caseRefs = [
  "arena-case:v1:00000000-0000-4000-8000-000000000001",
  "arena-case:v1:00000000-0000-4000-8000-000000000002",
] as const satisfies readonly ArenaCaseRef[];
const actionRef = canonicalActionRef({ kind: "discard", tile: { id: "1m", red: false }, discardMode: "tedashi" });
const zeroFailures = {
  invalidSubmission: 0, missingSubmission: 0, providerUnavailable: 0, providerError: 0,
  timeout: 0, cancelled: 0, toolFailure: 0, budgetExhausted: 0,
  labelUnavailable: 0, labelBindingFailure: 0,
};

function result(input: {
  caseRef: ArenaCaseRef;
  status: "completed" | "provider_unavailable";
  matched?: boolean;
  helper?: boolean;
  ragHit?: boolean;
}) {
  const matched = input.matched ?? false;
  const submitted = input.status === "completed";
  const events = [
    ...(input.helper ? [
      { type: "tool_call" as const, ordinal: 1, turn: 1, toolName: "analyze_candidates", request: { caseRef: input.caseRef } },
      { type: "tool_result" as const, ordinal: 1, turn: 1, toolName: "analyze_candidates", status: "ok" as const, result: { facts: [] } },
    ] : []),
    ...(input.ragHit ? [
      { type: "tool_call" as const, ordinal: 2, turn: 2, toolName: "search_knowledge", request: { query: "shape", limit: 1 } },
      { type: "tool_result" as const, ordinal: 2, turn: 2, toolName: "search_knowledge", status: "ok" as const, result: { status: "hits" } },
    ] : []),
    { type: "run_terminal" as const, status: input.status, attemptStatus: submitted ? "submitted" as const : "provider_unavailable" as const, elapsedMs: 125 },
  ];
  return {
    schemaVersion: "blind-discard-arena-run-result/v1" as const,
    caseRef: input.caseRef,
    status: input.status,
    attempt: submitted
      ? { status: "submitted" as const, submission: {
        caseRef: input.caseRef,
        actionRef,
        rationale: "The offered action preserves a useful connected shape.",
        evidenceRefs: [],
        sourceRefs: [],
        mainAlternative: null,
        uncertainty: "The comparison is limited to the visible state and returned facts.",
      } }
      : { status: "provider_unavailable" as const },
    score: {
      schemaVersion: "blind-discard-arena-batch-score/v1" as const,
      includedCaseCount: 1,
      matchedCaseCount: matched ? 1 : 0,
      unmatchedCaseCount: matched ? 0 : 1,
      labelAvailableCaseCount: 1,
      primaryMatchRate: { status: "available" as const, numerator: matched ? 1 : 0, denominator: 1, value: matched ? 1 : 0 },
      conditionalMatchRate: submitted
        ? { status: "available" as const, numerator: matched ? 1 : 0, denominator: 1, value: matched ? 1 : 0 }
        : { status: "not_available" as const, numerator: 0 as const, denominator: 0 as const, value: null },
      failures: {
        ...zeroFailures,
        ...(input.status === "provider_unavailable" ? { providerUnavailable: 1 } : {}),
      },
      cases: [{ caseRef: input.caseRef, status: matched ? "matched" as const : "not_matched" as const, reason: null }],
    },
    startedAt: "2026-10-15T00:00:00.000Z",
    endedAt: "2026-10-15T00:00:00.125Z",
    elapsedMs: 125,
    provider: { providerId: "openai-compatible", model: "test-model", protocolVersion: "arena-function-call/v1" },
    promptVersion: "blind-discard-arena-method/v1",
    limits: ARENA_RUN_LIMITS_V1,
    providerTurnCount: input.status === "completed" ? 2 : 1,
    toolCallCount: events.filter((event) => event.type === "tool_call").length,
    toolFailureCount: 0,
    recoverableToolFailureCount: 0,
    providerUsage: input.status === "completed"
      ? { status: "reported" as const, tokens: { inputTokens: 12, outputTokens: 4, totalTokens: 16 }, providerTurnCount: 2 }
      : { status: "unknown" as const, providerTurnCount: 1, unreportedTurnCount: 1 },
    events,
  };
}

function manifest() {
  return ArenaArchiveManifestSchema.parse({
    schemaVersion: "blind-discard-arena-run-manifest/v1",
    runId: "00000000-0000-4000-8000-000000000099",
    startedAt: "2026-10-15T00:00:00.000Z",
    codeSha: "a".repeat(40),
    dataset: {
      id: "blind-discard-smoke-v1",
      caseSetDigest: "b".repeat(64),
      split: { unit: "complete_game", developmentGames: 1, acceptanceGames: 0, status: "smoke_dev_only" },
      source: {
        kind: "sanitized_mahjong_soul_fixture",
        fixtureSha256: "c".repeat(64),
        sourceRecordHash: `sha256:${"d".repeat(64)}`,
      },
      inputCaseCount: 3,
      selected: [
        { canonicalDecisionOrder: 0, candidateCount: 13, candidateSetDigest: "e".repeat(64) },
        { canonicalDecisionOrder: 1, candidateCount: 12, candidateSetDigest: "f".repeat(64) },
      ],
      excluded: [{ canonicalDecisionOrder: 2, reason: "fewer_than_two_candidates" }],
    },
    mortal: {
      runtimeIdentity: {
        runtimeImplementation: "Equim-chan/Mortal",
        runtimeRevision: "0".repeat(40),
        runtimeVersion: "Mortal V4",
        runtimeArtifactSha256: "1".repeat(64),
        runtimeModelSha256: "2".repeat(64),
        runtimeEngineSha256: "3".repeat(64),
        checkpointRepository: "Yuchen1457/mortal-582500",
        checkpointRevision: "4".repeat(40),
        checkpointModelTag: "mortal-hpc@582500",
        checkpointFileSha256: "5".repeat(64),
        protocolVersion: "riichi-local-mortal-jsonl/v1",
        adapterVersion: "local-mortal-adapter/v1",
        nativeArtifactSha256: "6".repeat(64),
      },
      ruleIdentity: {
        implementation: "Equim-chan/Mortal/libriichi",
        revision: "0".repeat(40),
        nativeArtifactSha256: "6".repeat(64),
        wrapperSha256: "1".repeat(64),
        normalizationVersion: "libriichi-actions/v2",
      },
      runtimeConfigSha256: "7".repeat(64),
    },
    coach: {
      providerId: "openai-compatible",
      model: "test-model",
      protocolVersion: "arena-function-call/v1",
      promptVersion: "blind-discard-arena-method/v1",
      submissionSchemaVersion: "blind-discard-arena-submission/v1",
      credentialStatus: "available",
    },
    rag: { mode: "local", corpusVersion: "blind-discard-arena-seeds/v1", retrieverVersion: "arena-local-terms/v1" },
    controlledFault: "none",
    budget: { maxCases: 3, limits: ARENA_RUN_LIMITS_V1, selectionSeed: null },
  });
}

it("preserves typed datasets and scenario exclusions while accepting unchanged legacy manifests", () => {
  const legacy = manifest();
  expect(legacy.dataset.id).toBe("blind-discard-smoke-v1");
  for (const id of ["blind-discard-flat-v1", "blind-discard-spatial-v1"]) {
    const typed = ArenaArchiveManifestSchema.parse({ ...legacy, dataset: { ...legacy.dataset, id,
      excluded: [{ canonicalDecisionOrder: 9, reason: "different_experiment_type" }] } });
    expect(typed.dataset.id).toBe(id);
    expect(typed.dataset.excluded[0]?.reason).toBe("different_experiment_type");
  }
});

function scanEvent() {
  return ArenaArchiveEventSchema.parse({
    schemaVersion: "blind-discard-arena-archive-event/v1",
    type: "dataset_scan",
    recordedAt: "2026-10-15T00:00:00.000Z",
    datasetId: "blind-discard-smoke-v1",
    sourceRecordHash: `sha256:${"d".repeat(64)}`,
    inputCaseCount: 3,
    selected: [
      { caseOrdinal: 0, canonicalDecisionOrder: 0, candidateCount: 13, candidateSetDigest: "e".repeat(64) },
      { caseOrdinal: 1, canonicalDecisionOrder: 1, candidateCount: 12, candidateSetDigest: "f".repeat(64) },
    ],
    excluded: [{ canonicalDecisionOrder: 2, reason: "fewer_than_two_candidates" }],
  });
}

describe("Blind Discard Arena run archive", () => {
  it("keeps old summary bytes stable and counts scenario exclusions only for grouped datasets", () => {
    const legacy = manifest(), scan = scanEvent();
    const old = summarizeArenaArchive({ manifest: legacy, events: [scan] });
    expect(Object.hasOwn(old.exclusionCounts, "different_experiment_type")).toBe(false);
    const exclusions = [...legacy.dataset.excluded, { canonicalDecisionOrder: 9, reason: "different_experiment_type" }];
    const grouped = summarizeArenaArchive({ manifest: { ...legacy, dataset: { ...legacy.dataset, id: "blind-discard-spatial-v1", excluded: exclusions } },
      events: [{ ...scan, datasetId: "blind-discard-spatial-v1", excluded: exclusions }] });
    expect(grouped.exclusionCounts.different_experiment_type).toBe(1);
    expect(legacy.dataset.id).toBe("blind-discard-smoke-v1");
  });
  it("recomputes a 110-case development archive without changing old archive identities", () => {
    const base = manifest();
    const selected = Array.from({ length: 110 }, (_, canonicalDecisionOrder) => ({ ...base.dataset.selected[0]!, canonicalDecisionOrder }));
    const expanded = ArenaArchiveManifestSchema.parse({ ...base,
      dataset: { ...base.dataset, id: "blind-discard-dev-v1", inputCaseCount: 110, selected, excluded: [], selection: { offset: 0, poolSize: 110 },
        split: { ...base.dataset.split, status: "development_only" } }, budget: { ...base.budget, maxCases: 110 } });
    const scan = { ...scanEvent(), datasetId: "blind-discard-dev-v1", inputCaseCount: 110, selected: selected.map((row, caseOrdinal) => ({ ...row, caseOrdinal })), excluded: [] };
    const events = [scan, ...selected.map((_, caseOrdinal) => ({ schemaVersion: "blind-discard-arena-archive-event/v1", type: "case_run", recordedAt: "2026-10-15T00:00:01.000Z", caseOrdinal, ragMode: "local",
      result: result({ caseRef: `arena-case:v1:00000000-0000-4000-8000-${String(caseOrdinal + 1000).padStart(12, "0")}`, status: "completed", matched: true }) }))];
    const parsed = parseArenaArchiveEvents(events.map(row => JSON.stringify(row)).join("\n"));
    const summary = summarizeArenaArchive({ manifest: expanded, events: parsed });
    expect(summary).toMatchObject({ datasetId: "blind-discard-dev-v1", selectedCaseCount: 110, recordedRunCount: 110, score: { matchedCaseCount: 110 } });
    expect(manifest().dataset.id).toBe("blind-discard-smoke-v1");
  });
  it("reads complete public trace records without treating a partially appended line as an event", () => {
    const record = { schemaVersion: "blind-discard-arena-case-trace/v1", caseOrdinal: 0,
      event: { type: "provider_turn", turn: 1, elapsedMs: 10, inputBytes: 20, result: "tool_call", decisionSummary: "查询公开资料。" } };
    const wire = JSON.stringify(record);
    expect(parseArenaCaseTrace(`${wire}\n${wire.slice(0, 40)}`)).toEqual([record]);
    expect(parseArenaCaseTrace("")).toEqual([]);
    expect(() => parseArenaCaseTrace(`${JSON.stringify({ ...record, privateReasoning: "not allowed" })}\n`)).toThrow();
    expect(parseArenaCaseTrace(`${JSON.stringify({ ...record, caseOrdinal: 109 })}\n`)).toHaveLength(1);
    expect(() => parseArenaCaseTrace(`${JSON.stringify({ ...record, caseOrdinal: 128 })}\n`)).toThrow();
    expect(() => parseArenaCaseTrace(`${wire}\n`.repeat(8193))).toThrow();
  });
  it("warns at cumulative reported tokens, does not double count cache, and retains unknown use", () => {
    const base = summarizeArenaArchive({ manifest: manifest(), events: [scanEvent()] });
    const reported = { ...base, tokenUsage: { status: "reported", tokens: { inputTokens: 80, cachedInputTokens: 60, outputTokens: 20, totalTokens: 100 }, providerTurnCount: 1 } };
    const partial = { ...base, tokenUsage: { status: "unknown", reportedPartial: { inputTokens: 10, outputTokens: 5 }, providerTurnCount: 2, unreportedRunCount: 1 } };
    expect(arenaTokenBudget([reported], 101)).toMatchObject({ knownTotalTokens: 100, warning: false, unknownRunCount: 0 });
    expect(arenaTokenBudget([reported, partial, null], 115)).toMatchObject({ knownTotalTokens: 115, warning: true, unknownRunCount: 2 });
    expect(arenaTokenBudget([base])).toMatchObject({ warningThreshold: 100_000_000, warning: false });
  });

  it("recomputes complete denominators, failures, helper/RAG events, and unknown usage offline", () => {
    const events = [
      scanEvent(),
      ArenaArchiveEventSchema.parse({
        schemaVersion: "blind-discard-arena-archive-event/v1",
        type: "case_run",
        recordedAt: "2026-10-15T00:00:01.000Z",
        caseOrdinal: 0,
        ragMode: "local",
        result: result({ caseRef: caseRefs[0], status: "completed", matched: true, helper: true, ragHit: true }),
      }),
      ArenaArchiveEventSchema.parse({
        schemaVersion: "blind-discard-arena-archive-event/v1",
        type: "case_run",
        recordedAt: "2026-10-15T00:00:02.000Z",
        caseOrdinal: 1,
        ragMode: "local",
        result: result({ caseRef: caseRefs[1], status: "provider_unavailable" }),
      }),
    ];
    const parsed = parseArenaArchiveEvents(events.map((event) => JSON.stringify(event)).join("\n"));
    const summary = summarizeArenaArchive({ manifest: manifest(), events: parsed });

    expect(summary.inputCaseCount).toBe(3);
    expect(summary.selectedCaseCount).toBe(2);
    expect(summary.excludedCaseCount).toBe(1);
    expect(summary.exclusionCounts.fewer_than_two_candidates).toBe(1);
    expect(summary.terminalStatuses.completed).toBe(1);
    expect(summary.terminalStatuses.provider_unavailable).toBe(1);
    expect(summary.score.primaryMatchRate).toEqual({ status: "available", numerator: 1, denominator: 2, value: 0.5 });
    expect(summary.score.conditionalMatchRate).toEqual({ status: "available", numerator: 1, denominator: 1, value: 1 });
    expect(summary.failures.providerUnavailable).toBe(1);
    expect(summary.evidence).toMatchObject({ helperQueries: 1, helperSuccesses: 1, ragQueries: 1, ragHits: 1, expertQualityReview: "not_performed" });
    expect(summary.tokenUsage).toMatchObject({ status: "unknown", providerTurnCount: 3, unreportedRunCount: 1, reportedPartial: { inputTokens: 12, outputTokens: 4, totalTokens: 16 } });
  });

  it("rejects run events that escape the frozen dataset or switch RAG mode", () => {
    const outsideCase = ArenaArchiveEventSchema.parse({
      schemaVersion: "blind-discard-arena-archive-event/v1",
      type: "case_run",
      recordedAt: "2026-10-15T00:00:01.000Z",
      caseOrdinal: 9,
      ragMode: "off",
      result: result({ caseRef: caseRefs[0], status: "provider_unavailable" }),
    });
    expect(() => summarizeArenaArchive({ manifest: manifest(), events: [scanEvent(), outsideCase] })).toThrow("arena_archive_rag_mode_mismatch");
  });
});

it("ranks actual Q values, limits Top 10, and resolves ties with the native preferred action", () => {
  const actions = Array.from({ length: 14 }, (_, i) => ({ actionRef: `action-${i}`, qValue: -i }));
  actions[1]!.qValue = 0;
  const before = JSON.stringify(actions);
  const ranked = arenaMortalTopTen({ actions, preferred: actions[1]! });
  expect(ranked.candidateCount).toBe(14);
  expect(ranked.rows).toHaveLength(10);
  expect(ranked.rows[0]).toEqual(actions[1]);
  expect(ranked.rows[1]).toEqual(actions[0]);
  expect(ranked.rows[9]!.qValue).toBe(-9);
  expect(JSON.stringify(actions)).toBe(before);
});

it("withholds Q scores until final case events and rejects other archives or runtime identities", () => {
  const m = manifest();
  const raw = { schemaVersion: "arena-mortal-details/v1", runId: m.runId, caseSetDigest: m.dataset.caseSetDigest,
    createdAt: m.startedAt, origin: "recomputed", mortal: m.mortal,
    cases: [0, 1].map(caseOrdinal => ({ caseOrdinal, candidateCount: 2, preferredActionRef: actionRef, rows: [{ actionRef, qValue: 0.25 }] })) };
  expect(visibleArenaMortalDetails(raw, m, [])?.cases).toEqual([]);
  const event = ArenaArchiveEventSchema.parse({ schemaVersion: "blind-discard-arena-archive-event/v1", type: "case_run",
    recordedAt: m.startedAt, caseOrdinal: 0, ragMode: "off", result: result({ caseRef: caseRefs[0], status: "completed" }) });
  expect(visibleArenaMortalDetails(raw, m, [event])?.cases.map(c => c.caseOrdinal)).toEqual([0]);
  expect(visibleArenaMortalDetails({ ...raw, caseSetDigest: 'c'.repeat(64) }, m, [event])).toBeNull();
  expect(visibleArenaMortalDetails({ ...raw, runId: '00000000-0000-4000-8000-000000000098' }, m, [event])).toBeNull();
  expect(visibleArenaMortalDetails({ ...raw, mortal: { ...raw.mortal, runtimeConfigSha256: 'd'.repeat(64) } }, m, [event])).toBeNull();
});
