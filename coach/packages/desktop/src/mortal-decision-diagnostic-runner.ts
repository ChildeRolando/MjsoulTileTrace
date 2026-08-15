import { readFile } from "node:fs/promises";
import {
  MORTAL_REPORT_TIMEOUT_MS,
  MortalSourceError,
  fetchMortalReport,
  type MortalFetchedReport,
} from "@riichi-coach/mortal-source";
import {
  runMortalSingleDecisionReview,
  type MortalSingleDecisionReviewResult,
} from "@riichi-coach/reasoning";
import type { HandStructureFactEnginePort } from "@riichi-coach/reasoning";
import type { ReplayedDecision } from "@riichi-coach/reasoning";
import type { CanonicalEventStream } from "@riichi-coach/contracts";
import type { MahjongSoulReplayAcquisitionResult } from "./replay-diagnostic-runner.js";

export const MORTAL_DECISION_DIAGNOSTIC_RESULT_VERSION =
  "mortal-decision-diagnostic/v1" as const;

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
  readonly writeResult: (serialized: string, recordId: string) => Promise<string>;
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
    if (decision.snapshot.privateState.decisionWindow.kind !== "self_turn") continue;
    if (decision.snapshot.privateState.currentDraw === null) continue;
    return decision;
  }
  return null;
}

function sanitizeReviewResult(
  acquisition: Extract<MahjongSoulReplayAcquisitionResult, { status: "acquired" }>,
  report: MortalFetchedReport,
  review: Extract<MortalSingleDecisionReviewResult, { status: "ready" }>,
): string {
  return `${JSON.stringify({
    schemaVersion: MORTAL_DECISION_DIAGNOSTIC_RESULT_VERSION,
    recordId: acquisition.recordId,
    selfSeat: acquisition.selfSeat,
    decisionEventRef: review.anchor.decisionEventRef,
    anchor: review.anchor,
    comparisonCandidates: review.comparisonSet.candidates.map((candidate) => ({
      actionRef: candidate.actionRef,
      origins: candidate.origins,
    })),
    modelEvaluation: {
      evaluationId: review.modelEvaluation.evaluationId,
      engineId: review.modelEvaluation.engineId,
      engineVersion: review.modelEvaluation.engineVersion,
      adapterVersion: review.modelEvaluation.adapterVersion,
      actualActionRef: review.modelEvaluation.actualActionRef,
      errorGap: review.modelEvaluation.errorGap,
      preferredActions: review.modelEvaluation.preferredActions,
      candidates: review.modelEvaluation.candidates.map((candidate) => ({
        actionRef: candidate.actionRef,
        rawValues: candidate.rawValues,
        modelSelectionScore: candidate.modelSelectionScore,
      })),
    },
    factorResult: {
      analysisMode: review.factorResult.analysisMode,
      diagnostics: review.factorResult.diagnostics,
    },
    reportIdentity: {
      reportId: report.reportId,
      modelTag: report.modelTag,
      version: report.version,
    },
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
      sanitizeReviewResult(acquisition, report, review),
      acquisition.recordId,
    );
  } catch {
    return result("result_write_failed");
  }

  console.log(
    `[riichi-coach] mortal-decision:${review.anchor.decisionEventRef}`
    + ` report=${report.reportId} model=${report.modelTag}/${report.version}`
    + ` actual=${review.modelEvaluation.actualActionRef}`
    + ` gap=${review.modelEvaluation.errorGap.toFixed(2)}`,
  );
  return result("review_ready", resultPath);
}
