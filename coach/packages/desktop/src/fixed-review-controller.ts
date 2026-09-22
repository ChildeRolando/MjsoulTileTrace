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
};
type Operation = { packageId: string; viewEpoch: number; cancelled: boolean };

export function createFixedReviewController(input: {
  readPackage(packageId: string): Promise<unknown>;
  generateReport(pkg: StructuredAnalysisPackage, selection: ReviewSelectionResult): Promise<unknown>;
  createReportRefId?: () => string;
}) {
  const views = new Map<string, ViewState>();
  const viewEpochs = new Map<string, number>();
  const operations = new Map<string, Operation>();
  const reportRefId = input.createReportRefId ?? randomUUID;
  const viewEpoch = (packageId: string) => viewEpochs.get(packageId) ?? 0;

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
  const open = async (
    packageId: string,
    expectedEpoch = viewEpoch(packageId),
    isCurrent: () => boolean = () => viewEpoch(packageId) === expectedEpoch,
  ): Promise<FixedReviewSnapshotDto> => {
    const existing = views.get(packageId);
    if (existing !== undefined) return snapshot(existing);
    const raw = await input.readPackage(packageId);
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    validateStructuredAnalysisPackage(raw);
    const analysisPackage = StructuredAnalysisPackageSchema.parse(raw);
    if (analysisPackage.packageId !== packageId) throw new Error("review_unavailable");
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    const state: ViewState = {
      analysisPackage,
      selection: selectReviewDecisions(analysisPackage),
      reportRefs: [], activeReportRefId: null,
    };
    const projected = snapshot(state);
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    views.set(packageId, state);
    return projected;
  };

  const generate = async (packageId: string, operationId: string, firstGenerationOnly: boolean): Promise<FixedReviewOperationResult> => {
    if (operations.has(operationId) || [...operations.values()].some((operation) => operation.packageId === packageId)) {
      return { status: "failed", code: "generation_failed" };
    }
    const operation: Operation = { packageId, viewEpoch: viewEpoch(packageId), cancelled: false };
    operations.set(operationId, operation);
    const isCurrent = () => operations.get(operationId) === operation
      && !operation.cancelled
      && viewEpoch(packageId) === operation.viewEpoch;
    try {
      let state = views.get(packageId);
      if (state === undefined) {
        await open(packageId, operation.viewEpoch, isCurrent);
        state = requireState(packageId);
      }
      if (!isCurrent()) return { status: "failed", code: "operation_cancelled" };
      if (firstGenerationOnly && state.activeReportRefId !== null) return { status: "failed", code: "generation_failed" };
      const rawReport = await input.generateReport(state.analysisPackage, state.selection);
      const current = views.get(packageId);
      if (current !== state || !isCurrent()) {
        return { status: "failed", code: "operation_cancelled" };
      }
      const report = ReviewReportSchema.parse(rawReport);
      const nextRefId = reportRefId();
      if (nextRefId.length === 0 || state.reportRefs.some((ref) => ref.reportRefId === nextRefId)) throw new Error("duplicate_report_ref");
      const nextSnapshot = presentFixedReviewSnapshot({
        analysisPackage: state.analysisPackage, selection: state.selection,
        activeReport: report, activeReportRefId: nextRefId,
      });
      state.reportRefs.push(Object.freeze({
        reportRefId: nextRefId, packageId, reportId: report.reportId,
        generatedAt: report.generatedAt, report,
      }));
      state.activeReportRefId = nextRefId;
      return { status: "ready", snapshot: nextSnapshot };
    } catch (error) {
      return !isCurrent() || (error instanceof Error && error.message === "operation_cancelled")
        ? { status: "failed", code: "operation_cancelled" }
        : { status: "failed", code: "generation_failed" };
    } finally {
      if (operations.get(operationId) === operation) operations.delete(operationId);
    }
  };

  return Object.freeze({
    async openReview(packageId: string): Promise<FixedReviewSnapshotDto> {
      return open(packageId);
    },

    async generateReview(packageId: string, operationId: string): Promise<FixedReviewOperationResult> {
      return generate(packageId, operationId, true);
    },

    /** Internal lifecycle regression seam; intentionally absent from IPC/preload. */
    async generateReviewForLifecycle(packageId: string, operationId: string): Promise<FixedReviewOperationResult> {
      return generate(packageId, operationId, false);
    },

    cancelGeneration(operationId: string): void {
      const operation = operations.get(operationId);
      if (operation !== undefined) operation.cancelled = true;
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
      return next;
    },

    leaveReview(packageId: string): void {
      viewEpochs.set(packageId, viewEpoch(packageId) + 1);
      for (const operation of operations.values()) {
        if (operation.packageId === packageId) operation.cancelled = true;
      }
      views.delete(packageId);
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
