import { createHash } from "node:crypto";
import {
  CanonicalEventStreamSchema,
  DecisionSnapshotV2Schema,
  KnownGameFactsSchema,
  type CanonicalEventStream,
} from "@riichi-coach/contracts";
import {
  type MortalFetchedReport,
  type MortalReportDecisionEntry,
} from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import {
  entryMatchesDecisionIdentity,
  mortalActualMatchesLocal,
  runBoundMortalDecisionReview,
  supportedCandidateTypesForWindow,
  validateMortalReportBinding,
  type MortalSingleDecisionReviewResult,
} from "./mortal-review-service.js";
import {
  EMPTY_MORTAL_COVERAGE_REGISTRY,
  classifyCoverageBranches,
  type MortalCoverageBranch,
  type MortalCoverageRegistry,
} from "./mortal-coverage-registry.js";
import {
  collectSingleCandidateProofs,
  type SingleCandidateProof,
} from "./single-candidate-proof.js";

export type MortalFullGameFailureCode =
  | "mortal_report_game_fingerprint_mismatch"
  | "mortal_report_perspective_mismatch"
  | "mortal_full_game_input_invalid";

export type MortalBindingStatus = "bound" | "no_mortal_entry" | "ambiguous";

export type MortalSupportStatus = "supported" | "unsupported";

export type MortalUnsupportedReason =
  | "local_actual_not_represented"
  | "mortal_candidate_action_not_supported"
  // M6-A3: the branch's production fail-closed has not been lifted by a
  // real E2E acceptance hit yet.
  | "coverage_branch_uncovered";

export type MortalBindingMismatchReason =
  | "multiple_mortal_entries_for_decision"
  | "mortal_entry_matches_multiple_decisions"
  | "source_entry_reuse"
  | "source_order_violation"
  | "mortal_actual_mismatch"
  // M6-A4.0: a locally-proven single-candidate window expects NO source row
  // (Mortal emits rows only at >=2-candidate decision points). A compatible
  // source row existing anyway contradicts the local expectation — integrity
  // failure, never a normal bound analysis.
  | "unexpected_source_row_present";

export type MortalModelIncompleteReason =
  | "actual_action_not_scored"
  | "duplicate_model_action"
  | "invalid_model_candidate"
  | "fewer_than_two_distinct_actions"
  | "cross_decision_window"
  | "candidate_normalization_failed"
  // M6-A3: a terminal window whose Mortal candidate set degenerated (e.g.
  // only the winning action) — fail closed, never fabricate a second
  // candidate.
  | "terminal_window_action_unsupported";

export type MortalAnalysisBlockedReason =
  | "fact_engine_failure"
  | "structured_analysis_assembly_failure";

export type MortalDecisionOutcome =
  | "analysis_ready"
  | "unsupported_action"
  // M6-A4.0: the seventh value. A legal state, decided purely by the local
  // candidate enumeration (count = 1 -> Mortal emits no row by definition)
  // BEFORE any source lookup; carries the proof. `no_mortal_entry` keeps its
  // integrity-failure semantics and must be 0 in a green acceptance run.
  | "source_row_not_expected"
  | "no_mortal_entry"
  | "binding_mismatch"
  | "model_output_incomplete"
  | "analysis_blocked";

export type MortalFullGameReviewStatus = "coverage_ready" | "failed";

export type MortalFullGameModelSummary = Readonly<{
  actualActionRef: string;
  preferredActions: readonly string[];
  topModelProbabilityPercent: number;
  errorGap: number;
  detailClass: "not_error" | "concise" | "detailed";
  factorAnalysisMode: string;
  deterministicPreference: unknown;
}>;

export type MortalFullGameLedgerEntry = Readonly<{
  decisionOrdinal: number;
  roundOrdinal: number;
  binding: MortalBindingStatus;
  // LOCAL actual representation support only (§21 closing round: local and
  // source-candidate support are separate classification stages; the outcome
  // plus reason fields carry whichever stage classified the row).
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
  // M6-A4.0: present exactly on source_row_not_expected rows — the local
  // proof that the window is single-candidate. Null otherwise.
  readonly singleCandidateProof?: SingleCandidateProof | null;
}>;

export type MortalSourceDisposition = "bound" | "unbound" | "ambiguous";

