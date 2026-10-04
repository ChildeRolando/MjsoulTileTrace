import { randomUUID } from "node:crypto";
import {
  ReviewReportSchema,
  ReviewSelectionResultSchema,
  StructuredAnalysisPackageSchema,
  type FixedReviewDetailDto,
  type FixedReviewOperationResult,
  type FixedReviewSnapshotDto,
  type ReviewReport,
  type ReviewSelectionResult,
  type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import {
  composeReviewSessionReadBackContext,
  selectReviewDecisions,
  validateStructuredAnalysisPackage,
  type ReviewReadBackContext,
  type ReviewSessionDecisionReportRef,
} from "@riichi-coach/reasoning";
import { presentFixedReviewDetailFromContext, presentFixedReviewSnapshotFromContext } from "./fixed-review-presenter.js";
import type { PersistedReviewState, ReviewSessionRepository } from "./review-session-repository.js";
import { freezeReviewReadBack } from "./freeze-review-read-back.js";

type ReportRef = Readonly<{
  reportRefId: string;
  packageId: string;
  reportId: string;
  generatedAt: string;
  /** Older non-current artifacts stay addressable by ref, and are loaded on activation. */
  report: ReviewReport | null;
}>;
type ViewState = {
  sessionId: string | null;
  revision: number | null;
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  reportRefs: ReportRef[];
  decisionReportRefs: ReviewSessionDecisionReportRef[];
  activeReportRefId: string | null;
  readBack: ReviewReadBackContext;
};
type Operation = { packageId: string; viewEpoch: number; cancelled: boolean };

function subsetSelection(selection: ReviewSelectionResult, decisionIds: readonly string[]): ReviewSelectionResult {
  const requested = new Set(decisionIds);
  if (requested.size !== decisionIds.length) throw new Error("generation_selection_invalid");
  const selected = selection.selected.filter((item) => requested.has(item.decisionId));
  if (selected.length !== requested.size) throw new Error("generation_selection_invalid");
  return ReviewSelectionResultSchema.parse({
    ...selection,
    selected: selected.map((item, index) => ({ ...item, rank: index + 1 })),
  });
}

export function createFixedReviewController(input: {
  readPackage(packageId: string): Promise<unknown>;
  generateReport(pkg: StructuredAnalysisPackage, selection: ReviewSelectionResult, context: ReviewReadBackContext): Promise<unknown>;
  observePackage?(pkg: StructuredAnalysisPackage): void;
  createReportRefId?: () => string;
  repository?: ReviewSessionRepository;
}) {
  const views = new Map<string, ViewState>();
  const viewEpochs = new Map<string, number>();
  const operations = new Map<string, Operation>();
  // Operation IDs are one-shot capabilities. Reuse must never trigger another
  // provider call, even when the caller changes the requested decision.
  const usedOperationIds = new Set<string>();
  const reportRefId = input.createReportRefId ?? randomUUID;
  const viewEpoch = (packageId: string) => viewEpochs.get(packageId) ?? 0;
  const observePackage = (pkg: StructuredAnalysisPackage): void => {
    try { input.observePackage?.(pkg); } catch { /* display metadata cannot block review */ }
  };

  const fromPersisted = (persisted: PersistedReviewState): ViewState => {
    const reportsByRef = new Map(persisted.readBack.reports
      .filter((item) => item.reportRefId !== null)
      .map((item) => [item.reportRefId!, item.report] as const));
    return {
      sessionId: persisted.sessionId,
      revision: persisted.revision,
      analysisPackage: persisted.analysisPackage,
      selection: persisted.selection,
      reportRefs: persisted.reportRefs.map((ref) => Object.freeze({
        ...ref,
        packageId: persisted.analysisPackage.packageId,
        report: reportsByRef.get(ref.reportRefId) ?? null,
      })),
      decisionReportRefs: [...persisted.decisionReportRefs],
      activeReportRefId: persisted.activeReportRefId,
      readBack: persisted.readBack,
    };
  };

  const reportForRef = (state: ViewState, refId: string): ReviewReport => {
    const report = state.readBack.reports.find((item) => item.reportRefId === refId)?.report;
    if (report === undefined) throw new Error("review_unavailable");
    return report;
  };
  const activeRef = (state: ViewState): ReportRef | null => {
    if (state.activeReportRefId === null) return null;
    const matches = state.reportRefs.filter((ref) => ref.reportRefId === state.activeReportRefId);
    if (matches.length !== 1) throw new Error("review_unavailable");
    return Object.freeze({ ...matches[0]!, report: reportForRef(state, state.activeReportRefId) });
  };
  const snapshot = (state: ViewState): FixedReviewSnapshotDto => {
    const active = activeRef(state);
    if (state.readBack.analysisPackage !== state.analysisPackage || state.readBack.selection !== state.selection
      || state.readBack.report !== (active?.report ?? null)) throw new Error("review_unavailable");
    return presentFixedReviewSnapshotFromContext(state.readBack, active?.reportRefId ?? null);
  };
  const requireState = (packageId: string): ViewState => {
    const state = views.get(packageId);
    if (state === undefined) throw new Error("review_unavailable");
    return state;
  };
  const composeStateReadBack = (state: ViewState): ReviewReadBackContext => {
    const neededRefs = new Set(state.decisionReportRefs.map((mapping) => mapping.reportRefId));
    if (state.activeReportRefId !== null) neededRefs.add(state.activeReportRefId);
    const reports = [...neededRefs].map((refId) => {
      const ref = state.reportRefs.find((item) => item.reportRefId === refId);
      if (ref?.report == null) throw new Error("review_unavailable");
      return Object.freeze({ reportRefId: refId, report: ref.report });
    });
    const readBack = freezeReviewReadBack(composeReviewSessionReadBackContext(
      state.analysisPackage,
      state.selection,
      {
        reports,
        decisionReportRefs: state.decisionReportRefs,
        activeReportRefId: state.activeReportRefId,
      },
    ));
    // The selector result in a context is its newly schema-validated owned
    // value. Keep the view and context on that same object for snapshot CAS.
    state.analysisPackage = readBack.analysisPackage;
    state.selection = readBack.selection;
    return readBack;
  };
  const selectedReportEntry = (state: ViewState, decisionId: string) =>
    state.readBack.reportForDecision(decisionId)?.decisionEntries.find((entry) => entry.decisionId === decisionId);

  const open = async (
    packageId: string,
    expectedEpoch = viewEpoch(packageId),
    isCurrent: () => boolean = () => viewEpoch(packageId) === expectedEpoch,
  ): Promise<FixedReviewSnapshotDto> => {
    const existing = views.get(packageId);
    if (existing !== undefined) return snapshot(existing);
    const persisted = input.repository?.tryOpenByPackageId(packageId) ?? null;
    if (persisted !== null) {
      const state = fromPersisted(persisted);
      observePackage(state.analysisPackage);
      const projected = snapshot(state);
      if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
      views.set(packageId, state);
      return projected;
    }
    const raw = await input.readPackage(packageId);
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    validateStructuredAnalysisPackage(raw);
    const analysisPackage = StructuredAnalysisPackageSchema.parse(raw);
    if (analysisPackage.packageId !== packageId) throw new Error("review_unavailable");
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    const selection = selectReviewDecisions(analysisPackage);
    const initialReadBack = freezeReviewReadBack(composeReviewSessionReadBackContext(analysisPackage, selection, {
      reports: [], decisionReportRefs: [], activeReportRefId: null,
    }));
    let state: ViewState = {
      sessionId: null,
      revision: null,
      analysisPackage: initialReadBack.analysisPackage,
      selection: initialReadBack.selection,
      reportRefs: [],
      decisionReportRefs: [],
      activeReportRefId: null,
      readBack: initialReadBack,
    };
    if (input.repository !== undefined) state = fromPersisted(input.repository.saveSession(state.analysisPackage, state.selection));
    observePackage(state.analysisPackage);
    const projected = snapshot(state);
    if (!isCurrent() || viewEpoch(packageId) !== expectedEpoch) throw new Error("operation_cancelled");
    views.set(packageId, state);
    return projected;
  };

  const generate = async (
    packageId: string,
    operationId: string,
    decisionId?: string,
  ): Promise<FixedReviewOperationResult> => {
    if (usedOperationIds.has(operationId)
      || operations.has(operationId)
      || [...operations.values()].some((operation) => operation.packageId === packageId)) {
      return { status: "failed", code: "generation_failed" };
    }
    usedOperationIds.add(operationId);
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
      if (input.repository !== undefined) {
        const persisted = input.repository.tryOpenByPackageId(packageId);
        if (persisted === null) throw new Error("review_unavailable");
        state = fromPersisted(persisted);
        views.set(packageId, state);
      }
      if (!isCurrent()) return { status: "failed", code: "operation_cancelled" };

      if (input.repository !== undefined) {
        const receipt = input.repository.inspect(packageId).receipts.find((item) => item.operation_id === operationId) as
          { kind?: string; report_ref_id?: string | null } | undefined;
        if (receipt !== undefined) {
          // Opening above already performed local intent recovery. Do not let
          // an old operation ID authorize a different generation request or
          // claim that the request's decision scope is satisfied.
          return { status: "failed", code: "generation_failed" };
        }
      }

      let generationSelection: ReviewSelectionResult;
      if (decisionId !== undefined) {
        const selected = state.selection.selected.some((item) => item.decisionId === decisionId);
        const decision = state.analysisPackage.decisions.find((item) => item.decisionId === decisionId);
        if (!selected || decision?.outcome !== "analysis_ready") {
          return { status: "failed", code: "generation_failed" };
        }
        if (selectedReportEntry(state, decisionId)?.explanationStatus === "ready") {
          return { status: "failed", code: "generation_failed" };
        }
        generationSelection = subsetSelection(state.selection, [decisionId]);
      } else {
        const pendingIds = state.selection.selected
          .filter((item) => selectedReportEntry(state!, item.decisionId)?.explanationStatus !== "ready")
          .map((item) => item.decisionId);
        generationSelection = subsetSelection(state.selection, pendingIds);
        if (pendingIds.length === 0) return { status: "ready", snapshot: snapshot(state) };
      }

      const expectedSession = state.sessionId === null || state.revision === null
        ? undefined
        : Object.freeze({ sessionId: state.sessionId, revision: state.revision });
      const requestedIds = generationSelection.selected.map((item) => item.decisionId);
      const rawReport = await input.generateReport(state.analysisPackage, generationSelection, state.readBack);
      const current = views.get(packageId);
      if (current !== state || !isCurrent()) {
        return { status: "failed", code: "operation_cancelled" };
      }
      const report = ReviewReportSchema.parse(rawReport);
      if (report.selectedDecisionIds.length !== requestedIds.length
        || report.selectedDecisionIds.some((id, index) => id !== requestedIds[index])) {
        throw new Error("report_selection_mismatch");
      }
      const nextRefId = reportRefId();
      if (nextRefId.length === 0 || state.reportRefs.some((ref) => ref.reportRefId === nextRefId)) {
        throw new Error("duplicate_report_ref");
      }
      if (input.repository !== undefined) {
        const persisted = input.repository.saveReport(
          packageId, report, nextRefId, operationId, expectedSession, requestedIds,
        );
        const durableState = fromPersisted(persisted);
        views.set(packageId, durableState);
        return { status: "ready", snapshot: snapshot(durableState) };
      }
      const newReportRef = Object.freeze({
        reportRefId: nextRefId,
        packageId,
        reportId: report.reportId,
        generatedAt: report.generatedAt,
        report,
      });
      const replaced = new Set(requestedIds);
      const nextState: ViewState = {
        ...state,
        reportRefs: [...state.reportRefs, newReportRef],
        decisionReportRefs: [
          ...state.decisionReportRefs.filter((mapping) => !replaced.has(mapping.decisionId)),
          ...requestedIds.map((id) => Object.freeze({ decisionId: id, reportRefId: nextRefId })),
        ],
        activeReportRefId: nextRefId,
      };
      nextState.readBack = composeStateReadBack(nextState);
      views.set(packageId, nextState);
      return { status: "ready", snapshot: snapshot(nextState) };
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

    async generateReview(packageId: string, operationId: string, decisionId?: string): Promise<FixedReviewOperationResult> {
      return generate(packageId, operationId, decisionId);
    },

    /** Internal lifecycle regression seam; intentionally absent from IPC/preload. */
    async generateReviewForLifecycle(packageId: string, operationId: string, decisionId?: string): Promise<FixedReviewOperationResult> {
      return generate(packageId, operationId, decisionId);
    },

    cancelGeneration(operationId: string): void {
      const operation = operations.get(operationId);
      if (operation !== undefined) operation.cancelled = true;
    },

    getReviewDetail(packageId: string, decisionId: string, requestedActiveRefId: string | null): FixedReviewDetailDto {
      const state = requireState(packageId);
      if (state.activeReportRefId !== requestedActiveRefId) throw new Error("review_unavailable");
      if (state.readBack.analysisPackage !== state.analysisPackage || state.readBack.selection !== state.selection) {
        throw new Error("review_unavailable");
      }
      return presentFixedReviewDetailFromContext(state.readBack, decisionId, state.activeReportRefId);
    },

    /** Internal lifecycle capability only; intentionally absent from IPC/preload. */
    activateReport(packageId: string, targetReportRefId: string): FixedReviewSnapshotDto {
      if (input.repository !== undefined) {
        const persisted = input.repository.activateExisting(packageId, targetReportRefId, randomUUID());
        const state = fromPersisted(persisted);
        views.set(packageId, state);
        return snapshot(state);
      }
      const state = requireState(packageId);
      const matches = state.reportRefs.filter((ref) => ref.reportRefId === targetReportRefId);
      if (matches.length !== 1 || matches[0]!.packageId !== packageId || matches[0]!.report === null) {
        throw new Error("review_unavailable");
      }
      const target = matches[0]!.report;
      const targetIds = new Set(target.selectedDecisionIds);
      const nextState: ViewState = {
        ...state,
        decisionReportRefs: [
          ...state.decisionReportRefs.filter((mapping) => !targetIds.has(mapping.decisionId)),
          ...target.selectedDecisionIds.map((decisionId) => Object.freeze({ decisionId, reportRefId: targetReportRefId })),
        ],
        activeReportRefId: targetReportRefId,
      };
      nextState.readBack = composeStateReadBack(nextState);
      views.set(packageId, nextState);
      return snapshot(nextState);
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
      if (input.repository !== undefined) return input.repository.inspect(packageId);
      const state = requireState(packageId);
      return Object.freeze({
        activeReportRefId: state.activeReportRefId,
        reportRefs: Object.freeze(state.reportRefs.map(({ report: _report, ...ref }) => Object.freeze(ref))),
        decisionMappings: Object.freeze(state.decisionReportRefs.map((mapping) => Object.freeze({ ...mapping }))),
      });
    },
  });
}
export type FixedReviewController = ReturnType<typeof createFixedReviewController>;
