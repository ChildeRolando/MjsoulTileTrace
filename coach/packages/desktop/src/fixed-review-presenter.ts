import {
  FixedReviewDetailSchema, FixedReviewSnapshotSchema,
  type FixedReviewDetailDto, type FixedReviewSnapshotDto,
  type ReviewReport, type ReviewSelectionResult, type StructuredAnalysisPackage,
} from "@riichi-coach/contracts";
import { composeReviewReadBackContext } from "@riichi-coach/reasoning";

const OUTCOMES = [
  "analysis_ready", "unsupported_action", "source_row_not_expected", "no_mortal_entry",
  "binding_mismatch", "model_output_incomplete", "analysis_blocked",
] as const;
const AXES = ["efficiency", "value", "defense", "placement", "option_value"] as const;

type ReadyDecision = Extract<StructuredAnalysisPackage["decisions"][number], { outcome: "analysis_ready" }>;
type GraphNode = ReturnType<typeof composeReviewReadBackContext>["currentGraph"]["nodes"][number];

function actionLabel(action: unknown): string {
  if (action === null || typeof action !== "object" || Array.isArray(action)) return "未知行动";
  const value = action as Record<string, unknown>;
  const tile = (candidate: unknown): string => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const id = (candidate as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
    return "";
  };
  const names: Record<string, string> = {
    discard: "打牌", riichi_discard: "立直打牌", declare_riichi: "立直", tsumo: "自摸",
    ron: "荣和", chi: "吃", pon: "碰", daiminkan: "大明杠", ankan: "暗杠", kakan: "加杠", none: "跳过",
  };
  const kind = typeof value.kind === "string" ? value.kind : "unknown";
  const tileText = tile(value.tile) || tile(value.addedTile);
  return `${names[kind] ?? "行动"}${tileText === "" ? "" : ` ${tileText}`}`;
}

function readyDecision(pkg: StructuredAnalysisPackage, decisionId: string): ReadyDecision {
  const decision = pkg.decisions.find((candidate) => candidate.decisionId === decisionId);
  if (decision?.outcome !== "analysis_ready") throw new Error("fixed_review_unavailable");
  return decision;
}

function actionDto(decision: ReadyDecision, actionRef: string | null) {
  if (actionRef === null) {
    const action = decision.normalizedDecisionContext.actualAction;
    return action === null ? null : { actionRef: null, label: actionLabel(action) };
  }
  const candidate = decision.comparisonSet.candidates.find((item) => item.actionRef === actionRef);
  if (candidate === undefined) throw new Error("fixed_review_unavailable");
  return { actionRef, label: actionLabel(candidate.action) };
}

function actualActionDto(decision: ReadyDecision) {
  const candidate = decision.comparisonSet.candidates.find((item) => item.origins.includes("actual"));
  return candidate === undefined
    ? actionDto(decision, null)
    : { actionRef: candidate.actionRef, label: actionLabel(candidate.action) };
}

function mortalActions(decision: ReadyDecision) {
  return decision.modelEvaluation.preferredActions.map((actionRef) => {
    const score = decision.modelEvaluation.candidates.find((item) => item.actionRef === actionRef)?.modelSelectionScore;
    if (score === undefined) throw new Error("fixed_review_unavailable");
    return { ...actionDto(decision, actionRef)!, score, scoreUnit: "模型选择分" as const };
  });
}