export type MortalSourceUnboundReason =
  // M6-A3: the two "*_not_replayed" classes are gone — every self-action
  // surface is enumerated locally now, so degree-0 rows are identity (or
  // kyuushu mapper-coverage) debt, never enumeration debt.
  | "local_terminal_action_not_replayed"
  | "identity_fact_mismatch"
  | "source_semantics_not_understood";

export type MortalSourceCoverageEntry = Readonly<{
  sourceEntryRef: string;
  roundOrdinal: number;
  kyoku: number;
  honba: number;
  junme: number;
  sourceOrdinal: number;
  disposition: MortalSourceDisposition;
  unboundReason: MortalSourceUnboundReason | null;
}>;

export type MortalSourceCoverage = Readonly<{
  // M6-A4.0: self-surface partition. The existing counts cover SELF rows
  // only (lastActor === playerId — the reviewed player's own decision rows);
  // response rows (triggered by an opponent's discard/kakan) are tracked
  // separately and never enter self conservation. Response identity tables
  // are A4.2 — until then response rows are neither bound nor failured.
  mortalSelfEntryCount: number;
  responseEntryCount: number;
  boundMortalEntryCount: number;
  unboundMortalEntryCount: number;
  ambiguousMortalEntryCount: number;
  entries: readonly MortalSourceCoverageEntry[];
}>;

