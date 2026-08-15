import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  DecisionSnapshotV2Schema,
  KnownGameFactsSchema,
  type CanonicalEventStream,
} from "@riichi-coach/contracts";
import {
  formatMjaiTile,
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import {
  entryMatchesDecisionIdentity,
  runBoundMortalDecisionReview,
  validateMortalReportBinding,
  type MortalSingleDecisionReviewResult,
} from "./mortal-review-service.js";

export type MortalFullGameFailureCode =
  | "mortal_report_game_fingerprint_mismatch"
  | "mortal_report_perspective_mismatch"
  | "mortal_full_game_input_invalid";

export type MortalBindingStatus = "bound" | "no_mortal_entry" | "ambiguous";

export type MortalSupportStatus = "supported" | "unsupported";

export type MortalUnsupportedReason =
  | "local_actual_not_represented"
  | "riichi_discard_not_supported"
  | "mortal_candidate_action_not_supported";

export type MortalBindingMismatchReason =
  | "multiple_mortal_entries_for_decision"
  | "mortal_entry_matches_multiple_decisions"
  | "source_entry_reuse"
  | "source_order_violation"
  | "mortal_actual_mismatch";

export type MortalModelIncompleteReason =
  | "actual_action_not_scored"
  | "duplicate_model_action"
  | "invalid_model_candidate"
  | "fewer_than_two_distinct_actions"
  | "cross_decision_window"
  | "candidate_normalization_failed";

export type MortalAnalysisBlockedReason =
  | "fact_engine_failure"
  | "structured_analysis_assembly_failure";

export type MortalDecisionOutcome =
  | "analysis_ready"
  | "unsupported_action"
  | "no_mortal_entry"
  | "binding_mismatch"
  | "model_output_incomplete"
  | "analysis_blocked";

export type MortalFullGameReviewStatus = "coverage_ready" | "failed";

export type MortalFullGameModelSummary = Readonly<{
  actualActionRef: string;
  preferredActions: readonly string[];
  topModelProbability: number;
  errorGap: number;
  detailClass: "not_error" | "concise" | "detailed";
  factorAnalysisMode: string;
  deterministicPreference: unknown;
}>;

export type MortalFullGameLedgerEntry = Readonly<{
  decisionOrdinal: number;
  roundOrdinal: number;
  binding: MortalBindingStatus;
  support: MortalSupportStatus;
  review: "not_attempted" | "analysis_ready" | "model_output_incomplete" | "analysis_blocked";
  outcome: MortalDecisionOutcome;
  reason:
    | MortalBindingMismatchReason
    | MortalUnsupportedReason
    | MortalModelIncompleteReason
    | MortalAnalysisBlockedReason
    | null;
  sourceEntryRef: string | null;
  sourceOrdinal: number | null;
  modelSummary: MortalFullGameModelSummary | null;
}>;

export type MortalSourceDisposition = "bound" | "unbound" | "ambiguous";

export type MortalSourceCoverageEntry = Readonly<{
  sourceEntryRef: string;
  roundOrdinal: number;
  kyoku: number;
  honba: number;
  junme: number;
  sourceOrdinal: number;
  disposition: MortalSourceDisposition;
}>;

export type MortalSourceCoverage = Readonly<{
  mortalSelfEntryCount: number;
  boundMortalEntryCount: number;
  unboundMortalEntryCount: number;
  ambiguousMortalEntryCount: number;
  entries: readonly MortalSourceCoverageEntry[];
}>;

export type MortalFullGameCoverageSummary = Readonly<{
  replayDecisionCount: number;
  mortalSelfEntryCount: number;
  localConservation: number;
  sourceConservation: number;
  outcomes: Readonly<Record<MortalDecisionOutcome, number>>;
  binding: Readonly<{
    bound: number;
    noMortalEntry: number;
    ambiguous: number;
  }>;
  supportedPairCount: number;
  unsupportedReasons: Readonly<Partial<Record<MortalUnsupportedReason, number>>>;
  modelIncompleteReasons: Readonly<Partial<Record<MortalModelIncompleteReason, number>>>;
  analysisBlockedReasons: Readonly<Partial<Record<MortalAnalysisBlockedReason, number>>>;
}>;

export type MortalFullGameReviewResult =
  | {
      readonly status: "coverage_ready";
      readonly summary: MortalFullGameCoverageSummary;
      readonly decisions: readonly MortalFullGameLedgerEntry[];
      readonly sourceCoverage: MortalSourceCoverage;
    }
  | {
      readonly status: "failed";
      readonly code: MortalFullGameFailureCode;
    };

type SourceRow = {
  readonly sourceOrdinal: number;
  readonly ref: string;
  readonly entry: MortalReportDecisionEntry;
};

export type MortalBindingPlanRow = {
  readonly decisionOrdinal: number;
  readonly roundOrdinal: number;
  readonly binding: MortalBindingStatus;
  readonly sourceEntryRef: string | null;
  readonly sourceOrdinal: number | null;
  readonly sourceEntry: MortalReportDecisionEntry | null;
  readonly localDegree: number;
  readonly sourceDegree: number | null;
  readonly orderViolation: boolean;
};

function reportIdHash(reportId: string): string {
  return `sha256:${createHash("sha256").update(reportId).digest("hex")}`;
}

function flattenSourceRows(report: MortalFetchedReport): SourceRow[] {
  const rows: SourceRow[] = [];
  let sourceOrdinal = 0;
  for (const kyoku of report.kyokus) {
    for (const entry of kyoku.entries) {
      rows.push({
        sourceOrdinal,
        ref: `${reportIdHash(report.reportId)}:${sourceOrdinal}`,
        entry,
      });
      sourceOrdinal += 1;
    }
  }
  return rows;
}

function validateFullGameInputs(
  rawStream: CanonicalEventStream,
  decisions: readonly ReplayedDecision[],
): string | null {
  const stream = CanonicalEventStreamSchema.safeParse(rawStream);
  if (!stream.success) return "canonical_stream_schema_invalid";
  if (!Array.isArray(decisions) || decisions.length === 0) {
    return "decisions_empty";
  }
  const seenDecisionRefs = new Set<string>();
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    const snapshot = DecisionSnapshotV2Schema.safeParse(decision.snapshot);
    if (!snapshot.success) return `decision_${index}_snapshot_invalid`;
    const facts = KnownGameFactsSchema.safeParse(decision.facts);
    if (!facts.success) return `decision_${index}_facts_invalid`;
    if (snapshot.data.decisionEventRef !== decision.decisionEventRef) {
      return `decision_${index}_event_ref_mismatch`;
    }
    if (snapshot.data.decisionEventRef !== facts.data.decisionEventRef) {
      return `decision_${index}_facts_event_ref_mismatch`;
    }
    if (snapshot.data.selfActor !== stream.data.selfActor) {
      return `decision_${index}_actor_mismatch`;
    }
    if (seenDecisionRefs.has(decision.decisionEventRef)) {
      return `decision_${index}_duplicate_event_ref`;
    }
    seenDecisionRefs.add(decision.decisionEventRef);
  }
  return null;
}

