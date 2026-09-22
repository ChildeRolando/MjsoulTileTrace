import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { RiichiActionSchema, StructuredAnalysisPackageSchema, type CoachDesktopApi, type ContextGraph, type DecisionAnalysis, type ReviewReport, type ReviewSelectionResult, type StructuredAnalysisPackage } from "@riichi-coach/contracts";
import { generateReviewReport, projectContextGraph, selectReviewDecisions, validateStructuredAnalysisPackage } from "@riichi-coach/reasoning";
import { createFixedReviewController } from "../src/fixed-review-controller.js";
import { actionLabel, presentFixedReviewDetail, presentFixedReviewSnapshot } from "../src/fixed-review-presenter.js";
import { createFixedReviewUi } from "../src/renderer/fixed-review-ui.js";
import { registerCoachIpc } from "../src/coach-ipc.js";
import { createCoachPreloadApi } from "../src/session-api.js";
import type { CoachService } from "../src/llm-provider/service.js";

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
  private assignedTabIndex: number | null = null;
  open = false;
  disabled = false;
  type = "";
  private ownText = "";
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  constructor(readonly tagName: string, private readonly document?: { activeElement: FakeNode | null }) {}
  get tabIndex() { return this.assignedTabIndex ?? (this.tagName === "BUTTON" ? 0 : -1); }
  set tabIndex(value: number) { this.assignedTabIndex = value; }
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
  focus() {
    if (this.document !== undefined && (this.tagName === "BUTTON" || this.assignedTabIndex !== null)) this.document.activeElement = this;
  }
}

function nodes(root: FakeNode): FakeNode[] { return [root, ...root.children.flatMap(nodes)]; }

function fakeDom() {
  const documentState: { activeElement: FakeNode | null } = { activeElement: null };
  const root = new FakeNode("SECTION", documentState);
  const document = {
    ...documentState,
    get activeElement() { return documentState.activeElement; },
    set activeElement(value: FakeNode | null) { documentState.activeElement = value; },
    createElement: (tag: string) => new FakeNode(tag.toUpperCase(), documentState),
    createTextNode: (text: string) => { const node = new FakeNode("#TEXT", documentState); node.textContent = text; return node; },
  };
  return { root, document };
}

