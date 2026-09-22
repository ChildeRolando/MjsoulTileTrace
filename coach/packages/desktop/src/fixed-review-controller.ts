import { randomUUID } from "node:crypto";
import {
  ReviewReportSchema, StructuredAnalysisPackageSchema,
  type FixedReviewDetailDto, type FixedReviewOperationResult, type FixedReviewSnapshotDto,
  type ReviewReport, type ReviewSelectionResult, type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { selectReviewDecisions, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { presentFixedReviewDetail, presentFixedReviewSnapshot } from "./fixed-review-presenter.js";

type ReportRef = Readonly<{
  reportRefId: string;
  packageId: string;
  reportId: string;
  generatedAt: string;
  report: ReviewReport;
}>;
type ViewState = {
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  reportRefs: ReportRef[];
  activeReportRefId: string | null;
  epoch: number;
  operations: Map<string, number>;
};

export function createFixedReviewController(input: {
  readPackage(packageId: string): Promise<unknown>;
  generateReport(pkg: StructuredAnalysisPackage, selection: ReviewSelectionResult): Promise<unknown>;
  createReportRefId?: () => string;
}) {
  const views = new Map<string, ViewState>();
  const reportRefId = input.createReportRefId ?? randomUUID;

  const activeRef = (state: ViewState): ReportRef | null => {
    if (state.activeReportRefId === null) return null;
    const matches = state.reportRefs.filter((ref) => ref.reportRefId === state.activeReportRefId);
    if (matches.length !== 1) throw new Error("review_unavailable");
    return matches[0]!;
  };
  const snapshot = (state: ViewState): FixedReviewSnapshotDto => {
    const active = activeRef(state);
    return presentFixedReviewSnapshot({
      analysisPackage: state.analysisPackage,
      selection: state.selection,
      activeReport: active?.report ?? null,
      activeReportRefId: active?.reportRefId ?? null,
    });
  };
  const requireState = (packageId: string): ViewState => {
    const state = views.get(packageId);
    if (state === undefined) throw new Error("review_unavailable");
    return state;
  };
  const open = async (packageId: string): Promise<FixedReviewSnapshotDto> => {
    const raw = await input.readPackage(packageId);
    validateStructuredAnalysisPackage(raw);
    const analysisPackage = StructuredAnalysisPackageSchema.parse(raw);
    if (analysisPackage.packageId !== packageId) throw new Error("review_unavailable");
    const existing = views.get(packageId);
    if (existing !== undefined) return snapshot(existing);
    const state: ViewState = {
      analysisPackage,
      selection: selectReviewDecisions(analysisPackage),
      reportRefs: [], activeReportRefId: null, epoch: 0, operations: new Map(),
    };
    const projected = snapshot(state);
    views.set(packageId, state);
    return projected;
  };

  return Object.freeze({
    async openReview(packageId: string): Promise<FixedReviewSnapshotDto> {
      return open(packageId);
    },

    async generateReview(packageId: string, operationId: string): Promise<FixedReviewOperationResult> {
      try {
        let state = views.get(packageId);
        if (state === undefined) {
          await open(packageId);
          state = requireState(packageId);
        }
        if (state.operations.has(operationId)) return { status: "failed", code: "generation_failed" };
        const epoch = ++state.epoch;
        state.operations.set(operationId, epoch);
        const rawReport = await input.generateReport(state.analysisPackage, state.selection);
        const current = views.get(packageId);
        if (current !== state || state.operations.get(operationId) !== epoch || state.epoch !== epoch) {
          return { status: "failed", code: "operation_cancelled" };
        }
        const report = ReviewReportSchema.parse(rawReport);
        const nextRefId = reportRefId();
        if (nextRefId.length === 0 || state.reportRefs.some((ref) => ref.reportRefId === nextRefId)) throw new Error("duplicate_report_ref");
        // This projection is the authorized read-back validation. Nothing is
        // appended or activated until it succeeds in full.
        const nextSnapshot = presentFixedReviewSnapshot({
          analysisPackage: state.analysisPackage, selection: state.selection,
          activeReport: report, activeReportRefId: nextRefId,
        });
        state.reportRefs.push(Object.freeze({
          reportRefId: nextRefId, packageId, reportId: report.reportId,
          generatedAt: report.generatedAt, report,
        }));
        state.activeReportRefId = nextRefId;
        state.operations.delete(operationId);
        return { status: "ready", snapshot: nextSnapshot };
      } catch {
        const state = views.get(packageId);
        state?.operations.delete(operationId);
        return { status: "failed", code: "generation_failed" };
      }
    },

    cancelGeneration(operationId: string): void {
      for (const state of views.values()) {
        if (state.operations.delete(operationId)) state.epoch += 1;
      }
    },

    getReviewDetail(packageId: string, decisionId: string, requestedActiveRefId: string | null): FixedReviewDetailDto {
      const state = requireState(packageId);
      if (state.activeReportRefId !== requestedActiveRefId) throw new Error("review_unavailable");
      const active = activeRef(state);
      return presentFixedReviewDetail({
        analysisPackage: state.analysisPackage, selection: state.selection,
        activeReport: active?.report ?? null, activeReportRefId: active?.reportRefId ?? null,
        decisionId,
      });
    },

    /** Internal lifecycle capability only; intentionally absent from IPC/preload. */
    activateReport(packageId: string, targetReportRefId: string): FixedReviewSnapshotDto {
      const state = requireState(packageId);
      const matches = state.reportRefs.filter((ref) => ref.reportRefId === targetReportRefId);
      if (matches.length !== 1 || matches[0]!.packageId !== packageId) throw new Error("review_unavailable");
      const next = presentFixedReviewSnapshot({
        analysisPackage: state.analysisPackage, selection: state.selection,
        activeReport: matches[0]!.report, activeReportRefId: targetReportRefId,
      });
      state.activeReportRefId = targetReportRefId;
      state.epoch += 1;
      return next;
    },

    leaveReview(packageId: string): void {
      const state = views.get(packageId);
      if (state !== undefined) {
        state.epoch += 1;
        state.operations.clear();
        views.delete(packageId);
      }
    },

    /** Test-only read view: immutable metadata, never exposed to renderer. */
    inspect(packageId: string) {
      const state = requireState(packageId);
      return Object.freeze({
        activeReportRefId: state.activeReportRefId,
        reportRefs: Object.freeze(state.reportRefs.map(({ report, ...ref }) => Object.freeze(ref))),
      });
    },
  });
}
export type FixedReviewController = ReturnType<typeof createFixedReviewController>;