function localSupport(
  decision: ReplayedDecision,
): {
  support: MortalSupportStatus;
  reason: MortalUnsupportedReason | null;
} {
  if (decision.actualDiscard === null) {
    return {
      support: "unsupported",
      reason: "local_actual_not_represented",
    };
  }
  if (decision.actualDiscard.riichiDeclarationEventRef !== null) {
    return {
      support: "unsupported",
      reason: "riichi_discard_not_supported",
    };
  }
  return { support: "supported", reason: null };
}

export function buildMortalFullGameBindingPlan(
  decisions: readonly ReplayedDecision[],
  report: MortalFetchedReport,
): {
  rows: MortalBindingPlanRow[];
  sourceDegrees: number[];
} {
  const sourceRows = flattenSourceRows(report);
  const matchesByLocal: number[][] = decisions.map((decision) => {
    const matches: number[] = [];
    for (const sourceRow of sourceRows) {
      if (entryMatchesDecisionIdentity(sourceRow.entry, decision)) {
        matches.push(sourceRow.sourceOrdinal);
      }
    }
    return matches;
  });
  const sourceDegrees = sourceRows.map((sourceRow) =>
    matchesByLocal.reduce(
      (count, matches) => count + (matches.includes(sourceRow.sourceOrdinal) ? 1 : 0),
      0,
    )
  );
  const localDegrees = matchesByLocal.map((matches) => matches.length);

  // A pair is bound ONLY when both sides have degree 1. No greedy matching.
  const uniquePairs: Array<{
    decisionOrdinal: number;
    sourceOrdinal: number;
  }> = [];
  for (let index = 0; index < decisions.length; index += 1) {
    const matches = matchesByLocal[index]!;
    if (matches.length !== 1) continue;
    const sourceOrdinal = matches[0]!;
    if (sourceDegrees[sourceOrdinal] !== 1) continue;
    uniquePairs.push({ decisionOrdinal: index, sourceOrdinal });
  }

  // Strict monotonicity: bound pairs must preserve canonical decision order
  // and source-entry order. The first crossing pair and all following pairs
  // fail closed as source_order_violation.
  let previousSourceOrdinal = -1;
  const orderViolationByDecision = new Map<number, boolean>();
  for (const pair of uniquePairs) {
    const violation = pair.sourceOrdinal <= previousSourceOrdinal;
    orderViolationByDecision.set(pair.decisionOrdinal, violation);
    if (!violation) previousSourceOrdinal = pair.sourceOrdinal;
  }

  const rows: MortalBindingPlanRow[] = decisions.map((decision, decisionOrdinal) => {
    const matches = matchesByLocal[decisionOrdinal]!;
    const localDegree = localDegrees[decisionOrdinal]!;
    const snapshot = decision.snapshot;
    let binding: MortalBindingStatus;
    let sourceEntryRef: string | null = null;
    let sourceOrdinal: number | null = null;
    let sourceEntry: MortalReportDecisionEntry | null = null;
    let sourceDegree: number | null = null;
    let orderViolation = false;

    if (localDegree === 0) {
      binding = "no_mortal_entry";
    } else if (localDegree === 1) {
      const matchedSource = sourceRows[matches[0]!]!;
      sourceEntryRef = matchedSource.ref;
      sourceOrdinal = matchedSource.sourceOrdinal;
      sourceEntry = matchedSource.entry;
      sourceDegree = sourceDegrees[matchedSource.sourceOrdinal]!;
      if (sourceDegree !== 1) {
        binding = "ambiguous";
      } else if (orderViolationByDecision.get(decisionOrdinal) === true) {
        binding = "ambiguous";
        orderViolation = true;
      } else {
        binding = "bound";
      }
    } else {
      binding = "ambiguous";
    }

    return {
      decisionOrdinal,
      roundOrdinal: snapshot.publicState.roundOrdinal,
      binding,
      sourceEntryRef,
      sourceOrdinal,
      sourceEntry,
      localDegree,
      sourceDegree,
      orderViolation,
    };
  });

  return { rows, sourceDegrees };
}

