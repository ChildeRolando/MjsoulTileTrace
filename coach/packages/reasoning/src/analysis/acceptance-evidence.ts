/**
 * M6-A3 §9/§10 — accepted-branch evidence extraction from a REAL full-game
 * review, plus the redacted acceptance artifact the evidence hash is taken
 * over.
 *
 * A branch counts as evidenced by one (game, seat) sample exactly when the
 * review ledger contains at least one analysis_ready row classified with
 * that branch. analysis_ready is the only outcome that proves the whole
 * chain actually completed on a bound row (binding → local support →
 * source actual correspondence → candidate surface → coverage gate →
 * StructuredComparisonSet → ModelEvaluation → assembly); rows that stopped
 * earlier prove nothing for lifting.
 *
 * The redacted artifact carries ONLY §23-safe fields: opaque ids, seats,
 * ordinals, outcome/model aggregates, and canonical decision locators. The
 * raw report (ids, URLs, player data) never enters it — the evidence hash
 * is taken over the redacted bytes alone.
 */
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import type { MortalFetchedReport } from "@riichi-coach/mortal-source";
import {
  buildMortalFullGameBindingPlan,
  callKindForDecision,
  type MortalFullGameReviewResult,
} from "./mortal-full-game-review.js";
import {
  MORTAL_COVERAGE_BRANCHES,
  classifyCoverageBranches,
  type MortalCoverageBranch,
  type MortalCoverageWindowKind,
} from "./mortal-coverage-registry.js";
import {
  MORTAL_COVERAGE_LOCAL_SOURCE_TYPES,
  type MortalCoverageLocalSourceType,
} from "./mortal-coverage-evidence-manifest.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";

export type AcceptanceReadyReview = Extract<
  MortalFullGameReviewResult,
  { status: "coverage_ready" }
>;

/** Branches a single accepted sample actually evidences. */
export interface AcceptedBranchEvidence {
  readonly branches: readonly MortalCoverageBranch[];
  /** Rows that reached analysis_ready — the only rows that lift anything. */
  readonly analysisReadyRowCount: number;
}

function coverageWindowKindOf(
  decision: ReplayedDecision,
): MortalCoverageWindowKind | null {
  const kind = decision.snapshot.privateState.decisionWindow.kind;
  return kind === "self_turn"
    || kind === "post_call_discard"
    || kind === "post_riichi_discard"
    ? kind
    : null;
}

/**
 * Classify which coverage branches one real review evidences. Recomputes
 * per-row branch classification with the SAME exported classifier and the
 * SAME bound source entries the review used — never a second opinion.
 */
export function extractAcceptedBranchEvidence(input: {
  readonly stream: CanonicalEventStream;
  readonly decisions: readonly ReplayedDecision[];
  readonly report: MortalFetchedReport;
  readonly review: AcceptanceReadyReview;
}): AcceptedBranchEvidence {
  const { rows } = buildMortalFullGameBindingPlan(input.decisions, input.report);
  const evidenced = new Set<MortalCoverageBranch>();
  let analysisReadyRowCount = 0;

  for (const ledgerRow of input.review.decisions) {
    if (ledgerRow.outcome !== "analysis_ready") continue;
    analysisReadyRowCount += 1;
    const decision = input.decisions[ledgerRow.decisionOrdinal];
    const planRow = rows[ledgerRow.decisionOrdinal];
    if (decision === undefined || planRow?.sourceEntry == null) continue;
    const windowKind = coverageWindowKindOf(decision);
    if (windowKind === null) continue;
    for (const branch of classifyCoverageBranches({
      windowKind,
      actualActionKind: decision.actualAction?.kind ?? null,
      callKind: callKindForDecision(input.stream, decision),
      candidateActionTypes: planRow.sourceEntry.details.map(
        (detail) => detail.action.type,
      ),
    })) {
      evidenced.add(branch);
    }
  }

  return {
    branches: MORTAL_COVERAGE_BRANCHES.filter((branch) => evidenced.has(branch)),
    analysisReadyRowCount,
  };
}

export const MORTAL_ACCEPTANCE_ARTIFACT_VERSION =
  "mortal-acceptance-artifact/v1" as const;

