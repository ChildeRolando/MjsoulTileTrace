import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StructuredAnalysisPackageSchema, type CoachDesktopApi, type ContextGraph, type DecisionAnalysis, type ReviewReport, type ReviewSelectionResult, type StructuredAnalysisPackage } from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { createFixedReviewController } from "../src/fixed-review-controller.js";
import { presentFixedReviewDetail, presentFixedReviewSnapshot } from "../src/fixed-review-presenter.js";
import { createFixedReviewUi } from "../src/renderer/fixed-review-ui.js";

const pkg = StructuredAnalysisPackageSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/coach-package.json", import.meta.url), "utf8")));
validateStructuredAnalysisPackage(pkg);
const selection = selectReviewDecisions(pkg);
const provider = {
  descriptor: () => ({ providerId: "unconfigured", model: "unconfigured" }),
  complete: async () => ({ errorCode: "provider_unavailable" as const, transportRetries: 0 as const }),
};
const report = await generateReviewReport(projectContextGraph(pkg), selection, provider, "2026-09-22T00:00:00.000Z");

function fixtureDecisionId(input: { recordId: string; selfActor: number; surface: string; windowKind: string; triggerEventRef: string }) {
  return ["decision", input.recordId, `self${input.selfActor}`, input.surface, input.windowKind, input.triggerEventRef].join(":");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** Independent test-only recomputation keeps the derived fixture schema-valid without importing another package's internals. */
function fixtureSemanticHash(value: StructuredAnalysisPackage): string {
  const decisions = value.decisions.map((decision) => decision.outcome === "analysis_ready"
    ? { ...decision, modelEvaluation: { ...decision.modelEvaluation, detailPolicy: { ...decision.modelEvaluation.detailPolicy, frozenAt: null } } }
    : decision);
  const payload = {
    analysisKey: value.analysisKey, record: value.record, componentVersions: value.componentVersions,
    analysisPolicy: value.analysisPolicy, decisions, evidenceRegistry: value.evidenceRegistry,
  };
  return `sha256:${createHash("sha256").update(canonical(payload)).digest("hex")}`;
}

function draftFor(graph: ContextGraph, chosen: ReviewSelectionResult, count = chosen.selected.length) {
  return {
    decisions: chosen.selected.slice(0, count).map(({ decisionId }, index) => {
      const nodes = graph.nodes.filter((node) => (node.payload as { decisionId?: string }).decisionId === decisionId);
      const candidate = nodes.find((node) => node.nodeKind === "CandidateAction")!;
      const premise = nodes.find((node) => node.nodeKind === "KnownGameFact")!;
      const difference = nodes.find((node) => node.nodeKind === "FactorDifference" && typeof (node.payload as { leftValue?: { value?: unknown } }).leftValue?.value === "number")!;
      const payload = difference.payload as { differenceId: string };
      return {
        decisionId,
        judgment: { localId: `judgment-${index}`, recommendation: (candidate.payload as { actionRef: string }).actionRef, confidence: "medium", premiseRefs: [premise.nodeId] },
        explanations: [{
          text: `牌效值 {diff:${payload.differenceId}.leftValue.value}`,
          claims: [{ kind: "factor_difference", evidenceRef: difference.nodeId }],
          judgmentLocalRef: `judgment-${index}`,
        }],
      };
    }),
  };
}

function respondingProvider(content: unknown) {
  return {
    descriptor: () => ({ providerId: "fixture", model: "fixture" }),
    complete: async () => ({ content: JSON.stringify(content), transportRetries: 0 as const }),
  };
}

class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  hidden = false;
  className = "";
  id = "";
  tabIndex = 0;
  open = false;
  disabled = false;
  type = "";
  private ownText = "";
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  constructor(readonly tagName: string) {}
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(""); }
  set textContent(value: string) { this.ownText = value; this.children = []; }
  append(...nodes: FakeNode[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(node: FakeNode) { node.parent = this; this.children.unshift(node); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  addEventListener(key: string, listener: () => void) { this.listeners.set(key, listener); }
  querySelector(selector: string): FakeNode | null {
    const candidates = selector.split(",").map((value) => value.trim());
    for (const child of this.children) {
      if (candidates.some((candidate) => candidate.startsWith(".") ? child.className.split(" ").includes(candidate.slice(1)) : child.tagName === candidate.toUpperCase())) return child;
      const nested = child.querySelector(selector); if (nested !== null) return nested;
    }
    return null;
  }
  remove() { if (this.parent !== null) this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
}

function fakeDom() {
  const root = new FakeNode("SECTION");
  const document = {
    createElement: (tag: string) => new FakeNode(tag.toUpperCase()),
    createTextNode: (text: string) => { const node = new FakeNode("#TEXT"); node.textContent = text; return node; },
  };
  return { root, document };
}

describe("fixed review presenter", () => {
  it("projects selector order, fixed counts and evidence-only detail through authorized read-back", () => {
    const snapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: report, activeReportRefId: "ref-a" });
    expect(snapshot.selection.items.map((item) => item.decisionId)).toEqual(selection.selected.map((item) => item.decisionId));
    expect(snapshot.selection.items.map((item) => item.rank)).toEqual([1]);
    expect(snapshot.outcomeCounts).toEqual({ analysis_ready: 1, unsupported_action: 0, source_row_not_expected: 0, no_mortal_entry: 0, binding_mismatch: 0, model_output_incomplete: 0, analysis_blocked: 0 });
    expect(snapshot.activeReportStatus).toBe("evidence_only");
    const keys: string[] = [];
    JSON.stringify(snapshot, (key, value) => { if (key !== "") keys.push(key); return value; });
    expect(keys).not.toEqual(expect.arrayContaining(["reportCatalog", "reportRefs", "generatedAt", "providerId", "model", "prompt", "raw"]));
    const detail = presentFixedReviewDetail({ analysisPackage: pkg, selection, activeReport: report, activeReportRefId: "ref-a", decisionId: selection.selected[0]!.decisionId });
    expect(detail.explanationStatus).toBe("provider_unavailable");
    expect(detail.coachJudgments).toEqual([]);
    expect(detail.provenance.length).toBeGreaterThan(0);
  });

  it("supports not-generated evidence and fails closed outside selector scope", () => {
    const snapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection });
    expect(snapshot.activeReportStatus).toBe("not_generated");
    expect(snapshot.selection.items[0]!.explanationStatus).toBe("not_generated");
    expect(() => presentFixedReviewDetail({ analysisPackage: pkg, selection, decisionId: "other" })).toThrow();
  });

  it("renders complete, partial and empty-selection production reports", async () => {
    const graph = projectContextGraph(pkg);
    const complete = await generateReviewReport(graph, selection, respondingProvider(draftFor(graph, selection)), "2026-09-22T01:00:00.000Z");
    const completeSnapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "complete" });
    expect(completeSnapshot.activeReportStatus).toBe("complete");
    const dom = fakeDom();
    const ui = createFixedReviewUi({
      document: dom.document as unknown as Document,
      root: dom.root as unknown as HTMLElement,
      api: { openReview: async () => completeSnapshot } as unknown as CoachDesktopApi,
    });
    await ui.open(pkg.packageId);
    expect(dom.root.textContent).toContain("整盘复盘");
    expect(dom.root.textContent).toContain("教练解说已完整生成");
    expect(dom.root.textContent).not.toContain("complete");
    const completeDetail = presentFixedReviewDetail({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "complete", decisionId: selection.selected[0]!.decisionId });
    expect(completeDetail.coachJudgments).toHaveLength(1);
    expect(completeDetail.explanations[0]!.segments.some((segment) => segment.kind === "evidence_value" && /^\d+$/.test(segment.text))).toBe(true);

    const twoBase = structuredClone(pkg);
    const readyClone = structuredClone(twoBase.decisions[0]!);
    if (readyClone.outcome !== "analysis_ready") throw new Error("fixture must be ready");
    readyClone.decisionId = fixtureDecisionId({ recordId: twoBase.record.recordId, selfActor: twoBase.record.selfActor, surface: "self", windowKind: "post_riichi_discard", triggerEventRef: readyClone.normalizedDecisionContext.triggerEventRef });
    readyClone.normalizedDecisionContext = { ...readyClone.normalizedDecisionContext, decisionWindowKind: "post_riichi_discard" };
    readyClone.knownGameFacts = { ...readyClone.knownGameFacts, decisionWindow: { ...readyClone.knownGameFacts.decisionWindow, kind: "post_riichi_discard" } };
    readyClone.comparisonSet = { ...readyClone.comparisonSet, decisionWindow: { ...readyClone.comparisonSet.decisionWindow, kind: "post_riichi_discard" } };
    twoBase.decisions.push(readyClone);
    const ready = twoBase.decisions[0]!;
    const failure = (kind: "discard_response" | "kan_response", outcome: "source_row_not_expected" | "unsupported_action") => ({
      decisionId: fixtureDecisionId({ recordId: twoBase.record.recordId, selfActor: twoBase.record.selfActor, surface: "response", windowKind: kind, triggerEventRef: ready.normalizedDecisionContext.triggerEventRef }),
      surface: "response" as const,
      roundOrdinal: ready.roundOrdinal,
      normalizedDecisionContext: { ...ready.normalizedDecisionContext, decisionWindowKind: kind, actualAction: null },
      knownGameFacts: { ...ready.knownGameFacts, currentDraw: null, decisionWindow: {
        kind, actor: ready.knownGameFacts.actor, triggerEventRef: ready.normalizedDecisionContext.triggerEventRef,
        sourceActor: (ready.knownGameFacts.actor + 1) % 4, offeredTile: { id: "5p" as const, red: false },
        ...(kind === "kan_response" ? { kanKind: "kakan" as const } : {}),
      } },
      outcome,
      analysisProvider: outcome === "source_row_not_expected"
        ? { kind: "mortal" as const, outcome, reason: null, singleCandidateProof: { shape: "response_single_candidate" as const, candidateCount: 1 as const } }
        : { kind: "mortal" as const, outcome, reason: "coverage_branch_uncovered" as const },
    }) as DecisionAnalysis;
    const degradedDecisions = [...twoBase.decisions, failure("discard_response", "source_row_not_expected"), failure("kan_response", "unsupported_action")];
    const twoDraft: StructuredAnalysisPackage = {
      ...twoBase,
      record: { ...twoBase.record, status: "degraded" },
      decisions: degradedDecisions,
      semanticContentHash: "pending",
    };
    const two: StructuredAnalysisPackage = {
      ...twoDraft,
      semanticContentHash: fixtureSemanticHash(twoDraft),
    };
    validateStructuredAnalysisPackage(two);
    const twoSelection: ReviewSelectionResult = {
      policyVersion: "deterministic-review-selector/v1", analysisPackageId: two.packageId,
      analysisPackageStatus: two.record.status,
      selected: two.decisions.slice(0, 2).map((decision, index) => ({
        decisionId: decision.decisionId, rank: index + 1,
        selectionReason: "model_disagreement_above_threshold" as const,
      })),
    };
    expect(twoSelection.selected).toHaveLength(2);
    const twoGraph = projectContextGraph(two);
    const partial = await generateReviewReport(twoGraph, twoSelection, respondingProvider(draftFor(twoGraph, twoSelection, 1)), "2026-09-22T02:00:00.000Z");
    const partialSnapshot = presentFixedReviewSnapshot({ analysisPackage: two, selection: twoSelection, activeReport: partial, activeReportRefId: "partial" });
    expect(partialSnapshot.activeReportStatus).toBe("partial");
    expect(partialSnapshot.explanationCounts).toMatchObject({ ready: 1, invalid_output: 1 });
    expect(partialSnapshot.analysisStatus).toBe("degraded");
    expect(partialSnapshot.outcomeCounts).toMatchObject({ unsupported_action: 1, source_row_not_expected: 1 });

    const emptySelection: ReviewSelectionResult = { ...selection, selected: [] };
    let providerCalls = 0;
    const empty = await generateReviewReport(graph, emptySelection, {
      descriptor: () => ({ providerId: "fixture", model: "fixture" }),
      complete: async () => { providerCalls += 1; return { errorCode: "connection_failed" as const, transportRetries: 0 as const }; },
    }, "2026-09-22T03:00:00.000Z");
    const emptySnapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection: emptySelection, activeReport: empty, activeReportRefId: "empty" });
    expect(emptySnapshot.selection.items).toEqual([]);
    expect(emptySnapshot.activeReportStatus).toBe("evidence_only");
    expect(providerCalls).toBe(0);
  });
});