function modelIncompleteReason(
  result: Extract<MortalSingleDecisionReviewResult, { status: "failed" }>,
): MortalModelIncompleteReason {
  const diagnostics = result.diagnostics;
  if (diagnostics.includes("actual_action_not_scored")) {
    return "actual_action_not_scored";
  }
  if (diagnostics.includes("duplicate_model_action")) {
    return "duplicate_model_action";
  }
  if (
    diagnostics.includes("invalid_model_probability")
    || diagnostics.includes("invalid_model_q_value")
  ) {
    return "invalid_model_candidate";
  }
  return "candidate_normalization_failed";
}

function analysisBlockedReason(
  result: Extract<MortalSingleDecisionReviewResult, { status: "failed" }>,
): MortalAnalysisBlockedReason {
  return result.code === "mortal_review_assembly_failed"
    ? "structured_analysis_assembly_failure"
    : "fact_engine_failure";
}

export async function runMortalFullGameReview(input: {
  readonly stream: CanonicalEventStream;
  readonly decisions: readonly ReplayedDecision[];
  readonly report: MortalFetchedReport;
  readonly engine: HandStructureFactEnginePort;
  readonly now?: () => number;
}): Promise<MortalFullGameReviewResult> {
  const now = input.now ?? Date.now;

  const inputError = validateFullGameInputs(input.stream, input.decisions);
  if (inputError !== null) {
    return { status: "failed", code: "mortal_full_game_input_invalid" };
  }
  const stream = CanonicalEventStreamSchema.parse(input.stream);

  try {
    validateMortalReportBinding(stream, input.report);
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "mortal_report_game_fingerprint_mismatch"
    ) {
      return { status: "failed", code: "mortal_report_game_fingerprint_mismatch" };
    }
    if (error instanceof Error && error.message === "mortal_report_perspective_mismatch") {
      return { status: "failed", code: "mortal_report_perspective_mismatch" };
    }
    return { status: "failed", code: "mortal_full_game_input_invalid" };
  }

  const { rows, sourceDegrees } = buildMortalFullGameBindingPlan(
    input.decisions,
    input.report,
  );
  const sourceRows = flattenSourceRows(input.report);

  const runStartedAt = now();
  const frozenAt = new Date(runStartedAt).toISOString();

  const ledger: MortalFullGameLedgerEntry[] = [];
  const outcomeCounts: Record<MortalDecisionOutcome, number> = {
    analysis_ready: 0,
    unsupported_action: 0,
    no_mortal_entry: 0,
    binding_mismatch: 0,
    model_output_incomplete: 0,
    analysis_blocked: 0,
  };
  const unsupportedReasonCounts: Partial<Record<MortalUnsupportedReason, number>> = {};
  const modelIncompleteReasonCounts: Partial<Record<MortalModelIncompleteReason, number>> = {};
  const analysisBlockedReasonCounts: Partial<Record<MortalAnalysisBlockedReason, number>> = {};

  for (const row of rows) {
    const decision = input.decisions[row.decisionOrdinal]!;
    const local = localSupport(decision);
    const support = local.support;

    // Mortal candidate set must also be A1-representable for a bound row.
    let effectiveSupport = support;
    let unsupportedReason = local.reason;
    const boundSourceEntry = row.sourceEntry;
    if (
      row.binding === "bound"
      && support === "supported"
      && boundSourceEntry !== null
      && !(
        boundSourceEntry.details.length > 0
        && boundSourceEntry.details.every((detail) => detail.action.type === "dahai")
      )
    ) {
      effectiveSupport = "unsupported";
      unsupportedReason = "mortal_candidate_action_not_supported";
    }

    // Precedence: binding failure first, then unsupported action, then no
    // source entry, then evaluation.
    if (row.binding === "ambiguous") {
      let reason: MortalBindingMismatchReason;
      if (row.orderViolation) {
        reason = "source_order_violation";
      } else if (row.localDegree > 1) {
        reason = "multiple_mortal_entries_for_decision";
      } else {
        reason = "mortal_entry_matches_multiple_decisions";
      }
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "binding_mismatch",
        reason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.binding_mismatch += 1;
      continue;
    }

    if (effectiveSupport === "unsupported") {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support: effectiveSupport,
        review: "not_attempted",
        outcome: "unsupported_action",
        reason: unsupportedReason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.unsupported_action += 1;
      if (unsupportedReason !== null) {
        unsupportedReasonCounts[unsupportedReason] =
          (unsupportedReasonCounts[unsupportedReason] ?? 0) + 1;
      }
      continue;
    }

    if (row.binding === "no_mortal_entry") {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "no_mortal_entry",
        reason: null,
        sourceEntryRef: null,
        sourceOrdinal: null,
        modelSummary: null,
      });
      outcomeCounts.no_mortal_entry += 1;
      continue;
    }

    // Bound + supported: local ordinary discard + dahai-only Mortal set.
    if (row.sourceEntry === null) {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "binding_mismatch",
        reason: "mortal_entry_matches_multiple_decisions",
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.binding_mismatch += 1;
      continue;
    }

    // Local actual authority pre-check (exact cross-check before pipeline).
    const localActual = decision.actualDiscard!;
    if (
      row.sourceEntry.actual.type !== "dahai"
      || row.sourceEntry.actual.actor !== decision.snapshot.selfActor
      || row.sourceEntry.actual.pai !== formatMjaiTile(localActual.tile)
      || row.sourceEntry.actual.tsumogiri !== (localActual.discardMode === "tsumogiri")
    ) {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "binding_mismatch",
        reason: "mortal_actual_mismatch",
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.binding_mismatch += 1;
      continue;
    }

    const result = await runBoundMortalDecisionReview({
      stream,
      decision,
      report: input.report,
      entry: row.sourceEntry,
      engine: input.engine,
      now,
      frozenAt,
    });

    if (result.status === "ready") {
      const actualCandidate = result.comparisonSet.candidates.find((candidate) =>
        candidate.origins.includes("actual")
      );
      const topModelProbability = Math.max(
        ...result.modelEvaluation.candidates.map((candidate) =>
          candidate.modelSelectionScore
        ),
      );
      const engineBlocked = result.factorResult.diagnostics.some((diagnostic) =>
        diagnostic.status === "blocked_engine_failure"
      );
      if (engineBlocked) {
        ledger.push({
          decisionOrdinal: row.decisionOrdinal,
          roundOrdinal: row.roundOrdinal,
          binding: row.binding,
          support,
          review: "analysis_blocked",
          outcome: "analysis_blocked",
          reason: "fact_engine_failure",
          sourceEntryRef: row.sourceEntryRef,
          sourceOrdinal: row.sourceOrdinal,
          modelSummary: null,
        });
        outcomeCounts.analysis_blocked += 1;
        analysisBlockedReasonCounts.fact_engine_failure =
          (analysisBlockedReasonCounts.fact_engine_failure ?? 0) + 1;
        continue;
      }
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "analysis_ready",
        outcome: "analysis_ready",
        reason: null,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: {
          actualActionRef: result.modelEvaluation.actualActionRef,
          preferredActions: result.modelEvaluation.preferredActions,
          topModelProbability,
          errorGap: result.modelEvaluation.errorGap,
          detailClass: result.modelEvaluation.errorGap === 0
            ? "not_error"
            : result.modelEvaluation.errorGap >= result.modelEvaluation.detailPolicy.threshold
              ? "detailed"
              : "concise",
          factorAnalysisMode: result.factorResult.analysisMode,
          deterministicPreference: result.factorResult.deterministicPreference,
        },
      });
      outcomeCounts.analysis_ready += 1;
      continue;
    }

    if (result.status === "not_comparable") {
      const reason: MortalModelIncompleteReason =
        result.code === "cross_decision_window"
          ? "cross_decision_window"
          : "fewer_than_two_distinct_actions";
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "model_output_incomplete",
        outcome: "model_output_incomplete",
        reason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.model_output_incomplete += 1;
      modelIncompleteReasonCounts[reason] =
        (modelIncompleteReasonCounts[reason] ?? 0) + 1;
      continue;
    }

    if (result.code === "mortal_decision_unsupported_entry") {
      const reason = modelIncompleteReason(result);
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "model_output_incomplete",
        outcome: "model_output_incomplete",
        reason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.model_output_incomplete += 1;
      modelIncompleteReasonCounts[reason] =
        (modelIncompleteReasonCounts[reason] ?? 0) + 1;
      continue;
    }

    if (
      result.code === "mortal_review_assembly_failed"
      || result.code === "mortal_review_engine_failed"
    ) {
      const reason = analysisBlockedReason(result);
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "analysis_blocked",
        outcome: "analysis_blocked",
        reason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.analysis_blocked += 1;
      analysisBlockedReasonCounts[reason] =
        (analysisBlockedReasonCounts[reason] ?? 0) + 1;
      continue;
    }

    // Any other fixed failure (e.g. actual mismatch) is a binding mismatch.
    ledger.push({
      decisionOrdinal: row.decisionOrdinal,
      roundOrdinal: row.roundOrdinal,
      binding: row.binding,
      support,
      review: "not_attempted",
      outcome: "binding_mismatch",
      reason: result.code === "mortal_decision_actual_mismatch"
        ? "mortal_actual_mismatch"
        : "mortal_entry_matches_multiple_decisions",
      sourceEntryRef: row.sourceEntryRef,
      sourceOrdinal: row.sourceOrdinal,
      modelSummary: null,
    });
    outcomeCounts.binding_mismatch += 1;
  }

  // Source-side conservation ledger.
  const boundSourceOrdinals = new Set(
    ledger
      .filter((row) => row.binding === "bound")
      .map((row) => row.sourceOrdinal)
      .filter((value): value is number => value !== null),
  );
  const ambiguousLocalSourceOrdinals = new Set(
    ledger
      .filter((row) => row.binding === "ambiguous" && row.sourceOrdinal !== null)
      .map((row) => row.sourceOrdinal!)
  );
  const sourceCoverageEntries = sourceRows.map((sourceRow) => {
    let disposition: MortalSourceDisposition;
    if (boundSourceOrdinals.has(sourceRow.sourceOrdinal)) {
      disposition = "bound";
    } else if (
      sourceDegrees[sourceRow.sourceOrdinal]! > 1
      || ambiguousLocalSourceOrdinals.has(sourceRow.sourceOrdinal)
    ) {
      disposition = "ambiguous";
    } else {
      disposition = "unbound";
    }
    return Object.freeze({
      sourceEntryRef: sourceRow.ref,
      roundOrdinal: sourceRow.entry.roundOrdinal,
      kyoku: sourceRow.entry.kyoku,
      honba: sourceRow.entry.honba,
      junme: sourceRow.entry.junme,
      sourceOrdinal: sourceRow.sourceOrdinal,
      disposition,
    });
  });

  const bindingCounts = {
    bound: ledger.filter((row) => row.binding === "bound").length,
    noMortalEntry: ledger.filter((row) => row.binding === "no_mortal_entry").length,
    ambiguous: ledger.filter((row) => row.binding === "ambiguous").length,
  };

  const sourceCoverage: MortalSourceCoverage = Object.freeze({
    mortalSelfEntryCount: sourceRows.length,
    boundMortalEntryCount: sourceCoverageEntries.filter((entry) =>
      entry.disposition === "bound"
    ).length,
    unboundMortalEntryCount: sourceCoverageEntries.filter((entry) =>
      entry.disposition === "unbound"
    ).length,
    ambiguousMortalEntryCount: sourceCoverageEntries.filter((entry) =>
      entry.disposition === "ambiguous"
    ).length,
    entries: Object.freeze(sourceCoverageEntries),
  });

  const summary: MortalFullGameCoverageSummary = Object.freeze({
    replayDecisionCount: input.decisions.length,
    mortalSelfEntryCount: sourceRows.length,
    localConservation: input.decisions.length,
    sourceConservation: sourceRows.length,
    outcomes: Object.freeze(outcomeCounts),
    binding: Object.freeze(bindingCounts),
    supportedPairCount: ledger.filter((row) =>
      row.binding === "bound" && row.support === "supported"
    ).length,
    unsupportedReasons: Object.freeze(unsupportedReasonCounts),
    modelIncompleteReasons: Object.freeze(modelIncompleteReasonCounts),
    analysisBlockedReasons: Object.freeze(analysisBlockedReasonCounts),
  });

  return {
    status: "coverage_ready",
    summary,
    decisions: Object.freeze(ledger),
    sourceCoverage,
  };
}
