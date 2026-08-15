import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MORTAL_REPORT_TIMEOUT_MS,
  MortalSourceError,
  fetchMortalReport,
  type MortalFetchedReport,
} from "@riichi-coach/mortal-source";
import {
  classifyModelEvaluationDetail,
  runMortalSingleDecisionReview,
  type MortalSingleDecisionReviewResult,
} from "@riichi-coach/reasoning";
import type { HandStructureFactEnginePort } from "@riichi-coach/reasoning";
import type { ReplayedDecision } from "@riichi-coach/reasoning";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import type { MahjongSoulReplayAcquisitionResult } from "./replay-diagnostic-runner.js";

export const MORTAL_DECISION_DIAGNOSTIC_RESULT_VERSION =
  "mortal-decision-diagnostic/v1" as const;

export function buildMortalDecisionResultPath(
  resultDir: string,
  now: number,
): string {
  return join(resultDir, `mortal-decision-result-${now}.json`);
}

export function formatMortalDecisionConsoleLine(input: {
  decisionKind: string;
  candidateCount: number;
  actualActionRef: string;
  errorGap: number;
}): string {
  return `[riichi-coach] mortal-decision:kind=${input.decisionKind}`
    + ` candidates=${input.candidateCount}`
    + ` actual=${input.actualActionRef}`
    + ` gap=${input.errorGap.toFixed(2)}`;
}

export type MortalDecisionDiagnosticStatus =
  | "review_ready"
  | "url_file_unavailable"
  | "url_invalid"
  | "record_acquisition_failed"
  | "no_reviewable_decision"
  | "mortal_report_fetch_failed"
  | "mortal_report_rejected"
  | "review_failed"
  | "review_not_comparable"
  | "result_write_failed"
  | "inconclusive";

export type MortalDecisionDiagnosticResult = Readonly<{
  status: MortalDecisionDiagnosticStatus;
  resultPath?: string;
}>;

export type MortalDecisionDiagnosticPorts = {
  readonly resultUrlFilePath: string;
  readonly acquisition: MahjongSoulReplayAcquisitionResult;
  readonly engine: HandStructureFactEnginePort;
  readonly writeResult: (serialized: string) => Promise<string>;
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
};

function result(
  status: MortalDecisionDiagnosticStatus,
  resultPath?: string,
): MortalDecisionDiagnosticResult {
  return resultPath === undefined
    ? Object.freeze({ status })
    : Object.freeze({ status, resultPath });
}

export function mortalDecisionDiagnosticExitCode(
  status: MortalDecisionDiagnosticStatus,
): number {
  switch (status) {
    case "review_ready": return 0;
    case "url_file_unavailable": return 30;
    case "url_invalid": return 31;
    case "record_acquisition_failed": return 32;
    case "no_reviewable_decision": return 33;
    case "mortal_report_fetch_failed": return 34;
    case "mortal_report_rejected": return 35;
    case "review_failed": return 36;
    case "review_not_comparable": return 37;
    case "result_write_failed": return 38;
    case "inconclusive": return 39;
  }
}

function pickReviewDecision(
  decisions: readonly ReplayedDecision[],
): ReplayedDecision | null {
  for (const decision of decisions) {
    if (decision.actualDiscard === null) continue;
    if (decision.actualDiscard.riichiDeclarationEventRef !== null) continue;
    if (decision.snapshot.privateState.decisionWindow.kind !== "self_turn") continue;
    if (decision.snapshot.privateState.currentDraw === null) continue;
    return decision;
  }
  return null;
}

export function serializeMortalDecisionDiagnosticResult(
  acquisition: Extract<MahjongSoulReplayAcquisitionResult, { status: "acquired" }>,
  decision: ReplayedDecision,
  review: Extract<MortalSingleDecisionReviewResult, { status: "ready" }>,
  detailClass: ReturnType<typeof classifyModelEvaluationDetail>,
): string {
  const actualCandidate = review.comparisonSet.candidates.find((candidate) =>
    candidate.origins.includes("actual")
  );
  const preferredActionRefs = review.modelEvaluation.preferredActions;
  const topModelProbabilityPercent = Math.max(
    ...review.modelEvaluation.candidates.map((candidate) =>
      candidate.modelSelectionScore
    ),
  );
  return `${JSON.stringify({
    schemaVersion: MORTAL_DECISION_DIAGNOSTIC_RESULT_VERSION,
    selfSeat: acquisition.selfSeat,
    decisionKind: decision.snapshot.privateState.decisionWindow.kind,
    candidateCount: review.comparisonSet.candidates.length,
    localActualAction: actualCandidate?.action ?? null,
    modelPreferredActions: preferredActionRefs,
    topModelProbabilityPercent,
    errorGap: review.modelEvaluation.errorGap,
    detailClass,
    factorAnalysisMode: review.factorResult.analysisMode,
    deterministicPreference: review.factorResult.deterministicPreference,
  }, null, 2)}\n`;
}

export async function runMortalDecisionDiagnostic(
  ports: MortalDecisionDiagnosticPorts,
): Promise<MortalDecisionDiagnosticResult> {
  const now = ports.now ?? Date.now;

  let url: string;
  try {
    url = (await readFile(ports.resultUrlFilePath, "utf8")).trim();
  } catch {
    return result("url_file_unavailable");
  }

  let report: MortalFetchedReport;
  try {
    report = await fetchMortalReport({
      url,
      fetchImpl: ports.fetchImpl ?? globalThis.fetch,
      signal: AbortSignal.timeout(MORTAL_REPORT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof MortalSourceError) {
      return error.code === "mortal_result_url_invalid"
        ? result("url_invalid")
        : result("mortal_report_rejected");
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return result("mortal_report_fetch_failed");
    }
    return result("mortal_report_fetch_failed");
  }

  if (ports.acquisition.status !== "acquired") {
    return result("record_acquisition_failed");
  }
  const acquisition = ports.acquisition;

  const decision = pickReviewDecision(acquisition.decisions);
  if (decision === null) return result("no_reviewable_decision");

  let review: MortalSingleDecisionReviewResult;
  try {
    review = await runMortalSingleDecisionReview({
      stream: acquisition.stream,
      decision,
      report,
      engine: ports.engine,
      now,
    });
  } catch {
    return result("review_failed");
  }

  if (review.status === "not_comparable") {
    return result("review_not_comparable");
  }
  if (review.status !== "ready") {
    return result(
      review.code === "mortal_report_game_fingerprint_mismatch" ||
        review.code === "mortal_report_perspective_mismatch" ||
        review.code === "mortal_decision_anchor_not_found" ||
        review.code === "mortal_decision_anchor_ambiguous" ||
        review.code === "mortal_decision_actual_mismatch" ||
        review.code === "mortal_decision_unsupported_entry"
        ? "mortal_report_rejected"
        : "review_failed",
    );
  }

  let resultPath: string;
  try {
    resultPath = await ports.writeResult(
      serializeMortalDecisionDiagnosticResult(
        acquisition,
        decision,
        review,
        classifyModelEvaluationDetail(review.modelEvaluation),
      ),
    );
  } catch {
    return result("result_write_failed");
  }

  console.log(formatMortalDecisionConsoleLine({
    decisionKind: decision.snapshot.privateState.decisionWindow.kind,
    candidateCount: review.comparisonSet.candidates.length,
    actualActionRef: review.modelEvaluation.actualActionRef,
    errorGap: review.modelEvaluation.errorGap,
  }));
  return result("review_ready", resultPath);
}