function apiThroughIpc(snapshot: ReturnType<typeof presentFixedReviewSnapshot>, detail?: ReturnType<typeof presentFixedReviewDetail>) {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
  const service = {
    openReview: async () => snapshot,
    generateReview: async () => ({ status: "ready" as const, snapshot }),
    cancelGeneration: () => undefined,
    getReviewDetail: () => { if (detail === undefined) throw new Error("review_unavailable"); return detail; },
    leaveReview: () => undefined,
  } as unknown as CoachService;
  const registration = registerCoachIpc({
    trustedSenderId: 11,
    service,
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); }, removeHandler: (channel) => { handlers.delete(channel); } },
  });
  const frame = {};
  const event = { sender: { id: 11, mainFrame: frame }, senderFrame: frame };
  return {
    api: createCoachPreloadApi({ invoke: async (channel, ...args) => handlers.get(channel)!(event, ...args) }),
    dispose: registration.dispose,
  };
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
    expect(detail.mortal[0]?.scoreMethodLabel).toBe("Mortal 行动概率 × 100");
    expect(JSON.stringify(detail.provenance)).not.toContain("undefined");
    const ukeire = detail.provenance.find((item) => item.relatedAction !== null && item.summary.includes("有效进张") && item.details.some((entry) => entry.tiles.length > 0));
    expect(ukeire).toMatchObject({ relatedAction: { label: expect.any(String) } });
    expect(ukeire?.details.flatMap((entry) => entry.tiles)).toContainEqual({ tile: "5m", count: 3 });
    const knownFact = detail.provenance.find((item) => item.label === "局面事实");
    expect(knownFact?.summary).toContain("手牌 13 张");
    expect(knownFact?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "手牌", value: "13 张" }),
      expect.objectContaining({ label: "自家立直", value: "否" }),
    ]));
    const discardFuriten = detail.provenance.find((item) => item.label === "候选事实" && item.summary.includes("舍牌振听"));
    expect(discardFuriten?.summary).toContain("否");
  });

  it("projects every canonical action with distinguishable tiles and red-five identity", () => {
    const action = (value: unknown) => actionLabel(RiichiActionSchema.parse(value));
    expect(action({ kind: "pass", responseEventRef: "e", responseKind: "discard" })).toBe("过");
    expect(action({ kind: "kyuushu_kyuuhai", drawEventRef: "e" })).toBe("九种九牌");
    expect(action({ kind: "discard", tile: { id: "5p", red: false }, discardMode: "tedashi" })).toBe("打牌 5p");
    expect(action({ kind: "discard", tile: { id: "5p", red: true }, discardMode: "tedashi" })).toBe("打牌 赤5p");
    const chi123 = action({ kind: "chi", calledTile: { id: "3m", red: false }, consumedTiles: [{ id: "1m", red: false }, { id: "2m", red: false }], targetActor: 1, responseEventRef: "e" });
    const chi345 = action({ kind: "chi", calledTile: { id: "4m", red: false }, consumedTiles: [{ id: "3m", red: false }, { id: "5m", red: true }], targetActor: 1, responseEventRef: "e" });
    expect(chi123).toContain("1m-2m-3m");
    expect(chi345).toContain("3m-4m-赤5m");
    expect(chi123).not.toBe(chi345);
    expect(action({ kind: "ankan", tiles: Array.from({ length: 4 }, () => ({ id: "5s", red: false })) })).toBe("暗杠 5s-5s-5s-5s");
    expect(action({ kind: "ron", winningTile: { id: "5m", red: true }, targetActor: 1, responseEventRef: "e", winContext: "discard" })).toBe("荣和 赤5m");
  });

  it("supports not-generated evidence and fails closed outside selector scope", () => {
    const snapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection });
    expect(snapshot.activeReportStatus).toBe("not_generated");
    expect(snapshot.selection.items[0]!.explanationStatus).toBe("not_generated");
    expect(() => presentFixedReviewDetail({ analysisPackage: pkg, selection, decisionId: "other" })).toThrow();
  });

  it("renders complete, partial and empty-selection production reports", async () => {
    const graph = projectContextGraph(pkg);
    const evidenceSnapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: report, activeReportRefId: "evidence" });
    const evidenceDom = fakeDom();
    await createFixedReviewUi({ document: evidenceDom.document as unknown as Document, root: evidenceDom.root as unknown as HTMLElement, api: { openReview: async () => evidenceSnapshot } as unknown as CoachDesktopApi }).open(pkg.packageId);
    expect(evidenceDom.root.textContent).toContain("仅证据可用");
    expect(evidenceDom.root.textContent).toContain("解说服务未就绪");
    const complete = await generateReviewReport(graph, selection, respondingProvider(draftFor(graph, selection)), "2026-09-22T01:00:00.000Z");
    const completeSnapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "complete" });
    expect(completeSnapshot.activeReportStatus).toBe("complete");
    const dom = fakeDom();
    const completeDetail = presentFixedReviewDetail({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "complete", decisionId: selection.selected[0]!.decisionId });
    const ui = createFixedReviewUi({
      document: dom.document as unknown as Document,
      root: dom.root as unknown as HTMLElement,
      api: { openReview: async () => completeSnapshot, getReviewDetail: async () => completeDetail } as unknown as CoachDesktopApi,
    });
    await ui.open(pkg.packageId);
    expect(dom.root.textContent).toContain("整盘复盘");
    expect(dom.root.textContent).toContain("入选条目的解说齐全");
    expect(dom.root.textContent).not.toContain("complete");
    expect(completeDetail.coachJudgments).toHaveLength(1);
    expect(completeDetail.explanations[0]!.segments.some((segment) => segment.kind === "evidence_value" && /^\d+$/.test(segment.text))).toBe(true);
    expect(completeDetail.coachJudgments[0]!.premiseRefs.every((ref) => completeDetail.provenance.some((item) => item.displayRef === ref))).toBe(true);
    expect(completeDetail.explanations[0]!.evidenceRefs.every((ref) => completeDetail.provenance.some((item) => item.displayRef === ref))).toBe(true);
    nodes(dom.root).find((node) => node.textContent === "查看复盘条目")!.listeners.get("click")!();
    expect(dom.document.activeElement?.textContent).toBe("复盘条目");
    nodes(dom.root).find((node) => node.textContent === "查看详情")!.listeners.get("click")!();
    await Promise.resolve(); await Promise.resolve();
    expect(dom.root.textContent).toContain("评分口径：Mortal 行动概率 × 100");
    expect(dom.document.activeElement?.textContent).toBe("条目详情");

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
    const partialDom = fakeDom();
    await createFixedReviewUi({ document: partialDom.document as unknown as Document, root: partialDom.root as unknown as HTMLElement, api: { openReview: async () => partialSnapshot } as unknown as CoachDesktopApi }).open(two.packageId);
    expect(partialDom.root.textContent).toContain("部分决策未作完整比较");
    expect(partialDom.root.textContent).toContain("只有一种候选，无需模型比较");
    expect(partialDom.root.textContent).toContain("部分解说可用");

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
    const emptyDom = fakeDom();
    await createFixedReviewUi({ document: emptyDom.document as unknown as Document, root: emptyDom.root as unknown as HTMLElement, api: { openReview: async () => emptySnapshot } as unknown as CoachDesktopApi }).open(pkg.packageId);
    expect(emptyDom.root.textContent).toContain("当前策略未选出复盘条目");
    expect(emptyDom.root.textContent).toContain("仅证据可用");
    expect(emptyDom.root.textContent).not.toContain("服务故障");

    for (const [candidate, visible] of [
      [completeSnapshot, "入选条目的解说齐全"],
      [partialSnapshot, "部分解说可用"],
      [evidenceSnapshot, "仅证据可用"],
      [emptySnapshot, "当前策略未选出复盘条目"],
    ] as const) {
      const boundary = apiThroughIpc(candidate, completeDetail);
      const boundaryDom = fakeDom();
      await createFixedReviewUi({ document: boundaryDom.document as unknown as Document, root: boundaryDom.root as unknown as HTMLElement, api: boundary.api }).open(candidate.packageId);
      expect(boundaryDom.root.textContent).toContain(visible);
      boundary.dispose();
    }
  });

  it("discards stale generation and detail callbacks across open/leave view epochs", async () => {
    const complete = await generateReviewReport(projectContextGraph(pkg), selection, respondingProvider(draftFor(projectContextGraph(pkg), selection)), "2026-09-22T06:00:00.000Z");
    const snapshotA = presentFixedReviewSnapshot({ analysisPackage: pkg, selection });
    const snapshotB = { ...snapshotA, packageId: "package-b" };
    let releaseGeneration!: (value: { status: "ready"; snapshot: typeof snapshotA }) => void;
    const pendingGeneration = new Promise<{ status: "ready"; snapshot: typeof snapshotA }>((resolve) => { releaseGeneration = resolve; });
    const leaveReview = vi.fn(async () => ({ status: "acknowledged" as const }));
    const cancelGeneration = vi.fn(async () => ({ status: "acknowledged" as const }));
    const dom = fakeDom();
    const ui = createFixedReviewUi({
      document: dom.document as unknown as Document,
      root: dom.root as unknown as HTMLElement,
      api: {
        openReview: async ({ packageId }: { packageId: string }) => packageId === pkg.packageId ? snapshotA : snapshotB,
        generateReview: async () => pendingGeneration,
        cancelGeneration,
        leaveReview,
      } as unknown as CoachDesktopApi,
    });
    await ui.open(pkg.packageId);
    nodes(dom.root).find((node) => node.textContent === "生成教练解说")!.listeners.get("click")!();
    await Promise.resolve();
    await ui.open("package-b");
    expect(cancelGeneration).toHaveBeenCalledTimes(1);
    expect(leaveReview).toHaveBeenCalledWith({ packageId: pkg.packageId });
    releaseGeneration({ status: "ready", snapshot: { ...snapshotA, activeReportStatus: "complete" } });
    await Promise.resolve(); await Promise.resolve();
    expect(dom.root.textContent).toContain("整盘复盘");
    expect(dom.root.textContent).toContain("尚未生成教练解说");
    expect(dom.root.textContent).not.toContain("入选条目的解说齐全");

    const detail = presentFixedReviewDetail({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "detail-ref", decisionId: selection.selected[0]!.decisionId });
    const detailSnapshot = presentFixedReviewSnapshot({ analysisPackage: pkg, selection, activeReport: complete, activeReportRefId: "detail-ref" });
    let releaseDetail!: (value: typeof detail) => void;
    const pendingDetail = new Promise<typeof detail>((resolve) => { releaseDetail = resolve; });
    const detailDom = fakeDom();
    const detailUi = createFixedReviewUi({
      document: detailDom.document as unknown as Document,
      root: detailDom.root as unknown as HTMLElement,
      api: {
        openReview: async () => detailSnapshot,
        getReviewDetail: async () => pendingDetail,
        leaveReview: async () => ({ status: "acknowledged" as const }),
      } as unknown as CoachDesktopApi,
    });
    await detailUi.open(pkg.packageId);
    nodes(detailDom.root).find((node) => node.textContent === "查看复盘条目")!.listeners.get("click")!();
    nodes(detailDom.root).find((node) => node.textContent === "查看详情")!.listeners.get("click")!();
    await detailUi.leave();
    releaseDetail(detail);
    await Promise.resolve(); await Promise.resolve();
    expect(detailDom.root.hidden).toBe(true);
    expect(detailDom.root.textContent).toBe("");
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
    expect((await controller.generateReviewForLifecycle(pkg.packageId, "op-b")).status).toBe("ready");
    const state = controller.inspect(pkg.packageId);
    expect(state.reportRefs.map((ref) => ref.reportId)).toEqual([report.reportId, report.reportId]);
    expect(state.reportRefs.map((ref) => ref.reportRefId)).toEqual(["ref-1", "ref-2"]);
    expect(controller.activateReport(pkg.packageId, "ref-1").activeReportRefId).toBe("ref-1");
    expect(controller.activateReport(pkg.packageId, "ref-2").activeReportRefId).toBe("ref-2");
    expect(controller.activateReport(pkg.packageId, "ref-1").activeReportRefId).toBe("ref-1");
  });

  it("restores distinct judgment, explanation, provenance and refs across A→B→A", async () => {
    const graph = projectContextGraph(pkg);
    const draftA = draftFor(graph, selection);
    const draftB = structuredClone(draftA);
    const candidates = graph.nodes.filter((node) => node.nodeKind === "CandidateAction" && (node.payload as { decisionId?: string }).decisionId === selection.selected[0]!.decisionId);
    draftB.decisions[0]!.judgment.recommendation = (candidates[1]!.payload as { actionRef: string }).actionRef;
    draftB.decisions[0]!.explanations![0]!.text = `另一份解释：${draftA.decisions[0]!.explanations![0]!.text}`;
    const reportA = await generateReviewReport(graph, selection, respondingProvider(draftA), "2026-09-22T04:00:00.000Z");
    const reportB = await generateReviewReport(graph, selection, respondingProvider(draftB), "2026-09-22T05:00:00.000Z");
    expect(reportA.reportId).not.toBe(reportB.reportId);
    const reports = [reportA, reportB];
    const controller = createFixedReviewController({
      readPackage: async () => pkg,
      generateReport: async () => reports.shift()!,
      createReportRefId: (() => { let id = 0; return () => `isolation-${++id}`; })(),
    });
    await controller.openReview(pkg.packageId);
    await controller.generateReview(pkg.packageId, "a");
    const detailA = controller.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, "isolation-1");
    await controller.generateReviewForLifecycle(pkg.packageId, "b");
    const detailB = controller.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, "isolation-2");
    expect(detailB).not.toEqual(detailA);
    expect(detailB.coachJudgments[0]!.recommendation).not.toEqual(detailA.coachJudgments[0]!.recommendation);
    expect(detailB.explanations).not.toEqual(detailA.explanations);
    controller.activateReport(pkg.packageId, "isolation-1");
    expect(controller.getReviewDetail(pkg.packageId, selection.selected[0]!.decisionId, "isolation-1")).toEqual(detailA);
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
    expect(await controller.generateReviewForLifecycle(pkg.packageId, "op-b")).toEqual({ status: "failed", code: "generation_failed" });
    expect(controller.inspect(pkg.packageId)).toMatchObject({ activeReportRefId: "ref-a", reportRefs: [{ reportRefId: "ref-a" }] });
  });

  it("enforces first-generation-only at the renderer-facing controller boundary", async () => {
    const controller = createFixedReviewController({ readPackage: async () => pkg, generateReport: async () => report });
    await controller.openReview(pkg.packageId);
    expect((await controller.generateReview(pkg.packageId, "first")).status).toBe("ready");
    expect(await controller.generateReview(pkg.packageId, "second")).toEqual({ status: "failed", code: "generation_failed" });
    expect(controller.inspect(pkg.packageId).reportRefs).toHaveLength(1);
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