function explanationStatus(report: ReviewReport | null, decisionId: string) {
  if (report === null) return "not_generated" as const;
  const entry = report.decisionEntries.find((item) => item.decisionId === decisionId);
  if (entry === undefined) throw new Error("fixed_review_unavailable");
  if (entry.explanationStatus === "not_selected") throw new Error("fixed_review_unavailable");
  return entry.explanationStatus;
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function placeholderValue(nodes: readonly GraphNode[], token: string): { text: string; sourceRef: string } {
  const match = /^\{(diff|candidate):([^{}.]+)\.([^{}]+)\}$/.exec(token);
  if (match === null) throw new Error("fixed_review_unavailable");
  const [, kind, ref, path] = match;
  const nodeKind = kind === "diff" ? "FactorDifference" : "CandidateAction";
  const key = kind === "diff" ? "differenceId" : "actionRef";
  const node = nodes.find((candidate) => {
    const payload = candidate.payload as Record<string, unknown>;
    return candidate.nodeKind === nodeKind && payload[key] === ref;
  });
  if (node === undefined) throw new Error("fixed_review_unavailable");
  let value: unknown = node.payload;
  for (const segment of path!.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("fixed_review_unavailable");
    value = (value as Record<string, unknown>)[segment];
  }
  const text = scalar(value);
  if (text === null) throw new Error("fixed_review_unavailable");
  return { text, sourceRef: node.nodeId };
}

function explanationSegments(nodes: readonly GraphNode[], text: string) {
  const tokens = text.split(/(\{[^{}]*\})/g).filter((part) => part !== "");
  return tokens.map((token) => token.startsWith("{")
    ? { kind: "evidence_value" as const, ...placeholderValue(nodes, token) }
    : { kind: "text" as const, text: token });
}

function summarizeEvidence(node: GraphNode): string {
  const payload = node.payload as Record<string, unknown>;
  if (node.nodeKind === "FactorDifference") {
    return `${String(payload.axis)} · ${String(payload.dimension)} · ${String(payload.direction)}`;
  }
  if (node.nodeKind === "FactorFact") {
    return `${String(payload.axis)} · ${String(payload.dimension)}`;
  }
  return String(payload.statement ?? "教练推断");
}

export function presentFixedReviewSnapshot(input: {
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReport?: ReviewReport | null;
  activeReportRefId?: string | null;
}): FixedReviewSnapshotDto {
  const context = composeReviewReadBackContext(input.analysisPackage, input.selection, input.activeReport ?? null);
  const report = context.report;
  const outcomeCounts = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<typeof OUTCOMES[number], number>;
  for (const decision of context.analysisPackage.decisions) outcomeCounts[decision.outcome] += 1;
  const items = context.selection.selected.map((selected) => {
    const decision = readyDecision(context.analysisPackage, selected.decisionId);
    const presentAxes = new Set(decision.factorDifferences.map((difference) => difference.axis));
    return {
      ...selected,
      roundOrdinal: decision.roundOrdinal,
      decisionWindowKind: decision.normalizedDecisionContext.decisionWindowKind,
      actualAction: actualActionDto(decision),
      mortalPreferredActions: mortalActions(decision),
      errorGap: decision.modelEvaluation.errorGap,
      tags: AXES.filter((axis) => presentAxes.has(axis)),
      explanationStatus: explanationStatus(report, selected.decisionId),
    };
  });
  const explanationCounts = { ready: 0, provider_unavailable: 0, request_failed: 0, invalid_output: 0 };
  for (const item of items) if (item.explanationStatus !== "not_generated") explanationCounts[item.explanationStatus] += 1;
  return Object.freeze(FixedReviewSnapshotSchema.parse({
    schemaVersion: "fixed-review-view/v1",
    packageId: context.analysisPackage.packageId,
    analysisStatus: context.analysisPackage.record.status,
    outcomeCounts,
    selection: { policyVersion: context.selection.policyVersion, selectedCount: items.length, items },
    activeReportRefId: input.activeReportRefId ?? null,
    activeReportStatus: report?.generationStatus ?? "not_generated",
    explanationCounts,
  }));
}

export function presentFixedReviewDetail(input: {
  analysisPackage: StructuredAnalysisPackage;
  selection: ReviewSelectionResult;
  activeReport?: ReviewReport | null;
  activeReportRefId?: string | null;
  decisionId: string;
}): FixedReviewDetailDto {
  const context = composeReviewReadBackContext(input.analysisPackage, input.selection, input.activeReport ?? null);
  const decision = readyDecision(context.analysisPackage, input.decisionId);
  const scoped = context.decisionContext(input.decisionId);
  const judgments = scoped.nodes.filter((node) => node.nodeKind === "CoachJudgment").map((node) => {
    const payload = node.payload as { recommendation: string; confidence: "high" | "medium" | "low"; premiseRefs: string[] };
    for (const ref of payload.premiseRefs) context.resolveDecisionRef(input.decisionId, ref);
    return { recommendation: actionDto(decision, payload.recommendation)!, confidence: payload.confidence, premiseRefs: payload.premiseRefs };
  });
  const explanations = scoped.nodes.filter((node) => node.nodeKind === "Explanation").map((node) => {
    const payload = node.payload as { text: string; claims: Array<{ evidenceRef: string }> };
    const evidenceRefs = payload.claims.map((claim) => context.resolveDecisionRef(input.decisionId, claim.evidenceRef).nodeId);
    return { segments: explanationSegments(scoped.nodes, payload.text), evidenceRefs };
  });
  const provenance = scoped.nodes.filter((node) =>
    node.nodeKind === "FactorDifference" || node.nodeKind === "FactorFact" || node.nodeKind === "CoachInference"
  ).map((node) => ({
    displayRef: node.nodeId,
    category: node.nodeKind === "CoachInference" ? "coach_inference" as const
      : node.authority === "advisory" ? "advisory_signal" as const : "hard_evidence" as const,
    label: node.nodeKind === "FactorDifference" ? "差异证据" : node.nodeKind === "FactorFact" ? "事实证据" : "教练推断",
    summary: summarizeEvidence(node),
    producer: node.producer,
    producerVersion: node.producerVersion,
    sourceRefs: [...node.provenance],
  }));
  return Object.freeze(FixedReviewDetailSchema.parse({
    schemaVersion: "fixed-review-detail/v1",
    packageId: context.analysisPackage.packageId,
    activeReportRefId: input.activeReportRefId ?? null,
    decisionId: input.decisionId,
    actual: actualActionDto(decision),
    mortal: mortalActions(decision),
    coachJudgments: judgments,
    explanations,
    provenance,
    explanationStatus: explanationStatus(context.report, input.decisionId),
  }));
}