describe("fixed review lifecycle controller", () => {
  it("keeps duplicate reportId instances addressable and isolates A→B→A", async () => {
    let generated = 0;
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport: async () => ({ ...report, generatedAt: `2026-09-22T00:00:0${generated++}.000Z` }) as ReviewReport,
      createReportRefId: (() => { let id = 0; return () => `ref-${++id}`; })(),
    });
    await controller.openReview(pkg.packageId);
    expect((await controller.generateReview(pkg.packageId, "op-a")).status).toBe("ready");
    expect((await controller.generateReview(pkg.packageId, "op-b")).status).toBe("ready");
    const state = controller.inspect(pkg.packageId);
    expect(state.reportRefs.map((ref) => ref.reportId)).toEqual([report.reportId, report.reportId]);
    expect(state.reportRefs.map((ref) => ref.reportRefId)).toEqual(["ref-1", "ref-2"]);
    expect(controller.activateReport(pkg.packageId, "ref-1").activeReportRefId).toBe("ref-1");
    expect(controller.activateReport(pkg.packageId, "ref-2").activeReportRefId).toBe("ref-2");
    expect(controller.activateReport(pkg.packageId, "ref-1").activeReportRefId).toBe("ref-1");
  });

  it("preserves the active report on operation failure", async () => {
    let fail = false;
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport: async () => { if (fail) throw new Error("private backend prose"); return report; },
      createReportRefId: () => "ref-a",
    });
    await controller.openReview(pkg.packageId);
    expect((await controller.generateReview(pkg.packageId, "op-a")).status).toBe("ready");
    fail = true;
    expect(await controller.generateReview(pkg.packageId, "op-b")).toEqual({ status: "failed", code: "generation_failed" });
    expect(controller.inspect(pkg.packageId)).toMatchObject({ activeReportRefId: "ref-a", reportRefs: [{ reportRefId: "ref-a" }] });
  });

  it("drops a late result after leave", async () => {
    let release!: (value: ReviewReport) => void;
    const pending = new Promise<ReviewReport>((resolve) => { release = resolve; });
    const controller = createFixedReviewController({ readPackage: async () => pkg, generateReport: async () => pending });
    await controller.openReview(pkg.packageId);
    const generation = controller.generateReview(pkg.packageId, "op-late");
    await Promise.resolve();
    controller.leaveReview(pkg.packageId);
    release(report);
    expect(await generation).toEqual({ status: "failed", code: "operation_cancelled" });
    expect(() => controller.inspect(pkg.packageId)).toThrow(/^review_unavailable$/);
  });
});
