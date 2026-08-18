import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MORTAL_REPORT_TIMEOUT_MS,
  MortalSourceError,
  fetchMortalReport,
  type MortalFetchedReport,
} from "@riichi-coach/mortal-source";
import {
  replayCanonicalResponseWindows,
  runMortalFullGameReview,
  type MortalFullGameReviewResult,
} from "@riichi-coach/reasoning";
import type { HandStructureFactEnginePort } from "@riichi-coach/reasoning";
import type { MahjongSoulReplayAcquisitionResult } from "./replay-diagnostic-runner.js";

export const MORTAL_FULL_GAME_DIAGNOSTIC_RESULT_VERSION =
  "mortal-full-game-diagnostic/v1" as const;

export type MortalFullGameDiagnosticStatus =
  | "coverage_ready"
  | "url_file_unavailable"
  | "url_invalid"
  | "record_acquisition_failed"
  | "mortal_report_fetch_failed"
  | "mortal_report_rejected"
  | "coverage_failed"
  | "result_write_failed"
  | "inconclusive";

export type MortalFullGameDiagnosticResult = Readonly<{
  status: MortalFullGameDiagnosticStatus;
  resultPath?: string;
}>;

export type MortalFullGameDiagnosticPorts = {
  readonly resultUrlFilePath: string;
  readonly acquisition: MahjongSoulReplayAcquisitionResult;
  readonly engine: HandStructureFactEnginePort;
  readonly writeResult: (serialized: string) => Promise<string>;
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
};

export function buildMortalFullGameResultPath(
  resultDir: string,
  now: number,
): string {
  return join(resultDir, `mortal-full-game-result-${now}.json`);
}

export function formatMortalFullGameConsoleLine(summary: {
  replayDecisionCount: number;
  mortalSelfEntryCount: number;
  responseEntryCount: number;
  bound: number;
  ready: number;
  unsupported: number;
  missing: number;
  sourceRowNotExpected: number;
  bindingMismatch: number;
  modelIncomplete: number;
  blocked: number;
}): string {
  return `[riichi-coach] mortal-full-game:replay=${summary.replayDecisionCount}`
    + ` mortal=${summary.mortalSelfEntryCount}`
    + ` response=${summary.responseEntryCount}`
    + ` bound=${summary.bound}`
    + ` ready=${summary.ready}`
    + ` unsupported=${summary.unsupported}`
    + ` missing=${summary.missing}`
    + ` notExpected=${summary.sourceRowNotExpected}`
    + ` bindingMismatch=${summary.bindingMismatch}`
    + ` modelIncomplete=${summary.modelIncomplete}`
    + ` blocked=${summary.blocked}`;
}

export function serializeMortalFullGameDiagnosticResult(
  acquisition: Extract<MahjongSoulReplayAcquisitionResult, { status: "acquired" }>,
  review: Extract<MortalFullGameReviewResult, { status: "coverage_ready" }>,
): string {
  return `${JSON.stringify({
    schemaVersion: MORTAL_FULL_GAME_DIAGNOSTIC_RESULT_VERSION,
    selfSeat: acquisition.selfSeat,
    summary: review.summary,
    sourceCoverage: {
      mortalSelfEntryCount: review.sourceCoverage.mortalSelfEntryCount,
      responseEntryCount: review.sourceCoverage.responseEntryCount,
      boundMortalEntryCount: review.sourceCoverage.boundMortalEntryCount,
      unboundMortalEntryCount: review.sourceCoverage.unboundMortalEntryCount,
      ambiguousMortalEntryCount: review.sourceCoverage.ambiguousMortalEntryCount,
    },
    decisions: review.decisions.map((decision) => ({
      decisionOrdinal: decision.decisionOrdinal,
      roundOrdinal: decision.roundOrdinal,
      surface: decision.surface,
      binding: decision.binding,
      support: decision.support,
      outcome: decision.outcome,
      reason: decision.reason,
      singleCandidateProof: decision.singleCandidateProof ?? null,
      modelSummary: decision.modelSummary,
    })),
  }, null, 2)}\n`;
}

function result(
  status: MortalFullGameDiagnosticStatus,
  resultPath?: string,
): MortalFullGameDiagnosticResult {
  return resultPath === undefined
    ? Object.freeze({ status })
    : Object.freeze({ status, resultPath });
}

export function mortalFullGameDiagnosticExitCode(
  status: MortalFullGameDiagnosticStatus,
): number {
  switch (status) {
    case "coverage_ready": return 0;
    case "url_file_unavailable": return 40;
    case "url_invalid": return 41;
    case "record_acquisition_failed": return 42;
    case "mortal_report_fetch_failed": return 43;
    case "mortal_report_rejected": return 44;
    case "coverage_failed": return 45;
    case "result_write_failed": return 46;
    case "inconclusive": return 49;
  }
}

export async function runMortalFullGameDiagnostic(
  ports: MortalFullGameDiagnosticPorts,
): Promise<MortalFullGameDiagnosticResult> {
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
    return result("mortal_report_fetch_failed");
  }

  if (ports.acquisition.status !== "acquired") {
    return result("record_acquisition_failed");
  }
  const acquisition = ports.acquisition;

  let review: MortalFullGameReviewResult;
  try {
    review = await runMortalFullGameReview({
      stream: acquisition.stream,
      decisions: acquisition.decisions,
      // M6-A4.2: replay the response surface partition so the full-game
      // diagnostic binds + conserves response windows too.
      responseDecisions: replayCanonicalResponseWindows(acquisition.stream),
      report,
      engine: ports.engine,
      now: ports.now ?? Date.now,
    });
  } catch {
    return result("coverage_failed");
  }

  if (review.status !== "coverage_ready") {
    return result(
      review.code === "mortal_report_game_fingerprint_mismatch" ||
        review.code === "mortal_report_perspective_mismatch"
        ? "mortal_report_rejected"
        : "coverage_failed",
    );
  }

  let resultPath: string;
  try {
    resultPath = await ports.writeResult(
      serializeMortalFullGameDiagnosticResult(acquisition, review),
    );
  } catch {
    return result("result_write_failed");
  }

  console.log(formatMortalFullGameConsoleLine({
    replayDecisionCount: review.summary.replayDecisionCount,
    mortalSelfEntryCount: review.summary.mortalSelfEntryCount,
    responseEntryCount: review.summary.responseEntryCount,
    bound: review.summary.binding.bound,
    ready: review.summary.outcomes.analysis_ready,
    unsupported: review.summary.outcomes.unsupported_action,
    missing: review.summary.outcomes.no_mortal_entry,
    sourceRowNotExpected: review.summary.outcomes.source_row_not_expected,
    bindingMismatch: review.summary.outcomes.binding_mismatch,
    modelIncomplete: review.summary.outcomes.model_output_incomplete,
    blocked: review.summary.outcomes.analysis_blocked,
  }));
  return result("coverage_ready", resultPath);
}