export type MortalFullGameCoverageSummary = Readonly<{
  replayDecisionCount: number;
  mortalSelfEntryCount: number;
  // M6-A4.0: projected response rows (lastActor !== playerId) — a separate
  // surface, never part of self conservation.
  responseEntryCount: number;
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
  sourceUnboundReasons: Readonly<Partial<Record<MortalSourceUnboundReason, number>>>;
  // M6-A3 coverage matrix accounting: encounters count bound rows that
  // exercised a branch THROUGH the local-actual cross-check (a row whose
  // Mortal actual mismatches is a data-integrity failure, not a coverage
  // hit); uncoveredBlocks counts rows fail-closed because the branch has no
  // recorded real E2E hit.
  coverageBranchEncounters: Readonly<Partial<Record<MortalCoverageBranch, number>>>;
  coverageBranchUncoveredBlocks: Readonly<Partial<Record<MortalCoverageBranch, number>>>;
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

function classifyUnboundSourceReason(
  entry: MortalReportDecisionEntry,
  allSourceRows: readonly SourceRow[],
): MortalSourceUnboundReason {
  // This is ONLY called for genuine degree-0 source rows (never for rows
  // involved in any compatibility ambiguity).
  //
  // M6-A3: the replayer now enumerates post_call, post_riichi, and all four
  // terminal surfaces from canonical events, so a degree-0 row in any of
  // those shapes means its identity facts failed — not that the surface is
  // missing from local replay.
  if (entry.atSelfChiPon) return "identity_fact_mismatch";

  if (
    entry.actual.type === "reach"
    || entry.actual.type === "hora"
    || entry.actual.type === "agari"
    || entry.actual.type === "ankan"
    || entry.actual.type === "kakan"
  ) {
    // Self-turn surfaces with enumerated local counterparts: degree 0 means
    // the identity facts failed.
    return "identity_fact_mismatch";
  }

  if (entry.actual.type === "ryukyoku") {
    // Kyuushu attribution depends on the source mapper carrying the abort as
    // a self round_drawn in the canonical stream; a degree-0 row is local
    // terminal coverage debt, not an identity failure.
    return "local_terminal_action_not_replayed";
  }

  if (entry.actual.type !== "dahai") {
    // Any other non-dahai action has no explicitly proven replay-surface
    // semantics in this milestone.
    return "source_semantics_not_understood";
  }

  if (entry.atSelfRiichi) {
    // The same-turn post-riichi discard shape is proven only by a paired
    // `reach` entry with the same round/kyoku/honba/junme/tile; without that
    // proof we do not assert its semantics.
    const pairedReach = allSourceRows.some((sourceRow) => {
      const other = sourceRow.entry;
      return other.actual.type === "reach"
        && other.roundOrdinal === entry.roundOrdinal
        && other.kyoku === entry.kyoku
        && other.honba === entry.honba
        && other.junme === entry.junme
        && other.tile === entry.tile;
    });
    return pairedReach
      ? "identity_fact_mismatch"
      : "source_semantics_not_understood";
  }

  // A degree-0 ordinary self-turn-shaped dahai row has no surface exclusion;
  // its identity facts must have failed against every local decision.
  return "identity_fact_mismatch";
}

function localSupport(
  decision: ReplayedDecision,
): {
  support: MortalSupportStatus;
  reason: MortalUnsupportedReason | null;
} {
  // M6-A3: the typed actual decides support. Every represented kind
  // (discard / riichi_discard / tsumo / ankan / kakan / kyuushu_kyuuhai)
  // flows into the pipeline; only an unresolvable window (a pure round end
  // with no self action — exhaustive/abortive draws the canonical stream
  // attributes to no actor) stays fail-closed.
  if (decision.actualAction === null) {
    return {
      support: "unsupported",
      reason: "local_actual_not_represented",
    };
  }
  return { support: "supported", reason: null };
}

// The call kind for a post-call window, from its trigger event. Used only
// for coverage-branch classification. Exported so the acceptance evidence
// extractor classifies accepted rows with the same inputs the review used.
export function callKindForDecision(
  stream: CanonicalEventStream,
  decision: ReplayedDecision,
): "chi" | "pon" | null {
  const window = decision.snapshot.privateState.decisionWindow;
  if (window.kind !== "post_call_discard") return null;
  const trigger = stream.events.find(
    (event) => event.eventId === window.triggerEventRef,
  );
  if (trigger === undefined) return null;
  return trigger.type === "chi_called"
    ? "chi"
    : trigger.type === "pon_called"
      ? "pon"
      : null;
}

export function buildMortalFullGameBindingPlan(
  decisions: readonly ReplayedDecision[],
  report: MortalFetchedReport,
): {
  rows: MortalBindingPlanRow[];
  sourceDegrees: number[];
  matchesByLocal: number[][];
  ambiguousSourceOrdinals: number[];
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

  // Source-side ambiguity comes from the bipartite graph itself:
  //  - a source matched by more than one local decision,
  //  - a source that participates in a local with localDegree > 1,
  //  - a source that is part of an order-violation unique pair.
  const ambiguousSourceOrdinals = new Set<number>();
  sourceDegrees.forEach((degree, sourceOrdinal) => {
    if (degree > 1) ambiguousSourceOrdinals.add(sourceOrdinal);
  });
  matchesByLocal.forEach((matches, decisionOrdinal) => {
    if (localDegrees[decisionOrdinal]! > 1) {
      for (const sourceOrdinal of matches) ambiguousSourceOrdinals.add(sourceOrdinal);
    }
  });
  for (const pair of uniquePairs) {
    if (orderViolationByDecision.get(pair.decisionOrdinal) === true) {
      ambiguousSourceOrdinals.add(pair.sourceOrdinal);
    }
  }

  return {
    rows,
    sourceDegrees,
    matchesByLocal,
    ambiguousSourceOrdinals: [...ambiguousSourceOrdinals].sort((a, b) => a - b),
  };
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
  // M6-A3: branches stay fail-closed until real E2E acceptance evidence is
  // recorded. Tests and the acceptance runner inject a registry; production
  // callers get the frozen empty default.
  readonly coverageRegistry?: MortalCoverageRegistry;
}): Promise<MortalFullGameReviewResult> {
  const now = input.now ?? Date.now;
  const registry = input.coverageRegistry ?? EMPTY_MORTAL_COVERAGE_REGISTRY;

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

  // M6-A4.0: the single-candidate proofs are computed BEFORE any source
  // lookup — whether a window is source_row_not_expected may never depend
  // on what the source happened to contain. Shape A is engine-free; shape B
  // asks the trusted hand-structure engine and fails closed on any error.
  const singleCandidateProofs = await collectSingleCandidateProofs(
    input.decisions,
    input.engine,
  );

  const { rows, sourceDegrees, ambiguousSourceOrdinals } =
    buildMortalFullGameBindingPlan(
      input.decisions,
      input.report,
    );
  const sourceRows = flattenSourceRows(input.report);
  // M6-A4.0 self-surface partition (freeze): source rows split by
  // lastActor vs playerId. Self rows keep the existing conservation names;
  // response rows are counted apart and never enter the self conservation
  // check (their identity tables are A4.2).
  const selfSourceRows = sourceRows.filter(
    (row) => row.entry.lastActor === input.report.playerId,
  );
  const responseEntryCount = sourceRows.length - selfSourceRows.length;

  const runStartedAt = now();
  const frozenAt = new Date(runStartedAt).toISOString();

  const ledger: MortalFullGameLedgerEntry[] = [];
  const outcomeCounts: Record<MortalDecisionOutcome, number> = {
    analysis_ready: 0,
    unsupported_action: 0,
    source_row_not_expected: 0,
    no_mortal_entry: 0,
    binding_mismatch: 0,
    model_output_incomplete: 0,
    analysis_blocked: 0,
  };
  const unsupportedReasonCounts: Partial<Record<MortalUnsupportedReason, number>> = {};
  const modelIncompleteReasonCounts: Partial<Record<MortalModelIncompleteReason, number>> = {};
  const analysisBlockedReasonCounts: Partial<Record<MortalAnalysisBlockedReason, number>> = {};
  const coverageBranchEncounters: Partial<Record<MortalCoverageBranch, number>> = {};
  const coverageBranchUncoveredBlocks: Partial<Record<MortalCoverageBranch, number>> = {};

  for (const row of rows) {
    const decision = input.decisions[row.decisionOrdinal]!;
    // LOCAL actual representation support. Kept as its own variable — the
    // source-candidate surface support below is a separate classification
    // stage, and merging them obscured the §21 precedence.
    const local = localSupport(decision);
    const support = local.support;
    // M6-A4.0: the single-candidate proof is a LOCAL expectation decided
    // before any source lookup — whether a window expects a source row may
    // never depend on what the source contained.
    const proof = singleCandidateProofs.get(row.decisionOrdinal) ?? null;

    // Precedence (M6-A3 §21, closing round): (1) whole-run identity failures
    // already returned above; per-row order is (2) M6-A4.0 single-candidate
    // source-presence failure, (3) binding ambiguity/order failure, (4) no
    // source entry, (5) LOCAL actual representation support, (6) source
    // actual ↔ local actual correspondence, (7) source/model candidate
    // surface support, (8) real coverage gate, (9) completeness, (10)
    // assembly, (11) analysis_ready. A row with no source entry never
    // reports as an unsupported action; a local actual with no meaningful
    // local action to compare may classify before the correspondence check;
    // a source candidate surface problem may NEVER classify before the
    // source actual ↔ local actual correspondence — support and coverage
    // classification must not hide an integrity mismatch.
    if (proof !== null && row.binding !== "no_mortal_entry") {
      // A proven single-candidate window expects NO source row. A compatible
      // row existing anyway (bound or ambiguous) contradicts the local
      // expectation — integrity failure, not a normal bound analysis. The
      // binding status stays on the row so an auditor sees the contradiction.
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "binding_mismatch",
        reason: "unexpected_source_row_present",
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
        singleCandidateProof: proof,
      });
      outcomeCounts.binding_mismatch += 1;
      continue;
    }

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

    if (row.binding === "no_mortal_entry") {
      // M6-A4.0: a locally proven single-candidate window EXPECTS no source
      // row (Mortal emits rows only at >=2-candidate decision points), so
      // the absence is reclassified from integrity failure to the legal
      // source_row_not_expected state. Without a proof the absence stays a
      // loud no_mortal_entry (green runs require 0).
      const outcome: MortalDecisionOutcome = proof === null
        ? "no_mortal_entry"
        : "source_row_not_expected";
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome,
        reason: null,
        sourceEntryRef: null,
        sourceOrdinal: null,
        modelSummary: null,
        singleCandidateProof: proof,
      });
      outcomeCounts[outcome] += 1;
      continue;
    }

    // (4) LOCAL actual representation support: the local window produced no
    // typed actual action to compare (pure round end with no self action).
    if (support === "unsupported") {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "unsupported_action",
        reason: local.reason,
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.unsupported_action += 1;
      if (local.reason !== null) {
        unsupportedReasonCounts[local.reason] =
          (unsupportedReasonCounts[local.reason] ?? 0) + 1;
      }
      continue;
    }

    // Bound + locally supported rows must carry their bound source entry.
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

    // (5) Local actual authority correspondence: type-level correspondence
    // between the Mortal actual row and the locally derived actual action
    // (ADR-0001: tiles stay local-authoritative; riichi cross-checks type +
    // actor only). Classified BEFORE the source candidate surface so an
    // actual mismatch can never be hidden by an unsupported candidate set.
    if (
      !mortalActualMatchesLocal(
        row.sourceEntry.actual,
        decision,
        row.sourceEntry.tile,
      )
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

    // (6) SOURCE candidate surface support: the Mortal candidate set must be
    // A1-representable for this window kind (per-kind candidate type tables:
    // self_turn / post_call / post_riichi).
    const allowedCandidateTypes = supportedCandidateTypesForWindow(
      decision.snapshot.privateState.decisionWindow.kind,
    );
    if (
      allowedCandidateTypes === null
      || row.sourceEntry.details.length === 0
      || !row.sourceEntry.details.every((detail) =>
        allowedCandidateTypes.has(detail.action.type)
      )
    ) {
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "unsupported_action",
        reason: "mortal_candidate_action_not_supported",
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.unsupported_action += 1;
      unsupportedReasonCounts.mortal_candidate_action_not_supported =
        (unsupportedReasonCounts.mortal_candidate_action_not_supported ?? 0) + 1;
      continue;
    }

    // M6-A3 coverage gate: classify which semantic branches this bound row
    // exercises; any branch without a recorded real E2E hit fails the row
    // closed. Synthetic fixtures can never lift the registry.
    const windowKind = decision.snapshot.privateState.decisionWindow.kind;
    // Response surfaces (M6-A4) never bind in the identity matcher, so a row
    // reaching this point is always one of the three replay kinds; narrow for
    // the classifier's type. M6-A4 GUARD: when response identity tables land,
    // response rows would silently bypass this gate (coverageWindowKind null
    // → no branches → no coverage accounting) — response branches must be
    // added to the matrix BEFORE response binding is enabled.
    const coverageWindowKind =
      windowKind === "self_turn"
      || windowKind === "post_call_discard"
      || windowKind === "post_riichi_discard"
        ? windowKind
        : null;
    const coverageBranches = coverageWindowKind === null ? [] : classifyCoverageBranches({
      windowKind: coverageWindowKind,
      actualActionKind: decision.actualAction?.kind ?? null,
      callKind: callKindForDecision(stream, decision),
      candidateActionTypes: row.sourceEntry.details.map((detail) => detail.action.type),
    });
    for (const branch of coverageBranches) {
      coverageBranchEncounters[branch] = (coverageBranchEncounters[branch] ?? 0) + 1;
    }
    const uncoveredBranches = coverageBranches.filter(
      (branch) => !registry.isCovered(branch),
    );
    if (uncoveredBranches.length > 0) {
      for (const branch of uncoveredBranches) {
        coverageBranchUncoveredBlocks[branch] =
          (coverageBranchUncoveredBlocks[branch] ?? 0) + 1;
      }
      ledger.push({
        decisionOrdinal: row.decisionOrdinal,
        roundOrdinal: row.roundOrdinal,
        binding: row.binding,
        support,
        review: "not_attempted",
        outcome: "unsupported_action",
        reason: "coverage_branch_uncovered",
        sourceEntryRef: row.sourceEntryRef,
        sourceOrdinal: row.sourceOrdinal,
        modelSummary: null,
      });
      outcomeCounts.unsupported_action += 1;
      unsupportedReasonCounts.coverage_branch_uncovered =
        (unsupportedReasonCounts.coverage_branch_uncovered ?? 0) + 1;
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
      const topModelProbabilityPercent = Math.max(
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
          topModelProbabilityPercent,
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
      // A degenerate candidate set on a terminal window (tsumo/ankan/kakan/
      // kyuushu actual) is attributed to the M6-A3 terminal surface, not to
      // the generic degenerate-set reason.
      const terminalActual =
        decision.actualAction?.kind === "tsumo"
        || decision.actualAction?.kind === "ankan"
        || decision.actualAction?.kind === "kakan"
        || decision.actualAction?.kind === "kyuushu_kyuuhai";
      const reason: MortalModelIncompleteReason =
        result.code === "cross_decision_window"
          ? "cross_decision_window"
          : terminalActual && result.code === "fewer_than_two_distinct_actions"
            ? "terminal_window_action_unsupported"
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

  // Source-side conservation ledger. Dispositions come from the bipartite
  // compatibility graph, not from the final local ledger: a source involved
  // in any local ambiguity is itself ambiguous.
  const boundSourceOrdinals = new Set(
    ledger
      .filter((row) => row.binding === "bound")
      .map((row) => row.sourceOrdinal)
      .filter((value): value is number => value !== null),
  );
  const graphAmbiguousSourceOrdinals = new Set(ambiguousSourceOrdinals);
  const sourceUnboundReasonCounts: Partial<Record<MortalSourceUnboundReason, number>> = {};
  for (const reason of [
    "local_terminal_action_not_replayed",
    "identity_fact_mismatch",
    "source_semantics_not_understood",
  ] as const) {
    sourceUnboundReasonCounts[reason] = 0;
  }
  // M6-A4.0: the coverage ledger walks SELF rows only — response rows are a
  // separate surface (A4.2 identity tables) and are not unbound failures.
  const sourceCoverageEntries = selfSourceRows.map((sourceRow) => {
    let disposition: MortalSourceDisposition;
    if (boundSourceOrdinals.has(sourceRow.sourceOrdinal)) {
      disposition = "bound";
    } else if (graphAmbiguousSourceOrdinals.has(sourceRow.sourceOrdinal)) {
      disposition = "ambiguous";
    } else {
      disposition = "unbound";
    }
    const unboundReason = disposition === "unbound"
      ? classifyUnboundSourceReason(sourceRow.entry, sourceRows)
      : null;
    if (unboundReason !== null) {
      sourceUnboundReasonCounts[unboundReason] =
        (sourceUnboundReasonCounts[unboundReason] ?? 0) + 1;
    }
    return Object.freeze({
      sourceEntryRef: sourceRow.ref,
      roundOrdinal: sourceRow.entry.roundOrdinal,
      kyoku: sourceRow.entry.kyoku,
      honba: sourceRow.entry.honba,
      junme: sourceRow.entry.junme,
      sourceOrdinal: sourceRow.sourceOrdinal,
      disposition,
      unboundReason,
    });
  });

  const bindingCounts = {
    bound: ledger.filter((row) => row.binding === "bound").length,
    noMortalEntry: ledger.filter((row) => row.binding === "no_mortal_entry").length,
    ambiguous: ledger.filter((row) => row.binding === "ambiguous").length,
  };

  const sourceCoverage: MortalSourceCoverage = Object.freeze({
    mortalSelfEntryCount: selfSourceRows.length,
    responseEntryCount,
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

  // True conservation: derive the totals from the actual ledger and coverage
  // dispositions. Never set them directly to input lengths.
  const localOutcomeSum = Object.values(outcomeCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const sourceDispositionSum = sourceCoverage.boundMortalEntryCount
    + sourceCoverage.unboundMortalEntryCount
    + sourceCoverage.ambiguousMortalEntryCount;
  if (
    localOutcomeSum !== input.decisions.length
    || sourceDispositionSum !== selfSourceRows.length
  ) {
    return { status: "failed", code: "mortal_full_game_input_invalid" };
  }

  const summary: MortalFullGameCoverageSummary = Object.freeze({
    replayDecisionCount: input.decisions.length,
    mortalSelfEntryCount: selfSourceRows.length,
    responseEntryCount,
    localConservation: localOutcomeSum,
    sourceConservation: sourceDispositionSum,
    outcomes: Object.freeze(outcomeCounts),
    binding: Object.freeze(bindingCounts),
    // A "supported pair" is a bound row that passed every support stage —
    // local actual representation, source actual correspondence, source
    // candidate surface and coverage — i.e. it reached the review. The
    // ledger's `support` field alone now records only the LOCAL side.
    supportedPairCount: ledger.filter((row) =>
      row.review !== "not_attempted"
    ).length,
    unsupportedReasons: Object.freeze(unsupportedReasonCounts),
    modelIncompleteReasons: Object.freeze(modelIncompleteReasonCounts),
    analysisBlockedReasons: Object.freeze(analysisBlockedReasonCounts),
    sourceUnboundReasons: Object.freeze(sourceUnboundReasonCounts),
    coverageBranchEncounters: Object.freeze(coverageBranchEncounters),
    coverageBranchUncoveredBlocks: Object.freeze(coverageBranchUncoveredBlocks),
  });

  return {
    status: "coverage_ready",
    summary,
    decisions: Object.freeze(ledger),
    sourceCoverage,
  };
}
