/**
 * M6-A3 source-policy correction (§5) — the SHARED Mortal acceptance core.
 *
 * The acceptance invariant is REAL + INDEPENDENT LOCAL AUTHORITY + FULL E2E,
 * not any particular platform. Platform adapters (Tenhou importer, Mahjong
 * Soul importer) each produce an `AcceptanceLocalSource`; this module owns
 * everything downstream of that, ONCE:
 *
 *   binding → full-game review (acceptance-mode coverage registry) →
 *   accepted-branch evidence extraction → redacted artifact → evidence
 *   hash → §16 manifest samples.
 *
 * Adapters must not re-implement any of these stages — a second copy of the
 * E2E chain is how acceptance semantics drift between platforms.
 *
 * Privacy: the artifact and manifest samples carry ONLY the §23-safe
 * allowlist (opaque ids, source kind, model metadata, branches, hashes).
 * The raw record identity, report/result URLs, and player data stay in the
 * adapter's private cache and never enter this module's outputs.
 */
import { createHash } from "node:crypto";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import type { MortalFetchedReport } from "@riichi-coach/mortal-source";
import type { HandStructureFactEnginePort } from "../fact-engine/port.js";
import type { ReplayedDecision } from "../replay/stream-replayer.js";
import { runMortalFullGameReview } from "./mortal-full-game-review.js";
import {
  MORTAL_COVERAGE_BRANCHES,
  createMortalCoverageRegistry,
} from "./mortal-coverage-registry.js";
import type {
  MortalCoverageEvidenceSample,
  MortalCoverageLocalSourceType,
} from "./mortal-coverage-evidence-manifest.js";
import {
  assertMortalAcceptanceLocalSourceType,
  type AcceptanceReadyReview,
  type AcceptedBranchEvidence,
  buildRedactedAcceptanceArtifact,
  extractAcceptedBranchEvidence,
} from "./acceptance-evidence.js";

/**
 * What a platform adapter hands to the shared core: the independently
 * produced canonical side of ONE (game, seat) sample. `opaqueGameId` must
 * be a content hash (or other opaque label) — never a raw record id, log
 * id, or URL.
 */
export interface AcceptanceLocalSource {
  /** Which approved local pipeline produced the canonical side. */
  readonly sourceKind: MortalCoverageLocalSourceType;
  /** Opaque content-hash game id (§13/§15). */
  readonly opaqueGameId: string;
  readonly selfActor: number;
  readonly canonicalStream: CanonicalEventStream;
  readonly replayedDecisions: readonly ReplayedDecision[];
}

/** The §23-safe outputs of one accepted sample (§8: no timestamps — the
 *  hash is deterministic for identical inputs). */
export interface AcceptanceEvidenceRun {
  readonly review: AcceptanceReadyReview;
  readonly evidence: AcceptedBranchEvidence;
  readonly artifact: Readonly<Record<string, unknown>>;
  /** `sha256:<hex>` over JSON.stringify(artifact). */
  readonly evidenceHash: string;
  /**
   * One manifest sample per evidenced branch — all carrying the SAME
   * evidenceHash, so the same accepted output counts once per branch it
   * exercises and never twice for one branch.
   */
  readonly manifestSamples: readonly MortalCoverageEvidenceSample[];
}

export type AcceptanceEvidenceRunResult =
  | ({ readonly status: "accepted" } & AcceptanceEvidenceRun)
  | { readonly status: "review_failed"; readonly code: string }
  | {
      readonly status: "no_analysis_ready_branch_evidence";
      readonly analysisReadyRowCount: number;
    };

/**
 * Run the shared Mortal acceptance E2E for one local source + one real
 * Mortal report. Fail-closed by construction: any stage that does not
 * complete returns a typed failure, and only a completed chain yields
 * `accepted` with evidence.
 */
export async function runMortalAcceptanceEvidence(input: {
  readonly local: AcceptanceLocalSource;
  readonly report: MortalFetchedReport;
  readonly engine: HandStructureFactEnginePort;
  readonly evidenceVersion: string;
  readonly now?: () => number;
}): Promise<AcceptanceEvidenceRunResult> {
  assertMortalAcceptanceLocalSourceType(input.local.sourceKind);

  // Acceptance mode: this core is the evidence PRODUCER, so the coverage
  // gate is wide open HERE ONLY. Production consumers lift from the §16
  // evidence manifest (createMortalCoverageRegistryFromManifest), never
  // from this call.
  const review = await runMortalFullGameReview({
    stream: input.local.canonicalStream,
    decisions: input.local.replayedDecisions,
    report: input.report,
    engine: input.engine,
    ...(input.now !== undefined ? { now: input.now } : {}),
    coverageRegistry: createMortalCoverageRegistry(MORTAL_COVERAGE_BRANCHES),
  });
  if (review.status !== "coverage_ready") {
    return { status: "review_failed", code: review.code };
  }

  const evidence = extractAcceptedBranchEvidence({
    stream: input.local.canonicalStream,
    decisions: input.local.replayedDecisions,
    report: input.report,
    review,
  });
  if (evidence.analysisReadyRowCount === 0 || evidence.branches.length === 0) {
    return {
      status: "no_analysis_ready_branch_evidence",
      analysisReadyRowCount: evidence.analysisReadyRowCount,
    };
  }

  const artifact = buildRedactedAcceptanceArtifact({
    gameId: input.local.opaqueGameId,
    seat: input.local.selfActor,
    localSourceType: input.local.sourceKind,
    report: input.report,
    review,
    evidence,
  });
  const evidenceHash = `sha256:${createHash("sha256")
    .update(JSON.stringify(artifact), "utf8")
    .digest("hex")}`;

  const manifestSamples = evidence.branches.map((branch) => ({
    branch,
    evidenceVersion: input.evidenceVersion,
    evidenceHash,
    localSourceType: input.local.sourceKind,
    modelAdapterVersion: input.report.adapterVersion,
    ...(input.report.modelTag !== undefined ? { modelTag: input.report.modelTag } : {}),
  }));

  return {
    status: "accepted",
    review,
    evidence,
    artifact,
    evidenceHash,
    manifestSamples,
  };
}