/**
 * Validate the artifact's local-source provenance. The acceptance invariant
 * is REAL + INDEPENDENT LOCAL AUTHORITY, and the artifact must record which
 * approved pipeline produced the canonical side ("tenhou" | "mahjong_soul").
 * A missing or unknown source type fails closed: an artifact whose local
 * provenance cannot be named is not evidence.
 */
export function assertMortalAcceptanceLocalSourceType(
  sourceType: unknown,
): MortalCoverageLocalSourceType {
  if (
    typeof sourceType !== "string"
    || !(MORTAL_COVERAGE_LOCAL_SOURCE_TYPES as readonly string[]).includes(sourceType)
  ) {
    throw new Error("mortal_acceptance_artifact_source_type_invalid");
  }
  return sourceType as MortalCoverageLocalSourceType;
}

/**
 * Build the redacted acceptance artifact. Field allowlist only — adding a
 * field here is a privacy review (§15/§23), not a refactor. The evidence
 * hash recorded in the manifest is sha256 over JSON.stringify of this
 * object.
 */
export function buildRedactedAcceptanceArtifact(input: {
  /** Opaque content-hash game id — never a raw record id, log id, or URL. */
  readonly gameId: string;
  readonly seat: number;
  /** Which approved local pipeline produced the canonical side (§14). */
  readonly localSourceType: MortalCoverageLocalSourceType;
  readonly report: MortalFetchedReport;
  readonly review: AcceptanceReadyReview;
  readonly evidence: AcceptedBranchEvidence;
}): Readonly<Record<string, unknown>> {
  assertMortalAcceptanceLocalSourceType(input.localSourceType);
  const analysisReadyRows = input.review.decisions
    .filter((row) => row.outcome === "analysis_ready" && row.modelSummary !== null)
    .map((row) => ({
      decisionOrdinal: row.decisionOrdinal,
      roundOrdinal: row.roundOrdinal,
      detailClass: row.modelSummary!.detailClass,
      errorGap: row.modelSummary!.errorGap,
      topModelProbabilityPercent: row.modelSummary!.topModelProbabilityPercent,
      preferredActions: row.modelSummary!.preferredActions,
    }));
  // M6-A4.0: every source_row_not_expected row carries its local proof —
  // the artifact must let an auditor re-derive why each absent row is legal
  // (shape + candidate count + locators; no hand content, privacy-safe).
  const sourceRowNotExpectedRows = input.review.decisions
    .filter((row) =>
      row.outcome === "source_row_not_expected"
      && row.singleCandidateProof !== null
      && row.singleCandidateProof !== undefined
    )
    .map((row) => ({
      decisionOrdinal: row.decisionOrdinal,
      roundOrdinal: row.roundOrdinal,
      shape: row.singleCandidateProof!.shape,
      candidateCount: row.singleCandidateProof!.candidateCount,
    }));

  return Object.freeze({
    schemaVersion: MORTAL_ACCEPTANCE_ARTIFACT_VERSION,
    gameId: input.gameId,
    seat: input.seat,
    localSourceType: input.localSourceType,
    modelAdapterVersion: input.report.adapterVersion,
    modelEngine: input.report.engine,
    modelVersion: input.report.version,
    modelTag: input.report.modelTag ?? null,
    reviewSummary: Object.freeze({
      replayDecisionCount: input.review.summary.replayDecisionCount,
      mortalSelfEntryCount: input.review.summary.mortalSelfEntryCount,
      responseEntryCount: input.review.summary.responseEntryCount,
      localConservation: input.review.summary.localConservation,
      sourceConservation: input.review.summary.sourceConservation,
      outcomes: input.review.summary.outcomes,
      binding: input.review.summary.binding,
      supportedPairCount: input.review.summary.supportedPairCount,
      coverageBranchEncounters: input.review.summary.coverageBranchEncounters,
      sourceRowNotExpectedRows: Object.freeze(sourceRowNotExpectedRows),
    }),
    acceptedBranches: input.evidence.branches,
    analysisReadyRowCount: input.evidence.analysisReadyRowCount,
    analysisReadyRows: Object.freeze(analysisReadyRows),
  });
}
